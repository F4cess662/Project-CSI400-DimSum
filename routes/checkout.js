/**
 * /api/checkout — ชำระเงิน ปิดบิล ใบเสร็จ สมาชิก แต้ม คูปอง มัดจำห้อง VIP (คนที่ 5 · เฟส 2–3)
 * POST {"action":"preview", "bill_ids":[5,6], "member_id":1, "reward_ids":[2], "coupon_code":"WELCOME20"}
 *      → คำนวณยอดให้ดูก่อน ไม่บันทึก (FR-26, 27) · member_id / reward_ids / coupon_code ไม่ส่งก็ได้
 *        ส่งรางวัลหรือคูปองที่ใช้ไม่ได้ = ยังได้ยอด พร้อม reward_errors / coupon_error บอกเหตุผล
 * POST {"action":"pay", "bill_ids":[5,6], "payment_method":"cash", "cash_received":1000,
 *       "member_id":1, "reward_ids":[2], "coupon_code":"WELCOME20"}
 *      → ปิดบิล + โต๊ะว่าง + QR ใช้ไม่ได้ + ตัดแต้ม/บวกแต้ม/ใช้คูปอง + ข้อมูลใบเสร็จ (FR-25–29, 41)
 *        payment_method: cash | promptpay | card · cash_received ส่งเฉพาะเงินสด (ไม่ส่ง = รับพอดี)
 * POST {"action":"member", "code":"0812345678"}  หรือ  "code":"TS-000005" (รหัสบนบัตรสมาชิก)
 *      → ค้นสมาชิก {id, name, phone, tier, points_balance}
 * ใช้ได้: staff ที่มีช่องติ๊ก "รับเงิน", ผู้จัดการ, เจ้าของร้าน
 *
 * ลำดับคิด (BR-10): ยอดอาหาร → หักรางวัลแลกแต้ม → หักคูปอง = ยอดชำระ → หักมัดจำห้อง VIP = ยอดที่ต้องจ่าย
 * แต้มที่ได้ = floor(ยอดชำระ / 100) บวกเข้าบัญชีทันที ใช้ได้ครั้งถัดไป (BR-18) · ไม่มีสมาชิกไม่ได้แต้ม
 * bills.total_paid = เงินที่รับตอนปิดบิล (ไม่รวมมัดจำที่รับไปก่อนแล้ว ดูมัดจำที่ deposit_deducted)
 */
const router = require('express').Router();
const config = require('../config');
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { mustHavePerm } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { shopSettings, nowTime } = require('../lib/shop');

const METHODS = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', card: 'บัตร' };
const VAT_RATE = 7;          // ราคาเมนูรวม VAT แล้ว ใบเสร็จแสดง VAT ที่อยู่ในยอด
const BAHT_PER_POINT = 100;  // 100 บาท = 1 แต้ม (BR-18)
const WEEKDAYS = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

/** ยอดของรายการ: (สั่ง - ยกเลิกบางส่วน) × ราคาตอนสั่ง · รายการที่ยกเลิกทั้งหมดไม่นับ */
const LINE_TOTAL = "CASE WHEN oi.status <> 'cancelled' THEN (oi.qty - oi.cancelled_qty) * oi.unit_price ELSE 0 END";

const marks = (arr) => arr.map(() => '?').join(',');
const money = (n) => Math.round(Number(n) * 100) / 100;
const baht = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท';

/** แปลงเป็นรายการเลขบิลที่ไม่ซ้ำ เรียงน้อยไปมาก (ล็อกตามลำดับเดียวกันทุกครั้ง กัน deadlock) */
function toBillIds(value) {
  const list = Array.isArray(value) ? value : [value];
  const ids = [...new Set(list.map(Number))].sort((a, b) => a - b);
  if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) throw fail('กรุณาเลือกบิลที่จะชำระ', 422);
  return ids;
}

/** วันนี้ของไทย: { date: 'YYYY-MM-DD', time: 'HH:MM:SS', weekday: 1–7 (จันทร์ = 1) } */
function thaiNow() {
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone });
  const short = new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short' }).format(new Date());
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(short) + 1;
  return { date, time: nowTime(), weekday };
}

