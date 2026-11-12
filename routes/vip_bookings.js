/**
 * /api/vip_bookings — จองห้อง VIP แบบแพ็กเกจ (คนที่ 4 · เฟส 3 + แก้ตาม Feedback เฟส 3) · FR-32–37 · staff+ [จอง VIP]
 *
 * แพ็กเกจ (ตาราง vip_packages): S 2 ชม. · M 3 ชม. · L 4 ชม. · เหมาวัน (hours = NULL)
 *   เริ่มตรงต้นชั่วโมง · ใช้ห้องได้ถึงนาทีที่ :50 ของชั่วโมงสุดท้าย (10 นาทีสุดท้ายจัดห้อง) · รอบถัดไปเริ่มตรงชั่วโมง
 *   แพ็กเกจรายชั่วโมงต้องอยู่ในรอบเดียว · เหมาวันล็อกทั้ง 2 รอบของวันนั้น
 *   จองช่วงที่กำลังเดินอยู่ได้ถ้าห้องว่าง (นับจากต้นชั่วโมง ราคาเต็ม)
 *   room_fee = ราคาแพ็กเกจ · มัดจำ = (room_fee + ค่าอาหารสั่งล่วงหน้า) × vip_deposit_percent / 100
 *   สั่งอาหารล่วงหน้า (items) ไม่บังคับ ไม่มียอดขั้นต่ำ
 *
 * GET ?action=availability&date=2026-11-10 → ตารางห้อง × ชั่วโมง + แพ็กเกจที่เปิดใช้
 *   data = { date, now_hour, hours: ['10:00',...], settings: { vip_deposit_percent, setup_min }, packages: [...],
 *            rooms: [{ id, name, seats, slots: [{ hour, shift, status, booking_id, customer_name }] }] }
 *   status ของช่อง: free / past / pending_deposit / confirmed / arrived / released (ปล่อยห้องแล้ว ก่อนเวลาปล่อย)
 * GET ?action=affected&date=2026-11-10[&vip_room_id=1] → การจองที่โดนเหตุสุดวิสัย เรียงตามเวลาที่จอง (manager+)
 * GET ?date=2026-11-10                     → การจองทั้งหมดของวันนั้น (ไม่ส่ง date = วันนี้) + can_call_follow
 * GET ?id=5                                → การจองเดียว + pre-order + บิล + ปุ่มที่กดได้ (can_*)
 *
 * POST {"action":"create","vip_room_id":1,"package_id":1,"booking_date":"2026-11-10","start_time":"10:00",
 *       "customer_name":"คุณเอ","customer_phone":"0812345678","guests":12,"items":[{"menu_item_id":3,"qty":10}]}
 *       (เหมาวันไม่ต้องส่ง start_time · items ไม่ส่งก็ได้)
 * POST {"action":"confirm_deposit","id":5}  → รับมัดจำแล้ว → confirmed
 * POST {"action":"update_preorder","id":5,"items":[...]}  → แก้ได้ถึงก่อนวันจอง 1 วัน (BR-15) · หลังรับมัดจำ มัดจำไม่เปลี่ยน
 * POST {"action":"arrive","id":5}           → เปิดบิลห้อง VIP (+ pre-order เป็นออเดอร์รอบ 1 ถ้ามี)
 *       เหมาวัน: กดได้รอบละครั้ง รอบเช้าเก็บ bill_id รอบเย็นเก็บ evening_bill_id
 * POST {"action":"no_show","id":5}          → กดได้หลังจบช่วงจองเท่านั้น · มัดจำไม่คืน
 * POST {"action":"release","id":5}          → ลูกค้ายืนยันไม่มา ปล่อยห้องคืน · มัดจำไม่คืน · เวลาที่เหลือกลับเป็นว่าง
 * POST {"action":"reschedule","id":5,"booking_date":"2026-11-20","start_time":"16:00","package_id":2[,"vip_room_id":2]}
 *       → ลูกค้าเลื่อนได้ 1 ครั้ง ภายใน 14 วันจากวันเดิม ต้องแจ้งก่อนวันจองเดิมอย่างน้อย 1 วัน · มัดจำย้ายตาม
 * POST {"action":"shop_reschedule","id":5,"booking_date":...,"start_time":...,"package_id":...,"reason":"ไฟดับ"}
 *       → ร้านเลื่อนให้เพราะเหตุสุดวิสัย (manager+) ไม่นับสิทธิ์เลื่อน ไม่เช็ก 14 วัน
 * POST {"action":"cancel","id":5[,"cancel_reason":"..."]}            → ลูกค้ายกเลิก · มัดจำไม่คืน
 * POST {"action":"cancel","id":5,"refund":1,"cancel_reason":"น้ำท่วม"} → ร้านยกเลิกเพราะเหตุสุดวิสัย คืนมัดจำ (manager+)
 * ค่าเวลาเปิด-ปิด / มัดจำ % อ่านจาก shop_settings · ราคาแพ็กเกจอ่านจาก vip_packages เสมอ
 */
const crypto = require('crypto');
const router = require('express').Router();
const config = require('../config');
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requirePerm, mustHavePerm, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { shopSettings } = require('../lib/shop');
const { publish } = require('../lib/queue');

const MAX_GUESTS = 15;            // BR-13 ห้องขนาดเดียว
const SETUP_MIN = 10;             // 10 นาทีสุดท้ายของการจองเป็นเวลาจัดห้อง
const CALL_AFTER_MIN = 10;        // ป้าย "โทรตาม" เมื่อเลยเวลาเริ่ม ≥ 10 นาทีแล้วยังไม่มา
const EARLY_ARRIVE_MIN = 30;      // กดลูกค้ามาถึงได้ก่อนเวลาเริ่มไม่เกิน 30 นาที
const RESCHEDULE_MAX_DAYS = 14;   // เลื่อนได้ไม่เกินวันเดิม + 14 วัน
const BLOCKING = ['pending_deposit', 'confirmed', 'arrived']; // สถานะที่ยังกันห้องไว้
const PENDING = ['pending_deposit', 'confirmed'];             // ยังไม่มาถึง
const MANAGERS = ['manager', 'owner'];
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
const addDays = (date, n) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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

