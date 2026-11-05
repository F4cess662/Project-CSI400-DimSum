/**
 * /api/menu — รายการเมนูสำหรับหน้าลูกค้า / หน้าสั่งแทนลูกค้า (ไม่ต้องล็อกอิน)
 * GET                      → เฉพาะเมนูที่เปิดขาย
 * GET ?include_closed=1    → รวมเมนูที่ปิดขายด้วย (แสดงเป็น "หมด")
 * sale_status: 'available' สั่งได้ · 'slow' หมดชั่วคราว (จำนวน 0) ยังสั่งได้ รอนานขึ้น · 'closed' ปิดขาย = หมด
 * is_sold_out = 1 เฉพาะเมนูที่ปิดขาย
 */
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { SALE_STATUS_SQL } = require('./public');

router.get('/', async (req, res, next) => {
  try {
    const includeClosed = req.query.include_closed === '1';
    const rows = await db.query(`
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.unit,
        m.image_path,
        m.available_qty,
        m.is_available,
        ${SALE_STATUS_SQL} AS sale_status,
        (m.is_available = 0) AS is_sold_out,
        c.id   AS category_id,
        c.name AS category_name
      FROM menu_items m
      JOIN menu_categories c ON m.category_id = c.id
      WHERE ${includeClosed ? '1 = 1' : 'm.is_available = 1'}
        AND m.is_deleted = 0
        AND c.is_active = 1
      ORDER BY
        c.sort_order ASC,
        CASE
          WHEN m.name LIKE 'Set A:%' THEN 1
          WHEN m.name LIKE 'Set B:%' THEN 2
          WHEN m.name LIKE 'Set C:%' THEN 3
          ELSE 4
        END ASC,
        m.id ASC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
