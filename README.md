# ระบบร้านติ่มซำ (CSI400) — Node.js

## ตั้งเครื่องครั้งแรก
1. ติดตั้ง Node.js (เวอร์ชัน LTS) จาก nodejs.org
2. เปิด XAMPP → Start เฉพาะ **MySQL** (ไม่ต้องเปิด Apache)
3. phpMyAdmin → Import → `dimsum_schema.sql`
4. เปิด Terminal ในโฟลเดอร์นี้ แล้วรัน
   ```
   npm install
   npm run setup-owner -- owner secret123 "เจ้าของร้าน"
   npm run dev
   ```
5. เปิด http://localhost:3000

`npm run dev` จะรีสตาร์ต server เองทุกครั้งที่แก้ไฟล์

## โครงโฟลเดอร์
```
config.js        ค่าที่แต่ละเครื่องแก้เอง (ฐานข้อมูล, BASE_URL)
server.js        ตัวเปิด server (ไม่ต้องแก้)
lib/             ฟังก์ชันกลาง ห้ามแก้เอง
routes/          API หนึ่งไฟล์ต่อหนึ่ง API: routes/menus.js → /api/menus
public/          หน้าเว็บทั้งหมด (HTML, CSS, JS ฝั่งเบราว์เซอร์)
  admin/         หน้าพนักงาน
  customer/      หน้าลูกค้า
scripts/         สคริปต์ตั้งค่า
```

## เพิ่ม API ใหม่
คัดลอก `routes/_template.js` เป็น `routes/ชื่อapi.js` แล้วแก้ตามเอกสาร API
server โหลดให้อัตโนมัติ ไม่ต้องแก้ server.js

## เรียก API จากหน้าเว็บ
```js
const res = await fetch('/api/menus?q=ฮะ');
const json = await res.json();          // { success, data, message }

await fetch('/api/menus', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'create', category_id: 1, name: 'ฮะเก๋า', price: 69 }),
});
```
