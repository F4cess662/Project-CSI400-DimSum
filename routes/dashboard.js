/**
 * /api/dashboard — ภาพรวมร้านสำหรับผู้จัดการ/เจ้าของร้าน (FR-47, FR-57)
 * GET → { shop, tables, vip_rooms, open_bills, unavailable_menus, active_staff,
 *         tables_by_zone, menus_by_category, bills_by_hour, sales_today, sales_by_hour, top_menus, low_menus,
 *         low_ingredients, unpaid_invoices, vip_today, generated_at }
 * tables_by_zone / menus_by_category / bills_by_hour = ข้อมูลกราฟ (Feedback เฟส 1) · vip_today = เฟส 3
 * sales_today + แพ็กเกจ/โทรตามใน vip_today = Feedback เฟส 3
 * เฟส 4: sales_today (+ เทียบเมื่อวาน), sales_by_hour, top_menus, low_menus,
 *        low_ingredients / unpaid_invoices (เรียก inventory-service · ดับแล้วส่วนนั้นเป็น { available: false })
 *
 * ออกแบบให้ขยายตามเฟส: เฟสถัดไปเพิ่ม key ใหม่ในก้อนเดียวกันโดยไม่แก้ key เดิม
 *   P2+: sales_today, low_menus · P3+: vip_today · P4: low_ingredients
 * หน้าเว็บแสดง section ตาม key ที่มี (key ไหนยังไม่มี = ยังไม่ทำ)
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, handle } = require('../lib/response');
const { requireRole } = require('../lib/auth');
const { shopSettings, currentShift, isOrderOpenNow } = require('../lib/shop');
const { callService } = require('../lib/gateway');
const config = require('../config');

/** เวลาปัจจุบันของไทยเป็น 'YYYY-MM-DD HH:MM:SS' (รูปแบบเดียวกับวันเวลาจากฐานข้อมูล) */
const nowDateTime = () => new Date().toLocaleString('sv-SE', { timeZone: config.timezone });

/** โต๊ะทั้งหมดที่ใช้งาน + บิลที่เปิดอยู่ของโต๊ะนั้น (1 โต๊ะมีบิลเปิดได้ใบเดียว BR-26) */
async function loadTables() {
  const items = await query(
    `SELECT t.id, t.code, t.table_type, t.seats, t.status,
            ob.bill_id, ob.bill_no, ob.guests, ob.opened_at
     FROM dining_tables t
     LEFT JOIN (
       SELECT bt.table_id, b.id AS bill_id, b.bill_no, b.guests, b.opened_at
       FROM bill_tables bt JOIN bills b ON b.id = bt.bill_id
       WHERE b.status = 'open'
     ) ob ON ob.table_id = t.id
     WHERE t.is_active = 1
     ORDER BY FIELD(t.table_type, 'bar', 'small', 'large'), t.code`);
  return {
    total: items.length,
    occupied: items.filter((t) => t.status === 'occupied').length,
    items,
  };
}

/** ห้อง VIP ที่ใช้งาน + บิลที่เปิดอยู่ของห้อง */
async function loadVipRooms() {
  const items = await query(
    `SELECT v.id, v.name, v.seats, v.status,
            b.id AS bill_id, b.bill_no, b.guests, b.opened_at
     FROM vip_rooms v
     LEFT JOIN bills b ON b.vip_room_id = v.id AND b.status = 'open'
     WHERE v.is_active = 1
     ORDER BY v.name`);
  return {
    total: items.length,
    occupied: items.filter((v) => v.status === 'occupied').length,
    items,
  };
}

/** จำนวนบิลที่เปิด + จำนวนลูกค้า + ยอดสะสม (ไม่นับออเดอร์/รายการที่ยกเลิก) */
async function loadOpenBills() {
  const head = await queryOne(
    `SELECT COUNT(*) AS count, COALESCE(SUM(guests), 0) AS guests
     FROM bills WHERE status = 'open'`);
  const amt = await queryOne(
    `SELECT COALESCE(SUM((oi.qty - oi.cancelled_qty) * oi.unit_price), 0) AS amount
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN bills b  ON b.id = o.bill_id
     WHERE b.status = 'open' AND o.cancelled_at IS NULL AND oi.status <> 'cancelled'`);
  return { count: Number(head.count), guests: Number(head.guests), amount: Number(amt.amount) };
}

