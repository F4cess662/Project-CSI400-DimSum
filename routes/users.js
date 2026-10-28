/**
 * /api/users — จัดการพนักงาน (คนที่ 2 · เฟส 1 · UC-51) · owner เท่านั้น
 * GET  [?q=&role_id=&is_active=] [?id=]  → รายชื่อ/คนเดียว (ไม่ส่ง password_hash)
 * POST {"action":"create","username","password","full_name","phone","role_id","can_payment","can_vip_booking"}
 * POST {"action":"update","id", ...ฟิลด์ที่แก้}   (ไม่ส่ง password = ไม่เปลี่ยน)
 * POST {"action":"deactivate","id"} / {"action":"activate","id"}   (ปิดบัญชีตัวเองไม่ได้)
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireRole, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const COLS = `u.id, u.username, u.full_name, u.phone, u.role_id, r.role_code, r.role_name,
              u.can_payment, u.can_vip_booking, u.is_active, u.deactivated_at, u.created_at`;
const PHONE_RE = /^0\d{1,2}-?\d{3}-?\d{4}$/;

function cleanText(v, label, max) {
  const s = String(v ?? '').trim();
  if (!s) throw fail('กรุณากรอก' + label, 422);
  if (s.length > max) throw fail(label + 'ยาวไม่เกิน ' + max + ' ตัวอักษร', 422);
  return s;
}
function cleanPhone(v) {
  const s = String(v ?? '').trim();
  if (!PHONE_RE.test(s)) throw fail('รูปแบบเบอร์ไม่ถูกต้อง เช่น 081-234-5678', 422);
  return s;
}
function cleanPassword(v) {
  const s = String(v ?? '');
  if (s.length < 4) throw fail('รหัสผ่านอย่างน้อย 4 ตัวอักษร', 422);
  return s;
}
/** role ต้องมีอยู่จริงและไม่ใช่ customer */
async function getRole(id) {
  const r = await queryOne('SELECT id, role_code FROM roles WHERE id = ?', [id]);
  if (!r || r.role_code === 'customer') throw fail('บทบาทไม่ถูกต้อง', 422);
  return r;
}
/** ค่าเริ่มต้นช่องติ๊ก: staff ตามที่ส่ง (เริ่มต้น 1) · head_chef = 0 · manager/owner = 1 */
function perms(roleCode, b, cur = {}) {
  if (roleCode === 'head_chef') return { pay: 0, vip: 0 };
  if (roleCode !== 'staff') return { pay: 1, vip: 1 };
  const pick = (v, old) => (v === undefined ? (old ?? 1) : (v ? 1 : 0));
  return { pay: pick(b.can_payment, cur.can_payment), vip: pick(b.can_vip_booking, cur.can_vip_booking) };
}
const findUser = async (id) => {
  const u = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw fail('ไม่พบพนักงานนี้', 404);
  return u;
};

