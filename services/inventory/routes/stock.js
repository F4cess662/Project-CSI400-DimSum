/**
 * /api/stock — ปรับสต็อกวัตถุดิบ (คนที่ 4 · เฟส 4 · inventory-service port 4002) · FR-61 · manager, owner
 *
 * GET [?ingredient_id=&movement_type=&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *     → ประวัติความเคลื่อนไหวสต็อก ล่าสุดขึ้นก่อน (ไม่ส่งช่วงวัน = 30 วันล่าสุด · สูงสุด 500 แถว)
 *       [{ id, ingredient_id, ingredient_name, unit, qty, movement_type, goods_receipt_id, expiry_date, note,
 *          created_by, created_by_name, created_at }]   qty มีเครื่องหมาย: + เพิ่ม / − ลด
 * GET ?action=ingredients
 *     → วัตถุดิบที่เปิดใช้ + คงเหลือ [{ id, name, unit, qty_on_hand, reorder_point, is_low }] (ใช้กรอกนับปลายวัน)
 * GET ?action=waste_weekly[&weeks=8]
 *     → ของเสียรายสัปดาห์ (จันทร์–อาทิตย์) ย้อนหลัง N สัปดาห์ (สูงสุด 26)
 *       { weeks: [{ week_start, week_end, total_value, items: [{ ingredient_id, name, unit, qty, value }] }] }
 *       value = จำนวน × ราคาต่ำสุดที่ซัพพลายเออร์เสนอ (ประมาณการ ใช้รวมข้ามหน่วยได้)
 *
 * POST {"action":"adjust", ...}  (ใน transaction เดียว: stock_movements + ingredients.qty_on_hand)
 *   นับปลายวัน : {"ingredient_id":1,"counted_qty":18.5,"note":"นับปิดร้าน"}
 *                → ส่วนต่าง (นับได้ − คงเหลือในระบบ) ติดลบ = บันทึกเป็น use · เกิน = บันทึกเป็น adjust · เท่ากัน = ไม่บันทึก
 *   ของเสีย    : {"ingredient_id":1,"movement_type":"waste","qty":2,"note":"หมดอายุ"} → ลดคงเหลือ 2
 *   ปรับยอด    : {"ingredient_id":1,"movement_type":"adjust","qty":-1.5,"note":"ชั่งใหม่"} → บวก/ลบตามเครื่องหมาย
 *   หลายรายการ : {"action":"adjust","items":[{ ...แบบเดียวกับด้านบน }, ...]} (หน้าตารางนับปลายวันส่งทีเดียว)
 *   หลังปรับแล้วคงเหลือ ≤ จุดสั่งซื้อซ้ำ → publish('notify', { channel: 'line', to: 'manager', title: 'วัตถุดิบใกล้หมด' })
 *
 * ใช้ได้เฉพาะตารางคลัง (ingredients, stock_movements, supplier_prices)
 */
const router = require('express').Router();
const { query, transaction } = require('../../../lib/db');
const { ok, fail, handle } = require('../../../lib/response');
const { mustBe } = require('../../../lib/auth');
const { writeLog } = require('../../../lib/log');
const { publish } = require('../../../lib/queue');

const ROLES = ['manager', 'owner'];
const MAX_QTY = 99999;
const TYPES = ['use', 'waste', 'adjust'];
const TYPE_TH = { receive: 'รับของ', use: 'ใช้ไป', waste: 'ของเสีย', adjust: 'ปรับยอด' };
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const fmtQty = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

function cleanDate(value, label) {
  const s = String(value || '').trim();
  const d = new Date(s + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw fail(label + 'ต้องอยู่ในรูปแบบ YYYY-MM-DD', 422);
  }
  return s;
}

function toNum(value, label, { min = -MAX_QTY, max = MAX_QTY } = {}) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < min || n > max) {
    throw fail(`${label}ต้องเป็นตัวเลขระหว่าง ${fmtQty(min)} ถึง ${fmtQty(max)}`, 422);
  }
  if (Math.abs(round2(n) - n) > 1e-9) throw fail(`${label}ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`, 422);
  return round2(n);
}

/* ---------- GET ---------- */
router.get('/', handle(async (req, res) => {
  await mustBe(req, ROLES);
  if (req.query.action === 'ingredients') return ingredientList(res);
  if (req.query.action === 'waste_weekly') return wasteWeekly(req, res);
  return history(req, res);
}));

async function ingredientList(res) {
  const rows = await query(
    `SELECT id, name, unit, qty_on_hand, reorder_point, (qty_on_hand <= reorder_point) AS is_low
       FROM ingredients WHERE is_active = 1 ORDER BY name`);
  return ok(res, rows.map((r) => ({ ...r, is_low: Number(r.is_low) === 1 })));
}

