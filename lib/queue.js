/**
 * Message Queue อย่างง่าย (เก็บในตาราง event_queue ของ MySQL ไม่ต้องลง Redis/Kafka)
 * เปรียบเหมือน "แท่นเสียบบิล": คนส่งเสียบงานไว้แล้วไปทำอย่างอื่นต่อ service ปลายทางค่อยมาหยิบไปทำ
 * ถ้า service ปลายทางดับอยู่ งานยังรออยู่ในคิว พอเปิดกลับมาก็ทำต่อจนครบ ไม่หาย
 *
 *   const { publish, consume } = require('../lib/queue');
 *   await publish('notify', { channel: 'sms', to: '0812345678', message: 'รหัส OTP 123456' });
 *   await publish('notify', {...}, conn);           // ใส่ conn เมื่ออยู่ใน transaction() → งานเข้าคิวพร้อมกับข้อมูลหลัก
 *   consume('notify', async (payload, event) => { ... });   // ใช้ใน service ปลายทาง (throw = ลองใหม่ภายหลัง)
 *
 * หัวข้อ (topic) ที่ตกลงกันไว้ดูใน docs/API_ร้านติ่มซำ_v5.md ส่วน Microservices
 */
const crypto = require('crypto');
const { query } = require('./db');

const MAX_ATTEMPTS = 5;
const STUCK_SECONDS = 60; // งานที่ค้าง processing นานเกินนี้ (service ดับกลางคัน) จะถูกหยิบใหม่

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS event_queue (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    topic      VARCHAR(50)  NOT NULL,
    payload    LONGTEXT     NOT NULL,
    status     ENUM('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
    attempts   INT          NOT NULL DEFAULT 0,
    last_error VARCHAR(255) NULL,
    locked_by  VARCHAR(64)  NULL,
    locked_at  DATETIME     NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_at    DATETIME     NULL,
    KEY idx_queue_pick (topic, status, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// สร้างตารางให้เองครั้งแรกที่ใช้ (ถ้าฐานข้อมูลยังไม่เปิด จะลองใหม่ครั้งถัดไป)
let created = null;
function ready() {
  if (!created) created = query(CREATE_SQL).catch((err) => { created = null; throw err; });
  return created;
}

/** เสียบงานเข้าคิว คืน id ของงาน · conn = connection จาก transaction() (ไม่ใส่ก็ได้) */
async function publish(topic, payload, conn = null) {
  await ready();
  const sql = 'INSERT INTO event_queue (topic, payload) VALUES (?, ?)';
  const params = [topic, JSON.stringify(payload ?? {})];
  if (conn) {
    const [res] = await conn.execute(sql, params);
    return res.insertId;
  }
  const res = await query(sql, params);
  return res.insertId;
}

/** หยิบงาน 1 ชิ้นของ topic นี้มาจองไว้ (ไม่ซ้ำกันแม้มีหลายตัวหยิบพร้อมกัน) */
async function claim(topic) {
  const token = crypto.randomBytes(12).toString('hex');
  const res = await query(
    `UPDATE event_queue
        SET status = 'processing', locked_by = ?, locked_at = NOW(), attempts = attempts + 1
      WHERE topic = ?
        AND (status = 'pending' OR (status = 'processing' AND locked_at < NOW() - INTERVAL ${STUCK_SECONDS} SECOND))
      ORDER BY id
      LIMIT 1`, [token, topic]);
  if (!res.affectedRows) return null;
  const rows = await query("SELECT * FROM event_queue WHERE locked_by = ? AND status = 'processing'", [token]);
  return rows[0] || null;
}

/**
 * ให้ service ปลายทางหยิบงานไปทำเรื่อยๆ
 * handler(payload, event) ทำสำเร็จ = done · throw = ลองใหม่ (ครบ 5 ครั้ง = failed ให้เจ้าของร้านกดลองใหม่ที่หน้าสถานะระบบ)
 */
function consume(topic, handler, { everyMs = 1000 } = {}) {
  let stopped = false;
  (async function loop() {
    await ready();
    while (!stopped) {
      let event = null;
      try {
        event = await claim(topic);
        if (!event) { await sleep(everyMs); continue; }
        await handler(JSON.parse(event.payload), event);
        await query("UPDATE event_queue SET status = 'done', done_at = NOW(), last_error = NULL WHERE id = ?", [event.id]);
      } catch (err) {
        if (event) {
          const status = event.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
          await query('UPDATE event_queue SET status = ?, last_error = ?, locked_by = NULL WHERE id = ?',
            [status, String(err.message || err).slice(0, 255), event.id]).catch(() => {});
        } else {
          console.error(`คิว ${topic}:`, err.message);
        }
        await sleep(everyMs);
      }
    }
  })();
  return () => { stopped = true; };
}

/** สรุปจำนวนงานในคิว แยกตาม topic และสถานะ (ใช้ในหน้าสถานะระบบ) */
async function queueStats() {
  await ready();
  const rows = await query('SELECT topic, status, COUNT(*) AS n FROM event_queue GROUP BY topic, status ORDER BY topic');
  const byTopic = {};
  for (const r of rows) {
    byTopic[r.topic] = byTopic[r.topic] || { topic: r.topic, pending: 0, processing: 0, done: 0, failed: 0 };
    byTopic[r.topic][r.status] = r.n;
  }
  return Object.values(byTopic);
}

/** ส่งงานที่ failed กลับเข้าคิวใหม่ */
async function retryFailed(topic = null) {
  await ready();
  const res = await query(
    `UPDATE event_queue SET status = 'pending', attempts = 0, locked_by = NULL
      WHERE status = 'failed' ${topic ? 'AND topic = ?' : ''}`, topic ? [topic] : []);
  return res.affectedRows;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { publish, consume, queueStats, retryFailed };
