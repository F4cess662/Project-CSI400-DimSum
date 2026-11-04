/**
 * /api/kitchen — จอครัวแยกโซน (kitchen-service · port 4001) FR-15–19, 46
 * Gateway (port 3000) ส่ง /api/kitchen มาที่นี่ · ถ้า service นี้ดับ ส่วนอื่นของร้านยังทำงาน ลูกค้ายังสั่งได้
 *
 * GET  ?zone=steam                       → รายการที่ยังไม่เสร็จ เรียงตามเวลาสั่ง (ไม่ส่ง zone = ทุกโซน)
 * GET  ?action=prep_today                → ยอดที่ต้องเตรียมวันนี้ (prep_plans) + ทำไปแล้วเท่าไหร่
 * POST {"action":"update_status","item_id":1,"status":"cooking"}
 * POST {"action":"cancel_item","item_id":1,"cancel_qty":2,"reason":"out_of_stock","note":"..."}
 *
 * ใช้ตาราง orders, order_items, menu_items, bills, bill_tables, dining_tables, vip_rooms (+ อ่าน prep_plans สำหรับ prep_today)
 */
const router = require('express').Router();
const { query, queryOne, transaction } = require('../../../lib/db');
const { ok, fail, requireFields, handle } = require('../../../lib/response');
const { requireRole, mustBe } = require('../../../lib/auth');
const { writeLog } = require('../../../lib/log');

const KITCHEN_ROLES = ['head_chef', 'manager', 'owner'];
const ZONES = ['steam', 'fry', 'congee_noodle', 'drink_dessert'];

/** ขั้นถัดไปที่เปลี่ยนได้ (ทีละขั้น) · drink_dessert ข้าม ready (QC) ไป done ได้ */
const NEXT = { waiting: ['cooking'], cooking: ['ready'], ready: ['done'] };
const NEXT_SKIP_QC = { ...NEXT, cooking: ['ready', 'done'] };

/** เหตุผลที่หัวหน้าเชฟยกเลิกได้ (customer = ลูกค้ายกเลิกเองผ่าน /api/orders ไม่ใช่ที่นี่) */
const CANCEL_REASONS = { out_of_stock: 'วัตถุดิบหมด', spoiled: 'ของเสีย', other: 'อื่นๆ' };

/** รายการในครัวที่ยังไม่เสร็จ ของบิลที่ยังเปิด (ออเดอร์ที่ลูกค้ายกเลิกทั้งใบไม่แสดง) */
async function loadQueue() {
  return query(
    `SELECT oi.id, oi.order_id, oi.menu_item_id, oi.qty, oi.cancelled_qty, oi.qty - oi.cancelled_qty AS remaining_qty,
            oi.status, oi.cancel_reason, oi.cancel_note, oi.updated_at,
            m.name AS menu_name, m.unit, m.kitchen_zone,
            o.round_no, o.source, o.created_at,
            TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS wait_minutes,
            b.id AS bill_id, b.bill_no, v.name AS vip_room_name,
            (SELECT GROUP_CONCAT(t.code ORDER BY t.code SEPARATOR '+')
             FROM bill_tables bt JOIN dining_tables t ON t.id = bt.table_id
             WHERE bt.bill_id = b.id) AS table_codes
     FROM order_items oi
     JOIN orders o     ON o.id = oi.order_id
     JOIN bills b      ON b.id = o.bill_id
     JOIN menu_items m ON m.id = oi.menu_item_id
     LEFT JOIN vip_rooms v ON v.id = b.vip_room_id
     WHERE oi.status IN ('waiting', 'cooking', 'ready') AND o.cancelled_at IS NULL AND b.status = 'open'
     ORDER BY o.created_at, oi.id`);
}

/** ยอดเตรียมวันนี้: เป้าหมาย = ยอดที่ยืนยัน (ถ้ายังไม่ยืนยันใช้ยอดแนะนำ) · ทำแล้ว = จำนวนที่พร้อมเสิร์ฟ/เสิร์ฟแล้ววันนี้ */
async function loadPrepToday() {
  const rows = await query(
    `SELECT p.menu_item_id, m.name AS menu_name, m.unit, m.kitchen_zone, m.lot_size, m.available_qty, m.is_available,
            p.suggested_qty, p.confirmed_qty, COALESCE(p.confirmed_qty, p.suggested_qty) AS target_qty,
            COALESCE((SELECT SUM(oi.qty - oi.cancelled_qty)
                      FROM order_items oi JOIN orders o ON o.id = oi.order_id
                      WHERE oi.menu_item_id = p.menu_item_id AND oi.status IN ('ready', 'done')
                        AND o.cancelled_at IS NULL
                        AND o.created_at >= CURDATE() AND o.created_at < CURDATE() + INTERVAL 1 DAY), 0) AS made_qty
     FROM prep_plans p JOIN menu_items m ON m.id = p.menu_item_id
     WHERE p.plan_date = CURDATE() AND m.is_deleted = 0
     ORDER BY FIELD(m.kitchen_zone, 'steam', 'fry', 'congee_noodle', 'drink_dessert'), m.name`);
  return rows.map((r) => ({ ...r, made_qty: Number(r.made_qty) }));
}

