/**
 * /api/roles — รายชื่อบทบาท (ใส่ dropdown หน้าพนักงาน)
 * GET → [{id, role_code, role_name}]   (owner)
 */
const router = require('express').Router();
const { query } = require('../lib/db');
const { ok, handle } = require('../lib/response');
const { requireRole } = require('../lib/auth');

router.get('/', requireRole(['owner']), handle(async (req, res) => {
  return ok(res, await query('SELECT id, role_code, role_name FROM roles ORDER BY id'));
}));

module.exports = router;
