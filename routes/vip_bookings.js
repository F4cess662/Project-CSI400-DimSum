/**
 * /api/vip_bookings — จองห้อง VIP (คนที่ 4 · เฟส 3) · FR-32–37 · staff+ [จอง VIP]
 * GET ?action=availability&date=2026-11-10  → ตารางห้อง × ชั่วโมง
 *   data = { date, hours: ['10:00',...], settings: { vip_min_spend, vip_deposit_percent, vip_max_hours },
 *            rooms: [{ id, name, seats, slots: [{ hour, status, booking_id, customer_name }] }] }
 *   status ของช่อง: free / past / pending_deposit / confirmed / arrived
 * GET ?date=2026-11-10                      → การจองทั้งหมดของวันนั้น (ไม่ส่ง date = วันนี้)
 * GET ?id=5                                 → การจองเดียว + รายการ pre-order + บิล (ถ้ามาแล้ว) + ปุ่มที่กดได้ (can_*)
 * POST {"action":"create","vip_room_id":1,"booking_date":"2026-11-10","start_time":"11:00","hours":2,
 *       "customer_name":"คุณเอ","customer_phone":"0812345678","guests":12,"items":[{"menu_item_id":3,"qty":10}]}
 * POST {"action":"confirm_deposit","id":5}  → รับมัดจำแล้ว → confirmed
 * POST {"action":"update_preorder","id":5,"items":[...]}   → แก้ได้ถึงก่อนวันจอง 1 วัน (BR-15)
 * POST {"action":"arrive","id":5}           → เปิดบิลห้อง VIP + pre-order เป็นออเดอร์รอบ 1 (source vip_preorder)
 * POST {"action":"no_show","id":5}          → กดได้หลังเลยเวลาเริ่ม 30 นาที · มัดจำไม่คืน (BR-16)
 * POST {"action":"cancel","id":5}           → ยกเลิกการจอง · มัดจำไม่คืน (BR-16)
 * ค่ายอดขั้นต่ำ / มัดจำ % / ชั่วโมงสูงสุด อ่านจาก shop_settings เสมอ
 */
const crypto = require('crypto');
const router = require('express').Router();
const config = require('../config');
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requirePerm, mustHavePerm } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { shopSettings } = require('../lib/shop');
const { publish } = require('../lib/queue');

const MAX_GUESTS = 15;          // BR-13 ห้องขนาดเดียว
const NO_SHOW_AFTER_MIN = 30;   // no_show กดได้หลังเลยเวลาเริ่ม 30 นาที
const BLOCKING = ['pending_deposit', 'confirmed', 'arrived']; // สถานะที่ยังกันห้องไว้
const marks = (arr) => arr.map(() => '?').join(',');

/* ---------- วันเวลา (เวลาไทย) ---------- */
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone });
function nowMinutes() {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return toMin(t);
}
/** 'HH:MM' หรือ 'HH:MM:SS' → นาทีนับจากเที่ยงคืน */
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const money = (n) => Math.round(n * 100) / 100;

function cleanDate(value) {
  const s = String(value || '').trim();
  const d = new Date(s + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw fail('วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD', 422);
  }
  return s;
}

function toId(value, label = 'รหัสการจอง') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw fail(label + 'ไม่ถูกต้อง', 422);
  return id;
}

/** ช่วงเวลาเปิดร้าน 2 กะ เป็นนาที */
function shifts(s) {
  return [
    { open: toMin(s.morning_open), close: toMin(s.morning_close) },
    { open: toMin(s.evening_open), close: toMin(s.evening_close) },
  ];
}

/** ชั่วโมงที่เริ่มจองได้ (ต้นชั่วโมงที่จบได้ภายในกะเดียวกัน) */
function hourSlots(s) {
  const list = [];
  for (const sh of shifts(s)) {
    for (let m = Math.ceil(sh.open / 60) * 60; m + 60 <= sh.close; m += 60) list.push(m);
  }
  return list;
}

