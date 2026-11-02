// ระบบครัว (kitchen-service) · port 4001 · เจ้าของ: คนที่ 7
// API ของครัวเขียนใน services/kitchen/routes/kitchen.js (แบบเดียวกับ routes/_template.js แต่ require lib ด้วย '../../../lib/...')
// รันเดี่ยว: npm run dev:kitchen · รันทั้งระบบ: npm run dev:all
require('../../lib/service').startService({ name: 'kitchen', dir: __dirname });
