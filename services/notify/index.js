// ระบบแจ้งเตือน (notify-service) · port 4003 · เจ้าของ: คนที่ 2 (เฟส 3)
// worker.js หยิบงานจากคิว topic "notify" ไปส่ง (SMS/LINE จำลอง) · routes/notifications.js ให้ผู้จัดการดูประวัติ
// รันเดี่ยว: npm run dev:notify · รันทั้งระบบ: npm run dev:all
require('../../lib/service').startService({ name: 'notify', dir: __dirname });
