/**
 * /api/shifts — ปิดยอดกะ (FR-31) · สิทธิ์: staff+ ที่ติ๊ก [รับเงิน]
 *   GET  ?date=YYYY-MM-DD&shift=morning|evening → ยอดเงินสดในระบบของกะ + ประวัติปิดยอด + open_bills (บิลที่ยังเปิดอยู่)
 *   POST {"action":"close","shift":"morning","counted_cash":1250} → บันทึกปิดยอด + ส่วนต่าง
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requirePerm, mustHavePerm } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { shopSettings, currentShift, nowTime } = require('../lib/shop');
const config = require('../config');

const SHIFTS = ['morning', 'evening'];
const SHIFT_TH = { morning: 'กะเช้า', evening: 'กะเย็น' };

// วันนี้ตามเวลาไทย เป็นข้อความ 'YYYY-MM-DD' (en-CA คือรูปแบบวันที่ที่ต้องการพอดี)
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
}

// ปัดทศนิยม 2 ตำแหน่ง กัน 0.1+0.2 = 0.30000000000000004
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * ยอดเงินสดในระบบ = ผลรวม total_paid ของบิล paid + จ่ายเงินสด ที่ closed_at อยู่ในหน้าต่างเวลา:
 *   กะเช้า → ตั้งแต่ 00:00 ของวันนั้น
 *   กะเย็น → ตั้งแต่เวลาที่ปิดยอดกะเช้า (ถ้าไม่ได้ปิดกะเช้า = ตั้งแต่ 00:00)
 * ไปจนสิ้นวัน ไม่ผูกกับเวลาเปิด-ปิดร้าน จึงรวมบิลที่จ่ายนอกช่วงกะ (เช่น 14:30) ไว้ในกะถัดไปไม่ตกหล่น
 */
