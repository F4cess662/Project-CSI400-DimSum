# Prompt เขียนโค้ดจริง — คนที่ 7 (Dashboard + ทดสอบ) · ร้านนึ่งสุข

## วิธีใช้
1. เปิดแชตใหม่กับ Claude หรือ ChatGPT (**1 เฟส = 1 แชต** จะได้ไม่เปลือง token)
2. แนบไฟล์จาก repo (git pull ก่อนทุกครั้ง): `database/dimsum_schema.sql` · โฟลเดอร์ `lib/` · `routes/_template.js` · `routes/auth.js` · `public/assets/css/style.css` · `public/assets/js/api.js` · `public/assets/js/layout.js` · `public/admin/_template.html` · `public/_template_customer.html` · `docs/API_ร้านติ่มซำ_v5.md`
   + **ภาพหน้าจอตัวอย่าง (ถ้ามี)** จะเป็นภาพจาก Lovable 3–4 หน้า หรือภาพวาดมือก็ได้ ไม่มีภาพก็สั่งได้ (ไม่ต้องแนบโค้ด React จาก Lovable)
   + ถ้าเฟสนี้ต้องแก้ต่อจากไฟล์ของตัวเองเฟสก่อน ให้แนบไฟล์นั้นไปด้วย
3. copy ทั้งกล่องของเฟสนั้นไปวาง
4. แตก branch ใหม่จาก main → ได้โค้ดแล้ววางไฟล์ตาม path → `npm run dev` → ทดสอบตามที่ AI บอก → commit เฉพาะไฟล์ของตัวเอง → ส่ง Pull Request
5. ถ้า AI ขอ class CSS / คอลัมน์ DB / API ของคนอื่น → แจ้งในกลุ่ม ห้ามแก้เอง

---

