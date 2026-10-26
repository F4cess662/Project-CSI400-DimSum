# รายการ API ทั้งระบบ — ระบบร้านติ่มซำ (CSI400) v5

อ้างอิง: **Requirement v5**, **dimsum_schema.sql** (31 ตาราง), ชุดเริ่มต้น **dimsum_node.zip**
ทุก FR ใน Requirement v5 มี API รองรับครบ

## สิ่งที่เปลี่ยนจากเอกสาร API ฉบับก่อน

- ใช้ **Node.js + Express** ชื่อ API เป็น `/api/xxx` ไฟล์อยู่ที่ `routes/xxx.js`
- อ้างอิงเลข **FR ใน Requirement v5** แทนเลข use case
- **เมนูมีโซนครัว** (`kitchen_zone`) จอครัวแยกตามโซนได้
- **ห้อง VIP ขนาดเดียว** 15 คน ยอดขั้นต่ำ 3,000฿ มัดจำ 50% สูงสุด 4 ชั่วโมง (ค่าเหล่านี้อยู่ในตั้งค่าร้าน)
- **ตัด QR รับแต้ม**: กรอกเบอร์สมาชิกตอนปิดบิลได้แต้มทันที ไม่กรอกไม่ได้แต้ม
- **คูปองกำหนดวันในสัปดาห์และยกเว้นวันหยุดราชการได้** + API วันหยุดราชการ
- ตอนดูยอดก่อนจ่าย ระบบแนะนำคูปองที่ใช้ได้ตอนนั้น
- แบ่งเป็น **4 เฟส** และมีคอลัมน์ **คนทำ** ตามตารางแบ่งงานใน Requirement v5

## ข้อตกลงที่ใช้ทุก API

- หน้าเว็บเรียกด้วย `fetch('/api/ชื่อapi')` ไฟล์ใน `routes/` ถูกโหลดอัตโนมัติ ไม่ต้องแก้ `server.js`
- อ่านข้อมูล = `GET` ส่งค่าทาง URL เช่น `?q=ฮะ`
- เพิ่ม แก้ ลบ และอื่นๆ = `POST` ส่ง JSON ที่มี `action` เช่น `{"action":"create", ...}` (ถ้ามีไฟล์รูปใช้ form-data)
- คำตอบทุก API: `{"success": true/false, "data": ..., "message": ""}`
- ชื่อฟิลด์ใน JSON ตรงกับชื่อในฐานข้อมูลเป๊ะ (snake_case)
- พนักงานล็อกอินด้วย session / สมาชิกใช้ session แยก / ลูกค้า walk-in ใช้ `token` จาก QR บิล
- หน้าที่ต้องอัปเดตเอง (จอครัว, ผังโต๊ะ, สถานะของลูกค้า) เรียก GET ซ้ำทุก 5–10 วินาที ไม่ต้องทำ real-time
- ทุก API ที่เปลี่ยนข้อมูลสำคัญ เรียก `writeLog()`

**ใครเรียกได้**: สาธารณะ = ไม่ต้องล็อกอิน · พนักงาน = ทุกบทบาทที่ล็อกอิน · staff+ = พนักงานหน้าร้าน ผู้จัดการ เจ้าของร้าน · manager+ = ผู้จัดการ เจ้าของร้าน · [รับเงิน] / [จอง VIP] = staff ต้องมีช่องติ๊กนั้น (ผู้จัดการและเจ้าของร้านทำได้เสมอ)

**เฟส**: P1 ฐานระบบ · P2 สั่งอาหาร ครัว ชำระเงิน · P3 ห้อง VIP สมาชิก แต้ม คูปอง · P4 ผู้จัดการ จัดซื้อ สต็อก

## ฟังก์ชันกลางใน lib/ (มีแล้วในชุดเริ่มต้น ห้ามเขียนใหม่)

