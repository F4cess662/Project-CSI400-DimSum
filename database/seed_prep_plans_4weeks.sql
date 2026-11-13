-- =========================================================
-- ข้อมูล Mockup ย้อนหลัง 35 วันครบทุกวัน สำหรับหน้า "แผนเตรียมของ" (UC-40 / FR-45, 46 / BR-24)
-- รองรับฐานข้อมูลที่ Import จาก database/dimsum (3).sql
--
-- จุดเด่น:
-- 1. สร้างบิลและยอดขายที่เสร็จสิ้นแล้ว (status = 'paid' / 'done') ย้อนหลังครบทุกวัน (0 ถึง 35 วันก่อน = 36 วันเต็ม)
--    ทำให้ไม่ว่าจะกดเลือกวันที่ไหนในปฏิทินหน้า "แผนเตรียมของ" (วันจันทร์–อาทิตย์ วันนี้ เมื่อวาน หรือสัปดาห์หน้า)
--    จะมีข้อมูลยอดขายย้อนหลัง 4 สัปดาห์ (W1, W2, W3, W4), ค่าเฉลี่ย 4 สัปดาห์ และยอดแนะนำ (+10% ปัดขึ้น) เสมอ ไม่เป็น 0!
-- 2. บันทึกค่าเริ่มต้นลงในตาราง prep_plans ล่วงหน้า (ตั้งแต่ 7 วันก่อน ถึง 7 วันข้างหน้า)
--    เพื่อให้หน้า "ยอดเตรียมวันนี้" (prep-today.html) มีข้อมูลแสดงทันทีตั้งแต่เปิดเซิร์ฟเวอร์
-- =========================================================
SET NAMES utf8mb4;

SET @owner_id = COALESCE((SELECT id FROM users WHERE username = 'owner' LIMIT 1), 1);
SET @chef_id  = COALESCE((SELECT id FROM users WHERE username = 'ahmei' LIMIT 1), @owner_id);

-- 1. ลบข้อมูลทดสอบชุดเก่าก่อน (กรณีรันซ้ำจะได้ไม่ซ้ำซ้อน)
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

-- 2. สร้างตารางชั่วคราวเก็บตัวเลขวันย้อนหลัง d = 0..35 (ครอบคลุม 5 สัปดาห์เต็มทุกวันในสัปดาห์)
DROP TEMPORARY TABLE IF EXISTS tmp_days;
CREATE TEMPORARY TABLE tmp_days (d INT PRIMARY KEY);
INSERT INTO tmp_days (d) VALUES
  (0),(1),(2),(3),(4),(5),(6),
  (7),(8),(9),(10),(11),(12),(13),
  (14),(15),(16),(17),(18),(19),(20),
  (21),(22),(23),(24),(25),(26),(27),
  (28),(29),(30),(31),(32),(33),(34),(35);

-- 3. สร้างบิลที่ชำระเงินแล้ว (paid) สำหรับทุกวันย้อนหลัง 36 วัน
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

-- 4. สร้างออเดอร์รอบที่ 1 ของแต่ละบิล
INSERT INTO orders (bill_id, round_no, source, created_by, created_at)
SELECT id, 1, 'qr', NULL, opened_at
  FROM bills
 WHERE bill_no LIKE 'B-HIST-D%';

-- 5. สร้างรายการขาย (order_items) ของทุกเมนูในทุกวันย้อนหลัง 36 วัน
--    ตัวเลขจะแปรผันตามขนาดล็อต (lot_size) รหัสเมนู และวัน เพื่อให้ค่าเฉลี่ยแต่ละสัปดาห์ดูสมจริงและไม่เป็น 0
INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status, cancelled_qty, stock_taken, updated_by, updated_at)
SELECT o.id,
       m.id,
       CASE
         WHEN DATE(o.created_at) = CURDATE() THEN GREATEST(2, m.lot_size * 2 + (m.id MOD 4))
         ELSE GREATEST(
           3,
           m.lot_size * (2 + ((m.id + DATEDIFF(CURDATE(), DATE(o.created_at))) MOD 3))
           + ((m.id * 3 + DATEDIFF(CURDATE(), DATE(o.created_at))) MOD 5)
         )
       END AS qty,
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

-- 6. อัปเดตยอดรวมในบิลย้อนหลังให้ตรงกับรายการอาหาร
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

-- 7. คำนวณและบันทึก suggested_qty ลงตาราง prep_plans ล่วงหน้าสำหรับช่วงวันที่ (CURDATE() - 7 วัน ถึง CURDATE() + 7 วัน)
--    เพื่อให้กดดูวันไหนหรือเปิดหน้า "ยอดเตรียมวันนี้" ก็มีข้อมูลขึ้นทันที
DROP TEMPORARY TABLE IF EXISTS tmp_plan_dates;
CREATE TEMPORARY TABLE tmp_plan_dates (plan_date DATE PRIMARY KEY);
INSERT INTO tmp_plan_dates (plan_date)
SELECT DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 7 DAY), INTERVAL d DAY)
  FROM tmp_days
 WHERE d <= 14;

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

DROP TEMPORARY TABLE IF EXISTS tmp_plan_dates;
DROP TEMPORARY TABLE IF EXISTS tmp_days;