async function history(req, res) {
  const where = [];
  const params = [];
  if (req.query.ingredient_id) {
    const id = Number(req.query.ingredient_id);
    if (!Number.isInteger(id) || id < 1) throw fail('รหัสวัตถุดิบไม่ถูกต้อง', 422);
    where.push('m.ingredient_id = ?'); params.push(id);
  }
  if (req.query.movement_type) {
    if (![...TYPES, 'receive'].includes(req.query.movement_type)) throw fail('ประเภทไม่ถูกต้อง', 422);
    where.push('m.movement_type = ?'); params.push(req.query.movement_type);
  }
  const from = req.query.from ? cleanDate(req.query.from, 'วันเริ่ม') : null;
  const to = req.query.to ? cleanDate(req.query.to, 'วันสิ้นสุด') : null;
  if (from && to && from > to) throw fail('วันเริ่มต้องไม่หลังวันสิ้นสุด', 422);
  if (from) { where.push('m.created_at >= ?'); params.push(from + ' 00:00:00'); }
  if (to) { where.push('m.created_at < ? + INTERVAL 1 DAY'); params.push(to); }
  if (!from && !to) where.push('m.created_at >= CURDATE() - INTERVAL 30 DAY');

  const rows = await query(
    `SELECT m.id, m.ingredient_id, i.name AS ingredient_name, i.unit, m.qty, m.movement_type, m.goods_receipt_id,
            DATE_FORMAT(m.expiry_date, '%Y-%m-%d') AS expiry_date, m.note, m.created_by, u.full_name AS created_by_name, m.created_at
       FROM stock_movements m
       JOIN ingredients i ON i.id = m.ingredient_id
       LEFT JOIN users u ON u.id = m.created_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 500`, params);
  return ok(res, rows);
}

async function wasteWeekly(req, res) {
  const weeks = Math.min(Math.max(parseInt(req.query.weeks, 10) || 8, 1), 26);
  // สัปดาห์เริ่มวันจันทร์ · WEEKDAY(): จันทร์ = 0
  const rows = await query(
    `SELECT DATE_FORMAT(DATE(m.created_at) - INTERVAL WEEKDAY(m.created_at) DAY, '%Y-%m-%d') AS week_start,
            m.ingredient_id, i.name, i.unit, -SUM(m.qty) AS qty,
            (SELECT MIN(sp.price) FROM supplier_prices sp WHERE sp.ingredient_id = m.ingredient_id) AS price
       FROM stock_movements m JOIN ingredients i ON i.id = m.ingredient_id
      WHERE m.movement_type = 'waste'
        AND m.created_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY - INTERVAL ? WEEK
      GROUP BY week_start, m.ingredient_id, i.name, i.unit
      ORDER BY week_start, i.name`, [weeks - 1]);

  // ทุกสัปดาห์ในช่วง (สัปดาห์ที่ไม่มีของเสีย = 0) เรียงเก่า → ใหม่
  const [{ monday }] = await query(
    "SELECT DATE_FORMAT(CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY, '%Y-%m-%d') AS monday");
  const shift = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const list = [];
  for (let k = weeks - 1; k >= 0; k--) {
    const start = shift(monday, -7 * k);
    const items = rows.filter((r) => r.week_start === start).map((r) => ({
      ingredient_id: r.ingredient_id, name: r.name, unit: r.unit, qty: round2(r.qty),
      value: r.price === null ? 0 : round2(Number(r.qty) * Number(r.price)),
    }));
    list.push({ week_start: start, week_end: shift(start, 6), total_value: round2(items.reduce((a, it) => a + it.value, 0)), items });
  }
  return ok(res, { weeks: list });
}

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'adjust': return adjust(req, res, b);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

/** ตรวจ 1 รายการ → { ingredient_id, mode: 'count'|'waste'|'adjust', value, note } */
function parseLine(x, i) {
  const at = i === null ? '' : `รายการที่ ${i + 1}: `;
  const id = Number(x && x.ingredient_id);
  if (!Number.isInteger(id) || id < 1) throw fail(at + 'รหัสวัตถุดิบไม่ถูกต้อง', 422);
  const note = x.note === undefined || x.note === null ? '' : String(x.note).trim();
  if (note.length > 255) throw fail(at + 'หมายเหตุยาวไม่เกิน 255 ตัวอักษร', 422);

  if (x.counted_qty !== undefined && x.counted_qty !== null && x.counted_qty !== '') {
    return { ingredient_id: id, mode: 'count', value: toNum(x.counted_qty, at + 'จำนวนที่นับได้', { min: 0 }), note };
  }
  const type = x.movement_type;
  if (!TYPES.includes(type)) throw fail(at + 'ส่ง counted_qty (นับปลายวัน) หรือ movement_type เป็น use / waste / adjust', 422);
  if (type === 'adjust') {
    const v = toNum(x.qty, at + 'จำนวนที่ปรับ');
    if (v === 0) throw fail(at + 'จำนวนที่ปรับต้องไม่เป็น 0', 422);
    return { ingredient_id: id, mode: 'adjust', value: v, note };
  }
  // use / waste: ใส่จำนวนที่ใช้/เสียเป็นบวก ระบบลดคงเหลือให้
  const v = toNum(x.qty, at + (type === 'waste' ? 'จำนวนของเสีย' : 'จำนวนที่ใช้'), { min: 0.01 });
  if (type === 'waste' && !note) throw fail(at + 'กรุณาใส่สาเหตุของเสีย (เช่น หมดอายุ เน่าเสีย)', 422);
  return { ingredient_id: id, mode: type, value: v, note };
}