/** ชั่วโมงที่เริ่มจองได้ (ต้นชั่วโมงที่จบได้ภายในกะเดียวกัน) → [{ m, shift }] */
function hourSlots(s) {
  const list = [];
  shifts(s).forEach((sh, i) => {
    for (let m = Math.ceil(sh.open / 60) * 60; m + 60 <= sh.close; m += 60) list.push({ m, shift: i });
  });
  return list;
}

/**
 * ช่วงที่การจองกันห้องไว้ (นาที · to = ต้นชั่วโมงที่รอบถัดไปเริ่มได้)
 *   รายชั่วโมง → 1 ช่วง [start, start + hours]
 *   เหมาวัน (hours = NULL) → กะเช้า + กะเย็น นับจากเวลาเริ่ม (ช่วงพักร้านไม่นับ)
 * เวลาใช้ห้องจริงที่แสดงลูกค้า = to − 10 นาที
 */
function bookingSegs(bk, s) {
  const start = toMin(bk.start_time);
  if (bk.hours !== null && bk.hours !== undefined) return [{ from: start, to: start + Number(bk.hours) * 60 }];
  return shifts(s)
    .map((sh) => ({ from: Math.max(start, sh.open), to: sh.close }))
    .filter((g) => g.from < g.to);
}

/** "10:00–11:50" · เหมาวัน "10:00–13:50, 16:00–19:50" */
const timeLabel = (segs) => segs.map((g) => `${fromMin(g.from)}–${fromMin(g.to - SETUP_MIN)}`).join(', ');
const overlap = (a, b) => a.some((x) => b.some((y) => x.from < y.to && y.from < x.to));

/** แพ็กเกจ (ใช้ได้ทั้งนอกและใน transaction) */
async function loadPackage(conn, id) {
  const pkgId = toId(id, 'รหัสแพ็กเกจ');
  const sql = 'SELECT id, code, name, hours, price, is_active FROM vip_packages WHERE id = ?';
  const pkg = conn ? (await conn.execute(sql, [pkgId]))[0][0] : await queryOne(sql, [pkgId]);
  if (!pkg || pkg.is_active !== 1) throw fail('ไม่พบแพ็กเกจนี้ หรือแพ็กเกจปิดใช้อยู่', 422);
  return { ...pkg, price: Number(pkg.price) };
}

/**
 * เช็กเวลาจองตามแพ็กเกจ → { start, segs }
 *   รายชั่วโมง: ต้นชั่วโมง · จบภายในรอบเดียว · ไม่ย้อนหลัง (ชั่วโมงที่กำลังเดินอยู่จองได้)
 *   เหมาวัน: เริ่มต้นชั่วโมงแรกของวัน (วันนี้ = ชั่วโมงที่กำลังเดินอยู่) ล็อกที่เหลือของทั้ง 2 รอบ
 */
function checkTime(s, date, pkg, startTime) {
  const today = todayStr();
  const now = nowMinutes();
  if (date < today) throw fail('จองย้อนหลังไม่ได้', 422);
  const notPast = (m) => date > today || m + 60 > now;

  if (pkg.hours === null) {
    const first = hourSlots(s).find((x) => notPast(x.m));
    if (!first) throw fail('วันนี้เลยเวลาเปิดร้านแล้ว จองเหมาวันไม่ได้', 422);
    const start = first.m;
    return { start, segs: bookingSegs({ start_time: fromMin(start), hours: null }, s) };
  }

  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(String(startTime || '').trim());
  if (!m) throw fail('เวลาเริ่มต้องอยู่ในรูปแบบ HH:MM', 422);
  if (m[2] !== '00') throw fail('จองได้เฉพาะต้นชั่วโมง เช่น 11:00', 422);
  const start = Number(m[1]) * 60;
  const end = start + pkg.hours * 60;
  if (!shifts(s).some((sh) => start >= sh.open && end <= sh.close)) {
    const t = (v) => v.slice(0, 5);
    throw fail(`${pkg.name} (${pkg.hours} ชม.) เริ่ม ${fromMin(start)} จะเกินเวลาปิดรอบ · ต้องอยู่ในรอบเดียว `
      + `(${t(s.morning_open)}–${t(s.morning_close)} หรือ ${t(s.evening_open)}–${t(s.evening_close)})`, 422);
  }
  if (!notPast(start)) throw fail('เลยเวลานี้ไปแล้ว จองย้อนหลังไม่ได้', 422);
  return { start, segs: [{ from: start, to: end }] };
}

/** ห้องว่างทุกชั่วโมงไหม (BR-12) · ใช้ใน transaction หลังล็อกแถวห้องแล้ว */
async function checkRoomFree(conn, s, roomId, date, segs, exceptId = 0) {
  const [rows] = await conn.execute(
    `SELECT id, start_time, hours, customer_name FROM vip_bookings
      WHERE vip_room_id = ? AND booking_date = ? AND id <> ? AND status IN (${marks(BLOCKING)})`,
    [roomId, date, exceptId, ...BLOCKING]);
  const clash = rows.find((r) => overlap(bookingSegs(r, s), segs));
  if (clash) throw fail(`ห้องนี้ถูกจองแล้วช่วง ${timeLabel(bookingSegs(clash, s))} น.`, 409);
}

