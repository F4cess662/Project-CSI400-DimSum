/**
 * /api/goods_receipts — รับของเข้า + ใบแจ้งหนี้ + บันทึกจ่ายเงิน (คนที่ 6 · เฟส 4 · inventory-service port 4002) · FR-59, 60 · manager, owner
 *
 * GET                → รายการรับของล่าสุด [{ id, po_id, po_no, supplier_name, received_at, received_by_name,
 *                       invoice_no, invoice_amount, invoice_image, is_paid, paid_at, item_count, po_total }]
 * GET ?unpaid=1      → เฉพาะที่ยังไม่จ่ายเงิน (เก่าสุดขึ้นก่อน) + days_unpaid นับจากวันรับของ
 * GET ?paid=1        → เฉพาะที่จ่ายแล้ว (จ่ายล่าสุดขึ้นก่อน) + payment_slip, payment_ref (หลักฐานการจ่าย)
 * GET ?id=3          → ใบรับของเดียว + รายการที่รับจริง (เทียบกับที่สั่งใน PO)
 *
 * POST (form-data) action=create
 *      po_id, items = JSON '[{"ingredient_id":3,"qty":9.5,"expiry_date":"2026-11-20"}]',
 *      invoice_no, invoice_amount, invoice_image (ไฟล์รูป ≤ 2MB · ไม่ส่งก็ได้)
 *      → ใน transaction เดียว: goods_receipts + stock_movements (receive + expiry_date) + บวก qty_on_hand + PO → received
 *        รับได้เฉพาะ PO ที่ "ส่งแล้ว" (sent) · รับครั้งเดียวต่อ PO · จำนวนที่รับจริงต่างจากที่สั่งได้ (ใส่ 0 = ไม่ได้ของ)
 * POST (JSON หรือ form-data) action=mark_paid  id, paid_at (ไม่ส่ง = วันนี้),
 *      payment_ref (เลขอ้างอิงการโอน ≤ 50 ตัว · ไม่บังคับ), payment_slip (ไฟล์รูปสลิป ≤ 2MB · ไม่บังคับ · ต้องส่งแบบ form-data)
 *      → บันทึกว่าจ่ายเงินร้านค้าแล้ว พร้อมหลักฐานการจ่าย
 *
 * ใช้ได้เฉพาะตารางคลัง (purchase_orders, purchase_order_items, goods_receipts, stock_movements, ingredients, suppliers)
 * รูปใบแจ้งหนี้/สลิปเก็บที่ public/assets/uploads ของระบบหลัก (ไฟล์ route อยู่ใน service แต่รูปต้องเปิดผ่านเว็บหลักได้)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = require('express').Router();
const multer = require('multer');
const config = require('../../../config');
const { query, transaction } = require('../../../lib/db');
const { ok, fail, requireFields, handle } = require('../../../lib/response');
const { mustBe } = require('../../../lib/auth');
const { writeLog } = require('../../../lib/log');

const ROLES = ['manager', 'owner'];
const MAX_QTY = 99999;
const MAX_AMOUNT = 9999999;

/* ---------- อัปโหลดรูป: ใบแจ้งหนี้ (ตอนรับของ) · สลิปโอนเงิน (ตอนบันทึกจ่าย) ---------- */
const UPLOAD_DIR = path.join(__dirname, '../../../public/assets/uploads');
const UPLOAD_URL = '/assets/uploads/';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const FILE_FIELDS = { invoice_image: { prefix: 'invoice_', label: 'รูปใบแจ้งหนี้' }, payment_slip: { prefix: 'slip_', label: 'รูปสลิป' } };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      cb(null, FILE_FIELDS[file.fieldname].prefix + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) {
      return cb(fail(`${FILE_FIELDS[file.fieldname].label}ต้องเป็นไฟล์ JPG, PNG หรือ WEBP ขนาดไม่เกิน 2MB`, 422));
    }
    cb(null, true);
  },
});

/** form-data → ผ่าน multer · JSON → ข้ามไป (express.json ของ service อ่านให้แล้ว) */
function maybeUpload(req, res, next) {
  if (!String(req.headers['content-type'] || '').includes('multipart/form-data')) return next();
  upload.fields(Object.keys(FILE_FIELDS).map((name) => ({ name, maxCount: 1 })))(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(fail('รูปต้องมีขนาดไม่เกิน 2MB', 422));
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(fail('ส่งไฟล์ได้เฉพาะรูปใบแจ้งหนี้หรือรูปสลิป', 422));
    next(err);
  });
}

/** ไฟล์ที่อัปโหลดมาในช่องนี้ (ไม่มี = undefined) */
const uploaded = (req, field) => (req.files && req.files[field] ? req.files[field][0] : undefined);

