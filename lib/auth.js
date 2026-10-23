const { queryOne } = require('./db');
const { fail } = require('./response');

/* ========== พนักงาน ========== */

/**
 * โหลดผู้ใช้จากฐานข้อมูลทุก request (เก็บไว้ที่ req.user)
 * ถ้า Owner ปิดบัญชีหรือเปลี่ยนสิทธิ์ระหว่างที่ล็อกอินอยู่ จะมีผลทันที
 */
async function loadUser(req) {
  if (req._userLoaded) return req.user;
  req._userLoaded = true;
  req.user = null;
  const id = req.session && req.session.userId;
  if (!id) return null;
  const u = await queryOne(
    `SELECT u.id, u.username, u.full_name, u.phone, u.role_id, r.role_code, r.role_name,
            u.can_payment, u.can_vip_booking, u.is_active
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [id]);
  if (u && u.is_active === 1) req.user = u;
  else delete req.session.userId;
  return req.user;
}

/** ใช้ตอนล็อกอินสำเร็จ */
function loginUser(req, userId) {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req._userLoaded = false;
      resolve();
    }));
}

function logoutUser(req) {
  delete req.session.userId;
  req.user = null;
}

/**
 * ช่องติ๊กรายคน: 'payment' (รับเงิน) หรือ 'vip_booking' (จองห้อง VIP)
 * ผู้จัดการและเจ้าของร้านผ่านเสมอ / พนักงานหน้าร้านดูช่องติ๊ก / หัวหน้าเชฟไม่ได้
 */
function hasPerm(user, perm) {
  if (!user) return false;
  if (['manager', 'owner'].includes(user.role_code)) return true;
  if (user.role_code !== 'staff') return false;
  if (perm === 'payment') return user.can_payment === 1;
  if (perm === 'vip_booking') return user.can_vip_booking === 1;
  return false;
}

/* ----- middleware: ใส่หน้า handler ได้เลย เช่น router.get('/', requireLogin, handle(...)) ----- */

async function requireLogin(req, res, next) {
  try {
    if (!(await loadUser(req))) throw fail('กรุณาล็อกอิน', 401);
    next();
  } catch (e) { next(e); }
}

/** ต้องเป็นบทบาทที่กำหนด: requireRole(['manager','owner']) */
function requireRole(roleCodes) {
  return async (req, res, next) => {
    try {
      const u = await loadUser(req);
      if (!u) throw fail('กรุณาล็อกอิน', 401);
      if (!roleCodes.includes(u.role_code)) throw fail('ไม่มีสิทธิ์ใช้งานส่วนนี้', 403);
      next();
    } catch (e) { next(e); }
  };
}

/** ต้องมีสิทธิ์ช่องติ๊ก: requirePerm('payment') */
function requirePerm(perm) {
  return async (req, res, next) => {
    try {
      const u = await loadUser(req);
      if (!u) throw fail('กรุณาล็อกอิน', 401);
      if (!hasPerm(u, perm)) throw fail('ไม่มีสิทธิ์ทำรายการนี้', 403);
      next();
    } catch (e) { next(e); }
  };
}

/**
 * ใช้ข้างใน handler เมื่อ action ต่างกันต้องการสิทธิ์ต่างกัน (POST แยก action)
 * await mustBe(req, ['owner'])   /   await mustHavePerm(req, 'payment')
 */
async function mustBe(req, roleCodes) {
  const u = await loadUser(req);
  if (!u) throw fail('กรุณาล็อกอิน', 401);
  if (!roleCodes.includes(u.role_code)) throw fail('ไม่มีสิทธิ์ใช้งานส่วนนี้', 403);
  return u;
}

async function mustHavePerm(req, perm) {
  const u = await loadUser(req);
  if (!u) throw fail('กรุณาล็อกอิน', 401);
  if (!hasPerm(u, perm)) throw fail('ไม่มีสิทธิ์ทำรายการนี้', 403);
  return u;
}

/* ========== สมาชิก (session แยกจากพนักงาน) ========== */

function loginMember(req, memberId) { req.session.memberId = memberId; }
function logoutMember(req) { delete req.session.memberId; }

async function requireMember(req, res, next) {
  try {
    const id = req.session && req.session.memberId;
    const m = id ? await queryOne('SELECT * FROM members WHERE id = ?', [id]) : null;
    if (!m) throw fail('กรุณาล็อกอินสมาชิก', 401);
    req.member = m;
    next();
  } catch (e) { next(e); }
}

module.exports = {
  loadUser, loginUser, logoutUser, hasPerm,
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm,
  loginMember, logoutMember, requireMember,
};