async function adjust(req, res, b) {
  const user = await mustBe(req, ROLES);
  const raw = Array.isArray(b.items) ? b.items : [b];
  if (!raw.length) throw fail('ไม่มีรายการที่จะบันทึก', 422);
  if (raw.length > 200) throw fail('บันทึกได้ครั้งละไม่เกิน 200 รายการ', 422);
  const lines = raw.map((x, i) => parseLine(x, Array.isArray(b.items) ? i : null));
  const ids = [...new Set(lines.map((l) => l.ingredient_id))];
  if (ids.length !== lines.length) throw fail('มีวัตถุดิบซ้ำในรายการ', 422);

  const result = await transaction(async (conn) => {
    const [ings] = await conn.execute(
      `SELECT id, name, unit, qty_on_hand, reorder_point, is_active FROM ingredients
        WHERE id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`, ids);
    const byId = new Map(ings.map((g) => [g.id, g]));
    const done = [];
    const alerts = [];

    for (const l of lines) {
      const g = byId.get(l.ingredient_id);
      if (!g || g.is_active !== 1) throw fail('ไม่พบวัตถุดิบนี้ หรือปิดใช้งานอยู่', 404);
      const before = round2(g.qty_on_hand);
      let delta;
      let type;
      if (l.mode === 'count') {
        delta = round2(l.value - before);
        type = delta < 0 ? 'use' : 'adjust';            // นับได้น้อยกว่าระบบ = ใช้ไป · มากกว่า = ปรับยอดขึ้น
      } else if (l.mode === 'adjust') {
        delta = l.value; type = 'adjust';
      } else {
        delta = -l.value; type = l.mode;                  // use / waste
      }
      const after = round2(before + delta);
      if (after < 0) {
        throw fail(`${g.name}: คงเหลือในระบบ ${fmtQty(before)} ${g.unit} ${TYPE_TH[type]} ${fmtQty(Math.abs(delta))} ${g.unit} จะติดลบ`, 422);
      }
      if (delta === 0) { done.push({ ingredient_id: g.id, name: g.name, unit: g.unit, before, after, delta: 0, movement_type: null }); continue; }

      const note = l.note || (l.mode === 'count' ? `นับปลายวัน: นับได้ ${fmtQty(l.value)} ${g.unit} (ระบบ ${fmtQty(before)})` : null);
      const [ins] = await conn.execute(
        'INSERT INTO stock_movements (ingredient_id, qty, movement_type, note, created_by) VALUES (?, ?, ?, ?, ?)',
        [g.id, delta, type, note, user.id]);
      await conn.execute('UPDATE ingredients SET qty_on_hand = ? WHERE id = ?', [after, g.id]);
      g.qty_on_hand = after;
      done.push({ ingredient_id: g.id, name: g.name, unit: g.unit, before, after, delta, movement_type: type, movement_id: ins.insertId });

      if (delta < 0 && after <= Number(g.reorder_point)) {
        alerts.push(g.name);
        await publish('notify', {
          channel: 'line', to: 'manager', title: 'วัตถุดิบใกล้หมด',
          message: `${g.name} เหลือ ${fmtQty(after)} ${g.unit} (จุดสั่งซื้อซ้ำ ${fmtQty(g.reorder_point)} ${g.unit}) `
                 + `หลัง${TYPE_TH[type]} ${fmtQty(Math.abs(delta))} ${g.unit} · กรุณาสั่งซื้อเพิ่ม`,
        }, conn);
      }
    }
    return { done, alerts };
  });

  const changed = result.done.filter((d) => d.delta !== 0);
  if (changed.length) {
    await writeLog(req, 'stock.adjust', 'ingredients', changed.length === 1 ? changed[0].ingredient_id : null, {
      items: changed.map((d) => ({ name: d.name, type: d.movement_type, qty: d.delta, unit: d.unit, before: d.before, after: d.after })),
    });
  }
  const msg = !changed.length ? 'จำนวนตรงกับระบบ ไม่มีการเปลี่ยนแปลง'
    : `บันทึกแล้ว ${changed.length} รายการ${result.alerts.length ? ` · แจ้งเตือนใกล้หมด: ${result.alerts.join(', ')}` : ''}`;
  return ok(res, { items: result.done, low_stock_alerts: result.alerts }, msg);
}

module.exports = router;
