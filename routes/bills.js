/**
 * /api/bills — เปิดโต๊ะ ต่อโต๊ะ QR ยกเลิกโต๊ะ ย้ายโต๊ะ ดูบิล void ค้นบิล (คนที่ 5 · เฟส 1–2)
 * GET  ?status=open                                  → บิลที่เปิดอยู่ (FR-20)
 * GET  ?id=5                                         → บิลเดียว + ออเดอร์ทุกรอบ + สถานะรายการ + ประวัติ (FR-20, 25)
 * GET  ?action=search&date=2026-11-04&table_id=3&time_from=10:00&time_to=14:00&status=paid&q=B2026
 *                                                    → ค้นบิลย้อนหลัง (FR-53, manager+)
 * POST {"action":"open", "table_ids":[13,14], "guests":4}   → เปิดโต๊ะ / ต่อโต๊ะ (FR-06, 07)
 * POST {"action":"open", "vip_room_id":2, "guests":10}      → เปิดห้อง VIP
 * POST {"action":"cancel", "bill_id":5}                     → ยกเลิกโต๊ะที่เปิดผิด (FR-08, manager+)
 * POST {"action":"move", "bill_id":5, "to_table_ids":[9]}   → ย้ายโต๊ะ เมื่อยังไม่สั่งอาหาร (Feedback เฟส 1, staff+)
 * POST {"action":"void", "bill_id":5, "reason":"..."}       → ยกเลิกบิลที่มีออเดอร์หรือจ่ายแล้ว (FR-30, BR-11, manager+)
 */
const crypto = require('crypto');
const router = require('express').Router();
const config = require('../config');
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { isOpenNow } = require('../lib/shop');

const STAFF_UP = ['staff', 'manager', 'owner'];
const MANAGER_UP = ['manager', 'owner'];

/** ลิงก์ที่ลูกค้าสแกนจาก QR (ใช้ BASE_URL ใน config.js วัน demo เปลี่ยนเป็น IP เครื่อง) */
const qrUrl = (token) => config.baseUrl + '/customer/menu.html?token=' + token;

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

/** ยอดของรายการ: (สั่ง - ยกเลิกบางส่วน) × ราคาตอนสั่ง · รายการที่ยกเลิกทั้งหมดไม่นับ (ราคารวม VAT แล้ว) */
const LINE_TOTAL = "CASE WHEN oi.status <> 'cancelled' THEN (oi.qty - oi.cancelled_qty) * oi.unit_price ELSE 0 END";

/** ชื่อที่แสดงของบิล: ชื่อห้อง VIP หรือรหัสโต๊ะ (ต้อง LEFT JOIN vip_rooms v) */
const PLACE_SQL = `COALESCE(v.name,
  (SELECT GROUP_CONCAT(t.code ORDER BY t.code SEPARATOR ', ')
     FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id WHERE bt.bill_id = b.id), '-')`;

