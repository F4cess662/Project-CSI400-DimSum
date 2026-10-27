const express = require('express');
const router = express.Router();
const db = require('../lib/db');

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(`
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.unit,
        m.image_path,
        m.available_qty,
        (m.available_qty IS NOT NULL AND m.available_qty <= 0) AS is_sold_out,
        c.id   AS category_id,
        c.name AS category_name
      FROM menu_items m
      JOIN menu_categories c ON m.category_id = c.id
      WHERE m.is_available = 1
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