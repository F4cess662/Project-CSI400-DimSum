/**
 * /api/rewards — ตั้งค่ารางวัลแลกแต้ม (FR-41)
 * GET  พนักงานที่ล็อกอิน: รางวัลที่เปิดใช้งาน
 * GET  ?all=1              manager/owner: รวมรางวัลที่ปิดใช้งานสำหรับหน้าจัดการ
 * POST create / update / deactivate  manager+
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, requireRole, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

router.get('/', requireLogin, handle(async (req, res) => {
  const includeInactive = req.query.all === '1';
  if (includeInactive) await mustBe(req, ['manager', 'owner']);

  const where = includeInactive ? '' : 'WHERE r.is_active = 1';
  const rows = await query(
    `SELECT r.id, r.name, r.points_cost, r.reward_type, r.menu_item_id,
            r.discount_value, r.is_active, m.name AS menu_item_name
       FROM rewards r
       LEFT JOIN menu_items m ON m.id = r.menu_item_id
       ${where}
      ORDER BY r.is_active DESC, r.points_cost ASC, r.id DESC`
  );
  return ok(res, rows);
}));

router.post('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const body = req.body || {};

  switch (body.action) {
    case 'create':
    case 'update': {
      const isUpdate = body.action === 'update';
      requireFields(body, isUpdate
        ? ['id', 'name', 'points_cost', 'reward_type']
        : ['name', 'points_cost', 'reward_type']);

      const id = isUpdate ? Number(body.id) : null;
      const name = String(body.name).trim();
      const pointsCost = Number(body.points_cost);
      const rewardType = String(body.reward_type);

      if (isUpdate && (!Number.isInteger(id) || id <= 0)) {
        throw fail('รหัสรางวัลไม่ถูกต้อง', 400);
      }
      if (!name) throw fail('กรุณาระบุชื่อรางวัล', 422);
      if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
        throw fail('แต้มที่ใช้ต้องเป็นจำนวนเต็มมากกว่า 0', 400);
      }
      if (!['free_item', 'discount'].includes(rewardType)) {
        throw fail('ประเภทรางวัลไม่ถูกต้อง', 400);
      }

      let menuItemId = null;
      let discountValue = null;

      if (rewardType === 'free_item') {
        requireFields(body, ['menu_item_id']);
        menuItemId = Number(body.menu_item_id);
        if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
          throw fail('กรุณาเลือกเมนูสำหรับรางวัลของฟรี', 400);
        }
        const menu = await queryOne(
          `SELECT id FROM menu_items WHERE id = ? AND is_deleted = 0`,
          [menuItemId]
        );
        if (!menu) throw fail('ไม่พบเมนูที่เลือกหรือเมนูถูกลบแล้ว', 404);
      } else {
        requireFields(body, ['discount_value']);
        discountValue = Number(body.discount_value);
        if (!Number.isFinite(discountValue) || discountValue <= 0) {
          throw fail('มูลค่าส่วนลดต้องมากกว่า 0 บาท', 400);
        }
      }

      if (!isUpdate) {
        const inserted = await query(
          `INSERT INTO rewards
             (name, points_cost, reward_type, menu_item_id, discount_value, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [name, pointsCost, rewardType, menuItemId, discountValue]
        );
        await writeLog(req, 'reward.create', 'rewards', inserted.insertId, {
          name, points_cost: pointsCost, reward_type: rewardType,
          menu_item_id: menuItemId, discount_value: discountValue
        });
        return ok(res, { id: inserted.insertId, is_active: 1 }, 'เพิ่มรางวัลแล้ว');
      }

      const existing = await queryOne(
        'SELECT id, is_active FROM rewards WHERE id = ?',
        [id]
      );
      if (!existing) throw fail('ไม่พบรางวัลที่ต้องการแก้ไข', 404);

      const active = body.is_active === undefined
        ? Number(existing.is_active)
        : (body.is_active === true || body.is_active === 1 || body.is_active === '1' ? 1 : 0);

      await query(
        `UPDATE rewards
            SET name = ?, points_cost = ?, reward_type = ?, menu_item_id = ?,
                discount_value = ?, is_active = ?
          WHERE id = ?`,
        [name, pointsCost, rewardType, menuItemId, discountValue, active, id]
      );
      await writeLog(req, 'reward.update', 'rewards', id, {
        name, points_cost: pointsCost, reward_type: rewardType,
        menu_item_id: menuItemId, discount_value: discountValue, is_active: active
      });
      return ok(res, { id, is_active: active }, 'บันทึกการแก้ไขรางวัลแล้ว');
    }

    case 'deactivate': {
      requireFields(body, ['id']);
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) throw fail('รหัสรางวัลไม่ถูกต้อง', 400);

      const existing = await queryOne('SELECT id, is_active FROM rewards WHERE id = ?', [id]);
      if (!existing) throw fail('ไม่พบรางวัลที่ต้องการปิดใช้งาน', 404);
      if (Number(existing.is_active) === 0) {
        return ok(res, { id, is_active: 0 }, 'รางวัลนี้ปิดใช้งานอยู่แล้ว');
      }

      await query('UPDATE rewards SET is_active = 0 WHERE id = ?', [id]);
      await writeLog(req, 'reward.deactivate', 'rewards', id, { is_active: 0 });
      return ok(res, { id, is_active: 0 }, 'ปิดใช้งานรางวัลแล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