| ไฟล์ | ฟังก์ชัน | ทำอะไร |
| --- | --- | --- |
| config.js | — | ค่าฐานข้อมูล, port, BASE_URL |
| lib/db.js | `query()`, `queryOne()`, `transaction()` | เชื่อม MySQL |
| lib/response.js | `ok(res, data, msg)`, `throw fail(msg, status)`, `requireFields()`, `handle()` | ตอบกลับรูปแบบกลาง + error ทุกชนิดตอบเป็น JSON |
| lib/auth.js | `requireLogin`, `requireRole([...])`, `requirePerm('payment' / 'vip_booking')`, `mustBe()`, `mustHavePerm()`, `requireMember` | เช็กสิทธิ์ ปิดบัญชีแล้วใช้งานไม่ได้ทันที |
| lib/log.js | `writeLog(req, action, targetType, targetId, detail, level)` | บันทึก activity_logs |
| lib/shop.js | `isOpenNow()`, `isOrderOpenNow()`, `currentShift()`, `closedMessage()` | เวลาเปิดร้านและเวลาปิดรับออเดอร์ (BR-01) |

`routes/auth.js` เสร็จแล้ว · `routes/_template.js` คือแม่แบบ

---

## 1. ผู้ใช้และตั้งค่าร้าน

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/auth | POST login | username, password | ผู้ใช้ + role_code + ช่องติ๊ก · บัญชีที่ปิดแล้วล็อกอินไม่ได้ | สาธารณะ | — | P1 ✅ | เสร็จแล้ว |
| /api/auth | POST logout | — | ล้าง session | พนักงาน | — | P1 ✅ | เสร็จแล้ว |
| /api/auth | GET | — | ผู้ใช้ปัจจุบัน (ใช้สร้าง sidebar) | พนักงาน | — | P1 ✅ | เสร็จแล้ว |
| /api/roles | GET | — | รายชื่อบทบาท (ใส่ dropdown) | owner | FR-49 | P1 | 2 |
| /api/users | GET | q, role_id, is_active · `?id=` = คนเดียว | รายชื่อ/ค้นหาพนักงาน | owner | FR-49 | P1 | 2 |
| /api/users | POST create | username, password, full_name, phone, role_id, can_payment, can_vip_booking | พนักงานใหม่ · staff ติ๊กทั้งสองช่องเป็นค่าเริ่มต้น | owner | FR-49 | P1 | 2 |
| /api/users | POST update | id + ฟิลด์ที่แก้ (ไม่ส่ง password = ไม่เปลี่ยน) | ข้อมูลที่แก้แล้ว · log ระดับ system | owner | FR-49 | P1 | 2 |
| /api/users | POST deactivate / activate | id | ปิด/เปิดบัญชี ไม่ลบจริง · ปิดบัญชีตัวเองไม่ได้ | owner | FR-49 | P1 | 2 |
| /api/settings | GET | — | ตั้งค่าร้านทั้งหมด (รวม vip_min_spend, vip_deposit_percent, vip_max_hours) | สาธารณะ | FR-02, 50 | P1 | 4 |
| /api/settings | POST update | เวลาเปิด-ปิด 2 กะ, เวลาปิดรับออเดอร์, ข้อมูลร้าน, max_qty_per_item, ค่าห้อง VIP | ตั้งค่าใหม่ · log ระดับ system | owner | FR-50 | P1 | 4 |
| /api/holidays | GET | year | วันหยุดราชการของปีนั้น | พนักงาน | FR-50 | P1 | 1 |
| /api/holidays | POST create / delete | holiday_date, name / id | เพิ่ม/ลบวันหยุด (วันซ้ำเพิ่มไม่ได้) | owner | FR-50 | P1 | 1 |