/** ลบไฟล์ที่อัปโหลดมา · ใส่ keep = ช่องที่ใช้จริง (ไฟล์ช่องอื่นที่ action นี้ไม่ใช้ลบทิ้ง ไม่ให้ค้างในเครื่อง) */
function removeUploaded(req, keep = null) {
  for (const [field, files] of Object.entries(req.files || {})) {
    if (field !== keep) files.forEach((f) => fs.unlink(f.path, () => {}));
  }
}

/* ---------- ตัวช่วย ---------- */
const money = (n) => Math.round(Number(n) * 100) / 100;
const num = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

/** วันนี้ตามเวลาไทย 'YYYY-MM-DD' */
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone }).format(new Date());
/** DATE/DATETIME จาก mysql2 → 'YYYY-MM-DD' ตามเวลาไทย */
function ymd(v) {
  if (!v) return null;
  if (v instanceof Date) return new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone }).format(v);
  return String(v).slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

function cleanId(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw fail(`${label}ไม่ถูกต้อง`, 422);
  return n;
}

/** ตัวเลข ≥ min ทศนิยมไม่เกิน 2 ตำแหน่ง (รับ 2.5 กก. ได้) */
function cleanAmount(v, label, { min, max }) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw fail(`${label}ต้องเป็นตัวเลข`, 422);
  if (n < min || n > max) throw fail(`${label}ต้องอยู่ระหว่าง ${num(min)}–${num(max)}`, 422);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw fail(`${label}มีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`, 422);
  return money(n);
}

/** 'YYYY-MM-DD' ที่เป็นวันจริง · ว่าง = null */
function cleanDate(v, label) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw fail(`${label}ไม่ถูกต้อง`, 422);
  }
  return s;
}

/** items มาจาก form-data เป็นข้อความ JSON · มาจาก JSON เป็น array อยู่แล้ว */
function parseItems(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(String(raw || ''));
    if (Array.isArray(v)) return v;
  } catch (e) { /* ตกไปแจ้งข้างล่าง */ }
  throw fail('รายการรับของไม่ถูกต้อง', 422);
}

/* =========================================================
   GET
   ========================================================= */
const LIST_SQL = `
  SELECT gr.id, gr.po_id, po.po_no, s.name AS supplier_name, gr.received_at, u.full_name AS received_by_name,
         gr.invoice_no, gr.invoice_amount, gr.invoice_image, gr.is_paid, gr.paid_at, gr.payment_slip, gr.payment_ref,
         (SELECT COUNT(*) FROM stock_movements sm WHERE sm.goods_receipt_id = gr.id) AS item_count,
         (SELECT COALESCE(SUM(poi.qty * poi.unit_price), 0) FROM purchase_order_items poi WHERE poi.po_id = gr.po_id) AS po_total
    FROM goods_receipts gr
    JOIN purchase_orders po ON po.id = gr.po_id
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN users u ON u.id = gr.received_by`;

function shapeReceipt(r) {
  const receivedOn = ymd(r.received_at);
  return {
    ...r,
    invoice_amount: r.invoice_amount === null ? null : money(r.invoice_amount),
    po_total: money(r.po_total),
    item_count: Number(r.item_count),
    is_paid: Number(r.is_paid) === 1,
    paid_at: ymd(r.paid_at),
    received_date: receivedOn,
    // ค้างจ่ายมากี่วันแล้ว (นับจากวันรับของ)
    days_unpaid: Number(r.is_paid) === 1 ? 0 : Math.max(0, daysBetween(receivedOn, today())),
  };
}

router.get('/', handle(async (req, res) => {
  await mustBe(req, ROLES);

  if (req.query.id !== undefined) {
    const id = cleanId(req.query.id, 'เลขใบรับของ');
    const [row] = await query(`${LIST_SQL} WHERE gr.id = ?`, [id]);
    if (!row) throw fail('ไม่พบใบรับของนี้', 404);
    // รายการที่สั่ง (PO) เทียบกับที่รับจริง (stock_movements ของใบนี้)
    const items = await query(
      `SELECT poi.ingredient_id, i.name, i.unit, poi.qty AS ordered_qty, poi.unit_price,
              COALESCE(sm.qty, 0) AS received_qty, sm.expiry_date
         FROM purchase_order_items poi
         JOIN ingredients i ON i.id = poi.ingredient_id
         LEFT JOIN stock_movements sm ON sm.goods_receipt_id = ? AND sm.ingredient_id = poi.ingredient_id
        WHERE poi.po_id = ?
        ORDER BY poi.id`, [id, row.po_id]);
    return ok(res, {
      ...shapeReceipt(row),
      items: items.map((it) => ({
        ...it,
        ordered_qty: Number(it.ordered_qty),
        received_qty: Number(it.received_qty),
        unit_price: Number(it.unit_price),
        expiry_date: ymd(it.expiry_date),
      })),
    });
  }

  // ค้างจ่าย: เก่าสุดขึ้นก่อน (ควรจ่ายก่อน) · จ่ายแล้ว: จ่ายล่าสุดขึ้นก่อน · ทั้งหมด: รับของล่าสุดขึ้นก่อน
  const unpaid = req.query.unpaid === '1';
  const paid = req.query.paid === '1';
  const where = unpaid ? 'WHERE gr.is_paid = 0' : paid ? 'WHERE gr.is_paid = 1' : '';
  const order = unpaid ? 'gr.received_at ASC' : paid ? 'gr.paid_at DESC, gr.received_at DESC' : 'gr.received_at DESC';
  const rows = await query(`${LIST_SQL} ${where} ORDER BY ${order}, gr.id DESC LIMIT 300`);
  return ok(res, rows.map(shapeReceipt));
}));

