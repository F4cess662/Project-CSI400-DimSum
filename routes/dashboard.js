/**
 * /api/dashboard — ภาพรวมร้านสำหรับผู้จัดการ/เจ้าของร้าน (FR-47, FR-57)
 * GET → { shop, tables, vip_rooms, open_bills, unavailable_menus, active_staff,
 *         tables_by_zone, menus_by_category, bills_by_hour, vip_today, generated_at }
 * tables_by_zone / menus_by_category / bills_by_hour = ข้อมูลกราฟ (Feedback เฟส 1) · vip_today = เฟส 3
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
 * เงื่อนไข "ขายไม่ได้" ใช้ร่วมกันระหว่างรายการเมนูปิดขายกับกราฟตามหมวด: ปิดขาย หรือจำนวนพร้อมขายเหลือ 0
 * available_qty = NULL คือไม่จำกัดจำนวน (COALESCE กันผลเป็น NULL ซึ่งจะทำให้ SUM ไม่นับเมนูนั้น)
 */
const SOLDOUT_SQL = '(m.is_available = 0 OR COALESCE(m.available_qty, 1) = 0)';

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
 * state: 'soldout' = ปิดขายหรือเหลือ 0 · 'low' = ยังขายได้แต่เหลือไม่เกิน 1 ล็อต (เกณฑ์เดียวกับหน้าจำนวนพร้อมขาย) · 'ok'
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
    c.menus.push({ id: r.id, name: r.name, unit: r.unit, available_qty: r.available_qty, lot_size: r.lot_size, state });
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

/** no_show กดได้หลังเลยเวลาเริ่ม 30 นาที (ค่าเดียวกับ NO_SHOW_AFTER_MIN ใน routes/vip_bookings.js ของคนที่ 4) */
const NO_SHOW_AFTER_MIN = 30;

/**
 * P3: การจองห้อง VIP วันนี้ (ทุกสถานะ) สำหรับไทม์ไลน์ + โดนัท + รายการต้องติดตาม
 * → { date, open_hour, close_hour, closed_ranges: [{ from, to }], rooms: [{ id, name }],
 *     bookings: [{ id, vip_room_id, room_name, start_time, end_time, hours, customer_name, customer_phone, guests,
 *                  preorder_total, deposit_amount, deposit_received_at, status, minutes_late }],
 *     by_status: { pending_deposit, confirmed, arrived, no_show, cancelled },
 *     follow_up: [{ booking_id, room_name, start_time, customer_name, customer_phone, guests, status, deposit_amount,
 *                   no_deposit, late, minutes_late, can_no_show }] }   เลยนัดขึ้นก่อน แล้วเรียงตามเวลาเริ่ม
 * minutes_late = เลยเวลาเริ่มมาแล้วกี่นาที (ติดลบ = ยังไม่ถึงเวลา)
 */
async function loadVipToday(vipRooms) {
  const [s, bookings, today] = await Promise.all([
    shopSettings(),
    query(
      `SELECT k.id, k.vip_room_id, v.name AS room_name, k.start_time,
              ADDTIME(k.start_time, SEC_TO_TIME(k.hours * 3600)) AS end_time, k.hours,
              k.customer_name, k.customer_phone, k.guests, k.preorder_total, k.deposit_amount,
              k.deposit_received_at, k.status, k.bill_id,
              TIMESTAMPDIFF(MINUTE, TIMESTAMP(k.booking_date, k.start_time), NOW()) AS minutes_late
       FROM vip_bookings k JOIN vip_rooms v ON v.id = k.vip_room_id
       WHERE k.booking_date = CURDATE()
       ORDER BY k.start_time, v.name`),
    queryOne('SELECT CURDATE() AS d'),
  ]);
  const hourOf = (t) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;
  const byStatus = { pending_deposit: 0, confirmed: 0, arrived: 0, no_show: 0, cancelled: 0 };
  for (const k of bookings) byStatus[k.status]++;

  // 1 การจอง = 1 แถว · late = ถึงเวลาแล้วแต่ยังไม่ได้กด "มาถึง" · no_deposit = ยังไม่รับมัดจำ
  const followUp = bookings
    .map((k) => ({
      booking_id: k.id, room_name: k.room_name, start_time: k.start_time, customer_name: k.customer_name,
      customer_phone: k.customer_phone, guests: k.guests, status: k.status, deposit_amount: k.deposit_amount,
      no_deposit: k.status === 'pending_deposit',
      late: ['pending_deposit', 'confirmed'].includes(k.status) && k.minutes_late > 0,
      minutes_late: Number(k.minutes_late),
      can_no_show: ['pending_deposit', 'confirmed'].includes(k.status) && k.minutes_late >= NO_SHOW_AFTER_MIN,
    }))
    .filter((f) => f.late || f.no_deposit)
    .sort((a, b) => (a.late === b.late ? a.start_time.localeCompare(b.start_time) : a.late ? -1 : 1));

  return {
    date: today.d,
    open_hour: Math.floor(hourOf(s.morning_open)),
    close_hour: Math.ceil(hourOf(s.evening_close > s.morning_close ? s.evening_close : s.morning_close)),
    closed_ranges: s.evening_open > s.morning_close ? [{ from: hourOf(s.morning_close), to: hourOf(s.evening_open) }] : [],
    rooms: vipRooms.items.map((r) => ({ id: r.id, name: r.name })),
    bookings: bookings.map((k) => ({ ...k, minutes_late: Number(k.minutes_late) })),
    by_status: byStatus,
    follow_up: followUp,
  };
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
    menusByCategory, billsByHour] = await Promise.all([
    currentShift(), isOrderOpenNow(), loadTables(), loadVipRooms(),
    loadOpenBills(), loadUnavailableMenus(), loadActiveStaff(),
    loadMenusByCategory(), loadBillsByHour(),
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
    vip_today: vipToday,
    generated_at: nowDateTime(),
  });
}));

module.exports = router;