## เฟส 1 — Dashboard

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_schema.sql → โครงฐานข้อมูล MySQL v5 (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage
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
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, style.css, api.js, layout.js, schema

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

## เฟส 2 — จอครัวแยกโซน

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_schema.sql → โครงฐานข้อมูล MySQL v5 (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage
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
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, style.css, api.js, layout.js, schema

## ส่งมอบ
1. ทุกไฟล์แบบเต็มไฟล์ (ไม่ตัดทอน) พร้อม path
2. วิธีทดสอบ API แต่ละ action (ตัวอย่าง JSON ที่ส่ง + ผลที่ควรได้) สำหรับ Thunder Client/Postman
3. ข้อมูลตัวอย่างที่ต้อง insert เพื่อทดสอบ (SQL INSERT) ถ้ามี
4. รายการที่ต้องขอคนอื่น (class CSS, คอลัมน์ DB, API ของคนอื่นที่ใช้)
5. ไฟล์จำลองใน dev-mocks/ (ถ้ามี) แยกหัวข้อไว้ท้ายสุด บอกชัดว่าเป็นไฟล์จำลอง ไม่ต้อง commit

---
# งานของฉัน — คนที่ 7 · เฟส 2: จอครัวแยกโซน

## ไฟล์ที่ฉันสร้าง/แก้ได้
- routes/kitchen.js
- public/admin/kitchen.html + public/assets/js/kitchen.js
- public/admin/prep-today.html

## API ที่ต้องทำ (ดูรายละเอียดในแถวของ API_v5.md ที่แนบ)
- /api/kitchen GET zone · POST update_status, cancel_item · GET action=prep_today (head_chef, manager+) — FR-15–19, 46

## หน้าเว็บ (ถ้ามีภาพแนบ ให้จัดวางตามภาพ)
kitchen.html: ใส่ class kitchen ที่ content · แท็บโซนใหญ่ (btn-lg) + zone-dot + จำนวนค้าง · grid-4 card zone-border เรียงเวลาสั่ง
เลขโต๊ะ tile-code · เวลารอ (เกิน 15 นาที class late) · ปุ่ม btn-lg ขั้นถัดไป · โซน drink_dessert มีปุ่มข้าม QC · ปุ่มยกเลิก → modal จำนวน + เหตุผล
poll 5 วินาที · prep-today.html ตาราง + แถบความคืบหน้า

## กฎธุรกิจที่ต้องเช็ก
- เปลี่ยนทีละขั้น waiting → cooking → ready → done · drink_dessert ข้าม ready ได้ · บันทึก updated_by
- cancel_item: ทั้งหมด/บางส่วน (cancelled_qty) · out_of_stock → available_qty = 0 + ปิดเมนู · spoiled/other ไม่คืนจำนวน (BR-08) · log
```

---

## เฟส 3 — Dashboard VIP

```
ช่วยเขียนโค้ดจริงของระบบร้านติ่มซำ "นึ่งสุข" (งานวิชามหาวิทยาลัย) ส่วนที่ฉันรับผิดชอบ
ทีม 7 คนต่างคนต่างให้ AI เขียนแล้วค่อยรวมกันใน Git จึงต้องทำตามกติกานี้เคร่งครัด ไม่อย่างนั้นรวมกันไม่ได้

## ไฟล์ที่แนบมา
- ภาพหน้าจอตัวอย่าง (ถ้ามี) → ใช้เป็นแนวทางการจัดวางเท่านั้น สี/ขนาด/ฟอนต์ให้ใช้ class ใน style.css เสมอ
  ถ้าไม่มีภาพของหน้าไหน ให้ออกแบบเองจากคำอธิบายด้านล่าง โดยใช้ class ใน style.css ให้หน้าตาเข้ากับหน้าอื่นของร้าน
- database/dimsum_schema.sql → โครงฐานข้อมูล MySQL v5 (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage
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
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, style.css, api.js, layout.js, schema

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
เพิ่ม card "ห้อง VIP วันนี้": timeline 10–20 น. (div กว้างตามสัดส่วนชั่วโมง ใช้ badge สีตามสถานะ) + รายการต้องติดตาม (ยังไม่รับมัดจำ, เลยเวลานัด)

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
- database/dimsum_schema.sql → โครงฐานข้อมูล MySQL v5 (ชื่อตาราง/คอลัมน์ต้องตรงเป๊ะ)
- lib/ (db.js, response.js, auth.js, log.js, shop.js) + routes/_template.js + routes/auth.js → ฟังก์ชันกลางฝั่ง server
- public/assets/css/style.css + public/assets/js/api.js + public/assets/js/layout.js + public/admin/_template.html + public/_template_customer.html → ฐานหน้าเว็บกลาง
- docs/API_ร้านติ่มซำ_v5.md → ดูเฉพาะแถว API ของฉัน และแถวของเพื่อนที่หน้าฉันต้องเรียก

## กติกาฝั่ง server (Node.js + Express + MySQL)
- 1 API = 1 ไฟล์ routes/<ชื่อ>.js ตามแม่แบบ routes/_template.js (server.js โหลดให้อัตโนมัติ ห้ามแก้ server.js)
- ใช้เฉพาะฟังก์ชันใน lib/: query, queryOne, transaction / ok, fail, requireFields, handle /
  requireLogin, requireRole, requirePerm, mustBe, mustHavePerm, requireMember, loginMember, logoutMember /
  writeLog / shopSettings, isOpenNow, isOrderOpenNow, currentShift, closedMessage
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
แก้/สร้างได้เฉพาะไฟล์ที่ระบุใน "งานของฉัน" เท่านั้น ห้ามแก้ lib/, server.js, style.css, api.js, layout.js, schema

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
เพิ่ม card ยอดขายวันนี้ (+% เทียบเมื่อวาน) · กราฟแท่งรายชั่วโมง (SVG เอง) · Top 5 เมนู · เมนูใกล้หมด · วัตถุดิบต่ำกว่าจุดสั่งซื้อ (ปุ่มไปใบสั่งซื้อ) · alert-wait ด้านบนเมื่อมีวัตถุดิบต่ำ
docs/test-checklist.md: checklist ทดสอบ flow demo ทุกเฟส อ้าง FR/BR

## กฎธุรกิจที่ต้องเช็ก
- นับยอดจากบิล paid วันนี้ · low_ingredients = qty_on_hand < reorder_point
```
