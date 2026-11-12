const router = require('express').Router();
const { query, queryOne } = require('../../../lib/db');
const { ok, fail, requireFields, handle } = require('../../../lib/response');
const { requireRole } = require('../../../lib/auth');
const { writeLog } = require('../../../lib/log');
const { publish } = require('../../../lib/queue');

router.get('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const lowStock = req.query.low_stock === '1';

  let sql = `
    SELECT
      id, name, unit, qty_on_hand, reorder_point, is_active,
      CASE WHEN qty_on_hand <= reorder_point THEN 1 ELSE 0 END AS low_stock
    FROM ingredients
    WHERE is_active = 1
  `;
  const params = [];

  if (q) {
    sql += ' AND name LIKE ?';
    params.push(`%${q}%`);
  }

  if (lowStock) {
    sql += ' AND qty_on_hand <= reorder_point';
  }

  sql += ' ORDER BY (qty_on_hand <= reorder_point) DESC, name ASC';

  const rows = await query(sql, params);

  return ok(res, rows, 'โหลดรายการวัตถุดิบแล้ว');
}));

router.post('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const b = req.body || {};

  switch (b.action) {
    case 'create': {
      requireFields(b, ['name', 'unit', 'reorder_point']);

      const name = String(b.name).trim();
      const unit = String(b.unit).trim();
      const reorderPoint = Number(b.reorder_point);

      if (!name || !unit) throw fail('กรุณาระบุชื่อและหน่วยวัตถุดิบ', 422);
      if (!Number.isFinite(reorderPoint) || reorderPoint < 0) {
        throw fail('จุดสั่งซื้อซ้ำต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', 422);
      }

      const exists = await queryOne(
        'SELECT id FROM ingredients WHERE name = ? AND is_active = 1',
        [name]
      );
      if (exists) throw fail('มีวัตถุดิบชื่อนี้อยู่แล้ว', 409);

      const result = await query(
        `INSERT INTO ingredients (name, unit, reorder_point)
         VALUES (?, ?, ?)`,
        [name, unit, reorderPoint]
      );

      const created = await queryOne(
        `SELECT id, name, unit, qty_on_hand, reorder_point, is_active
         FROM ingredients WHERE id = ?`,
        [result.insertId]
      );

      await writeLog(req, 'ingredient.create', 'ingredients', result.insertId, {
        name,
        unit,
        reorder_point: reorderPoint,
      });

      if (Number(created.qty_on_hand) <= Number(created.reorder_point)) {
        await publish('notify', {
          channel: 'line',
          to: 'manager',
          title: 'วัตถุดิบถึงจุดสั่งซื้อ',
          message: `${created.name} คงเหลือ ${created.qty_on_hand} ${created.unit} (จุดสั่งซื้อ ${created.reorder_point})`,
        });
      }

      return ok(res, created, 'เพิ่มวัตถุดิบแล้ว');
    }

    case 'update': {
      requireFields(b, ['id', 'name', 'unit', 'reorder_point']);

      const id = Number(b.id);
      const name = String(b.name).trim();
      const unit = String(b.unit).trim();
      const reorderPoint = Number(b.reorder_point);

      if (!Number.isInteger(id) || id <= 0) throw fail('รหัสวัตถุดิบไม่ถูกต้อง', 422);
      if (!name || !unit) throw fail('กรุณาระบุชื่อและหน่วยวัตถุดิบ', 422);
      if (!Number.isFinite(reorderPoint) || reorderPoint < 0) {
        throw fail('จุดสั่งซื้อซ้ำต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', 422);
      }

      const before = await queryOne(
        'SELECT * FROM ingredients WHERE id = ? AND is_active = 1',
        [id]
      );
      if (!before) throw fail('ไม่พบวัตถุดิบหรือถูกปิดใช้งานแล้ว', 404);

      const duplicate = await queryOne(
        'SELECT id FROM ingredients WHERE name = ? AND id <> ? AND is_active = 1',
        [name, id]
      );
      if (duplicate) throw fail('มีวัตถุดิบชื่อนี้อยู่แล้ว', 409);

      await query(
        `UPDATE ingredients
         SET name = ?, unit = ?, reorder_point = ?
         WHERE id = ? AND is_active = 1`,
        [name, unit, reorderPoint, id]
      );

      const updated = await queryOne(
        `SELECT id, name, unit, qty_on_hand, reorder_point, is_active
         FROM ingredients WHERE id = ?`,
        [id]
      );

      await writeLog(req, 'ingredient.update', 'ingredients', id, {
        before: {
          name: before.name,
          unit: before.unit,
          reorder_point: before.reorder_point,
        },
        after: {
          name,
          unit,
          reorder_point: reorderPoint,
        },
      });

      const wasLow = Number(before.qty_on_hand) <= Number(before.reorder_point);
      const isLow = Number(updated.qty_on_hand) <= Number(updated.reorder_point);

      // แจ้งเตือนเมื่อการแก้ไขทำให้วัตถุดิบเข้าสู่สถานะต่ำกว่าจุดสั่งซื้อ
      if (!wasLow && isLow) {
        await publish('notify', {
          channel: 'line',
          to: 'manager',
          title: 'วัตถุดิบต่ำกว่าจุดสั่งซื้อ',
          message: `${updated.name} คงเหลือ ${updated.qty_on_hand} ${updated.unit} (จุดสั่งซื้อ ${updated.reorder_point})`,
        });
      }

      return ok(res, updated, 'แก้ไขวัตถุดิบแล้ว');
    }

    case 'deactivate': {
      requireFields(b, ['id']);

      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) throw fail('รหัสวัตถุดิบไม่ถูกต้อง', 422);

      const ingredient = await queryOne(
        'SELECT id, name FROM ingredients WHERE id = ? AND is_active = 1',
        [id]
      );
      if (!ingredient) throw fail('ไม่พบวัตถุดิบหรือถูกปิดใช้งานแล้ว', 404);

      await query(
        'UPDATE ingredients SET is_active = 0 WHERE id = ?',
        [id]
      );

      await writeLog(req, 'ingredient.deactivate', 'ingredients', id, {
        name: ingredient.name,
      });

      return ok(res, { id }, 'ปิดใช้งานวัตถุดิบแล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;