/** แปลง detail ของ log (เก็บเป็น JSON text) */
function parseDetail(text) {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

/* ---------- GET ---------- */
router.get('/', requireLogin, handle(async (req, res) => {
  if (req.query.action === 'search') return searchBills(req, res);
  if (req.query.id) return billDetail(req, res, Number(req.query.id));
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
    case 'move': return moveBill(req, res, b);
    case 'void': return voidBill(req, res, b);
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
  // TODO: ปิดเช็กเวลาร้านไว้ชั่วคราวเพื่อทดสอบ เปิดกลับก่อนส่งโปรเจกต์เฟส 4
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
    if (cnt.n > 0) throw fail(`บิล ${row.bill_no} มีออเดอร์แล้ว ยกเลิกโต๊ะไม่ได้ (ใช้ "ยกเลิกบิล" ในหน้าค้นบิลแทน)`, 409);

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

/**
 * ย้ายโต๊ะ: ย้าย "บิล" ไปผูกกับโต๊ะว่างชุดใหม่ (เลขบิล เวลาเปิด และ QR เดิมใช้ต่อได้)
 * ได้เฉพาะบิลโต๊ะปกติที่ยังเปิดอยู่และยังไม่มีออเดอร์ · ที่นั่งรวมของโต๊ะใหม่ต้องพอกับจำนวนคน
 */
async function moveBill(req, res, b) {
  await mustBe(req, STAFF_UP);
  requireFields(b, ['bill_id', 'to_table_ids']);
  const billId = Number(b.bill_id);
  const targetIds = toIds(b.to_table_ids);

  const result = await transaction(async (conn) => {
    const [[bill]] = await conn.execute(
      'SELECT id, bill_no, status, guests, vip_room_id FROM bills WHERE id = ? FOR UPDATE', [billId]);
    if (!bill) throw fail('ไม่พบบิลนี้', 404);
    if (bill.status !== 'open') throw fail(`บิล ${bill.bill_no} ไม่ได้เปิดอยู่`, 409);
    if (bill.vip_room_id) throw fail('บิลห้อง VIP ย้ายโต๊ะไม่ได้', 422);

    const [[cnt]] = await conn.execute('SELECT COUNT(*) AS n FROM orders WHERE bill_id = ?', [billId]);
    if (cnt.n > 0) throw fail(`บิล ${bill.bill_no} สั่งอาหารแล้ว ย้ายโต๊ะไม่ได้`, 409);

    const [fromRows] = await conn.execute(
      `SELECT t.id, t.code FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id
        WHERE bt.bill_id = ? ORDER BY t.code FOR UPDATE`, [billId]);
    const fromIds = fromRows.map((t) => t.id);
    if (targetIds.every((id) => fromIds.includes(id)) && targetIds.length === fromIds.length) {
      throw fail('เลือกโต๊ะใหม่ที่ไม่ใช่โต๊ะเดิม', 422);
    }

    // โต๊ะปลายทางที่ยังไม่ใช่ของบิลนี้ ต้องว่างและใช้งานอยู่
    const newIds = targetIds.filter((id) => !fromIds.includes(id));
    const [targets] = await conn.execute(
      `SELECT id, code, seats, status, is_active FROM dining_tables WHERE id IN (${marks(targetIds)}) FOR UPDATE`, targetIds);
    if (targets.length !== targetIds.length || targets.some((t) => t.is_active !== 1)) {
      throw fail('มีโต๊ะที่ไม่พบหรือปิดใช้งานอยู่', 404);
    }
    const busy = targets.filter((t) => newIds.includes(t.id) && t.status !== 'available');
    if (busy.length) throw fail('โต๊ะ ' + busy.map((t) => t.code).join(', ') + ' มีลูกค้าอยู่แล้ว', 409);

    const seats = targets.reduce((sum, t) => sum + t.seats, 0);
    if (seats < bill.guests) {
      throw fail(`ลูกค้า ${bill.guests} คน แต่โต๊ะที่เลือกนั่งได้ ${seats} ที่ เลือกโต๊ะเพิ่ม`, 422);
    }

    // ปล่อยโต๊ะเดิม → ผูกโต๊ะใหม่
    const freed = fromIds.filter((id) => !targetIds.includes(id));
    await conn.execute('DELETE FROM bill_tables WHERE bill_id = ?', [billId]);
    if (freed.length) {
      await conn.execute(`UPDATE dining_tables SET status = 'available' WHERE id IN (${marks(freed)})`, freed);
    }
    for (const id of targetIds) {
      await conn.execute('INSERT INTO bill_tables (bill_id, table_id) VALUES (?, ?)', [billId, id]);
    }
    await conn.execute(`UPDATE dining_tables SET status = 'occupied' WHERE id IN (${marks(targetIds)})`, targetIds);

    return {
      bill,
      from: fromRows.map((t) => t.code),
      to: targets.map((t) => t.code).sort(),
    };
  });

  await writeLog(req, 'bill.move', 'bills', result.bill.id,
    { bill_no: result.bill.bill_no, from: result.from, to: result.to });
  return ok(res, { bill_id: result.bill.id, bill_no: result.bill.bill_no, from: result.from, to: result.to },
    `ย้าย ${result.from.join(', ')} → ${result.to.join(', ')} แล้ว`);
}

/* ================= เฟส 2 ================= */

/** บิลเดียว + ออเดอร์ทุกรอบ + สถานะรายการ + ประวัติ (เปิด ย้าย จ่าย void) — พนักงานทุกบทบาท */
async function billDetail(req, res, id) {
  if (!Number.isInteger(id) || id <= 0) throw fail('เลขบิลไม่ถูกต้อง', 422);
  const bill = await queryOne(
    `SELECT b.*, ${PLACE_SQL} AS place, v.name AS vip_name,
            uo.full_name AS opened_by_name, uc.full_name AS closed_by_name
       FROM bills b
       LEFT JOIN vip_rooms v ON v.id = b.vip_room_id
       LEFT JOIN users uo ON uo.id = b.opened_by
       LEFT JOIN users uc ON uc.id = b.closed_by
      WHERE b.id = ?`, [id]);
  if (!bill) throw fail('ไม่พบบิลนี้', 404);

  const tables = await query(
    `SELECT t.id, t.code, t.seats FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id
      WHERE bt.bill_id = ? ORDER BY t.code`, [id]);

  const orders = await query(
    `SELECT o.id, o.round_no, o.source, o.created_at, o.cancelled_at, u.full_name AS created_by_name
       FROM orders o LEFT JOIN users u ON u.id = o.created_by
      WHERE o.bill_id = ? ORDER BY o.round_no`, [id]);

  const items = orders.length ? await query(
    `SELECT oi.id, oi.order_id, oi.menu_item_id, m.name, m.unit, m.kitchen_zone,
            oi.qty, oi.cancelled_qty, oi.unit_price, oi.status, oi.cancel_reason, oi.cancel_note,
            oi.updated_at, ${LINE_TOTAL} AS amount
       FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
      WHERE oi.order_id IN (${marks(orders)}) ORDER BY oi.id`, orders.map((o) => o.id)) : [];

  let total = 0;
  let pending = 0;
  const rounds = orders.map((o) => {
    const list = items.filter((it) => it.order_id === o.id).map((it) => ({ ...it, amount: Number(it.amount) }));
    const sum = o.cancelled_at ? 0 : list.reduce((a, it) => a + it.amount, 0);
    if (!o.cancelled_at) {
      total += sum;
      pending += list.filter((it) => ['waiting', 'cooking', 'ready'].includes(it.status)).length;
    }
    return { ...o, total: sum, items: list };
  });

  const logs = await query(
    `SELECT l.action, l.detail, l.created_at, u.full_name AS user_name
       FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.target_type = 'bills' AND l.target_id = ? ORDER BY l.id`, [id]);
  const history = logs.map((l) => ({ ...l, detail: parseDetail(l.detail) }));
  const voidLog = [...history].reverse().find((l) => l.action === 'bill.void');

  return ok(res, {
    ...bill,
    qr_url: bill.status === 'open' ? qrUrl(bill.qr_token) : null,
    tables,
    orders: rounds,
    total,
    pending_items: pending,
    void_reason: voidLog && voidLog.detail ? voidLog.detail.reason : null,
    history,
  });
}

/** ค้นบิลย้อนหลัง: วันที่ โต๊ะ ช่วงเวลาเปิดบิล สถานะ เลขบิล (FR-53, manager+) */
async function searchBills(req, res) {
  await mustBe(req, MANAGER_UP);
  const q = req.query;
  const date = q.date || new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('วันที่ไม่ถูกต้อง (YYYY-MM-DD)', 422);

  const where = ['DATE(b.opened_at) = ?'];
  const params = [date];
  const time = (v) => {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) throw fail('เวลาไม่ถูกต้อง (HH:MM)', 422);
    return v.length === 5 ? v + ':00' : v;
  };
  if (q.time_from) { where.push('TIME(b.opened_at) >= ?'); params.push(time(q.time_from)); }
  if (q.time_to) { where.push('TIME(b.opened_at) <= ?'); params.push(time(q.time_to)); }
  if (q.table_id) {
    where.push('EXISTS (SELECT 1 FROM bill_tables x WHERE x.bill_id = b.id AND x.table_id = ?)');
    params.push(Number(q.table_id));
  }
  if (q.vip_room_id) { where.push('b.vip_room_id = ?'); params.push(Number(q.vip_room_id)); }
  if (q.status) {
    if (!['open', 'paid', 'cancelled'].includes(q.status)) throw fail('สถานะไม่ถูกต้อง', 422);
    where.push('b.status = ?'); params.push(q.status);
  }
  if (q.q) { where.push('b.bill_no LIKE ?'); params.push('%' + String(q.q).trim() + '%'); }

  const rows = await query(
    `SELECT b.id, b.bill_no, b.status, b.guests, b.opened_at, b.closed_at, b.payment_method, b.total_paid,
            b.vip_room_id, ${PLACE_SQL} AS place,
            uo.full_name AS opened_by_name, uc.full_name AS closed_by_name,
            COALESCE(s.total, 0) AS total, COALESCE(s.rounds, 0) AS rounds,
            COALESCE(s.qr_rounds, 0) AS qr_rounds, s.staff_names,
            (SELECT l.detail FROM activity_logs l
              WHERE l.action = 'bill.void' AND l.target_type = 'bills' AND l.target_id = b.id
              ORDER BY l.id DESC LIMIT 1) AS void_detail
       FROM bills b
       LEFT JOIN vip_rooms v ON v.id = b.vip_room_id
       LEFT JOIN users uo ON uo.id = b.opened_by
       LEFT JOIN users uc ON uc.id = b.closed_by
       LEFT JOIN (
         SELECT o.bill_id, COUNT(*) AS rounds,
                SUM(o.source = 'qr') AS qr_rounds,
                GROUP_CONCAT(DISTINCT u.full_name ORDER BY u.full_name SEPARATOR ', ') AS staff_names,
                SUM((SELECT COALESCE(SUM(${LINE_TOTAL}), 0) FROM order_items oi WHERE oi.order_id = o.id)) AS total
           FROM orders o LEFT JOIN users u ON u.id = o.created_by
          WHERE o.cancelled_at IS NULL
          GROUP BY o.bill_id
       ) s ON s.bill_id = b.id
      WHERE ${where.join(' AND ')}
      ORDER BY b.opened_at DESC
      LIMIT 500`, params);

  return ok(res, rows.map(({ void_detail, ...r }) => {
    const d = parseDetail(void_detail);
    return {
      ...r,
      total: Number(r.total),
      rounds: Number(r.rounds),
      qr_rounds: Number(r.qr_rounds),
      void_reason: d ? d.reason : null,
    };
  }));
}

/**
 * ยกเลิกบิล (void): บิลที่มีออเดอร์แล้ว หรือจ่ายแล้ว · ต้องมีเหตุผล เก็บใน log (FR-30, BR-11, manager+)
 * - บิลที่ยังเปิด: โต๊ะ/ห้องกลับเป็นว่าง QR ใช้ไม่ได้ · รายการที่ครัวยังไม่เสิร์ฟถูกยกเลิก (ไม่ขึ้นจอครัวต่อ)
 * - บิลที่จ่ายแล้ว: เปลี่ยนเป็น cancelled ไม่นับในยอดขาย (ข้อมูลเดิมยังเก็บไว้ดูย้อนหลัง)
 */
async function voidBill(req, res, b) {
  const user = await mustBe(req, MANAGER_UP);
  requireFields(b, ['bill_id', 'reason']);
  const billId = Number(b.bill_id);
  const reason = String(b.reason).trim();
  if (reason.length < 3) throw fail('กรุณากรอกเหตุผลการยกเลิกบิล', 422);
  if (reason.length > 255) throw fail('เหตุผลยาวเกิน 255 ตัวอักษร', 422);

  const result = await transaction(async (conn) => {
    const [[bill]] = await conn.execute(
      'SELECT id, bill_no, status, vip_room_id, total_paid FROM bills WHERE id = ? FOR UPDATE', [billId]);
    if (!bill) throw fail('ไม่พบบิลนี้', 404);
    if (bill.status === 'cancelled') throw fail(`บิล ${bill.bill_no} ถูกยกเลิกไปแล้ว`, 409);

    const [[cnt]] = await conn.execute('SELECT COUNT(*) AS n FROM orders WHERE bill_id = ?', [billId]);
    if (bill.status === 'open' && cnt.n === 0) {
      throw fail(`บิล ${bill.bill_no} ยังไม่มีออเดอร์ ใช้ "ยกเลิกโต๊ะ" ที่ผังโต๊ะแทน`, 409);
    }

    const [[sum]] = await conn.execute(
      `SELECT COALESCE(SUM(${LINE_TOTAL}), 0) AS total FROM order_items oi
         JOIN orders o ON o.id = oi.order_id WHERE o.bill_id = ? AND o.cancelled_at IS NULL`, [billId]);

    // รายการที่ครัวยังทำไม่เสร็จ → ยกเลิก จะได้ไม่ค้างบนจอครัว
    const [upd] = await conn.execute(
      `UPDATE order_items oi JOIN orders o ON o.id = oi.order_id
          SET oi.status = 'cancelled', oi.cancel_reason = 'other', oi.cancel_note = 'ยกเลิกทั้งบิล', oi.updated_by = ?
        WHERE o.bill_id = ? AND oi.status IN ('waiting', 'cooking', 'ready')`, [user.id, billId]);

    if (bill.status === 'open') {
      await conn.execute(
        "UPDATE bills SET status = 'cancelled', closed_at = NOW(), closed_by = ? WHERE id = ?", [user.id, billId]);
      await conn.execute(
        `UPDATE dining_tables SET status = 'available'
          WHERE id IN (SELECT table_id FROM bill_tables WHERE bill_id = ?)`, [billId]);
      if (bill.vip_room_id) {
        await conn.execute("UPDATE vip_rooms SET status = 'available' WHERE id = ?", [bill.vip_room_id]);
      }
    } else {
      // จ่ายแล้ว: เก็บผู้รับเงินและเวลาจ่ายเดิมไว้ ผู้ void ดูจาก log
      await conn.execute("UPDATE bills SET status = 'cancelled' WHERE id = ?", [billId]);
    }

    return { bill, total: Number(sum.total), cancelledItems: upd.affectedRows };
  });

  await writeLog(req, 'bill.void', 'bills', result.bill.id, {
    bill_no: result.bill.bill_no,
    reason,
    previous_status: result.bill.status,
    total: result.bill.status === 'paid' ? Number(result.bill.total_paid) : result.total,
    cancelled_items: result.cancelledItems,
  });
  return ok(res, { bill_id: result.bill.id, bill_no: result.bill.bill_no, previous_status: result.bill.status },
    `ยกเลิกบิล ${result.bill.bill_no} แล้ว`);
}

module.exports = router;