/**
 * เงื่อนไข "หมด" (ขายไม่ได้) = เชฟ/ผู้จัดการกดปิดขาย
 * จำนวนพร้อมขายเหลือ 0 แต่ยังเปิดขาย = "หมดชั่วคราว" ลูกค้ายังสั่งได้ (นับเป็นใกล้หมด · temp_out = true)
 */
const SOLDOUT_SQL = '(m.is_available = 0)';

/** เมนูที่ขายไม่ได้ตอนนี้ (ไม่รวมเมนูที่ลบแล้ว) */
async function loadUnavailableMenus() {
  return query(
    `SELECT m.id, m.name, m.unit, m.kitchen_zone, m.available_qty, m.is_available, m.image_path, m.updated_at,
            c.name AS category_name
     FROM menu_items m JOIN menu_categories c ON c.id = m.category_id
     WHERE m.is_deleted = 0 AND ${SOLDOUT_SQL}
     ORDER BY c.sort_order, m.name`);
}

/**
 * การ์ดสถานะเมนูวันนี้ตามหมวด (หมวดที่ใช้งาน เรียงตาม sort_order · เมนูเรียงตามชื่อ · ไม่รวมเมนูที่ลบแล้ว)
 * → [{ category_id, category, sort_order, total, available, soldout, low,
 *      menus: [{ id, name, unit, available_qty, lot_size, state }] }]
 * state: 'soldout' = ปิดขาย (หมด) · 'low' = ยังขายได้แต่เหลือไม่เกิน 1 ล็อต หรือหมดชั่วคราว (temp_out) · 'ok'
 * available = total - soldout (นับเมนูใกล้หมดเป็นพร้อมขาย)
 */
async function loadMenusByCategory() {
  const rows = await query(
    `SELECT c.id AS category_id, c.name AS category, c.sort_order,
            m.id, m.name, m.unit, m.available_qty, m.lot_size, ${SOLDOUT_SQL} AS is_soldout
     FROM menu_categories c
     LEFT JOIN menu_items m ON m.category_id = c.id AND m.is_deleted = 0
     WHERE c.is_active = 1
     ORDER BY c.sort_order, c.name, m.name`);
  const byCategory = new Map();
  for (const r of rows) {
    if (!byCategory.has(r.category_id)) {
      byCategory.set(r.category_id, {
        category_id: r.category_id, category: r.category, sort_order: r.sort_order,
        total: 0, available: 0, soldout: 0, low: 0, menus: [],
      });
    }
    const c = byCategory.get(r.category_id);
    if (r.id === null) continue;                      // หมวดที่ยังไม่มีเมนู
    const state = Number(r.is_soldout) ? 'soldout'
      : r.available_qty !== null && r.available_qty <= r.lot_size ? 'low' : 'ok';
    c.total++;
    if (state === 'soldout') c.soldout++;
    if (state === 'low') c.low++;
    const tempOut = state === 'low' && r.available_qty <= 0; // เหลือ 0 แต่ยังเปิดขาย
    c.menus.push({ id: r.id, name: r.name, unit: r.unit, available_qty: r.available_qty, lot_size: r.lot_size, state, temp_out: tempOut });
  }
  return [...byCategory.values()].map((c) => ({ ...c, available: c.total - c.soldout }));
}

/** กราฟ: จำนวนโต๊ะมีลูกค้า/ว่าง แยกโซน (บาร์ / 2–4 คน / 5–8 คน / VIP) */
function tablesByZone(tables, vipRooms) {
  const count = (items, zone) => {
    const busy = items.filter((t) => t.status === 'occupied').length;
    return { zone, busy, free: items.length - busy };
  };
  return [
    ...['bar', 'small', 'large'].map((type) => count(tables.items.filter((t) => t.table_type === type), type)),
    count(vipRooms.items, 'vip'),
  ];
}

/**
 * ชั่วโมงที่ร้านเปิดของกะหนึ่ง เช่น 10:00–14:00 → [10, 11, 12, 13]
 * ปิดไม่ตรงชั่วโมง (เช่น 20:30) นับชั่วโมงนั้นด้วย
 */