/** เช็กเวลาจอง: ต้นชั่วโมง, 1–vip_max_hours ชม., ไม่ข้ามช่วงปิด, ไม่ย้อนหลัง → { start, end } เป็นนาที */
function checkTime(s, date, startTime, hours) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(String(startTime || '').trim());
  if (!m) throw fail('เวลาเริ่มต้องอยู่ในรูปแบบ HH:MM', 422);
  if (m[2] !== '00') throw fail('จองได้เฉพาะต้นชั่วโมง เช่น 11:00', 422);
  const h = Number(hours);
  if (!Number.isInteger(h) || h < 1 || h > s.vip_max_hours) {
    throw fail(`จองได้ 1 ถึง ${s.vip_max_hours} ชั่วโมง`, 422);
  }
  const start = Number(m[1]) * 60;
  const end = start + h * 60;
  if (!shifts(s).some((sh) => start >= sh.open && end <= sh.close)) {
    const t = (v) => v.slice(0, 5);
    throw fail(`เวลาจองต้องอยู่ในช่วงเปิดร้านกะเดียวกัน (${t(s.morning_open)}–${t(s.morning_close)} หรือ ${t(s.evening_open)}–${t(s.evening_close)})`, 422);
  }
  const today = todayStr();
  if (date < today || (date === today && start <= nowMinutes())) throw fail('จองย้อนหลังไม่ได้', 422);
  return { start, end, hours: h };
}

/** ห้องว่างทุกชั่วโมงไหม (BR-12) · ใช้ใน transaction หลังล็อกแถวห้องแล้ว */
async function checkRoomFree(conn, roomId, date, start, end, exceptId = 0) {
  const [rows] = await conn.execute(
    `SELECT id, start_time, hours, customer_name FROM vip_bookings
      WHERE vip_room_id = ? AND booking_date = ? AND id <> ? AND status IN (${marks(BLOCKING)})`,
    [roomId, date, exceptId, ...BLOCKING]);
  const clash = rows.find((r) => toMin(r.start_time) < end && toMin(r.start_time) + r.hours * 60 > start);
  if (clash) {
    const s = toMin(clash.start_time);
    throw fail(`ห้องนี้ถูกจองแล้วช่วง ${fromMin(s)}–${fromMin(s + clash.hours * 60)} น.`, 409);
  }
}

/** ตรวจรายการ pre-order + ดึงราคาปัจจุบัน → { items, total } · รวมเมนูซ้ำเป็นบรรทัดเดียว */
async function priceItems(conn, rawItems, s) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw fail('กรุณาเลือกเมนู pre-order อย่างน้อย 1 รายการ', 422);
  const qtyById = new Map();
  for (const it of rawItems) {
    const id = Number(it && it.menu_item_id);
    const qty = Number(it && it.qty);
    if (!Number.isInteger(id) || id < 1) throw fail('รหัสเมนูไม่ถูกต้อง', 422);
    if (!Number.isInteger(qty) || qty < 1) throw fail('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 422);
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }
  const ids = [...qtyById.keys()];
  const [menus] = await conn.execute(
    `SELECT id, name, unit, price FROM menu_items WHERE id IN (${marks(ids)}) AND is_deleted = 0 AND is_available = 1`, ids);
  if (menus.length !== ids.length) throw fail('มีเมนูที่ไม่พบหรือปิดขายอยู่ กรุณาเลือกใหม่', 422);
  const items = menus.map((mn) => ({ menu_item_id: mn.id, name: mn.name, qty: qtyById.get(mn.id), unit_price: Number(mn.price) }));
  const total = money(items.reduce((a, it) => a + it.qty * it.unit_price, 0));
  if (total < Number(s.vip_min_spend)) {
    throw fail(`ยอด pre-order ${total.toLocaleString('th-TH')} บาท ต่ำกว่าขั้นต่ำ ${Number(s.vip_min_spend).toLocaleString('th-TH')} บาท (BR-13)`, 422);
  }
  return { items, total };
}

async function insertItems(conn, bookingId, items) {
  for (const it of items) {
    await conn.execute(
      'INSERT INTO vip_booking_items (booking_id, menu_item_id, qty, unit_price) VALUES (?, ?, ?, ?)',
      [bookingId, it.menu_item_id, it.qty, it.unit_price]);
  }
}

/**
 * TODO(คนที่ 6): รอยืนยันว่า pre-order ตอนลูกค้ามาถึงต้องตัด menu_items.available_qty ไหม
 * ตอนนี้ยังไม่ตัด — ถ้าต้องตัด ให้ใช้ตรรกะเดียวกับ /api/orders create (เช็กจำนวนพอ + ลด available_qty)
 */
async function reserveMenuStock(conn, items) { // eslint-disable-line no-unused-vars
}

