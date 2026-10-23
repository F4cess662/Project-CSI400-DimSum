/**
 * แม่แบบไฟล์ API — คัดลอกเป็นไฟล์ใหม่ใน routes/ แล้วแก้ตามแถวในเอกสาร API
 * ไฟล์ที่ขึ้นต้นด้วย _ จะไม่ถูกโหลด ไฟล์นี้จึงไม่ใช่ API จริง
 * ตั้งชื่อไฟล์ = ชื่อ API เช่น routes/menus.js → เรียกที่ /api/menus (server.js โหลดให้อัตโนมัติ)
 */
const router = require('express').Router();
const { query } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

// GET /api/menus?q=ฮะ  → อ่านข้อมูล
router.get('/', requireLogin, handle(async (req, res) => {
  const q = req.query.q || '';
  const rows = await query(
    'SELECT * FROM menu_items WHERE is_deleted = 0 AND name LIKE ? ORDER BY name', ['%' + q + '%']);
  return ok(res, rows);
}));

// POST /api/menus  {"action":"create", ...}  → เพิ่ม/แก้/ลบ แยกด้วย action
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['owner']);                       // เช็กสิทธิ์ตาม action
      requireFields(b, ['category_id', 'name', 'price']);
      const r = await query('INSERT INTO menu_items (category_id, name, price) VALUES (?, ?, ?)',
        [b.category_id, b.name, b.price]);
      await writeLog(req, 'menu.create', 'menu_items', r.insertId, { name: b.name });
      return ok(res, { id: r.insertId }, 'เพิ่มเมนูแล้ว');
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
