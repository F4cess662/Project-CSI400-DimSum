/**
 * /api/queue — บัตรคิวหน้าร้าน (คนที่ 4 · เฟส 2) · FR-03, 04 · staff+
 * GET                                        → คิวของวันนี้ที่ยังรออยู่ (waiting / called) แยกตามกลุ่ม
 *   data = { order_open, closed_message, groups: { bar: [...], small: [...], large: [...] } }
 *   แต่ละคิว: id, queue_no, group_type, party_size, status, called_count, created_at, called_at,
 *             wait_minutes, ahead (จำนวนคิวก่อนหน้าในกลุ่มเดียวกัน), can_skip
 * POST {"action":"issue","party_size":3}      → ออกบัตรคิว 1 = บาร์ (A-) · 2–4 = โต๊ะเล็ก (S-) · 5–8 = โต๊ะใหญ่ (L-)
 *                                               เลขรันใหม่ทุกวันแยกตามกลุ่ม · หลังปิดรับออเดอร์ออกคิวไม่ได้
 * POST {"action":"call","id":5}               → เรียกคิว (นับครั้ง · จำเวลาที่เรียกครั้งแรก)
 * POST {"action":"skip","id":5}               → ข้ามคิว เมื่อเรียกครบ 3 ครั้ง หรือเรียกครั้งแรกเกิน 5 นาที (BR-03)
 * POST {"action":"seat","id":5,"bill_id":12}  → ให้นั่ง (เปิดบิลด้วย /api/bills open ก่อน แล้วส่ง bill_id มา)
 */
const router = require('express').Router();
const { query, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireRole, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { isOrderOpenNow, closedMessage } = require('../lib/shop');

const STAFF_UP = ['staff', 'manager', 'owner'];
const GROUPS = { bar: 'A', small: 'S', large: 'L' };
const SKIP_CALLS = 3;   // BR-03
const SKIP_MINUTES = 5; // BR-03

/** จำนวนคน → กลุ่มคิว */
function groupOf(partySize) {
  if (partySize === 1) return 'bar';
  if (partySize <= 4) return 'small';
  return 'large';
}

const TICKET_SQL = `SELECT q.id, q.queue_no, q.group_type, q.party_size, q.status, q.called_count,
       q.created_at, q.called_at, q.bill_id,
       TIMESTAMPDIFF(MINUTE, q.created_at, NOW()) AS wait_minutes,
       (q.called_count >= ${SKIP_CALLS}
         OR (q.called_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, q.called_at, NOW()) >= ${SKIP_MINUTES * 60})) AS can_skip
  FROM queue_tickets q`;

/** คิวของวันนี้ที่ยังจัดการได้ (รอ/เรียกแล้ว) · ล็อกแถวเมื่ออยู่ใน transaction */
async function activeTicket(conn, id) {
  const [[t]] = await conn.execute(`${TICKET_SQL} WHERE q.id = ? FOR UPDATE`, [id]);
  if (!t) throw fail('ไม่พบคิวนี้', 404);
  if (!['waiting', 'called'].includes(t.status)) throw fail(`คิว ${t.queue_no} ถูกจัดการไปแล้ว`, 409);
  return t;
}

function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw fail('รหัสคิวไม่ถูกต้อง', 422);
  return id;
}

