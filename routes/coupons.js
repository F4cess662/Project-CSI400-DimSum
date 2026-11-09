
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireMember, requireLogin, requireRole, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const COUPON_TYPES = ['amount', 'percent', 'free_item'];

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nullableLimit(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw fail(`${label}ต้องเป็นจำนวนเต็มมากกว่า 0 หรือเว้นว่าง`, 400);
  }
  return number;
}

// GET /api/coupons
// สมาชิก: ดูคูปองที่เปิดใช้งานและอยู่ในช่วงเวลา
// แอดมิน: GET /api/coupons?all=1 ดูคูปองทั้งหมด
router.get('/', handle(async (req, res) => {
  const includeAll = req.query.all === '1';

  if (includeAll) {
    await mustBe(req, ['manager', 'owner']);

    const rows = await query(
      `SELECT c.*,
              mi.name AS free_item_name,
              (SELECT COUNT(*) FROM member_coupons mc
                WHERE mc.coupon_id = c.id) AS total_collected,
              (SELECT COUNT(*) FROM coupon_usages cu
                WHERE cu.coupon_id = c.id) AS total_used
         FROM coupons c
         LEFT JOIN menu_items mi ON mi.id = c.free_menu_item_id
        ORDER BY c.is_active DESC, c.id DESC`
    );

    return ok(res, rows);
  }

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
    [memberId]
  );

  return ok(res, {
    isLoggedIn: Boolean(memberId),
    coupons: coupons.map((coupon) => {
      const limit = coupon.per_member_limit == null
        ? 1 : Number(coupon.per_member_limit);

      return {
        ...coupon,
        collected: Number(coupon.my_count) >= limit,
        sold_out: coupon.usage_limit != null
          && Number(coupon.total_collected) >= Number(coupon.usage_limit),
      };
    }),
  });
}));

