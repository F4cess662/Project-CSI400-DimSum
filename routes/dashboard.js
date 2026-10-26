/**
 * /api/dashboard — ภาพรวมร้านสำหรับผู้จัดการ/เจ้าของร้าน (FR-47, FR-57)
 * GET → { shop, tables, vip_rooms, open_bills, unavailable_menus, active_staff, generated_at }
 *
 * ออกแบบให้ขยายตามเฟส: เฟสถัดไปเพิ่ม key ใหม่ในก้อนเดียวกันโดยไม่แก้ key เดิม
 *   P2+: sales_today, low_menus · P3+: vip_today · P4: low_ingredients
 * หน้าเว็บแสดง section ตาม key ที่มี (key ไหนยังไม่มี = ยังไม่ทำ)
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, handle } = require('../lib/response');
const { requireRole } = require('../lib/auth');
const { currentShift, isOrderOpenNow } = require('../lib/shop');
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

/** เมนูที่ปิดขายอยู่ (ไม่รวมเมนูที่ลบแล้ว) */
async function loadUnavailableMenus() {
  return query(
    `SELECT m.id, m.name, m.unit, m.kitchen_zone, m.available_qty, m.image_path, m.updated_at,
            c.name AS category_name
     FROM menu_items m JOIN menu_categories c ON c.id = m.category_id
     WHERE m.is_deleted = 0 AND m.is_available = 0
     ORDER BY c.sort_order, m.name`);
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
  const [shift, orderOpen, tables, vipRooms, openBills, unavailableMenus, activeStaff] = await Promise.all([
    currentShift(), isOrderOpenNow(), loadTables(), loadVipRooms(),
    loadOpenBills(), loadUnavailableMenus(), loadActiveStaff(),
  ]);
  return ok(res, {
    shop: { shift, is_open: shift !== null, is_order_open: orderOpen },
    tables,
    vip_rooms: vipRooms,
    open_bills: openBills,
    unavailable_menus: unavailableMenus,
    active_staff: activeStaff,
    generated_at: nowDateTime(),
  });
}));

module.exports = router;