/** ตรวจรายการสั่งล่วงหน้า + ดึงราคาปัจจุบัน → { items, total } · ไม่ส่ง/ว่าง = ไม่สั่ง · รวมเมนูซ้ำเป็นบรรทัดเดียว */
async function priceItems(conn, rawItems) {
  if (rawItems === undefined || rawItems === null) return { items: [], total: 0 };
  if (!Array.isArray(rawItems)) throw fail('items ต้องเป็นรายการ', 422);
  if (!rawItems.length) return { items: [], total: 0 };
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
  return { items, total };
}

async function insertItems(conn, bookingId, items) {
  for (const it of items) {
    await conn.execute(
      'INSERT INTO vip_booking_items (booking_id, menu_item_id, qty, unit_price) VALUES (?, ?, ?, ?)',
      [bookingId, it.menu_item_id, it.qty, it.unit_price]);
  }
}

const depositOf = (roomFee, foodTotal, s) => money((Number(roomFee) + Number(foodTotal)) * s.vip_deposit_percent / 100);

/** การจองหนึ่งรายการ + ล็อกแถว (ใช้ใน transaction) */
async function lockBooking(conn, id) {
  const [[bk]] = await conn.execute(
    `SELECT bk.*, DATE_FORMAT(bk.booking_date, '%Y-%m-%d') AS booking_date, r.name AS room_name,
            p.name AS package_name, p.code AS package_code,
            (SELECT DATE_FORMAT(opened_at, '%H:%i') FROM bills WHERE id = bk.bill_id) AS first_bill_time
       FROM vip_bookings bk JOIN vip_rooms r ON r.id = bk.vip_room_id
       LEFT JOIN vip_packages p ON p.id = bk.package_id
      WHERE bk.id = ? FOR UPDATE`, [id]);
  if (!bk) throw fail('ไม่พบการจองนี้', 404);
  return bk;
}

/**
 * ปุ่มที่กดได้ตามสถานะ/เวลา/สิทธิ์ (ใช้ทั้ง GET ?id= และเช็กฝั่ง server)
 * bk ต้องมี first_bill_time (เวลาเปิดบิลแรก 'HH:MM') เพื่อรู้ว่าเหมาวันเปิดรอบเช้าไปแล้วหรือยัง
 */
function abilities(bk, s, user) {
  const today = todayStr();
  const now = nowMinutes();
  const segs = bookingSegs(bk, s);
  const start = segs[0].from;
  const end = segs[segs.length - 1].to - SETUP_MIN;          // เวลาใช้ห้องจริงจบ (:50)
  const isToday = bk.booking_date === today;
  const ended = bk.booking_date < today || (isToday && now >= end);
  const pending = PENDING.includes(bk.status);
  const manager = !!user && MANAGERS.includes(user.role_code);

  // เหมาวันที่เปิดบิลรอบเช้าไปแล้ว → รอบเย็นกดมาถึงได้อีกครั้ง (เปิดบิลกะเย็น)
  const evening = segs.find((g) => g.from >= toMin(s.evening_open));
  const eveningArrive = bk.hours === null && bk.status === 'arrived' && !bk.evening_bill_id && !!evening
    && isToday && !!bk.first_bill_time && toMin(bk.first_bill_time) < toMin(s.morning_close)
    && now >= toMin(s.morning_close) && now < evening.to - SETUP_MIN;

  return {
    can_confirm_deposit: bk.status === 'pending_deposit',
    can_edit_preorder: pending && today < bk.booking_date,                                   // BR-15
    can_arrive: (bk.status === 'confirmed' && isToday && now >= start - EARLY_ARRIVE_MIN && now < end) || eveningArrive,
    is_evening_arrive: eveningArrive,
    can_no_show: pending && ended,                                                          // หลังจบช่วงจองเท่านั้น
    can_release: pending && isToday && !ended,
    can_cancel: pending && !ended,
    can_cancel_refund: manager && pending,
    can_reschedule: pending && Number(bk.reschedule_count) === 0 && today < bk.booking_date,
    can_shop_reschedule: manager && pending,
    can_call_follow: bk.status === 'confirmed' && isToday && now >= start + CALL_AFTER_MIN && !ended,
  };
}

function bookingView(bk, s) {
  const segs = bookingSegs(bk, s);
  const { first_bill_time: _f, ...rest } = bk;
  return {
    ...rest,
    start_time: fromMin(segs[0].from),
    end_time: fromMin(segs[segs.length - 1].to - SETUP_MIN),
    time_label: timeLabel(segs),
    is_fullday: bk.hours === null,
    preorder_total: Number(bk.preorder_total),
    room_fee: Number(bk.room_fee),
    deposit_amount: Number(bk.deposit_amount),
    rescheduled_from: parseJson(bk.rescheduled_from),
  };
}

