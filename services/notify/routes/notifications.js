/**
 * /api/notifications — ประวัติข้อความที่ "ส่ง" (จำลอง) · notify-service (คนที่ 2 · เฟส 3)
 * GET [?channel=sms|line|system] [&from=YYYY-MM-DD] [&to=YYYY-MM-DD]   (manager+) ล่าสุดก่อน สูงสุด 500 รายการ
 */
const router = require('express').Router();
const { query } = require('../../../lib/db');
const { ok, fail, handle } = require('../../../lib/response');
const { requireRole } = require('../../../lib/auth');

const CHANNELS = ['sms', 'line', 'system'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const { channel, from, to } = req.query;
  const where = [];
  const args = [];
  if (channel) {
    if (!CHANNELS.includes(channel)) throw fail('ช่องทางต้องเป็น sms, line หรือ system', 422);
    where.push('channel = ?'); args.push(channel);
  }
  if (from) {
    if (!DATE_RE.test(from)) throw fail('รูปแบบวันที่เริ่มต้นไม่ถูกต้อง (YYYY-MM-DD)', 422);
    where.push('created_at >= ?'); args.push(from + ' 00:00:00');
  }
  if (to) {
    if (!DATE_RE.test(to)) throw fail('รูปแบบวันที่สิ้นสุดไม่ถูกต้อง (YYYY-MM-DD)', 422);
    where.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)'); args.push(to);
  }
  const rows = await query(
    `SELECT id, event_id, channel, recipient, title, message, status, created_at
      FROM notifications ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY id DESC LIMIT 500`, args);
  return ok(res, rows);
}));

module.exports = router;