// GET /api/kitchen
router.get('/', requireRole(KITCHEN_ROLES), handle(async (req, res) => {
  if (req.query.action === 'prep_today') {
    const today = await queryOne('SELECT CURDATE() AS d');
    return ok(res, { plan_date: today.d, items: await loadPrepToday() });
  }
  if (req.query.action) throw fail('ไม่รู้จัก action นี้', 400);

  const zone = req.query.zone || null;
  if (zone && !ZONES.includes(zone)) throw fail('ไม่รู้จักโซนครัวนี้', 400);
  const all = await loadQueue();
  // จำนวนค้างของทุกโซน (ใช้ทำแท็บ) แม้จะขอแค่โซนเดียว
  const counts = Object.fromEntries(ZONES.map((z) => [z, all.filter((it) => it.kitchen_zone === z).length]));
  const now = await queryOne('SELECT NOW() AS now');
  return ok(res, {
    zone,
    items: zone ? all.filter((it) => it.kitchen_zone === zone) : all,
    counts,
    total: all.length,
    server_time: now.now,
  });
}));

/** รายการเดียว + โซน (ใช้ตรวจก่อนเปลี่ยน) */
async function findItem(conn, id) {
  const [[row]] = await conn.execute(
    `SELECT oi.id, oi.qty, oi.cancelled_qty, oi.status, oi.menu_item_id,
            m.name AS menu_name, m.unit, m.kitchen_zone, o.cancelled_at, b.status AS bill_status
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN bills b ON b.id = o.bill_id
     JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.id = ? FOR UPDATE`, [id]);
  if (!row) throw fail('ไม่พบรายการนี้', 404);
  if (row.cancelled_at || row.bill_status !== 'open') throw fail('ออเดอร์นี้ถูกยกเลิกหรือปิดบิลแล้ว', 409);
  return row;
}

// POST /api/kitchen
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'update_status': {
      const user = await mustBe(req, KITCHEN_ROLES);
      requireFields(b, ['item_id', 'status']);
      const result = await transaction(async (conn) => {
        const it = await findItem(conn, b.item_id);
        const allowed = (it.kitchen_zone === 'drink_dessert' ? NEXT_SKIP_QC : NEXT)[it.status] || [];
        if (!allowed.includes(b.status)) {
          throw fail(it.status === 'done' || it.status === 'cancelled'
            ? 'รายการนี้เสร็จหรือถูกยกเลิกไปแล้ว'
            : 'เปลี่ยนสถานะได้ทีละขั้นเท่านั้น (รอ → กำลังทำ → พร้อมเสิร์ฟ → เสิร์ฟแล้ว)', 409);
        }
        await conn.execute('UPDATE order_items SET status = ?, updated_by = ? WHERE id = ?', [b.status, user.id, it.id]);
        return { id: it.id, from: it.status, status: b.status, menu_name: it.menu_name };
      });
      await writeLog(req, 'order_item.update_status', 'order_items', result.id,
        { menu: result.menu_name, from: result.from, to: result.status });
      return ok(res, result, 'อัปเดตสถานะแล้ว');
    }

    case 'cancel_item': {
      const user = await mustBe(req, KITCHEN_ROLES);
      requireFields(b, ['item_id', 'cancel_qty', 'reason']);
      if (!CANCEL_REASONS[b.reason]) throw fail('เหตุผลการยกเลิกไม่ถูกต้อง', 422);
      const note = String(b.note || '').trim().slice(0, 255);
      if (b.reason === 'other' && !note) throw fail('กรุณาระบุรายละเอียดเมื่อเลือกเหตุผล "อื่นๆ"', 422);
      const cancelQty = Number(b.cancel_qty);
      if (!Number.isInteger(cancelQty) || cancelQty < 1) throw fail('จำนวนที่ยกเลิกต้องเป็นจำนวนเต็มตั้งแต่ 1', 422);

      const result = await transaction(async (conn) => {
        const it = await findItem(conn, b.item_id);
        if (it.status === 'done' || it.status === 'cancelled') throw fail('รายการนี้เสร็จหรือถูกยกเลิกไปแล้ว', 409);
        const remaining = it.qty - it.cancelled_qty;
        if (cancelQty > remaining) throw fail(`ยกเลิกได้ไม่เกิน ${remaining} ${it.unit}`, 422);

        const newCancelled = it.cancelled_qty + cancelQty;
        const newStatus = newCancelled === it.qty ? 'cancelled' : it.status;   // ยกเลิกบางส่วน = สถานะเดิม
        await conn.execute(
          `UPDATE order_items SET cancelled_qty = ?, status = ?, cancel_reason = ?, cancel_note = ?, updated_by = ?
           WHERE id = ?`, [newCancelled, newStatus, b.reason, note || null, user.id, it.id]);
        // BR-08: วัตถุดิบหมด = ปิดเมนูทันที · ของเสีย/อื่นๆ = ไม่คืนจำนวนพร้อมขาย (ทำไปแล้วหรือเสียไปแล้ว)
        if (b.reason === 'out_of_stock') {
          await conn.execute('UPDATE menu_items SET available_qty = 0, is_available = 0 WHERE id = ?', [it.menu_item_id]);
        }
        return {
          id: it.id, menu_item_id: it.menu_item_id, menu_name: it.menu_name, unit: it.unit,
          cancel_qty: cancelQty, cancelled_qty: newCancelled, remaining_qty: it.qty - newCancelled,
          status: newStatus, reason: b.reason, menu_closed: b.reason === 'out_of_stock',
        };
      });
      await writeLog(req, 'order_item.cancel', 'order_items', result.id, {
        menu: result.menu_name, cancel_qty: result.cancel_qty, reason: result.reason, note: note || null,
        menu_closed: result.menu_closed,
      });
      return ok(res, result, result.menu_closed
        ? `ยกเลิกแล้ว และปิดขาย ${result.menu_name} เพราะวัตถุดิบหมด`
        : 'ยกเลิกรายการแล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
