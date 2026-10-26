# dev-mocks — ไฟล์จำลองงานของเพื่อนที่ยังไม่เสร็จ

ใช้เมื่อหน้าของเราต้องเรียก API หรือหน้าเว็บของเพื่อนที่ยังไม่ merge เข้า main
ไฟล์ในโฟลเดอร์นี้ **ไม่ขึ้น Git** (อยู่ใน .gitignore) เลยไม่มีวันชนกับงานจริงของเพื่อน

```
dev-mocks/
  routes/tables.js          → ตอบที่ /api/tables (เฉพาะตอนที่ยังไม่มี routes/tables.js จริง)
  public/admin/tables.html  → เปิดที่ /admin/tables.html (เฉพาะตอนที่ยังไม่มี public/admin/tables.html จริง)
```

- **ไฟล์จริงชนะเสมอ** พอ pull งานเพื่อนมาแล้ว server จะใช้ของจริงเอง (ไฟล์จำลองจะถูกข้าม)
- ข้อมูลที่ส่งกลับต้องหน้าตาเหมือนในเอกสาร `docs/API_ร้านติ่มซำ_v5.md` (ชื่อฟิลด์ตรงฐานข้อมูล)
- ถ้าแค่อยากได้ "ข้อมูล" (เช่น มีเมนู มีบิล) ไม่ต้องทำ API จำลอง ให้ INSERT ลงฐานข้อมูลตรงๆ หรือรอ `scripts/seed.sql`
- รีสตาร์ต server หลังเพิ่มไฟล์จำลอง (`npm run dev` ไม่เห็นไฟล์ใหม่ในโฟลเดอร์นี้)

## ตัวอย่าง API จำลอง `dev-mocks/routes/tables.js`
```js
const router = require('express').Router();
const { ok, handle } = require('../../lib/response');   // ← สังเกต ../../
router.get('/', handle(async (req, res) => ok(res, [
  { id: 13, code: 'T05', table_type: 'small', seats: 4, status: 'occupied', is_vip: false,
    bill: { id: 1, bill_no: 'B20261026-001', qr_token: 'demo-token-t05', opened_at: '2026-10-26 11:20:00', guests: 3, total: 340 } },
  { id: 14, code: 'T06', table_type: 'small', seats: 4, status: 'available', is_vip: false, bill: null },
])));
module.exports = router;
```
