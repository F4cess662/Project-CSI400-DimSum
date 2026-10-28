/**
 * /api/holidays — วันหยุดราชการ (FR-50)
 * GET  /api/holidays?year=2026        พนักงานที่ล็อกอินดูได้
 * POST { action: 'create', holiday_date, name } เจ้าของร้านเท่านั้น
 * POST { action: 'delete', id }                 เจ้าของร้านเท่านั้น
 */
const router = require('express').Router();
const { query, queryOne } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireLogin, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

router.get('/', requireLogin, handle(async (req, res) => {
  const yearRaw = req.query.year;
  const year = yearRaw === undefined || yearRaw === '' ? new Date().getFullYear() : Number(yearRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw fail('ปีไม่ถูกต้อง', 422);
  }

  const rows = await query(
    `SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, name
       FROM public_holidays
      WHERE holiday_date >= ? AND holiday_date < DATE_ADD(?, INTERVAL 1 YEAR)
      ORDER BY holiday_date ASC, name ASC`,
    [`${year}-01-01`, `${year}-01-01`]
  );
  return ok(res, rows);
}));

router.post('/', handle(async (req, res) => {
  const b = req.body || {};
  switch (b.action) {
    case 'create': {
      await mustBe(req, ['owner']);
      requireFields(b, ['holiday_date', 'name']);
      const date = String(b.holiday_date).trim();
      const name = String(b.name).trim();
      const parsedDate = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        throw fail('รูปแบบวันที่ไม่ถูกต้อง กรุณาเลือกวันที่จากปฏิทิน', 422);
      }
      if (!name || name.length > 100) throw fail('ชื่อวันหยุดต้องมี 1–100 ตัวอักษร', 422);

      const duplicate = await queryOne('SELECT id FROM public_holidays WHERE holiday_date = ?', [date]);
      if (duplicate) throw fail('มีวันหยุดในวันที่นี้แล้ว', 409);

      let result;
      try {
        result = await query('INSERT INTO public_holidays (holiday_date, name) VALUES (?, ?)', [date, name]);
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') throw fail('มีวันหยุดในวันที่นี้แล้ว', 409);
        throw err;
      }
      await writeLog(req, 'holiday.create', 'public_holidays', result.insertId, { holiday_date: date, name });
      return ok(res, { id: result.insertId, holiday_date: date, name }, 'เพิ่มวันหยุดแล้ว');
    }
    case 'delete': {
      await mustBe(req, ['owner']);
      requireFields(b, ['id']);
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) throw fail('รหัสวันหยุดไม่ถูกต้อง', 422);
      const row = await queryOne(
        "SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, name FROM public_holidays WHERE id = ?",
        [id]
      );
      if (!row) throw fail('ไม่พบวันหยุดที่ต้องการลบ', 404);
      await query('DELETE FROM public_holidays WHERE id = ?', [id]);
      await writeLog(req, 'holiday.delete', 'public_holidays', id, row);
      return ok(res, { id }, 'ลบวันหยุดแล้ว');
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
