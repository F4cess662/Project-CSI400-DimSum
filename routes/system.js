/**
 * /api/system — สถานะ Microservices + คิวงาน (ไฟล์ส่วนกลาง คนที่ 1 ดูแล)
 * GET                                       → { services: [...], queue: [...] }            (manager+)
 * POST {"action":"retry_failed","topic":"notify"}  → ส่งงานที่ล้มเหลวกลับเข้าคิว (owner)
 * POST {"action":"crash","service":"kitchen"}      → ปิด service เพื่อสาธิต Fault Isolation (owner)
 */
const http = require('http');
const router = require('express').Router();
const config = require('../config');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');
const { checkServices, serviceUrl } = require('../lib/gateway');
const { queueStats, retryFailed } = require('../lib/queue');

router.get('/', handle(async (req, res) => {
  await mustBe(req, ['manager', 'owner']);
  const [services, queue] = await Promise.all([checkServices(), queueStats()]);
  return ok(res, {
    main: { name: 'main', label: 'ระบบหลัก (Gateway)', port: config.port, up: true, uptime: Math.round(process.uptime()) },
    services,
    queue,
  });
}));

router.post('/', handle(async (req, res) => {
  const b = req.body;
  switch (b.action) {
    case 'retry_failed': {
      await mustBe(req, ['owner']);
      const n = await retryFailed(b.topic || null);
      await writeLog(req, 'system.retry_failed', 'event_queue', null, { topic: b.topic || 'all', count: n }, 'system');
      return ok(res, { count: n }, `ส่งงาน ${n} รายการกลับเข้าคิวแล้ว`);
    }
    case 'crash': {
      await mustBe(req, ['owner']);
      requireFields(b, ['service']);
      if (!config.services[b.service]) throw fail('ไม่พบ service นี้', 404);
      await writeLog(req, 'system.crash_demo', 'service', null, { service: b.service }, 'system');
      await new Promise((resolve, reject) => {
        const target = new URL(serviceUrl(b.service));
        const r = http.request({ hostname: target.hostname, port: target.port, method: 'POST', path: '/health/crash',
          headers: { cookie: req.headers.cookie || '', 'content-length': 0 } }, (resp) => { resp.resume(); resp.on('end', resolve); });
        r.setTimeout(2000, () => r.destroy(new Error('timeout')));
        r.on('error', () => reject(fail(`ระบบ${config.services[b.service].label}ดับอยู่แล้ว`, 409)));
        r.end();
      });
      return ok(res, null, `ปิดระบบ${config.services[b.service].label}แล้ว รอเปิดกลับอัตโนมัติ`);
    }
    default:
      throw fail('ไม่รู้จัก action นี้', 400);
  }
}));

module.exports = router;
