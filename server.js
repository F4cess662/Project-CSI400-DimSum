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
app.use(express.static(path.join(__dirname, 'public'), { index: false }));


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'web_homePage.html'));
});
app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'menu.html'));
});

app.get('/owner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

// ไฟล์จำลองของงานเพื่อนที่ยังไม่เสร็จ (dev-mocks/ ไม่ขึ้น Git) — ใช้ก็ต่อเมื่อยังไม่มีไฟล์จริง
// ถ้าไฟล์จริงของเพื่อนเข้ามาแล้ว ไฟล์จริงชนะเสมอ ไม่ต้องลบไฟล์จำลองก็ได้
const MOCK_DIR = path.join(__dirname, 'dev-mocks');
if (fs.existsSync(path.join(MOCK_DIR, 'public'))) app.use(express.static(path.join(MOCK_DIR, 'public')));

// โหลด API อัตโนมัติ: routes/menus.js → /api/menus (ไฟล์ที่ขึ้นต้นด้วย _ จะข้าม)
// เพิ่มไฟล์ใหม่ใน routes/ ได้เลย ไม่ต้องแก้ไฟล์นี้ ทีมจะได้ไม่ชนกัน
const loaded = new Set();
for (const file of fs.readdirSync(path.join(__dirname, 'routes'))) {
  if (!file.endsWith('.js') || file.startsWith('_')) continue;
  const name = file.replace(/\.js$/, '');
  app.use('/api/' + name, require('./routes/' + file));
  loaded.add(name);
}
// API จำลองใน dev-mocks/routes/ — โหลดเฉพาะชื่อที่ยังไม่มีไฟล์จริงใน routes/
const mockRoutes = path.join(MOCK_DIR, 'routes');
if (fs.existsSync(mockRoutes)) {
  for (const file of fs.readdirSync(mockRoutes)) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    const name = file.replace(/\.js$/, '');
    if (loaded.has(name)) continue;
    app.use('/api/' + name, require(path.join(mockRoutes, file)));
    console.log('ใช้ API จำลอง: /api/' + name + ' (dev-mocks)');
  }
}

// API 
app.use('/api', require('./routes/menu'));


app.use('/api', (req, res) => res.status(404).json({ success: false, data: null, message: 'ไม่พบ API นี้' }));
app.use(errorHandler);

// หน้าเว็บที่ไม่มีอยู่จริง → public/404.html (คนที่ 1 ทำ) ถ้ายังไม่มีไฟล์ก็ตอบข้อความธรรมดา
app.use((req, res) => {
  const page = path.join(__dirname, 'public', '404.html');
  if (fs.existsSync(page)) return res.status(404).sendFile(page);
  res.status(404).send('ไม่พบหน้านี้ (หน้านี้อาจยังไม่มีคนทำ)');
});

app.listen(config.port, () => {
  const baseWeb = `http://localhost:${config.port}`;
  console.log(`หน้าเว็บร้านติ่มซำ เปิดที่ ${baseWeb}/`);
  console.log(`หน้าเว็บสำหรับทางร้าน ${baseWeb}/owner`);
  console.log(`หน้าเว็บลูกค้าสั่งอาหารผ่าน qr ${baseWeb}/menu`);
});
