/**
 * /api/orders — ส่งออเดอร์เข้าครัว
 * POST {"action":"create", "token":"<qr_token>", "items":[{"menu_item_id":3, "qty":2}]}
 *      → ลูกค้าสั่งผ่าน QR (ไม่ต้องล็อกอิน) ได้ออเดอร์รอบถัดไป { order_id, round_no, place, total, items } (FR-10, 11, 14)
 * POST {"action":"create_by_staff", "bill_id":5, "items":[...]}
 *      → พนักงานสั่งแทนลูกค้า บันทึก created_by (FR-52) · staff, manager, owner
 * POST {"action":"cancel", "token":"<qr_token>", "order_id":12}
 *      → ลูกค้ายกเลิกทั้งรอบ ได้เฉพาะเมื่อทุกรายการยังรอทำ (BR-07) · คืนจำนวนพร้อมขาย (FR-13)
 *
 * เช็กตอนสั่ง: บิล open · ยังไม่ปิดรับออเดอร์ · ไม่เกิน max_qty_per_item ต่อเมนูต่อรอบ (BR-06)
 *             เมนูยังเปิดขาย (is_available = 1) · ปิดขายแล้ว = "หมด" สั่งไม่ได้
 * จำนวนพร้อมขายเหลือ 0 = "หมดชั่วคราว" ยังสั่งได้ แค่รอนานขึ้น 5–10 นาที (ครัวเห็นออเดอร์ที่จอครัวตามปกติ)
 * ตัดจำนวนพร้อมขายเท่าที่มี ไม่ต่ำกว่า 0 · บันทึกที่ตัดจริงใน order_items.stock_taken ไว้คืนตอนลูกค้ายกเลิก
 * ราคาเก็บตามตอนสั่ง (unit_price) · รายการเริ่มที่ waiting ให้จอครัวเห็น
 */
const router = require('express').Router();
const { transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { shopSettings } = require('../lib/shop');
const { openBillByToken, orderOpen } = require('./public');

const PLACE_SQL = `COALESCE(v.name,
  (SELECT GROUP_CONCAT(t.code ORDER BY t.code SEPARATOR ', ')
     FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id WHERE bt.bill_id = b.id), '-')`;

router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': {
      requireFields(b, ['token', 'items']);
      const bill = await openBillByToken(b.token);
      const result = await createOrder(req, bill.id, b.items, 'qr', null);
      return ok(res, result, `สั่งอาหารรอบที่ ${result.round_no} แล้ว`);
    }
    case 'create_by_staff': {
      const user = await mustBe(req, ['staff', 'manager', 'owner']);
      requireFields(b, ['bill_id', 'items']);
      const result = await createOrder(req, Number(b.bill_id), b.items, 'staff', user.id);
      return ok(res, result, `ส่งออเดอร์ ${result.place} รอบที่ ${result.round_no} แล้ว`
        + (result.slow_items.length ? ` · ${result.slow_items.join(', ')} หมดชั่วคราว รอนานขึ้น 5–10 นาที` : ''));
    }
    case 'cancel': return cancelOrder(req, res, b);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

/** รวมรายการซ้ำ + เช็กจำนวน → [{ menu_item_id, qty }] */
function cleanItems(items, maxQty) {
  if (!Array.isArray(items) || !items.length) throw fail('ยังไม่ได้เลือกเมนู', 422);
  const merged = new Map();
  for (const it of items) {
    const id = Number(it && it.menu_item_id);
    const qty = Number(it && it.qty);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty <= 0) throw fail('รายการอาหารไม่ถูกต้อง', 422);
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  for (const qty of merged.values()) {
    if (qty > maxQty) throw fail(`สั่งได้ไม่เกิน ${maxQty} ต่อเมนูต่อรอบ`, 422); // BR-06
  }
  return [...merged].map(([menu_item_id, qty]) => ({ menu_item_id, qty }));
}

