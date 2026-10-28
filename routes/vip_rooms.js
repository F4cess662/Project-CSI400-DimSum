/**
 * /api/vip_rooms — ห้อง VIP (คนที่ 4 · เฟส 1)
 * GET  [?include_inactive=1]   → ห้อง VIP + สถานะ + บิลที่เปิดอยู่ (รูปแบบเดียวกับ /api/tables)  · พนักงาน
 * POST {"action":"create","name":"VIP 7","seats":15}      (owner)
 * POST {"action":"update","id":1,"name":"VIP 1","seats":12} (owner)
 * POST {"action":"deactivate","id":1}  → ห้องที่มีลูกค้า/มีการจองรออยู่ปิดไม่ได้ (owner)
 * POST {"action":"activate","id":1}    (owner)
 * ห้องขนาดเดียว: seats ไม่เกิน 15 (BR-13)
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const MAX_SEATS = 15; // BR-13

function cleanName(value) {
  const name = String(value || '').trim();
  if (!name) throw fail('กรุณากรอกชื่อห้อง', 422);
  if (name.length > 50) throw fail('ชื่อห้องยาวไม่เกิน 50 ตัวอักษร', 422);
  return name;
}

function cleanSeats(value) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isInteger(n) || n < 1) throw fail('จำนวนที่นั่งต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 422);
  if (n > MAX_SEATS) throw fail('ห้อง VIP รับได้ไม่เกิน ' + MAX_SEATS + ' ที่นั่ง', 422);
  return n;
}

/* ---------- GET ---------- */
router.get('/', requireLogin, handle(async (req, res) => {
  const all = req.query.include_inactive === '1';
  const rooms = await query(
    `SELECT id, name, seats, status, is_active FROM vip_rooms ${all ? '' : 'WHERE is_active = 1'} ORDER BY name`);

  const bills = new Map();
  if (rooms.length) {
    const rows = await query(
      `SELECT b.vip_room_id, b.id, b.bill_no, b.qr_token, b.opened_at, b.guests,
              COALESCE(s.total, 0) AS total
         FROM bills b
         LEFT JOIN (
           SELECT o.bill_id,
                  SUM(CASE WHEN oi.status <> 'cancelled' THEN (oi.qty - oi.cancelled_qty) * oi.unit_price ELSE 0 END) AS total
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.cancelled_at IS NULL
            GROUP BY o.bill_id
         ) s ON s.bill_id = b.id
        WHERE b.status = 'open' AND b.vip_room_id IS NOT NULL
        ORDER BY b.opened_at`);
    for (const r of rows) {
      bills.set(r.vip_room_id, {
        id: r.id, bill_no: r.bill_no, qr_token: r.qr_token,
        opened_at: r.opened_at, guests: r.guests, total: Number(r.total),
      });
    }
  }

  // รูปแบบเดียวกับโต๊ะ เพื่อส่งให้ openTablePanel ได้ตรงๆ (code = ชื่อห้อง, id = vip_rooms.id)
  return ok(res, rooms.map((r) => ({
    id: r.id, name: r.name, code: r.name, table_type: 'vip', seats: r.seats,
    status: r.status, is_active: r.is_active, is_vip: true, bill: bills.get(r.id) || null,
  })));
}));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['owner']);
      requireFields(b, ['name']);
      const name = cleanName(b.name);
      const seats = b.seats === undefined || b.seats === '' ? MAX_SEATS : cleanSeats(b.seats);
      if (await queryOne('SELECT id FROM vip_rooms WHERE name = ?', [name])) throw fail('มีห้องชื่อ ' + name + ' อยู่แล้ว', 409);
      const r = await query('INSERT INTO vip_rooms (name, seats) VALUES (?, ?)', [name, seats]);
      await writeLog(req, 'vip_room.create', 'vip_rooms', r.insertId, { name, seats });
      return ok(res, { id: r.insertId }, 'เพิ่มห้อง ' + name + ' แล้ว');
    }

    case 'update': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const room = await queryOne('SELECT * FROM vip_rooms WHERE id = ?', [b.id]);
      if (!room) throw fail('ไม่พบห้องนี้', 404);
      const name = b.name !== undefined ? cleanName(b.name) : room.name;
      const seats = b.seats !== undefined ? cleanSeats(b.seats) : room.seats;
      if (room.status === 'occupied' && (name !== room.name || seats !== room.seats)) {
        throw fail('ห้องมีลูกค้าอยู่ แก้ชื่อ/จำนวนที่นั่งไม่ได้', 409);
      }
      if (name !== room.name && await queryOne('SELECT id FROM vip_rooms WHERE name = ? AND id <> ?', [name, room.id])) {
        throw fail('มีห้องชื่อ ' + name + ' อยู่แล้ว', 409);
      }
      await query('UPDATE vip_rooms SET name = ?, seats = ? WHERE id = ?', [name, seats, room.id]);
      await writeLog(req, 'vip_room.update', 'vip_rooms', room.id,
        { from: { name: room.name, seats: room.seats }, to: { name, seats } });
      return ok(res, { id: room.id }, 'แก้ไขห้อง ' + name + ' แล้ว');
    }

    case 'deactivate': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const room = await queryOne('SELECT * FROM vip_rooms WHERE id = ?', [b.id]);
      if (!room) throw fail('ไม่พบห้องนี้', 404);
      const openBill = await queryOne(`SELECT id FROM bills WHERE vip_room_id = ? AND status = 'open' LIMIT 1`, [room.id]);
      if (room.status === 'occupied' || openBill) throw fail('ห้อง ' + room.name + ' มีลูกค้าอยู่ ปิดใช้งานไม่ได้', 409);
      const booking = await queryOne(
        `SELECT id FROM vip_bookings
          WHERE vip_room_id = ? AND status IN ('pending_deposit','confirmed')
            AND booking_date >= CURDATE() LIMIT 1`, [room.id]);
      if (booking) throw fail('ห้อง ' + room.name + ' มีการจองล่วงหน้าอยู่ ปิดใช้งานไม่ได้', 409);
      await query('UPDATE vip_rooms SET is_active = 0 WHERE id = ?', [room.id]);
      await writeLog(req, 'vip_room.deactivate', 'vip_rooms', room.id, { name: room.name });
      return ok(res, { id: room.id }, 'ปิดใช้งานห้อง ' + room.name + ' แล้ว');
    }

    case 'activate': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const room = await queryOne('SELECT * FROM vip_rooms WHERE id = ?', [b.id]);
      if (!room) throw fail('ไม่พบห้องนี้', 404);
      await query('UPDATE vip_rooms SET is_active = 1 WHERE id = ?', [room.id]);
      await writeLog(req, 'vip_room.activate', 'vip_rooms', room.id, { name: room.name });
      return ok(res, { id: room.id }, 'เปิดใช้งานห้อง ' + room.name + ' แล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
