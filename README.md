# ระบบร้านติ่มซำ "นึ่งสุข" (CSI400) — Node.js

## ตั้งเครื่องครั้งแรก
1. ติดตั้ง Node.js (เวอร์ชัน LTS) จาก nodejs.org
2. เปิด XAMPP → Start เฉพาะ **MySQL** (ไม่ต้องเปิด Apache)
3. phpMyAdmin → Import → `database/dimsum_schema.sql`
   (ถ้าเคย import ฉบับเก่าไว้ ให้ลบฐานข้อมูล `dimsum` ก่อนแล้ว import ใหม่)
   **import ไปแล้วก่อน 27 ต.ค.** ไม่ต้องลบ ให้ Import `database/add_banners.sql` เพิ่ม 1 ครั้ง (ตารางแบนเนอร์)
4. (เมื่อคนที่ 1 ส่งแล้ว) Import `scripts/seed.sql` แล้วรัน `node scripts/seed-users.js` = ข้อมูลตัวอย่าง + พนักงานตัวอย่าง
5. เปิด Terminal ในโฟลเดอร์นี้ แล้วรัน
   ```
   npm install
   npm run setup-owner -- owner secret123 "สมชาย"
   npm run dev
   ```
6. เปิด http://localhost:3000/admin/login.html → ล็อกอิน owner / secret123

`npm run dev` จะรีสตาร์ต server เองทุกครั้งที่แก้ไฟล์

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
  customer/      หน้าลูกค้า (QR = /customer/order.html?token=...)
  index.html     หน้า Home (แม่แบบ: _template_customer.html)
database/        dimsum_schema.sql (v5, 32 ตาราง) — ห้ามแก้เอง
docs/            เอกสาร API v5 + prompt เขียนโค้ดของแต่ละคน
scripts/         สคริปต์ตั้งค่า + ข้อมูลตัวอย่าง
dev-mocks/       ไฟล์จำลองงานเพื่อน (ไม่ขึ้น Git) ดู dev-mocks/README.md
```

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
