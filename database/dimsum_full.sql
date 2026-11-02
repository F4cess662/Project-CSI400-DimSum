-- =========================================================
-- ฐานข้อมูลร้านนึ่งสุข — ไฟล์เดียวจบ (โครงตาราง + ข้อมูลตัวอย่าง)
-- วิธีใช้: phpMyAdmin → Import → เลือกไฟล์นี้ → Go (ไม่ต้องเลือกฐานข้อมูลก่อน)
--   · มีฐานข้อมูล dimsum อยู่แล้ว → ลบทิ้งแล้วสร้างใหม่ (ข้อมูลทดสอบเดิมหายหมด)
--   · ยังไม่มี → สร้างใหม่
-- ล็อกอิน: owner / secret123 · wipa (ผู้จัดการ), ahmei (หัวหน้าเชฟ), ton, fon (พนักงาน) / 1234
--
-- ★ กติกาแก้ไฟล์นี้: แก้ได้ทีละคน ต้องแจ้ง/ตกลงในกลุ่มก่อน แล้ว commit + PR ให้ PM merge ทันที
--   ส่วนที่ 1 โครงตาราง (แก้ต้องขอ PM) · ส่วนที่ 2 เมนู (คนที่ 3) · ส่วนที่ 3 ข้อมูลทีม · ส่วนที่ 4 ข้อมูลตัวอย่างอื่น (คนที่ 1)
--   แก้แล้วต้อง import ทั้งไฟล์ได้โดยไม่ error (ทดสอบก่อน push)
-- =========================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP DATABASE IF EXISTS dimsum;
SET FOREIGN_KEY_CHECKS = 1;

-- #########################################################
-- ส่วนที่ 1: โครงตาราง (schema v5 + แบนเนอร์ + Microservices) — แก้ต้องขอ PM
-- #########################################################
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS dimsum
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dimsum;

CREATE TABLE roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  role_code   VARCHAR(20) NOT NULL UNIQUE,
  role_name   VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(20),
  role_id         INT          NOT NULL,
  can_payment     TINYINT(1)   NOT NULL DEFAULT 1,
  can_vip_booking TINYINT(1)   NOT NULL DEFAULT 1,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  deactivated_at  DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE shop_settings (
  id                    INT PRIMARY KEY DEFAULT 1,
  shop_name             VARCHAR(100) NOT NULL,
  phone                 VARCHAR(20),
  email                 VARCHAR(100),
  address               VARCHAR(255),
  morning_open          TIME NOT NULL DEFAULT '10:00:00',
  morning_last_order    TIME NOT NULL DEFAULT '13:30:00',
  morning_close         TIME NOT NULL DEFAULT '14:00:00',
  evening_open          TIME NOT NULL DEFAULT '16:00:00',
  evening_last_order    TIME NOT NULL DEFAULT '19:30:00',
  evening_close         TIME NOT NULL DEFAULT '20:00:00',
  max_qty_per_item      INT  NOT NULL DEFAULT 10,
  vip_min_spend         DECIMAL(10,2) NOT NULL DEFAULT 3000,
  vip_deposit_percent   INT  NOT NULL DEFAULT 50,
  vip_max_hours         INT  NOT NULL DEFAULT 4,
  CHECK (id = 1)
) ENGINE=InnoDB;

