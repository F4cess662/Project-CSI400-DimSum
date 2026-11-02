# ระบบร้านติ่มซำ "นึ่งสุข" (CSI400) — Node.js

## ตั้งเครื่องครั้งแรก (และทุกครั้งที่อยากรีเซ็ตฐานข้อมูล)
1. ติดตั้ง Node.js (เวอร์ชัน LTS) จาก nodejs.org
2. เปิด XAMPP → Start เฉพาะ **MySQL** (ไม่ต้องเปิด Apache)
3. phpMyAdmin → แท็บ **Import** → เลือก **`database/dimsum_full.sql`** → Go (ไฟล์เดียวจบ ไม่ต้องเลือกฐานข้อมูลก่อน)
   - มีฐานข้อมูล `dimsum` อยู่แล้ว → ลบทิ้งแล้วสร้างใหม่ให้เอง (**ข้อมูลทดสอบเดิมหายหมด**)
   - ยังไม่มี → สร้างใหม่
   - ได้ครบ: ตารางทั้งหมด + เมนู 33 รายการ + แบนเนอร์ + พนักงาน 5 คน + วันหยุดราชการ
4. เปิด Terminal ในโฟลเดอร์นี้ แล้วรัน (XAMPP ที่ใช้ port 3307 ให้ตั้ง DB_PORT ตามตัวอย่าง)
   ```
   npm install
   set "DB_PORT=3307" && npm run dev:all
   ```
5. เปิด http://localhost:3000/admin/login.html → ล็อกอิน **owner / secret123** (หรือ wipa, ahmei, ton, fon รหัส 1234)

`npm run dev:all` เปิดระบบหลัก + ทุก service และรีสตาร์ตเองทุกครั้งที่แก้ไฟล์

**แก้ฐานข้อมูล** (`database/dimsum_full.sql` ไฟล์เดียว): แก้ได้**ทีละคน** แจ้งในกลุ่มก่อน · ทดสอบ import ทั้งไฟล์ให้ผ่าน → commit → PR ให้ PM merge ทันที
ส่วนที่ 1 โครงตาราง (ขอ PM) · ส่วนที่ 2 เมนู (คนที่ 3) · ส่วนที่ 3 พนักงาน + วันหยุด · ส่วนที่ 4 ข้อมูลตัวอย่างอื่น (คนที่ 1)

## โครงโฟลเดอร์
```
config.js        ค่าที่แต่ละเครื่องแก้เอง (ฐานข้อมูล, BASE_URL)
server.js        ตัวเปิด server (ห้ามแก้)
lib/             ฟังก์ชันกลางฝั่ง server (ห้ามแก้)
routes/          API หนึ่งไฟล์ต่อหนึ่ง API: routes/menus.js → /api/menus
public/          หน้าเว็บทั้งหมด
  assets/css/style.css   CSS กลางตาม CI ร้าน (เจ้าของ: คนที่ 1)
  assets/js/api.js       ฟังก์ชันเรียก API, toast, modal, fmt (เจ้าของ: คนที่ 1)
  assets/js/layout.js    sidebar/topbar พนักงาน + navbar ลูกค้า + STAFF_MENU (เจ้าของ: คนที่ 2)
  admin/         หน้าพนักงาน (แม่แบบ: admin/_template.html)
  customer/      หน้าลูกค้า (QR = /customer/menu.html?token=...)
  index.html     หน้า Home (แม่แบบ: _template_customer.html)
database/        dimsum_full.sql ไฟล์เดียว (โครงตาราง + ข้อมูลตัวอย่าง) — แก้ทีละคน ตกลงกันก่อน
services/        Microservices: kitchen (4001), inventory (4002), notify (4003) · API อยู่ใน services/<ชื่อ>/routes/
docs/            เอกสาร API v5 + prompt เขียนโค้ดของแต่ละคน
scripts/         สคริปต์ตั้งค่า + ข้อมูลตัวอย่าง
dev-mocks/       ไฟล์จำลองงานเพื่อน (ไม่ขึ้น Git) ดู dev-mocks/README.md
```

## Microservices (เฟส 2 เป็นต้นไป)
- เปิดทั้งระบบคำสั่งเดียว: `npm run dev:all` (ตั้ง DB_PORT ก่อน เช่น cmd: `set "DB_PORT=3307" && npm run dev:all`)
- วัน demo: `npm run start:all` — service ที่ดับจะเปิดกลับเองใน 3 วินาที
- เข้าเว็บที่ `http://localhost:3000` เหมือนเดิม ระบบหลักเป็น API Gateway ส่งต่อให้แต่ละ service
- ดูสถานะทุก service + คิวงาน: `/admin/system.html` · ตาราง sessions, event_queue, notifications สร้างให้เองตอนเปิด
- รายละเอียด: `docs/prompt_เขียนโค้ด/00_อ่านก่อน.md`

## กติกาทำงานร่วมกัน
1. ก่อนเริ่มงานทุกครั้ง: `git checkout main` → `git pull` → `git checkout -b pX-phaseY` (เช่น p3-phase1)
2. แก้/สร้างเฉพาะไฟล์ที่อยู่ใน "งานของฉัน" ของ prompt ตัวเอง (`docs/prompt_เขียนโค้ด/`)
3. ต้องใช้งานของเพื่อนที่ยังไม่เสร็จ → ทำไฟล์จำลองใน `dev-mocks/` (ไม่ขึ้น Git) อย่าสร้างไฟล์ชื่อเดียวกับของเพื่อนใน `routes/` หรือ `public/`
4. ต้องการ class CSS / ฟังก์ชันใน api.js / เมนูใน sidebar / คอลัมน์ฐานข้อมูลเพิ่ม → แจ้งในกลุ่ม ให้เจ้าของไฟล์แก้
5. commit เฉพาะไฟล์ตัวเอง (`git add path/ของฉัน`) อย่าใช้ `git add .` → push → เปิด Pull Request เข้า main

## เพิ่ม API ใหม่
คัดลอก `routes/_template.js` เป็น `routes/ชื่อapi.js` แล้วแก้ตามเอกสาร API
server โหลดให้อัตโนมัติ ไม่ต้องแก้ server.js

## เรียก API จากหน้าเว็บ
ใช้ฟังก์ชันใน `public/assets/js/api.js` เท่านั้น (ห้ามเขียน fetch เอง)
```js
const menus = await api.get('menus', { q: 'ฮะ' });                 // ได้ data เลย
await run(() => api.post('menus', { action: 'create', category_id: 1, name: 'ฮะเก๋า', price: 69 }), 'เพิ่มแล้ว');
```
