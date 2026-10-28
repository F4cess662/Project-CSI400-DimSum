-- =========================================================
-- ข้อมูลตัวอย่างร้านนึ่งสุข (import หลัง database/dimsum_schema.sql)
-- import ซ้ำได้ ไม่เกิดข้อมูลซ้ำ
-- =========================================================
SET NAMES utf8mb4;
USE dimsum;

-- ---------------------------------------------------------
-- 1) เมนู (คนที่ 3 กำหนด) — ห้ามแก้ส่วนนี้ ถ้าจะเปลี่ยนเมนูแจ้งคนที่ 3
--    โซนครัว: steam = นึ่ง · fry = ทอด · congee_noodle = โจ๊ก-เส้น/จานหลักบนเตา · drink_dessert = เครื่องดื่ม-ของหวาน
--    lot_size = 1 ล็อตทำได้กี่หน่วย · available_qty = จำนวนพร้อมขายเริ่มต้นสำหรับทดสอบ
-- ---------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS seed_menu;
CREATE TEMPORARY TABLE seed_menu (
  category VARCHAR(100), name VARCHAR(100), description VARCHAR(255),
  price DECIMAL(10,2), unit VARCHAR(20), kitchen_zone VARCHAR(20), lot_size INT, available_qty INT
);

INSERT INTO seed_menu VALUES
  -- ซาลาเปา
  ('ซาลาเปา', 'ซาลาเปาหมูสับ',          'ไส้คลาสสิก',            30, 'ลูก',  'steam', 10, 40),
  ('ซาลาเปา', 'ซาลาเปาหมูแดง',          'ไส้คลาสสิก',            30, 'ลูก',  'steam', 10, 40),
  ('ซาลาเปา', 'ซาลาเปาครีม',            'ไส้คลาสสิก',            30, 'ลูก',  'steam', 10, 40),
  ('ซาลาเปา', 'ซาลาเปาถั่วแดง',         'ไส้คลาสสิก',            30, 'ลูก',  'steam', 10, 40),
  ('ซาลาเปา', 'ซาลาเปาเห็ดหอม',         'มังสวิรัติ',             30, 'ลูก',  'steam', 10, 30),
  ('ซาลาเปา', 'ซาลาเปาหมูสับไข่เค็ม',    'พรีเมียม',               39, 'ลูก',  'steam', 10, 30),
  ('ซาลาเปา', 'ซาลาเปาไข่เค็มลาวาทอด',  'แป้งกรอบนอก เยิ้มใน',    39, 'ลูก',  'fry',   10, 30),
  ('ซาลาเปา', 'เสี่ยวหลงเปา',           'เข่งละ 3 ชิ้น',           59, 'เข่ง', 'steam',  5, 20),
  -- ขนมจีบ
  ('ขนมจีบ', 'ขนมจีบหมู',               'เข่งละ 3–4 ชิ้น',         45, 'เข่ง', 'steam',  5, 40),
  ('ขนมจีบ', 'ขนมจีบกุ้ง',              'เข่งละ 3–4 ชิ้น',         59, 'เข่ง', 'steam',  5, 30),
  ('ขนมจีบ', 'ขนมจีบปู',                'เข่งละ 3–4 ชิ้น',         65, 'เข่ง', 'steam',  5, 30),
  ('ขนมจีบ', 'ขนมจีบเห็ดหอมวุ้นเส้น',    'มังสวิรัติ เข่งละ 3–4 ชิ้น', 45, 'เข่ง', 'steam',  5, 30),
  -- ห่อสาหร่าย
  ('ห่อสาหร่าย', 'หมูห่อสาหร่าย',        'เข่งละ 3–4 ชิ้น',         45, 'เข่ง', 'steam',  5, 30),
  ('ห่อสาหร่าย', 'กุ้งห่อสาหร่าย',       'เข่งละ 3–4 ชิ้น',         59, 'เข่ง', 'steam',  5, 30),
  ('ห่อสาหร่าย', 'ปูห่อสาหร่าย',         'เข่งละ 3–4 ชิ้น',         65, 'เข่ง', 'steam',  5, 30),
  -- ฮะเก๋า
  ('ฮะเก๋า', 'ฮะเก๋ากุ้ง',               'เข่งละ 3–4 ชิ้น',         59, 'เข่ง', 'steam',  5, 40),
  ('ฮะเก๋า', 'ฮะเก๋าปู',                 'เข่งละ 3–4 ชิ้น',         65, 'เข่ง', 'steam',  5, 30),
  -- เมนูจานหลัก
  ('เมนูจานหลัก', 'ก๋วยเตี๋ยวหลอดหมูสับ',  NULL,                     65, 'จาน',  'congee_noodle', 1, 30),
  ('เมนูจานหลัก', 'ขาไก่นึ่งเต้าซี่น้ำแดง', NULL,                     69, 'จาน',  'steam',         5, 30),
  ('เมนูจานหลัก', 'ขาไก่ต้มน้ำแดง',        NULL,                     69, 'จาน',  'congee_noodle', 5, 30),
  ('เมนูจานหลัก', 'ซี่โครงหมูน้ำแดง',      NULL,                     79, 'จาน',  'congee_noodle', 5, 30),
  ('เมนูจานหลัก', 'บักกุ๊ดเต๊หม้อดิน',      'กระดูกหมูตุ๋นยาจีนเข้มข้น', 129, 'หม้อ', 'congee_noodle', 1, 20),
  ('เมนูจานหลัก', 'ปลากระพงนึ่งซีอิ๊ว',     NULL,                    149, 'จาน',  'steam',         1, 20),
  -- เมนูทอด (เสิร์ฟพร้อมน้ำจิ้มบ๊วยหรืออาจาด)
  ('เมนูทอด', 'ขนมผักกาดทอด',            'จานละ 3 ชิ้น',            55, 'จาน',  'fry', 5, 30),
  ('เมนูทอด', 'เผือกทอด',                'จานละ 3 ชิ้น',            59, 'จาน',  'fry', 5, 30),
  ('เมนูทอด', 'ถุงทองมังกรหยก',          'จานละ 3 ชิ้น',            59, 'จาน',  'fry', 5, 30),
  ('เมนูทอด', 'ฟองเต้าหู้ทอด',            'จานละ 3 ชิ้น',            65, 'จาน',  'fry', 5, 30),
  ('เมนูทอด', 'ขนมปังหน้ากุ้งซอสไข่เค็ม', 'เมนูซิกเนเจอร์ จานละ 3 ชิ้น', 69, 'จาน',  'fry', 5, 30),
  -- หมี่หยก
  ('หมี่หยก', 'หมี่หยกพันกุ้ง',            'เข่งละ 3–4 ชิ้น',         55, 'เข่ง', 'steam', 5, 30),
  ('หมี่หยก', 'หมี่หยกพันไข่เค็ม',         'เข่งละ 3–4 ชิ้น',         49, 'เข่ง', 'steam', 5, 30),
  -- ชุดเซ็ต (ระบบยังไม่รองรับการเลือกของในเซ็ต ลูกค้าแจ้งพนักงานเอง)
  ('ชุดเซ็ต', 'Set A: Single Delight',
     '1 ท่าน · ก๋วยเตี๋ยวหลอดหมูสับ/ซี่โครงหมูน้ำแดง + ขนมจีบหมู/กุ้ง + ซาลาเปา 1 ลูก', 139, 'ชุด', 'congee_noodle', 1, 20),
  ('ชุดเซ็ต', 'Set B: Duo Signature',
     '2 ท่าน · บักกุ๊ดเต๊/ปลากระพง + ฮะเก๋ากุ้ง + ขนมจีบปู/กุ้งห่อสาหร่าย + ของทอด 1 + ซาลาเปาไข่เค็ม 2 ลูก', 319, 'ชุด', 'congee_noodle', 1, 20),
  ('ชุดเซ็ต', 'Set C: Family & Gathering',
     '3–4 ท่าน · จานหลัก 2 + ติ่มซำนึ่ง 3 + เสี่ยวหลงเปา + ของทอด 1 + ซาลาเปารวม 4 ลูก', 549, 'ชุด', 'congee_noodle', 1, 20);

