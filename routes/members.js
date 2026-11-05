const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { loginMember, logoutMember, requireMember } = require('../lib/auth');

function cleanName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw fail('กรุณากรอกชื่อ-นามสกุล', 422);
  if (name.length > 100) throw fail('ชื่อ-นามสกุลต้องไม่เกิน 100 ตัวอักษร', 422);
  return name;
}

function cleanPhone(value) {
  const phone = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^0\d{9}$/.test(phone)) throw fail('กรุณากรอกเบอร์โทรศัพท์ 10 หลักให้ถูกต้อง', 422);
  return phone;
}

function cleanBirthDate(value) {
  if (!value) return null;
  const birthDate = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw fail('รูปแบบวันเกิดไม่ถูกต้อง', 422);
  const date = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate) {
    throw fail('วันเกิดไม่ถูกต้อง', 422);
  }
  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  if (birthDate > todayString) throw fail('วันเกิดต้องไม่เป็นวันที่ในอนาคต', 422);
  return birthDate;
}

router.post('/', handle(async (req, res) => {
  requireFields(req.body, ['name', 'phone']);
  const name = cleanName(req.body.name);
  const phone = cleanPhone(req.body.phone);
  const birthDate = cleanBirthDate(req.body.birth_date);

  if (await queryOne('SELECT id FROM members WHERE phone = ?', [phone])) {
    throw fail('เบอร์โทรศัพท์นี้สมัครสมาชิกแล้ว', 409);
  }

  let result;
  try {
    result = await query(
      'INSERT INTO members (phone, name, birth_date) VALUES (?, ?, ?)',
      [phone, name, birthDate],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail('เบอร์โทรศัพท์นี้สมัครสมาชิกแล้ว', 409);
    throw error;
  }

  return ok(res, { id: result.insertId }, 'สมัครสมาชิกสำเร็จ');
}));

router.get('/me', requireMember, handle(async (req, res) => {
  const memberId = req.member.id;
  const coupons = await query(
    `SELECT mc.id, c.code, c.coupon_type, c.value, c.min_spend,
            mi.name AS free_item_name,
            mc.issued_at, LEAST(COALESCE(mc.expires_at, c.end_date), c.end_date) AS expires_at,
            mc.used_at, c.start_date, c.end_date, c.is_active,
            CASE
              WHEN mc.used_at IS NOT NULL THEN 'used'
              WHEN c.is_active = 0 OR LEAST(COALESCE(mc.expires_at, c.end_date), c.end_date) < CURDATE() THEN 'expired'
              WHEN c.start_date > CURDATE() THEN 'wait'
              ELSE 'available'
            END AS status
       FROM member_coupons mc
       JOIN coupons c ON c.id = mc.coupon_id
       LEFT JOIN menu_items mi ON mi.id = c.free_menu_item_id
      WHERE mc.member_id = ?
      ORDER BY mc.issued_at DESC, mc.id DESC`, [memberId]);
  const points = await query(
    `SELECT pt.id, pt.type, pt.points, pt.created_at, b.bill_no, r.name AS reward_name
       FROM point_transactions pt
       LEFT JOIN bills b ON b.id = pt.bill_id
       LEFT JOIN rewards r ON r.id = pt.reward_id
      WHERE pt.member_id = ?
      ORDER BY pt.created_at DESC, pt.id DESC`, [memberId]);
  const usage = await query(
    `SELECT cu.id, c.code, c.coupon_type, c.value, c.free_menu_item_id,
            mi.name AS free_item_name, cu.used_at, b.bill_no
       FROM coupon_usages cu
       JOIN coupons c ON c.id = cu.coupon_id
       JOIN bills b ON b.id = cu.bill_id
       LEFT JOIN menu_items mi ON mi.id = c.free_menu_item_id
      WHERE cu.member_id = ?
      ORDER BY cu.used_at DESC, cu.id DESC`, [memberId]);

  return ok(res, { member: req.member, coupons, points, usage });
}));

router.get('/session', requireMember, handle(async (req, res) =>
  ok(res, { id: req.member.id, phone: req.member.phone })));

router.post('/session', handle(async (req, res) => {
  const action = req.body.action;
  if (action === 'logout') {
    logoutMember(req);
    return ok(res, null, 'ออกจากระบบแล้ว');
  }
  // เช็กก่อนส่ง OTP ว่าเบอร์นี้สมัครแล้วหรือยัง → { exists: true/false }
  if (action === 'check') {
    requireFields(req.body, ['phone']);
    const phone = cleanPhone(req.body.phone);
    const found = await queryOne('SELECT id FROM members WHERE phone = ?', [phone]);
    return ok(res, { exists: !!found });
  }
  if (action !== 'login') throw fail('ไม่รู้จัก action นี้', 400);

  requireFields(req.body, ['phone']);
  const phone = cleanPhone(req.body.phone);
  const member = await queryOne('SELECT id FROM members WHERE phone = ?', [phone]);
  if (!member) throw fail('ไม่พบเบอร์นี้ในระบบ กรุณาสมัครสมาชิกก่อน', 404);
  await loginMember(req, member.id);
  return ok(res, null, 'เข้าสู่ระบบสมาชิกสำเร็จ');
}));

module.exports = router;
