/**
 * /api/bills — เปิดโต๊ะ ต่อโต๊ะ QR ยกเลิกโต๊ะ (คนที่ 5 · เฟส 1)
 * GET  ?status=open                                  → บิลที่เปิดอยู่ (FR-20)
 * POST {"action":"open", "table_ids":[13,14], "guests":4}   → เปิดโต๊ะ / ต่อโต๊ะ (FR-06, 07)
 * POST {"action":"open", "vip_room_id":2, "guests":10}      → เปิดห้อง VIP
 * POST {"action":"cancel", "bill_id":5}                     → ยกเลิกโต๊ะที่เปิดผิด (FR-08, manager+)
 */
const crypto = require('crypto');
const router = require('express').Router();
const config = require('../config');
const { query, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { isOpenNow } = require('../lib/shop');

const STAFF_UP = ['staff', 'manager', 'owner'];
const MANAGER_UP = ['manager', 'owner'];

/** ลิงก์ที่ลูกค้าสแกนจาก QR (ใช้ BASE_URL ใน config.js วัน demo เปลี่ยนเป็น IP เครื่อง) */
const qrUrl = (token) => config.baseUrl + '/customer/order.html?token=' + token;

/** วันนี้ของไทยเป็น 'YYYYMMDD' ใช้ทำเลขบิล */
const todayCode = () => new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone }).replace(/-/g, '');

/** แปลงค่าเป็นรายการ id ตัวเลขที่ไม่ซ้ำ */
function toIds(value) {
  const list = Array.isArray(value) ? value : [value];
  const ids = [...new Set(list.map(Number))];
  if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) throw fail('รายการโต๊ะไม่ถูกต้อง', 422);
  return ids;
}

/** สร้าง ?,?,? ตามจำนวนค่า สำหรับ IN (...) */
const marks = (arr) => arr.map(() => '?').join(',');

/* ---------- GET: บิลที่เปิดอยู่ ---------- */
router.get('/', requireLogin, handle(async (req, res) => {
  if (req.query.id) throw fail('ดูรายละเอียดบิลรายใบจะเปิดใช้ในเฟส 2', 400);
  const status = req.query.status || 'open';
  if (status !== 'open') throw fail('ตอนนี้ดูได้เฉพาะบิลที่เปิดอยู่ (status=open)', 400);

  const rows = await query(
    `SELECT b.id, b.bill_no, b.status, b.guests, b.opened_at, b.qr_token,
            b.vip_room_id, v.name AS vip_name, u.full_name AS opened_by_name,
            (SELECT GROUP_CONCAT(t.code ORDER BY t.code SEPARATOR ', ')
               FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id
              WHERE bt.bill_id = b.id) AS table_codes,
            COALESCE(s.total, 0) AS total,
            COALESCE(s.rounds, 0) AS rounds
       FROM bills b
       LEFT JOIN vip_rooms v ON v.id = b.vip_room_id
       LEFT JOIN users u ON u.id = b.opened_by
       LEFT JOIN (
         SELECT o.bill_id,
                COUNT(DISTINCT o.id) AS rounds,
                SUM(CASE WHEN oi.status <> 'cancelled' THEN (oi.qty - oi.cancelled_qty) * oi.unit_price ELSE 0 END) AS total
           FROM orders o
           LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.cancelled_at IS NULL
          GROUP BY o.bill_id
       ) s ON s.bill_id = b.id
      WHERE b.status = 'open'
      ORDER BY b.opened_at`);

  return ok(res, rows.map((b) => ({
    ...b,
    place: b.vip_name || b.table_codes || '-',
    qr_url: qrUrl(b.qr_token),
  })));
}));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'open': return openBill(req, res, b);
    case 'cancel': return cancelBill(req, res, b);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