## 2. เมนู

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/categories | GET | — | หมวดที่ใช้งาน เรียงตาม sort_order | สาธารณะ | FR-48 | P1 | 3 |
| /api/categories | POST create / update / delete | name, sort_order (delete = ซ่อน) | ลบไม่ได้ถ้ายังมีเมนูที่ใช้งานอยู่ | owner | FR-48 | P1 | 3 |
| /api/menus | GET | q, category_id, kitchen_zone · `?id=` = เมนูเดียว | รายการ/ค้นหาเมนู (ไม่รวมที่ลบแล้ว) | พนักงาน | FR-48 | P1 | 3 |
| /api/menus | POST create / update | form-data: category_id, name, description, price, unit, **kitchen_zone**, lot_size, image | เมนูใหม่/ที่แก้ · รูปเก็บที่ public/assets/uploads · แก้ราคา = log ระดับ system | owner | FR-48 | P1 | 3 |
| /api/menus | POST delete | id | ซ่อน (is_deleted = 1) | owner | FR-48 | P1 | 3 |
| /api/menus | POST set_available | id, is_available | เปิด/ปิดขาย | หัวหน้าเชฟ, manager+ | FR-21 | P1 | 3 |
| /api/menus | POST add_stock | id, lots หรือ qty | บวกจำนวนพร้อมขาย (lots × lot_size) · เมนูที่ปิดเพราะหมดเปิดเอง | หัวหน้าเชฟ, manager+ | FR-22, 24 | P2 | 3 |
| /api/menus | POST set_stock | id, available_qty | แก้เป็นจำนวนที่นับได้จริง | หัวหน้าเชฟ, manager+ | FR-23 | P2 | 3 |

ค่า `kitchen_zone`: `steam` นึ่ง · `fry` ทอด · `congee_noodle` โจ๊ก-เส้น · `drink_dessert` เครื่องดื่ม-ของหวาน

## 3. โต๊ะ คิว และบิล

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/tables | GET | — | โต๊ะทั้งหมด + สถานะ + บิลที่เปิดอยู่ + เวลาเปิด (ใช้วาดผัง) | พนักงาน | FR-05 | P1 | 4 |
| /api/tables | POST create / update / deactivate | code, table_type, seats, pos_x, pos_y | ปิดใช้โต๊ะที่มีลูกค้าอยู่ไม่ได้ | owner | FR-50 | P1 | 4 |
| /api/vip_rooms | GET | — | ห้อง VIP ทั้งหมด + สถานะ | พนักงาน | FR-50 | P1 | 4 |
| /api/vip_rooms | POST create / update / deactivate | name, seats (ไม่เกิน 15) | ห้องขนาดเดียว (BR-13) | owner | FR-50 | P1 | 4 |
| /api/bills | POST open | table_ids[] หรือ vip_room_id, guests | bill_id, bill_no, qr_token, qr_url · เช็ก: ร้านเปิดอยู่ (BR-01), ทุกโต๊ะว่าง, 1 โต๊ะ 1 บิลที่เปิด (BR-26) · qr_url ใช้ BASE_URL | staff+ | FR-06, 07 | P1 | 5 |
| /api/bills | GET | status=open | บิลที่เปิดอยู่ (เลขบิล, โต๊ะ, เวลาเปิด, ยอดรวม) | พนักงาน | FR-20, 25 | P1 | 5 |
| /api/bills | POST cancel | bill_id | ยกเลิกโต๊ะที่เปิดผิด เฉพาะบิลที่ยังไม่มีออเดอร์ · โต๊ะกลับเป็นว่าง QR ใช้ไม่ได้ | manager+ | FR-08 | P1 | 5 |
| /api/bills | GET | id | บิลเดียว + ออเดอร์ทุกรอบ + สถานะรายการ | พนักงาน | FR-20, 25 | P2 | 5 |
| /api/bills | POST void | bill_id, reason | ยกเลิกบิลที่มีออเดอร์หรือจ่ายแล้ว (BR-11) · เหตุผลเก็บใน log | manager+ | FR-30 | P2 | 5 |
| /api/bills | GET | action=search, date, table_id, time_from, time_to | บิลย้อนหลัง + ใครเปิด/ปิด + สั่งผ่าน QR หรือพนักงานคนไหน | manager+ | FR-53 | P2 | 5 |
| /api/queue | POST issue | party_size | queue_no แยกกลุ่ม (บาร์ / 2–4 / 5–8) · หลังปิดรับออเดอร์ออกคิวไม่ได้ | staff+ | FR-03 | P2 | 4 |
| /api/queue | GET | — | คิวที่รออยู่ แยกตามกลุ่ม | staff+ | FR-04 | P2 | 4 |
| /api/queue | POST call / skip / seat | id (seat ส่ง bill_id ด้วย) | call นับครั้ง · เรียก 3 ครั้งหรือเกิน 5 นาทีข้ามได้ (BR-03) | staff+ | FR-04 | P2 | 4 |

