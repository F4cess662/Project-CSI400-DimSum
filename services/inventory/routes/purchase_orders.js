/**
 * /api/purchase_orders — ใบสั่งซื้อวัตถุดิบ (คนที่ 5 · เฟส 4 · inventory-service port 4002) · FR-58 · manager, owner
 *
 * GET                               → รายการ PO (?status=draft|sent|received|cancelled · ?q=เลข PO/ชื่อร้าน)
 *                                     [{ id, po_no, status, supplier_id, supplier_name, order_date, expected_date, item_count, total }]
 * GET ?id=5                         → PO เดียว + รายการ + line_message (ข้อความสำหรับคัดลอกส่ง LINE)
 * GET ?action=form_data             → ข้อมูลสำหรับฟอร์ม: ซัพพลายเออร์ · วัตถุดิบ (+ ต้องสั่ง) · ราคาทุกเจ้า · จำนวน PO แต่ละสถานะ
 * POST {"action":"create", "supplier_id":1, "expected_date":"2026-11-12", "note":"",
 *       "items":[{"ingredient_id":3, "qty":10, "unit_price":250}]}       → ร่าง (draft)
 * POST {"action":"update", "id":5, ...เหมือน create}                     → แก้ได้เฉพาะ draft (แทนรายการทั้งหมด)
 * POST {"action":"send", "id":5}    → ยืนยันว่า "ส่งให้ร้านค้าแล้ว" draft → sent · แจ้งเตือนผ่านคิว (ไม่ต้องรออนุมัติ)
 *                                     ขั้นตอน: เปิดข้อความ (GET ?id= ได้ line_message ตั้งแต่ร่าง) → คัดลอกไปส่ง LINE → กดยืนยัน
 *                                     ยังไม่กดยืนยัน = ยังเป็นร่าง (ไลน์ล่ม/ลืมส่ง ใบยังค้างในแท็บร่าง ไม่หายเงียบ)
 * เลยกำหนดรับของ: ส่งแล้ว + เลยวันที่ต้องการรับของ → overdue = true, overdue_days (ให้ผู้จัดการโทรตามร้านค้า)
 * POST {"action":"cancel", "id":5, "reason":"..."} → draft / sent → cancelled (รับของแล้วยกเลิกไม่ได้)
 * POST {"action":"reschedule", "id":5, "expected_date":"2026-11-14", "reason":"ร้านแจ้งว่าของหมด"}
 *                                   → เลื่อนวันรับของ เฉพาะใบที่ส่งแล้ว (รายการ/ราคาแก้ไม่ได้ เพราะร้านค้าตกลงแล้ว)
 *                                     วันใหม่ต้องไม่ก่อนวันนี้และไม่ซ้ำวันเดิม · ต้องมีเหตุผล · log เก็บวันเดิม → วันใหม่
 *
 * สถานะ: draft (ร่าง) → sent (ส่งแล้ว) → received (รับของแล้ว · คนที่ 6 เปลี่ยนตอนบันทึกรับของ) · draft/sent → cancelled
 * เลข PO: PO + YYYYMMDD + "-" + ลำดับของวัน 3 หลัก (นับใหม่ทุกวัน เช่น PO20261111-001)
 * ยอดเงินคำนวณที่ server จาก qty × unit_price ทุกครั้ง ไม่รับยอดรวมจาก client
 * ใช้ได้เฉพาะตารางคลัง (inventory) · ข้อมูลร้าน (ชื่อ เบอร์) อ่านผ่าน shopSettings() ของ lib
 */
const router = require('express').Router();
const config = require('../../../config');
const { query, queryOne, transaction } = require('../../../lib/db');
const { ok, fail, requireFields, handle } = require('../../../lib/response');
const { mustBe } = require('../../../lib/auth');
const { writeLog } = require('../../../lib/log');
const { shopSettings } = require('../../../lib/shop');
const { publish } = require('../../../lib/queue');

