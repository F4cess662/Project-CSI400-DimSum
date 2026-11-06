const router = require('express').Router();
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireMember, mustBe, mustHavePerm } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { nowTime } = require('../lib/shop');
const config = require('../config');

// =====================================================================
// ส่วนหลังบ้าน (คนที่ 2) — FR-42
//   GET ?all=1  → รายการคูปองทั้งหมด (manager+)
//   GET ?code=  → เช็กคูปองใบเดียวว่าใช้ได้ไหม + เหตุผล (staff+ ที่ติ๊ก [รับเงิน])
//   POST action create / update / deactivate (manager+)
// GET ที่ไม่มี all/code ยังเป็นของฝั่งลูกค้าตามเดิม (ด้านล่าง)
// =====================================================================
const WEEKDAY_TH = { 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัส', 5: 'ศุกร์', 6: 'เสาร์', 7: 'อาทิตย์' };

/** เช็กคูปองตามกติกา BR-23 / BR-27 (ลำดับและข้อความเดียวกับ checkCoupon ใน checkout.js)
 *  ?spend= และ ?member_id= ส่งหรือไม่ส่งก็ได้ ไม่ส่ง = ข้ามการเช็กข้อนั้น */
async function checkCode(req) {
  await mustHavePerm(req, 'payment');
  const code = String(req.query.code).trim().toUpperCase();
  const c = await queryOne('SELECT * FROM coupons WHERE code = ?', [code]);
  const no = (reason) => ({ valid: false, reason, coupon: c || null });
  if (!c || c.is_active !== 1) return no(`ไม่พบคูปอง ${code} หรือปิดใช้งานแล้ว`);

  // วันที่/เวลาปัจจุบันตามเวลาไทย · วันในสัปดาห์ 1=จันทร์ … 7=อาทิตย์
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
  const weekday = ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  const time = nowTime();

  if (today < c.start_date) return no(`คูปอง ${c.code} เริ่มใช้ได้ ${c.start_date}`);
  if (today > c.end_date) return no(`คูปอง ${c.code} หมดอายุแล้ว`);
  if (c.valid_weekdays) {
    const days = String(c.valid_weekdays).split(',').map(Number);
    if (!days.includes(weekday)) return no(`คูปอง ${c.code} ใช้ได้เฉพาะวัน${days.map((d) => WEEKDAY_TH[d]).join(' ')}`);
  }
  if (c.exclude_holidays === 1) {
    const hol = await queryOne('SELECT name FROM public_holidays WHERE holiday_date = ?', [today]);
    if (hol) return no(`คูปอง ${c.code} ใช้ไม่ได้ในวันหยุดราชการ (${hol.name})`);
  }
  if (c.valid_time_start && c.valid_time_end && (time < c.valid_time_start || time > c.valid_time_end)) {
    return no(`คูปอง ${c.code} ใช้ได้เวลา ${c.valid_time_start.slice(0, 5)}–${c.valid_time_end.slice(0, 5)} น.`);
  }
  const spend = req.query.spend;
  if (spend !== undefined && spend !== '' && Number(spend) < Number(c.min_spend)) {
    return no(`คูปอง ${c.code} ต้องมียอดขั้นต่ำ ${Number(c.min_spend)} บาท`);
  }
  const memberId = Number(req.query.member_id) || null;
  if (c.member_only === 1 && !memberId) return no(`คูปอง ${c.code} ใช้ได้เฉพาะสมาชิก`);
  if (c.usage_limit !== null) {
    const u = await queryOne('SELECT COUNT(*) AS n FROM coupon_usages WHERE coupon_id = ?', [c.id]);
    if (u.n >= c.usage_limit) return no(`คูปอง ${c.code} ถูกใช้ครบจำนวนแล้ว`);
  }
  if (c.per_member_limit !== null && memberId) {
    const u = await queryOne('SELECT COUNT(*) AS n FROM coupon_usages WHERE coupon_id = ? AND member_id = ?', [c.id, memberId]);
    if (u.n >= c.per_member_limit) return no(`สมาชิกใช้คูปอง ${c.code} ครบสิทธิ์แล้ว`);
  }
  return { valid: true, reason: '', coupon: c };
}

router.get('/',
  // ไม่มี all/code → ข้ามไปใช้ GET ของลูกค้าด้านล่าง
  (req, res, next) => (req.query.code || req.query.all ? next() : next('route')),
  handle(async (req, res) => {
    if (req.query.code) return ok(res, await checkCode(req));
    await mustBe(req, ['manager', 'owner']);
    const rows = await query(
      `SELECT c.*, mi.name AS free_item_name,
              (SELECT COUNT(*) FROM member_coupons mc WHERE mc.coupon_id = c.id) AS collected_count,
              (SELECT COUNT(*) FROM coupon_usages cu WHERE cu.coupon_id = c.id) AS used_count
         FROM coupons c LEFT JOIN menu_items mi ON mi.id = c.free_menu_item_id
        ORDER BY c.is_active DESC, c.end_date DESC, c.id DESC`);
    return ok(res, rows);
  }));

router.get('/', handle(async (req, res) => {
  const sessionMemberId = req.session && req.session.memberId;
  const member = sessionMemberId
    ? await queryOne('SELECT id FROM members WHERE id = ?', [sessionMemberId])
    : null;
  const memberId = member ? member.id : null;
  const coupons = await query(
    `SELECT c.*,
            mi.name AS free_item_name,
            (SELECT COUNT(*) FROM member_coupons mc
              WHERE mc.coupon_id = c.id AND mc.member_id = ?) AS my_count,
            (SELECT COUNT(*) FROM member_coupons mc
              WHERE mc.coupon_id = c.id) AS total_collected
       FROM coupons c
       LEFT JOIN menu_items mi ON mi.id = c.free_menu_item_id
      WHERE c.is_active = 1
        AND c.start_date <= CURDATE()
        AND c.end_date >= CURDATE()
      ORDER BY c.end_date, c.id`,
    [memberId],
  );

  return ok(res, {
    isLoggedIn: Boolean(memberId),
    coupons: coupons.map((coupon) => {
      const limit = coupon.per_member_limit == null ? 1 : Number(coupon.per_member_limit);
      return {
       ...coupon,
       collected: Number(coupon.my_count) >= limit,
       sold_out: coupon.usage_limit != null
         && Number(coupon.total_collected) >= Number(coupon.usage_limit),
      };
    }),
  });
}));

router.post('/:id/collect', requireMember, handle(async (req, res) => {
  const couponId = Number(req.params.id);
  if (!Number.isInteger(couponId) || couponId <= 0) throw fail('รหัสคูปองไม่ถูกต้อง', 422);

  await transaction(async (conn) => {
    const [coupons] = await conn.execute(
      `SELECT id, end_date, usage_limit, per_member_limit
         FROM coupons
        WHERE id = ? AND is_active = 1
          AND start_date <= CURDATE()
          AND end_date >= CURDATE()
        FOR UPDATE`,
      [couponId],
    );
    const coupon = coupons[0];
    if (!coupon) throw fail('ไม่พบคูปอง หรือคูปองหมดอายุแล้ว', 404);

    const [[mine]] = await conn.execute(
      'SELECT COUNT(*) AS n FROM member_coupons WHERE member_id = ? AND coupon_id = ?',
      [req.member.id, couponId],
    );
    const perMemberLimit = coupon.per_member_limit == null ? 1 : Number(coupon.per_member_limit);
    if (Number(mine.n) >= perMemberLimit) throw fail('คุณเก็บคูปองนี้ครบสิทธิ์แล้ว', 400);

    if (coupon.usage_limit != null) {
      const [[total]] = await conn.execute(
        'SELECT COUNT(*) AS n FROM member_coupons WHERE coupon_id = ?',
        [couponId],
      );
      if (Number(total.n) >= Number(coupon.usage_limit)) {
        throw fail('คูปองถูกเก็บครบแล้ว', 400);
      }
    }

    await conn.execute(
      `INSERT INTO member_coupons (member_id, coupon_id, issued_at, expires_at)
       VALUES (?, ?, NOW(), ?)`,
      [req.member.id, couponId, coupon.end_date],
    );
  });

  return ok(res, null, 'เก็บคูปองสำเร็จ');
}));

// ---------- POST create / update / deactivate (manager+) ----------
const flag = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);
const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/** ตรวจ + จัดรูปข้อมูลคูปองที่ส่งมา (ใช้ทั้ง create และ update) */
async function cleanCoupon(b) {
  requireFields(b, ['code', 'coupon_type', 'start_date', 'end_date']);
  const code = String(b.code).trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw fail('โค้ดใช้ได้เฉพาะ A-Z 0-9 _ - ยาว 3-30 ตัว', 422);
  if (!['amount', 'percent', 'free_item'].includes(b.coupon_type)) throw fail('ประเภทคูปองไม่ถูกต้อง', 422);

  let value = numOrNull(b.value);
  let freeItem = null;
  if (b.coupon_type === 'free_item') {
    value = null;
    freeItem = numOrNull(b.free_menu_item_id);
    if (!freeItem) throw fail('เลือกเมนูที่แถม', 422);
    if (!(await queryOne('SELECT id FROM menu_items WHERE id = ? AND is_deleted = 0', [freeItem]))) {
      throw fail('ไม่พบเมนูที่เลือก', 422);
    }
  } else {
    if (!(value > 0)) throw fail('มูลค่าส่วนลดต้องมากกว่า 0', 422);
    if (b.coupon_type === 'percent' && value > 100) throw fail('ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100', 422);
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(b.start_date) || !dateRe.test(b.end_date)) throw fail('รูปแบบวันที่ไม่ถูกต้อง', 422);
  if (b.end_date < b.start_date) throw fail('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 422);

  // ช่วงเวลา: ต้องกรอกทั้งคู่หรือไม่กรอกเลย
  const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
  const fixT = (t) => (t ? (t.length === 5 ? t + ':00' : t) : null);
  const ts = fixT(b.valid_time_start), te = fixT(b.valid_time_end);
  if (Boolean(ts) !== Boolean(te)) throw fail('ช่วงเวลาต้องกรอกทั้งเวลาเริ่มและเวลาสิ้นสุด', 422);
  if (ts && (!timeRe.test(ts) || !timeRe.test(te) || ts >= te)) throw fail('ช่วงเวลาไม่ถูกต้อง (เวลาเริ่มต้องก่อนเวลาสิ้นสุด)', 422);

  // วันในสัปดาห์: เก็บ "1,2,3" (1=จันทร์) · ไม่เลือกเลยหรือเลือกครบ 7 วัน = ใช้ได้ทุกวัน (null)
  const raw = Array.isArray(b.valid_weekdays) ? b.valid_weekdays : String(b.valid_weekdays || '').split(',');
  const days = [...new Set(raw.filter((x) => x !== '' && x !== null).map(Number))].sort((x, y) => x - y);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw fail('วันในสัปดาห์ต้องเป็น 1-7', 422);

  const minSpend = numOrNull(b.min_spend) ?? 0;
  if (!(minSpend >= 0)) throw fail('ยอดขั้นต่ำต้องไม่ติดลบ', 422);
  const usage = numOrNull(b.usage_limit), perMember = numOrNull(b.per_member_limit);
  for (const n of [usage, perMember]) {
    if (n !== null && !(Number.isInteger(n) && n >= 1)) throw fail('จำนวนครั้งที่ใช้ได้ต้องเป็นจำนวนเต็ม 1 ขึ้นไป', 422);
  }

  return {
    code, coupon_type: b.coupon_type, value, free_menu_item_id: freeItem, min_spend: minSpend,
    start_date: b.start_date, end_date: b.end_date, valid_time_start: ts, valid_time_end: te,
    valid_weekdays: days.length === 0 || days.length === 7 ? null : days.join(','),
    exclude_holidays: flag(b.exclude_holidays), member_only: flag(b.member_only),
    usage_limit: usage, per_member_limit: perMember,
  };
}

const COLS = ['code', 'coupon_type', 'value', 'free_menu_item_id', 'min_spend', 'start_date', 'end_date',
  'valid_time_start', 'valid_time_end', 'valid_weekdays', 'exclude_holidays', 'member_only', 'usage_limit', 'per_member_limit'];

router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['manager', 'owner']);
      const d = await cleanCoupon(b);
      if (await queryOne('SELECT id FROM coupons WHERE code = ?', [d.code])) throw fail('โค้ดนี้มีอยู่แล้ว', 409);
      const r = await query(
        `INSERT INTO coupons (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`, COLS.map((k) => d[k]));
      await writeLog(req, 'coupon.create', 'coupons', r.insertId, { code: d.code, type: d.coupon_type });
      return ok(res, { id: r.insertId }, 'สร้างคูปองแล้ว');
    }
    case 'update': {
      await mustBe(req, ['manager', 'owner']);
      requireFields(b, ['id']);
      if (!(await queryOne('SELECT id FROM coupons WHERE id = ?', [b.id]))) throw fail('ไม่พบคูปอง', 404);
      const d = await cleanCoupon(b);
      if (await queryOne('SELECT id FROM coupons WHERE code = ? AND id <> ?', [d.code, b.id])) throw fail('โค้ดนี้มีอยู่แล้ว', 409);
      await query(`UPDATE coupons SET ${COLS.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, [...COLS.map((k) => d[k]), b.id]);
      await writeLog(req, 'coupon.update', 'coupons', b.id, { code: d.code });
      return ok(res, { id: Number(b.id) }, 'บันทึกคูปองแล้ว');
    }
    case 'deactivate': {
      await mustBe(req, ['manager', 'owner']);
      requireFields(b, ['id']);
      const r = await query('UPDATE coupons SET is_active = 0 WHERE id = ?', [b.id]);
      if (!r.affectedRows) throw fail('ไม่พบคูปอง', 404);
      await writeLog(req, 'coupon.deactivate', 'coupons', b.id);
      return ok(res, null, 'ปิดใช้งานคูปองแล้ว');
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;