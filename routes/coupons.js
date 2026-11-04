const router = require('express').Router();
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, handle } = require('../lib/response');
const { requireMember } = require('../lib/auth');

router.get('/', handle(async (req, res) => {
  const sessionMemberId = req.session && req.session.memberId;
  const member = sessionMemberId
    ? await queryOne('SELECT id FROM members WHERE id = ?', [sessionMemberId])
    : null;
  const memberId = member ? member.id : null;
  const coupons = await query(
    `SELECT c.*,
            mi.name AS free_item_name,
            (SELECT COUNT(*) FROM member_coupons mc
              WHERE mc.coupon_id = c.id AND mc.member_id = ?) AS my_count,
            (SELECT COUNT(*) FROM member_coupons mc
              WHERE mc.coupon_id = c.id) AS total_collected
       FROM coupons c
       LEFT JOIN menu_items mi ON mi.id = c.free_menu_item_id
      WHERE c.is_active = 1
        AND c.start_date <= CURDATE()
        AND c.end_date >= CURDATE()
      ORDER BY c.end_date, c.id`,
    [memberId],
  );

  return ok(res, {
    isLoggedIn: Boolean(memberId),
    coupons: coupons.map((coupon) => {
      const limit = coupon.per_member_limit == null ? 1 : Number(coupon.per_member_limit);
      return {
       ...coupon,
       collected: Number(coupon.my_count) >= limit,
       sold_out: coupon.usage_limit != null
         && Number(coupon.total_collected) >= Number(coupon.usage_limit),
      };
    }),
  });
}));

router.post('/:id/collect', requireMember, handle(async (req, res) => {
  const couponId = Number(req.params.id);
  if (!Number.isInteger(couponId) || couponId <= 0) throw fail('รหัสคูปองไม่ถูกต้อง', 422);

  await transaction(async (conn) => {
    const [coupons] = await conn.execute(
      `SELECT id, end_date, usage_limit, per_member_limit
         FROM coupons
        WHERE id = ? AND is_active = 1
          AND start_date <= CURDATE()
          AND end_date >= CURDATE()
        FOR UPDATE`,
      [couponId],
    );
    const coupon = coupons[0];
    if (!coupon) throw fail('ไม่พบคูปอง หรือคูปองหมดอายุแล้ว', 404);

    const [[mine]] = await conn.execute(
      'SELECT COUNT(*) AS n FROM member_coupons WHERE member_id = ? AND coupon_id = ?',
      [req.member.id, couponId],
    );
    const perMemberLimit = coupon.per_member_limit == null ? 1 : Number(coupon.per_member_limit);
    if (Number(mine.n) >= perMemberLimit) throw fail('คุณเก็บคูปองนี้ครบสิทธิ์แล้ว', 400);

    if (coupon.usage_limit != null) {
      const [[total]] = await conn.execute(
        'SELECT COUNT(*) AS n FROM member_coupons WHERE coupon_id = ?',
        [couponId],
      );
      if (Number(total.n) >= Number(coupon.usage_limit)) {
        throw fail('คูปองถูกเก็บครบแล้ว', 400);
      }
    }

    await conn.execute(
      `INSERT INTO member_coupons (member_id, coupon_id, issued_at, expires_at)
       VALUES (?, ?, NOW(), ?)`,
      [req.member.id, couponId, coupon.end_date],
    );
  });

  return ok(res, null, 'เก็บคูปองสำเร็จ');
}));

module.exports = router;