function shiftHours(open, close) {
  const from = Number(open.slice(0, 2));
  const to = Number(close.slice(0, 2)) + (close.slice(3) === '00:00' ? 0 : 1);
  const hours = [];
  for (let h = from; h < to; h++) hours.push(h);
  return hours;
}

/**
 * กราฟ: บิลที่เปิดวันนี้รายชั่วโมง (ไม่นับบิลที่ยกเลิกเพราะเปิดผิด)
 * แสดงเฉพาะชั่วโมงที่ร้านเปิดของกะเช้าและกะเย็น (อ่านจาก shop_settings) ชั่วโมงที่ไม่มีบิล = 0
 * → [{ hour: 10, shift: 'morning', count: 1 }, ...]
 */
async function loadBillsByHour() {
  const [s, rows] = await Promise.all([
    shopSettings(),
    query(
      `SELECT HOUR(opened_at) AS hour, COUNT(*) AS count
       FROM bills
       WHERE opened_at >= CURDATE() AND opened_at < CURDATE() + INTERVAL 1 DAY AND status <> 'cancelled'
       GROUP BY HOUR(opened_at)`),
  ]);
  const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.count)]));
  return [
    ...shiftHours(s.morning_open, s.morning_close).map((hour) => ({ hour, shift: 'morning', count: byHour.get(hour) || 0 })),
    ...shiftHours(s.evening_open, s.evening_close).map((hour) => ({ hour, shift: 'evening', count: byHour.get(hour) || 0 })),
  ];
}

/**
 * "โทรตาม": การจองที่ยืนยันแล้ว (confirmed) เลยเวลาเริ่มมาแล้วกี่นาทียังไม่มา (Feedback เฟส 3)
 * ยังไม่มีคอลัมน์ใน shop_settings จึงตั้งไว้ที่นี่ก่อน (ขอคนที่ 1 เพิ่ม shop_settings.vip_call_after_min)
 */
const CALL_AFTER_MIN = 10;
/** ใช้ห้องได้ถึงนาทีที่ :50 ของชั่วโมงสุดท้าย (10 นาทีสุดท้ายเป็นเวลาจัดห้อง) */
const ROOM_SETUP_MIN = 10;

const hourOf = (t) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;
/** ชั่วโมงทศนิยม → 'HH:MM:SS' เช่น 11.8333 → '11:50:00' */
const timeOf = (h) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
};

/**
 * ช่วงเวลาใช้ห้องของการจอง 1 รายการ (ชั่วโมงทศนิยม) จบที่ :50 ตามแพ็กเกจ
 *   แพ็กเกจรายชั่วโมง (S/M/L หรือข้อมูลเก่าที่มีแค่ hours) → 1 ช่วง เช่น S 10:00 → 10:00–11:50
 *   เหมาวัน (hours = NULL) → กะเช้าถึงก่อนปิด 10 นาที + กะเย็นถึงก่อนปิด 10 นาที (ช่วงพักร้านไม่นับ)
 *   released (ปล่อยห้องคืน) → ตัดทุกช่วงที่เวลาปล่อยห้อง ช่วงที่เหลือจึงแสดงเป็นว่าง
 */
function bookingSegments(k, s) {
  const setup = ROOM_SETUP_MIN / 60;
  const start = hourOf(k.start_time);
  let segs;
  if (k.hours !== null) {
    segs = [{ from: start, to: start + k.hours - setup }];
  } else {
    segs = [];
    if (start < hourOf(s.morning_close)) segs.push({ from: start, to: hourOf(s.morning_close) - setup });
    segs.push({ from: Math.max(start, hourOf(s.evening_open)), to: hourOf(s.evening_close) - setup });
  }
  if (k.status === 'released' && k.released_at && k.released_at.slice(0, 10) === k.booking_date) {
    const cut = hourOf(k.released_at.slice(11, 16));
    segs = segs.filter((g) => g.from < cut).map((g) => ({ from: g.from, to: Math.min(g.to, cut) }));
  }
  return segs.filter((g) => g.to > g.from);
}

