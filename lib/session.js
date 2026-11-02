/**
 * session ที่ทุก service ใช้ร่วมกัน (เก็บใน MySQL ตาราง sessions)
 * ล็อกอินที่ server หลักครั้งเดียว service อื่น (ครัว คลังสินค้า แจ้งเตือน) ก็รู้ว่าเป็นใคร
 * ใช้: app.use(sessionMiddleware())   — server.js และ lib/service.js เรียกให้แล้ว ไม่ต้องเรียกเอง
 */
const session = require('express-session');
const config = require('../config');
const { query } = require('./db');

const DAY = 24 * 60 * 60 * 1000;

class MySQLStore extends session.Store {
  constructor() {
    super();
    this.created = null;
  }

  // สร้างตารางให้เองครั้งแรกที่ใช้ (ไม่ต้อง import SQL เพิ่ม · ฐานข้อมูลยังไม่เปิดจะลองใหม่ครั้งถัดไป)
  get ready() {
    if (!this.created) {
      this.created = query(`CREATE TABLE IF NOT EXISTS sessions (
        sid     VARCHAR(128) NOT NULL PRIMARY KEY,
        data    MEDIUMTEXT   NOT NULL,
        expires BIGINT       NOT NULL,
        KEY idx_sessions_expires (expires)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch((err) => { this.created = null; throw err; });
    }
    return this.created;
  }

  get(sid, cb) {
    this.ready
      .then(() => query('SELECT data FROM sessions WHERE sid = ? AND expires > ?', [sid, Date.now()]))
      .then((rows) => cb(null, rows[0] ? JSON.parse(rows[0].data) : null))
      .catch(cb);
  }

  set(sid, sess, cb = () => {}) {
    const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + DAY;
    this.ready
      .then(() => query(
        `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), expires = VALUES(expires)`,
        [sid, JSON.stringify(sess), expires]))
      .then(() => {
        // ล้าง session หมดอายุเป็นครั้งคราว
        if (Math.random() < 0.02) query('DELETE FROM sessions WHERE expires < ?', [Date.now()]).catch(() => {});
        cb(null);
      })
      .catch(cb);
  }

  destroy(sid, cb = () => {}) {
    this.ready.then(() => query('DELETE FROM sessions WHERE sid = ?', [sid])).then(() => cb(null)).catch(cb);
  }

  touch(sid, sess, cb = () => {}) {
    const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + DAY;
    this.ready.then(() => query('UPDATE sessions SET expires = ? WHERE sid = ?', [expires, sid])).then(() => cb(null)).catch(cb);
  }
}

let store = null;

/** middleware session ชุดเดียวกันทุก service (ชื่อ cookie / secret / ที่เก็บ ต้องตรงกัน) */
function sessionMiddleware() {
  if (!store) store = new MySQLStore();
  return session({
    name: 'dimsum.sid',
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  });
}

module.exports = { sessionMiddleware };
