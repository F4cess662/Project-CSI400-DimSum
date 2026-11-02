# Prompt เขียนโค้ดจริง — คนที่ 7 (Dashboard + ทดสอบ) · ร้านนึ่งสุข

## วิธีใช้
1. เปิดแชตใหม่กับ Claude หรือ ChatGPT (**1 เฟส = 1 แชต** จะได้ไม่เปลือง token)
2. แนบไฟล์จาก repo (git pull ก่อนทุกครั้ง): `database/dimsum_full.sql` · โฟลเดอร์ `lib/` · `routes/_template.js` · `routes/auth.js` · `public/assets/css/style.css` · `public/assets/js/api.js` · `public/assets/js/layout.js` · `public/admin/_template.html` · `public/_template_customer.html` · `docs/API_ร้านติ่มซำ_v5.md`
   + **ภาพหน้าจอตัวอย่าง (ถ้ามี)** จะเป็นภาพจาก Lovable 3–4 หน้า หรือภาพวาดมือก็ได้ ไม่มีภาพก็สั่งได้ (ไม่ต้องแนบโค้ด React จาก Lovable)
   + ถ้าเฟสนี้ต้องแก้ต่อจากไฟล์ของตัวเองเฟสก่อน ให้แนบไฟล์นั้นไปด้วย
3. copy ทั้งกล่องของเฟสนั้นไปวาง
4. แตก branch ใหม่จาก main → ได้โค้ดแล้ววางไฟล์ตาม path → `npm run dev:all` (เปิดระบบหลัก + ทุก service) → ทดสอบตามที่ AI บอก → commit เฉพาะไฟล์ของตัวเอง → ส่ง Pull Request
5. ถ้า AI ขอ class CSS / คอลัมน์ DB / API ของคนอื่น → แจ้งในกลุ่ม ห้ามแก้เอง

---