/** การจองหนึ่งรายการ + ล็อกแถว (ใช้ใน transaction) */
async function lockBooking(conn, id) {
  const [[bk]] = await conn.execute(
    `SELECT bk.*, r.name AS room_name FROM vip_bookings bk JOIN vip_rooms r ON r.id = bk.vip_room_id
      WHERE bk.id = ? FOR UPDATE`, [id]);
  if (!bk) throw fail('ไม่พบการจองนี้', 404);
  return bk;
}

/** ปุ่มที่กดได้ตามสถานะ/เวลา (ใช้ทั้ง GET ?id= และเช็กฝั่ง server) */
function abilities(bk) {
  const today = todayStr();
  const start = toMin(bk.start_time);
  const end = start + bk.hours * 60;
  const pending = ['pending_deposit', 'confirmed'].includes(bk.status);
  const passedNoShow = bk.booking_date < today || (bk.booking_date === today && nowMinutes() >= start + NO_SHOW_AFTER_MIN);
  return {
    can_confirm_deposit: bk.status === 'pending_deposit',
    can_edit_preorder: pending && today < bk.booking_date,                       // BR-15
    can_arrive: bk.status === 'confirmed' && bk.booking_date === today && nowMinutes() < end,
    can_no_show: pending && passedNoShow,
    can_cancel: pending,
  };
}

function bookingView(bk) {
  const start = toMin(bk.start_time);
  return {
    ...bk,
    start_time: fromMin(start),
    end_time: fromMin(start + bk.hours * 60),
    preorder_total: Number(bk.preorder_total),
    deposit_amount: Number(bk.deposit_amount),
  };
}

const smsTime = (bk) => `${bk.booking_date} เวลา ${fromMin(toMin(bk.start_time))}–${fromMin(toMin(bk.start_time) + bk.hours * 60)} น.`;
const baht = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

/* ---------- GET ---------- */
router.get('/', requirePerm('vip_booking'), handle(async (req, res) => {
  if (req.query.id) return bookingDetail(res, toId(req.query.id));
  if (req.query.action === 'availability') return availability(res, cleanDate(req.query.date || todayStr()));

  const date = cleanDate(req.query.date || todayStr());
  const rows = await query(
    `SELECT bk.id, bk.vip_room_id, r.name AS room_name, bk.booking_date, bk.start_time, bk.hours,
            bk.customer_name, bk.customer_phone, bk.guests, bk.preorder_total, bk.deposit_amount,
            bk.deposit_received_at, bk.status, bk.bill_id, bk.created_at
       FROM vip_bookings bk JOIN vip_rooms r ON r.id = bk.vip_room_id
      WHERE bk.booking_date = ?
      ORDER BY bk.start_time, r.name`, [date]);
  return ok(res, rows.map(bookingView));
}));

async function availability(res, date) {
  const s = await shopSettings();
  const slots = hourSlots(s);
  const rooms = await query('SELECT id, name, seats FROM vip_rooms WHERE is_active = 1 ORDER BY name');
  const bookings = await query(
    `SELECT id, vip_room_id, start_time, hours, customer_name, status FROM vip_bookings
      WHERE booking_date = ? AND status IN (${marks(BLOCKING)})`, [date, ...BLOCKING]);
  const today = todayStr();
  const now = nowMinutes();

  return ok(res, {
    date,
    hours: slots.map(fromMin),
    settings: { vip_min_spend: Number(s.vip_min_spend), vip_deposit_percent: s.vip_deposit_percent, vip_max_hours: s.vip_max_hours },
    rooms: rooms.map((r) => ({
      ...r,
      slots: slots.map((m) => {
        const bk = bookings.find((b) => b.vip_room_id === r.id
          && toMin(b.start_time) <= m && toMin(b.start_time) + b.hours * 60 > m);
        if (bk) return { hour: fromMin(m), status: bk.status, booking_id: bk.id, customer_name: bk.customer_name };
        const past = date < today || (date === today && m <= now);
        return { hour: fromMin(m), status: past ? 'past' : 'free', booking_id: null, customer_name: null };
      }),
    })),
  });
}