INSERT INTO menu_items (category_id, name, description, price, unit, kitchen_zone, lot_size, available_qty)
SELECT c.id, s.name, s.description, s.price, s.unit, s.kitchen_zone, s.lot_size, s.available_qty
FROM seed_menu s
JOIN menu_categories c ON c.name = s.category
WHERE NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.name = s.name);

-- เมนูที่หมดไว้ทดสอบหน้าจอ "หมด"
UPDATE menu_items SET available_qty = 0, is_available = 0 WHERE name = 'เสี่ยวหลงเปา';

DROP TEMPORARY TABLE seed_menu;

-- ---------------------------------------------------------
-- 1.5) แบนเนอร์หน้า Home (สไลด์) — ต้องมีตาราง banners (import schema ไว้ก่อน 27 ต.ค. ให้รัน database/add_banners.sql ก่อน)
--      รูปที่ 2–4 เป็นรูปทดสอบจากเว็บอื่น ผู้จัดการปิด/ลบได้จากหน้าแบนเนอร์
-- ---------------------------------------------------------
INSERT INTO banners (title, image_path, sort_order, is_active)
SELECT b.title, b.image_path, b.sort_order, 1 FROM (
  SELECT 'เมนู Special' AS title, '/assets/img/banners/special-menu.webp' AS image_path, 1 AS sort_order
  UNION ALL SELECT 'รูปทดสอบ 1', 'https://www.regent-holidays.co.uk/upload-files/blog-sections/section-214_1975.jpg', 2
  UNION ALL SELECT 'รูปทดสอบ 2', 'https://res.klook.com/image/upload/q_85/c_fill,w_750/v1674030135/blog/bnbtltnp5nqbdevfcbmn.jpg', 3
  UNION ALL SELECT 'รูปทดสอบ 3', 'https://www.nippon.com/en/ncommon/contents/guide-to-japan/133214/133214.jpg', 4
) b
WHERE NOT EXISTS (SELECT 1 FROM banners x WHERE x.image_path = b.image_path);