/**
 * P3: การจองห้อง VIP วันนี้ (ทุกสถานะ) สำหรับไทม์ไลน์ + โดนัท + รายการต้องติดตาม
 * อ่านจาก vip_bookings + vip_packages (ข้อมูลเก่าไม่มีแพ็กเกจ → package_name = NULL หน้าเว็บแสดงจำนวนชั่วโมงแทน)
 * → { date, open_hour, close_hour, closed_ranges: [{ from, to }], rooms: [{ id, name }], call_after_min,
 *     bookings: [{ id, vip_room_id, room_name, package_code, package_name, start_time, end_time, hours,
 *                  segments: [{ from, to }], customer_name, customer_phone, guests, preorder_total, room_fee,
 *                  deposit_amount, deposit_received_at, status, released_at, minutes_late }],
 *     by_status: { pending_deposit, confirmed, arrived, released, no_show, cancelled },
 *     follow_up: [{ booking_id, room_name, package_name, hours, start_time, customer_name, customer_phone, guests,
 *                   status, deposit_amount, no_deposit, call, minutes_late }] }   โทรตามขึ้นก่อน แล้วเรียงตามเวลาเริ่ม
 * segments = ช่วงที่ใช้ห้องจริง (ชั่วโมงทศนิยม) · end_time = เวลาจบของช่วงสุดท้าย
 * minutes_late = เลยเวลาเริ่มมาแล้วกี่นาที (ติดลบ = ยังไม่ถึงเวลา)
 */
async function loadVipToday(vipRooms) {
  const [s, bookings, today] = await Promise.all([
    shopSettings(),
    query(
      `SELECT k.id, k.vip_room_id, v.name AS room_name, p.code AS package_code, p.name AS package_name,
              DATE_FORMAT(k.booking_date, '%Y-%m-%d') AS booking_date, k.start_time, k.hours,
              k.customer_name, k.customer_phone, k.guests, k.preorder_total, k.room_fee, k.deposit_amount,
              k.deposit_received_at, k.status, k.bill_id,
              DATE_FORMAT(k.released_at, '%Y-%m-%d %H:%i:%s') AS released_at,
              TIMESTAMPDIFF(MINUTE, TIMESTAMP(k.booking_date, k.start_time), NOW()) AS minutes_late
       FROM vip_bookings k
       JOIN vip_rooms v ON v.id = k.vip_room_id
       LEFT JOIN vip_packages p ON p.id = k.package_id
       WHERE k.booking_date = CURDATE()
       ORDER BY k.start_time, v.name`),
    queryOne('SELECT CURDATE() AS d'),
  ]);
  const byStatus = { pending_deposit: 0, confirmed: 0, arrived: 0, released: 0, no_show: 0, cancelled: 0 };
  for (const k of bookings) byStatus[k.status] = (byStatus[k.status] || 0) + 1;

  const items = bookings.map((k) => {
    const segments = bookingSegments(k, s);
    const { booking_date: _date, ...rest } = k;
    return {
      ...rest,
      end_time: segments.length ? timeOf(segments[segments.length - 1].to) : k.start_time,
      segments,
      minutes_late: Number(k.minutes_late),
    };
  });

  // 1 การจอง = 1 แถว · no_deposit = ยังไม่รับมัดจำ · call = ยืนยันแล้วแต่เลยเวลาเริ่ม ≥ CALL_AFTER_MIN นาทียังไม่มา
  const followUp = items
    .map((k) => ({
      booking_id: k.id, room_name: k.room_name, package_name: k.package_name, hours: k.hours,
      start_time: k.start_time, customer_name: k.customer_name, customer_phone: k.customer_phone, guests: k.guests,
      status: k.status, deposit_amount: k.deposit_amount,
      no_deposit: k.status === 'pending_deposit',
      call: k.status === 'confirmed' && k.minutes_late >= CALL_AFTER_MIN,
      minutes_late: k.minutes_late,
    }))
    .filter((f) => f.call || f.no_deposit)
    .sort((a, b) => (a.call === b.call ? a.start_time.localeCompare(b.start_time) : a.call ? -1 : 1));

  return {
    date: today.d,
    open_hour: Math.floor(hourOf(s.morning_open)),
    close_hour: Math.ceil(hourOf(s.evening_close > s.morning_close ? s.evening_close : s.morning_close)),
    closed_ranges: s.evening_open > s.morning_close ? [{ from: hourOf(s.morning_close), to: hourOf(s.evening_open) }] : [],
    rooms: vipRooms.items.map((r) => ({ id: r.id, name: r.name })),
    call_after_min: CALL_AFTER_MIN,
    bookings: items,
    by_status: byStatus,
    follow_up: followUp,
  };
}

