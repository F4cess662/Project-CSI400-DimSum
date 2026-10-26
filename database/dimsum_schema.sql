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
  ('ติ่มซำนึ่ง',1),('ติ่มซำทอด',2),('โจ๊กและเส้น',3),('เครื่องดื่ม',4),('ของหวาน',5);