/** แปลงวันที่จาก DB (Date หรือ string) เป็น 'YYYY-MM-DD' */
function ymd(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toLocaleDateString('sv-SE');
}

/* =========================================================
   1) บิล + รายการ
   run(sql, params) → rows · ใช้ได้ทั้งนอก transaction (query) และใน transaction (conn.execute)
   ========================================================= */
async function loadBills(run, billIds, lock = false) {
  const bills = await run(
    `SELECT b.id, b.bill_no, b.status, b.guests, b.opened_at, b.vip_room_id, v.name AS vip_name,
            (SELECT GROUP_CONCAT(t.code ORDER BY t.code SEPARATOR ', ')
               FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id
              WHERE bt.bill_id = b.id) AS table_codes
       FROM bills b LEFT JOIN vip_rooms v ON v.id = b.vip_room_id
      WHERE b.id IN (${marks(billIds)}) ORDER BY b.id ${lock ? 'FOR UPDATE' : ''}`, billIds);
  if (bills.length !== billIds.length) throw fail('ไม่พบบิลบางใบ', 404);
  const closed = bills.filter((b) => b.status !== 'open');
  if (closed.length) {
    throw fail('บิล ' + closed.map((b) => b.bill_no).join(', ') + (closed.some((b) => b.status === 'paid')
      ? ' ชำระเงินไปแล้ว' : ' ถูกยกเลิกแล้ว'), 409);
  }

  const items = await run(
    `SELECT o.bill_id, oi.menu_item_id, m.name, m.unit, oi.unit_price, oi.status,
            oi.qty, oi.cancelled_qty, ${LINE_TOTAL} AS amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items m ON m.id = oi.menu_item_id
      WHERE o.bill_id IN (${marks(billIds)}) AND o.cancelled_at IS NULL
      ORDER BY o.bill_id, o.round_no, oi.id`, billIds);
  const [{ n: orderCount } = { n: 0 }] = await run(
    `SELECT COUNT(*) AS n FROM orders WHERE bill_id IN (${marks(billIds)})`, billIds);

  // มัดจำห้อง VIP: บิลที่เปิดจากการจอง (vip_bookings.bill_id) และรับมัดจำแล้ว — หักทุกครั้ง ไม่เกี่ยวกับสมาชิก
  const deposits = await run(
    `SELECT id, bill_id, deposit_amount, customer_name FROM vip_bookings
      WHERE bill_id IN (${marks(billIds)}) AND deposit_received_at IS NOT NULL
        AND status NOT IN ('cancelled', 'no_show')`, billIds);

  const result = bills.map((b) => {
    // รวมเมนูเดียวกันราคาเดียวกันเป็นบรรทัดเดียว (สั่งหลายรอบ)
    const lines = new Map();
    let pending = 0;
    for (const it of items.filter((x) => x.bill_id === b.id)) {
      if (['waiting', 'cooking', 'ready'].includes(it.status)) pending += 1;
      const qty = it.status === 'cancelled' ? 0 : it.qty - it.cancelled_qty;
      if (qty <= 0) continue;
      const key = it.menu_item_id + '|' + it.unit_price;
      const line = lines.get(key) || {
        menu_item_id: it.menu_item_id, name: it.name, unit: it.unit, unit_price: Number(it.unit_price), qty: 0, amount: 0,
      };
      line.qty += qty;
      line.amount = money(line.amount + Number(it.amount));
      lines.set(key, line);
    }
    const dep = deposits.filter((d) => d.bill_id === b.id);
    return {
      id: b.id,
      bill_no: b.bill_no,
      place: b.vip_name || b.table_codes || '-',
      vip_room_id: b.vip_room_id,
      guests: b.guests,
      opened_at: b.opened_at,
      lines: [...lines.values()],
      subtotal: money([...lines.values()].reduce((a, l) => a + l.amount, 0)),
      pending_items: pending,
      deposit: money(dep.reduce((a, d) => a + Number(d.deposit_amount), 0)),
      vip_booking_ids: dep.map((d) => d.id),
    };
  });

  return { bills: result, has_orders: Number(orderCount) > 0 };
}