/**
 * ยอดขายของวันหนึ่ง (Feedback เฟส 3 / เฟส 4: รวมค่าห้อง VIP + มัดจำที่ยึด · มัดจำที่คืนไม่นับ)
 *   daysAgo = 0 วันนี้ · 1 เมื่อวาน · sameTime = นับถึงเวลาเดียวกับตอนนี้ของวันนั้น (ใช้เทียบกับวันนี้ให้ยุติธรรม)
 *   บิลที่ชำระ (status = 'paid', closed_at ในวันนั้น): ยอด = total_paid + deposit_deducted
 *     (total_paid = เงินที่รับตอนปิดบิล · deposit_deducted = มัดจำที่รับไว้ก่อนแล้วหักในบิล) = อาหาร + ค่าห้อง − ส่วนลด
 *     ค่าห้อง = room_fee ของการจองที่ bill_id ชี้มาที่บิลนั้น (เงื่อนไขเดียวกับ routes/checkout.js)
 *   มัดจำที่ยึด: การจองที่รับมัดจำแล้วแต่ "ไม่มา"/"ยกเลิก" และไม่ได้คืนมัดจำ (deposit_refunded_at IS NULL)
 *     นับวันที่กดไม่มา/ยกเลิก (activity_logs action vip_booking.no_show / vip_booking.cancel)
 * → { total, bills, food, room_fee, deposit_forfeited, forfeited_count }
 */