const ROLES = ['manager', 'owner'];
const STATUS = { draft: 'ร่าง', sent: 'ส่งแล้ว', received: 'รับของแล้ว', cancelled: 'ยกเลิก' };
const MAX_ITEMS = 50;
const MAX_QTY = 99999;
const MAX_PRICE = 999999;

const money = (n) => Math.round(Number(n) * 100) / 100;
const num = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const baht = (n) => num(n) + ' บาท';
const marks = (arr) => arr.map(() => '?').join(',');

/** วันที่วันนี้ตามเวลาไทย 'YYYY-MM-DD' */
function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone }).format(new Date());
}
function thaiDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
/** DATE จาก mysql2 อาจเป็น Date object → แปลงเป็น 'YYYY-MM-DD' ตามเวลาไทย */
function ymd(v) {
  if (!v) return null;
  if (v instanceof Date) return new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone }).format(v);
  return String(v).slice(0, 10);
}

/* =========================================================
   ตรวจข้อมูลฟอร์ม (create / update)
   ========================================================= */
function cleanId(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw fail(`${label}ไม่ถูกต้อง`, 422);
  return n;
}

/** ตัวเลขบวก ทศนิยมไม่เกิน 2 ตำแหน่ง (จำนวน 2.5 กก. ได้) */
function cleanAmount(v, label, { min, max }) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw fail(`${label}ต้องเป็นตัวเลข`, 422);
  if (n < min || n > max) throw fail(`${label}ต้องอยู่ระหว่าง ${num(min)}–${num(max)}`, 422);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw fail(`${label}มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`, 422);
  return money(n);
}

function cleanDate(v, orderDate) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail('วันที่ต้องการรับของไม่ถูกต้อง', 422);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw fail('วันที่ต้องการรับของไม่ถูกต้อง', 422);
  if (s < orderDate) throw fail('วันที่ต้องการรับของต้องไม่ก่อนวันสั่ง', 422);
  return s;
}

/** อ่านฟอร์ม + ตรวจกับฐานข้อมูล (ซัพพลายเออร์และวัตถุดิบต้องยังใช้งาน) · run = query หรือ conn.execute */
async function readForm(run, b) {
  requireFields(b, ['supplier_id', 'items']);
  const supplierId = cleanId(b.supplier_id, 'ซัพพลายเออร์');
  const orderDate = today();
  const expectedDate = cleanDate(b.expected_date, orderDate);
  const note = String(b.note ?? '').trim();
  if (note.length > 255) throw fail('หมายเหตุยาวได้ไม่เกิน 255 ตัวอักษร', 422);

  if (!Array.isArray(b.items) || !b.items.length) throw fail('ใบสั่งซื้อต้องมีอย่างน้อย 1 รายการ', 422);
  if (b.items.length > MAX_ITEMS) throw fail(`ใบสั่งซื้อมีได้ไม่เกิน ${MAX_ITEMS} รายการ`, 422);
  const seen = new Set();
  const items = b.items.map((it, i) => {
    const row = `รายการที่ ${i + 1}: `;
    const ingredientId = cleanId(it && it.ingredient_id, row + 'วัตถุดิบ');
    if (seen.has(ingredientId)) throw fail(row + 'วัตถุดิบซ้ำกับรายการก่อนหน้า ให้รวมเป็นบรรทัดเดียว', 422);
    seen.add(ingredientId);
    return {
      ingredient_id: ingredientId,
      qty: cleanAmount(it.qty, row + 'จำนวน', { min: 0.01, max: MAX_QTY }),
      unit_price: cleanAmount(it.unit_price, row + 'ราคาต่อหน่วย', { min: 0, max: MAX_PRICE }),
    };
  });

  const [supplier] = await run('SELECT id, name, line_id, is_active FROM suppliers WHERE id = ?', [supplierId]);
  if (!supplier) throw fail('ไม่พบซัพพลายเออร์นี้', 404);
  if (!supplier.is_active) throw fail(`ซัพพลายเออร์ "${supplier.name}" ปิดใช้งานแล้ว`, 409);

  const ids = items.map((x) => x.ingredient_id);
  const found = await run(`SELECT id, name, unit, is_active FROM ingredients WHERE id IN (${marks(ids)})`, ids);
  for (const it of items) {
    const ing = found.find((x) => x.id === it.ingredient_id);
    if (!ing) throw fail('มีวัตถุดิบที่ไม่มีในระบบ กรุณาโหลดหน้าใหม่', 404);
    if (!ing.is_active) throw fail(`วัตถุดิบ "${ing.name}" ปิดใช้งานแล้ว`, 409);
    it.name = ing.name;
    it.unit = ing.unit;
  }
  return { supplier, orderDate, expectedDate, note: note || null, items };
}