/* =========================================================
   POST
   ========================================================= */
router.post('/', maybeUpload, handle(async (req, res) => {
  try {
    const user = await mustBe(req, ROLES);
    const b = req.body || {};
    switch (b.action) {
      case 'create': removeUploaded(req, 'invoice_image'); return await create(req, res, b, user);
      case 'mark_paid': removeUploaded(req, 'payment_slip'); return await markPaid(req, res, b);
      default: throw fail('ไม่รู้จัก action นี้', 400);
    }
  } catch (err) {
    removeUploaded(req);
    throw err;
  }
}));

async function create(req, res, b, user) {
  requireFields(b, ['po_id', 'items']);
  const poId = cleanId(b.po_id, 'ใบสั่งซื้อ');
  const invoiceNo = String(b.invoice_no ?? '').trim();
  if (invoiceNo.length > 50) throw fail('เลขที่ใบแจ้งหนี้ยาวได้ไม่เกิน 50 ตัวอักษร', 422);
  const invoiceAmount = b.invoice_amount === undefined || b.invoice_amount === ''
    ? null : cleanAmount(b.invoice_amount, 'ยอดตามใบแจ้งหนี้', { min: 0, max: MAX_AMOUNT });

  const t = today();
  const seen = new Set();
  const items = parseItems(b.items).map((it, i) => {
    const row = `รายการที่ ${i + 1}: `;
    const ingredientId = cleanId(it && it.ingredient_id, row + 'วัตถุดิบ');
    if (seen.has(ingredientId)) throw fail(row + 'วัตถุดิบซ้ำ', 422);
    seen.add(ingredientId);
    const qty = cleanAmount(it.qty, row + 'จำนวนที่รับจริง', { min: 0, max: MAX_QTY });
    const expiry = cleanDate(it.expiry_date, row + 'วันหมดอายุ');
    if (expiry && expiry < t) throw fail(row + 'วันหมดอายุต้องไม่ก่อนวันนี้ (ของหมดอายุแล้วไม่ควรรับเข้า)', 422);
    return { ingredient_id: ingredientId, qty, expiry_date: expiry };
  });
  if (!items.some((it) => it.qty > 0)) throw fail('ต้องรับของอย่างน้อย 1 รายการ (ถ้าไม่ได้ของเลยให้ยกเลิก PO แทน)', 422);

  const result = await transaction(async (conn) => {
    const run = async (sql, p) => (await conn.execute(sql, p))[0];

    // ล็อกใบ PO กันสองคนกดรับของใบเดียวกันพร้อมกัน
    const [po] = await run(
      `SELECT po.id, po.po_no, po.status, s.name AS supplier_name
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ? FOR UPDATE`, [poId]);
    if (!po) throw fail('ไม่พบใบสั่งซื้อนี้', 404);
    if (po.status === 'received') throw fail(`ใบสั่งซื้อ ${po.po_no} รับของไปแล้ว`, 409);
    if (po.status !== 'sent') {
      throw fail(`ใบสั่งซื้อ ${po.po_no} ${po.status === 'draft' ? 'ยังเป็นร่าง (ยังไม่ได้ส่งให้ร้านค้า)' : 'ถูกยกเลิกแล้ว'} รับของไม่ได้`, 409);
    }

    // รับได้เฉพาะวัตถุดิบที่อยู่ในใบสั่งซื้อ
    const ordered = await run(
      `SELECT poi.ingredient_id, poi.qty, i.name, i.unit
         FROM purchase_order_items poi JOIN ingredients i ON i.id = poi.ingredient_id
        WHERE poi.po_id = ?`, [poId]);
    for (const it of items) {
      const o = ordered.find((x) => x.ingredient_id === it.ingredient_id);
      if (!o) throw fail('มีวัตถุดิบที่ไม่อยู่ในใบสั่งซื้อนี้ กรุณาโหลดหน้าใหม่', 422);
      it.name = o.name;
      it.unit = o.unit;
      it.ordered_qty = Number(o.qty);
    }

    const [ins] = await conn.execute(
      `INSERT INTO goods_receipts (po_id, received_by, invoice_no, invoice_amount, invoice_image)
       VALUES (?, ?, ?, ?, ?)`,
      [poId, user.id, invoiceNo || null, invoiceAmount, uploaded(req, 'invoice_image') ? UPLOAD_URL + uploaded(req, 'invoice_image').filename : null]);
    const receiptId = ins.insertId;

    for (const it of items.filter((x) => x.qty > 0)) {
      await conn.execute(
        `INSERT INTO stock_movements (ingredient_id, qty, movement_type, goods_receipt_id, expiry_date, note, created_by)
         VALUES (?, ?, 'receive', ?, ?, ?, ?)`,
        [it.ingredient_id, it.qty, receiptId, it.expiry_date, `รับของตาม ${po.po_no}`, user.id]);
      await conn.execute('UPDATE ingredients SET qty_on_hand = qty_on_hand + ? WHERE id = ?', [it.qty, it.ingredient_id]);
    }

    await conn.execute("UPDATE purchase_orders SET status = 'received' WHERE id = ?", [poId]);
    return { receiptId, po };
  });

  // รายการที่ได้ไม่ครบ/เกินจากที่สั่ง แจ้งให้ผู้จัดการรู้
  const diffs = items
    .filter((it) => Math.abs(it.qty - it.ordered_qty) > 1e-9)
    .map((it) => ({ name: it.name, unit: it.unit, ordered_qty: it.ordered_qty, received_qty: it.qty }));

  await writeLog(req, 'goods.receive', 'goods_receipts', result.receiptId, {
    po_no: result.po.po_no,
    supplier: result.po.supplier_name,
    items: items.filter((x) => x.qty > 0).map((it) => ({ name: it.name, qty: it.qty, unit: it.unit })),
    invoice_no: invoiceNo || null,
    invoice_amount: invoiceAmount,
    diffs,
  });

  return ok(res, { id: result.receiptId, po_no: result.po.po_no, diffs },
    `บันทึกรับของตาม ${result.po.po_no} แล้ว${diffs.length ? ` (ได้ไม่ตรงที่สั่ง ${diffs.length} รายการ)` : ''}`);
}

