/**
 * /api/vip_packages — แพ็กเกจห้อง VIP (คนที่ 4 · แก้ตาม Feedback เฟส 3) · FR-33, FR-50
 * GET                → แพ็กเกจที่เปิดใช้ (สาธารณะ) [{ id, code, name, hours (null = เหมาวัน), price }] เรียงตาม sort_order
 * GET ?all=1         → ทุกแพ็กเกจรวมที่ปิดใช้ + is_active, sort_order (owner · ใช้ในหน้าตั้งค่าร้าน)
 * POST {"action":"update","id":1,"name":"แพ็กเกจ S","price":1200,"is_active":1}   (owner · log ระดับ system)
 *   ส่งเฉพาะฟิลด์ที่ต้องการแก้ได้ · code / hours แก้ไม่ได้ (ระบบใช้คำนวณเวลาจอง)
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const view = (p) => ({ ...p, price: Number(p.price) });

/* ---------- GET ---------- */
router.get('/', handle(async (req, res) => {
  if (req.query.all === '1') {
    await mustBe(req, ['owner']);
    const rows = await query(
      'SELECT id, code, name, hours, price, sort_order, is_active FROM vip_packages ORDER BY sort_order, id');
    return ok(res, rows.map(view));
  }
  const rows = await query(
    'SELECT id, code, name, hours, price FROM vip_packages WHERE is_active = 1 ORDER BY sort_order, id');
  return ok(res, rows.map(view));
}));

/* ---------- POST ---------- */
router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'update': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) throw fail('รหัสแพ็กเกจไม่ถูกต้อง', 422);
      const cur = await queryOne('SELECT * FROM vip_packages WHERE id = ?', [id]);
      if (!cur) throw fail('ไม่พบแพ็กเกจนี้', 404);

      const next = {};
      if (b.name !== undefined) {
        const name = String(b.name ?? '').trim();
        if (!name || name.length > 100) throw fail('ชื่อแพ็กเกจต้องมี 1–100 ตัวอักษร', 422);
        next.name = name;
      }
      if (b.price !== undefined) {
        const price = Number(b.price);
        if (b.price === '' || b.price === null || !Number.isFinite(price) || price < 0 || price > 1000000) {
          throw fail('ราคาแพ็กเกจต้องเป็นตัวเลขระหว่าง 0 ถึง 1,000,000', 422);
        }
        next.price = Math.round(price * 100) / 100;
      }
      if (b.is_active !== undefined) {
        const active = Number(b.is_active);
        if (![0, 1].includes(active)) throw fail('is_active ต้องเป็น 0 หรือ 1', 422);
        if (active === 0 && cur.is_active === 1) {
          const left = await queryOne('SELECT COUNT(*) AS n FROM vip_packages WHERE is_active = 1 AND id <> ?', [id]);
          if (!left.n) throw fail('ต้องเปิดใช้อย่างน้อย 1 แพ็กเกจ', 409);
        }
        next.is_active = active;
      }

      const changes = {};
      for (const [k, v] of Object.entries(next)) {
        if (String(cur[k]) !== String(v) && Number(cur[k]) !== v) changes[k] = { from: cur[k], to: v };
      }
      const keys = Object.keys(changes);
      if (!keys.length) return ok(res, view(cur), 'ไม่มีการเปลี่ยนแปลง');

      await query(`UPDATE vip_packages SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`,
        [...keys.map((k) => next[k]), id]);
      await writeLog(req, 'vip_package.update', 'vip_packages', id, { code: cur.code, ...changes }, 'system');
      const saved = await queryOne('SELECT id, code, name, hours, price, sort_order, is_active FROM vip_packages WHERE id = ?', [id]);
      return ok(res, view(saved), `บันทึก${saved.name}แล้ว`);
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
