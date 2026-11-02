/**
 * ตัวช่วยสร้าง Microservice — service ทุกตัวหน้าตาเหมือนกัน เขียน route แบบเดียวกับ routes/ ของ server หลัก
 *
 *   // services/kitchen/index.js
 *   require('../../lib/service').startService({ name: 'kitchen', dir: __dirname });
 *
 * - โหลด route อัตโนมัติจาก services/<ชื่อ>/routes/*.js → /api/<ชื่อไฟล์> (ชื่อไฟล์ต้องอยู่ใน paths ของ config.services)
 * - ใช้ session ร่วมกับ server หลัก (ล็อกอินครั้งเดียว requireLogin / mustBe ใช้ได้เหมือนเดิม)
 * - มี GET /health ให้ Gateway เช็กว่ายังทำงานอยู่
 * - ถ้ามี services/<ชื่อ>/worker.js จะถูกเรียกตอนเริ่ม (ใช้ consume() รับงานจากคิว)
 * - service นี้ดับ → เฉพาะส่วนนี้ใช้ไม่ได้ server หลักและ service อื่นยังทำงานต่อ
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { sessionMiddleware } = require('./session');
const { errorHandler } = require('./response');
const { mustBe } = require('./auth');

function startService({ name, dir }) {
  const svc = config.services[name];
  if (!svc) throw new Error(`ไม่พบ service "${name}" ใน config.services`);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(sessionMiddleware());

  const startedAt = Date.now();
  app.get('/health', (req, res) => res.json({
    success: true,
    data: { service: name, uptime: Math.round((Date.now() - startedAt) / 1000), pid: process.pid },
    message: '',
  }));

  // ปุ่ม "ปิด service (สาธิต)" ในหน้าสถานะระบบ — เจ้าของร้านเท่านั้น
  // รันด้วย npm run start:all แล้ว service จะถูกเปิดกลับเองภายในไม่กี่วินาที
  app.post('/health/crash', async (req, res, next) => {
    try {
      await mustBe(req, ['owner']);
      res.json({ success: true, data: null, message: `ปิดระบบ${svc.label}แล้ว (สาธิต)` });
      console.log(`[${name}] ถูกสั่งปิดเพื่อสาธิต`);
      setTimeout(() => process.exit(1), 200);
    } catch (err) { next(err); }
  });

  const routesDir = path.join(dir, 'routes');
  const loaded = [];
  if (fs.existsSync(routesDir)) {
    for (const file of fs.readdirSync(routesDir)) {
      if (!file.endsWith('.js') || file.startsWith('_')) continue;
      const route = file.replace(/\.js$/, '');
      if (!svc.paths.includes(route)) {
        console.warn(`[${name}] ข้าม routes/${file}: "${route}" ไม่อยู่ใน config.services.${name}.paths (Gateway จะไม่ส่งมาที่นี่)`);
        continue;
      }
      app.use('/api/' + route, require(path.join(routesDir, file)));
      loaded.push(route);
    }
  }

  app.use('/api', (req, res) => res.status(404).json({ success: false, data: null, message: 'ไม่พบ API นี้' }));
  app.use(errorHandler);

  const worker = path.join(dir, 'worker.js');
  if (fs.existsSync(worker)) require(worker);

  app.listen(svc.port, () => {
    console.log(`[${name}] ระบบ${svc.label} ทำงานที่ port ${svc.port} · API: ${loaded.map((r) => '/api/' + r).join(', ') || '(ยังไม่มี route)'}`);
  });
  return app;
}

module.exports = { startService };