// POST /api/coupons
// manager/owner: เพิ่ม แก้ไข เปิด/ปิด และลบคูปอง
router.post('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const body = req.body || {};
  const action = body.action;

  if (action === 'delete') {
    requireFields(body, ['id']);
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw fail('รหัสคูปองไม่ถูกต้อง', 400);
    }

    const existing = await queryOne(
      'SELECT id, code FROM coupons WHERE id = ?',
      [id]
    );

    if (!existing) throw fail('ไม่พบคูปองที่ต้องการลบ', 404);

    const references = await queryOne(
      `SELECT
        (SELECT COUNT(*) FROM member_coupons WHERE coupon_id = ?) AS collected,
        (SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = ?) AS used`,
      [id, id]
    );

    if (Number(references.collected) > 0 || Number(references.used) > 0) {
      throw fail('คูปองนี้มีประวัติการเก็บหรือใช้งานแล้ว กรุณาปิดใช้งานแทนการลบ', 409);
    }

    await writeLog(req, 'coupon.delete', 'coupons', id, {
      code: existing.code,
    });

    await query('DELETE FROM coupons WHERE id = ?', [id]);
    return ok(res, { id }, 'ลบคูปองแล้ว');
  }

  if (action === 'activate' || action === 'deactivate') {
    requireFields(body, ['id']);
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw fail('รหัสคูปองไม่ถูกต้อง', 400);
    }

    const existing = await queryOne(
      'SELECT id, is_active FROM coupons WHERE id = ?',
      [id]
    );

    if (!existing) throw fail('ไม่พบคูปอง', 404);

    const active = action === 'activate' ? 1 : 0;

    await query('UPDATE coupons SET is_active = ? WHERE id = ?', [active, id]);

    await writeLog(
      req,
      active ? 'coupon.activate' : 'coupon.deactivate',
      'coupons',
      id,
      { is_active: active }
    );

    return ok(
      res,
      { id, is_active: active },
      active ? 'เปิดใช้งานคูปองแล้ว' : 'ปิดใช้งานคูปองแล้ว'
    );
  }

  if (action !== 'create' && action !== 'update') {
    throw fail('ไม่รู้จัก action นี้', 400);
  }

  const isUpdate = action === 'update';

  requireFields(body, isUpdate
    ? ['id', 'code', 'coupon_type', 'start_date', 'end_date']
    : ['code', 'coupon_type', 'start_date', 'end_date']
  );

  const id = isUpdate ? Number(body.id) : null;
  if (isUpdate && (!Number.isInteger(id) || id <= 0)) {
    throw fail('รหัสคูปองไม่ถูกต้อง', 400);
  }

  const code = String(body.code).trim().toUpperCase();
  const couponType = String(body.coupon_type);
  const startDate = String(body.start_date);
  const endDate = String(body.end_date);

  if (!code || code.length > 30) {
    throw fail('รหัสคูปองต้องมีความยาว 1–30 ตัวอักษร', 400);
  }

  if (!COUPON_TYPES.includes(couponType)) {
    throw fail('ประเภทคูปองไม่ถูกต้อง', 400);
  }

  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw fail('กรุณาตรวจสอบวันเริ่มต้นและวันสิ้นสุด', 400);
  }

  const minSpend = body.min_spend === '' || body.min_spend == null
    ? 0 : Number(body.min_spend);

  if (!Number.isFinite(minSpend) || minSpend < 0) {
    throw fail('ยอดซื้อขั้นต่ำไม่ถูกต้อง', 400);
  }

  let value = null;
  let freeMenuItemId = null;

  if (couponType === 'free_item') {
    requireFields(body, ['free_menu_item_id']);
    freeMenuItemId = Number(body.free_menu_item_id);

    if (!Number.isInteger(freeMenuItemId) || freeMenuItemId <= 0) {
      throw fail('กรุณาเลือกเมนูฟรี', 400);
    }

    const menu = await queryOne(
      'SELECT id FROM menu_items WHERE id = ? AND is_deleted = 0',
      [freeMenuItemId]
    );

    if (!menu) throw fail('ไม่พบเมนูที่เลือกหรือเมนูถูกลบแล้ว', 404);
  } else {
    value = Number(body.value);

    if (!Number.isFinite(value) || value <= 0) {
      throw fail('กรุณาระบุมูลค่าส่วนลดมากกว่า 0', 400);
    }

    if (couponType === 'percent' && value > 100) {
      throw fail('ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%', 400);
    }
  }

  const validTimeStart = body.valid_time_start || null;
  const validTimeEnd = body.valid_time_end || null;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  if (Boolean(validTimeStart) !== Boolean(validTimeEnd)) {
    throw fail('กรุณาระบุเวลาเริ่มต้นและสิ้นสุดให้ครบ', 400);
  }

  if (validTimeStart && (
    !timePattern.test(validTimeStart) ||
    !timePattern.test(validTimeEnd) ||
    validTimeStart >= validTimeEnd
  )) {
    throw fail('ช่วงเวลาใช้งานไม่ถูกต้อง', 400);
  }

  const validWeekdays = body.valid_weekdays
    ? String(body.valid_weekdays).trim() : null;

  if (validWeekdays && validWeekdays.length > 20) {
    throw fail('ข้อมูลวันที่ใช้งานยาวเกินไป', 400);
  }

  const usageLimit = nullableLimit(body.usage_limit, 'จำนวนสิทธิ์รวม');
  const perMemberLimit = nullableLimit(body.per_member_limit, 'จำนวนสิทธิ์ต่อสมาชิก');

  const excludeHolidays = body.exclude_holidays ? 1 : 0;
  const memberOnly = body.member_only ? 1 : 0;

  const active = body.is_active === undefined
    ? 1
    : (body.is_active === true || body.is_active === 1 || body.is_active === '1' ? 1 : 0);

  const values = [
    code, couponType, value, freeMenuItemId, minSpend,
    startDate, endDate, validTimeStart, validTimeEnd,
    validWeekdays, excludeHolidays, memberOnly,
    usageLimit, perMemberLimit
  ];

  if (!isUpdate) {
    const duplicate = await queryOne(
      'SELECT id FROM coupons WHERE code = ?',
      [code]
    );

    if (duplicate) throw fail('รหัสคูปองนี้มีอยู่แล้ว', 409);

    const inserted = await query(
      `INSERT INTO coupons
        (code, coupon_type, value, free_menu_item_id, min_spend,
         start_date, end_date, valid_time_start, valid_time_end,
         valid_weekdays, exclude_holidays, member_only,
         usage_limit, per_member_limit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      values
    );

    await writeLog(req, 'coupon.create', 'coupons', inserted.insertId, {
      code, coupon_type: couponType, value,
    });

    return ok(res, { id: inserted.insertId, is_active: 1 }, 'เพิ่มคูปองแล้ว');
  }

  const existing = await queryOne(
    'SELECT id, is_active FROM coupons WHERE id = ?',
    [id]
  );

  if (!existing) throw fail('ไม่พบคูปองที่ต้องการแก้ไข', 404);

  const duplicate = await queryOne(
    'SELECT id FROM coupons WHERE code = ? AND id <> ?',
    [code, id]
  );

  if (duplicate) throw fail('รหัสคูปองนี้ถูกใช้แล้ว', 409);

  const finalActive = body.is_active === undefined
    ? Number(existing.is_active) : active;

  await query(
    `UPDATE coupons
        SET code = ?, coupon_type = ?, value = ?, free_menu_item_id = ?,
            min_spend = ?, start_date = ?, end_date = ?,
            valid_time_start = ?, valid_time_end = ?,
            valid_weekdays = ?, exclude_holidays = ?, member_only = ?,
            usage_limit = ?, per_member_limit = ?, is_active = ?
      WHERE id = ?`,
    [...values, finalActive, id]
  );

  await writeLog(req, 'coupon.update', 'coupons', id, {
    code, coupon_type: couponType, value, is_active: finalActive,
  });

  return ok(res, { id, is_active: finalActive }, 'บันทึกการแก้ไขคูปองแล้ว');
}));

// ระบบเดิม: สมาชิกกดเก็บคูปอง
router.post('/:id/collect', requireMember, handle(async (req, res) => {
  const couponId = Number(req.params.id);
  if (!Number.isInteger(couponId) || couponId <= 0) {
    throw fail('รหัสคูปองไม่ถูกต้อง', 422);
  }

  const { transaction } = require('../lib/db');

  await transaction(async (conn) => {
    const [coupons] = await conn.execute(
      `SELECT id, end_date, usage_limit, per_member_limit
         FROM coupons
        WHERE id = ? AND is_active = 1
          AND start_date <= CURDATE()
          AND end_date >= CURDATE()
        FOR UPDATE`,
      [couponId]
    );

    const coupon = coupons[0];
    if (!coupon) throw fail('ไม่พบคูปอง หรือคูปองหมดอายุแล้ว', 404);

    const [[mine]] = await conn.execute(
      'SELECT COUNT(*) AS n FROM member_coupons WHERE member_id = ? AND coupon_id = ?',
      [req.member.id, couponId]
    );

    const perMemberLimit = coupon.per_member_limit == null
      ? 1 : Number(coupon.per_member_limit);

    if (Number(mine.n) >= perMemberLimit) {
      throw fail('คุณเก็บคูปองนี้ครบสิทธิ์แล้ว', 400);
    }

    if (coupon.usage_limit != null) {
      const [[total]] = await conn.execute(
        'SELECT COUNT(*) AS n FROM member_coupons WHERE coupon_id = ?',
        [couponId]
      );

      if (Number(total.n) >= Number(coupon.usage_limit)) {
        throw fail('คูปองถูกเก็บครบแล้ว', 400);
      }
    }

    await conn.execute(
      `INSERT INTO member_coupons (member_id, coupon_id, issued_at, expires_at)
       VALUES (?, ?, NOW(), ?)`,
      [req.member.id, couponId, coupon.end_date]
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