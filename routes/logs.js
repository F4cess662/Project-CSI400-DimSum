/**
 * /api/logs — ประวัติการทำงาน (FR-51)
 * GET /api/logs?action=CREATE_ORDER&user_id=1&from=2026-10-01&to=2026-10-31&page=1
 * ผู้จัดการเห็นเฉพาะ operation ส่วนเจ้าของร้านเห็นทั้ง operation และ system
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, handle } = require('../lib/response');
const { requireRole } = require('../lib/auth');

const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveInt(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw fail(`ค่า ${fieldName} ไม่ถูกต้อง`, 400);
  return n;
}

function validateDate(value, fieldName) {
  if (value && !DATE_RE.test(value)) throw fail(`รูปแบบ ${fieldName} ต้องเป็น YYYY-MM-DD`, 400);
  if (value) {
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
      throw fail(`วันที่ ${fieldName} ไม่ถูกต้อง`, 400);
    }
  }
}

router.get('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const me = req.user;
  const action = String(req.query.action || '').trim();
  const userId = req.query.user_id;
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const page = parsePositiveInt(req.query.page, 1, 'page');

  if (action.length > 50) throw fail('การกระทำต้องมีความยาวไม่เกิน 50 ตัวอักษร', 400);
  if (userId !== undefined && userId !== '') {
    if (!/^\d+$/.test(String(userId)) || Number(userId) < 1) throw fail('รหัสพนักงานไม่ถูกต้อง', 400);
  }
  validateDate(from, 'from');
  validateDate(to, 'to');
  if (from && to && from > to) throw fail('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด', 400);

  const conditions = [];
  const params = [];

  // บังคับสิทธิ์ฝั่ง server: ผู้จัดการเห็นเฉพาะ operation ส่วน owner เห็นทุกระดับ
  if (me.role_code === 'manager') {
    conditions.push("l.log_level = 'operation'");
  }
  if (action) {
    conditions.push('l.action = ?');
    params.push(action);
  }
  if (userId !== undefined && userId !== '') {
    conditions.push('l.user_id = ?');
    params.push(Number(userId));
  }
  if (from) {
    conditions.push('l.created_at >= ?');
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    conditions.push('l.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(to);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = await queryOne(
    `SELECT COUNT(*) AS total
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${whereSql}`,
    params
  );
  const total = Number(countRow?.total || 0);
  const offset = (page - 1) * PAGE_SIZE;
  const items = await query(
    `SELECT l.id, l.user_id, u.full_name AS user_name, u.username,
            l.log_level, l.action, l.target_type, l.target_id,
            l.detail, l.created_at
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${whereSql}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, offset]
  );

  // ส่งรายชื่อพนักงานที่ใช้กับตัวกรอง dropdown โดยไม่รวมบัญชีลูกค้า
  const users = await query(
    `SELECT u.id, u.full_name, u.username
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE r.role_code <> 'customer'
      ORDER BY u.full_name, u.username`
  );

  // ส่งเฉพาะชื่อ action ที่บัญชีนี้มีสิทธิ์เห็น เพื่อใช้สร้างตัวกรองจากข้อมูลจริง
  const actionConditions = me.role_code === 'manager' ? "WHERE log_level = 'operation'" : '';
  const actions = await query(
    `SELECT DISTINCT action FROM activity_logs ${actionConditions} ORDER BY action`
  );

  return ok(res, {
    items,
    users,
    actions: actions.map((row) => row.action),
    total,
    page,
    page_size: PAGE_SIZE,
    total_pages: Math.ceil(total / PAGE_SIZE),
  });
}));

module.exports = router;
