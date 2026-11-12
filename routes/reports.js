const router = require('express').Router();
const { query } = require('../lib/db');
const { ok, fail, handle } = require('../lib/response');
const { requireRole } = require('../lib/auth');

const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

router.get('/', requireRole(['manager', 'owner']), handle(async (req, res) => {
  const { from, to } = req.query;

  if (!validDate(from) || !validDate(to)) {
    throw fail('กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดให้ถูกต้อง', 422);
  }

  if (from > to) {
    throw fail('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด', 422);
  }

  const start = `${from} 00:00:00`;
  const end = `${to} 00:00:00`;

  // ยอดค่าอาหาร: นับเฉพาะบิลที่ชำระแล้ว
  // จำนวนขายจริง = qty - cancelled_qty
  const foodDaily = await query(`
    SELECT
      DATE(b.closed_at) AS report_date,
      SUM((oi.qty - oi.cancelled_qty) * oi.unit_price) AS food_sales
    FROM bills b
    JOIN orders o ON o.bill_id = b.id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE b.status = 'paid'
      AND b.closed_at >= ?
      AND b.closed_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY DATE(b.closed_at)
    ORDER BY report_date
  `, [start, end]);

  // ค่าห้อง VIP: ใช้ room_fee จากรายการจอง
  // bill_id เป็นบิลหลักของการจอง และเหมาวันคิดค่าห้องที่บิลหลักเพียงครั้งเดียว
  const roomDaily = await query(`
    SELECT
      DATE(b.closed_at) AS report_date,
      SUM(vb.room_fee) AS room_sales
    FROM vip_bookings vb
    JOIN bills b ON b.id = vb.bill_id
    WHERE b.status = 'paid'
      AND b.closed_at >= ?
      AND b.closed_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY DATE(b.closed_at)
    ORDER BY report_date
  `, [start, end]);

  // มัดจำที่ยึด: ไม่รวมรายการที่คืนเงินแล้ว
  const depositDaily = await query(`
    SELECT
      DATE(vb.deposit_received_at) AS report_date,
      SUM(vb.deposit_amount) AS forfeited_deposits
    FROM vip_bookings vb
    WHERE vb.deposit_received_at IS NOT NULL
      AND vb.deposit_received_at >= ?
      AND vb.deposit_received_at < DATE_ADD(?, INTERVAL 1 DAY)
      AND vb.status IN ('no_show', 'released', 'cancelled')
      AND vb.deposit_refunded_at IS NULL
    GROUP BY DATE(vb.deposit_received_at)
    ORDER BY report_date
  `, [start, end]);

  const billDaily = await query(`
    SELECT
      DATE(closed_at) AS report_date,
      COUNT(*) AS bill_count
    FROM bills
    WHERE status = 'paid'
      AND closed_at >= ?
      AND closed_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY DATE(closed_at)
    ORDER BY report_date
  `, [start, end]);

  // สัดส่วนวิธีชำระเงิน คิดจากยอดที่รับชำระจริงตอนปิดบิล
  const paymentMethods = await query(`
    SELECT
      payment_method,
      COUNT(*) AS bill_count,
      SUM(total_paid) AS total
    FROM bills
    WHERE status = 'paid'
      AND closed_at >= ?
      AND closed_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY payment_method
    ORDER BY total DESC
  `, [start, end]);

  // 10 เมนูขายดี คิดจำนวนที่ขายจริงหลังหักรายการยกเลิก
  const topMenus = await query(`
    SELECT
      mi.id AS menu_item_id,
      mi.name AS menu_name,
      SUM(oi.qty - oi.cancelled_qty) AS qty_sold,
      SUM((oi.qty - oi.cancelled_qty) * oi.unit_price) AS total
    FROM bills b
    JOIN orders o ON o.bill_id = b.id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE b.status = 'paid'
      AND b.closed_at >= ?
      AND b.closed_at < DATE_ADD(?, INTERVAL 1 DAY)
    GROUP BY mi.id, mi.name
    HAVING qty_sold > 0
    ORDER BY qty_sold DESC, total DESC
    LIMIT 10
  `, [start, end]);

  const foodMap = new Map(foodDaily.map(x => [x.report_date, Number(x.food_sales || 0)]));
  const roomMap = new Map(roomDaily.map(x => [x.report_date, Number(x.room_sales || 0)]));
  const depositMap = new Map(depositDaily.map(x => [x.report_date, Number(x.forfeited_deposits || 0)]));
  const billMap = new Map(billDaily.map(x => [x.report_date, Number(x.bill_count || 0)]));

  // เติมวันที่ไม่มีรายการให้กราฟแสดงต่อเนื่อง
  const daily = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);

  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const food_sales = foodMap.get(date) || 0;
    const room_sales = roomMap.get(date) || 0;
    const forfeited_deposits = depositMap.get(date) || 0;

    daily.push({
      report_date: date,
      food_sales,
      room_sales,
      forfeited_deposits,
      total_sales: food_sales + room_sales + forfeited_deposits,
      bill_count: billMap.get(date) || 0,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const sum = (key) => daily.reduce((total, row) => total + Number(row[key] || 0), 0);

  const summary = {
    total_sales: sum('total_sales'),
    food_sales: sum('food_sales'),
    room_sales: sum('room_sales'),
    forfeited_deposits: sum('forfeited_deposits'),
    bill_count: sum('bill_count'),
  };

  return ok(res, {
    from,
    to,
    summary,
    daily,
    payment_methods: paymentMethods.map(x => ({
      payment_method: x.payment_method,
      bill_count: Number(x.bill_count || 0),
      total: Number(x.total || 0),
    })),
    top_menus: topMenus.map(x => ({
      menu_item_id: x.menu_item_id,
      menu_name: x.menu_name,
      qty_sold: Number(x.qty_sold || 0),
      total: Number(x.total || 0),
    })),
  }, 'โหลดรายงานยอดขายแล้ว');
}));

module.exports = router;