async function bookingDetail(res, id) {
  const bk = await queryOne(
    `SELECT bk.*, r.name AS room_name, u1.full_name AS created_by_name, u2.full_name AS deposit_received_by_name
       FROM vip_bookings bk
       JOIN vip_rooms r ON r.id = bk.vip_room_id
       JOIN users u1 ON u1.id = bk.created_by
       LEFT JOIN users u2 ON u2.id = bk.deposit_received_by
      WHERE bk.id = ?`, [id]);
  if (!bk) throw fail('ไม่พบการจองนี้', 404);
  const items = await query(
    `SELECT bi.id, bi.menu_item_id, m.name, m.unit, m.kitchen_zone, m.image_path, bi.qty, bi.unit_price,
            bi.qty * bi.unit_price AS line_total
       FROM vip_booking_items bi JOIN menu_items m ON m.id = bi.menu_item_id
      WHERE bi.booking_id = ? ORDER BY bi.id`, [id]);
  let bill = null;
  if (bk.bill_id) {
    const b = await queryOne('SELECT id, bill_no, status, guests, qr_token, opened_at FROM bills WHERE id = ?', [bk.bill_id]);
    if (b) {
      bill = {
        id: b.id, bill_no: b.bill_no, status: b.status, guests: b.guests, opened_at: b.opened_at,
        place: bk.room_name, qr_url: config.baseUrl + '/customer/menu.html?token=' + b.qr_token,
      };
    }
  }
  return ok(res, {
    ...bookingView(bk),
    items: items.map((it) => ({ ...it, unit_price: Number(it.unit_price), line_total: Number(it.line_total) })),
    bill,
    ...abilities(bk),
  });
}

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': return createBooking(req, res, b);
    case 'confirm_deposit': return confirmDeposit(req, res, b);
    case 'update_preorder': return updatePreorder(req, res, b);
    case 'arrive': return arrive(req, res, b);
    case 'no_show': return closeBooking(req, res, b, 'no_show');
    case 'cancel': return closeBooking(req, res, b, 'cancelled');
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