async function markPaid(req, res, b) {
  const id = cleanId(b.id, 'เลขใบรับของ');
  const t = today();
  const paidAt = cleanDate(b.paid_at, 'วันที่จ่ายเงิน') || t;
  if (paidAt > t) throw fail('วันที่จ่ายเงินต้องไม่เกินวันนี้', 422);
  const paymentRef = String(b.payment_ref ?? '').trim();
  if (paymentRef.length > 50) throw fail('เลขอ้างอิงการโอนยาวได้ไม่เกิน 50 ตัวอักษร', 422);
  const slip = uploaded(req, 'payment_slip');
  const slipUrl = slip ? UPLOAD_URL + slip.filename : null;

  const row = await transaction(async (conn) => {
    const [[gr]] = await conn.execute(
      `SELECT gr.id, gr.is_paid, gr.received_at, gr.invoice_no, gr.invoice_amount, po.po_no
         FROM goods_receipts gr JOIN purchase_orders po ON po.id = gr.po_id
        WHERE gr.id = ? FOR UPDATE`, [id]);
    if (!gr) throw fail('ไม่พบใบรับของนี้', 404);
    if (Number(gr.is_paid) === 1) throw fail(`ใบรับของ ${gr.po_no} บันทึกจ่ายไปแล้ว`, 409);
    if (paidAt < ymd(gr.received_at)) throw fail('วันที่จ่ายเงินต้องไม่ก่อนวันรับของ', 422);
    await conn.execute('UPDATE goods_receipts SET is_paid = 1, paid_at = ?, payment_slip = ?, payment_ref = ? WHERE id = ?',
      [paidAt, slipUrl, paymentRef || null, id]);
    return gr;
  });

  await writeLog(req, 'goods.paid', 'goods_receipts', id, {
    po_no: row.po_no, invoice_no: row.invoice_no, invoice_amount: row.invoice_amount === null ? null : money(row.invoice_amount),
    paid_at: paidAt, payment_ref: paymentRef || null, has_slip: !!slipUrl,
  });
  return ok(res, { id, paid_at: paidAt, payment_slip: slipUrl, payment_ref: paymentRef || null },
    `บันทึกจ่ายเงินใบรับของ ${row.po_no} แล้ว${slipUrl ? ' พร้อมสลิป' : ''}`);
}

module.exports = router;