/* ---------- GET ---------- */
router.get('/', requireRole(STAFF_UP), handle(async (req, res) => {
  const rows = await query(
    `${TICKET_SQL}
      WHERE DATE(q.created_at) = CURDATE() AND q.status IN ('waiting', 'called')
      ORDER BY q.id`);
  const groups = { bar: [], small: [], large: [] };
  for (const r of rows) {
    const list = groups[r.group_type];
    list.push({ ...r, can_skip: r.can_skip === 1, ahead: list.length });
  }
  const orderOpen = await isOrderOpenNow();
  return ok(res, {
    order_open: orderOpen,
    closed_message: orderOpen ? null : await closedMessage(),
    groups,
  });
}));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'issue': {
      await mustBe(req, STAFF_UP);
      requireFields(b, ['party_size']);
      const size = Number(b.party_size);
      if (!Number.isInteger(size) || size < 1 || size > 8) throw fail('จำนวนคนต้องอยู่ระหว่าง 1 ถึง 8 คน', 422);
      if (!(await isOrderOpenNow())) throw fail(await closedMessage() + ' จึงออกบัตรคิวไม่ได้', 409); // BR-01

      const group = groupOf(size);
      const prefix = GROUPS[group] + '-';
      const ticket = await transaction(async (conn) => {
        // เลขรันต่อวันต่อกลุ่ม · FOR UPDATE กันออกเลขซ้ำเมื่อกดพร้อมกัน
        const [[last]] = await conn.execute(
          `SELECT queue_no FROM queue_tickets
            WHERE group_type = ? AND DATE(created_at) = CURDATE()
            ORDER BY id DESC LIMIT 1 FOR UPDATE`, [group]);
        const seq = last ? Number(last.queue_no.slice(prefix.length)) + 1 : 1;
        const queueNo = prefix + String(seq).padStart(3, '0');
        const [ins] = await conn.execute(
          'INSERT INTO queue_tickets (queue_no, group_type, party_size) VALUES (?, ?, ?)', [queueNo, group, size]);
        const [[row]] = await conn.execute(
          `SELECT id, queue_no, group_type, party_size, status, created_at,
                  (SELECT COUNT(*) FROM queue_tickets x
                    WHERE x.group_type = ? AND DATE(x.created_at) = CURDATE()
                      AND x.status IN ('waiting', 'called') AND x.id < ?) AS ahead
             FROM queue_tickets WHERE id = ?`, [group, ins.insertId, ins.insertId]);
        return row;
      });
      await writeLog(req, 'queue.issue', 'queue_tickets', ticket.id, { queue_no: ticket.queue_no, party_size: size });
      return ok(res, ticket, `ออกบัตรคิว ${ticket.queue_no} แล้ว`);
    }

    case 'call': {
      await mustBe(req, STAFF_UP);
      requireFields(b, ['id']);
      const id = toId(b.id);
      const t = await transaction(async (conn) => {
        const cur = await activeTicket(conn, id);
        await conn.execute(
          `UPDATE queue_tickets
              SET status = 'called', called_count = called_count + 1, called_at = COALESCE(called_at, NOW())
            WHERE id = ?`, [id]);
        return { ...cur, called_count: cur.called_count + 1 };
      });
      await writeLog(req, 'queue.call', 'queue_tickets', id, { queue_no: t.queue_no, called_count: t.called_count });
      return ok(res, { id, called_count: t.called_count }, `เรียกคิว ${t.queue_no} ครั้งที่ ${t.called_count}`);
    }

    case 'skip': {
      await mustBe(req, STAFF_UP);
      requireFields(b, ['id']);
      const id = toId(b.id);
      const t = await transaction(async (conn) => {
        const cur = await activeTicket(conn, id);
        if (cur.can_skip !== 1) {
          throw fail(`ข้ามคิวได้เมื่อเรียกครบ ${SKIP_CALLS} ครั้ง หรือเรียกครั้งแรกเกิน ${SKIP_MINUTES} นาที`, 409);
        }
        await conn.execute("UPDATE queue_tickets SET status = 'skipped' WHERE id = ?", [id]);
        return cur;
      });
      await writeLog(req, 'queue.skip', 'queue_tickets', id, { queue_no: t.queue_no, called_count: t.called_count });
      return ok(res, { id }, `ข้ามคิว ${t.queue_no} แล้ว`);
    }

    case 'seat': {
      await mustBe(req, STAFF_UP);
      requireFields(b, ['id', 'bill_id']);
      const id = toId(b.id);
      const billId = Number(b.bill_id);
      if (!Number.isInteger(billId) || billId < 1) throw fail('รหัสบิลไม่ถูกต้อง', 422);
      const t = await transaction(async (conn) => {
        const cur = await activeTicket(conn, id);
        const [[bill]] = await conn.execute('SELECT id, bill_no, status FROM bills WHERE id = ?', [billId]);
        if (!bill) throw fail('ไม่พบบิลนี้', 404);
        if (bill.status !== 'open') throw fail(`บิล ${bill.bill_no} ไม่ได้เปิดอยู่`, 409);
        const [[used]] = await conn.execute(
          'SELECT queue_no FROM queue_tickets WHERE bill_id = ? AND id <> ? LIMIT 1', [billId, id]);
        if (used) throw fail(`บิล ${bill.bill_no} ผูกกับคิว ${used.queue_no} แล้ว`, 409);
        await conn.execute("UPDATE queue_tickets SET status = 'seated', bill_id = ? WHERE id = ?", [billId, id]);
        return { ...cur, bill_no: bill.bill_no };
      });
      await writeLog(req, 'queue.seat', 'queue_tickets', id, { queue_no: t.queue_no, bill_id: billId, bill_no: t.bill_no });
      return ok(res, { id, bill_id: billId }, `คิว ${t.queue_no} ได้นั่งแล้ว (บิล ${t.bill_no})`);
    }

    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