async function systemCash(date, shift) {
  let start = date + ' 00:00:00';
  if (shift === 'evening') {
    const m = await queryOne(
      `SELECT created_at FROM shift_closings WHERE shift_date = ? AND shift = 'morning' ORDER BY id DESC LIMIT 1`, [date]);
    if (m) start = m.created_at;
  }
  const row = await queryOne(
    `SELECT COALESCE(SUM(total_paid), 0) AS system_cash, COUNT(*) AS bill_count
       FROM bills
      WHERE status = 'paid' AND payment_method = 'cash'
        AND closed_at > ? AND closed_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [start, date]);
  return { system_cash: Number(row.system_cash), bill_count: Number(row.bill_count) };
}

// ตรวจ date/shift ที่ส่งมา (ไม่ส่ง = ใช้ค่าเริ่มต้น)
function checkShift(shift) {
  if (!SHIFTS.includes(shift)) throw fail('กะต้องเป็น morning หรือ evening', 422);
}

router.get('/', requirePerm('payment'), handle(async (req, res) => {
  const date = req.query.date || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date))) throw fail('รูปแบบวันที่ไม่ถูกต้อง', 422);
  const shift = req.query.shift || (await currentShift()) || 'morning';
  checkShift(shift);

  // การปิดยอดล่าสุดของกะนี้ (ถ้าเคยปิดแล้ว)
  const closed = await queryOne(
    `SELECT sc.id, sc.counted_cash, sc.system_cash, sc.difference, sc.created_at, u.full_name
       FROM shift_closings sc JOIN users u ON u.id = sc.user_id
      WHERE sc.shift_date = ? AND sc.shift = ? ORDER BY sc.id DESC LIMIT 1`, [date, shift]);
  // ปิดแล้ว → ใช้ยอดที่บันทึกไว้ตอนปิด (ไม่คำนวณใหม่) / ยังไม่ปิด → คำนวณสด
  const sys = closed ? { system_cash: closed.system_cash, bill_count: null } : await systemCash(date, shift);
  // ประวัติ 30 รายการล่าสุด
  const history = await query(
    `SELECT sc.id, sc.shift_date, sc.shift, sc.counted_cash, sc.system_cash, sc.difference,
            sc.created_at, u.full_name
       FROM shift_closings sc JOIN users u ON u.id = sc.user_id
      ORDER BY sc.id DESC LIMIT 30`);

  // Feedback #1: บิลที่ยังเปิดอยู่ (ใช้เตือนก่อนปิดกะ)
  const open_bills = await query(
    `SELECT b.id, b.bill_no,
            COALESCE(vr.name, GROUP_CONCAT(dt.code ORDER BY dt.code SEPARATOR ', ')) AS place
       FROM bills b
       LEFT JOIN bill_tables bt ON bt.bill_id = b.id
       LEFT JOIN dining_tables dt ON dt.id = bt.table_id
       LEFT JOIN vip_rooms vr ON vr.id = b.vip_room_id
      WHERE b.status = 'open'
      GROUP BY b.id, b.bill_no, vr.name
      ORDER BY b.opened_at`);

  return ok(res, { date, today: today(), shift, ...sys, closed, history, open_bills });
}));

router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'close': {
      const user = await mustHavePerm(req, 'payment');
      requireFields(b, ['shift', 'counted_cash']);
      checkShift(b.shift);
      const counted = Number(b.counted_cash);
      if (!Number.isFinite(counted) || counted < 0) throw fail('เงินที่นับได้ต้องเป็นตัวเลข 0 ขึ้นไป', 422);

      const date = today();
      // ข้อ 3: กะที่ยังไม่เริ่มปิดยอดไม่ได้
      const st = await shopSettings();
      if (nowTime() < st[b.shift + '_open']) {
        throw fail(`ยังไม่ถึงเวลา${SHIFT_TH[b.shift]} (เปิด ${st[b.shift + '_open'].slice(0, 5)})`, 422);
      }
      // ข้อ 2: ห้ามปิดซ้ำกะเดียวกันในวันเดียวกัน
      if (await queryOne('SELECT id FROM shift_closings WHERE shift_date = ? AND shift = ?', [date, b.shift])) {
        throw fail(`${SHIFT_TH[b.shift]}วันนี้ปิดยอดไปแล้ว`, 409);
      }
      // คำนวณยอดในระบบใหม่ที่ server เสมอ ไม่เชื่อค่าที่หน้าเว็บส่งมา
      const cash = (await systemCash(date, b.shift)).system_cash;   // เฉพาะบิลเงินสด
      const openingFloat = b.opening_float === undefined ? 0 : Number(b.opening_float);
      if (!Number.isFinite(openingFloat) || openingFloat < 0) throw fail('เงินทอนตั้งต้นต้องเป็นตัวเลข 0 ขึ้นไป', 422);
      // ตรวจ: เงินที่นับได้ เทียบกับ (เงินสดในระบบ + เงินทอนตั้งต้น)
      // เก็บลง DB ไม่รวมเงินทอน: system_cash = เงินสดล้วน · counted_cash = นับได้ − เงินทอน
      const system_cash = cash;
      const counted_cash = round2(counted - openingFloat);
      const difference = round2(counted_cash - system_cash);   // + เกิน / - ขาด / 0 ตรง

      const r = await query(
        `INSERT INTO shift_closings (user_id, shift_date, shift, counted_cash, system_cash, difference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, date, b.shift, counted_cash, system_cash, difference]);
      await writeLog(req, 'shift.close', 'shift_closings', r.insertId,
        { date, shift: b.shift, counted_cash, counted_raw: counted, system_cash, opening_float: openingFloat, difference });

      const msg = difference === 0 ? 'ปิดยอดกะแล้ว เงินตรง'
        : difference < 0 ? `ปิดยอดกะแล้ว เงินขาด ${-difference} บาท`
        : `ปิดยอดกะแล้ว เงินเกิน ${difference} บาท`;
      return ok(res, { id: r.insertId, system_cash, counted_cash, difference }, msg);
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;