/* =========================================================
   ข้อความ LINE ถึงร้านค้าส่ง (ภาษากันเองแบบคนทักไลน์สั่งของในตลาด)
   รายการมีลำดับ + รวมกี่รายการ (Feedback #2) · บอกราคาต่อหน่วยไว้ยืนยันราคาที่ตกลงกัน
   ไม่ใส่เลข PO เพราะร้านค้าไม่ได้ใช้ระบบเรา — เลข PO ใช้ภายในร้าน (จับคู่ตอนคนที่ 6 บันทึกรับของ)
   ========================================================= */
function lineMessage(po, items, shop) {
  const lines = items.map((it, i) => `${i + 1}. ${it.name} ${num(it.qty)} ${it.unit} (${it.unit}ละ ${num(it.unit_price)})`);
  const total = money(items.reduce((a, it) => a + it.qty * it.unit_price, 0));
  return [
    `สวัสดีครับ ร้าน${shop.shop_name || 'นึ่งสุข'}ขอสั่งของครับ`,
    ...lines,
    `รวม ${items.length} รายการ ประมาณ ${baht(total)}`,
    po.expected_date ? `ขอรับของวันที่ ${thaiDate(po.expected_date)} ครับ` : null,
    po.note ? `${po.note}` : null,
    'ขอบคุณครับ 🙏',
  ].filter((x) => x !== null).join('\n');
}

async function loadPo(run, id, lock = false) {
  const [po] = await run(
    `SELECT po.id, po.po_no, po.status, po.supplier_id, s.name AS supplier_name, s.line_id, s.phone AS supplier_phone,
            s.contact_name, s.lead_time_days, po.order_date, po.expected_date, po.note, po.created_at, u.full_name AS created_by_name
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
      WHERE po.id = ? ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!po) throw fail('ไม่พบใบสั่งซื้อนี้', 404);
  const items = (await run(
    `SELECT poi.id, poi.ingredient_id, i.name, i.unit, poi.qty, poi.unit_price
       FROM purchase_order_items poi JOIN ingredients i ON i.id = poi.ingredient_id
      WHERE poi.po_id = ? ORDER BY poi.id`, [id]))
    .map((it) => ({ ...it, qty: Number(it.qty), unit_price: Number(it.unit_price), amount: money(Number(it.qty) * Number(it.unit_price)) }));
  const expected = ymd(po.expected_date);
  return {
    ...po,
    order_date: ymd(po.order_date),
    expected_date: expected,
    status_label: STATUS[po.status],
    items,
    total: money(items.reduce((a, it) => a + it.amount, 0)),
    ...overdueOf(po.status, expected),
  };
}

/** ส่งแล้วแต่เลยวันที่ต้องการรับของ (ยังไม่ได้รับ) → ให้โทรตามร้านค้า */
function overdueOf(status, expected) {
  const t = today();
  if (status !== 'sent' || !expected || expected >= t) return { overdue: false, overdue_days: 0 };
  const days = Math.round((Date.parse(t + 'T00:00:00Z') - Date.parse(expected + 'T00:00:00Z')) / 86400000);
  return { overdue: true, overdue_days: days };
}

/* =========================================================
   GET
   ========================================================= */
router.get('/', handle(async (req, res) => {
  await mustBe(req, ROLES);
  if (req.query.action === 'form_data') return formData(req, res);
  if (req.query.id !== undefined) {
    const po = await loadPo(query, cleanId(req.query.id, 'เลขใบสั่งซื้อ'));
    const shop = (await shopSettings()) || {};
    // ข้อความ LINE มีตั้งแต่ร่าง (เปิดดู/คัดลอกก่อนกดยืนยันว่าส่งแล้ว) · ยกเลิกแล้วไม่ต้องมี
    return ok(res, { ...po, line_message: po.status === 'cancelled' || !po.items.length ? null : lineMessage(po, po.items, shop) });
  }

  const where = ['1 = 1'];
  const params = [];
  if (req.query.status) {
    if (!STATUS[req.query.status]) throw fail('สถานะไม่ถูกต้อง', 422);
    where.push('po.status = ?'); params.push(req.query.status);
  }
  const q = String(req.query.q || '').trim();
  if (q) { where.push('(po.po_no LIKE ? OR s.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT po.id, po.po_no, po.status, po.supplier_id, s.name AS supplier_name, po.order_date, po.expected_date,
            COUNT(poi.id) AS item_count, COALESCE(SUM(poi.qty * poi.unit_price), 0) AS total
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE ${where.join(' AND ')}
      GROUP BY po.id
      ORDER BY po.created_at DESC, po.id DESC
      LIMIT 300`, params);
  return ok(res, rows.map((r) => ({
    ...r, order_date: ymd(r.order_date), expected_date: ymd(r.expected_date),
    item_count: Number(r.item_count), total: money(r.total), status_label: STATUS[r.status],
    ...overdueOf(r.status, ymd(r.expected_date)),
  })));
}));

