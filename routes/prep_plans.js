/**
 * /api/prep_plans — แผนเตรียมของประจำวัน (FR-45, 46 · BR-24 · UC-40 · คนที่ 3 · เฟส 4)
 *
 * GET  /api/prep_plans?date=YYYY-MM-DD (manager, owner)
 *      - แต่ละเมนูที่ใช้งาน (is_deleted = 0):
 *        · sold_today: ยอดขายของวันที่เลือก (ไม่นับออเดอร์/บิล/รายการที่ยกเลิก)
 *        · w1_qty..w4_qty: ยอดขายวันเดียวกันในสัปดาห์ย้อนหลัง 1–4 สัปดาห์
 *        · avg_4weeks: ค่าเฉลี่ยยอดขายวันเดียวกันของ 4 สัปดาห์ก่อน
 *        · suggested_qty: CEIL(avg_4weeks * 1.1) (แนะนำ +10% ปัดขึ้น ตาม BR-24)
 *        · confirmed_qty: ยอดที่ผู้จัดการยืนยันแล้ว (null = ยังไม่ยืนยัน)
 *
 * POST /api/prep_plans
 *   - action: 'confirm' (manager, owner)
 *     ส่ง { action: 'confirm', date: 'YYYY-MM-DD', items: [{ menu_item_id, confirmed_qty }] }
 *     · บันทึก confirmed_qty และ confirmed_by ลงตาราง prep_plans
 *     · อัปเดต menu_items.available_qty = confirmed_qty เป็นจำนวนพร้อมขายเริ่มต้นของวันนั้น (FR-46)
 *     · บันทึก writeLog('prep_plan.confirm', ...)
 */
const router = require('express').Router();
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireRole, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const PREP_ROLES = ['manager', 'owner'];

function isValidDateStr(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim());
}

/**
 * ดึงข้อมูลแผนเตรียมของสำหรับวันที่กำหนด พร้อมคำนวณยอดขายวันนี้,
 * ยอดขายวันเดียวกันย้อนหลัง 4 สัปดาห์, ค่าเฉลี่ย 4 สัปดาห์ และยอดแนะนำ +10% (ปัดขึ้น)
 */