async function createOrder(req, billId, rawItems, source, userId) {
  if (!Number.isInteger(billId) || billId <= 0) throw fail('เลขบิลไม่ถูกต้อง', 422);
  const open = await orderOpen();
  if (!open.open) throw fail(open.message, 409); // FR-14
  const settings = await shopSettings();
  const items = cleanItems(rawItems, settings.max_qty_per_item);

  const result = await transaction(async (conn) => {
    // ล็อกบิลไว้ กันสองเครื่องสั่งพร้อมกันแล้วได้เลขรอบซ้ำ
    const [[bill]] = await conn.execute(
      `SELECT b.id, b.bill_no, b.status, ${PLACE_SQL} AS place
         FROM bills b LEFT JOIN vip_rooms v ON v.id = b.vip_room_id WHERE b.id = ? FOR UPDATE`, [billId]);
    if (!bill) throw fail('ไม่พบบิลนี้', 404);
    if (bill.status !== 'open') throw fail('บิลนี้ปิดแล้ว สั่งอาหารเพิ่มไม่ได้', 409);

    const ids = items.map((it) => it.menu_item_id);
    const [menus] = await conn.execute(
      `SELECT id, name, unit, price, available_qty, is_available, is_deleted
         FROM menu_items WHERE id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`, ids);
    const lines = items.map((it) => {
      const m = menus.find((x) => x.id === it.menu_item_id);
      if (!m || m.is_deleted) throw fail('มีเมนูที่ไม่มีในระบบแล้ว กรุณาโหลดหน้าใหม่', 409);
      if (!m.is_available) throw fail(`${m.name} หมดแล้ว กรุณาเอาออกจากตะกร้า`, 409);
      // ตัดได้เท่าที่เหลือ ส่วนที่เกินคือสั่งตอนหมดชั่วคราว (ครัวนึ่งเพิ่ม)
      const taken = m.available_qty === null ? 0 : Math.min(it.qty, Math.max(0, m.available_qty));
      return { ...it, name: m.name, unit: m.unit, unit_price: Number(m.price), taken, slow: m.available_qty !== null && taken < it.qty };
    });

    const [[{ next }]] = await conn.execute(
      'SELECT COALESCE(MAX(round_no), 0) + 1 AS next FROM orders WHERE bill_id = ?', [bill.id]);
    const [o] = await conn.execute(
      'INSERT INTO orders (bill_id, round_no, source, created_by) VALUES (?, ?, ?, ?)', [bill.id, next, source, userId]);
    for (const l of lines) {
      await conn.execute(
        'INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, stock_taken) VALUES (?, ?, ?, ?, ?)',
        [o.insertId, l.menu_item_id, l.qty, l.unit_price, l.taken]);
      if (l.taken) await conn.execute('UPDATE menu_items SET available_qty = available_qty - ? WHERE id = ?', [l.taken, l.menu_item_id]);
    }
    const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
    return {
      order_id: o.insertId, bill_id: bill.id, bill_no: bill.bill_no, place: bill.place, round_no: next, total,
      slow_items: lines.filter((l) => l.slow).map((l) => l.name), // เมนูที่สั่งตอนหมดชั่วคราว รอนานขึ้น
      items: lines.map(({ taken, slow, ...l }) => l),
    };
  });

  await writeLog(req, 'order.create', 'bills', result.bill_id, {
    bill_no: result.bill_no, round_no: result.round_no, source, total: result.total,
    items: result.items.map((l) => `${l.name} x${l.qty}`),
  });
  return result;
}

async function cancelOrder(req, res, b) {
  requireFields(b, ['token', 'order_id']);
  const bill = await openBillByToken(b.token);
  const orderId = Number(b.order_id);

  const result = await transaction(async (conn) => {
    const [[order]] = await conn.execute(
      'SELECT id, round_no, cancelled_at FROM orders WHERE id = ? AND bill_id = ? FOR UPDATE', [orderId, bill.id]);
    if (!order) throw fail('ไม่พบออเดอร์นี้', 404);
    if (order.cancelled_at) throw fail('ออเดอร์นี้ยกเลิกไปแล้ว', 409);
    const [items] = await conn.execute(
      `SELECT oi.id, oi.menu_item_id, oi.qty, oi.stock_taken, oi.status, m.available_qty
         FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id WHERE oi.order_id = ? FOR UPDATE`, [order.id]);
    if (items.some((it) => it.status !== 'waiting')) {
      throw fail('ครัวเริ่มทำบางรายการแล้ว ยกเลิกไม่ได้ กรุณาแจ้งพนักงาน', 409); // BR-07
    }
    await conn.execute('UPDATE orders SET cancelled_at = NOW() WHERE id = ?', [order.id]);
    await conn.execute(
      "UPDATE order_items SET status = 'cancelled', cancel_reason = 'customer' WHERE order_id = ?", [order.id]);
    // คืนเฉพาะที่ตัดไปจริง (ส่วนที่สั่งตอนหมดชั่วคราวไม่ได้ตัด จึงไม่คืน)
    for (const it of items) {
      if (it.available_qty !== null && it.stock_taken > 0) {
        await conn.execute('UPDATE menu_items SET available_qty = available_qty + ? WHERE id = ?', [it.stock_taken, it.menu_item_id]);
      }
    }
    return { order_id: order.id, round_no: order.round_no };
  });

  await writeLog(req, 'order.cancel', 'bills', bill.id, { bill_no: bill.bill_no, round_no: result.round_no, by: 'customer' });
  return ok(res, result, `ยกเลิกออเดอร์รอบที่ ${result.round_no} แล้ว`);
}

module.exports = router;