## 4. สั่งอาหารและครัว

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/public | GET | action=home | เมนูแยกหมวด + เวลาเปิด-ปิด + ช่องทางติดต่อ | สาธารณะ | FR-01, 02 | P1 | 6 |
| /api/public | GET | action=menu, token | เลขโต๊ะ + เมนู (ปิดขายขึ้น "หมด") + ปิดรับออเดอร์หรือยัง · บิลไม่ open = error | สาธารณะ | FR-09 | P1 | 6 |
| /api/public | GET | action=bill_status, token | ออเดอร์แยกรอบ + สถานะรายการ + ยอดบิล + รายการที่หัวหน้าเชฟยกเลิกพร้อมเหตุผล | สาธารณะ | FR-12, 18 | P2 | 6 |
| /api/orders | POST create | token, items[{menu_item_id, qty}] | ออเดอร์รอบถัดไป · เช็ก: บิล open, ยังไม่ปิดรับออเดอร์ (FR-14), ไม่เกิน 10 ต่อเมนู (BR-06), จำนวนพร้อมขายพอ (FR-11) · เก็บราคาตอนสั่ง · ตัดจำนวนพร้อมขาย | สาธารณะ (token) | FR-10, 11, 14 | P2 | 6 |
| /api/orders | POST create_by_staff | bill_id, items[] | เหมือน create + บันทึก created_by | staff+ | FR-52 | P2 | 6 |
| /api/orders | POST cancel | token, order_id | ยกเลิกทั้งออเดอร์เมื่อทุกรายการยัง waiting (BR-07) · คืนจำนวนพร้อมขาย | สาธารณะ (token) | FR-13 | P2 | 6 |
| /api/kitchen | GET | zone (ไม่ส่ง = ทุกโซน) | รายการที่ยังไม่ done เรียงตามเวลาสั่ง (FIFO) + เลขโต๊ะ + โซน · จอโซนส่ง zone / จอหัวหน้าเชฟไม่ส่ง | หัวหน้าเชฟ, manager+ | FR-15, 16 | P2 | 7 |
| /api/kitchen | POST update_status | item_id, status | เปลี่ยนทีละขั้น waiting → cooking → ready → done · โซน drink_dessert ข้าม ready ได้ (ข้าม QC) · บันทึก updated_by | หัวหน้าเชฟ, manager+ | FR-17 | P2 | 7 |
| /api/kitchen | POST cancel_item | item_id, cancel_qty, reason, note | ยกเลิกทั้งหมด/บางส่วน · วัตถุดิบหมด = จำนวนพร้อมขายเป็น 0 ปิดเมนู · เสีย/อื่นๆ = ไม่คืนจำนวน (BR-08) | หัวหน้าเชฟ, manager+ | FR-18, 19 | P2 | 7 |
| /api/kitchen | GET | action=prep_today | ยอดที่ต้องเตรียมวันนี้จาก prep_plans | หัวหน้าเชฟ, manager+ | FR-46 | P2 | 7 |