/* =========================================================
   2) สมาชิก รางวัล คูปอง
   ========================================================= */

/** เมนูในบิลทั้งหมด (รวมทุกบิล) menu_item_id → { qty, unit_price ต่ำสุด, name } */
function menuInBills(bills) {
  const map = new Map();
  for (const b of bills) {
    for (const l of b.lines) {
      const m = map.get(l.menu_item_id) || { qty: 0, unit_price: l.unit_price, name: l.name };
      m.qty += l.qty;
      m.unit_price = Math.min(m.unit_price, l.unit_price);
      map.set(l.menu_item_id, m);
    }
  }
  return map;
}

/**
 * เช็กคูปองตามกติกาเดียวกับ /api/coupons ?code= (BR-23, BR-27)
 * คืน { coupon, wallet, error } · wallet = แถว member_coupons ที่จะถูกใช้ (คูปองในบัญชีสมาชิก)
 */
async function checkCoupon(run, code, { member, subtotal, now, menus, lock = false }) {
  const rows = await run(
    `SELECT c.*, m.name AS free_menu_name FROM coupons c LEFT JOIN menu_items m ON m.id = c.free_menu_item_id
      WHERE c.code = ? ${lock ? 'FOR UPDATE' : ''}`, [code]);
  const c = rows[0];
  if (!c || c.is_active !== 1) return { error: `ไม่พบคูปอง ${code} หรือปิดใช้งานแล้ว` };
  const res = (error) => ({ coupon: c, error });

  if (now.date < ymd(c.start_date)) return res(`คูปอง ${c.code} เริ่มใช้ได้ ${ymd(c.start_date)}`);
  if (now.date > ymd(c.end_date)) return res(`คูปอง ${c.code} หมดอายุแล้ว`);
  if (c.valid_weekdays) {
    const days = String(c.valid_weekdays).split(',').map(Number);
    if (!days.includes(now.weekday)) {
      return res(`คูปอง ${c.code} ใช้ได้เฉพาะวัน${days.map((d) => WEEKDAYS[d]).join(' ')}`);
    }
  }
  if (c.exclude_holidays === 1) {
    const hol = await run('SELECT name FROM public_holidays WHERE holiday_date = ?', [now.date]);
    if (hol.length) return res(`คูปอง ${c.code} ใช้ไม่ได้ในวันหยุดราชการ (${hol[0].name})`);
  }
  if (c.valid_time_start && c.valid_time_end && (now.time < c.valid_time_start || now.time > c.valid_time_end)) {
    return res(`คูปอง ${c.code} ใช้ได้เวลา ${c.valid_time_start.slice(0, 5)}–${c.valid_time_end.slice(0, 5)} น.`);
  }
  if (subtotal < Number(c.min_spend)) return res(`คูปอง ${c.code} ต้องมียอดขั้นต่ำ ${baht(c.min_spend)}`);
  if (c.member_only === 1 && !member) return res(`คูปอง ${c.code} ใช้ได้เฉพาะสมาชิก กรอกเบอร์สมาชิกก่อน`);
  if (c.coupon_type === 'free_item' && !menus.has(c.free_menu_item_id)) {
    return res(`คูปอง ${c.code} แถม${c.free_menu_name || 'เมนู'} ต้องมีเมนูนี้ในบิล`);
  }
  if (c.usage_limit !== null) {
    // ตอนจ่าย (lock) อ่านแบบล็อก จะได้เห็นการใช้ของบิลอื่นที่เพิ่ง commit (กันใช้เกินจำนวน)
    const [{ n }] = await run(`SELECT COUNT(*) AS n FROM coupon_usages WHERE coupon_id = ? ${lock ? 'FOR UPDATE' : ''}`, [c.id]);
    if (n >= c.usage_limit) return res(`คูปอง ${c.code} ถูกใช้ครบจำนวนแล้ว`);
  }
  if (c.per_member_limit !== null && member) {
    const [{ n }] = await run(
      `SELECT COUNT(*) AS n FROM coupon_usages WHERE coupon_id = ? AND member_id = ? ${lock ? 'FOR UPDATE' : ''}`, [c.id, member.id]);
    if (n >= c.per_member_limit) return res(`สมาชิกใช้คูปอง ${c.code} ครบสิทธิ์แล้ว`);
  }

  // คูปองที่แจกเข้าบัญชีสมาชิก (เช่น ต้อนรับ วันเกิด) ต้องมีในบัญชีของสมาชิกคนนี้และยังไม่ใช้
  const [{ n: issued }] = await run('SELECT COUNT(*) AS n FROM member_coupons WHERE coupon_id = ?', [c.id]);
  let wallet = null;
  if (member) {
    const w = await run(
      `SELECT id, expires_at FROM member_coupons
        WHERE member_id = ? AND coupon_id = ? AND used_at IS NULL AND (expires_at IS NULL OR expires_at >= ?)
        ORDER BY expires_at IS NULL, expires_at, id LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`, [member.id, c.id, now.date]);
    wallet = w[0] || null;
  }
  if (issued > 0 && c.member_only === 1 && !wallet) return res(`สมาชิกคนนี้ไม่มีคูปอง ${c.code} ในบัญชี หรือใช้ไปแล้ว`);

  return { coupon: c, wallet, error: null };
}

