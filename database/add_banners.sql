-- เพิ่มตารางแบนเนอร์ (สไลด์หน้า Home) ให้ฐานข้อมูลที่ import ไปแล้ว
-- รันครั้งเดียวใน phpMyAdmin (รันซ้ำได้ ไม่พัง) · คนที่ import schema ใหม่หลังจากนี้ไม่ต้องรัน
SET NAMES utf8mb4;
USE dimsum;

CREATE TABLE IF NOT EXISTS banners (
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
