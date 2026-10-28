/**
 * /api/tables — ผังโต๊ะ + จัดการโต๊ะ (คนที่ 4 · เฟส 1)
 * GET  [?include_inactive=1]   → โต๊ะ + สถานะ + บิลที่เปิดอยู่ (ใช้วาดผัง) · พนักงานทุกคนที่ล็อกอิน
 * POST {"action":"create","code":"T09","table_type":"small","seats":4,"pos_x":0,"pos_y":0}   (owner)
 * POST {"action":"update","id":9,"code":"T09","table_type":"small","seats":4,"pos_x":1,"pos_y":2} (owner)
 * POST {"action":"deactivate","id":9}   → ปิดใช้ (ปิดโต๊ะที่มีลูกค้าอยู่ไม่ได้)       (owner)
 * POST {"action":"activate","id":9}     → เปิดใช้กลับ                                (owner)
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const TYPES = ['bar', 'small', 'large'];
const marks = (arr) => arr.map(() => '?').join(',');

/** ดึงบิลที่เปิดอยู่ของโต๊ะ (id โต๊ะ → ข้อมูลบิล) พร้อมยอดปัจจุบัน */
async function openBillsByTable(tableIds) {
  if (!tableIds.length) return new Map();
  const rows = await query(
    `SELECT bt.table_id, b.id, b.bill_no, b.qr_token, b.opened_at, b.guests,
            COALESCE(s.total, 0) AS total
       FROM bill_tables bt
       JOIN bills b ON b.id = bt.bill_id AND b.status = 'open'
       LEFT JOIN (
         SELECT o.bill_id,
                SUM(CASE WHEN oi.status <> 'cancelled' THEN (oi.qty - oi.cancelled_qty) * oi.unit_price ELSE 0 END) AS total
           FROM orders o
           LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.cancelled_at IS NULL
          GROUP BY o.bill_id
       ) s ON s.bill_id = b.id
      WHERE bt.table_id IN (${marks(tableIds)})
      ORDER BY b.opened_at`, tableIds);
  const map = new Map();
  for (const r of rows) {
    map.set(r.table_id, {
      id: r.id, bill_no: r.bill_no, qr_token: r.qr_token,
      opened_at: r.opened_at, guests: r.guests, total: Number(r.total),
    });
  }
  return map;
}

/** อ่านตัวเลขจำนวนเต็มจาก body ถ้าไม่ถูกต้องโยน 422 */
function intField(value, label, min, max) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isInteger(n) || n < min || n > max) {
    throw fail(`${label}ต้องเป็นจำนวนเต็มระหว่าง ${min} ถึง ${max}`, 422);
  }
  return n;
}

function cleanCode(value) {
  const code = String(value || '').trim();
  if (!code) throw fail('กรุณากรอกรหัสโต๊ะ', 422);
  if (code.length > 10) throw fail('รหัสโต๊ะยาวไม่เกิน 10 ตัวอักษร', 422);
  return code;
}