## 5. ชำระเงินและปิดยอดกะ

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/members | GET | action=lookup, code (**เบอร์โทร** หรือบาร์โค้ด) | สมาชิก + แต้มคงเหลือ + รางวัลที่แลกได้ + คูปองในบัญชีที่ยังไม่ใช้ | staff+ [รับเงิน] | FR-26 | P3 | 2 |
| /api/checkout | POST preview | bill_ids[], member_id, reward_ids[], coupon_code | คำนวณให้ดูก่อน (ไม่บันทึก) ตาม BR-10 · **suggested_coupons** = คูปองที่ใช้ได้ตอนนั้น (เช่น Happy Hour) · points_to_earn | staff+ [รับเงิน] | FR-26, 27 | P2 / P3 | 5 |
| /api/checkout | POST pay | bill_ids[], payment_method, member_id, reward_ids[], coupon_code | ปิดบิล + โต๊ะว่าง + QR หมดอายุ (FR-29) · ถ้ามี member_id: ตัดแต้มที่แลก + **บวกแต้มเข้าบัญชีทันที** (BR-18) · ไม่มี member_id ไม่ได้แต้ม · ได้ข้อมูลใบเสร็จ + points_earned (FR-28) · เฟส 2 ส่งแค่ bill_ids + payment_method | staff+ [รับเงิน] | FR-25–29, 41 | P2 / P3 | 5 |
| /api/shifts | GET | date, shift | ยอดเงินสดในระบบของกะ | staff+ [รับเงิน] | FR-31 | P2 | 2 |
| /api/shifts | POST close | shift, counted_cash | บันทึกปิดยอด + ส่วนต่าง | staff+ [รับเงิน] | FR-31 | P2 | 2 |

กติกาตอนปิดบิล: แลกแต้มได้เฉพาะตอนนี้ (BR-22) · รางวัลของฟรีต้องมีเมนูนั้นในบิล · 1 บิลใช้คูปอง 1 ใบ (BR-23) · 1 บิลให้แต้ม 1 สมาชิก (BR-19) · แต้มที่ได้จากบิลนี้ใช้ได้ครั้งถัดไป

## 6. ห้อง VIP

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/vip_bookings | GET | action=availability, date | ตารางห้อง × ชั่วโมง ว่าง/จองแล้ว | staff+ [จอง VIP] | FR-32 | P3 | 4 |
| /api/vip_bookings | GET | date · `?id=` = การจองเดียว | การจองของวัน / รายละเอียด + pre-order | staff+ [จอง VIP] | FR-32 | P3 | 4 |
| /api/vip_bookings | POST create | vip_room_id, booking_date, start_time, hours, customer_name, customer_phone, guests, items[] | เช็ก: ต้นชั่วโมง, 1–4 ชั่วโมง, ไม่ข้ามช่วงปิด, ห้องว่างทุกชั่วโมง (BR-12), คนไม่เกิน 15, ยอด pre-order ≥ 3,000฿ (BR-13) · มัดจำ = 50% ของยอด | staff+ [จอง VIP] | FR-33 | P3 | 4 |
| /api/vip_bookings | POST confirm_deposit | id | สถานะ → confirmed + บันทึกคนรับมัดจำ | staff+ [จอง VIP] | FR-34 | P3 | 4 |
| /api/vip_bookings | POST update_preorder | id, items[] | แก้ได้ถึงก่อนวันจอง 1 วัน (BR-15) · ยอดใหม่ต้องยัง ≥ ขั้นต่ำ | staff+ [จอง VIP] | FR-35 | P3 | 4 |
| /api/vip_bookings | POST arrive | id | เปิดบิลห้อง VIP (ตรรกะเดียวกับ /api/bills open) + ส่ง pre-order เป็นออเดอร์รอบที่ 1 | staff+ [จอง VIP] | FR-36 | P3 | 4 |
| /api/vip_bookings | POST no_show / cancel | id | ห้องกลับเป็นว่าง · มัดจำไม่คืน (BR-16) · no_show กดได้หลังเลย 30 นาที | staff+ [จอง VIP] | FR-37 | P3 | 4 |

ค่าขั้นต่ำ มัดจำ และชั่วโมงสูงสุด อ่านจาก `shop_settings` (vip_min_spend, vip_deposit_percent, vip_max_hours) ห้ามเขียนตัวเลขตายตัวในโค้ด

