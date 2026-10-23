/**
 * /api/auth — ล็อกอิน / ออกจากระบบ / ผู้ใช้ปัจจุบัน (UC-00)
 * POST {"action":"login","username":"...","password":"..."}
 * POST {"action":"logout"}
 * GET  → ข้อมูลผู้ใช้ที่ล็อกอินอยู่ (ใช้สร้าง sidebar ตามบทบาท)
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, loginUser, logoutUser, loadUser } = require('../lib/auth');
const { writeLog } = require('../lib/log');

router.get('/', requireLogin, handle(async (req, res) => ok(res, req.user)));

router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'login': {
      requireFields(b, ['username', 'password']);
      const u = await queryOne('SELECT id, password_hash, is_active FROM users WHERE username = ?',
        [String(b.username).trim()]);
      if (!u || !(await bcrypt.compare(String(b.password), u.password_hash))) {
        throw fail('ชื่อล็อกอินหรือรหัสผ่านไม่ถูกต้อง', 401);
      }
      if (u.is_active !== 1) throw fail('บัญชีนี้ถูกปิดการใช้งาน', 403);
      await loginUser(req, u.id);
      await writeLog(req, 'user.login', 'users', u.id);
      return ok(res, await loadUser(req), 'ล็อกอินสำเร็จ');
    }
    case 'logout': {
      if (await loadUser(req)) await writeLog(req, 'user.logout', 'users', req.user.id);
      logoutUser(req);
      return ok(res, null, 'ออกจากระบบแล้ว');
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
