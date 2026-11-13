-- =========================================================
-- ข้อมูล Mockup ย้อนหลัง 35 วันครบทุกวัน สำหรับหน้า "แผนเตรียมของ" (UC-40 / FR-45, 46 / BR-24)
-- รองรับฐานข้อมูลที่ Import จาก database/dimsum (3).sql (รวมถึงเมนูที่เพิ่งเพิ่มใหม่ เช่น หมวดเครื่องดื่ม)
--
-- จุดเด่น:
-- 1. สร้างบิลและยอดขายย้อนหลังเฉพาะวันในอดีต (d = 1 ถึง 35 วันก่อน = 5 สัปดาห์เต็ม ไม่สร้างบิลหลอกในวันนี้ d=0)
--    ทำให้หน้า "ยอดเตรียมวันนี้" (prep-today.html) ไม่มียอด "ทำแล้ว" หลอกในวันนี้
-- 2. คำนวณและบันทึกแผนเตรียมของลงตาราง prep_plans พร้อมซิงก์ค่าเริ่มต้นของวันนี้เข้ากับ menu_items.available_qty
--    ทำให้หน้า stock-today.html และ prep-today.html มีรายการเมนูและจำนวนตรงกันทุกเมนู 100%
-- =========================================================
SET NAMES utf8mb4;

SET @owner_id = COALESCE((SELECT id FROM users WHERE username = 'owner' LIMIT 1), 1);
SET @chef_id  = COALESCE((SELECT id FROM users WHERE username = 'ahmei' LIMIT 1), @owner_id);

-- 1. ลบข้อมูลทดสอบชุดเก่าก่อน (รวมถึง D00 ของวันนี้ที่เคยสร้างไว้)
DELETE oi FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN bills b  ON b.id = o.bill_id
WHERE b.bill_no LIKE 'B-HIST-%';

DELETE o FROM orders o
JOIN bills b ON b.id = o.bill_id
WHERE b.bill_no LIKE 'B-HIST-%';

DELETE bt FROM bill_tables bt
JOIN bills b ON b.id = bt.bill_id
WHERE b.bill_no LIKE 'B-HIST-%';

DELETE FROM bills WHERE bill_no LIKE 'B-HIST-%';

-- 2. สร้างตารางชั่วคราวเก็บตัวเลขวันย้อนหลัง d = 1..35 (ไม่รวมวันนี้ d=0 เพื่อไม่ให้ยอด "ทำแล้ว" วันนี้เพี้ยน)
DROP TEMPORARY TABLE IF EXISTS tmp_days;
CREATE TEMPORARY TABLE tmp_days (d INT PRIMARY KEY);
INSERT INTO tmp_days (d) VALUES
  (1),(2),(3),(4),(5),(6),(7),
  (8),(9),(10),(11),(12),(13),(14),
  (15),(16),(17),(18),(19),(20),(21),
  (22),(23),(24),(25),(26),(27),(28),
  (29),(30),(31),(32),(33),(34),(35);

-- 3. สร้างบิลที่ชำระเงินแล้ว (paid) สำหรับทุกวันย้อนหลัง 35 วัน
INSERT INTO bills (bill_no, status, guests, qr_token, opened_at, opened_by, closed_at, closed_by, payment_method, subtotal, total_paid)
SELECT CONCAT('B-HIST-D', LPAD(d, 2, '0')),
       'paid',
       4,
       CONCAT('hist-token-d', LPAD(d, 2, '0')),
       DATE_SUB(CURDATE(), INTERVAL d DAY) + INTERVAL 11 HOUR,
       @owner_id,
       DATE_SUB(CURDATE(), INTERVAL d DAY) + INTERVAL 12 HOUR,
       @owner_id,
       'cash',
       0,
       0
  FROM tmp_days;

-- 4. สร้างออเดอร์รอบที่ 1 ของแต่ละบิลย้อนหลัง
INSERT INTO orders (bill_id, round_no, source, created_by, created_at)
SELECT id, 1, 'qr', NULL, opened_at
  FROM bills
 WHERE bill_no LIKE 'B-HIST-D%';

