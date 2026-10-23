const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { errorHandler } = require('./lib/response');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'dimsum.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

// หน้าเว็บทั้งหมด (HTML, CSS, JS, รูป) อยู่ใน public/
app.use(express.static(path.join(__dirname, 'public')));

// โหลด API อัตโนมัติ: routes/menus.js → /api/menus (ไฟล์ที่ขึ้นต้นด้วย _ จะข้าม)
// เพิ่มไฟล์ใหม่ใน routes/ ได้เลย ไม่ต้องแก้ไฟล์นี้ ทีมจะได้ไม่ชนกัน
for (const file of fs.readdirSync(path.join(__dirname, 'routes'))) {
  if (!file.endsWith('.js') || file.startsWith('_')) continue;
  const name = file.replace(/\.js$/, '');
  app.use('/api/' + name, require('./routes/' + file));
}

// API ที่ไม่มีอยู่จริง
app.use('/api', (req, res) => res.status(404).json({ success: false, data: null, message: 'ไม่พบ API นี้' }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`ระบบร้านติ่มซำ เปิดที่ http://localhost:${config.port}`);
});