function parseJson(v) {
  if (v === null || v === undefined || typeof v === 'object') return v ?? null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

const pkgLabel = (bk) => bk.package_name || (bk.hours === null ? 'เหมาวัน' : `${bk.hours} ชม.`);
const smsTime = (bk, s) => `${bk.booking_date} เวลา ${timeLabel(bookingSegs(bk, s))} น.`;
const baht = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

const LIST_SQL = `
  SELECT bk.id, bk.vip_room_id, r.name AS room_name, bk.package_id, p.code AS package_code, p.name AS package_name,
         DATE_FORMAT(bk.booking_date, '%Y-%m-%d') AS booking_date, bk.start_time, bk.hours,
         bk.customer_name, bk.customer_phone, bk.guests, bk.preorder_total, bk.room_fee, bk.deposit_amount,
         bk.deposit_received_at, bk.deposit_refunded_at, bk.status, bk.bill_id, bk.evening_bill_id,
         bk.reschedule_count, bk.rescheduled_from, bk.released_at, bk.cancel_reason, bk.created_at,
         (SELECT DATE_FORMAT(opened_at, '%H:%i') FROM bills WHERE id = bk.bill_id) AS first_bill_time
    FROM vip_bookings bk
    JOIN vip_rooms r ON r.id = bk.vip_room_id
    LEFT JOIN vip_packages p ON p.id = bk.package_id`;

/* ---------- GET ---------- */
router.get('/', requirePerm('vip_booking'), handle(async (req, res) => {
  const s = await shopSettings();
  if (req.query.id) return bookingDetail(req, res, s, toId(req.query.id));
  if (req.query.action === 'availability') return availability(res, s, cleanDate(req.query.date || todayStr()));
  if (req.query.action === 'affected') return affected(req, res, s);

  const date = cleanDate(req.query.date || todayStr());
  const rows = await query(`${LIST_SQL} WHERE bk.booking_date = ? ORDER BY bk.start_time, r.name`, [date]);
  return ok(res, rows.map((bk) => {
    const can = abilities(bk, s, req.user);
    return { ...bookingView(bk, s), can_call_follow: can.can_call_follow };
  }));
}));

async function availability(res, s, date) {
  const slots = hourSlots(s);
  const [rooms, bookings, packages] = await Promise.all([
    query('SELECT id, name, seats FROM vip_rooms WHERE is_active = 1 ORDER BY name'),
    query(
      `SELECT id, vip_room_id, start_time, hours, customer_name, status,
              DATE_FORMAT(released_at, '%Y-%m-%d %H:%i') AS released_at
         FROM vip_bookings
        WHERE booking_date = ? AND status IN (${marks([...BLOCKING, 'released'])})`, [date, ...BLOCKING, 'released']),
    query('SELECT id, code, name, hours, price FROM vip_packages WHERE is_active = 1 ORDER BY sort_order, id'),
  ]);
  const today = todayStr();
  const now = nowMinutes();

  // ปล่อยห้องแล้ว: กันเฉพาะชั่วโมงก่อนเวลาปล่อย ชั่วโมงที่เหลือกลับเป็นว่าง
  const holding = bookings.map((b) => {
    let segs = bookingSegs(b, s);
    if (b.status === 'released') {
      const cut = b.released_at && b.released_at.slice(0, 10) === date ? toMin(b.released_at.slice(11)) : -1;
      segs = segs.map((g) => ({ from: g.from, to: Math.min(g.to, cut) })).filter((g) => g.to > g.from);
    }
    return { ...b, segs };
  });

  return ok(res, {
    date,
    now_hour: date === today ? fromMin(Math.floor(now / 60) * 60) : null,
    hours: slots.map((x) => fromMin(x.m)),
    settings: { vip_deposit_percent: s.vip_deposit_percent, setup_min: SETUP_MIN },
    packages: packages.map((p) => ({ ...p, price: Number(p.price) })),
    rooms: rooms.map((r) => ({
      ...r,
      slots: slots.map(({ m, shift }) => {
        const bk = holding.find((b) => b.vip_room_id === r.id && b.segs.some((g) => g.from < m + 60 && m < g.to));
        if (bk) return { hour: fromMin(m), shift, status: bk.status, booking_id: bk.id, customer_name: bk.customer_name };
        const past = date < today || (date === today && m + 60 <= now);
        return { hour: fromMin(m), shift, status: past ? 'past' : 'free', booking_id: null, customer_name: null };
      }),
    })),
  });
}

/** เหตุสุดวิสัยฝั่งร้าน: การจองที่ยังไม่มาถึงของวัน/ห้องนั้น เรียงตามเวลาที่จอง (ใครจองก่อนได้เลือกก่อน) */
async function affected(req, res, s) {
  await mustBe(req, MANAGERS);
  const date = cleanDate(req.query.date || todayStr());
  const params = [date, ...PENDING];
  let roomSql = '';
  if (req.query.vip_room_id) { roomSql = ' AND bk.vip_room_id = ?'; params.push(toId(req.query.vip_room_id, 'รหัสห้อง')); }
  const rows = await query(
    `${LIST_SQL} WHERE bk.booking_date = ? AND bk.status IN (${marks(PENDING)})${roomSql}
      ORDER BY bk.created_at, bk.id`, params);
  return ok(res, rows.map((bk, i) => ({ ...bookingView(bk, s), queue_order: i + 1 })));
}

async function bookingDetail(req, res, s, id) {
  const bk = await queryOne(
    `SELECT bk.*, DATE_FORMAT(bk.booking_date, '%Y-%m-%d') AS booking_date, r.name AS room_name,
            p.code AS package_code, p.name AS package_name,
            u1.full_name AS created_by_name, u2.full_name AS deposit_received_by_name, u3.full_name AS deposit_refunded_by_name,
            (SELECT DATE_FORMAT(opened_at, '%H:%i') FROM bills WHERE id = bk.bill_id) AS first_bill_time
       FROM vip_bookings bk
       JOIN vip_rooms r ON r.id = bk.vip_room_id
       LEFT JOIN vip_packages p ON p.id = bk.package_id
       JOIN users u1 ON u1.id = bk.created_by
       LEFT JOIN users u2 ON u2.id = bk.deposit_received_by
       LEFT JOIN users u3 ON u3.id = bk.deposit_refunded_by
      WHERE bk.id = ?`, [id]);
  if (!bk) throw fail('ไม่พบการจองนี้', 404);
  const items = await query(
    `SELECT bi.id, bi.menu_item_id, m.name, m.unit, m.kitchen_zone, m.image_path, bi.qty, bi.unit_price,
            bi.qty * bi.unit_price AS line_total
       FROM vip_booking_items bi JOIN menu_items m ON m.id = bi.menu_item_id
      WHERE bi.booking_id = ? ORDER BY bi.id`, [id]);

  const billView = async (billId, label) => {
    if (!billId) return null;
    const b = await queryOne('SELECT id, bill_no, status, guests, qr_token, opened_at FROM bills WHERE id = ?', [billId]);
    if (!b) return null;
    return {
      id: b.id, bill_no: b.bill_no, status: b.status, guests: b.guests, opened_at: b.opened_at, label,
      place: bk.room_name, qr_token: b.qr_token, qr_url: config.baseUrl + '/customer/menu.html?token=' + b.qr_token,
    };
  };
  const bill = await billView(bk.bill_id, bk.hours === null && bk.evening_bill_id ? 'บิลรอบเช้า' : 'บิล');
  const eveningBill = await billView(bk.evening_bill_id, 'บิลรอบเย็น');

  return ok(res, {
    ...bookingView(bk, s),
    items: items.map((it) => ({ ...it, unit_price: Number(it.unit_price), line_total: Number(it.line_total) })),
    bill,
    evening_bill: eveningBill,
    ...abilities(bk, s, req.user),
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
    case 'release': return closeBooking(req, res, b, 'released');
    case 'cancel': return closeBooking(req, res, b, 'cancelled');
    case 'reschedule': return reschedule(req, res, b, false);
    case 'shop_reschedule': return reschedule(req, res, b, true);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

async function createBooking(req, res, b) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['vip_room_id', 'package_id', 'booking_date', 'customer_name', 'customer_phone', 'guests']);
  const s = await shopSettings();
  const roomId = toId(b.vip_room_id, 'รหัสห้อง');
  const date = cleanDate(b.booking_date);
  const pkg = await loadPackage(null, b.package_id);
  if (pkg.hours !== null) requireFields(b, ['start_time']);
  const { start, segs } = checkTime(s, date, pkg, b.start_time);

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
    await checkRoomFree(conn, s, roomId, date, segs);

    const { items, total } = await priceItems(conn, b.items);
    const roomFee = pkg.price;
    const deposit = depositOf(roomFee, total, s);
    const [ins] = await conn.execute(
      `INSERT INTO vip_bookings (vip_room_id, package_id, booking_date, start_time, hours, customer_name, customer_phone,
                                 guests, preorder_total, room_fee, deposit_amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [roomId, pkg.id, date, fromMin(start) + ':00', pkg.hours, name, phone, guests, total, roomFee, deposit, user.id]);
    await insertItems(conn, ins.insertId, items);

    const bk = { booking_date: date, start_time: fromMin(start), hours: pkg.hours };
    await publish('notify', {
      channel: 'sms', to: phone, title: 'ยืนยันการจองห้อง VIP',
      message: `${s.shop_name}: จอง${room.name} ${pkg.name} วันที่ ${smsTime(bk, s)} ${guests} คน `
             + `ค่าห้อง ${baht(roomFee)} บาท${total ? ` อาหารสั่งล่วงหน้า ${baht(total)} บาท` : ''} `
             + `กรุณาชำระมัดจำ ${baht(deposit)} บาท เพื่อยืนยันการจอง`,
    }, conn);
    return { id: ins.insertId, room_name: room.name, total, roomFee, deposit };
  });

  const label = timeLabel(segs);
  await writeLog(req, 'vip_booking.create', 'vip_bookings', result.id, {
    room: result.room_name, package: pkg.code, booking_date: date, time: label, customer_name: name,
    room_fee: result.roomFee, preorder_total: result.total, deposit_amount: result.deposit,
  });
  return ok(res, {
    id: result.id, room_fee: result.roomFee, preorder_total: result.total, deposit_amount: result.deposit, time_label: label,
  }, `จอง${result.room_name} ${pkg.name} ${label} น. แล้ว · มัดจำ ${baht(result.deposit)} บาท`);
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
      message: `${s.shop_name}: ได้รับมัดจำ ${baht(cur.deposit_amount)} บาทแล้ว การจอง${cur.room_name} วันที่ ${smsTime(cur, s)} ยืนยันเรียบร้อย`,
    }, conn);
    return cur;
  });
  await writeLog(req, 'vip_booking.confirm_deposit', 'vip_bookings', id, { deposit_amount: Number(bk.deposit_amount) });
  return ok(res, { id }, `รับมัดจำ ${baht(bk.deposit_amount)} บาทแล้ว`);
}

async function updatePreorder(req, res, b) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id']);
  const id = toId(b.id);
  const s = await shopSettings();
  const result = await transaction(async (conn) => {
    const cur = await lockBooking(conn, id);
    if (!abilities(cur, s, user).can_edit_preorder) {
      throw fail('แก้รายการสั่งล่วงหน้าได้เฉพาะการจองที่ยังไม่มาถึง และก่อนวันจองอย่างน้อย 1 วัน (BR-15)', 409);
    }
    const { items, total } = await priceItems(conn, b.items || []);
    // ก่อนรับมัดจำ = คิดมัดจำใหม่ · หลังรับมัดจำแล้ว มัดจำไม่เปลี่ยน ส่วนต่างไปจ่ายตอนชำระ
    const deposit = cur.status === 'pending_deposit' ? depositOf(cur.room_fee, total, s) : Number(cur.deposit_amount);
    await conn.execute('DELETE FROM vip_booking_items WHERE booking_id = ?', [id]);
    await insertItems(conn, id, items);
    await conn.execute('UPDATE vip_bookings SET preorder_total = ?, deposit_amount = ? WHERE id = ?', [total, deposit, id]);
    return { from: Number(cur.preorder_total), total, deposit, depositFrom: Number(cur.deposit_amount) };
  });
  await writeLog(req, 'vip_booking.update_preorder', 'vip_bookings', id,
    { from: result.from, to: result.total, deposit_from: result.depositFrom, deposit_to: result.deposit });
  return ok(res, { id, preorder_total: result.total, deposit_amount: result.deposit },
    result.total ? `แก้รายการสั่งล่วงหน้าแล้ว ยอดอาหาร ${baht(result.total)} บาท` : 'ล้างรายการสั่งล่วงหน้าแล้ว');
}

/**
 * ลูกค้ามาถึง: เปิดบิลห้อง VIP (ตรรกะเดียวกับ /api/bills open) + สั่งล่วงหน้าเป็นออเดอร์รอบ 1 (ถ้ามี)
 * ไม่มีรายการสั่งล่วงหน้า = เปิดบิลเปล่า · เหมาวันรอบเย็น = เปิดบิลใหม่เก็บที่ evening_bill_id (ไม่ส่งอาหารซ้ำ)
 */
async function arrive(req, res, b) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id']);
  const id = toId(b.id);
  const s = await shopSettings();
  const token = crypto.randomBytes(16).toString('hex');

  const result = await transaction(async (conn) => {
    const bk = await lockBooking(conn, id);
    if (bk.status === 'pending_deposit') throw fail('ยังไม่ได้รับมัดจำ กรุณากดรับมัดจำก่อน', 409);
    const can = abilities(bk, s, user);
    if (!can.can_arrive) {
      throw fail(`เปิดห้องได้เฉพาะการจองที่ยืนยันแล้ว ในวันจอง ตั้งแต่ ${EARLY_ARRIVE_MIN} นาทีก่อนเวลาเริ่มจนจบช่วงจอง`
        + (bk.hours === null ? ' (เหมาวันเปิดได้รอบละครั้ง)' : ''), 409);
    }
    const evening = can.is_evening_arrive;

    const [[room]] = await conn.execute('SELECT id, name, status, is_active FROM vip_rooms WHERE id = ? FOR UPDATE', [bk.vip_room_id]);
    if (!room || room.is_active !== 1) throw fail('ห้องนี้ปิดใช้งานอยู่', 409);
    const [[openBill]] = await conn.execute(
      "SELECT bill_no FROM bills WHERE vip_room_id = ? AND status = 'open' LIMIT 1", [room.id]);
    if (room.status !== 'available' || openBill) {
      throw fail(`${room.name} ยังมีลูกค้าอยู่${openBill ? ` (บิล ${openBill.bill_no})` : ''} ต้องปิดบิลเดิมก่อน`, 409);
    }

    // เลขบิล B+YYYYMMDD-ลำดับ 4 หลัก (รูปแบบเดียวกับ routes/bills.js · หาลำดับจากตัวเลข)
    const prefix = 'B' + todayStr().replace(/-/g, '') + '-';
    const [[last]] = await conn.execute(
      'SELECT MAX(CAST(SUBSTRING(bill_no, ?) AS UNSIGNED)) AS seq FROM bills WHERE bill_no LIKE ? FOR UPDATE',
      [prefix.length + 1, prefix + '%']);
    const billNo = prefix + String(Number((last && last.seq) || 0) + 1).padStart(4, '0');
    const [insBill] = await conn.execute(
      'INSERT INTO bills (bill_no, guests, vip_room_id, qr_token, opened_by) VALUES (?, ?, ?, ?, ?)',
      [billNo, bk.guests, room.id, token, user.id]);
    const billId = insBill.insertId;
    await conn.execute("UPDATE vip_rooms SET status = 'occupied' WHERE id = ?", [room.id]);

    // สั่งล่วงหน้า → ออเดอร์รอบ 1 ของบิลแรกเท่านั้น (ราคาตามที่ตกลงตอนจอง)
    let itemCount = 0;
    if (!evening) {
      const [items] = await conn.execute(
        'SELECT menu_item_id, qty, unit_price FROM vip_booking_items WHERE booking_id = ? ORDER BY id', [id]);
      if (items.length) {
        const [insOrder] = await conn.execute(
          "INSERT INTO orders (bill_id, round_no, source, created_by) VALUES (?, 1, 'vip_preorder', ?)", [billId, user.id]);
        for (const it of items) {
          await conn.execute(
            'INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, updated_by) VALUES (?, ?, ?, ?, ?)',
            [insOrder.insertId, it.menu_item_id, it.qty, it.unit_price, user.id]);
        }
      }
      itemCount = items.length;
      // checkout.js คิดค่าห้อง + หักมัดจำจาก vip_bookings.bill_id
      await conn.execute("UPDATE vip_bookings SET status = 'arrived', bill_id = ? WHERE id = ?", [billId, id]);
    } else {
      await conn.execute('UPDATE vip_bookings SET evening_bill_id = ? WHERE id = ?', [billId, id]);
    }
    const [[row]] = await conn.execute('SELECT opened_at FROM bills WHERE id = ?', [billId]);
    return { bill_id: billId, bill_no: billNo, opened_at: row.opened_at, room_name: room.name, guests: bk.guests, itemCount, evening };
  });

  await writeLog(req, 'bill.open', 'bills', result.bill_id,
    { bill_no: result.bill_no, places: [result.room_name], guests: result.guests, vip_booking_id: id });
  await writeLog(req, 'vip_booking.arrive', 'vip_bookings', id,
    { bill_id: result.bill_id, bill_no: result.bill_no, round: result.evening ? 'evening' : 'first' });
  const msg = result.evening
    ? `เปิด${result.room_name} รอบเย็นแล้ว (บิล ${result.bill_no})`
    : `เปิด${result.room_name} แล้ว${result.itemCount ? ` · ส่งรายการสั่งล่วงหน้า ${result.itemCount} รายการเข้าครัว` : ' · บิลเปล่า (ไม่มีสั่งล่วงหน้า)'}`;
  return ok(res, {
    bill_id: result.bill_id,
    bill_no: result.bill_no,
    guests: result.guests,
    opened_at: result.opened_at,
    place: result.room_name,
    qr_token: token,
    qr_url: config.baseUrl + '/customer/menu.html?token=' + token,
  }, msg);
}

/**
 * ปิดการจองที่ยังไม่มาถึง:
 *   no_show   → หลังจบช่วงจองเท่านั้น · มัดจำไม่คืน
 *   released  → ลูกค้ายืนยันไม่มา (วันจอง ก่อนจบช่วงจอง) · released_at = ตอนนี้ · มัดจำไม่คืน · เวลาที่เหลือว่าง
 *   cancelled → ลูกค้ายกเลิก มัดจำไม่คืน · refund: 1 = ร้านยกเลิกเพราะเหตุสุดวิสัย (manager+) คืนมัดจำ
 */
async function closeBooking(req, res, b, status) {
  const user = await mustHavePerm(req, 'vip_booking');
  requireFields(b, ['id']);
  const id = toId(b.id);
  const refund = status === 'cancelled' && (b.refund === 1 || b.refund === true || b.refund === '1');
  if (refund) await mustBe(req, MANAGERS);
  const reason = b.cancel_reason === undefined || b.cancel_reason === null ? '' : String(b.cancel_reason).trim();
  if (reason.length > 255) throw fail('เหตุผลยาวไม่เกิน 255 ตัวอักษร', 422);
  if (refund && !reason) throw fail('กรุณาใส่เหตุผลที่ร้านยกเลิก (เหตุสุดวิสัย)', 422);
  const s = await shopSettings();

  const bk = await transaction(async (conn) => {
    const cur = await lockBooking(conn, id);
    const can = abilities(cur, s, user);
    if (status === 'no_show' && !can.can_no_show) {
      throw fail('กด "ไม่มา" ได้หลังจบช่วงเวลาจองแล้ว และการจองยังไม่มาถึง', 409);
    }
    if (status === 'released' && !can.can_release) {
      throw fail('ปล่อยห้องได้เฉพาะการจองของวันนี้ที่ยังไม่มาถึง และยังไม่จบช่วงเวลาจอง', 409);
    }
    if (status === 'cancelled' && !(refund ? can.can_cancel_refund : can.can_cancel)) {
      throw fail(refund ? 'ยกเลิกแบบคืนมัดจำได้เฉพาะการจองที่ยังไม่มาถึง' : 'ยกเลิกได้เฉพาะการจองที่ยังไม่มาถึงและยังไม่จบช่วงเวลาจอง', 409);
    }

    const sets = ['status = ?'];
    const params = [status];
    if (status === 'released') sets.push('released_at = NOW()');
    if (status === 'cancelled') { sets.push('cancel_reason = ?'); params.push(reason || null); }
    if (refund && cur.deposit_received_at) { sets.push('deposit_refunded_at = NOW()', 'deposit_refunded_by = ?'); params.push(user.id); }
    await conn.execute(`UPDATE vip_bookings SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);

    if (status === 'cancelled') {
      const depositText = !cur.deposit_received_at ? ''
        : refund ? ` ร้านจะคืนมัดจำ ${baht(cur.deposit_amount)} บาท` : ` มัดจำ ${baht(cur.deposit_amount)} บาท ไม่คืนตามเงื่อนไข`;
      await publish('notify', {
        channel: 'sms', to: cur.customer_phone, title: 'ยกเลิกการจองห้อง VIP',
        message: `${s.shop_name}: การจอง${cur.room_name} วันที่ ${smsTime(cur, s)} ถูกยกเลิกแล้ว`
               + `${refund ? ` เนื่องจาก${reason} ขออภัยในความไม่สะดวก` : ''}${depositText}`,
      }, conn);
    }
    return cur;
  });

  const paid = bk.deposit_received_at ? Number(bk.deposit_amount) : 0;
  const kept = refund ? 0 : paid;
  const action = { no_show: 'no_show', released: 'release', cancelled: 'cancel' }[status];
  await writeLog(req, 'vip_booking.' + action, 'vip_bookings', id,
    { customer_name: bk.customer_name, deposit_kept: kept, deposit_refunded: refund ? paid : 0, reason: reason || undefined });

  const label = { no_show: 'บันทึกลูกค้าไม่มาแล้ว', released: `ปล่อย${bk.room_name}คืนแล้ว`, cancelled: 'ยกเลิกการจองแล้ว' }[status];
  const tail = refund && paid ? ` · คืนมัดจำ ${baht(paid)} บาท` : kept ? ` · มัดจำ ${baht(kept)} บาท ไม่คืน` : '';
  return ok(res, { id, deposit_kept: kept, deposit_refunded: refund ? paid : 0 }, label + tail);
}