-- 5. สร้างรายการขาย (order_items) ของทุกเมนูที่เปิดใช้งานอยู่ (รวมถึงเมนูเครื่องดื่มที่เพิ่งเพิ่ม)
INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status, cancelled_qty, stock_taken, updated_by, updated_at)
SELECT o.id,
       m.id,
       GREATEST(
         3,
         m.lot_size * (2 + ((m.id + DATEDIFF(CURDATE(), DATE(o.created_at))) MOD 3))
         + ((m.id * 3 + DATEDIFF(CURDATE(), DATE(o.created_at))) MOD 5)
       ) AS qty,
       m.price,
       'done',
       0,
       0,
       @chef_id,
       o.created_at + INTERVAL 25 MINUTE
  FROM orders o
  JOIN bills b ON b.id = o.bill_id
  CROSS JOIN menu_items m
 WHERE b.bill_no LIKE 'B-HIST-D%'
   AND m.is_deleted = 0;

-- 6. อัปเดตยอดรวมในบิลย้อนหลัง
UPDATE bills b
JOIN (
  SELECT o.bill_id, SUM(oi.qty * oi.unit_price) AS sub
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
   GROUP BY o.bill_id
) x ON x.bill_id = b.id
SET b.subtotal = x.sub,
    b.total_paid = x.sub
WHERE b.bill_no LIKE 'B-HIST-D%';

-- 7. คำนวณและบันทึก suggested_qty ลงตาราง prep_plans สำหรับช่วงวันที่ (CURDATE() - 7 วัน ถึง CURDATE() + 7 วัน)
DROP TEMPORARY TABLE IF EXISTS tmp_plan_dates;
CREATE TEMPORARY TABLE tmp_plan_dates (plan_date DATE PRIMARY KEY);
INSERT INTO tmp_plan_dates (plan_date)
VALUES
  (DATE_SUB(CURDATE(), INTERVAL 7 DAY)),
  (DATE_SUB(CURDATE(), INTERVAL 6 DAY)),
  (DATE_SUB(CURDATE(), INTERVAL 5 DAY)),
  (DATE_SUB(CURDATE(), INTERVAL 4 DAY)),
  (DATE_SUB(CURDATE(), INTERVAL 3 DAY)),
  (DATE_SUB(CURDATE(), INTERVAL 2 DAY)),
  (DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
  (CURDATE()),
  (DATE_ADD(CURDATE(), INTERVAL 1 DAY)),
  (DATE_ADD(CURDATE(), INTERVAL 2 DAY)),
  (DATE_ADD(CURDATE(), INTERVAL 3 DAY)),
  (DATE_ADD(CURDATE(), INTERVAL 4 DAY)),
  (DATE_ADD(CURDATE(), INTERVAL 5 DAY)),
  (DATE_ADD(CURDATE(), INTERVAL 6 DAY)),
  (DATE_ADD(CURDATE(), INTERVAL 7 DAY));

INSERT INTO prep_plans (plan_date, menu_item_id, suggested_qty)
SELECT pd.plan_date,
       m.id AS menu_item_id,
       CEIL(
         (
           COALESCE((
             SELECT SUM(oi.qty - oi.cancelled_qty)
               FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
               JOIN bills b  ON b.id = o.bill_id
              WHERE oi.menu_item_id = m.id
                AND o.cancelled_at IS NULL
                AND b.status <> 'cancelled'
                AND oi.status <> 'cancelled'
                AND DATE(o.created_at) IN (
                  DATE_SUB(pd.plan_date, INTERVAL 7 DAY),
                  DATE_SUB(pd.plan_date, INTERVAL 14 DAY),
                  DATE_SUB(pd.plan_date, INTERVAL 21 DAY),
                  DATE_SUB(pd.plan_date, INTERVAL 28 DAY)
                )
           ), 0) / 4.0
         ) * 1.1
       ) AS suggested_qty
  FROM tmp_plan_dates pd
  CROSS JOIN menu_items m
 WHERE m.is_deleted = 0
ON DUPLICATE KEY UPDATE
  suggested_qty = VALUES(suggested_qty);

-- 8. ซิงก์จำนวนพร้อมขายใน menu_items ให้ตรงกับเป้าหมายของวันนี้ใน prep_plans (เฉพาะเมนูที่เปิดขายอยู่)
UPDATE menu_items m
JOIN prep_plans p ON p.menu_item_id = m.id AND p.plan_date = CURDATE()
SET m.available_qty = COALESCE(p.confirmed_qty, p.suggested_qty)
WHERE m.is_deleted = 0 AND m.is_available = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_plan_dates;
DROP TEMPORARY TABLE IF EXISTS tmp_days;