/** เปิดโต๊ะ: ทุกโต๊ะต้องว่าง และ 1 โต๊ะมีบิลเปิดได้ใบเดียว (BR-26) */
async function openBill(req, res, b) {
  const user = await mustBe(req, STAFF_UP);
  requireFields(b, ['guests']);
  const guests = Number(b.guests);
  if (!Number.isInteger(guests) || guests < 1) throw fail('จำนวนคนต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป', 422);

  const isVip = b.vip_room_id !== undefined && b.vip_room_id !== null && b.vip_room_id !== '';
  if (!isVip && (b.table_ids === undefined || b.table_ids === null || b.table_ids === '')) {
    throw fail('กรุณาเลือกโต๊ะ', 422);
  }
  // TODO: ปิดเช็กเวลาร้านไว้ชั่วคราวเพื่อทดสอบ เปิดกลับก่อนส่งงาน
  // if (!(await isOpenNow())) throw fail('ร้านปิดอยู่ เปิดโต๊ะได้เฉพาะเวลาเปิดร้าน', 409); // BR-01

  const token = crypto.randomBytes(16).toString('hex'); // 32 ตัวอักษร

  const result = await transaction(async (conn) => {
    let places = [];
    let tableIds = [];
    let vipRoomId = null;

    if (isVip) {
      vipRoomId = Number(b.vip_room_id);
      const [[room]] = await conn.execute(
        'SELECT id, name, seats, status, is_active FROM vip_rooms WHERE id = ? FOR UPDATE', [vipRoomId]);
      if (!room || room.is_active !== 1) throw fail('ไม่พบห้อง VIP นี้', 404);
      if (room.status !== 'available') throw fail(`ห้อง ${room.name} มีลูกค้าอยู่แล้ว`, 409);
      if (guests > room.seats) throw fail(`ห้อง ${room.name} รับได้ไม่เกิน ${room.seats} คน`, 422);
      const [[openBillRow]] = await conn.execute(
        "SELECT bill_no FROM bills WHERE vip_room_id = ? AND status = 'open' LIMIT 1", [vipRoomId]);
      if (openBillRow) throw fail(`ห้อง ${room.name} ยังมีบิลเปิดอยู่ (${openBillRow.bill_no})`, 409);
      places = [room.name];
    } else {
      tableIds = toIds(b.table_ids);
      const [tables] = await conn.execute(
        `SELECT id, code, status, is_active FROM dining_tables WHERE id IN (${marks(tableIds)}) FOR UPDATE`, tableIds);
      if (tables.length !== tableIds.length || tables.some((t) => t.is_active !== 1)) {
        throw fail('มีโต๊ะที่ไม่พบหรือปิดใช้งานอยู่', 404);
      }
      const busy = tables.filter((t) => t.status !== 'available');
      if (busy.length) throw fail('โต๊ะ ' + busy.map((t) => t.code).join(', ') + ' มีลูกค้าอยู่แล้ว', 409);
      const [openRows] = await conn.execute(
        `SELECT t.code, bl.bill_no FROM bill_tables bt
           JOIN bills bl ON bl.id = bt.bill_id AND bl.status = 'open'
           JOIN dining_tables t ON t.id = bt.table_id
          WHERE bt.table_id IN (${marks(tableIds)})`, tableIds);
      if (openRows.length) {
        throw fail('โต๊ะ ' + openRows.map((r) => `${r.code} (${r.bill_no})`).join(', ') + ' ยังมีบิลเปิดอยู่', 409);
      }
      places = tables.map((t) => t.code).sort();
    }

    // เลขบิล B+YYYYMMDD-ลำดับ 3 หลัก (นับใหม่ทุกวัน)
    const prefix = 'B' + todayCode() + '-';
    const [[last]] = await conn.execute(
      'SELECT bill_no FROM bills WHERE bill_no LIKE ? ORDER BY bill_no DESC LIMIT 1 FOR UPDATE', [prefix + '%']);
    const seq = last ? Number(last.bill_no.slice(prefix.length)) + 1 : 1;
    const billNo = prefix + String(seq).padStart(3, '0');

    const [ins] = await conn.execute(
      'INSERT INTO bills (bill_no, guests, vip_room_id, qr_token, opened_by) VALUES (?, ?, ?, ?, ?)',
      [billNo, guests, vipRoomId, token, user.id]);
    const billId = ins.insertId;

    if (isVip) {
      await conn.execute("UPDATE vip_rooms SET status = 'occupied' WHERE id = ?", [vipRoomId]);
    } else {
      for (const id of tableIds) {
        await conn.execute('INSERT INTO bill_tables (bill_id, table_id) VALUES (?, ?)', [billId, id]);
      }
      await conn.execute(
        `UPDATE dining_tables SET status = 'occupied' WHERE id IN (${marks(tableIds)})`, tableIds);
    }

    const [[row]] = await conn.execute('SELECT opened_at FROM bills WHERE id = ?', [billId]);
    return { bill_id: billId, bill_no: billNo, opened_at: row.opened_at, places };
  });

  await writeLog(req, 'bill.open', 'bills', result.bill_id,
    { bill_no: result.bill_no, places: result.places, guests });

  return ok(res, {
    bill_id: result.bill_id,
    bill_no: result.bill_no,
    guests,
    opened_at: result.opened_at,
    place: result.places.join(', '),
    qr_token: token,
    qr_url: qrUrl(token),
  }, `เปิด ${result.places.join(', ')} แล้ว`);
}

/** ยกเลิกโต๊ะที่เปิดผิด: เฉพาะบิลที่ยังไม่มีออเดอร์ · โต๊ะกลับเป็นว่าง QR ใช้ไม่ได้ (FR-08) */
async function cancelBill(req, res, b) {
  const user = await mustBe(req, MANAGER_UP);
  requireFields(b, ['bill_id']);
  const billId = Number(b.bill_id);

  const bill = await transaction(async (conn) => {
    const [[row]] = await conn.execute(
      'SELECT id, bill_no, status, vip_room_id FROM bills WHERE id = ? FOR UPDATE', [billId]);
    if (!row) throw fail('ไม่พบบิลนี้', 404);
    if (row.status !== 'open') throw fail(`บิล ${row.bill_no} ไม่ได้เปิดอยู่แล้ว`, 409);

    const [[cnt]] = await conn.execute('SELECT COUNT(*) AS n FROM orders WHERE bill_id = ?', [billId]);
    if (cnt.n > 0) throw fail(`บิล ${row.bill_no} มีออเดอร์แล้ว ยกเลิกโต๊ะไม่ได้ (ใช้ยกเลิกบิลในเฟส 2)`, 409);

    await conn.execute(
      "UPDATE bills SET status = 'cancelled', closed_at = NOW(), closed_by = ? WHERE id = ?", [user.id, billId]);
    await conn.execute(
      `UPDATE dining_tables SET status = 'available'
        WHERE id IN (SELECT table_id FROM bill_tables WHERE bill_id = ?)`, [billId]);
    if (row.vip_room_id) {
      await conn.execute("UPDATE vip_rooms SET status = 'available' WHERE id = ?", [row.vip_room_id]);
    }
    return row;
  });

  await writeLog(req, 'bill.cancel', 'bills', bill.id, { bill_no: bill.bill_no });
  return ok(res, { bill_id: bill.id, bill_no: bill.bill_no }, `ยกเลิกบิล ${bill.bill_no} แล้ว`);
}

module.exports = router;