CREATE TABLE public_holidays (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  holiday_date  DATE NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE banners (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(100) NULL,
  image_path   VARCHAR(255) NOT NULL,
  link_url     VARCHAR(255) NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_by   INT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE menu_categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  category_id    INT NOT NULL,
  name           VARCHAR(100) NOT NULL,
  description    VARCHAR(255),
  price          DECIMAL(10,2) NOT NULL,
  unit           VARCHAR(20) NOT NULL DEFAULT 'เข่ง',
  kitchen_zone   ENUM('steam','fry','congee_noodle','drink_dessert') NOT NULL DEFAULT 'steam',
  image_path     VARCHAR(255),
  lot_size       INT NOT NULL DEFAULT 1,
  available_qty  INT NULL,
  is_available   TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted     TINYINT(1) NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES menu_categories(id),
  INDEX idx_menu_name (name)
) ENGINE=InnoDB;

CREATE TABLE dining_tables (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(10) NOT NULL UNIQUE,
  table_type  ENUM('bar','small','large') NOT NULL,
  seats       INT NOT NULL,
  status      ENUM('available','occupied') NOT NULL DEFAULT 'available',
  pos_x       INT NOT NULL DEFAULT 0,
  pos_y       INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE vip_rooms (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  seats       INT NOT NULL DEFAULT 15,
  status      ENUM('available','occupied') NOT NULL DEFAULT 'available',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  CHECK (seats BETWEEN 1 AND 15)
) ENGINE=InnoDB;

CREATE TABLE members (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  phone           VARCHAR(20)  NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  birth_date      DATE NULL,
  tier            ENUM('normal','silver','gold') NOT NULL DEFAULT 'normal',
  points_balance  INT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE bills (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  bill_no             VARCHAR(20) NOT NULL UNIQUE,
  status              ENUM('open','paid','cancelled') NOT NULL DEFAULT 'open',
  guests              INT NOT NULL,
  vip_room_id         INT NULL,
  qr_token            VARCHAR(64) NOT NULL UNIQUE,
  opened_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opened_by           INT NOT NULL,
  closed_at           DATETIME NULL,
  closed_by           INT NULL,
  member_id           INT NULL,
  payment_method      ENUM('cash','promptpay','card') NULL,
  subtotal            DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_points     DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_coupon     DECIMAL(10,2) NOT NULL DEFAULT 0,
  deposit_deducted    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_paid          DECIMAL(10,2) NOT NULL DEFAULT 0,
  points_earned       INT NOT NULL DEFAULT 0,
  FOREIGN KEY (vip_room_id) REFERENCES vip_rooms(id),
  FOREIGN KEY (opened_by)   REFERENCES users(id),
  FOREIGN KEY (closed_by)   REFERENCES users(id),
  FOREIGN KEY (member_id)   REFERENCES members(id),
  INDEX idx_bill_time (opened_at, closed_at)
) ENGINE=InnoDB;

CREATE TABLE bill_tables (
  bill_id   INT NOT NULL,
  table_id  INT NOT NULL,
  PRIMARY KEY (bill_id, table_id),
  FOREIGN KEY (bill_id)  REFERENCES bills(id),
  FOREIGN KEY (table_id) REFERENCES dining_tables(id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  bill_id     INT NOT NULL,
  round_no    INT NOT NULL,
  source      ENUM('qr','staff','vip_preorder') NOT NULL,
  created_by  INT NULL,
  cancelled_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id)    REFERENCES bills(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_bill_round (bill_id, round_no)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  order_id       INT NOT NULL,
  menu_item_id   INT NOT NULL,
  qty            INT NOT NULL,
  unit_price     DECIMAL(10,2) NOT NULL,
  status         ENUM('waiting','cooking','ready','done','cancelled') NOT NULL DEFAULT 'waiting',
  cancelled_qty  INT NOT NULL DEFAULT 0,
  cancel_reason  ENUM('customer','out_of_stock','spoiled','other') NULL,
  cancel_note    VARCHAR(255) NULL,
  updated_by     INT NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)     REFERENCES orders(id),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  FOREIGN KEY (updated_by)   REFERENCES users(id),
  CHECK (qty > 0),
  CHECK (cancelled_qty >= 0 AND cancelled_qty <= qty)
) ENGINE=InnoDB;

CREATE TABLE vip_bookings (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  vip_room_id          INT NOT NULL,
  booking_date         DATE NOT NULL,
  start_time           TIME NOT NULL,
  hours                INT NOT NULL,
  customer_name        VARCHAR(100) NOT NULL,
  customer_phone       VARCHAR(20)  NOT NULL,
  guests               INT NOT NULL,
  preorder_total       DECIMAL(10,2) NOT NULL,
  deposit_amount       DECIMAL(10,2) NOT NULL,
  deposit_received_at  DATETIME NULL,
  deposit_received_by  INT NULL,
  status               ENUM('pending_deposit','confirmed','arrived','no_show','cancelled') NOT NULL DEFAULT 'pending_deposit',
  bill_id              INT NULL,
  created_by           INT NOT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vip_room_id)         REFERENCES vip_rooms(id),
  FOREIGN KEY (deposit_received_by) REFERENCES users(id),
  FOREIGN KEY (bill_id)             REFERENCES bills(id),
  FOREIGN KEY (created_by)          REFERENCES users(id),
  CHECK (hours >= 1)
) ENGINE=InnoDB;

CREATE TABLE vip_booking_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  booking_id    INT NOT NULL,
  menu_item_id  INT NOT NULL,
  qty           INT NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (booking_id)   REFERENCES vip_bookings(id),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB;

CREATE TABLE rewards (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  points_cost    INT NOT NULL,
  reward_type    ENUM('free_item','discount') NOT NULL,
  menu_item_id   INT NULL,
  discount_value DECIMAL(10,2) NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB;

CREATE TABLE point_transactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  member_id   INT NOT NULL,
  bill_id     INT NULL,
  points      INT NOT NULL,
  type        ENUM('earn','redeem','expire') NOT NULL,
  reward_id   INT NULL,
  created_by  INT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id)  REFERENCES members(id),
  FOREIGN KEY (bill_id)    REFERENCES bills(id),
  FOREIGN KEY (reward_id)  REFERENCES rewards(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE coupons (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  code              VARCHAR(30) NOT NULL UNIQUE,
  coupon_type       ENUM('amount','percent','free_item') NOT NULL,
  value             DECIMAL(10,2) NULL,
  free_menu_item_id INT NULL,
  min_spend         DECIMAL(10,2) NOT NULL DEFAULT 0,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  valid_time_start  TIME NULL,
  valid_time_end    TIME NULL,
  valid_weekdays    VARCHAR(20) NULL,
  exclude_holidays  TINYINT(1) NOT NULL DEFAULT 0,
  member_only       TINYINT(1) NOT NULL DEFAULT 0,
  usage_limit       INT NULL,
  per_member_limit  INT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (free_menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB;

CREATE TABLE member_coupons (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  member_id   INT NOT NULL,
  coupon_id   INT NOT NULL,
  issued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATE NULL,
  used_at     DATETIME NULL,
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id)
) ENGINE=InnoDB;

CREATE TABLE coupon_usages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  coupon_id  INT NOT NULL,
  bill_id    INT NOT NULL,
  member_id  INT NULL,
  used_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  FOREIGN KEY (bill_id)   REFERENCES bills(id),
  FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

CREATE TABLE queue_tickets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  queue_no      VARCHAR(10) NOT NULL,
  group_type    ENUM('bar','small','large') NOT NULL,
  party_size    INT NOT NULL,
  status        ENUM('waiting','called','seated','skipped') NOT NULL DEFAULT 'waiting',
  called_count  INT NOT NULL DEFAULT 0,
  bill_id       INT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at     DATETIME NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(id)
) ENGINE=InnoDB;

CREATE TABLE shift_closings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  shift_date    DATE NOT NULL,
  shift         ENUM('morning','evening') NOT NULL,
  counted_cash  DECIMAL(10,2) NOT NULL,
  system_cash   DECIMAL(10,2) NOT NULL,
  difference    DECIMAL(10,2) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE prep_plans (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  plan_date      DATE NOT NULL,
  menu_item_id   INT NOT NULL,
  suggested_qty  INT NOT NULL,
  confirmed_qty  INT NULL,
  confirmed_by   INT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id),
  UNIQUE KEY uq_plan (plan_date, menu_item_id)
) ENGINE=InnoDB;

CREATE TABLE ingredients (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  unit           VARCHAR(20)  NOT NULL,
  qty_on_hand    DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_point  DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  contact_name    VARCHAR(100),
  phone           VARCHAR(20),
  line_id         VARCHAR(50),
  lead_time_days  INT NOT NULL DEFAULT 1,
  is_active       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE supplier_prices (
  supplier_id    INT NOT NULL,
  ingredient_id  INT NOT NULL,
  price          DECIMAL(10,2) NOT NULL,
  quoted_at      DATE NOT NULL,
  PRIMARY KEY (supplier_id, ingredient_id),
  FOREIGN KEY (supplier_id)   REFERENCES suppliers(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB;

CREATE TABLE purchase_orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  po_no          VARCHAR(20) NOT NULL UNIQUE,
  supplier_id    INT NOT NULL,
  status         ENUM('draft','sent','received','cancelled') NOT NULL DEFAULT 'draft',
  order_date     DATE NOT NULL,
  expected_date  DATE NULL,
  note           VARCHAR(255),
  created_by     INT NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by)  REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE purchase_order_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  po_id          INT NOT NULL,
  ingredient_id  INT NOT NULL,
  qty            DECIMAL(10,2) NOT NULL,
  unit_price     DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (po_id)         REFERENCES purchase_orders(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB;

CREATE TABLE goods_receipts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  po_id           INT NOT NULL,
  received_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by     INT NOT NULL,
  invoice_no      VARCHAR(50),
  invoice_amount  DECIMAL(10,2),
  invoice_image   VARCHAR(255),
  is_paid         TINYINT(1) NOT NULL DEFAULT 0,
  paid_at         DATE NULL,
  FOREIGN KEY (po_id)       REFERENCES purchase_orders(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  ingredient_id     INT NOT NULL,
  qty               DECIMAL(10,2) NOT NULL,
  movement_type     ENUM('receive','use','waste','adjust') NOT NULL,
  goods_receipt_id  INT NULL,
  expiry_date       DATE NULL,
  note              VARCHAR(255),
  created_by        INT NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ingredient_id)    REFERENCES ingredients(id),
  FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts(id),
  FOREIGN KEY (created_by)       REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NULL,
  log_level    ENUM('operation','system') NOT NULL,
  action       VARCHAR(50) NOT NULL,
  target_type  VARCHAR(50) NULL,
  target_id    INT NULL,
  detail       TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_log_time (created_at)
) ENGINE=InnoDB;

-- ===== Microservices (ระบบหลัก + ครัว + คลังสินค้า + แจ้งเตือน ใช้ร่วมกัน) =====
-- 3 ตารางนี้ server สร้างให้เองตอนเปิดถ้ายังไม่มี (CREATE TABLE IF NOT EXISTS) ไม่ import ก็ใช้ได้

-- session ล็อกอินที่ทุก service อ่านร่วมกัน (lib/session.js)
CREATE TABLE IF NOT EXISTS sessions (
  sid     VARCHAR(128) NOT NULL PRIMARY KEY,
  data    MEDIUMTEXT   NOT NULL,
  expires BIGINT       NOT NULL,
  KEY idx_sessions_expires (expires)
) ENGINE=InnoDB;

-- Message Queue "แท่นเสียบบิล" (lib/queue.js) · topic ดูใน docs/API ส่วน Microservices
CREATE TABLE IF NOT EXISTS event_queue (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  topic      VARCHAR(50)  NOT NULL,
  payload    LONGTEXT     NOT NULL,
  status     ENUM('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
  attempts   INT          NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  locked_by  VARCHAR(64)  NULL,
  locked_at  DATETIME     NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  done_at    DATETIME     NULL,
  KEY idx_queue_pick (topic, status, id)
) ENGINE=InnoDB;

-- ประวัติข้อความที่ notify-service ส่ง (SMS/LINE จำลอง) — ตารางของ notify-service เท่านั้น
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id   BIGINT       NULL,
  channel    ENUM('sms','line','system') NOT NULL DEFAULT 'system',
  recipient  VARCHAR(100) NULL,
  title      VARCHAR(150) NULL,
  message    TEXT         NOT NULL,
  status     ENUM('sent','failed') NOT NULL DEFAULT 'sent',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_time (created_at)
) ENGINE=InnoDB;

INSERT INTO roles (role_code, role_name) VALUES
  ('customer','ลูกค้า'),('staff','พนักงานหน้าร้าน'),('head_chef','หัวหน้าเชฟ'),
  ('manager','ผู้จัดการ'),('owner','เจ้าของร้าน');

INSERT INTO shop_settings (id, shop_name, phone, email)
VALUES (1, 'นึ่งสุข', '02-000-0000', 'contact@nuengsuk.local');

INSERT INTO dining_tables (code, table_type, seats) VALUES
  ('B1','bar',1),('B2','bar',1),('B3','bar',1),('B4','bar',1),
  ('B5','bar',1),('B6','bar',1),('B7','bar',1),('B8','bar',1),
  ('T01','small',4),('T02','small',4),('T03','small',4),('T04','small',4),
  ('T05','small',4),('T06','small',4),('T07','small',4),('T08','small',4),
  ('T09','small',4),('T10','small',4),('T11','small',4),('T12','small',4),
  ('L01','large',8),('L02','large',8),('L03','large',8),('L04','large',8),('L05','large',8),
  ('L06','large',8),('L07','large',8),('L08','large',8),('L09','large',8),('L10','large',8);

INSERT INTO vip_rooms (name, seats) VALUES
  ('VIP 1',15),('VIP 2',15),('VIP 3',15),('VIP 4',15),('VIP 5',15),('VIP 6',15);

INSERT INTO coupons (code, coupon_type, value, start_date, end_date, valid_time_start, valid_time_end, valid_weekdays, exclude_holidays)
VALUES ('HAPPYHOUR','percent',10,'2026-01-01','2099-12-31','10:00:00','12:00:00','1,2,3,4,5',1);

INSERT INTO menu_categories (name, sort_order) VALUES
  ('ซาลาเปา',1),('ขนมจีบ',2),('ห่อสาหร่าย',3),('ฮะเก๋า',4),
  ('เมนูจานหลัก',5),('เมนูทอด',6),('หมี่หยก',7),('ชุดเซ็ต',8);

-- #########################################################
-- ส่วนที่ 2: เมนู 33 รายการ + แบนเนอร์ (คนที่ 3)
-- #########################################################
-- =========================================================
-- ข้อมูลตัวอย่างร้านนึ่งสุข
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
-- 1.5) แบนเนอร์หน้า Home (สไลด์)
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
-- 2) ข้อมูลอื่น → อยู่ในส่วนที่ 4 ท้ายไฟล์
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

-- #########################################################
-- ส่วนที่ 3: บัญชีพนักงาน + วันหยุดราชการ 2569
-- #########################################################
-- =========================================================
-- ข้อมูลทีม: บัญชีพนักงาน 5 คน + วันหยุดราชการ 2569 (export จากเครื่องเพื่อน)
-- owner / secret123 · wipa (ผู้จัดการ), ahmei (หัวหน้าเชฟ), ton, fon (พนักงาน) / 1234
-- import ซ้ำได้ (INSERT IGNORE) · ใช้แทน npm run setup-owner และ seed-users.js
-- =========================================================
SET NAMES utf8mb4;
USE dimsum;

INSERT IGNORE INTO `users` (`id`, `username`, `password_hash`, `full_name`, `phone`, `role_id`, `can_payment`, `can_vip_booking`, `is_active`, `deactivated_at`, `created_at`, `updated_at`) VALUES
(1, 'owner', '$2a$10$g4CY/r4Fw/zVwi2DVn7fh.SgFMQ./e0k8cF8HOKKO6dodDiwJhcFy', 'สมชาย', NULL, 5, 1, 1, 1, NULL, '2026-10-28 23:58:13', '2026-10-28 23:58:13'),
(2, 'wipa', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'วิภา', NULL, 4, 1, 1, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43'),
(3, 'ahmei', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'อาเหม่ย', NULL, 3, 0, 0, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43'),
(4, 'ton', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'ต้น', NULL, 2, 1, 1, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43'),
(5, 'fon', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'ฝน', NULL, 2, 0, 1, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43');

INSERT IGNORE INTO `public_holidays` (`id`, `holiday_date`, `name`) VALUES
(1, '2026-01-01', 'วันขึ้นปีใหม่'),
(2, '2026-01-02', 'วันหยุดพิเศษช่วงเทศกาลปีใหม่'),
(3, '2026-03-03', 'วันมาฆบูชา'),
(4, '2026-04-06', 'วันจักรี'),
(5, '2026-04-13', 'วันสงกรานต์'),
(6, '2026-04-14', 'วันสงกรานต์'),
(7, '2026-04-15', 'วันสงกรานต์'),
(8, '2026-05-01', 'วันแรงงานแห่งชาติ'),
(9, '2026-05-04', 'วันฉัตรมงคล'),
(10, '2026-05-31', 'วันวิสาขบูชา'),
(11, '2026-06-01', 'วันหยุดชดเชยวันวิสาขบูชา'),
(12, '2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
(13, '2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
(14, '2026-07-29', 'วันอาสาฬหบูชา'),
(15, '2026-07-30', 'วันเข้าพรรษา'),
(16, '2026-08-12', 'วันแม่แห่งชาติ'),
(17, '2026-10-13', 'วันนวมินทรมหาราช'),
(18, '2026-10-23', 'วันปิยมหาราช'),
(19, '2026-12-05', 'วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9'),
(20, '2026-12-07', 'วันหยุดชดเชยวันพ่อแห่งชาติ'),
(21, '2026-12-10', 'วันรัฐธรรมนูญ'),
(22, '2026-12-31', 'วันสิ้นปี');

-- #########################################################
-- ส่วนที่ 4: ข้อมูลตัวอย่างอื่น (คนที่ 1: สมาชิก คูปอง วัตถุดิบ ซัพพลายเออร์ บิลตัวอย่าง)
-- #########################################################
-- เพิ่มต่อจากตรงนี้ · อ้างอิงเมนูด้วยชื่อ (SELECT id FROM menu_items WHERE name = ...) ห้ามเดา id
USE dimsum;