async function buildPrepPlanForDate(planDate) {
  const rows = await query(
    `SELECT m.id AS menu_item_id,
            m.category_id,
            c.name AS category_name,
            m.name AS menu_name,
            m.unit,
            m.kitchen_zone,
            m.lot_size,
            m.available_qty,
            m.is_available,
            p.id AS prep_plan_id,
            p.suggested_qty AS saved_suggested_qty,
            p.confirmed_qty,
            p.confirmed_by,
            u.full_name AS confirmed_by_name,
            COALESCE(s.sold_today, 0) AS sold_today,
            COALESCE(s.w1_qty, 0) AS w1_qty,
            COALESCE(s.w2_qty, 0) AS w2_qty,
            COALESCE(s.w3_qty, 0) AS w3_qty,
            COALESCE(s.w4_qty, 0) AS w4_qty
       FROM menu_items m
       JOIN menu_categories c ON c.id = m.category_id
       LEFT JOIN prep_plans p
         ON p.menu_item_id = m.id AND p.plan_date = ?
       LEFT JOIN users u
         ON u.id = p.confirmed_by
       LEFT JOIN (
         SELECT oi.menu_item_id,
                SUM(CASE WHEN DATE(o.created_at) = ? THEN (oi.qty - oi.cancelled_qty) ELSE 0 END) AS sold_today,
                SUM(CASE WHEN DATE(o.created_at) = DATE_SUB(?, INTERVAL 7 DAY) THEN (oi.qty - oi.cancelled_qty) ELSE 0 END) AS w1_qty,
                SUM(CASE WHEN DATE(o.created_at) = DATE_SUB(?, INTERVAL 14 DAY) THEN (oi.qty - oi.cancelled_qty) ELSE 0 END) AS w2_qty,
                SUM(CASE WHEN DATE(o.created_at) = DATE_SUB(?, INTERVAL 21 DAY) THEN (oi.qty - oi.cancelled_qty) ELSE 0 END) AS w3_qty,
                SUM(CASE WHEN DATE(o.created_at) = DATE_SUB(?, INTERVAL 28 DAY) THEN (oi.qty - oi.cancelled_qty) ELSE 0 END) AS w4_qty
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN bills b  ON b.id = o.bill_id
          WHERE o.cancelled_at IS NULL
            AND b.status <> 'cancelled'
            AND oi.status <> 'cancelled'
            AND o.created_at >= DATE_SUB(?, INTERVAL 28 DAY)
            AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
          GROUP BY oi.menu_item_id
       ) s ON s.menu_item_id = m.id
      WHERE m.is_deleted = 0 AND c.is_active = 1
      ORDER BY c.sort_order ASC, m.id ASC`,
    [planDate, planDate, planDate, planDate, planDate, planDate, planDate, planDate]
  );

  const items = rows.map((r) => {
    const w1 = Number(r.w1_qty || 0);
    const w2 = Number(r.w2_qty || 0);
    const w3 = Number(r.w3_qty || 0);
    const w4 = Number(r.w4_qty || 0);
    const total4Weeks = w1 + w2 + w3 + w4;
    const avg4Weeks = Number((total4Weeks / 4).toFixed(2));
    // BR-24: ยอดแนะนำ = ค่าเฉลี่ยยอดขายวันเดียวกันของ 4 สัปดาห์ก่อน × 1.1 ปัดขึ้น
    const suggestedQty = Math.ceil(avg4Weeks * 1.1);

    return {
      menu_item_id: r.menu_item_id,
      category_id: r.category_id,
      category_name: r.category_name,
      menu_name: r.menu_name,
      unit: r.unit,
      kitchen_zone: r.kitchen_zone,
      lot_size: Number(r.lot_size || 1),
      available_qty: r.available_qty !== null ? Number(r.available_qty) : null,
      is_available: Number(r.is_available),
      sold_today: Number(r.sold_today || 0),
      w1_qty: w1,
      w2_qty: w2,
      w3_qty: w3,
      w4_qty: w4,
      avg_4weeks: avg4Weeks,
      suggested_qty: suggestedQty,
      confirmed_qty: r.confirmed_qty !== null && r.confirmed_qty !== undefined ? Number(r.confirmed_qty) : null,
      confirmed_by: r.confirmed_by || null,
      confirmed_by_name: r.confirmed_by_name || null,
    };
  });

  // ซิงก์ suggested_qty ลงตาราง prep_plans เพื่อให้หน้า "ยอดเตรียมวันนี้" (prep-today.html) ของครัวมีข้อมูลยอดแนะนำเสมอ
  if (items.length > 0) {
    await transaction(async (conn) => {
      for (const it of items) {
        await conn.execute(
          `INSERT INTO prep_plans (plan_date, menu_item_id, suggested_qty)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE suggested_qty = VALUES(suggested_qty)`,
          [planDate, it.menu_item_id, it.suggested_qty]
        );
      }
    });
  }

  return items;
}

// GET /api/prep_plans?date=YYYY-MM-DD
router.get('/', requireRole(PREP_ROLES), handle(async (req, res) => {
  const todayRow = await queryOne('SELECT CURDATE() AS today');
  const todayStr = String(todayRow.today).slice(0, 10);
  const planDate = req.query.date ? String(req.query.date).trim() : todayStr;

  if (!isValidDateStr(planDate)) {
    throw fail('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)', 422);
  }

  const dRows = await queryOne(
    `SELECT DATE_SUB(?, INTERVAL 7 DAY) AS w1_date,
            DATE_SUB(?, INTERVAL 14 DAY) AS w2_date,
            DATE_SUB(?, INTERVAL 21 DAY) AS w3_date,
            DATE_SUB(?, INTERVAL 28 DAY) AS w4_date`,
    [planDate, planDate, planDate, planDate]
  );

  const items = await buildPrepPlanForDate(planDate);

  return ok(res, {
    plan_date: planDate,
    today: todayStr,
    history_dates: {
      w1_date: dRows.w1_date,
      w2_date: dRows.w2_date,
      w3_date: dRows.w3_date,
      w4_date: dRows.w4_date,
    },
    items,
  });
}));