/* ---------- GET ---------- */
router.get('/', requireLogin, handle(async (req, res) => {
  const all = req.query.include_inactive === '1';
  const tables = await query(
    `SELECT id, code, table_type, seats, status, pos_x, pos_y, is_active
       FROM dining_tables ${all ? '' : 'WHERE is_active = 1'}
      ORDER BY FIELD(table_type, 'bar', 'small', 'large'), code`);
  const bills = await openBillsByTable(tables.map((t) => t.id));
  return ok(res, tables.map((t) => ({ ...t, is_vip: false, bill: bills.get(t.id) || null })));
}));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['owner']);
      requireFields(b, ['code', 'table_type', 'seats']);
      const code = cleanCode(b.code);
      if (!TYPES.includes(b.table_type)) throw fail('ประเภทโต๊ะต้องเป็น bar, small หรือ large', 422);
      const seats = intField(b.seats, 'จำนวนที่นั่ง', 1, 30);
      const posX = intField(b.pos_x ?? 0, 'ตำแหน่ง X', 0, 9999);
      const posY = intField(b.pos_y ?? 0, 'ตำแหน่ง Y', 0, 9999);
      if (await queryOne('SELECT id FROM dining_tables WHERE code = ?', [code])) {
        throw fail('มีรหัสโต๊ะ ' + code + ' อยู่แล้ว', 409);
      }
      const r = await query(
        'INSERT INTO dining_tables (code, table_type, seats, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)',
        [code, b.table_type, seats, posX, posY]);
      await writeLog(req, 'table.create', 'dining_tables', r.insertId, { code, table_type: b.table_type, seats });
      return ok(res, { id: r.insertId }, 'เพิ่มโต๊ะ ' + code + ' แล้ว');
    }

    case 'update': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const t = await queryOne('SELECT * FROM dining_tables WHERE id = ?', [b.id]);
      if (!t) throw fail('ไม่พบโต๊ะนี้', 404);

      const code = b.code !== undefined ? cleanCode(b.code) : t.code;
      const type = b.table_type !== undefined ? b.table_type : t.table_type;
      if (!TYPES.includes(type)) throw fail('ประเภทโต๊ะต้องเป็น bar, small หรือ large', 422);
      const seats = b.seats !== undefined ? intField(b.seats, 'จำนวนที่นั่ง', 1, 30) : t.seats;
      const posX = b.pos_x !== undefined ? intField(b.pos_x, 'ตำแหน่ง X', 0, 9999) : t.pos_x;
      const posY = b.pos_y !== undefined ? intField(b.pos_y, 'ตำแหน่ง Y', 0, 9999) : t.pos_y;

      if (t.status === 'occupied' && (code !== t.code || type !== t.table_type || seats !== t.seats)) {
        throw fail('โต๊ะมีลูกค้าอยู่ แก้รหัส/ประเภท/จำนวนที่นั่งไม่ได้', 409);
      }
      if (code !== t.code && await queryOne('SELECT id FROM dining_tables WHERE code = ? AND id <> ?', [code, t.id])) {
        throw fail('มีรหัสโต๊ะ ' + code + ' อยู่แล้ว', 409);
      }
      await query('UPDATE dining_tables SET code = ?, table_type = ?, seats = ?, pos_x = ?, pos_y = ? WHERE id = ?',
        [code, type, seats, posX, posY, t.id]);
      await writeLog(req, 'table.update', 'dining_tables', t.id,
        { from: { code: t.code, table_type: t.table_type, seats: t.seats }, to: { code, table_type: type, seats } });
      return ok(res, { id: t.id }, 'แก้ไขโต๊ะ ' + code + ' แล้ว');
    }

    case 'deactivate': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const t = await queryOne('SELECT * FROM dining_tables WHERE id = ?', [b.id]);
      if (!t) throw fail('ไม่พบโต๊ะนี้', 404);
      const openBill = await queryOne(
        `SELECT b.id FROM bill_tables bt JOIN bills b ON b.id = bt.bill_id
          WHERE bt.table_id = ? AND b.status = 'open' LIMIT 1`, [t.id]);
      if (t.status === 'occupied' || openBill) throw fail('โต๊ะ ' + t.code + ' มีลูกค้าอยู่ ปิดใช้งานไม่ได้', 409);
      await query('UPDATE dining_tables SET is_active = 0 WHERE id = ?', [t.id]);
      await writeLog(req, 'table.deactivate', 'dining_tables', t.id, { code: t.code });
      return ok(res, { id: t.id }, 'ปิดใช้งานโต๊ะ ' + t.code + ' แล้ว');
    }

    case 'activate': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const t = await queryOne('SELECT * FROM dining_tables WHERE id = ?', [b.id]);
      if (!t) throw fail('ไม่พบโต๊ะนี้', 404);
      await query('UPDATE dining_tables SET is_active = 1 WHERE id = ?', [t.id]);
      await writeLog(req, 'table.activate', 'dining_tables', t.id, { code: t.code });
      return ok(res, { id: t.id }, 'เปิดใช้งานโต๊ะ ' + t.code + ' แล้ว');
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