-- ---------------------------------------------------------
-- 2) ข้อมูลอื่น (เพิ่มต่อจากตรงนี้)
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- 2) ข้อมูลตัวอย่างเพิ่มเติม (คนที่ 1) — import ซ้ำได้
--    หมายเหตุ: ให้รัน node scripts/seed-users.js ก่อน หรือรัน seed.sql ซ้ำ
--    หลังสร้างผู้ใช้แล้ว เพื่อให้บิลตัวอย่าง T05 ถูกสร้างครบ
-- ---------------------------------------------------------

-- 2.1 สมาชิกตัวอย่าง
INSERT INTO members (phone, name, tier, points_balance)
VALUES ('0812345678', 'มะลิ รักดี', 'gold', 320)
ON DUPLICATE KEY UPDATE name = VALUES(name), tier = VALUES(tier), points_balance = VALUES(points_balance);

-- 2.2 คูปองตัวอย่าง: WELCOME20 ลด 20% และ BDAY ลด 15% ในวันเกิด
INSERT INTO coupons
  (code, coupon_type, value, min_spend, start_date, end_date, member_only, is_active)
VALUES
  ('WELCOME20', 'percent', 20, 100, '2026-01-01', '2099-12-31', 1, 1),
  ('BDAY', 'percent', 15, 0, '2026-01-01', '2099-12-31', 1, 1)