## เฟส 1 — Dashboard

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_full.sql → โครงฐานข้อมูล MySQL v5 + ข้อมูลตัวอย่าง (ส่วนที่ 1 = โครงตาราง) (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js, queue.js, gateway.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ระบบเป็น Microservices: server หลัก (port 3000) เป็น API Gateway ส่งต่อ /api/kitchen → kitchen-service (4001) ·
  /api/ingredients, suppliers, purchase_orders, goods_receipts, stock → inventory-service (4002) · /api/notifications → notify-service (4003)
  API ของ 3 service นี้เขียนที่ services/<service>/routes/<api>.js (เหมือน routes/_template.js แต่ require lib ด้วย '../../../lib/...')
  ไม่ต้องแก้ server.js, config.js หรือ services/*/index.js · หน้าเว็บเรียก api.get('kitchen') ตามปกติ ไม่ต้องรู้ port
- service คุยกันผ่าน API หรือคิวเท่านั้น ห้ามอ่านตารางของ service อื่นตรง:
  callService(req, 'inventory', '/api/ingredients?low_stock=1') (lib/gateway.js · service ดับ = throw 503 ให้ catch แล้วแสดง "ไม่พร้อมใช้")
  publish('notify', { channel: 'sms'|'line'|'system', to, title, message }, conn) (lib/queue.js · ไม่ต้องรอ notify-service ส่ง)
  ตารางคลัง (ingredients, suppliers, supplier_prices, purchase_orders, purchase_order_items, goods_receipts, stock_movements) ใช้ได้เฉพาะใน inventory-service
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage /
  publish (ส่งงานเข้าคิว) / callService (เรียก API ของ service อื่น)
  ห้ามแก้หรือเขียน lib ใหม่ ถ้าขาดอะไรให้เขียนเป็นฟังก์ชันภายในไฟล์ route ของฉันเอง
- GET = อ่าน (ค่าทาง query) / POST = เปลี่ยนข้อมูล ส่ง JSON ที่มี action แยกด้วย switch
- ตอบผ่าน ok(res, data, 'ข้อความไทย') หรือ throw fail('ข้อความไทย', status) เท่านั้น
- เช็กสิทธิ์ตามคอลัมน์ "ใครเรียกได้" ในตาราง API · เปลี่ยนข้อมูลสำคัญต้อง writeLog()
- ค่าที่อยู่ใน shop_settings (เวลา, max_qty_per_item, vip_*) ห้ามเขียนตัวเลขตายตัว อ่านจาก shopSettings()
- งานที่แก้หลายตารางพร้อมกันใช้ transaction()
- ห้ามแก้โครงฐานข้อมูล (ALTER/CREATE TABLE) ถ้าต้องการคอลัมน์เพิ่มให้บอกท้ายคำตอบ

## กติกาฝั่งหน้าเว็บ (HTML + CSS + JS ล้วน)
- ห้าม React/Vue/Tailwind/Bootstrap/jQuery ไม่ต้อง build
- หน้าพนักงาน: copy โครงจาก public/admin/_template.html → public/admin/<ไฟล์>.html
  เรียก initStaffPage({ title, roles, perm }) บนสุด (สร้าง sidebar + topbar ให้เอง ห้ามทำ sidebar เอง)
- หน้าลูกค้าที่มี navbar: copy จาก public/_template_customer.html แล้วเรียก initPublicPage()
- ใช้ class จาก style.css เท่านั้น: btn btn-secondary btn-danger btn-ghost btn-sm btn-lg / card / table-wrap table /
  badge-* / tabs tab / input select textarea field / modal / menu-card menu-row / tile / ticket / empty / alert-* / grid-* / split
  ห้ามเขียน <style> หรือไฟล์ CSS ใหม่ ใช้ style="" ได้เฉพาะ width/max-width/margin เล็กน้อย
  ถ้าต้องการ class ที่ไม่มี ให้ใช้ของที่ใกล้ที่สุด แล้วบอกท้ายคำตอบว่าอยากขอเพิ่ม class อะไร
- เรียก API ผ่าน api.js เท่านั้น: api.get / api.post / api.upload / run() / toast() / openModal() / confirmModal() /
  fmt.baht fmt.time fmt.date fmt.esc / badge(status) / zoneChip / menuImage / poll() / qs()
  ห้ามเขียน fetch เอง · ข้อความจากผู้ใช้ต้องผ่าน fmt.esc ก่อนใส่ innerHTML
- JS ของหน้ายาวเกิน ~150 บรรทัดให้แยกเป็น public/assets/js/<ชื่อหน้า>.js
- หน้าที่ต้องอัปเดตเองใช้ poll(fn, 5–10) ไม่ทำ real-time
- ชื่อไฟล์หน้าต้องตรงกับ STAFF_MENU ใน layout.js (sidebar ลิงก์ไปตามชื่อนี้)
- ข้อความบนจอภาษาไทยทั้งหมด

## ถ้าต้องใช้งานของเพื่อนที่ยังไม่มีใน repo
- ห้ามสร้างไฟล์ชื่อเดียวกับของเพื่อนใน routes/ หรือ public/ (จะชนตอนรวม)
- ถ้าต้องเรียก API ของเพื่อนที่ยังไม่มี → เขียน API จำลองที่ dev-mocks/routes/<ชื่อapi>.js
  (require lib ด้วย '../../lib/...' ตอบข้อมูลตายตัวตามรูปแบบใน API_v5 ชื่อฟิลด์ตรงฐานข้อมูล)
- ถ้าต้องเปิดหน้าของเพื่อนที่ยังไม่มี → ทำหน้าจำลองง่ายๆ ที่ dev-mocks/public/<path เดียวกับของจริง>
- server ใช้ไฟล์จำลองเฉพาะตอนที่ยังไม่มีไฟล์จริง และ dev-mocks/ ไม่ขึ้น Git
- ถ้าแค่ต้องการข้อมูลในตาราง (เมนู โต๊ะ บิล) ไม่ต้องทำ API จำลอง ให้ SQL INSERT สำหรับทดสอบแทน
- โค้ดจริงของฉันต้องเรียก API ด้วยชื่อและรูปแบบตาม API_v5 เป๊ะ จะได้สลับไปใช้ของจริงได้โดยไม่ต้องแก้

## ห้ามแตะไฟล์ของคนอื่น
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, config.js, services/*/index.js, style.css, api.js, layout.js, schema

## ส่งมอบ
1. ทุกไฟล์แบบเต็มไฟล์ (ไม่ตัดทอน) พร้อม path
2. วิธีทดสอบ API แต่ละ action (ตัวอย่าง JSON ที่ส่ง + ผลที่ควรได้) สำหรับ Thunder Client/Postman
3. ข้อมูลตัวอย่างที่ต้อง insert เพื่อทดสอบ (SQL INSERT) ถ้ามี
4. รายการที่ต้องขอคนอื่น (class CSS, คอลัมน์ DB, API ของคนอื่นที่ใช้)
5. ไฟล์จำลองใน dev-mocks/ (ถ้ามี) แยกหัวข้อไว้ท้ายสุด บอกชัดว่าเป็นไฟล์จำลอง ไม่ต้อง commit

---
# งานของฉัน — คนที่ 7 · เฟส 1: Dashboard

## ไฟล์ที่ฉันสร้าง/แก้ได้
- routes/dashboard.js
- public/admin/dashboard.html + public/assets/js/dashboard.js

## API ที่ต้องทำ (ดูรายละเอียดในแถวของ API_v5.md ที่แนบ)
- /api/dashboard GET (manager+) ส่วน P1 — FR-47

## หน้าเว็บ (ถ้ามีภาพแนบ ให้จัดวางตามภาพ)
dashboard.html: grid-4 card stat (โต๊ะมีลูกค้า x/y, บิลเปิด, เมนูปิดขาย, พนักงานใช้งาน) · ผังโต๊ะย่อ (tile เล็ก ใช้ style width/height 48px) · card เมนูปิดขาย · card พนักงาน · card "เร็วๆ นี้" (empty) เผื่อเฟสหน้า

## กฎธุรกิจที่ต้องเช็ก
- ออกแบบ JSON ของ API ให้ขยายได้: { tables, open_bills, unavailable_menus, active_staff, sales_today?, low_menus?, vip_today?, low_ingredients? }
```

---

## 🔧 แก้ตาม Feedback เฟส 1 (ทำก่อนหรือพร้อมเฟส 2)

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_full.sql → โครงฐานข้อมูล MySQL v5 + ข้อมูลตัวอย่าง (ส่วนที่ 1 = โครงตาราง) (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js, queue.js, gateway.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ระบบเป็น Microservices: server หลัก (port 3000) เป็น API Gateway ส่งต่อ /api/kitchen → kitchen-service (4001) ·
  /api/ingredients, suppliers, purchase_orders, goods_receipts, stock → inventory-service (4002) · /api/notifications → notify-service (4003)
  API ของ 3 service นี้เขียนที่ services/<service>/routes/<api>.js (เหมือน routes/_template.js แต่ require lib ด้วย '../../../lib/...')
  ไม่ต้องแก้ server.js, config.js หรือ services/*/index.js · หน้าเว็บเรียก api.get('kitchen') ตามปกติ ไม่ต้องรู้ port
- service คุยกันผ่าน API หรือคิวเท่านั้น ห้ามอ่านตารางของ service อื่นตรง:
  callService(req, 'inventory', '/api/ingredients?low_stock=1') (lib/gateway.js · service ดับ = throw 503 ให้ catch แล้วแสดง "ไม่พร้อมใช้")
  publish('notify', { channel: 'sms'|'line'|'system', to, title, message }, conn) (lib/queue.js · ไม่ต้องรอ notify-service ส่ง)
  ตารางคลัง (ingredients, suppliers, supplier_prices, purchase_orders, purchase_order_items, goods_receipts, stock_movements) ใช้ได้เฉพาะใน inventory-service
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage /
  publish (ส่งงานเข้าคิว) / callService (เรียก API ของ service อื่น)
  ห้ามแก้หรือเขียน lib ใหม่ ถ้าขาดอะไรให้เขียนเป็นฟังก์ชันภายในไฟล์ route ของฉันเอง
- GET = อ่าน (ค่าทาง query) / POST = เปลี่ยนข้อมูล ส่ง JSON ที่มี action แยกด้วย switch
- ตอบผ่าน ok(res, data, 'ข้อความไทย') หรือ throw fail('ข้อความไทย', status) เท่านั้น
- เช็กสิทธิ์ตามคอลัมน์ "ใครเรียกได้" ในตาราง API · เปลี่ยนข้อมูลสำคัญต้อง writeLog()
- ค่าที่อยู่ใน shop_settings (เวลา, max_qty_per_item, vip_*) ห้ามเขียนตัวเลขตายตัว อ่านจาก shopSettings()
- งานที่แก้หลายตารางพร้อมกันใช้ transaction()
- ห้ามแก้โครงฐานข้อมูล (ALTER/CREATE TABLE) ถ้าต้องการคอลัมน์เพิ่มให้บอกท้ายคำตอบ

## กติกาฝั่งหน้าเว็บ (HTML + CSS + JS ล้วน)
- ห้าม React/Vue/Tailwind/Bootstrap/jQuery ไม่ต้อง build
- หน้าพนักงาน: copy โครงจาก public/admin/_template.html → public/admin/<ไฟล์>.html
  เรียก initStaffPage({ title, roles, perm }) บนสุด (สร้าง sidebar + topbar ให้เอง ห้ามทำ sidebar เอง)
- หน้าลูกค้าที่มี navbar: copy จาก public/_template_customer.html แล้วเรียก initPublicPage()
- ใช้ class จาก style.css เท่านั้น: btn btn-secondary btn-danger btn-ghost btn-sm btn-lg / card / table-wrap table /
  badge-* / tabs tab / input select textarea field / modal / menu-card menu-row / tile / ticket / empty / alert-* / grid-* / split
  ห้ามเขียน <style> หรือไฟล์ CSS ใหม่ ใช้ style="" ได้เฉพาะ width/max-width/margin เล็กน้อย
  ถ้าต้องการ class ที่ไม่มี ให้ใช้ของที่ใกล้ที่สุด แล้วบอกท้ายคำตอบว่าอยากขอเพิ่ม class อะไร
- เรียก API ผ่าน api.js เท่านั้น: api.get / api.post / api.upload / run() / toast() / openModal() / confirmModal() /
  fmt.baht fmt.time fmt.date fmt.esc / badge(status) / zoneChip / menuImage / poll() / qs()
  ห้ามเขียน fetch เอง · ข้อความจากผู้ใช้ต้องผ่าน fmt.esc ก่อนใส่ innerHTML
- JS ของหน้ายาวเกิน ~150 บรรทัดให้แยกเป็น public/assets/js/<ชื่อหน้า>.js
- หน้าที่ต้องอัปเดตเองใช้ poll(fn, 5–10) ไม่ทำ real-time
- ชื่อไฟล์หน้าต้องตรงกับ STAFF_MENU ใน layout.js (sidebar ลิงก์ไปตามชื่อนี้)
- ข้อความบนจอภาษาไทยทั้งหมด

## ถ้าต้องใช้งานของเพื่อนที่ยังไม่มีใน repo
- ห้ามสร้างไฟล์ชื่อเดียวกับของเพื่อนใน routes/ หรือ public/ (จะชนตอนรวม)
- ถ้าต้องเรียก API ของเพื่อนที่ยังไม่มี → เขียน API จำลองที่ dev-mocks/routes/<ชื่อapi>.js
  (require lib ด้วย '../../lib/...' ตอบข้อมูลตายตัวตามรูปแบบใน API_v5 ชื่อฟิลด์ตรงฐานข้อมูล)
- ถ้าต้องเปิดหน้าของเพื่อนที่ยังไม่มี → ทำหน้าจำลองง่ายๆ ที่ dev-mocks/public/<path เดียวกับของจริง>
- server ใช้ไฟล์จำลองเฉพาะตอนที่ยังไม่มีไฟล์จริง และ dev-mocks/ ไม่ขึ้น Git
- ถ้าแค่ต้องการข้อมูลในตาราง (เมนู โต๊ะ บิล) ไม่ต้องทำ API จำลอง ให้ SQL INSERT สำหรับทดสอบแทน
- โค้ดจริงของฉันต้องเรียก API ด้วยชื่อและรูปแบบตาม API_v5 เป๊ะ จะได้สลับไปใช้ของจริงได้โดยไม่ต้องแก้

## ห้ามแตะไฟล์ของคนอื่น
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, config.js, services/*/index.js, style.css, api.js, layout.js, schema

## ส่งมอบ
1. ทุกไฟล์แบบเต็มไฟล์ (ไม่ตัดทอน) พร้อม path
2. วิธีทดสอบ API แต่ละ action (ตัวอย่าง JSON ที่ส่ง + ผลที่ควรได้) สำหรับ Thunder Client/Postman
3. ข้อมูลตัวอย่างที่ต้อง insert เพื่อทดสอบ (SQL INSERT) ถ้ามี
4. รายการที่ต้องขอคนอื่น (class CSS, คอลัมน์ DB, API ของคนอื่นที่ใช้)
5. ไฟล์จำลองใน dev-mocks/ (ถ้ามี) แยกหัวข้อไว้ท้ายสุด บอกชัดว่าเป็นไฟล์จำลอง ไม่ต้อง commit

---
# งานของฉัน — คนที่ 7 · แก้ตาม Feedback เฟส 1: Dashboard เน้นกราฟ
## ไฟล์ที่ฉันสร้าง/แก้ได้
- routes/dashboard.js · public/admin/dashboard.html + public/assets/js/dashboard.js (แนบไฟล์เดิมของฉันไปด้วย)
## API ที่ต้องทำ
- /api/dashboard เพิ่มข้อมูลสำหรับกราฟ: tables_by_zone [{zone, busy, free}], menus_by_category [{category, available, soldout}], bills_by_hour [{hour, count}] (วันนี้)
## หน้าเว็บ
- ลดตัวหนังสือ เน้นกราฟ (วาด SVG เอง ไม่ใช้ไลบรารี): โดนัทโต๊ะว่าง/มีลูกค้า (ตัวเลขใหญ่ตรงกลาง) · แท่งซ้อนโต๊ะตามโซน · แท่งเมนูพร้อมขาย/หมดตามหมวด · เส้นหรือแท่งบิลเปิดรายชั่วโมง
- การ์ดตัวเลขเหลือแถวเดียว 4 ใบ · รายการข้อความ (เมนูปิดขาย พนักงาน) ย่อเป็นการ์ดเล็กด้านล่าง
- สีจาก CSS variable ใน style.css (ok / bad / wait / ซาลาเปา) · hover แท่งแล้วเห็นตัวเลข (title ใน SVG) · poll 10 วินาที
```

---

## เฟส 2 — จอครัวแยกโซน

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_full.sql → โครงฐานข้อมูล MySQL v5 + ข้อมูลตัวอย่าง (ส่วนที่ 1 = โครงตาราง) (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js, queue.js, gateway.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ระบบเป็น Microservices: server หลัก (port 3000) เป็น API Gateway ส่งต่อ /api/kitchen → kitchen-service (4001) ·
  /api/ingredients, suppliers, purchase_orders, goods_receipts, stock → inventory-service (4002) · /api/notifications → notify-service (4003)
  API ของ 3 service นี้เขียนที่ services/<service>/routes/<api>.js (เหมือน routes/_template.js แต่ require lib ด้วย '../../../lib/...')
  ไม่ต้องแก้ server.js, config.js หรือ services/*/index.js · หน้าเว็บเรียก api.get('kitchen') ตามปกติ ไม่ต้องรู้ port
- service คุยกันผ่าน API หรือคิวเท่านั้น ห้ามอ่านตารางของ service อื่นตรง:
  callService(req, 'inventory', '/api/ingredients?low_stock=1') (lib/gateway.js · service ดับ = throw 503 ให้ catch แล้วแสดง "ไม่พร้อมใช้")
  publish('notify', { channel: 'sms'|'line'|'system', to, title, message }, conn) (lib/queue.js · ไม่ต้องรอ notify-service ส่ง)
  ตารางคลัง (ingredients, suppliers, supplier_prices, purchase_orders, purchase_order_items, goods_receipts, stock_movements) ใช้ได้เฉพาะใน inventory-service
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage /
  publish (ส่งงานเข้าคิว) / callService (เรียก API ของ service อื่น)
  ห้ามแก้หรือเขียน lib ใหม่ ถ้าขาดอะไรให้เขียนเป็นฟังก์ชันภายในไฟล์ route ของฉันเอง
- GET = อ่าน (ค่าทาง query) / POST = เปลี่ยนข้อมูล ส่ง JSON ที่มี action แยกด้วย switch
- ตอบผ่าน ok(res, data, 'ข้อความไทย') หรือ throw fail('ข้อความไทย', status) เท่านั้น
- เช็กสิทธิ์ตามคอลัมน์ "ใครเรียกได้" ในตาราง API · เปลี่ยนข้อมูลสำคัญต้อง writeLog()
- ค่าที่อยู่ใน shop_settings (เวลา, max_qty_per_item, vip_*) ห้ามเขียนตัวเลขตายตัว อ่านจาก shopSettings()
- งานที่แก้หลายตารางพร้อมกันใช้ transaction()
- ห้ามแก้โครงฐานข้อมูล (ALTER/CREATE TABLE) ถ้าต้องการคอลัมน์เพิ่มให้บอกท้ายคำตอบ

## กติกาฝั่งหน้าเว็บ (HTML + CSS + JS ล้วน)
- ห้าม React/Vue/Tailwind/Bootstrap/jQuery ไม่ต้อง build
- หน้าพนักงาน: copy โครงจาก public/admin/_template.html → public/admin/<ไฟล์>.html
  เรียก initStaffPage({ title, roles, perm }) บนสุด (สร้าง sidebar + topbar ให้เอง ห้ามทำ sidebar เอง)
- หน้าลูกค้าที่มี navbar: copy จาก public/_template_customer.html แล้วเรียก initPublicPage()
- ใช้ class จาก style.css เท่านั้น: btn btn-secondary btn-danger btn-ghost btn-sm btn-lg / card / table-wrap table /
  badge-* / tabs tab / input select textarea field / modal / menu-card menu-row / tile / ticket / empty / alert-* / grid-* / split
  ห้ามเขียน <style> หรือไฟล์ CSS ใหม่ ใช้ style="" ได้เฉพาะ width/max-width/margin เล็กน้อย
  ถ้าต้องการ class ที่ไม่มี ให้ใช้ของที่ใกล้ที่สุด แล้วบอกท้ายคำตอบว่าอยากขอเพิ่ม class อะไร
- เรียก API ผ่าน api.js เท่านั้น: api.get / api.post / api.upload / run() / toast() / openModal() / confirmModal() /
  fmt.baht fmt.time fmt.date fmt.esc / badge(status) / zoneChip / menuImage / poll() / qs()
  ห้ามเขียน fetch เอง · ข้อความจากผู้ใช้ต้องผ่าน fmt.esc ก่อนใส่ innerHTML
- JS ของหน้ายาวเกิน ~150 บรรทัดให้แยกเป็น public/assets/js/<ชื่อหน้า>.js
- หน้าที่ต้องอัปเดตเองใช้ poll(fn, 5–10) ไม่ทำ real-time
- ชื่อไฟล์หน้าต้องตรงกับ STAFF_MENU ใน layout.js (sidebar ลิงก์ไปตามชื่อนี้)
- ข้อความบนจอภาษาไทยทั้งหมด

## ถ้าต้องใช้งานของเพื่อนที่ยังไม่มีใน repo
- ห้ามสร้างไฟล์ชื่อเดียวกับของเพื่อนใน routes/ หรือ public/ (จะชนตอนรวม)
- ถ้าต้องเรียก API ของเพื่อนที่ยังไม่มี → เขียน API จำลองที่ dev-mocks/routes/<ชื่อapi>.js
  (require lib ด้วย '../../lib/...' ตอบข้อมูลตายตัวตามรูปแบบใน API_v5 ชื่อฟิลด์ตรงฐานข้อมูล)
- ถ้าต้องเปิดหน้าของเพื่อนที่ยังไม่มี → ทำหน้าจำลองง่ายๆ ที่ dev-mocks/public/<path เดียวกับของจริง>
- server ใช้ไฟล์จำลองเฉพาะตอนที่ยังไม่มีไฟล์จริง และ dev-mocks/ ไม่ขึ้น Git
- ถ้าแค่ต้องการข้อมูลในตาราง (เมนู โต๊ะ บิล) ไม่ต้องทำ API จำลอง ให้ SQL INSERT สำหรับทดสอบแทน
- โค้ดจริงของฉันต้องเรียก API ด้วยชื่อและรูปแบบตาม API_v5 เป๊ะ จะได้สลับไปใช้ของจริงได้โดยไม่ต้องแก้

## ห้ามแตะไฟล์ของคนอื่น
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, config.js, services/*/index.js, style.css, api.js, layout.js, schema

## ส่งมอบ
1. ทุกไฟล์แบบเต็มไฟล์ (ไม่ตัดทอน) พร้อม path
2. วิธีทดสอบ API แต่ละ action (ตัวอย่าง JSON ที่ส่ง + ผลที่ควรได้) สำหรับ Thunder Client/Postman
3. ข้อมูลตัวอย่างที่ต้อง insert เพื่อทดสอบ (SQL INSERT) ถ้ามี
4. รายการที่ต้องขอคนอื่น (class CSS, คอลัมน์ DB, API ของคนอื่นที่ใช้)
5. ไฟล์จำลองใน dev-mocks/ (ถ้ามี) แยกหัวข้อไว้ท้ายสุด บอกชัดว่าเป็นไฟล์จำลอง ไม่ต้อง commit

---
# งานของฉัน — คนที่ 7 · เฟส 2: จอครัวแยกโซน (kitchen-service)
## ไฟล์ที่ฉันสร้าง/แก้ได้
- services/kitchen/routes/kitchen.js   ← kitchen-service (port 4001) ไม่ใช่ routes/ · มี services/kitchen/index.js อยู่แล้ว ห้ามแก้
- public/admin/kitchen.html + public/assets/js/kitchen.js
- public/admin/prep-today.html
## API ที่ต้องทำ (ดูรายละเอียดในแถวของ API_v5.md ที่แนบ)
- /api/kitchen GET zone · POST update_status, cancel_item · GET action=prep_today (head_chef, manager+) — FR-15–19, 46
## หน้าเว็บ (ถ้ามีภาพแนบ ให้จัดวางตามภาพ)
kitchen.html: ใส่ class kitchen ที่ content · แท็บโซนใหญ่ (btn-lg) + zone-dot + จำนวนค้าง · grid-4 card zone-border เรียงเวลาสั่ง
เลขโต๊ะ tile-code · ชื่อเมนู × จำนวน **หน่วย** ตัวใหญ่ ("× 3 เข่ง") · เวลารอ (เกิน 15 นาที class late) · ปุ่ม btn-lg ขั้นถัดไป · โซน drink_dessert มีปุ่มข้าม QC · ปุ่มยกเลิก → modal จำนวน + เหตุผล
poll 5 วินาที · ถ้า API ตอบ 503 (kitchen-service ดับ) ให้ขึ้นแถบ alert-bad "ระบบครัวขัดข้อง กำลังเชื่อมต่อใหม่..." แล้ว poll ต่อ ไม่ล้างการ์ดเดิม
prep-today.html ตาราง + แถบความคืบหน้า
## กฎธุรกิจที่ต้องเช็ก
- เปลี่ยนทีละขั้น waiting → cooking → ready → done · drink_dessert ข้าม ready ได้ · บันทึก updated_by
- cancel_item: ทั้งหมด/บางส่วน (cancelled_qty) · out_of_stock → available_qty = 0 + ปิดเมนู · spoiled/other ไม่คืนจำนวน (BR-08) · log
- kitchen.js require lib ด้วย '../../../lib/...' · kitchen-service ใช้ตาราง orders, order_items, menu_items, bills, bill_tables, dining_tables, vip_rooms (ฐานข้อมูลร่วม)
- ทดสอบ: npm run dev:all → เปิดจอครัว → ปิด kitchen-service (หน้าสถานะระบบ หรือ Ctrl+C ที่ npm run dev:kitchen) → ลูกค้ายังสั่งได้ → เปิดกลับ ครัวเห็นออเดอร์ครบ
```

---

## เฟส 3 — Dashboard VIP

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_full.sql → โครงฐานข้อมูล MySQL v5 + ข้อมูลตัวอย่าง (ส่วนที่ 1 = โครงตาราง) (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js, queue.js, gateway.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ระบบเป็น Microservices: server หลัก (port 3000) เป็น API Gateway ส่งต่อ /api/kitchen → kitchen-service (4001) ·
  /api/ingredients, suppliers, purchase_orders, goods_receipts, stock → inventory-service (4002) · /api/notifications → notify-service (4003)
  API ของ 3 service นี้เขียนที่ services/<service>/routes/<api>.js (เหมือน routes/_template.js แต่ require lib ด้วย '../../../lib/...')
  ไม่ต้องแก้ server.js, config.js หรือ services/*/index.js · หน้าเว็บเรียก api.get('kitchen') ตามปกติ ไม่ต้องรู้ port
- service คุยกันผ่าน API หรือคิวเท่านั้น ห้ามอ่านตารางของ service อื่นตรง:
  callService(req, 'inventory', '/api/ingredients?low_stock=1') (lib/gateway.js · service ดับ = throw 503 ให้ catch แล้วแสดง "ไม่พร้อมใช้")
  publish('notify', { channel: 'sms'|'line'|'system', to, title, message }, conn) (lib/queue.js · ไม่ต้องรอ notify-service ส่ง)
  ตารางคลัง (ingredients, suppliers, supplier_prices, purchase_orders, purchase_order_items, goods_receipts, stock_movements) ใช้ได้เฉพาะใน inventory-service
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage /
  publish (ส่งงานเข้าคิว) / callService (เรียก API ของ service อื่น)
  ห้ามแก้หรือเขียน lib ใหม่ ถ้าขาดอะไรให้เขียนเป็นฟังก์ชันภายในไฟล์ route ของฉันเอง
- GET = อ่าน (ค่าทาง query) / POST = เปลี่ยนข้อมูล ส่ง JSON ที่มี action แยกด้วย switch
- ตอบผ่าน ok(res, data, 'ข้อความไทย') หรือ throw fail('ข้อความไทย', status) เท่านั้น
- เช็กสิทธิ์ตามคอลัมน์ "ใครเรียกได้" ในตาราง API · เปลี่ยนข้อมูลสำคัญต้อง writeLog()
- ค่าที่อยู่ใน shop_settings (เวลา, max_qty_per_item, vip_*) ห้ามเขียนตัวเลขตายตัว อ่านจาก shopSettings()
- งานที่แก้หลายตารางพร้อมกันใช้ transaction()
- ห้ามแก้โครงฐานข้อมูล (ALTER/CREATE TABLE) ถ้าต้องการคอลัมน์เพิ่มให้บอกท้ายคำตอบ

## กติกาฝั่งหน้าเว็บ (HTML + CSS + JS ล้วน)
- ห้าม React/Vue/Tailwind/Bootstrap/jQuery ไม่ต้อง build
- หน้าพนักงาน: copy โครงจาก public/admin/_template.html → public/admin/<ไฟล์>.html
  เรียก initStaffPage({ title, roles, perm }) บนสุด (สร้าง sidebar + topbar ให้เอง ห้ามทำ sidebar เอง)
- หน้าลูกค้าที่มี navbar: copy จาก public/_template_customer.html แล้วเรียก initPublicPage()
- ใช้ class จาก style.css เท่านั้น: btn btn-secondary btn-danger btn-ghost btn-sm btn-lg / card / table-wrap table /
  badge-* / tabs tab / input select textarea field / modal / menu-card menu-row / tile / ticket / empty / alert-* / grid-* / split
  ห้ามเขียน <style> หรือไฟล์ CSS ใหม่ ใช้ style="" ได้เฉพาะ width/max-width/margin เล็กน้อย
  ถ้าต้องการ class ที่ไม่มี ให้ใช้ของที่ใกล้ที่สุด แล้วบอกท้ายคำตอบว่าอยากขอเพิ่ม class อะไร
- เรียก API ผ่าน api.js เท่านั้น: api.get / api.post / api.upload / run() / toast() / openModal() / confirmModal() /
  fmt.baht fmt.time fmt.date fmt.esc / badge(status) / zoneChip / menuImage / poll() / qs()
  ห้ามเขียน fetch เอง · ข้อความจากผู้ใช้ต้องผ่าน fmt.esc ก่อนใส่ innerHTML
- JS ของหน้ายาวเกิน ~150 บรรทัดให้แยกเป็น public/assets/js/<ชื่อหน้า>.js
- หน้าที่ต้องอัปเดตเองใช้ poll(fn, 5–10) ไม่ทำ real-time
- ชื่อไฟล์หน้าต้องตรงกับ STAFF_MENU ใน layout.js (sidebar ลิงก์ไปตามชื่อนี้)
- ข้อความบนจอภาษาไทยทั้งหมด

## ถ้าต้องใช้งานของเพื่อนที่ยังไม่มีใน repo
- ห้ามสร้างไฟล์ชื่อเดียวกับของเพื่อนใน routes/ หรือ public/ (จะชนตอนรวม)
- ถ้าต้องเรียก API ของเพื่อนที่ยังไม่มี → เขียน API จำลองที่ dev-mocks/routes/<ชื่อapi>.js
  (require lib ด้วย '../../lib/...' ตอบข้อมูลตายตัวตามรูปแบบใน API_v5 ชื่อฟิลด์ตรงฐานข้อมูล)
- ถ้าต้องเปิดหน้าของเพื่อนที่ยังไม่มี → ทำหน้าจำลองง่ายๆ ที่ dev-mocks/public/<path เดียวกับของจริง>
- server ใช้ไฟล์จำลองเฉพาะตอนที่ยังไม่มีไฟล์จริง และ dev-mocks/ ไม่ขึ้น Git
- ถ้าแค่ต้องการข้อมูลในตาราง (เมนู โต๊ะ บิล) ไม่ต้องทำ API จำลอง ให้ SQL INSERT สำหรับทดสอบแทน
- โค้ดจริงของฉันต้องเรียก API ด้วยชื่อและรูปแบบตาม API_v5 เป๊ะ จะได้สลับไปใช้ของจริงได้โดยไม่ต้องแก้

## ห้ามแตะไฟล์ของคนอื่น
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, config.js, services/*/index.js, style.css, api.js, layout.js, schema

## ส่งมอบ
1. ทุกไฟล์แบบเต็มไฟล์ (ไม่ตัดทอน) พร้อม path
2. วิธีทดสอบ API แต่ละ action (ตัวอย่าง JSON ที่ส่ง + ผลที่ควรได้) สำหรับ Thunder Client/Postman
3. ข้อมูลตัวอย่างที่ต้อง insert เพื่อทดสอบ (SQL INSERT) ถ้ามี
4. รายการที่ต้องขอคนอื่น (class CSS, คอลัมน์ DB, API ของคนอื่นที่ใช้)
5. ไฟล์จำลองใน dev-mocks/ (ถ้ามี) แยกหัวข้อไว้ท้ายสุด บอกชัดว่าเป็นไฟล์จำลอง ไม่ต้อง commit

---
# งานของฉัน — คนที่ 7 · เฟส 3: Dashboard VIP
## ไฟล์ที่ฉันสร้าง/แก้ได้
- routes/dashboard.js (เพิ่ม vip_today)
- public/assets/js/dashboard.js (เพิ่ม)
## API ที่ต้องทำ (ดูรายละเอียดในแถวของ API_v5.md ที่แนบ)
- /api/dashboard เพิ่มส่วน P3: การจอง VIP วันนี้
## หน้าเว็บ (ถ้ามีภาพแนบ ให้จัดวางตามภาพ)
เพิ่ม card "ห้อง VIP วันนี้" แบบกราฟ: ไทม์ไลน์ Gantt 6 ห้อง × 10–20 น. (แท่งกว้างตามชั่วโมง สีตามสถานะ) + โดนัทสถานะการจองวันนี้ + รายการต้องติดตามสั้นๆ (ยังไม่รับมัดจำ, เลยเวลานัด)
## กฎธุรกิจที่ต้องเช็ก
- อ่านจาก vip_bookings วันนี้ทุกสถานะ
```

---

## เฟส 4 — Dashboard เต็ม + ทดสอบรอบสุดท้าย

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_full.sql → โครงฐานข้อมูล MySQL v5 + ข้อมูลตัวอย่าง (ส่วนที่ 1 = โครงตาราง) (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js, queue.js, gateway.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ระบบเป็น Microservices: server หลัก (port 3000) เป็น API Gateway ส่งต่อ /api/kitchen → kitchen-service (4001) ·
  /api/ingredients, suppliers, purchase_orders, goods_receipts, stock → inventory-service (4002) · /api/notifications → notify-service (4003)
  API ของ 3 service นี้เขียนที่ services/<service>/routes/<api>.js (เหมือน routes/_template.js แต่ require lib ด้วย '../../../lib/...')
  ไม่ต้องแก้ server.js, config.js หรือ services/*/index.js · หน้าเว็บเรียก api.get('kitchen') ตามปกติ ไม่ต้องรู้ port
- service คุยกันผ่าน API หรือคิวเท่านั้น ห้ามอ่านตารางของ service อื่นตรง:
  callService(req, 'inventory', '/api/ingredients?low_stock=1') (lib/gateway.js · service ดับ = throw 503 ให้ catch แล้วแสดง "ไม่พร้อมใช้")
  publish('notify', { channel: 'sms'|'line'|'system', to, title, message }, conn) (lib/queue.js · ไม่ต้องรอ notify-service ส่ง)
  ตารางคลัง (ingredients, suppliers, supplier_prices, purchase_orders, purchase_order_items, goods_receipts, stock_movements) ใช้ได้เฉพาะใน inventory-service
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage /
  publish (ส่งงานเข้าคิว) / callService (เรียก API ของ service อื่น)
  ห้ามแก้หรือเขียน lib ใหม่ ถ้าขาดอะไรให้เขียนเป็นฟังก์ชันภายในไฟล์ route ของฉันเอง
- GET = อ่าน (ค่าทาง query) / POST = เปลี่ยนข้อมูล ส่ง JSON ที่มี action แยกด้วย switch
- ตอบผ่าน ok(res, data, 'ข้อความไทย') หรือ throw fail('ข้อความไทย', status) เท่านั้น
- เช็กสิทธิ์ตามคอลัมน์ "ใครเรียกได้" ในตาราง API · เปลี่ยนข้อมูลสำคัญต้อง writeLog()
- ค่าที่อยู่ใน shop_settings (เวลา, max_qty_per_item, vip_*) ห้ามเขียนตัวเลขตายตัว อ่านจาก shopSettings()
- งานที่แก้หลายตารางพร้อมกันใช้ transaction()
- ห้ามแก้โครงฐานข้อมูล (ALTER/CREATE TABLE) ถ้าต้องการคอลัมน์เพิ่มให้บอกท้ายคำตอบ

## กติกาฝั่งหน้าเว็บ (HTML + CSS + JS ล้วน)
- ห้าม React/Vue/Tailwind/Bootstrap/jQuery ไม่ต้อง build
- หน้าพนักงาน: copy โครงจาก public/admin/_template.html → public/admin/<ไฟล์>.html
  เรียก initStaffPage({ title, roles, perm }) บนสุด (สร้าง sidebar + topbar ให้เอง ห้ามทำ sidebar เอง)
- หน้าลูกค้าที่มี navbar: copy จาก public/_template_customer.html แล้วเรียก initPublicPage()
- ใช้ class จาก style.css เท่านั้น: btn btn-secondary btn-danger btn-ghost btn-sm btn-lg / card / table-wrap table /
  badge-* / tabs tab / input select textarea field / modal / menu-card menu-row / tile / ticket / empty / alert-* / grid-* / split
  ห้ามเขียน <style> หรือไฟล์ CSS ใหม่ ใช้ style="" ได้เฉพาะ width/max-width/margin เล็กน้อย
  ถ้าต้องการ class ที่ไม่มี ให้ใช้ของที่ใกล้ที่สุด แล้วบอกท้ายคำตอบว่าอยากขอเพิ่ม class อะไร
- เรียก API ผ่าน api.js เท่านั้น: api.get / api.post / api.upload / run() / toast() / openModal() / confirmModal() /
  fmt.baht fmt.time fmt.date fmt.esc / badge(status) / zoneChip / menuImage / poll() / qs()
  ห้ามเขียน fetch เอง · ข้อความจากผู้ใช้ต้องผ่าน fmt.esc ก่อนใส่ innerHTML
- JS ของหน้ายาวเกิน ~150 บรรทัดให้แยกเป็น public/assets/js/<ชื่อหน้า>.js
- หน้าที่ต้องอัปเดตเองใช้ poll(fn, 5–10) ไม่ทำ real-time
- ชื่อไฟล์หน้าต้องตรงกับ STAFF_MENU ใน layout.js (sidebar ลิงก์ไปตามชื่อนี้)
- ข้อความบนจอภาษาไทยทั้งหมด

## ถ้าต้องใช้งานของเพื่อนที่ยังไม่มีใน repo
- ห้ามสร้างไฟล์ชื่อเดียวกับของเพื่อนใน routes/ หรือ public/ (จะชนตอนรวม)
- ถ้าต้องเรียก API ของเพื่อนที่ยังไม่มี → เขียน API จำลองที่ dev-mocks/routes/<ชื่อapi>.js
  (require lib ด้วย '../../lib/...' ตอบข้อมูลตายตัวตามรูปแบบใน API_v5 ชื่อฟิลด์ตรงฐานข้อมูล)
- ถ้าต้องเปิดหน้าของเพื่อนที่ยังไม่มี → ทำหน้าจำลองง่ายๆ ที่ dev-mocks/public/<path เดียวกับของจริง>
- server ใช้ไฟล์จำลองเฉพาะตอนที่ยังไม่มีไฟล์จริง และ dev-mocks/ ไม่ขึ้น Git
- ถ้าแค่ต้องการข้อมูลในตาราง (เมนู โต๊ะ บิล) ไม่ต้องทำ API จำลอง ให้ SQL INSERT สำหรับทดสอบแทน
- โค้ดจริงของฉันต้องเรียก API ด้วยชื่อและรูปแบบตาม API_v5 เป๊ะ จะได้สลับไปใช้ของจริงได้โดยไม่ต้องแก้

## ห้ามแตะไฟล์ของคนอื่น
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, config.js, services/*/index.js, style.css, api.js, layout.js, schema

## ส่งมอบ
1. ทุกไฟล์แบบเต็มไฟล์ (ไม่ตัดทอน) พร้อม path
2. วิธีทดสอบ API แต่ละ action (ตัวอย่าง JSON ที่ส่ง + ผลที่ควรได้) สำหรับ Thunder Client/Postman
3. ข้อมูลตัวอย่างที่ต้อง insert เพื่อทดสอบ (SQL INSERT) ถ้ามี
4. รายการที่ต้องขอคนอื่น (class CSS, คอลัมน์ DB, API ของคนอื่นที่ใช้)
5. ไฟล์จำลองใน dev-mocks/ (ถ้ามี) แยกหัวข้อไว้ท้ายสุด บอกชัดว่าเป็นไฟล์จำลอง ไม่ต้อง commit

---
# งานของฉัน — คนที่ 7 · เฟส 4: Dashboard เต็ม + ทดสอบรอบสุดท้าย
## ไฟล์ที่ฉันสร้าง/แก้ได้
- routes/dashboard.js (เพิ่ม)
- public/assets/js/dashboard.js (เพิ่ม)
- docs/test-checklist.md
## API ที่ต้องทำ (ดูรายละเอียดในแถวของ API_v5.md ที่แนบ)
- /api/dashboard เพิ่ม sales_today, sales_by_hour, top_menus, low_menus, low_ingredients, unpaid_invoices
## หน้าเว็บ (ถ้ามีภาพแนบ ให้จัดวางตามภาพ)
เพิ่มแบบกราฟ: ยอดขายวันนี้ (+% เทียบเมื่อวาน) · กราฟแท่งรายชั่วโมง · แท่งแนวนอน Top 5 เมนู · เมนูใกล้หมด · วัตถุดิบต่ำกว่าจุดสั่งซื้อ (ปุ่มไปใบสั่งซื้อ) · alert-wait ด้านบนเมื่อมีวัตถุดิบต่ำ
การ์ดที่มาจาก inventory-service ถ้าระบบคลังดับ ให้ขึ้น "ระบบคลังสินค้าไม่พร้อมใช้" ในการ์ดนั้น ส่วนอื่นของ Dashboard ยังแสดงปกติ
docs/test-checklist.md: checklist ทดสอบ flow demo ทุกเฟส อ้าง FR/BR + หัวข้อสาธิต Microservices:
ปิด kitchen-service แล้วลูกค้ายังสั่งได้ · ปิด notify-service แล้วขอ OTP งานรอในคิว เปิดกลับส่งครบ · ปิด inventory-service แล้ว Dashboard ยังเปิดได้ · npm run start:all เปิด service ที่ดับกลับเอง
## กฎธุรกิจที่ต้องเช็ก
- นับยอดจากบิล paid วันนี้
- low_ingredients และ unpaid_invoices ห้ามอ่านตารางคลังตรง ให้เรียก
  callService(req, 'inventory', '/api/ingredients?low_stock=1') และ callService(req, 'inventory', '/api/goods_receipts?unpaid=1')
  ใส่ try/catch: service ดับ → ส่ง { available: false } ของส่วนนั้น ห้ามทำให้ทั้ง API error
```