/** ข้อมูลสำหรับฟอร์มสร้าง/แก้ PO (อ่านตารางคลังเท่านั้น) */
async function formData(req, res) {
  const [suppliers, ingredients, prices, counts, overdue] = await Promise.all([
    query('SELECT id, name, contact_name, phone, line_id, lead_time_days FROM suppliers WHERE is_active = 1 ORDER BY name'),
    query(`SELECT id, name, unit, qty_on_hand, reorder_point, (qty_on_hand <= reorder_point) AS need_order
             FROM ingredients WHERE is_active = 1 ORDER BY need_order DESC, name`),
    query('SELECT supplier_id, ingredient_id, price, quoted_at FROM supplier_prices'),
    query('SELECT status, COUNT(*) AS n FROM purchase_orders GROUP BY status'),
    query(`SELECT po.id, po.po_no, s.name AS supplier_name, po.expected_date
             FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
            WHERE po.status = 'sent' AND po.expected_date < ? ORDER BY po.expected_date`, [today()]),
  ]);
  return ok(res, {
    today: today(),
    suppliers,
    ingredients: ingredients.map((i) => ({
      ...i, qty_on_hand: Number(i.qty_on_hand), reorder_point: Number(i.reorder_point), need_order: Number(i.need_order) === 1,
    })),
    prices: prices.map((p) => ({ ...p, price: Number(p.price), quoted_at: ymd(p.quoted_at) })),
    counts: Object.fromEntries(Object.keys(STATUS).map((k) => [k, Number((counts.find((c) => c.status === k) || {}).n || 0)])),
    // ใบที่ส่งแล้วแต่เลยกำหนดรับของ (แถบเตือนด้านบนหน้า)
    overdue: overdue.map((o) => ({ ...o, expected_date: ymd(o.expected_date), ...overdueOf('sent', ymd(o.expected_date)) })),
  });
}

/* =========================================================
   POST
   ========================================================= */
