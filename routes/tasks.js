/**
 * /api/tasks — งานตามเวลา: คูปองวันเกิดและรีเซ็ตแต้ม (FR-43, FR-44)
 *
 * GET  ?month=1..12  สรุปสมาชิกเดือนเกิดและประวัติงาน (สำหรับหน้า owner)
 * POST birthday_coupons { month }  แจกคูปอง BDAY ให้สมาชิกที่เกิดเดือนนั้น
 * POST year_end_reset             หมดอายุแต้มคงเหลือและตั้ง balance เป็น 0
 */
const router = require('express').Router();
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireRole } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const OWNER_ONLY = requireRole(['owner']);

router.get('/', OWNER_ONLY, handle(async (req, res) => {
  const month = Number(req.query.month || new Date().getMonth() + 1);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw fail('เดือนต้องอยู่ระหว่าง 1–12', 400);
  }

  const count = await queryOne(
    `SELECT COUNT(*) AS total
       FROM members
      WHERE birth_date IS NOT NULL AND MONTH(birth_date) = ?`,
    [month]
  );
  const history = await query(
    `SELECT l.id, l.action, l.detail, l.created_at, u.full_name
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.user_id
      WHERE l.action IN ('tasks.birthday_coupons', 'tasks.year_end_reset')
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 30`
  );

  return ok(res, {
    month,
    birthday_member_count: Number(count && count.total || 0),
    history
  });
}));

router.post('/', OWNER_ONLY, handle(async (req, res) => {
  const body = req.body || {};

  switch (body.action) {
    case 'birthday_coupons': {
      requireFields(body, ['month']);
      const month = Number(body.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw fail('กรุณาเลือกเดือนเกิดให้ถูกต้อง', 400);
      }

      const coupon = await queryOne(
        `SELECT id, code, end_date
           FROM coupons
          WHERE code = 'BDAY' AND is_active = 1
          LIMIT 1`
      );
      if (!coupon) {
        throw fail('ไม่พบคูปอง BDAY หรือคูปองถูกปิดใช้งาน กรุณาตั้งค่าคูปองวันเกิดก่อน', 400);
      }

      const result = await transaction(async (conn) => {
        // ล็อกแถวสมาชิกระหว่างแจก ป้องกันการกดซ้ำพร้อมกันแล้วแจกซ้ำ
        const [members] = await conn.execute(
          `SELECT id
             FROM members
            WHERE birth_date IS NOT NULL AND MONTH(birth_date) = ?
            ORDER BY id
            FOR UPDATE`,
          [month]
        );

        let issued = 0;
        let skipped = 0;
        for (const member of members) {
          // ไม่แจกซ้ำให้สมาชิกคนเดิมในรอบเดือน/ปีที่กำลังดำเนินการ
          const [existing] = await conn.execute(
            `SELECT id
               FROM member_coupons
              WHERE member_id = ?
                AND coupon_id = ?
                AND YEAR(issued_at) = YEAR(CURDATE())
                AND MONTH(issued_at) = MONTH(CURDATE())
              LIMIT 1
              FOR UPDATE`,
            [member.id, coupon.id]
          );

          if (existing.length) {
            skipped += 1;
            continue;
          }

          await conn.execute(
            `INSERT INTO member_coupons (member_id, coupon_id, expires_at)
             VALUES (?, ?, ?)`,
            [member.id, coupon.id, coupon.end_date]
          );
          issued += 1;
        }

        return {
          month,
          eligible: members.length,
          issued,
          skipped,
          coupon_code: coupon.code
        };
      });

      await writeLog(req, 'tasks.birthday_coupons', 'coupons', coupon.id, result);
      return ok(res, result, `แจกคูปองวันเกิดสำเร็จ ${result.issued} คน`);
    }

    case 'year_end_reset': {
      const result = await transaction(async (conn) => {
        const [members] = await conn.execute(
          `SELECT id, points_balance
             FROM members
            WHERE points_balance <> 0
            ORDER BY id
            FOR UPDATE`
        );

        let pointsExpired = 0;
        for (const member of members) {
          const points = Number(member.points_balance || 0);
          if (!Number.isInteger(points) || points === 0) continue;

          await conn.execute(
            `INSERT INTO point_transactions
               (member_id, bill_id, points, type, reward_id, created_by)
             VALUES (?, NULL, ?, 'expire', NULL, ?)`,
            [member.id, -points, req.user.id]
          );
          pointsExpired += Math.max(0, points);
        }

        // ทำใน transaction เดียวกับการบันทึกประวัติแต้ม
        await conn.execute(
          `UPDATE members SET points_balance = 0 WHERE points_balance <> 0`
        );

        return {
          members_reset: members.length,
          points_expired: pointsExpired
        };
      });

      await writeLog(req, 'tasks.year_end_reset', 'members', null, result, 'system');
      return ok(res, result, `รีเซ็ตแต้มสำเร็จ ${result.members_reset} สมาชิก`);
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
