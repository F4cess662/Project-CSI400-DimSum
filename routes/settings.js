/**
 * /api/settings — ตั้งค่าร้าน (คนที่ 4 · เฟส 1)
 * GET  → ตั้งค่าร้านทั้งหมด (สาธารณะ ไม่ต้องล็อกอิน · หน้าลูกค้าใช้แสดงเวลาเปิด-ปิด)
 * POST {"action":"update", ...เฉพาะฟิลด์ที่ต้องการแก้}   (owner · log ระดับ system)
 *   ข้อมูลร้าน : shop_name, phone, email, address
 *   เวลา 2 กะ  : morning_open, morning_last_order, morning_close, evening_open, evening_last_order, evening_close ("HH:MM")
 *   อื่นๆ      : max_qty_per_item, vip_min_spend, vip_deposit_percent, vip_max_hours
 */
const router = require('express').Router();
const { query } = require('../lib/db');
const { ok, fail, handle } = require('../lib/response');
const { mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { shopSettings } = require('../lib/shop');

const TEXT = { shop_name: ['ชื่อร้าน', 100, true], phone: ['เบอร์โทร', 20, false], email: ['อีเมล', 100, false], address: ['ที่อยู่', 255, false] };
const TIMES = {
  morning_open: 'เวลาเปิดรอบเช้า', morning_last_order: 'เวลาปิดรับออเดอร์รอบเช้า', morning_close: 'เวลาปิดรอบเช้า',
  evening_open: 'เวลาเปิดรอบเย็น', evening_last_order: 'เวลาปิดรับออเดอร์รอบเย็น', evening_close: 'เวลาปิดรอบเย็น',
};
const NUMS = {
  max_qty_per_item: ['จำนวนสูงสุดต่อรายการ', 1, 99, true],
  vip_min_spend: ['ยอดสั่งขั้นต่ำห้อง VIP', 0, 1000000, false],
  vip_deposit_percent: ['เปอร์เซ็นต์มัดจำห้อง VIP', 0, 100, true],
  vip_max_hours: ['ชั่วโมงสูงสุดห้อง VIP', 1, 24, true],
};

/** 'HH:MM' หรือ 'HH:MM:SS' → 'HH:MM:SS' */
function normTime(value, label) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(String(value).trim());
  if (!m) throw fail(label + 'ต้องอยู่ในรูปแบบ HH:MM', 422);
  return `${m[1]}:${m[2]}:${m[3] || '00'}`;
}

/** ลำดับเวลาต้องสมเหตุสมผล: เปิด < ปิดรับออเดอร์ ≤ ปิด และรอบเช้าปิดก่อนรอบเย็นเปิด */
function checkTimeOrder(s) {
  if (!(s.morning_open < s.morning_last_order && s.morning_last_order <= s.morning_close)) {
    throw fail('รอบเช้า: เวลาเปิดต้องก่อนเวลาปิดรับออเดอร์ และปิดรับออเดอร์ต้องไม่เกินเวลาปิด', 422);
  }
  if (!(s.morning_close < s.evening_open)) throw fail('รอบเช้าต้องปิดก่อนรอบเย็นเปิด', 422);
  if (!(s.evening_open < s.evening_last_order && s.evening_last_order <= s.evening_close)) {
    throw fail('รอบเย็น: เวลาเปิดต้องก่อนเวลาปิดรับออเดอร์ และปิดรับออเดอร์ต้องไม่เกินเวลาปิด', 422);
  }
}

/* ---------- GET (สาธารณะ) ---------- */
router.get('/', handle(async (req, res) => ok(res, await shopSettings())));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'update': {
      await mustBe(req, ['owner']);
      const current = await shopSettings();
      if (!current) throw fail('ยังไม่มีข้อมูลตั้งค่าร้านในฐานข้อมูล (shop_settings id = 1)', 500);
      const next = {};

      for (const [key, [label, max, required]] of Object.entries(TEXT)) {
        if (b[key] === undefined) continue;
        const v = String(b[key] ?? '').trim();
        if (required && !v) throw fail('กรุณากรอก' + label, 422);
        if (v.length > max) throw fail(`${label}ยาวไม่เกิน ${max} ตัวอักษร`, 422);
        if (key === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw fail('รูปแบบอีเมลไม่ถูกต้อง', 422);
        next[key] = v === '' ? null : v;
      }
      for (const [key, label] of Object.entries(TIMES)) {
        if (b[key] !== undefined) next[key] = normTime(b[key], label);
      }
      for (const [key, [label, min, max, integer]] of Object.entries(NUMS)) {
        if (b[key] === undefined) continue;
        const n = Number(b[key]);
        if (b[key] === '' || b[key] === null || !Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
          throw fail(`${label} ต้องเป็น${integer ? 'จำนวนเต็ม' : 'ตัวเลข'}ระหว่าง ${min} ถึง ${max}`, 422);
        }
        next[key] = n;
      }

      checkTimeOrder({ ...current, ...next });

      // เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง
      const changes = {};
      for (const [key, value] of Object.entries(next)) {
        if (String(current[key] ?? '') !== String(value ?? '')) changes[key] = { from: current[key], to: value };
      }
      const keys = Object.keys(changes);
      if (!keys.length) return ok(res, await shopSettings(), 'ไม่มีการเปลี่ยนแปลง');

      await query(`UPDATE shop_settings SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = 1`,
        keys.map((k) => next[k]));
      await writeLog(req, 'settings.update', 'shop_settings', 1, changes, 'system');
      return ok(res, await shopSettings(), 'บันทึกการตั้งค่าร้านแล้ว');
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
