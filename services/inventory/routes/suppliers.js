/**
 * /api/suppliers — ซัพพลายเออร์ + ราคาวัตถุดิบ (FR-54, 55) · เฟส 4 · คน 2 · สิทธิ์: manager+
 *   GET                       → รายชื่อซัพพลายเออร์ (ทั้งที่เปิดและปิดใช้) + จำนวนวัตถุดิบที่มีราคา
 *   GET ?id=                  → ซัพพลายเออร์รายเดียว + ราคาของวัตถุดิบทุกตัว (ยังไม่มีราคา = price null)
 *   GET ?ingredient_id=       → เทียบราคาทุกเจ้า เรียงจากถูกไปแพง (เฉพาะร้านที่เปิดใช้)
 *   GET ?action=ingredients   → รายชื่อวัตถุดิบที่ใช้งาน (ไว้ใส่ dropdown หน้าเทียบราคา)
 *   POST create / update / deactivate / activate
 *   POST set_price {supplier_id, ingredient_id, price, quoted_at} → บันทึกราคาจากใบเสนอราคา (ทับราคาเก่า)
 */
const router = require('express').Router();
const { query, queryOne } = require('../../../lib/db');
const { ok, fail, requireFields, handle } = require('../../../lib/response');
const { requireRole, mustBe } = require('../../../lib/auth');
const { writeLog } = require('../../../lib/log');
const config = require('../../../config');

const ROLES = ['manager', 'owner'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
const round2 = (n) => Math.round(n * 100) / 100;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));

// ตรวจและทำความสะอาดฟิลด์ของซัพพลายเออร์ (create / update ใช้ร่วมกัน)
function cleanSupplier(b) {
  const name = String(b.name || '').trim();
  if (!name) throw fail('กรุณากรอกชื่อร้าน', 422);
  const lead = b.lead_time_days === undefined || b.lead_time_days === '' ? 1 : Number(b.lead_time_days);
  if (!Number.isInteger(lead) || lead < 0) throw fail('ระยะเวลาส่งของต้องเป็นจำนวนวัน (0 ขึ้นไป)', 422);
  const opt = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
  return { name, contact_name: opt(b.contact_name), phone: opt(b.phone), line_id: opt(b.line_id), lead_time_days: lead };
}

router.get('/', requireRole(ROLES), handle(async (req, res) => {
  // วัตถุดิบสำหรับ dropdown
  if (req.query.action === 'ingredients') {
    return ok(res, await query('SELECT id, name, unit FROM ingredients WHERE is_active = 1 ORDER BY name'));
  }

  // เทียบราคาทุกเจ้าของวัตถุดิบหนึ่งตัว
  if (req.query.ingredient_id) {
    const ing = await queryOne('SELECT id, name, unit FROM ingredients WHERE id = ?', [req.query.ingredient_id]);
    if (!ing) throw fail('ไม่พบวัตถุดิบนี้', 404);
    const rows = await query(
      `SELECT s.id AS supplier_id, s.name, s.contact_name, s.line_id, s.lead_time_days, sp.price, sp.quoted_at
         FROM supplier_prices sp JOIN suppliers s ON s.id = sp.supplier_id
        WHERE sp.ingredient_id = ? AND s.is_active = 1
        ORDER BY sp.price ASC, s.lead_time_days ASC, s.name`, [ing.id]);
    const prices = rows.map((r) => ({ ...r, price: Number(r.price) }));
    const min = prices.length ? prices[0].price : null;
    prices.forEach((p) => { p.is_cheapest = p.price === min; });   // ราคาเท่ากัน = ถูกที่สุดทั้งคู่
    return ok(res, { ingredient: ing, prices });
  }

  // ร้านเดียว + ราคาวัตถุดิบทุกตัว
  if (req.query.id) {
    const s = await queryOne('SELECT * FROM suppliers WHERE id = ?', [req.query.id]);
    if (!s) throw fail('ไม่พบซัพพลายเออร์นี้', 404);
    const prices = await query(
      `SELECT i.id AS ingredient_id, i.name, i.unit, sp.price, sp.quoted_at
         FROM ingredients i
         LEFT JOIN supplier_prices sp ON sp.ingredient_id = i.id AND sp.supplier_id = ?
        WHERE i.is_active = 1 ORDER BY i.name`, [s.id]);
    return ok(res, { ...s, prices: prices.map((p) => ({ ...p, price: p.price === null ? null : Number(p.price) })) });
  }

  // รายชื่อทั้งหมด
  const q = req.query.q ? '%' + req.query.q + '%' : '%';
  const rows = await query(
    `SELECT s.*, (SELECT COUNT(*) FROM supplier_prices sp WHERE sp.supplier_id = s.id) AS price_count
       FROM suppliers s WHERE s.name LIKE ? ORDER BY s.is_active DESC, s.name`, [q]);
  return ok(res, rows);
}));

