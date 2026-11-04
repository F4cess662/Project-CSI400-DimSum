/**
 * /api/categories — จัดการหมวดหมู่เมนู (FR-48 · คนที่ 3)
 * GET  /api/categories               สาธารณะ: หมวดที่ใช้งาน เรียงตาม sort_order พร้อมจำนวนเมนู
 * POST { action: 'create', name, sort_order }          owner
 * POST { action: 'update', id, name, sort_order }      owner
 * POST { action: 'reorder', ids: [id1, id2, ...] }     owner
 * POST { action: 'delete', id }                        owner (ซ่อนหมวด ห้ามลบถ้ายังมีเมนูใช้งานอยู่)
 */
const router = require('express').Router();
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

// GET /api/categories
router.get('/', handle(async (req, res) => {
  const includeInactive = req.query.all === '1';
  const rows = await query(
    `SELECT c.id, c.name, c.sort_order, c.is_active,
            COUNT(m.id) AS menu_count
       FROM menu_categories c
       LEFT JOIN menu_items m
         ON m.category_id = c.id AND m.is_deleted = 0
      WHERE ${includeInactive ? '1=1' : 'c.is_active = 1'}
      GROUP BY c.id, c.name, c.sort_order, c.is_active
      ORDER BY c.sort_order ASC, c.id ASC`
  );
  return ok(res, rows);
}));

// POST /api/categories
router.post('/', handle(async (req, res) => {
  const b = req.body || {};
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['owner']);
      requireFields(b, ['name']);
      const name = String(b.name).trim();
      if (!name || name.length > 100) throw fail('ชื่อหมวดหมู่ต้องมี 1–100 ตัวอักษร', 422);

      const dup = await queryOne(
        'SELECT id, is_active FROM menu_categories WHERE name = ? LIMIT 1',
        [name]
      );
      if (dup && dup.is_active === 1) {
        throw fail('มีชื่อหมวดหมู่นี้อยู่แล้ว', 409);
      }

      let sortOrder = Number(b.sort_order);
      if (!Number.isFinite(sortOrder) || sortOrder <= 0) {
        const maxRow = await queryOne('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM menu_categories');
        sortOrder = Number((maxRow && maxRow.max_sort) || 0) + 1;
      }

      if (dup && dup.is_active === 0) {
        await query('UPDATE menu_categories SET is_active = 1, sort_order = ? WHERE id = ?', [sortOrder, dup.id]);
        await writeLog(req, 'category.create', 'menu_categories', dup.id, { name, sort_order: sortOrder });
        return ok(res, { id: dup.id, name, sort_order: sortOrder }, 'เปิดใช้งานหมวดหมู่แล้ว');
      }

      const r = await query(
        'INSERT INTO menu_categories (name, sort_order, is_active) VALUES (?, ?, 1)',
        [name, sortOrder]
      );
      await writeLog(req, 'category.create', 'menu_categories', r.insertId, { name, sort_order: sortOrder });
      return ok(res, { id: r.insertId, name, sort_order: sortOrder }, 'เพิ่มหมวดหมู่แล้ว');
    }

    case 'update': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id', 'name']);
      const id = Number(b.id);
      const name = String(b.name).trim();
      if (!Number.isInteger(id) || id < 1) throw fail('รหัสหมวดหมู่ไม่ถูกต้อง', 422);
      if (!name || name.length > 100) throw fail('ชื่อหมวดหมู่ต้องมี 1–100 ตัวอักษร', 422);

      const existing = await queryOne('SELECT * FROM menu_categories WHERE id = ?', [id]);
      if (!existing) throw fail('ไม่พบหมวดหมู่ที่ต้องการแก้ไข', 404);

      const dup = await queryOne(
        'SELECT id FROM menu_categories WHERE name = ? AND id <> ? AND is_active = 1 LIMIT 1',
        [name, id]
      );
      if (dup) throw fail('มีชื่อหมวดหมู่นี้อยู่แล้ว', 409);

      const sortOrder = b.sort_order !== undefined && b.sort_order !== null && b.sort_order !== ''
        ? Number(b.sort_order)
        : existing.sort_order;

      await query(
        'UPDATE menu_categories SET name = ?, sort_order = ? WHERE id = ?',
        [name, sortOrder, id]
      );
      await writeLog(req, 'category.update', 'menu_categories', id, {
        old_name: existing.name,
        name,
        sort_order: sortOrder,
      });
      return ok(res, { id, name, sort_order: sortOrder }, 'แก้ไขหมวดหมู่แล้ว');
    }

    case 'reorder': {
      await mustBe(req, ['owner']);
      if (!Array.isArray(b.ids) || !b.ids.length) {
        throw fail('กรุณาส่งลำดับหมวดหมู่ (ids)', 422);
      }
      await transaction(async (conn) => {
        for (let i = 0; i < b.ids.length; i += 1) {
          const catId = Number(b.ids[i]);
          if (Number.isInteger(catId) && catId > 0) {
            await conn.execute('UPDATE menu_categories SET sort_order = ? WHERE id = ?', [i + 1, catId]);
          }
        }
      });
      await writeLog(req, 'category.reorder', 'menu_categories', null, { ids: b.ids });
      return ok(res, { ids: b.ids }, 'เรียงลำดับหมวดหมู่แล้ว');
    }

    case 'delete': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) throw fail('รหัสหมวดหมู่ไม่ถูกต้อง', 422);

      const existing = await queryOne('SELECT * FROM menu_categories WHERE id = ?', [id]);
      if (!existing) throw fail('ไม่พบหมวดหมู่', 404);

      const countRow = await queryOne(
        'SELECT COUNT(*) AS cnt FROM menu_items WHERE category_id = ? AND is_deleted = 0',
        [id]
      );
      const activeMenus = Number((countRow && countRow.cnt) || 0);
      if (activeMenus > 0) {
        throw fail(`ซ่อนหมวด "${existing.name}" ไม่ได้ เนื่องจากยังมีเมนูที่ใช้งานอยู่ในหมวดนี้ ${activeMenus} รายการ`, 400);
      }

      await query('UPDATE menu_categories SET is_active = 0 WHERE id = ?', [id]);
      await writeLog(req, 'category.delete', 'menu_categories', id, { name: existing.name });
      return ok(res, { id }, 'ซ่อนหมวดหมู่แล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
