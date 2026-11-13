/**
 * /api/menus — จัดการเมนูอาหาร เปิด/ปิดขาย และจัดการจำนวนพร้อมขาย/ล็อต (FR-21, 22, 23, 24, 48 · คนที่ 3)
 *
 * GET  /api/menus?q=&category_id=&kitchen_zone=&min_price=&max_price=&id=
 *      - พนักงานทุกคนที่ล็อกอินเรียกได้
 *      - ค้นหา q แบบยืดหยุ่น: ตัดคำนำ "ไส้", "เมนู" ออกก่อน แยกคำด้วยช่องว่าง ต้องเจอทุกคำ (AND)
 *        ไม่ว่าคำนั้นจะอยู่ส่วนไหนของชื่อเมนูหรือคำอธิบาย
 *
 * POST /api/menus
 *   - action: 'create'        (owner, form-data หรือ JSON) เพิ่มเมนูใหม่ + อัปโหลดรูป + กันชื่อซ้ำ/คล้าย (#3)
 *   - action: 'update'        (owner, form-data หรือ JSON) แก้ไขเมนู + กันชื่อซ้ำ/คล้าย (#3) + แก้ราคา log ระดับ system
 *   - action: 'delete'        (owner) ซ่อนเมนู (is_deleted = 1)
 *   - action: 'set_available' (head_chef, manager, owner) เปิด/ปิดขาย
 *   - action: 'add_stock'     (head_chef, manager, owner) บวกจำนวนพร้อมขายตามล็อต (lots * lot_size) หรือ qty
 *   - action: 'set_stock'     (head_chef, manager, owner) กำหนดจำนวนพร้อมขายตรงๆ (ตั้ง 0 = หมดชั่วคราว ไม่ปิดขาย)
 *   - action: 'reset_stock'   (head_chef, manager, owner) ล้างจำนวนพร้อมขายทุกเมนูเป็น 0 (หมดชั่วคราว ไม่แตะ is_available) (#5)
 *
 * สถานะขาย sale_status (เหมือนกันทุกหน้า):
 *   - 'available': จำนวน > 0 หรือไม่จำกัด + เปิดขาย = พร้อมขาย
 *   - 'slow':      จำนวน 0 + เปิดขาย = "หมดชั่วคราว" ลูกค้ายังสั่งได้ แค่รอนานขึ้น 5–10 นาที
 *   - 'closed':    ปิดขาย (is_available = 0) = "หมด" สั่งไม่ได้
 *   ระบบไม่ปิดขายเองตอนจำนวนเหลือ 0 และเติมของไม่เปิดขายให้เอง
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const VALID_ZONES = ['steam', 'fry', 'congee_noodle', 'drink_dessert'];

// คำทั่วไปที่ตัดออกก่อนเทียบชื่อเมนูซ้ำ/คล้าย (Feedback #3 · เพิ่มคำใน array นี้ได้)
const COMMON_MENU_WORDS = ['ไส้', 'สับ'];

const SALE_STATUS_SQL = `CASE
  WHEN m.is_available = 0 THEN 'closed'
  WHEN m.available_qty IS NOT NULL AND m.available_qty <= 0 THEN 'slow'
  ELSE 'available'
END`;

// ตั้งค่า multer สำหรับอัปโหลดรูปเมนูไปที่ public/assets/uploads (จำกัด 2MB เฉพาะไฟล์รูป)
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'assets', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const randomName = 'menu_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext;
    cb(null, randomName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|webp|gif)$/;
    if (!allowed.test(file.mimetype)) {
      return cb(fail('อนุญาตเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) ขนาดไม่เกิน 2MB', 422));
    }
    cb(null, true);
  },
});

function maybeUpload(req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(fail('ขนาดไฟล์รูปภาพต้องไม่เกิน 2MB', 422));
        }
        return next(err);
      }
      next();
    });
  }
  return next();
}

/**
 * แยกคำค้นหาตามกติกา Feedback เฟส 1:
 * - ตัดคำว่า "ไส้", "เมนู" ที่ผู้ใช้ชอบพิมพ์นำหน้าออก
 * - แยกคำด้วยช่องว่าง ทุกคำต้องปรากฏใน name หรือ description
 */