/* ---------- GET ---------- */
router.get('/', requireRole(['owner']), handle(async (req, res) => {
  if (req.query.id) {
    const u = await queryOne(`SELECT ${COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [req.query.id]);
    if (!u) throw fail('ไม่พบพนักงานนี้', 404);
    return ok(res, u);
  }
  const where = [];
  const args = [];
  if (req.query.q) {
    where.push('(u.full_name LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)');
    const like = '%' + req.query.q + '%';
    args.push(like, like, like);
  }
  if (req.query.role_id) { where.push('u.role_id = ?'); args.push(Number(req.query.role_id)); }
  if (req.query.is_active === '0' || req.query.is_active === '1') { where.push('u.is_active = ?'); args.push(Number(req.query.is_active)); }
  const rows = await query(
    `SELECT ${COLS} FROM users u JOIN roles r ON r.id = u.role_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY u.is_active DESC, u.role_id DESC, u.full_name`, args);
  return ok(res, rows);
}));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  const me = await mustBe(req, ['owner']);
  switch (b.action) {
    case 'create': {
      requireFields(b, ['username', 'password', 'full_name', 'phone', 'role_id']);
      const username = cleanText(b.username, 'ชื่อผู้ใช้', 50);
      const full_name = cleanText(b.full_name, 'ชื่อ-สกุล', 100);
      const phone = cleanPhone(b.phone);
      const password = cleanPassword(b.password);
      const role = await getRole(b.role_id);
      if (await queryOne('SELECT id FROM users WHERE username = ?', [username])) throw fail('ชื่อผู้ใช้นี้ถูกใช้แล้ว', 409);
      const p = perms(role.role_code, b);
      const hash = await bcrypt.hash(password, 10);
      const r = await query(
        `INSERT INTO users (username, password_hash, full_name, phone, role_id, can_payment, can_vip_booking)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [username, hash, full_name, phone, role.id, p.pay, p.vip]);
      await writeLog(req, 'user.create', 'users', r.insertId,
        { username, role_code: role.role_code, can_payment: p.pay, can_vip_booking: p.vip }, 'system');
      return ok(res, { id: r.insertId }, 'เพิ่มพนักงาน ' + full_name + ' แล้ว');
    }

    case 'update': {
      requireFields(b, ['id']);
      const u = await findUser(b.id);
      const username = b.username !== undefined ? cleanText(b.username, 'ชื่อผู้ใช้', 50) : u.username;
      const full_name = b.full_name !== undefined ? cleanText(b.full_name, 'ชื่อ-สกุล', 100) : u.full_name;
      const phone = b.phone !== undefined ? cleanPhone(b.phone) : u.phone;
      const role = b.role_id !== undefined ? await getRole(b.role_id) : await getRole(u.role_id);
      if (u.id === me.id && role.id !== u.role_id) throw fail('เปลี่ยนบทบาทของตัวเองไม่ได้', 409);
      if (username !== u.username && await queryOne('SELECT id FROM users WHERE username = ? AND id <> ?', [username, u.id])) {
        throw fail('ชื่อผู้ใช้นี้ถูกใช้แล้ว', 409);
      }
      const p = perms(role.role_code, b, u);
      const sets = ['username = ?', 'full_name = ?', 'phone = ?', 'role_id = ?', 'can_payment = ?', 'can_vip_booking = ?'];
      const args = [username, full_name, phone, role.id, p.pay, p.vip];
      const changedPassword = b.password !== undefined && b.password !== '';
      if (changedPassword) { sets.push('password_hash = ?'); args.push(await bcrypt.hash(cleanPassword(b.password), 10)); }
      await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...args, u.id]);
      await writeLog(req, 'user.update', 'users', u.id,
        { username, role_id: role.id, can_payment: p.pay, can_vip_booking: p.vip, password_changed: changedPassword }, 'system');
      return ok(res, { id: u.id }, 'บันทึกข้อมูล ' + full_name + ' แล้ว');
    }

    case 'deactivate': {
      requireFields(b, ['id']);
      const u = await findUser(b.id);
      if (u.id === me.id) throw fail('ปิดบัญชีของตัวเองไม่ได้', 409);
      await query('UPDATE users SET is_active = 0, deactivated_at = NOW() WHERE id = ?', [u.id]);
      await writeLog(req, 'user.deactivate', 'users', u.id, { username: u.username }, 'system');
      return ok(res, { id: u.id }, 'ปิดบัญชี ' + u.full_name + ' แล้ว');
    }

    case 'activate': {
      requireFields(b, ['id']);
      const u = await findUser(b.id);
      await query('UPDATE users SET is_active = 1, deactivated_at = NULL WHERE id = ?', [u.id]);
      await writeLog(req, 'user.activate', 'users', u.id, { username: u.username }, 'system');
      return ok(res, { id: u.id }, 'เปิดบัญชี ' + u.full_name + ' แล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