router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': {
      await mustBe(req, ROLES);
      const s = cleanSupplier(b);
      if (await queryOne('SELECT id FROM suppliers WHERE name = ?', [s.name])) throw fail('มีร้านชื่อนี้อยู่แล้ว', 409);
      const r = await query(
        `INSERT INTO suppliers (name, contact_name, phone, line_id, lead_time_days) VALUES (?, ?, ?, ?, ?)`,
        [s.name, s.contact_name, s.phone, s.line_id, s.lead_time_days]);
      await writeLog(req, 'supplier.create', 'suppliers', r.insertId, s);
      return ok(res, { id: r.insertId }, 'เพิ่มซัพพลายเออร์แล้ว');
    }
    case 'update': {
      await mustBe(req, ROLES);
      requireFields(b, ['id']);
      if (!(await queryOne('SELECT id FROM suppliers WHERE id = ?', [b.id]))) throw fail('ไม่พบซัพพลายเออร์นี้', 404);
      const s = cleanSupplier(b);
      if (await queryOne('SELECT id FROM suppliers WHERE name = ? AND id <> ?', [s.name, b.id])) throw fail('มีร้านชื่อนี้อยู่แล้ว', 409);
      await query(
        `UPDATE suppliers SET name = ?, contact_name = ?, phone = ?, line_id = ?, lead_time_days = ? WHERE id = ?`,
        [s.name, s.contact_name, s.phone, s.line_id, s.lead_time_days, b.id]);
      await writeLog(req, 'supplier.update', 'suppliers', b.id, s);
      return ok(res, { id: Number(b.id) }, 'บันทึกข้อมูลซัพพลายเออร์แล้ว');
    }
    case 'deactivate':
    case 'activate': {
      await mustBe(req, ROLES);
      requireFields(b, ['id']);
      if (!(await queryOne('SELECT id FROM suppliers WHERE id = ?', [b.id]))) throw fail('ไม่พบซัพพลายเออร์นี้', 404);
      const on = b.action === 'activate' ? 1 : 0;
      await query('UPDATE suppliers SET is_active = ? WHERE id = ?', [on, b.id]);
      await writeLog(req, 'supplier.' + b.action, 'suppliers', b.id);
      return ok(res, { id: Number(b.id) }, on ? 'เปิดใช้ซัพพลายเออร์แล้ว' : 'ปิดใช้ซัพพลายเออร์แล้ว');
    }
    case 'set_price': {
      await mustBe(req, ROLES);
      requireFields(b, ['supplier_id', 'ingredient_id', 'price']);
      const price = Number(b.price);
      if (!Number.isFinite(price) || price <= 0) throw fail('ราคาต้องเป็นตัวเลขมากกว่า 0', 422);
      const quotedAt = b.quoted_at || today();
      if (!isDate(quotedAt)) throw fail('รูปแบบวันที่ใบเสนอราคาไม่ถูกต้อง', 422);
      if (!(await queryOne('SELECT id FROM suppliers WHERE id = ? AND is_active = 1', [b.supplier_id]))) throw fail('ไม่พบซัพพลายเออร์ หรือถูกปิดใช้งานแล้ว', 404);
      if (!(await queryOne('SELECT id FROM ingredients WHERE id = ? AND is_active = 1', [b.ingredient_id]))) throw fail('ไม่พบวัตถุดิบนี้', 404);
      const old = await queryOne('SELECT price FROM supplier_prices WHERE supplier_id = ? AND ingredient_id = ?', [b.supplier_id, b.ingredient_id]);
      await query(
        `INSERT INTO supplier_prices (supplier_id, ingredient_id, price, quoted_at) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE price = VALUES(price), quoted_at = VALUES(quoted_at)`,
        [b.supplier_id, b.ingredient_id, round2(price), quotedAt]);
      await writeLog(req, 'supplier.set_price', 'supplier_prices', Number(b.supplier_id),
        { ingredient_id: Number(b.ingredient_id), old_price: old ? Number(old.price) : null, price: round2(price), quoted_at: quotedAt });
      return ok(res, { supplier_id: Number(b.supplier_id), ingredient_id: Number(b.ingredient_id), price: round2(price), quoted_at: quotedAt }, 'บันทึกราคาแล้ว');
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;