## 7. สมาชิก แต้ม คูปอง

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/members | POST request_otp | phone | รหัส OTP (จำลอง: ส่งกลับมาแสดงบนจอ เก็บใน session) | สาธารณะ | FR-38 | P3 | 2 |
| /api/members | POST register | phone, otp, name, birth_date | สมาชิกใหม่ + **แจกคูปองต้อนรับเข้าบัญชีอัตโนมัติ** (FR-43) + ล็อกอินให้เลย | สาธารณะ | FR-38, 43 | P3 | 2 |
| /api/members | POST login / logout | phone, otp | session สมาชิก | สาธารณะ | FR-38 | P3 | 2 |
| /api/members | GET | action=me | แต้มคงเหลือ, ประวัติแต้ม, คูปองในบัญชี, ค่าบาร์โค้ด, เตือน "แต้มจะหมดอายุ 31 ธ.ค." ตั้งแต่ 1 ธ.ค. | สมาชิก | FR-39 | P3 | 2 |
| /api/rewards | GET | — | รางวัลที่ใช้งาน | พนักงาน | FR-41 | P3 | 1 |
| /api/rewards | POST create / update / deactivate | name, points_cost, reward_type, menu_item_id, discount_value | — | manager+ | FR-41 | P3 | 1 |
| /api/coupons | GET | — · `?code=` = เช็กคูปองใบเดียว | คูปองทั้งหมด / ใช้ได้หรือไม่ + เหตุผล | manager+ / staff+ [รับเงิน] | FR-42 | P3 | 6 |
| /api/coupons | POST create / update / deactivate | code, coupon_type, value, free_menu_item_id, min_spend, start_date, end_date, valid_time_start, valid_time_end, **valid_weekdays**, **exclude_holidays**, member_only, usage_limit, per_member_limit | 1 บิลใช้ได้ 1 ใบ (BR-23) · เช็กวันในสัปดาห์ ช่วงเวลา และวันหยุดราชการ (BR-27) | manager+ | FR-42 | P3 | 6 |
| /api/tasks | POST birthday_coupons | month | แจกคูปองเดือนเกิดเข้าบัญชีสมาชิกที่เกิดเดือนนั้น (ไม่แจกซ้ำในเดือนเดียวกัน) | owner | FR-43 | P3 | 1 |
| /api/tasks | POST year_end_reset | — | ตั้งแต้มทุกคนเป็น 0 + บันทึก expire (BR-21) | owner | FR-44 | P3 | 1 |

`valid_weekdays`: 1 = จันทร์ ... 7 = อาทิตย์ เช่น Happy Hour = `"1,2,3,4,5"` + `exclude_holidays = 1` + 10:00–12:00 (มีในฐานข้อมูลเป็นค่าตั้งต้นแล้ว โค้ด `HAPPYHOUR`)

## 8. งานผู้จัดการและเจ้าของร้าน

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/dashboard | GET | — | P1: โต๊ะที่มีลูกค้า, เมนูที่ปิดขาย, พนักงานที่ใช้งาน · P2+: ยอดขายวันนี้, เมนูใกล้หมด · P3+: การจองห้อง VIP วันนี้ · P4: วัตถุดิบต่ำกว่าจุดสั่งซื้อซ้ำ | manager+ | FR-47, 57 | P1 → P4 | 7 |
| /api/prep_plans | GET | date | แต่ละเมนู: ขายได้วันนี้, เฉลี่ยวันเดียวกัน 4 สัปดาห์ก่อน, ยอดแนะนำ +10% (BR-24) | manager+ | FR-45 | P4 | 3 |
| /api/prep_plans | POST confirm | date, items[{menu_item_id, confirmed_qty}] | ยอดที่ยืนยัน = จำนวนพร้อมขายเริ่มต้นของวันนั้น | manager+ | FR-46 | P4 | 3 |
| /api/reports | GET | from, to | ยอดรวม, ยอดต่อเมนู, ยอดต่อวิธีชำระ, จำนวนบิล | manager+ | — | P4 | 1 |
| /api/logs | GET | level, user_id, from, to | ผู้จัดการเห็นเฉพาะ operation · เจ้าของร้านเห็นทั้งหมด | manager+ | FR-51 | P2 | 1 |