/**
 * เลื่อนการจอง (ห้องเดิมหรือห้องใหม่ · เปลี่ยนแพ็กเกจได้)
 *   ลูกค้าเลื่อน (shop = false): reschedule_count = 0 · แจ้งก่อนวันจองเดิม ≥ 1 วัน · วันใหม่ ≤ วันเดิม + 14 วัน
 *   ร้านเลื่อน (shop = true, manager+): ไม่นับสิทธิ์ ไม่เช็ก 14 วัน ต้องมีเหตุผล
 *   มัดจำย้ายตาม: รับแล้ว = คงเดิม (ส่วนต่างค่าห้องไปจ่ายตอนชำระ) · ยังไม่รับ = คิดใหม่
 */
async function reschedule(req, res, b, shop) {
  const user = await mustHavePerm(req, 'vip_booking');
  if (shop) await mustBe(req, MANAGERS);
  requireFields(b, ['id', 'booking_date']);
  const id = toId(b.id);
  const date = cleanDate(b.booking_date);
  const reason = String(b.reason ?? b.cancel_reason ?? '').trim();
  if (shop && !reason) throw fail('กรุณาใส่เหตุผลที่ร้านต้องเลื่อน (เหตุสุดวิสัย)', 422);
  if (reason.length > 255) throw fail('เหตุผลยาวไม่เกิน 255 ตัวอักษร', 422);
  const s = await shopSettings();

  const result = await transaction(async (conn) => {
    const cur = await lockBooking(conn, id);
    const can = abilities(cur, s, user);
    if (shop && !can.can_shop_reschedule) throw fail('เลื่อนได้เฉพาะการจองที่ยังไม่มาถึง', 409);
    if (!shop) {
      if (!PENDING.includes(cur.status)) throw fail('เลื่อนได้เฉพาะการจองที่ยังไม่มาถึง', 409);
      if (Number(cur.reschedule_count) > 0) throw fail('การจองนี้ใช้สิทธิ์เลื่อนไปแล้ว (เลื่อนได้ 1 ครั้ง)', 409);
      if (!(todayStr() < cur.booking_date)) throw fail('ต้องแจ้งเลื่อนก่อนวันจองเดิมอย่างน้อย 1 วัน', 409);
      if (date > addDays(cur.booking_date, RESCHEDULE_MAX_DAYS)) {
        throw fail(`เลื่อนได้ไม่เกิน ${RESCHEDULE_MAX_DAYS} วันจากวันจองเดิม (ภายใน ${addDays(cur.booking_date, RESCHEDULE_MAX_DAYS)})`, 422);
      }
    }

    const pkg = b.package_id ? await loadPackage(conn, b.package_id)
      : cur.package_id ? await loadPackage(conn, cur.package_id) : null;
    if (!pkg) throw fail('กรุณาเลือกแพ็กเกจ', 422);
    if (pkg.hours !== null && !b.start_time) throw fail('ข้อมูลไม่ครบ: start_time', 422);
    const { start, segs } = checkTime(s, date, pkg, b.start_time);

    const roomId = b.vip_room_id ? toId(b.vip_room_id, 'รหัสห้อง') : cur.vip_room_id;
    const [[room]] = await conn.execute('SELECT id, name, seats, is_active FROM vip_rooms WHERE id = ? FOR UPDATE', [roomId]);
    if (!room || room.is_active !== 1) throw fail('ไม่พบห้อง VIP นี้', 404);
    if (cur.guests > Math.min(room.seats, MAX_GUESTS)) throw fail(`${room.name} รับได้ไม่เกิน ${room.seats} คน`, 422);
    try {
      await checkRoomFree(conn, s, roomId, date, segs, id);
    } catch (e) {
      // ลูกค้าเลื่อนไม่ได้เพราะเต็ม → เลือกเวลาอื่น หรือยกเลิก (มัดจำไม่คืน)
      throw fail(e.message + (shop ? '' : ' · ถ้าเลื่อนไม่ได้เพราะห้องเต็ม ลูกค้ายกเลิกได้ (มัดจำไม่คืน)'), e.status || 409);
    }

    const roomFee = pkg.price;
    const deposit = cur.status === 'pending_deposit' ? depositOf(roomFee, cur.preorder_total, s) : Number(cur.deposit_amount);
    const from = {
      booking_date: cur.booking_date, start_time: fromMin(toMin(cur.start_time)), hours: cur.hours,
      package_id: cur.package_id, vip_room_id: cur.vip_room_id, room_fee: Number(cur.room_fee),
      by: shop ? 'shop' : 'customer', reason: reason || null, at: new Date().toISOString(),
    };
    await conn.execute(
      `UPDATE vip_bookings
          SET vip_room_id = ?, package_id = ?, booking_date = ?, start_time = ?, hours = ?, room_fee = ?, deposit_amount = ?,
              reschedule_count = reschedule_count + ?, rescheduled_from = ?
        WHERE id = ?`,
      [roomId, pkg.id, date, fromMin(start) + ':00', pkg.hours, roomFee, deposit, shop ? 0 : 1, JSON.stringify(from), id]);

    const next = { booking_date: date, start_time: fromMin(start), hours: pkg.hours };
    await publish('notify', {
      channel: 'sms', to: cur.customer_phone, title: 'เลื่อนการจองห้อง VIP',
      message: `${s.shop_name}: เลื่อนการจอง${cur.room_name} วันที่ ${smsTime(cur, s)} `
             + `เป็น${room.name} ${pkg.name} วันที่ ${smsTime(next, s)} แล้ว`
             + `${shop ? ` เนื่องจาก${reason} ขออภัยในความไม่สะดวก` : ''}`
             + `${cur.deposit_received_at ? ` มัดจำ ${baht(cur.deposit_amount)} บาท ย้ายตามการจอง` : ''}`,
    }, conn);
    return { from, to: { booking_date: date, time: timeLabel(segs), package: pkg.code, room: room.name }, roomFee, deposit, label: timeLabel(segs), room };
  });

  await writeLog(req, shop ? 'vip_booking.shop_reschedule' : 'vip_booking.reschedule', 'vip_bookings', id,
    { from: result.from, to: result.to, room_fee: result.roomFee });
  return ok(res, { id, room_fee: result.roomFee, deposit_amount: result.deposit, time_label: result.label },
    `เลื่อนเป็น${result.room.name} ${result.to.booking_date} ${result.label} น. แล้ว`);
}

module.exports = router;