function parseSearchTokens(rawQuery) {
  if (!rawQuery) return [];
  const cleaned = String(rawQuery)
    .replace(/ไส้/g, ' ')
    .replace(/เมนู/g, ' ')
    .trim();
  if (!cleaned) {
    const fallback = String(rawQuery).trim();
    return fallback ? [fallback] : [];
  }
  return cleaned.split(/\s+/).filter(Boolean);
}

/**
 * Normalize ชื่อเมนูเพื่อเทียบชื่อซ้ำ/คล้าย (Feedback #3):
 * - แปลงตัวพิมพ์เล็ก ตัดช่องว่างและเครื่องหมายวรรคตอน
 * - ตัดคำทั่วไปใน COMMON_MENU_WORDS เช่น 'ไส้', 'สับ'
 *   ตัวอย่าง: "ซาลาเปาหมู" = "ซาลาเปาไส้หมู" = "ซาลาเปาหมูสับ"
 */
function normalizeMenuName(rawName) {
  const stripPunct = (str) =>
    String(str || '')
      .toLowerCase()
      .replace(/[\s\-_.,/\\()[\]{}'"!?+*&^%$#@~`:;<>|·•]+/g, '');

  let s = stripPunct(rawName);
  for (const word of COMMON_MENU_WORDS) {
    s = s.split(word).join('');
  }
  return s || stripPunct(rawName);
}

/**
 * ตรวจสอบชื่อเมนูซ้ำหรือคล้ายกับเมนูที่มีอยู่ (เฉพาะ is_deleted = 0 ยกเว้นตัวเอง)
 * - หาก normalize แล้วตรงกันเป๊ะ -> throw 409 ทันที (ไม่อนุญาตให้บันทึกซ้ำ)
 * - หากชื่อหนึ่งอยู่ในอีกชื่อ (substring) และยังไม่ได้ส่ง confirm_similar: 1 -> throw 409 พร้อม { similar, need_confirm: true }
 */
async function checkDuplicateOrSimilarName(name, excludeId = null, confirmSimilar = false) {
  const normInput = normalizeMenuName(name);
  if (!normInput) return;

  const params = [];
  let sql = 'SELECT id, name FROM menu_items WHERE is_deleted = 0';
  if (excludeId !== null && excludeId !== undefined) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const existingMenus = await query(sql, params);

  // 1) เช็กชื่อซ้ำ/คำหลักตรงกันเป๊ะ (เช่น ซาลาเปาหมู = ซาลาเปาไส้หมู = ซาลาเปาหมูสับ)
  for (const item of existingMenus) {
    const normExisting = normalizeMenuName(item.name);
    if (normExisting && normInput === normExisting) {
      throw fail(`มีเมนูคล้ายกันอยู่แล้ว: ${item.name}`, 409);
    }
  }

  // 2) เช็กชื่อหนึ่งอยู่ในอีกชื่อ (เช่น ซาลาเปาหมู กับ ซาลาเปาหมูแดง) ถ้ายังไม่ยืนยัน confirm_similar
  if (!confirmSimilar && normInput.length >= 2) {
    for (const item of existingMenus) {
      const normExisting = normalizeMenuName(item.name);
      if (
        normExisting &&
        normExisting.length >= 2 &&
        (normInput.includes(normExisting) || normExisting.includes(normInput))
      ) {
        throw fail(`มีเมนูชื่อคล้าย: ${item.name}`, 409, {
          similar: item.name,
          need_confirm: true,
        });
      }
    }
  }
}


/**
 * ซิงก์ตาราง prep_plans ของวันนี้ให้มีครบทุกเมนูที่ไม่ได้ลบ (เพื่อให้หน้า prep-today และ stock-today มีรายการเมนูตรงกันเสมอ)
 */
async function ensureTodayPrepPlans() {
  await query(
    `INSERT IGNORE INTO prep_plans (plan_date, menu_item_id, suggested_qty, confirmed_qty)
     SELECT CURDATE(), m.id, COALESCE(m.available_qty, m.lot_size * 4), m.available_qty
       FROM menu_items m
       JOIN menu_categories c ON c.id = m.category_id
      WHERE m.is_deleted = 0 AND c.is_active = 1`
  );
}

// GET /api/menus
router.get('/', requireLogin, handle(async (req, res) => {
  await ensureTodayPrepPlans();
  // กรณีขอเมนูเดียว ?id=
  if (req.query.id !== undefined && req.query.id !== '') {
    const id = Number(req.query.id);
    if (!Number.isInteger(id) || id < 1) throw fail('รหัสเมนูไม่ถูกต้อง', 422);
    const item = await queryOne(
      `SELECT m.*, c.name AS category_name, ${SALE_STATUS_SQL} AS sale_status
         FROM menu_items m
         JOIN menu_categories c ON c.id = m.category_id
        WHERE m.id = ? AND m.is_deleted = 0`,
      [id]
    );
    if (!item) throw fail('ไม่พบเมนูนี้', 404);
    return ok(res, item);
  }

  const where = ['m.is_deleted = 0', 'c.is_active = 1'];
  const params = [];

  if (req.query.category_id !== undefined && req.query.category_id !== '' && req.query.category_id !== 'all') {
    const catId = Number(req.query.category_id);
    if (!Number.isInteger(catId) || catId < 1) throw fail('หมวดหมู่ไม่ถูกต้อง', 422);
    where.push('m.category_id = ?');
    params.push(catId);
  }

  if (req.query.kitchen_zone !== undefined && req.query.kitchen_zone !== '' && req.query.kitchen_zone !== 'all') {
    const zone = String(req.query.kitchen_zone).trim();
    if (!VALID_ZONES.includes(zone)) throw fail('โซนครัวไม่ถูกต้อง', 422);
    where.push('m.kitchen_zone = ?');
    params.push(zone);
  }

  if (req.query.min_price !== undefined && req.query.min_price !== '') {
    const minPrice = Number(req.query.min_price);
    if (!Number.isFinite(minPrice) || minPrice < 0) throw fail('ราคาต่ำสุดไม่ถูกต้อง', 422);
    where.push('m.price >= ?');
    params.push(minPrice);
  }

  if (req.query.max_price !== undefined && req.query.max_price !== '') {
    const maxPrice = Number(req.query.max_price);
    if (!Number.isFinite(maxPrice) || maxPrice < 0) throw fail('ราคาสูงสุดไม่ถูกต้อง', 422);
    where.push('m.price <= ?');
    params.push(maxPrice);
  }

  const tokens = parseSearchTokens(req.query.q);
  for (const token of tokens) {
    where.push("(m.name LIKE ? OR COALESCE(m.description, '') LIKE ? OR c.name LIKE ?)");
    const likeVal = `%${token}%`;
    params.push(likeVal, likeVal, likeVal);
  }

  const rows = await query(
    `SELECT m.id, m.category_id, c.name AS category_name,
            m.name, m.description, m.price, m.unit,
            m.kitchen_zone, m.image_path, m.lot_size,
            m.available_qty, m.is_available, m.is_deleted,
            ${SALE_STATUS_SQL} AS sale_status,
            m.created_at, m.updated_at
       FROM menu_items m
       JOIN menu_categories c ON c.id = m.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.sort_order ASC, m.id ASC`,
    params
  );

  return ok(res, rows);
}));

// POST /api/menus
router.post('/', maybeUpload, handle(async (req, res) => {
  const b = req.body || {};
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['owner']);
      requireFields(b, ['category_id', 'name', 'price']);

      const categoryId = Number(b.category_id);
      const name = String(b.name).trim();
      const description = b.description ? String(b.description).trim() : null;
      const price = Number(b.price);
      const unit = b.unit ? String(b.unit).trim() : 'เข่ง';
      const kitchenZone = b.kitchen_zone ? String(b.kitchen_zone).trim() : 'steam';
      const lotSize = b.lot_size !== undefined && b.lot_size !== '' ? Number(b.lot_size) : 1;
      const availableQty = b.available_qty !== undefined && b.available_qty !== ''
        ? Number(b.available_qty)
        : lotSize * 4;
      const confirmSimilar = String(b.confirm_similar) === '1' || b.confirm_similar === true;

      if (!Number.isInteger(categoryId) || categoryId < 1) throw fail('กรุณาเลือกหมวดหมู่', 422);
      if (!name || name.length > 100) throw fail('ชื่อเมนูต้องมี 1–100 ตัวอักษร', 422);
      if (!Number.isFinite(price) || price <= 0) throw fail('ราคาต้องมากกว่า 0 บาท', 422);
      if (!unit || unit.length > 20) throw fail('หน่วยเมนูต้องมี 1–20 ตัวอักษร', 422);
      if (!VALID_ZONES.includes(kitchenZone)) throw fail('โซนครัวไม่ถูกต้อง', 422);
      if (!Number.isInteger(lotSize) || lotSize < 1) throw fail('ขนาดล็อตต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 422);
      if (!Number.isInteger(availableQty) || availableQty < 0) throw fail('จำนวนพร้อมขายต้องเป็น 0 ขึ้นไป', 422);

      const cat = await queryOne('SELECT id FROM menu_categories WHERE id = ? AND is_active = 1', [categoryId]);
      if (!cat) throw fail('ไม่พบหมวดหมู่ที่เลือก', 404);

      // ตรวจชื่อเมนูซ้ำ/คล้าย (Feedback #3)
      await checkDuplicateOrSimilarName(name, null, confirmSimilar);

      const imagePath = req.file ? `/assets/uploads/${req.file.filename}` : null;
      // ระบบไม่ปิดขายเองตอนจำนวนเป็น 0 (available_qty = 0 + is_available = 1 คือ หมดชั่วคราว)
      const isAvailable = b.is_available !== undefined && b.is_available !== ''
        ? (Number(b.is_available) ? 1 : 0)
        : 1;

      const r = await query(
        `INSERT INTO menu_items
          (category_id, name, description, price, unit, kitchen_zone, image_path, lot_size, available_qty, is_available, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [categoryId, name, description, price, unit, kitchenZone, imagePath, lotSize, availableQty, isAvailable]
      );

      await query('INSERT INTO prep_plans (plan_date, menu_item_id, suggested_qty, confirmed_qty) VALUES (CURDATE(), ?, ?, ?) ON DUPLICATE KEY UPDATE suggested_qty = VALUES(suggested_qty), confirmed_qty = VALUES(confirmed_qty)', [r.insertId, availableQty, availableQty]);

      await writeLog(req, 'menu.create', 'menu_items', r.insertId, {
        name,
        category_id: categoryId,
        price,
        unit,
        kitchen_zone: kitchenZone,
        lot_size: lotSize,
        available_qty: availableQty,
      });

      return ok(res, { id: r.insertId }, 'เพิ่มเมนูใหม่แล้ว');
    }

    case 'update': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id', 'category_id', 'name', 'price']);

      const id = Number(b.id);
      const categoryId = Number(b.category_id);
      const name = String(b.name).trim();
      const description = b.description !== undefined && b.description !== '' ? String(b.description).trim() : null;
      const price = Number(b.price);
      const unit = b.unit ? String(b.unit).trim() : 'เข่ง';
      const kitchenZone = b.kitchen_zone ? String(b.kitchen_zone).trim() : 'steam';
      const lotSize = b.lot_size !== undefined && b.lot_size !== '' ? Number(b.lot_size) : 1;
      const confirmSimilar = String(b.confirm_similar) === '1' || b.confirm_similar === true;

      if (!Number.isInteger(id) || id < 1) throw fail('รหัสเมนูไม่ถูกต้อง', 422);
      if (!Number.isInteger(categoryId) || categoryId < 1) throw fail('กรุณาเลือกหมวดหมู่', 422);
      if (!name || name.length > 100) throw fail('ชื่อเมนูต้องมี 1–100 ตัวอักษร', 422);
      if (!Number.isFinite(price) || price <= 0) throw fail('ราคาต้องมากกว่า 0 บาท', 422);
      if (!unit || unit.length > 20) throw fail('หน่วยเมนูต้องมี 1–20 ตัวอักษร', 422);
      if (!VALID_ZONES.includes(kitchenZone)) throw fail('โซนครัวไม่ถูกต้อง', 422);
      if (!Number.isInteger(lotSize) || lotSize < 1) throw fail('ขนาดล็อตต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 422);

      const existing = await queryOne('SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing) throw fail('ไม่พบเมนูที่ต้องการแก้ไข', 404);

      const cat = await queryOne('SELECT id FROM menu_categories WHERE id = ? AND is_active = 1', [categoryId]);
      if (!cat) throw fail('ไม่พบหมวดหมู่ที่เลือก', 404);

      // ตรวจชื่อเมนูซ้ำ/คล้าย ยกเว้นตัวเอง (Feedback #3)
      await checkDuplicateOrSimilarName(name, id, confirmSimilar);

      const imagePath = req.file ? `/assets/uploads/${req.file.filename}` : existing.image_path;

      await query(
        `UPDATE menu_items
            SET category_id = ?, name = ?, description = ?, price = ?,
                unit = ?, kitchen_zone = ?, image_path = ?, lot_size = ?
          WHERE id = ?`,
        [categoryId, name, description, price, unit, kitchenZone, imagePath, lotSize, id]
      );

      // กฎธุรกิจ: แก้ราคาเมนู ต้องบันทึก log ระดับ system
      const oldPrice = Number(existing.price);
      if (oldPrice !== price) {
        await writeLog(
          req,
          'menu.update_price',
          'menu_items',
          id,
          { name, old_price: oldPrice, new_price: price },
          'system'
        );
      } else {
        await writeLog(req, 'menu.update', 'menu_items', id, {
          name,
          category_id: categoryId,
          price,
          unit,
          kitchen_zone: kitchenZone,
          lot_size: lotSize,
        });
      }

      return ok(res, { id }, oldPrice !== price ? 'แก้ไขเมนูและบันทึก Log การเปลี่ยนราคาแล้ว' : 'แก้ไขเมนูแล้ว');
    }

    case 'delete': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) throw fail('รหัสเมนูไม่ถูกต้อง', 422);

      const existing = await queryOne('SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing) throw fail('ไม่พบเมนูที่ต้องการลบ', 404);

      await query('UPDATE menu_items SET is_deleted = 1, is_available = 0 WHERE id = ?', [id]);
      await writeLog(req, 'menu.delete', 'menu_items', id, { name: existing.name });
      return ok(res, { id }, `ลบเมนู "${existing.name}" แล้ว`);
    }

    case 'set_available': {
      await mustBe(req, ['head_chef', 'manager', 'owner']);
      requireFields(b, ['id', 'is_available']);
      const id = Number(b.id);
      const isAvailable = Number(b.is_available) ? 1 : 0;

      const existing = await queryOne('SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing) throw fail('ไม่พบเมนู', 404);

      await query('UPDATE menu_items SET is_available = ? WHERE id = ?', [isAvailable, id]);
      await writeLog(req, 'menu.set_available', 'menu_items', id, {
        name: existing.name,
        is_available: isAvailable,
      });

      return ok(
        res,
        { id, is_available: isAvailable, available_qty: existing.available_qty },
        isAvailable ? `เปิดขาย "${existing.name}" แล้ว` : `ปิดขาย "${existing.name}" แล้ว`
      );
    }

    case 'add_stock': {
      await mustBe(req, ['head_chef', 'manager', 'owner']);
      requireFields(b, ['id']);
      const id = Number(b.id);
      const existing = await queryOne('SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing) throw fail('ไม่พบเมนู', 404);

      const lotSize = Number(existing.lot_size || 1);
      let deltaQty = 0;
      if (b.lots !== undefined && b.lots !== null && b.lots !== '') {
        const lots = Number(b.lots);
        if (!Number.isInteger(lots) || lots === 0) throw fail('จำนวนล็อตไม่ถูกต้อง', 422);
        deltaQty = lots * lotSize;
      } else if (b.qty !== undefined && b.qty !== null && b.qty !== '') {
        const qty = Number(b.qty);
        if (!Number.isInteger(qty) || qty === 0) throw fail('จำนวนที่ต้องการเพิ่มไม่ถูกต้อง', 422);
        deltaQty = qty;
      } else {
        deltaQty = lotSize; // ค่าเริ่มต้น +1 ล็อต
      }

      const oldQty = Number(existing.available_qty || 0);
      const newQty = Math.max(0, oldQty + deltaQty);
      // เติมของไม่เปลี่ยนสถานะเปิด/ปิดขาย (จำนวน 0 + เปิดขาย = หมดชั่วคราว ยังสั่งได้)
      const newAvailable = existing.is_available;

      await query(
        'UPDATE menu_items SET available_qty = ?, is_available = ? WHERE id = ?',
        [newQty, newAvailable, id]
      );
      await writeLog(req, 'menu.add_stock', 'menu_items', id, {
        name: existing.name,
        added_qty: deltaQty,
        old_qty: oldQty,
        new_qty: newQty,
        unit: existing.unit,
        is_available: newAvailable,
      });

      return ok(
        res,
        { id, available_qty: newQty, is_available: newAvailable, unit: existing.unit },
        `เพิ่มจำนวน "${existing.name}" +${deltaQty} ${existing.unit} (คงเหลือ ${newQty} ${existing.unit})`
      );
    }

    case 'set_stock': {
      await mustBe(req, ['head_chef', 'manager', 'owner']);
      requireFields(b, ['id', 'available_qty']);
      const id = Number(b.id);
      const newQty = Number(b.available_qty);
      if (!Number.isInteger(newQty) || newQty < 0) {
        throw fail('จำนวนพร้อมขายต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป', 422);
      }

      const existing = await queryOne('SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0', [id]);
      if (!existing) throw fail('ไม่พบเมนู', 404);

      const oldQty = Number(existing.available_qty || 0);
      // ตั้งจำนวนไม่เปลี่ยนสถานะเปิด/ปิดขาย (ตั้งเป็น 0 = หมดชั่วคราว ยังสั่งได้)
      const newAvailable = existing.is_available;

      await query(
        'UPDATE menu_items SET available_qty = ?, is_available = ? WHERE id = ?',
        [newQty, newAvailable, id]
      );
      await writeLog(req, 'menu.set_stock', 'menu_items', id, {
        name: existing.name,
        old_qty: oldQty,
        new_qty: newQty,
        unit: existing.unit,
        is_available: newAvailable,
      });

      return ok(
        res,
        { id, available_qty: newQty, is_available: newAvailable, unit: existing.unit },
        newQty === 0
          ? `อัปเดต "${existing.name}" เป็น 0 ${existing.unit} (หมดชั่วคราว ลูกค้ายังสั่งได้)`
          : `อัปเดตคงเหลือ "${existing.name}" เป็น ${newQty} ${existing.unit} แล้ว`
      );
    }

    case 'reset_stock': {
      await mustBe(req, ['head_chef', 'manager', 'owner']);
      const r = await query(
        'UPDATE menu_items SET available_qty = 0 WHERE is_deleted = 0 AND available_qty IS NOT NULL'
      );
      await query(
        'UPDATE prep_plans SET confirmed_qty = NULL, confirmed_by = NULL WHERE plan_date = CURDATE()'
      );
      const count = Number((r && r.affectedRows) || 0);
      await writeLog(req, 'menu.reset_stock', 'menu_items', null, { count });
      return ok(
        res,
        { count },
        `ล้างจำนวนพร้อมขายทุกเมนูเป็น 0 และรีเซ็ตแผนวันนี้แล้ว (${count} รายการ · หมดชั่วคราว)`
      );
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