## 9. จัดซื้อและสต็อกวัตถุดิบ

| API | Method / action | ส่งอะไร | ได้อะไร / กติกา | ใครเรียกได้ | FR | เฟส | คน |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/suppliers | GET | — · `?ingredient_id=` = เทียบราคาทุกเจ้า | ซัพพลายเออร์ / ราคาเรียงจากถูกไปแพง | manager+ | FR-54, 55 | P4 | 2 |
| /api/suppliers | POST create / update / deactivate | name, contact_name, phone, line_id, lead_time_days | — | manager+ | FR-54 | P4 | 2 |
| /api/suppliers | POST set_price | supplier_id, ingredient_id, price, quoted_at | บันทึกราคาจากใบเสนอราคา (ทับราคาเก่า) | manager+ | FR-55 | P4 | 2 |
| /api/ingredients | GET | q, low_stock=1 | วัตถุดิบ + คงเหลือ + ต่ำกว่าจุดสั่งซื้อซ้ำหรือไม่ | manager+ | FR-56, 57 | P4 | 1 |
| /api/ingredients | POST create / update / deactivate | name, unit, reorder_point | — | manager+ | FR-56 | P4 | 1 |
| /api/purchase_orders | GET | status · `?id=` = PO เดียว + รายการ | รายการ PO | manager+ | FR-58 | P4 | 5 |
| /api/purchase_orders | POST create / update | supplier_id, expected_date, note, items[{ingredient_id, qty, unit_price}] | สถานะ draft · แก้ได้เฉพาะ draft · ราคาตั้งต้นดึงจาก supplier_prices | manager+ | FR-58 | P4 | 5 |
| /api/purchase_orders | POST send / cancel | id | send → สถานะ sent + ข้อความสำหรับคัดลอกส่ง LINE · ไม่ต้องรออนุมัติ | manager+ | FR-58 | P4 | 5 |
| /api/goods_receipts | POST create | form-data: po_id, items[{ingredient_id, qty, expiry_date}], invoice_no, invoice_amount, invoice_image | บันทึกรับของ + stock_movements แบบ receive + บวกคงเหลือ + PO → received | manager+ | FR-59 | P4 | 6 |
| /api/goods_receipts | GET | unpaid=1 | รายการรับของ / ที่ยังไม่จ่าย | manager+ | FR-59, 60 | P4 | 6 |
| /api/goods_receipts | POST mark_paid | id, paid_at | บันทึกจ่ายเงินแล้ว | manager+ | FR-60 | P4 | 6 |
| /api/stock | POST adjust | ingredient_id, counted_qty หรือ qty, movement_type (use / waste / adjust), note | นับปลายวัน: ส่ง counted_qty ระบบบันทึกส่วนต่างเป็น use | manager+ | FR-61 | P4 | 4 |
| /api/stock | GET | ingredient_id, from, to | ประวัติความเคลื่อนไหวสต็อก | manager+ | FR-61 | P4 | 4 |

---

## สรุปตามเฟส

| เฟส | API ที่ต้องทำ |
| --- | --- |
| **P1** | auth ✅, roles, users, settings, holidays, categories, menus (ยกเว้น add_stock/set_stock), tables, vip_rooms, bills (open, cancel, GET open), public (home, menu), dashboard |
| **P2** | menus (add_stock, set_stock), bills (detail, void, search), queue, public (bill_status), orders, kitchen, checkout (แบบไม่มีสมาชิก), shifts, logs |
| **P3** | members, rewards, coupons, checkout (สมาชิก แต้ม คูปอง), vip_bookings, tasks |
| **P4** | prep_plans, reports, suppliers, ingredients, purchase_orders, goods_receipts, stock, dashboard (ส่วนวัตถุดิบ) |