ON DUPLICATE KEY UPDATE
  coupon_type = VALUES(coupon_type), value = VALUES(value), min_spend = VALUES(min_spend),
  start_date = VALUES(start_date), end_date = VALUES(end_date), member_only = VALUES(member_only), is_active = VALUES(is_active);

-- ผูกคูปองตัวอย่างเข้าบัญชีสมาชิกเพื่อทดสอบหน้าเช็กเอาต์
INSERT INTO member_coupons (member_id, coupon_id, expires_at)
SELECT m.id, c.id, '2099-12-31'
FROM members m
JOIN coupons c ON c.code IN ('WELCOME20', 'BDAY')
WHERE m.phone = '0812345678'
  AND NOT EXISTS (
    SELECT 1 FROM member_coupons mc
    WHERE mc.member_id = m.id AND mc.coupon_id = c.id AND mc.used_at IS NULL
  );

-- 2.3 รางวัลแลกแต้ม 2 รายการ (รางวัลของฟรีอ้างเมนูด้วยชื่อ ไม่เดา ID)
INSERT INTO rewards (name, points_cost, reward_type, menu_item_id, is_active)
SELECT 'ฟรีซาลาเปาครีม', 100, 'free_item', mi.id, 1
FROM menu_items mi
WHERE mi.name = 'ซาลาเปาครีม'
  AND NOT EXISTS (SELECT 1 FROM rewards r WHERE r.name = 'ฟรีซาลาเปาครีม');

INSERT INTO rewards (name, points_cost, reward_type, discount_value, is_active)
SELECT 'ส่วนลด 20 บาท', 150, 'discount', 20, 1
WHERE NOT EXISTS (SELECT 1 FROM rewards r WHERE r.name = 'ส่วนลด 20 บาท');