async function loadSalesOn(daysAgo, sameTime = false) {
  const d = Number(daysAgo);
  const from = `CURDATE() - INTERVAL ${d} DAY`;
  const to = sameTime ? `NOW() - INTERVAL ${d} DAY` : `CURDATE() - INTERVAL ${d - 1} DAY`;
  const [paid, room, forfeited] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) AS bills, COALESCE(SUM(total_paid + deposit_deducted), 0) AS amount
       FROM bills
       WHERE status = 'paid' AND closed_at >= ${from} AND closed_at < ${to}`),
    queryOne(
      `SELECT COALESCE(SUM(k.room_fee), 0) AS amount
       FROM vip_bookings k JOIN bills b ON b.id = k.bill_id
       WHERE b.status = 'paid' AND b.closed_at >= ${from} AND b.closed_at < ${to}
         AND k.status NOT IN ('cancelled', 'no_show', 'released')`),
    queryOne(
      `SELECT COUNT(*) AS n, COALESCE(SUM(k.deposit_amount), 0) AS amount
       FROM vip_bookings k
       WHERE k.status IN ('no_show', 'cancelled')
         AND k.deposit_received_at IS NOT NULL AND k.deposit_refunded_at IS NULL
         AND EXISTS (SELECT 1 FROM activity_logs l
                     WHERE l.target_type = 'vip_bookings' AND l.target_id = k.id
                       AND l.action IN ('vip_booking.no_show', 'vip_booking.cancel')
                       AND l.created_at >= ${from} AND l.created_at < ${to})`),
  ]);
  const billsAmount = Number(paid.amount);
  const roomFee = Math.min(Number(room.amount), billsAmount);
  const depositForfeited = Number(forfeited.amount);
  return {
    total: billsAmount + depositForfeited,
    bills: Number(paid.bills),
    food: billsAmount - roomFee,                 // ค่าอาหารหลังหักส่วนลด
    room_fee: roomFee,
    deposit_forfeited: depositForfeited,
    forfeited_count: Number(forfeited.n),
  };
}

/**
 * P2/P3/P4: ยอดขายวันนี้ + เทียบเมื่อวาน
 * → { ...ยอดวันนี้ (ดู loadSalesOn), yesterday: { total, total_full_day }, change_pct }
 *   change_pct = % เทียบเมื่อวาน "ถึงเวลาเดียวกัน" (เช่น 12:00 วันนี้ เทียบ 12:00 เมื่อวาน) · เมื่อวานเป็น 0 → null
 */
async function loadSalesToday() {
  const [today, ySameTime, yFull] = await Promise.all([loadSalesOn(0), loadSalesOn(1, true), loadSalesOn(1)]);
  const base = ySameTime.total;
  return {
    ...today,
    yesterday: { total: base, total_full_day: yFull.total },
    change_pct: base > 0 ? Math.round(((today.total - base) / base) * 1000) / 10 : null,
  };
}

/**
 * P4: ยอดขายวันนี้รายชั่วโมง (บิลที่ชำระ นับตามชั่วโมงที่ปิดบิล) เฉพาะชั่วโมงที่ร้านเปิด แยกกะเช้า/เย็น
 * → [{ hour: 10, shift: 'morning', amount: 1234, bills: 3 }, ...]   ชั่วโมงที่ไม่มีบิล = 0
 */
async function loadSalesByHour() {
  const [s, rows] = await Promise.all([
    shopSettings(),
    query(
      `SELECT HOUR(closed_at) AS hour, COUNT(*) AS bills, COALESCE(SUM(total_paid + deposit_deducted), 0) AS amount
       FROM bills
       WHERE status = 'paid' AND closed_at >= CURDATE() AND closed_at < CURDATE() + INTERVAL 1 DAY
       GROUP BY HOUR(closed_at)`),
  ]);
  const byHour = new Map(rows.map((r) => [Number(r.hour), { amount: Number(r.amount), bills: Number(r.bills) }]));
  const row = (hour, shift) => ({ hour, shift, ...(byHour.get(hour) || { amount: 0, bills: 0 }) });
  return [
    ...shiftHours(s.morning_open, s.morning_close).map((h) => row(h, 'morning')),
    ...shiftHours(s.evening_open, s.evening_close).map((h) => row(h, 'evening')),
  ];
}

/**
 * P4: เมนูขายดีวันนี้ 5 อันดับ (นับจากออเดอร์ที่สั่งวันนี้ ไม่นับออเดอร์/รายการที่ยกเลิก และบิลที่ยกเลิก)
 * → [{ menu_item_id, name, unit, qty, amount }]   เรียงตามจำนวน มากไปน้อย
 */
async function loadTopMenus() {
  const rows = await query(
    `SELECT m.id AS menu_item_id, m.name, m.unit,
            SUM(oi.qty - oi.cancelled_qty) AS qty,
            SUM((oi.qty - oi.cancelled_qty) * oi.unit_price) AS amount
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN bills b ON b.id = o.bill_id
     JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE o.created_at >= CURDATE() AND o.created_at < CURDATE() + INTERVAL 1 DAY
       AND o.cancelled_at IS NULL AND oi.status <> 'cancelled' AND b.status <> 'cancelled'
     GROUP BY m.id, m.name, m.unit
     HAVING qty > 0
     ORDER BY qty DESC, amount DESC
     LIMIT 5`);
  return rows.map((r) => ({ ...r, qty: Number(r.qty), amount: Number(r.amount) }));
}

/**
 * P2+/P4: เมนูใกล้หมด = ยังเปิดขายอยู่ แต่จำนวนพร้อมขายเหลือไม่เกิน 1 ล็อต (รวม "หมดชั่วคราว" ที่เหลือ 0)
 * เมนูที่ไม่จำกัดจำนวน (available_qty = NULL) ไม่นับ · เมนูที่ปิดขาย (หมด) อยู่ใน unavailable_menus แทน
 * → [{ id, name, unit, available_qty, lot_size, category_name, temp_out }]   เหลือน้อยขึ้นก่อน
 */
async function loadLowMenus() {
  const rows = await query(
    `SELECT m.id, m.name, m.unit, m.available_qty, m.lot_size, c.name AS category_name
     FROM menu_items m JOIN menu_categories c ON c.id = m.category_id
     WHERE m.is_deleted = 0 AND NOT ${SOLDOUT_SQL}
       AND m.available_qty IS NOT NULL AND m.available_qty <= m.lot_size
     ORDER BY m.available_qty, c.sort_order, m.name`);
  return rows.map((r) => ({ ...r, temp_out: r.available_qty <= 0 }));
}

/** ข้อมูลจาก service อื่นอาจมาเป็น array ตรงๆ หรือห่อใน { items } / { rows } */
const listOf = (data) => (Array.isArray(data) ? data : (data && (data.items || data.rows)) || []);

/**
 * P4: ข้อมูลจากระบบคลังสินค้า (inventory-service) — ห้ามอ่านตารางคลังตรง เรียกผ่าน callService เท่านั้น
 * service ดับ/ยังไม่มี API → ส่วนนั้นเป็น { available: false, message } แต่ Dashboard ส่วนอื่นยังทำงานปกติ
 *   low_ingredients: { available: true, count, items: [{ id, name, unit, qty_on_hand, reorder_point }] }
 *   unpaid_invoices: { available: true, count, total, items: [{ id, po_id, po_no, supplier_name, invoice_no, invoice_amount, received_at }] }
 */
async function loadInventory(req) {
  const down = (e) => ({
    available: false,
    message: e && e.status === 503 ? 'ระบบคลังสินค้าไม่พร้อมใช้' : `ระบบคลังสินค้าไม่พร้อมใช้ (${(e && e.message) || 'ไม่ทราบสาเหตุ'})`,
  });
  const [ingredients, invoices] = await Promise.all([
    callService(req, 'inventory', '/api/ingredients?low_stock=1').then(
      (data) => {
        // กันกรณี API คืนวัตถุดิบทั้งหมด: กรองซ้ำเฉพาะที่ qty_on_hand ≤ reorder_point
        const items = listOf(data)
          .filter((i) => Number(i.qty_on_hand) <= Number(i.reorder_point))
          .map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty_on_hand: Number(i.qty_on_hand), reorder_point: Number(i.reorder_point) }))
          .sort((a, b) => a.qty_on_hand / (a.reorder_point || 1) - b.qty_on_hand / (b.reorder_point || 1));
        return { available: true, count: items.length, items };
      },
      down),
    callService(req, 'inventory', '/api/goods_receipts?unpaid=1').then(
      (data) => {
        const items = listOf(data)
          .filter((g) => !Number(g.is_paid))
          .map((g) => ({
            id: g.id, po_id: g.po_id, po_no: g.po_no || null, supplier_name: g.supplier_name || null,
            invoice_no: g.invoice_no || null, invoice_amount: Number(g.invoice_amount || 0), received_at: g.received_at || null,
          }));
        return { available: true, count: items.length, total: items.reduce((s, g) => s + g.invoice_amount, 0), items };
      },
      down),
  ]);
  return { low_ingredients: ingredients, unpaid_invoices: invoices };
}

/** พนักงานที่บัญชียังใช้งาน + เวลาล็อกอินล่าสุด (จาก activity_logs) */
async function loadActiveStaff() {
  return query(
    `SELECT u.id, u.full_name, r.role_code, r.role_name, u.can_payment, u.can_vip_booking,
            (SELECT MAX(l.created_at) FROM activity_logs l
             WHERE l.user_id = u.id AND l.action = 'user.login') AS last_login_at
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1 AND r.role_code <> 'customer'
     ORDER BY FIELD(r.role_code, 'owner', 'manager', 'head_chef', 'staff'), u.full_name`);
}

// GET /api/dashboard
router.get('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const [shift, orderOpen, tables, vipRooms, openBills, unavailableMenus, activeStaff,
    menusByCategory, billsByHour, salesToday, salesByHour, topMenus, lowMenus, inventory] = await Promise.all([
    currentShift(), isOrderOpenNow(), loadTables(), loadVipRooms(),
    loadOpenBills(), loadUnavailableMenus(), loadActiveStaff(),
    loadMenusByCategory(), loadBillsByHour(), loadSalesToday(),
    loadSalesByHour(), loadTopMenus(), loadLowMenus(), loadInventory(req),
  ]);
  const vipToday = await loadVipToday(vipRooms);
  return ok(res, {
    shop: { shift, is_open: shift !== null, is_order_open: orderOpen },
    tables,
    vip_rooms: vipRooms,
    open_bills: openBills,
    unavailable_menus: unavailableMenus,
    active_staff: activeStaff,
    tables_by_zone: tablesByZone(tables, vipRooms),
    menus_by_category: menusByCategory,
    bills_by_hour: billsByHour,
    sales_today: salesToday,
    sales_by_hour: salesByHour,
    top_menus: topMenus,
    low_menus: lowMenus,
    low_ingredients: inventory.low_ingredients,
    unpaid_invoices: inventory.unpaid_invoices,
    vip_today: vipToday,
    generated_at: nowDateTime(),
  });
}));

module.exports = router;
