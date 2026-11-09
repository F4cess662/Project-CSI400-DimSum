/**
 * /api/public — หน้าสั่งอาหารของลูกค้าผ่าน QR (ไม่ต้องล็อกอิน ใช้ token ของบิล)
 * GET ?action=menu&token=xxx
 *     → { bill: {bill_no, place, guests, is_vip}, order_open, closed_message, max_qty, menus: [...] } (FR-09)
 *       sale_status: 'available' สั่งได้ · 'slow' หมดชั่วคราว (จำนวน 0) ยังสั่งได้ รอนานขึ้น 5–10 นาที
 *                    · 'closed' เชฟ/ผู้จัดการปิดขาย = "หมด" สั่งไม่ได้ (is_sold_out = 1)
 * GET ?action=bill_status&token=xxx
 *     → { bill_no, place, total, pending_items, orders: [{round_no, source, created_at, cancelled_at, can_cancel, total,
 *         items: [{name, unit, qty, cancelled_qty, unit_price, amount, status, cancel_reason, cancel_note}] }] } (FR-12, 18)
 * token = qr_token ของบิล · บิลที่ไม่ open (จ่ายแล้ว/ยกเลิก) ใช้ token เดิมไม่ได้ (FR-29)
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, handle } = require('../lib/response');
const { shopSettings, isOrderOpenNow, closedMessage } = require('../lib/shop');

/** สถานะขายของเมนู ใช้ตรงกันทุกหน้า (ต้องมี alias m = menu_items) */
const SALE_STATUS_SQL = `CASE WHEN m.is_available = 0 THEN 'closed'
  WHEN m.available_qty IS NOT NULL AND m.available_qty <= 0 THEN 'slow' ELSE 'available' END`;
const LINE_TOTAL ="CASE WHEN oi.status <> 'cancelled' THEN (oi.qty - oi.cancelled_qty) * oi.unit_price ELSE 0 END";
const PLACE_SQL = `COALESCE(v.name,
  (SELECT GROUP_CONCAT(t.code ORDER BY t.code SEPARATOR ', ')
     FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id WHERE bt.bill_id = b.id), '-')`;

/** หาบิลที่เปิดอยู่จาก token · ใช้ร่วมกับ routes/orders.js */
async function openBillByToken(token) {
  token = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) throw fail('QR ไม่ถูกต้อง กรุณาสแกน QR ที่โต๊ะอีกครั้ง', 400);
  const bill = await queryOne(
    `SELECT b.id, b.bill_no, b.status, b.guests, b.vip_room_id, ${PLACE_SQL} AS place
       FROM bills b LEFT JOIN vip_rooms v ON v.id = b.vip_room_id
      WHERE b.qr_token = ?`, [token]);
  if (!bill) throw fail('ไม่พบบิลของ QR นี้ กรุณาติดต่อพนักงาน', 404);
  if (bill.status !== 'open') throw fail('บิลนี้ปิดแล้ว QR ใช้สั่งอาหารไม่ได้ ขอบคุณที่ใช้บริการ', 410);
  return bill;
}

/** ยังรับออเดอร์ได้ไหม (FR-14) */
async function orderOpen() {
  // TODO: ปิดเช็กเวลาปิดรับออเดอร์ไว้ชั่วคราวเพื่อทดสอบ เปิดกลับก่อนส่งโปรเจกต์เฟส 4
  // if (!(await isOrderOpenNow())) return { open: false, message: await closedMessage() };
  void isOrderOpenNow; void closedMessage;
  return { open: true, message: null };
}

router.get('/', handle(async (req, res) => {
  switch (req.query.action) {
    case 'menu': return menu(req, res);
    case 'bill_status': return billStatus(req, res);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

async function menu(req, res) {
  const bill = await openBillByToken(req.query.token);
  const [settings, open] = await Promise.all([shopSettings(), orderOpen()]);
  const menus = await query(
    `SELECT m.id, m.name, m.description, m.price, m.unit, m.image_path, m.kitchen_zone,
            ${SALE_STATUS_SQL} AS sale_status, (m.is_available = 0) AS is_sold_out,
            c.id AS category_id, c.name AS category_name
       FROM menu_items m JOIN menu_categories c ON c.id = m.category_id
      WHERE m.is_deleted = 0 AND c.is_active = 1
      ORDER BY c.sort_order, m.id`);
  return ok(res, {
    bill: { bill_no: bill.bill_no, place: bill.place, guests: bill.guests, is_vip: !!bill.vip_room_id },
    order_open: open.open,
    closed_message: open.message,
    max_qty: settings.max_qty_per_item,
    menus: menus.map((m) => ({ ...m, price: Number(m.price), is_sold_out: Number(m.is_sold_out) })),
  });
}

async function billStatus(req, res) {
  const bill = await openBillByToken(req.query.token);
  const orders = await query(
    'SELECT id, round_no, source, created_at, cancelled_at FROM orders WHERE bill_id = ? ORDER BY round_no', [bill.id]);
  const items = orders.length ? await query(
    `SELECT oi.order_id, m.name, m.unit, oi.qty, oi.cancelled_qty, oi.unit_price, oi.status,
            oi.cancel_reason, oi.cancel_note, ${LINE_TOTAL} AS amount
       FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
      WHERE oi.order_id IN (${orders.map(() => '?').join(',')}) ORDER BY oi.id`, orders.map((o) => o.id)) : [];

  let total = 0;
  let pending = 0;
  const rounds = orders.map((o) => {
    const list = items.filter((it) => it.order_id === o.id)
      .map(({ order_id, ...it }) => ({ ...it, unit_price: Number(it.unit_price), amount: Number(it.amount) }));
    const sum = o.cancelled_at ? 0 : list.reduce((a, it) => a + it.amount, 0);
    if (!o.cancelled_at) {
      total += sum;
      pending += list.filter((it) => ['waiting', 'cooking', 'ready'].includes(it.status)).length;
    }
    return {
      id: o.id, round_no: o.round_no, source: o.source, created_at: o.created_at, cancelled_at: o.cancelled_at,
      can_cancel: !o.cancelled_at && list.length > 0 && list.every((it) => it.status === 'waiting'), // BR-07
      total: sum, items: list,
    };
  });
  return ok(res, { bill_no: bill.bill_no, place: bill.place, total, pending_items: pending, orders: rounds });
}

router.openBillByToken = openBillByToken;
router.orderOpen = orderOpen;
router.SALE_STATUS_SQL = SALE_STATUS_SQL;
module.exports = router;