-- 2.4 วันหยุดราชการไทย ปี พ.ศ. 2569 (ค.ศ. 2026) สำหรับทดสอบเงื่อนไขคูปอง
-- เป็นชุดข้อมูลตัวอย่าง ให้ตรวจสอบประกาศวันหยุดของหน่วยงานก่อนนำไปใช้งานจริง
INSERT INTO public_holidays (holiday_date, name) VALUES
  ('2026-01-01', 'วันขึ้นปีใหม่'),
  ('2026-01-02', 'วันหยุดพิเศษช่วงเทศกาลปีใหม่'),
  ('2026-03-03', 'วันมาฆบูชา'),
  ('2026-04-06', 'วันจักรี'),
  ('2026-04-13', 'วันสงกรานต์'),
  ('2026-04-14', 'วันสงกรานต์'),
  ('2026-04-15', 'วันสงกรานต์'),
  ('2026-05-01', 'วันแรงงานแห่งชาติ'),
  ('2026-05-04', 'วันฉัตรมงคล'),
  ('2026-05-31', 'วันวิสาขบูชา'),
  ('2026-06-01', 'วันหยุดชดเชยวันวิสาขบูชา'),
  ('2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
  ('2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
  ('2026-07-29', 'วันอาสาฬหบูชา'),
  ('2026-07-30', 'วันเข้าพรรษา'),
  ('2026-08-12', 'วันแม่แห่งชาติ'),
  ('2026-10-13', 'วันนวมินทรมหาราช'),
  ('2026-10-23', 'วันปิยมหาราช'),
  ('2026-12-05', 'วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9'),
  ('2026-12-07', 'วันหยุดชดเชยวันพ่อแห่งชาติ'),
  ('2026-12-10', 'วันรัฐธรรมนูญ'),
  ('2026-12-31', 'วันสิ้นปี')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 2.5 วัตถุดิบตัวอย่าง 6 รายการ
INSERT INTO ingredients (name, unit, qty_on_hand, reorder_point, is_active)
SELECT x.name, x.unit, x.qty_on_hand, x.reorder_point, 1
FROM (
  SELECT 'แป้งสาลี' AS name, 'กก.' AS unit, 25.00 AS qty_on_hand, 10.00 AS reorder_point
  UNION ALL SELECT 'หมูสับ', 'กก.', 8.00, 5.00
  UNION ALL SELECT 'กุ้ง', 'กก.', 6.00, 3.00
  UNION ALL SELECT 'แป้งซาลาเปา', 'กก.', 15.00, 5.00
  UNION ALL SELECT 'น้ำมันพืช', 'ลิตร', 12.00, 4.00
  UNION ALL SELECT 'น้ำตาล', 'กก.', 10.00, 3.00
) x
WHERE NOT EXISTS (SELECT 1 FROM ingredients i WHERE i.name = x.name);

-- 2.6 ซัพพลายเออร์ 4 ราย
INSERT INTO suppliers (name, contact_name, phone, line_id, lead_time_days, is_active)
SELECT x.name, x.contact_name, NULL, x.line_id, x.lead_time_days, 1
FROM (
  SELECT 'ตลาดสดเจริญกรุง' AS name, 'ฝ่ายขาย' AS contact_name, 'charoenkrung_market' AS line_id, 1 AS lead_time_days
  UNION ALL SELECT 'วัตถุดิบเอเชีย', 'ฝ่ายขาย', 'asia_ingredients', 2
  UNION ALL SELECT 'ฟู้ดเซอร์วิส กรุงเทพ', 'ฝ่ายขาย', 'foodservice_bkk', 2
  UNION ALL SELECT 'แป้งดี ซัพพลาย', 'ฝ่ายขาย', 'pangdee_supply', 3
) x
WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = x.name);

-- ราคาเสนอซื้อจากซัพพลายเออร์ (ทุกเจ้ามีราคาทดสอบสำหรับวัตถุดิบทั้ง 6 รายการ)
INSERT INTO supplier_prices (supplier_id, ingredient_id, price, quoted_at)
SELECT s.id, i.id,
  CASE s.name
    WHEN 'ตลาดสดเจริญกรุง' THEN CASE i.name WHEN 'แป้งสาลี' THEN 32 WHEN 'หมูสับ' THEN 145 WHEN 'กุ้ง' THEN 260 WHEN 'แป้งซาลาเปา' THEN 38 WHEN 'น้ำมันพืช' THEN 48 ELSE 28 END
    WHEN 'วัตถุดิบเอเชีย' THEN CASE i.name WHEN 'แป้งสาลี' THEN 34 WHEN 'หมูสับ' THEN 150 WHEN 'กุ้ง' THEN 250 WHEN 'แป้งซาลาเปา' THEN 36 WHEN 'น้ำมันพืช' THEN 46 ELSE 29 END
    WHEN 'ฟู้ดเซอร์วิส กรุงเทพ' THEN CASE i.name WHEN 'แป้งสาลี' THEN 30 WHEN 'หมูสับ' THEN 155 WHEN 'กุ้ง' THEN 270 WHEN 'แป้งซาลาเปา' THEN 40 WHEN 'น้ำมันพืช' THEN 45 ELSE 27 END
    ELSE CASE i.name WHEN 'แป้งสาลี' THEN 31 WHEN 'หมูสับ' THEN 148 WHEN 'กุ้ง' THEN 255 WHEN 'แป้งซาลาเปา' THEN 35 WHEN 'น้ำมันพืช' THEN 47 ELSE 26 END
  END,
  '2026-10-01'
FROM suppliers s
CROSS JOIN ingredients i
WHERE s.name IN ('ตลาดสดเจริญกรุง', 'วัตถุดิบเอเชีย', 'ฟู้ดเซอร์วิส กรุงเทพ', 'แป้งดี ซัพพลาย')
  AND i.name IN ('แป้งสาลี', 'หมูสับ', 'กุ้ง', 'แป้งซาลาเปา', 'น้ำมันพืช', 'น้ำตาล')
ON DUPLICATE KEY UPDATE price = VALUES(price), quoted_at = VALUES(quoted_at);

-- 2.7 ตั้งค่าร้าน
UPDATE shop_settings
SET shop_name = 'นึ่งสุข',
    address = '99/9 ถนนเจริญกรุง แขวงสัมพันธวงศ์ เขตสัมพันธวงศ์ กรุงเทพฯ 10100'
WHERE id = 1;

-- 2.8 บิลตัวอย่างโต๊ะ T05 + ออเดอร์ 2 รอบ (source=QR, สถานะรายการคละกัน)
-- หากยังไม่ได้รัน seed-users.js ส่วนนี้จะไม่เพิ่มบิล; รัน seed-users.js แล้วรัน seed.sql ซ้ำได้
INSERT INTO bills (bill_no, status, guests, qr_token, opened_by, subtotal, total_paid)
SELECT 'DEMO-T05-2026', 'open', 2, 'demo-token-t05', u.id, 0, 0
FROM users u
JOIN dining_tables t ON t.code = 'T05'
WHERE u.username = 'wipa'
  AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.qr_token = 'demo-token-t05');