// POST /api/prep_plans
router.post('/', handle(async (req, res) => {
  const b = req.body || {};
  switch (b.action) {
    case 'confirm': {
      const user = await mustBe(req, PREP_ROLES);
      requireFields(b, ['items']);

      const todayRow = await queryOne('SELECT CURDATE() AS today');
      const todayStr = String(todayRow.today).slice(0, 10);
      const planDate = b.date ? String(b.date).trim() : todayStr;

      if (!isValidDateStr(planDate)) {
        throw fail('รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)', 422);
      }
      if (!Array.isArray(b.items) || b.items.length === 0) {
        throw fail('กรุณาระบุรายการเมนูที่ต้องการยืนยัน (items)', 422);
      }

      // คำนวณค่า suggested_qty ล่าสุดของวันนั้นก่อนบันทึก
      const currentPlan = await buildPrepPlanForDate(planDate);
      const suggestedMap = new Map(currentPlan.map((it) => [Number(it.menu_item_id), Number(it.suggested_qty || 0)]));

      const cleanItems = [];
      for (const raw of b.items) {
        const menuItemId = Number(raw.menu_item_id);
        const confirmedQty = Number(raw.confirmed_qty);
        if (!Number.isInteger(menuItemId) || menuItemId < 1) {
          throw fail('รหัสเมนูในรายการยืนยันไม่ถูกต้อง', 422);
        }
        if (!Number.isInteger(confirmedQty) || confirmedQty < 0) {
          throw fail('จำนวนที่ยืนยันต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป', 422);
        }
        if (!suggestedMap.has(menuItemId)) {
          throw fail(`ไม่พบเมนูรหัส ${menuItemId} ที่ใช้งานอยู่`, 404);
        }
        cleanItems.push({
          menu_item_id: menuItemId,
          suggested_qty: suggestedMap.get(menuItemId),
          confirmed_qty: confirmedQty,
        });
      }

      await transaction(async (conn) => {
        for (const it of cleanItems) {
          await conn.execute(
            `INSERT INTO prep_plans (plan_date, menu_item_id, suggested_qty, confirmed_qty, confirmed_by)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               suggested_qty = VALUES(suggested_qty),
               confirmed_qty = VALUES(confirmed_qty),
               confirmed_by  = VALUES(confirmed_by)`,
            [planDate, it.menu_item_id, it.suggested_qty, it.confirmed_qty, user.id]
          );

          // FR-46: ยอดที่ยืนยัน = จำนวนพร้อมขายเริ่มต้นของวันนั้น (ไม่แตะสถานะเปิด/ปิดขาย is_available)
          await conn.execute(
            'UPDATE menu_items SET available_qty = ? WHERE id = ? AND is_deleted = 0',
            [it.confirmed_qty, it.menu_item_id]
          );
        }
      });

      const totalConfirmedQty = cleanItems.reduce((sum, it) => sum + it.confirmed_qty, 0);
      await writeLog(req, 'prep_plan.confirm', 'prep_plans', null, {
        plan_date: planDate,
        menu_count: cleanItems.length,
        total_confirmed_qty: totalConfirmedQty,
      });

      return ok(
        res,
        {
          plan_date: planDate,
          confirmed_count: cleanItems.length,
          total_confirmed_qty: totalConfirmedQty,
        },
        `ยืนยันแผนเตรียมของวันที่ ${planDate} และตั้งจำนวนพร้อมขายเริ่มต้นแล้ว (${cleanItems.length} เมนู)`
      );
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