/** ส่วนลดของคูปอง (คิดจากยอดหลังหักรางวัลแล้ว ไม่เกินยอดที่เหลือ) */
function couponDiscount(c, base, menus) {
  let d = 0;
  if (c.coupon_type === 'amount') d = Number(c.value);
  else if (c.coupon_type === 'percent') d = money(base * Number(c.value) / 100);
  else if (c.coupon_type === 'free_item') d = menus.get(c.free_menu_item_id).unit_price;
  return money(Math.min(d, base));
}

/** ข้อความสั้นของคูปอง เช่น "ลด 20%" */
function couponLabel(c) {
  if (c.coupon_type === 'percent') return `ลด ${Number(c.value)}%`;
  if (c.coupon_type === 'amount') return `ลด ${baht(c.value)}`;
  return `แถม${c.free_menu_name || 'เมนู'} 1`;
}

/**
 * คิดยอดทั้งหมดตาม BR-10
 * opts: { member_id, reward_ids, coupon_code, lock }
 */
async function calculate(run, billIds, opts = {}) {
  const lock = !!opts.lock;
  const { bills, has_orders } = await loadBills(run, billIds, lock);
  const now = thaiNow();
  const menus = menuInBills(bills);
  const subtotal = money(bills.reduce((a, b) => a + b.subtotal, 0));

  // --- สมาชิก (1 บิล 1 สมาชิก BR-19) ---
  let member = null;
  if (opts.member_id) {
    const rows = await run(
      `SELECT id, phone, name, tier, points_balance FROM members WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
      [Number(opts.member_id)]);
    member = rows[0] || null;
    if (!member) throw fail('ไม่พบสมาชิกนี้', 404);
  }

  // --- รางวัลแลกแต้ม (แลกได้เฉพาะตอนปิดบิล BR-22 · ใช้แต้มเดิมเท่านั้น) ---
  const rewardIds = (Array.isArray(opts.reward_ids) ? opts.reward_ids : opts.reward_ids ? [opts.reward_ids] : [])
    .map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const allRewards = member ? await run(
    `SELECT r.id, r.name, r.points_cost, r.reward_type, r.menu_item_id, r.discount_value, m.name AS menu_name
       FROM rewards r LEFT JOIN menu_items m ON m.id = r.menu_item_id
      WHERE r.is_active = 1 ORDER BY r.points_cost, r.id`) : [];
  const rewardErrors = [];
  const usedRewards = [];
  let pointsLeft = member ? member.points_balance : 0;
  let discountPoints = 0;
  const freeUsed = new Map(); // menu_item_id → จำนวนที่แถมไปแล้ว
  if (rewardIds.length && !member) rewardErrors.push('แลกแต้มต้องกรอกเบอร์สมาชิกก่อน');
  if (member) {
    for (const id of rewardIds) {
      const r = allRewards.find((x) => x.id === id);
      if (!r) { rewardErrors.push('รางวัลนี้ปิดใช้งานแล้วหรือไม่มีอยู่'); continue; }
      if (pointsLeft < r.points_cost) { rewardErrors.push(`แต้มไม่พอแลก "${r.name}" (ใช้ ${r.points_cost} แต้ม)`); continue; }
      let d = 0;
      if (r.reward_type === 'free_item') {
        const m = menus.get(r.menu_item_id);
        const used = freeUsed.get(r.menu_item_id) || 0;
        if (!m || m.qty <= used) { rewardErrors.push(`"${r.name}" ต้องมี${r.menu_name || 'เมนูนั้น'}ในบิล`); continue; }
        freeUsed.set(r.menu_item_id, used + 1);
        d = m.unit_price;
      } else {
        d = Number(r.discount_value);
      }
      d = money(Math.min(d, subtotal - discountPoints));
      pointsLeft -= r.points_cost;
      discountPoints = money(discountPoints + d);
      usedRewards.push({ id: r.id, name: r.name, points_cost: r.points_cost, discount: d });
    }
  }

  // --- คูปอง (1 บิล 1 ใบ BR-23) ---
  const afterRewards = money(subtotal - discountPoints);
  let coupon = null;
  let couponError = null;
  let wallet = null;
  let discountCoupon = 0;
  const code = opts.coupon_code ? String(opts.coupon_code).trim().toUpperCase() : '';
  if (code) {
    const chk = await checkCoupon(run, code, { member, subtotal, now, menus, lock });
    if (chk.error) couponError = chk.error;
    else {
      discountCoupon = couponDiscount(chk.coupon, afterRewards, menus);
      coupon = { id: chk.coupon.id, code: chk.coupon.code, label: couponLabel(chk.coupon), discount: discountCoupon };
      wallet = chk.wallet;
    }
  }

  const total = money(afterRewards - discountCoupon);                     // ยอดชำระ
  const depositAvailable = money(bills.reduce((a, b) => a + b.deposit, 0));
  const depositDeducted = money(Math.min(depositAvailable, total));      // หักมัดจำห้อง VIP
  const amountDue = money(total - depositDeducted);                     // ยอดที่ต้องจ่ายเพิ่ม
  const pointsToEarn = member ? Math.floor(total / BAHT_PER_POINT) : 0;

  return {
    bills, has_orders, now, member, wallet, usedRewards, allRewards, menus, coupon,
    summary: {
      subtotal,
      discount_points: discountPoints,
      discount_coupon: discountCoupon,
      total,
      deposit_available: depositAvailable,
      deposit_deducted: depositDeducted,
      amount_due: amountDue,
      vat: money(total * VAT_RATE / (100 + VAT_RATE)),
      points_to_earn: pointsToEarn,
      points_redeemed: member ? member.points_balance - pointsLeft : 0,
    },
    rewardErrors, couponError,
  };
}

/** คูปองที่แนะนำตอนนี้: คูปองทั่วไปที่ใช้ได้ตอนนี้ (เช่น HAPPYHOUR) + คูปองในบัญชีสมาชิก */
async function suggestions(calc) {
  const { member, now, menus, summary } = calc;
  const list = await query(
    `SELECT c.code, c.member_only, c.end_date,
            (SELECT COUNT(*) FROM member_coupons mc WHERE mc.coupon_id = c.id) AS issued
       FROM coupons c
      WHERE c.is_active = 1 AND c.start_date <= ? AND c.end_date >= ?
      ORDER BY c.code`, [now.date, now.date]);
  const base = money(summary.subtotal - summary.discount_points);
  const suggested = [];
  const memberCoupons = [];
  for (const row of list) {
    const fromWallet = Number(row.issued) > 0 && row.member_only === 1;
    if (fromWallet) {
      // คูปองแจกเข้าบัญชี: แสดงเฉพาะที่สมาชิกคนนี้มีและยังไม่ใช้
      if (!member) continue;
      const own = await query(
        `SELECT 1 FROM member_coupons mc JOIN coupons c ON c.id = mc.coupon_id
          WHERE mc.member_id = ? AND c.code = ? AND mc.used_at IS NULL AND (mc.expires_at IS NULL OR mc.expires_at >= ?)
          LIMIT 1`, [member.id, row.code, now.date]);
      if (!own.length) continue;
    }
    const chk = await checkCoupon(query, row.code, { member, subtotal: summary.subtotal, now, menus });
    const item = chk.coupon && {
      code: chk.coupon.code,
      label: couponLabel(chk.coupon),
      discount: chk.error ? 0 : couponDiscount(chk.coupon, base, menus),
      usable: !chk.error,
      reason: chk.error,
      expires_at: chk.wallet ? ymd(chk.wallet.expires_at) : null,
    };
    if (!item) continue;
    if (fromWallet) {
      memberCoupons.push(item);
    } else if (item.usable) {
      suggested.push(item);
    }
  }
  return { suggested_coupons: suggested, member_coupons: memberCoupons };
}

/** ข้อความเตือนเมื่อยังมีรายการที่ครัวยังไม่เสิร์ฟ */
function pendingMessage(bills) {
  const list = bills.filter((b) => b.pending_items > 0).map((b) => `${b.place} ${b.pending_items} รายการ`).join(', ');
  return `ยังมีอาหารที่ยังไม่เสิร์ฟ (${list}) ให้ครัวเสิร์ฟหรือยกเลิกรายการก่อนชำระเงิน`;
}

/**
 * แบ่งส่วนลดและมัดจำลงแต่ละบิล (จ่ายรวมหลายบิล) ให้ total_paid ของทุกบิลรวมกันเท่ากับเงินที่รับจริง
 * ส่วนลดแต้ม/คูปองหักจากบิลแรกก่อน เหลือค่อยหักบิลถัดไป · มัดจำหักจากบิลของห้องนั้นเอง
 */
function allocate(bills, s) {
  let points = s.discount_points;
  let coupon = s.discount_coupon;
  return bills.map((b) => {
    let left = b.subtotal;
    const dp = money(Math.min(points, left)); points = money(points - dp); left = money(left - dp);
    const dc = money(Math.min(coupon, left)); coupon = money(coupon - dc); left = money(left - dc);
    const dep = money(Math.min(b.deposit, left)); left = money(left - dep);
    return { ...b, discount_points: dp, discount_coupon: dc, deposit_deducted: dep, total_paid: left };
  });
}

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'preview': return preview(req, res, b);
    case 'pay': return pay(req, res, b);
    case 'member': return findMember(req, res, b);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

/** ค้นสมาชิกด้วยเบอร์โทร หรือรหัสบนบัตร TS-000005 (= เลขสมาชิก 6 หลัก) */
async function findMember(req, res, b) {
  await mustHavePerm(req, 'payment');
  const code = String(b.code || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!code) throw fail('กรอกเบอร์โทรหรือรหัสสมาชิก', 422);
  let m = null;
  if (/^TS\d+$/.test(code)) {
    m = await queryOne('SELECT id, name, phone, tier, points_balance FROM members WHERE id = ?', [Number(code.slice(2))]);
  } else if (/^0\d{9}$/.test(code)) {
    m = await queryOne('SELECT id, name, phone, tier, points_balance FROM members WHERE phone = ?', [code]);
  } else {
    throw fail('กรอกเบอร์โทร 10 หลัก หรือรหัสสมาชิก เช่น TS-000005', 422);
  }
  if (!m) throw fail('ไม่พบสมาชิก ' + b.code, 404);
  return ok(res, m);
}

/** คำนวณยอดให้ดูก่อน ไม่บันทึก */
async function preview(req, res, b) {
  await mustHavePerm(req, 'payment');
  requireFields(b, ['bill_ids']);
  const calc = await calculate(query, toBillIds(b.bill_ids), b);
  const sug = await suggestions(calc);
  const { member, summary } = calc;

  return ok(res, {
    bills: calc.bills,
    has_orders: calc.has_orders,
    ...summary,
    pending_items: calc.bills.reduce((a, x) => a + x.pending_items, 0),
    member: member && { ...member, points_after: member.points_balance - summary.points_redeemed + summary.points_to_earn },
    rewards: calc.allRewards.map((r) => ({
      id: r.id, name: r.name, points_cost: r.points_cost, reward_type: r.reward_type,
      selected: calc.usedRewards.some((u) => u.id === r.id),
      usable: r.reward_type !== 'free_item' || calc.menus.has(r.menu_item_id),
    })),
    used_rewards: calc.usedRewards,
    reward_errors: calc.rewardErrors,
    coupon: calc.coupon,
    coupon_error: calc.couponError,
    ...sug,
  });
}

/** ปิดบิล: บิล paid · โต๊ะ/ห้องว่าง · QR ใช้ไม่ได้ · ตัด/บวกแต้ม · ใช้คูปอง · รวมหลายบิลจ่ายครั้งเดียวได้ */
async function pay(req, res, b) {
  const user = await mustHavePerm(req, 'payment');
  requireFields(b, ['bill_ids', 'payment_method']);
  const method = b.payment_method;
  if (!METHODS[method]) throw fail('วิธีชำระเงินไม่ถูกต้อง (เงินสด / พร้อมเพย์ / บัตร)', 422);
  const billIds = toBillIds(b.bill_ids);

  const result = await transaction(async (conn) => {
    const run = async (sql, params) => (await conn.execute(sql, params))[0];
    const calc = await calculate(run, billIds, { ...b, lock: true });
    const s = calc.summary;
    if (!calc.has_orders) throw fail('บิลนี้ยังไม่มีออเดอร์ ถ้าลูกค้าไม่สั่งอาหาร ให้ผู้จัดการยกเลิกโต๊ะ', 409);
    if (calc.bills.some((x) => x.pending_items > 0)) throw fail(pendingMessage(calc.bills), 409);
    if (calc.rewardErrors.length) throw fail(calc.rewardErrors[0], 422);
    if (calc.couponError) throw fail(calc.couponError, 422);

    let cashReceived = null;
    if (method === 'cash') {
      cashReceived = b.cash_received === undefined || b.cash_received === null || b.cash_received === ''
        ? s.amount_due : money(b.cash_received);
      if (!Number.isFinite(cashReceived) || cashReceived < s.amount_due) {
        throw fail(`รับเงินไม่พอ ยอดที่ต้องชำระ ${baht(s.amount_due)}`, 422);
      }
    }

    const firstId = calc.bills[0].id;
    const member = calc.member;
    const parts = allocate(calc.bills, s);
    for (const p of parts) {
      await conn.execute(
        `UPDATE bills SET status = 'paid', closed_at = NOW(), closed_by = ?, payment_method = ?, member_id = ?,
                subtotal = ?, discount_points = ?, discount_coupon = ?, deposit_deducted = ?, total_paid = ?,
                points_earned = ?
          WHERE id = ?`,
        [user.id, method, member ? member.id : null, p.subtotal, p.discount_points, p.discount_coupon,
          p.deposit_deducted, p.total_paid, p.id === firstId ? s.points_to_earn : 0, p.id]);
      await conn.execute(
        `UPDATE dining_tables SET status = 'available'
          WHERE id IN (SELECT table_id FROM bill_tables WHERE bill_id = ?)`, [p.id]);
      if (p.vip_room_id) {
        await conn.execute("UPDATE vip_rooms SET status = 'available' WHERE id = ?", [p.vip_room_id]);
      }
    }

    let pointsBalance = null;
    if (member) {
      // แลกแต้ม (ติดลบ) → บวกแต้มจากบิลนี้ทันที (BR-18) · แต้มที่ได้ใช้ได้ครั้งถัดไป
      for (const r of calc.usedRewards) {
        await conn.execute(
          `INSERT INTO point_transactions (member_id, bill_id, points, type, reward_id, created_by)
           VALUES (?, ?, ?, 'redeem', ?, ?)`, [member.id, firstId, -r.points_cost, r.id, user.id]);
      }
      if (s.points_to_earn > 0) {
        await conn.execute(
          `INSERT INTO point_transactions (member_id, bill_id, points, type, created_by)
           VALUES (?, ?, ?, 'earn', ?)`, [member.id, firstId, s.points_to_earn, user.id]);
      }
      pointsBalance = member.points_balance - s.points_redeemed + s.points_to_earn;
      await conn.execute('UPDATE members SET points_balance = ? WHERE id = ?', [pointsBalance, member.id]);
    }

    if (calc.coupon) {
      await conn.execute('INSERT INTO coupon_usages (coupon_id, bill_id, member_id) VALUES (?, ?, ?)',
        [calc.coupon.id, firstId, member ? member.id : null]);
      if (calc.wallet) await conn.execute('UPDATE member_coupons SET used_at = NOW() WHERE id = ?', [calc.wallet.id]);
    }

    const [[row]] = await conn.execute('SELECT closed_at FROM bills WHERE id = ?', [firstId]);
    return { calc, parts, cashReceived, pointsBalance, closedAt: row.closed_at };
  });

  const { calc, parts, cashReceived } = result;
  const s = calc.summary;
  const billNos = parts.map((x) => x.bill_no);
  for (const p of parts) {
    await writeLog(req, 'bill.pay', 'bills', p.id, {
      bill_no: p.bill_no,
      total: p.total_paid,
      payment_method: method,
      paid_together: billNos.length > 1 ? billNos : undefined,
      member_id: calc.member ? calc.member.id : undefined,
      coupon: calc.coupon && p.id === parts[0].id ? calc.coupon.code : undefined,
      rewards: calc.usedRewards.length && p.id === parts[0].id ? calc.usedRewards.map((r) => r.name) : undefined,
      deposit_deducted: p.deposit_deducted || undefined,
    });
  }

  // ใบเสร็จ: รวมทุกบิลที่จ่ายด้วยกัน เมนูเดียวกันราคาเดียวกันรวมบรรทัด
  const merged = new Map();
  for (const p of parts) {
    for (const l of p.lines) {
      const key = l.menu_item_id + '|' + l.unit_price;
      const m = merged.get(key) || { ...l, qty: 0, amount: 0 };
      m.qty += l.qty;
      m.amount = money(m.amount + l.amount);
      merged.set(key, m);
    }
  }
  const shop = (await shopSettings()) || {};

  return ok(res, {
    receipt: {
      shop_name: shop.shop_name,
      address: shop.address,
      phone: shop.phone,
      bill_ids: parts.map((x) => x.id),
      bill_nos: billNos,
      places: parts.map((x) => x.place),
      guests: parts.reduce((a, x) => a + x.guests, 0),
      opened_at: parts.map((x) => x.opened_at).sort()[0],
      closed_at: result.closedAt,
      cashier: user.full_name,
      lines: [...merged.values()],
      subtotal: s.subtotal,
      rewards: calc.usedRewards,
      discount_points: s.discount_points,
      coupon: calc.coupon,
      discount_coupon: s.discount_coupon,
      total: s.total,
      deposit_deducted: s.deposit_deducted,
      amount_due: s.amount_due,
      vat: s.vat,
      payment_method: method,
      payment_label: METHODS[method],
      cash_received: cashReceived,
      change: cashReceived === null ? null : money(cashReceived - s.amount_due),
      member: calc.member && { id: calc.member.id, name: calc.member.name, phone: calc.member.phone },
      points_redeemed: s.points_redeemed,
      points_earned: s.points_to_earn,
      points_balance: result.pointsBalance,
    },
    points_earned: s.points_to_earn,
  }, `ชำระเงิน ${billNos.join(', ')} แล้ว`);
}

module.exports = router;