router.post('/', handle(async (req, res) => {
  const user = await mustBe(req, ROLES);
  const b = req.body || {};
  switch (b.action) {
    case 'create': return create(req, res, b, user);
    case 'update': return update(req, res, b);
    case 'send': return send(req, res, b);
    case 'cancel': return cancel(req, res, b);
    case 'reschedule': return reschedule(req, res, b);
    default: throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

async function insertItems(conn, poId, items) {
  for (const it of items) {
    await conn.execute('INSERT INTO purchase_order_items (po_id, ingredient_id, qty, unit_price) VALUES (?, ?, ?, ?)',
      [poId, it.ingredient_id, it.qty, it.unit_price]);
  }
}

async function create(req, res, b, user) {
  const result = await transaction(async (conn) => {
    const run = async (sql, p) => (await conn.execute(sql, p))[0];
    const form = await readForm(run, b);
    // เลข PO ต่อจากเลขล่าสุดของวัน (ค่าตัวเลข) · ล็อกกันสองคนสร้างพร้อมกันได้เลขซ้ำ
    const prefix = 'PO' + form.orderDate.replace(/-/g, '') + '-';
    const [[last]] = await conn.execute(
      'SELECT MAX(CAST(SUBSTRING(po_no, ?) AS UNSIGNED)) AS seq FROM purchase_orders WHERE po_no LIKE ? FOR UPDATE',
      [prefix.length + 1, prefix + '%']);
    const poNo = prefix + String(Number((last && last.seq) || 0) + 1).padStart(3, '0');
    const [ins] = await conn.execute(
      `INSERT INTO purchase_orders (po_no, supplier_id, status, order_date, expected_date, note, created_by)
       VALUES (?, ?, 'draft', ?, ?, ?, ?)`,
      [poNo, form.supplier.id, form.orderDate, form.expectedDate, form.note, user.id]);
    await insertItems(conn, ins.insertId, form.items);
    return { id: ins.insertId, po_no: poNo, supplier: form.supplier.name, items: form.items };
  });
  const total = money(result.items.reduce((a, it) => a + it.qty * it.unit_price, 0));
  await writeLog(req, 'po.create', 'purchase_orders', result.id,
    { po_no: result.po_no, supplier: result.supplier, items: result.items.length, total });
  return ok(res, { id: result.id, po_no: result.po_no, total }, `บันทึกร่างใบสั่งซื้อ ${result.po_no} แล้ว`);
}

async function update(req, res, b) {
  const id = cleanId(b.id, 'เลขใบสั่งซื้อ');
  const result = await transaction(async (conn) => {
    const run = async (sql, p) => (await conn.execute(sql, p))[0];
    const [po] = await run('SELECT id, po_no, status FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
    if (!po) throw fail('ไม่พบใบสั่งซื้อนี้', 404);
    if (po.status !== 'draft') throw fail(`ใบสั่งซื้อ ${po.po_no} ${STATUS[po.status]} แก้ไขไม่ได้ (แก้ได้เฉพาะร่าง)`, 409);
    const form = await readForm(run, b);
    await conn.execute('UPDATE purchase_orders SET supplier_id = ?, expected_date = ?, note = ? WHERE id = ?',
      [form.supplier.id, form.expectedDate, form.note, id]);
    await conn.execute('DELETE FROM purchase_order_items WHERE po_id = ?', [id]);
    await insertItems(conn, id, form.items);
    return { po_no: po.po_no, supplier: form.supplier.name, items: form.items };
  });
  const total = money(result.items.reduce((a, it) => a + it.qty * it.unit_price, 0));
  await writeLog(req, 'po.update', 'purchase_orders', id,
    { po_no: result.po_no, supplier: result.supplier, items: result.items.length, total });
  return ok(res, { id, po_no: result.po_no, total }, `แก้ไขใบสั่งซื้อ ${result.po_no} แล้ว`);
}

async function send(req, res, b) {
  const id = cleanId(b.id, 'เลขใบสั่งซื้อ');
  const shop = (await shopSettings()) || {};
  const result = await transaction(async (conn) => {
    const run = async (sql, p) => (await conn.execute(sql, p))[0];
    const po = await loadPo(run, id, true);
    if (po.status !== 'draft') throw fail(`ใบสั่งซื้อ ${po.po_no} ${po.status_label} ส่งซ้ำไม่ได้`, 409);
    if (!po.items.length) throw fail('ใบสั่งซื้อไม่มีรายการ เพิ่มรายการก่อนส่ง', 422);
    await conn.execute("UPDATE purchase_orders SET status = 'sent' WHERE id = ?", [id]);
    const message = lineMessage(po, po.items, shop);
    // แจ้งเตือนผ่านคิว (notify-service จำลองส่ง LINE) · เข้าคิวพร้อมกับเปลี่ยนสถานะใน transaction เดียว
    await publish('notify', { channel: 'line', to: po.line_id || po.supplier_name, title: `ใบสั่งซื้อ ${po.po_no}`, message }, conn);
    return { po, message };
  });
  await writeLog(req, 'po.send', 'purchase_orders', id,
    { po_no: result.po.po_no, supplier: result.po.supplier_name, total: result.po.total });
  return ok(res, { id, po_no: result.po.po_no, line_message: result.message, line_id: result.po.line_id },
    `บันทึกว่าส่ง ${result.po.po_no} ให้ ${result.po.supplier_name} แล้ว`);
}

async function cancel(req, res, b) {
  const id = cleanId(b.id, 'เลขใบสั่งซื้อ');
  const reason = String(b.reason ?? '').trim();
  if (reason.length > 255) throw fail('เหตุผลยาวได้ไม่เกิน 255 ตัวอักษร', 422);
  const po = await transaction(async (conn) => {
    const [[row]] = await conn.execute('SELECT id, po_no, status FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw fail('ไม่พบใบสั่งซื้อนี้', 404);
    if (row.status === 'received') throw fail(`ใบสั่งซื้อ ${row.po_no} รับของแล้ว ยกเลิกไม่ได้`, 409);
    if (row.status === 'cancelled') throw fail(`ใบสั่งซื้อ ${row.po_no} ยกเลิกไปแล้ว`, 409);
    await conn.execute("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?", [id]);
    return row;
  });
  await writeLog(req, 'po.cancel', 'purchase_orders', id, { po_no: po.po_no, from: po.status, reason: reason || null });
  return ok(res, { id, po_no: po.po_no },
    po.status === 'sent' ? `ยกเลิก ${po.po_no} แล้ว อย่าลืมแจ้งร้านค้าทาง LINE ด้วย` : `ยกเลิก ${po.po_no} แล้ว`);
}

async function reschedule(req, res, b) {
  const id = cleanId(b.id, 'เลขใบสั่งซื้อ');
  if (!b.expected_date) throw fail('กรุณาเลือกวันรับของใหม่', 422);
  const newDate = cleanDate(b.expected_date, today());
  const reason = String(b.reason ?? '').trim();
  if (!reason) throw fail('กรุณาใส่เหตุผลที่เลื่อน', 422);
  if (reason.length > 255) throw fail('เหตุผลยาวได้ไม่เกิน 255 ตัวอักษร', 422);
  const po = await transaction(async (conn) => {
    const [[row]] = await conn.execute('SELECT id, po_no, status, expected_date FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw fail('ไม่พบใบสั่งซื้อนี้', 404);
    if (row.status !== 'sent') {
      throw fail(row.status === 'draft'
        ? `ใบสั่งซื้อ ${row.po_no} ยังเป็นร่าง กดแก้ไขเพื่อเปลี่ยนวันได้เลย`
        : `ใบสั่งซื้อ ${row.po_no} ${STATUS[row.status]} เลื่อนวันรับของไม่ได้`, 409);
    }
    const oldDate = ymd(row.expected_date);
    if (oldDate === newDate) throw fail(`วันรับของเดิมคือ ${thaiDate(newDate)} อยู่แล้ว`, 422);
    await conn.execute('UPDATE purchase_orders SET expected_date = ? WHERE id = ?', [newDate, id]);
    return { ...row, oldDate };
  });
  await writeLog(req, 'po.reschedule', 'purchase_orders', id,
    { po_no: po.po_no, from: po.oldDate, to: newDate, reason });
  return ok(res, { id, po_no: po.po_no, expected_date: newDate },
    `เลื่อนวันรับของ ${po.po_no} เป็น ${thaiDate(newDate)} แล้ว`);
}

module.exports = router;