async function createBooking(req, res, b) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['vip_room_id', 'booking_date', 'start_time', 'hours', 'customer_name', 'customer_phone', 'guests', 'items']);
  const s = await shopSettings();
  const roomId = toId(b.vip_room_id, 'รหัสห้อง');
  const date = cleanDate(b.booking_date);
  const { start, hours } = checkTime(s, date, b.start_time, b.hours);
  const end = start + hours * 60;

  const name = String(b.customer_name).trim();
  if (!name || name.length > 100) throw fail('ชื่อลูกค้าต้องมี 1–100 ตัวอักษร', 422);
  const phone = String(b.customer_phone).replace(/[\s-]/g, '');
  if (!/^0\d{8,9}$/.test(phone)) throw fail('เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0', 422);
  const guests = Number(b.guests);

  const result = await transaction(async (conn) => {
    // ล็อกแถวห้องไว้ กันจองช่วงเดียวกันพร้อมกัน 2 คน
    const [[room]] = await conn.execute('SELECT id, name, seats, is_active FROM vip_rooms WHERE id = ? FOR UPDATE', [roomId]);
    if (!room || room.is_active !== 1) throw fail('ไม่พบห้อง VIP นี้', 404);
    const maxGuests = Math.min(room.seats, MAX_GUESTS);
    if (!Number.isInteger(guests) || guests < 1 || guests > maxGuests) throw fail(`จำนวนคนต้องอยู่ระหว่าง 1 ถึง ${maxGuests} คน`, 422);
    await checkRoomFree(conn, roomId, date, start, end);

    const { items, total } = await priceItems(conn, b.items, s);
    const deposit = money(total * s.vip_deposit_percent / 100);
    const [ins] = await conn.execute(
      `INSERT INTO vip_bookings (vip_room_id, booking_date, start_time, hours, customer_name, customer_phone, guests,
                                 preorder_total, deposit_amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [roomId, date, fromMin(start) + ':00', hours, name, phone, guests, total, deposit, user.id]);
    await insertItems(conn, ins.insertId, items);

    const bk = { booking_date: date, start_time: fromMin(start), hours };
    await publish('notify', {
      channel: 'sms', to: phone, title: 'ยืนยันการจองห้อง VIP',
      message: `${s.shop_name}: จอง${room.name} วันที่ ${smsTime(bk)} ${guests} คน ยอด pre-order ${baht(total)} บาท `
             + `กรุณาชำระมัดจำ ${baht(deposit)} บาท เพื่อยืนยันการจอง`,
    }, conn);
    return { id: ins.insertId, room_name: room.name, total, deposit };
  });

  await writeLog(req, 'vip_booking.create', 'vip_bookings', result.id,
    { room: result.room_name, booking_date: date, start_time: fromMin(start), hours, customer_name: name, preorder_total: result.total });
  return ok(res, {
    id: result.id, preorder_total: result.total, deposit_amount: result.deposit,
  }, `จอง${result.room_name} แล้ว · มัดจำ ${baht(result.deposit)} บาท`);
}

async function confirmDeposit(req, res, b) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id']);
  const id = toId(b.id);
  const s = await shopSettings();
  const bk = await transaction(async (conn) => {
    const cur = await lockBooking(conn, id);
    if (cur.status !== 'pending_deposit') throw fail('การจองนี้ไม่ได้อยู่ในสถานะรอมัดจำ', 409);
    await conn.execute(
      "UPDATE vip_bookings SET status = 'confirmed', deposit_received_at = NOW(), deposit_received_by = ? WHERE id = ?",
      [user.id, id]);
    await publish('notify', {
      channel: 'sms', to: cur.customer_phone, title: 'ได้รับมัดจำแล้ว',
      message: `${s.shop_name}: ได้รับมัดจำ ${baht(cur.deposit_amount)} บาทแล้ว การจอง${cur.room_name} วันที่ ${smsTime(cur)} ยืนยันเรียบร้อย`,
    }, conn);
    return cur;
  });
  await writeLog(req, 'vip_booking.confirm_deposit', 'vip_bookings', id, { deposit_amount: Number(bk.deposit_amount) });
  return ok(res, { id }, `รับมัดจำ ${baht(bk.deposit_amount)} บาทแล้ว`);
}

async function updatePreorder(req, res, b) {
  await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id', 'items']);
  const id = toId(b.id);
  const s = await shopSettings();
  const result = await transaction(async (conn) => {
    const cur = await lockBooking(conn, id);
    if (!abilities(cur).can_edit_preorder) {
      throw fail('แก้ pre-order ได้เฉพาะการจองที่ยังไม่มาถึง และก่อนวันจองอย่างน้อย 1 วัน (BR-15)', 409);
    }
    const { items, total } = await priceItems(conn, b.items, s);
    // รับมัดจำไปแล้ว = ยอดมัดจำคงเดิม · ยังไม่รับ = คิดใหม่ตามยอดใหม่
    const deposit = cur.status === 'pending_deposit' ? money(total * s.vip_deposit_percent / 100) : Number(cur.deposit_amount);
    await conn.execute('DELETE FROM vip_booking_items WHERE booking_id = ?', [id]);
    await insertItems(conn, id, items);
    await conn.execute('UPDATE vip_bookings SET preorder_total = ?, deposit_amount = ? WHERE id = ?', [total, deposit, id]);
    return { from: Number(cur.preorder_total), total, deposit };
  });
  await writeLog(req, 'vip_booking.update_preorder', 'vip_bookings', id, { from: result.from, to: result.total });
  return ok(res, { id, preorder_total: result.total, deposit_amount: result.deposit },
    `แก้ pre-order แล้ว ยอดใหม่ ${baht(result.total)} บาท`);
}

/** ลูกค้ามาถึง: เปิดบิลห้อง VIP (ตรรกะเดียวกับ /api/bills open) + pre-order เป็นออเดอร์รอบ 1 */
async function arrive(req, res, b) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id']);
  const id = toId(b.id);
  const token = crypto.randomBytes(16).toString('hex');

  const result = await transaction(async (conn) => {
    const bk = await lockBooking(conn, id);
    if (bk.status === 'pending_deposit') throw fail('ยังไม่ได้รับมัดจำ กรุณากดรับมัดจำก่อน', 409);
    if (!abilities(bk).can_arrive) throw fail('เปิดห้องได้เฉพาะการจองที่ยืนยันแล้ว ในวันจอง และก่อนหมดเวลาจอง', 409);

    const [[room]] = await conn.execute('SELECT id, name, status, is_active FROM vip_rooms WHERE id = ? FOR UPDATE', [bk.vip_room_id]);
    if (!room || room.is_active !== 1) throw fail('ห้องนี้ปิดใช้งานอยู่', 409);
    const [[openBill]] = await conn.execute(
      "SELECT bill_no FROM bills WHERE vip_room_id = ? AND status = 'open' LIMIT 1", [room.id]);
    if (room.status !== 'available' || openBill) {
      throw fail(`${room.name} ยังมีลูกค้าอยู่${openBill ? ` (บิล ${openBill.bill_no})` : ''} ต้องปิดบิลเดิมก่อน`, 409);
    }

    // เลขบิล B+YYYYMMDD-ลำดับ 3 หลัก (รูปแบบเดียวกับ routes/bills.js)
    const prefix = 'B' + todayStr().replace(/-/g, '') + '-';
    const [[last]] = await conn.execute(
      'SELECT bill_no FROM bills WHERE bill_no LIKE ? ORDER BY bill_no DESC LIMIT 1 FOR UPDATE', [prefix + '%']);
    const billNo = prefix + String(last ? Number(last.bill_no.slice(prefix.length)) + 1 : 1).padStart(3, '0');
    const [insBill] = await conn.execute(
      'INSERT INTO bills (bill_no, guests, vip_room_id, qr_token, opened_by) VALUES (?, ?, ?, ?, ?)',
      [billNo, bk.guests, room.id, token, user.id]);
    const billId = insBill.insertId;
    await conn.execute("UPDATE vip_rooms SET status = 'occupied' WHERE id = ?", [room.id]);

    // pre-order → ออเดอร์รอบ 1 (ราคาตามที่ตกลงตอนจอง)
    const [items] = await conn.execute(
      'SELECT menu_item_id, qty, unit_price FROM vip_booking_items WHERE booking_id = ? ORDER BY id', [id]);
    const [insOrder] = await conn.execute(
      "INSERT INTO orders (bill_id, round_no, source, created_by) VALUES (?, 1, 'vip_preorder', ?)", [billId, user.id]);
    for (const it of items) {
      await conn.execute(
        'INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, updated_by) VALUES (?, ?, ?, ?, ?)',
        [insOrder.insertId, it.menu_item_id, it.qty, it.unit_price, user.id]);
    }
    await reserveMenuStock(conn, items);

    // checkout.js หักมัดจำจาก vip_bookings.bill_id
    await conn.execute("UPDATE vip_bookings SET status = 'arrived', bill_id = ? WHERE id = ?", [billId, id]);
    const [[row]] = await conn.execute('SELECT opened_at FROM bills WHERE id = ?', [billId]);
    return { bill_id: billId, bill_no: billNo, opened_at: row.opened_at, room_name: room.name, guests: bk.guests, item_count: items.length };
  });

  await writeLog(req, 'bill.open', 'bills', result.bill_id,
    { bill_no: result.bill_no, places: [result.room_name], guests: result.guests, vip_booking_id: id });
  await writeLog(req, 'vip_booking.arrive', 'vip_bookings', id, { bill_id: result.bill_id, bill_no: result.bill_no });
  return ok(res, {
    bill_id: result.bill_id,
    bill_no: result.bill_no,
    guests: result.guests,
    opened_at: result.opened_at,
    place: result.room_name,
    qr_token: token,
    qr_url: config.baseUrl + '/customer/menu.html?token=' + token,
  }, `เปิด${result.room_name} แล้ว · ส่ง pre-order ${result.item_count} รายการเข้าครัว`);
}

/** no_show / cancel: ห้องกลับเป็นว่าง (ช่องเวลาว่าง) · มัดจำไม่คืน (BR-16) */
async function closeBooking(req, res, b, status) {
  await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id']);
  const id = toId(b.id);
  const bk = await transaction(async (conn) => {
    const cur = await lockBooking(conn, id);
    const can = abilities(cur);
    if (status === 'no_show' && !can.can_no_show) {
      throw fail(`กด "ไม่มา" ได้เมื่อเลยเวลาเริ่มจอง ${NO_SHOW_AFTER_MIN} นาทีแล้ว และการจองยังไม่มาถึง`, 409);
    }
    if (status === 'cancelled' && !can.can_cancel) throw fail('ยกเลิกได้เฉพาะการจองที่ยังไม่มาถึง', 409);
    await conn.execute('UPDATE vip_bookings SET status = ? WHERE id = ?', [status, id]);
    return cur;
  });
  const kept = bk.deposit_received_at ? Number(bk.deposit_amount) : 0;
  await writeLog(req, 'vip_booking.' + (status === 'no_show' ? 'no_show' : 'cancel'), 'vip_bookings', id,
    { customer_name: bk.customer_name, deposit_kept: kept });
  const label = status === 'no_show' ? 'บันทึกลูกค้าไม่มาแล้ว' : 'ยกเลิกการจองแล้ว';
  return ok(res, { id, deposit_kept: kept }, kept ? `${label} · มัดจำ ${baht(kept)} บาท ไม่คืน (BR-16)` : label);
}

module.exports = router;