INSERT INTO bill_tables (bill_id, table_id)
SELECT b.id, t.id
FROM bills b
JOIN dining_tables t ON t.code = 'T05'
WHERE b.qr_token = 'demo-token-t05'
  AND NOT EXISTS (SELECT 1 FROM bill_tables bt WHERE bt.bill_id = b.id AND bt.table_id = t.id);

UPDATE dining_tables t
JOIN bill_tables bt ON bt.table_id = t.id
JOIN bills b ON b.id = bt.bill_id
SET t.status = 'occupied'
WHERE t.code = 'T05' AND b.qr_token = 'demo-token-t05' AND b.status = 'open';

INSERT INTO orders (bill_id, round_no, source, created_by)
SELECT b.id, 1, 'qr', NULL FROM bills b
WHERE b.qr_token = 'demo-token-t05'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.bill_id = b.id AND o.round_no = 1);

INSERT INTO orders (bill_id, round_no, source, created_by)
SELECT b.id, 2, 'qr', NULL FROM bills b
WHERE b.qr_token = 'demo-token-t05'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.bill_id = b.id AND o.round_no = 2);

INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status)
SELECT o.id, m.id, 2, m.price, 'cooking'
FROM orders o JOIN bills b ON b.id = o.bill_id JOIN menu_items m ON m.name = 'ขนมจีบหมู'
WHERE b.qr_token = 'demo-token-t05' AND o.round_no = 1
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.menu_item_id = m.id);

INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status)
SELECT o.id, m.id, 1, m.price, 'ready'
FROM orders o JOIN bills b ON b.id = o.bill_id JOIN menu_items m ON m.name = 'ซาลาเปาหมูสับ'
WHERE b.qr_token = 'demo-token-t05' AND o.round_no = 1
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.menu_item_id = m.id);

INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status)
SELECT o.id, m.id, 1, m.price, 'waiting'
FROM orders o JOIN bills b ON b.id = o.bill_id JOIN menu_items m ON m.name = 'ขนมจีบกุ้ง'
WHERE b.qr_token = 'demo-token-t05' AND o.round_no = 2
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.menu_item_id = m.id);

INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status)
SELECT o.id, m.id, 2, m.price, 'done'
FROM orders o JOIN bills b ON b.id = o.bill_id JOIN menu_items m ON m.name = 'ซาลาเปาครีม'
WHERE b.qr_token = 'demo-token-t05' AND o.round_no = 2
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.menu_item_id = m.id);

UPDATE bills b
SET b.subtotal = (
  SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
  FROM orders o JOIN order_items oi ON oi.order_id = o.id
  WHERE o.bill_id = b.id AND oi.status <> 'cancelled'
)
WHERE b.qr_token = 'demo-token-t05' AND b.status = 'open';
