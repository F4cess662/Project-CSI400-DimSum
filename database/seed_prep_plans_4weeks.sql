-- =========================================================
-- ข้อมูลทดสอบย้อนหลัง 4 สัปดาห์ สำหรับหน้า "แผนเตรียมของ" (UC-40 / FR-45, 46 / BR-24)
-- ใช้รันเพิ่มบนฐานข้อมูลที่ import จาก database/dimsum (3).sql
-- สร้างบิลและออเดอร์ที่เสร็จสิ้นแล้ว (status = 'paid' / 'done') ในวันเดียวกันของ 1, 2, 3 และ 4 สัปดาห์ก่อน
-- เพื่อให้ระบบคำนวณ "เฉลี่ย 4 สัปดาห์ก่อน + 10% (ปัดขึ้น)" ได้ทันทีตอนทดสอบ
-- =========================================================
SET NAMES utf8mb4;

SET @owner_id = COALESCE((SELECT id FROM users WHERE username = 'owner' LIMIT 1), 1);
SET @chef_id  = COALESCE((SELECT id FROM users WHERE username = 'ahmei' LIMIT 1), @owner_id);

-- ลบบิลทดสอบย้อนหลังชุดเดิมก่อน (ถ้ารันซ้ำ)
DELETE oi FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN bills b  ON b.id = o.bill_id
WHERE b.bill_no LIKE 'B-HIST-W%';

DELETE o FROM orders o
JOIN bills b ON b.id = o.bill_id
WHERE b.bill_no LIKE 'B-HIST-W%';

DELETE bt FROM bill_tables bt
JOIN bills b ON b.id = bt.bill_id
WHERE b.bill_no LIKE 'B-HIST-W%';

DELETE FROM bills WHERE bill_no LIKE 'B-HIST-W%';

-- สร้างบิลย้อนหลัง 4 สัปดาห์ (W1 = 7 วันก่อน, W2 = 14 วันก่อน, W3 = 21 วันก่อน, W4 = 28 วันก่อน)
INSERT INTO bills (bill_no, status, guests, qr_token, opened_at, opened_by, closed_at, closed_by, payment_method, subtotal, total_paid)
VALUES
  ('B-HIST-W1', 'paid', 4, 'hist-token-w1', DATE_SUB(CURDATE(), INTERVAL 7 DAY)  + INTERVAL 11 HOUR, @owner_id, DATE_SUB(CURDATE(), INTERVAL 7 DAY)  + INTERVAL 12 HOUR, @owner_id, 'cash', 0, 0),
  ('B-HIST-W2', 'paid', 4, 'hist-token-w2', DATE_SUB(CURDATE(), INTERVAL 14 DAY) + INTERVAL 11 HOUR, @owner_id, DATE_SUB(CURDATE(), INTERVAL 14 DAY) + INTERVAL 12 HOUR, @owner_id, 'cash', 0, 0),
  ('B-HIST-W3', 'paid', 4, 'hist-token-w3', DATE_SUB(CURDATE(), INTERVAL 21 DAY) + INTERVAL 11 HOUR, @owner_id, DATE_SUB(CURDATE(), INTERVAL 21 DAY) + INTERVAL 12 HOUR, @owner_id, 'cash', 0, 0),
  ('B-HIST-W4', 'paid', 4, 'hist-token-w4', DATE_SUB(CURDATE(), INTERVAL 28 DAY) + INTERVAL 11 HOUR, @owner_id, DATE_SUB(CURDATE(), INTERVAL 28 DAY) + INTERVAL 12 HOUR, @owner_id, 'cash', 0, 0);

INSERT INTO orders (bill_id, round_no, source, created_by, created_at)
SELECT id, 1, 'qr', NULL, opened_at FROM bills WHERE bill_no LIKE 'B-HIST-W%';

-- ใส่ยอดขายย้อนหลังของทุกเมนูที่ใช้งานอยู่ (อ้างอิงจาก lot_size เพื่อให้ได้ตัวเลขสมจริง)
INSERT INTO order_items (order_id, menu_item_id, qty, unit_price, status, cancelled_qty, stock_taken, updated_by, updated_at)
SELECT o.id,
       m.id,
       CASE b.bill_no
         WHEN 'B-HIST-W1' THEN GREATEST(2, m.lot_size * 3)
         WHEN 'B-HIST-W2' THEN GREATEST(2, m.lot_size * 4)
         WHEN 'B-HIST-W3' THEN GREATEST(2, m.lot_size * 3 + 2)
         ELSE GREATEST(2, m.lot_size * 4 - 1)
       END AS qty,
       m.price,
       'done',
       0,
       0,
       @chef_id,
       o.created_at + INTERVAL 20 MINUTE
  FROM orders o
  JOIN bills b ON b.id = o.bill_id
  CROSS JOIN menu_items m
 WHERE b.bill_no LIKE 'B-HIST-W%'
   AND m.is_deleted = 0;

UPDATE bills b
JOIN (
  SELECT o.bill_id, SUM(oi.qty * oi.unit_price) AS sub
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
   GROUP BY o.bill_id
) x ON x.bill_id = b.id
SET b.subtotal = x.sub,
    b.total_paid = x.sub
WHERE b.bill_no LIKE 'B-HIST-W%';
