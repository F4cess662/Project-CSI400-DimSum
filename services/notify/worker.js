/**
 * notify-service worker (คนที่ 2 · เฟส 3) — หยิบงานจากคิว topic "notify" แล้ว "ส่ง" แบบจำลอง
 * ไม่ส่ง SMS/LINE จริง: แค่บันทึกลงตาราง notifications + console.log
 * payload: { channel: 'sms'|'line'|'system', to, title, message }
 * ไม่มี message → throw (คิวลองใหม่ ครบ 5 ครั้งเป็น failed)
 */
const { consume } = require('../../lib/queue');
const { query } = require('../../lib/db');

const CHANNELS = ['sms', 'line', 'system'];
const LABEL = { sms: 'SMS', line: 'LINE', system: 'ระบบ' };

consume('notify', async (p, event) => {
  if (!p || !p.message) throw new Error('payload ไม่มี message');
  const channel = CHANNELS.includes(p.channel) ? p.channel : 'system';
  const to = p.to ? String(p.to).slice(0, 100) : null;
  const title = p.title ? String(p.title).slice(0, 150) : null;
  await query(
    `INSERT INTO notifications (event_id, channel, recipient, title, message, status)
    VALUES (?, ?, ?, ?, ?, 'sent')`, [event.id, channel, to, title, String(p.message)]);
  console.log(`[notify] ส่ง ${LABEL[channel]} จำลอง → ${to || '-'} : ${title || String(p.message).slice(0, 40)}`);
});