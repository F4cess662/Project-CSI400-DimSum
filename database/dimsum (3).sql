-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 12, 2026 at 07:01 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `dimsum`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `log_level` enum('operation','system') NOT NULL,
  `action` varchar(50) NOT NULL,
  `target_type` varchar(50) DEFAULT NULL,
  `target_id` int(11) DEFAULT NULL,
  `detail` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `activity_logs`
--

INSERT INTO `activity_logs` (`id`, `user_id`, `log_level`, `action`, `target_type`, `target_id`, `detail`, `created_at`) VALUES
(1, 1, 'operation', 'user.login', 'users', 1, NULL, '2026-11-03 22:52:18'),
(2, 1, 'operation', 'user.login', 'users', 1, NULL, '2026-11-10 21:21:36'),
(3, 1, 'operation', 'bill.open', 'bills', 1, '{\"bill_no\":\"B20261110-001\",\"places\":[\"B5\"],\"guests\":1}', '2026-11-10 21:21:54'),
(4, 1, 'operation', 'order.create', 'bills', 1, '{\"bill_no\":\"B20261110-001\",\"round_no\":1,\"source\":\"qr\",\"total\":120,\"items\":[\"ซาลาเปาหมูสับ x1\",\"ซาลาเปาหมูแดง x1\",\"ซาลาเปาเห็ดหอม x1\",\"ซาลาเปาถั่วแดง x1\"]}', '2026-11-10 21:30:20'),
(5, 1, 'operation', 'order_item.update_status', 'order_items', 1, '{\"menu\":\"ซาลาเปาหมูสับ\",\"from\":\"waiting\",\"to\":\"cooking\"}', '2026-11-10 21:30:46'),
(6, 1, 'operation', 'order_item.update_status', 'order_items', 2, '{\"menu\":\"ซาลาเปาหมูแดง\",\"from\":\"waiting\",\"to\":\"cooking\"}', '2026-11-10 21:30:46'),
(7, 1, 'operation', 'order_item.update_status', 'order_items', 3, '{\"menu\":\"ซาลาเปาเห็ดหอม\",\"from\":\"waiting\",\"to\":\"cooking\"}', '2026-11-10 21:30:47'),
(8, 1, 'operation', 'order_item.update_status', 'order_items', 4, '{\"menu\":\"ซาลาเปาถั่วแดง\",\"from\":\"waiting\",\"to\":\"cooking\"}', '2026-11-10 21:30:47'),
(9, 1, 'operation', 'order_item.update_status', 'order_items', 1, '{\"menu\":\"ซาลาเปาหมูสับ\",\"from\":\"cooking\",\"to\":\"ready\"}', '2026-11-10 21:30:56'),
(10, 1, 'operation', 'order_item.update_status', 'order_items', 2, '{\"menu\":\"ซาลาเปาหมูแดง\",\"from\":\"cooking\",\"to\":\"ready\"}', '2026-11-10 21:30:56'),
(11, 1, 'operation', 'order_item.update_status', 'order_items', 3, '{\"menu\":\"ซาลาเปาเห็ดหอม\",\"from\":\"cooking\",\"to\":\"ready\"}', '2026-11-10 21:30:56'),
(12, 1, 'operation', 'order_item.update_status', 'order_items', 4, '{\"menu\":\"ซาลาเปาถั่วแดง\",\"from\":\"cooking\",\"to\":\"ready\"}', '2026-11-10 21:30:57'),
(13, 1, 'operation', 'order_item.update_status', 'order_items', 1, '{\"menu\":\"ซาลาเปาหมูสับ\",\"from\":\"ready\",\"to\":\"done\"}', '2026-11-10 21:56:22'),
(14, 1, 'operation', 'order_item.update_status', 'order_items', 3, '{\"menu\":\"ซาลาเปาเห็ดหอม\",\"from\":\"ready\",\"to\":\"done\"}', '2026-11-10 21:56:22'),
(15, 1, 'operation', 'order_item.update_status', 'order_items', 2, '{\"menu\":\"ซาลาเปาหมูแดง\",\"from\":\"ready\",\"to\":\"done\"}', '2026-11-10 21:56:23'),
(16, 1, 'operation', 'order_item.update_status', 'order_items', 4, '{\"menu\":\"ซาลาเปาถั่วแดง\",\"from\":\"ready\",\"to\":\"done\"}', '2026-11-10 21:56:24'),
(17, 2, 'operation', 'user.login', 'users', 2, NULL, '2026-11-12 12:11:43'),
(18, 2, 'operation', 'po.create', 'purchase_orders', 1, '{\"po_no\":\"PO20261112-001\",\"supplier\":\"ตลาดสดเจริญกรุง\",\"items\":3,\"total\":3054}', '2026-11-12 12:11:44'),
(19, 2, 'operation', 'po.send', 'purchase_orders', 1, '{\"po_no\":\"PO20261112-001\",\"supplier\":\"ตลาดสดเจริญกรุง\",\"total\":3054}', '2026-11-12 12:11:44'),
(20, 2, 'operation', 'goods.receive', 'goods_receipts', 1, '{\"po_no\":\"PO20261112-001\",\"supplier\":\"ตลาดสดเจริญกรุง\",\"items\":[{\"name\":\"หมูสับ\",\"qty\":10,\"unit\":\"กก.\"},{\"name\":\"กุ้ง\",\"qty\":4.5,\"unit\":\"กก.\"}],\"invoice_no\":\"INV-TEST-001\",\"invoice_amount\":2620,\"diffs\":[{\"name\":\"กุ้ง\",\"unit\":\"กก.\",\"ordered_qty\":5,\"received_qty\":4.5},{\"name\":\"แป้งซาลาเปา\",\"unit\":\"กก.\",\"ordered_qty\":8,\"received_qty\":0}]}', '2026-11-12 12:11:54'),
(21, 4, 'operation', 'user.login', 'users', 4, NULL, '2026-11-12 12:12:07'),
(22, 2, 'operation', 'goods.paid', 'goods_receipts', 1, '{\"po_no\":\"PO20261112-001\",\"invoice_no\":\"INV-TEST-001\",\"invoice_amount\":2620,\"paid_at\":\"2026-11-12\"}', '2026-11-12 12:12:07'),
(23, 2, 'operation', 'po.create', 'purchase_orders', 2, '{\"po_no\":\"PO20261112-002\",\"supplier\":\"วัตถุดิบเอเชีย\",\"items\":3,\"total\":1101}', '2026-11-12 12:12:31'),
(24, 2, 'operation', 'po.send', 'purchase_orders', 2, '{\"po_no\":\"PO20261112-002\",\"supplier\":\"วัตถุดิบเอเชีย\",\"total\":1101}', '2026-11-12 12:12:31'),
(25, 1, 'operation', 'user.login', 'users', 1, NULL, '2026-11-12 12:25:24'),
(26, 1, 'operation', 'user.login', 'users', 1, NULL, '2026-11-12 12:33:19'),
(27, 1, 'operation', 'goods.receive', 'goods_receipts', 2, '{\"po_no\":\"PO20261112-002\",\"supplier\":\"วัตถุดิบเอเชีย\",\"items\":[{\"name\":\"แป้งสาลี\",\"qty\":20,\"unit\":\"กก.\"},{\"name\":\"น้ำมันพืช\",\"qty\":6,\"unit\":\"ลิตร\"},{\"name\":\"น้ำตาล\",\"qty\":5,\"unit\":\"กก.\"}],\"invoice_no\":\"INV-AS-2611-047\",\"invoice_amount\":1101,\"diffs\":[]}', '2026-11-12 12:35:16'),
(28, 1, 'operation', 'goods.receive', 'goods_receipts', 3, '{\"po_no\":\"PO20261112-002\",\"supplier\":\"วัตถุดิบเอเชีย\",\"items\":[{\"name\":\"แป้งสาลี\",\"qty\":20,\"unit\":\"กก.\"},{\"name\":\"น้ำมันพืช\",\"qty\":6,\"unit\":\"ลิตร\"},{\"name\":\"น้ำตาล\",\"qty\":5,\"unit\":\"กก.\"}],\"invoice_no\":\"INV-AS-2611-047\",\"invoice_amount\":1101,\"diffs\":[]}', '2026-11-12 12:39:38'),
(29, 1, 'operation', 'goods.receive', 'goods_receipts', 4, '{\"po_no\":\"PO20261112-002\",\"supplier\":\"วัตถุดิบเอเชีย\",\"items\":[{\"name\":\"แป้งสาลี\",\"qty\":20,\"unit\":\"กก.\"},{\"name\":\"น้ำมันพืช\",\"qty\":6,\"unit\":\"ลิตร\"},{\"name\":\"น้ำตาล\",\"qty\":5,\"unit\":\"กก.\"}],\"invoice_no\":\"INV-AS-2611-047\",\"invoice_amount\":1101,\"diffs\":[]}', '2026-11-12 12:49:59'),
(30, 2, 'operation', 'user.login', 'users', 2, NULL, '2026-11-12 12:55:22'),
(31, 2, 'operation', 'goods.paid', 'goods_receipts', 4, '{\"po_no\":\"PO20261112-002\",\"invoice_no\":\"INV-AS-2611-047\",\"invoice_amount\":1101,\"paid_at\":\"2026-11-12\",\"payment_ref\":\"202611121405TX8830\",\"has_slip\":true}', '2026-11-12 12:55:53');

-- --------------------------------------------------------

--
-- Table structure for table `banners`
--

CREATE TABLE `banners` (
  `id` int(11) NOT NULL,
  `title` varchar(100) DEFAULT NULL,
  `image_path` varchar(255) NOT NULL,
  `link_url` varchar(255) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `banners`
--

INSERT INTO `banners` (`id`, `title`, `image_path`, `link_url`, `sort_order`, `is_active`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 'เมนู Special', '/assets/img/banners/special-menu.webp', NULL, 1, 1, NULL, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(2, 'รูปทดสอบ 1', 'https://www.regent-holidays.co.uk/upload-files/blog-sections/section-214_1975.jpg', NULL, 2, 1, NULL, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(3, 'รูปทดสอบ 2', 'https://res.klook.com/image/upload/q_85/c_fill,w_750/v1674030135/blog/bnbtltnp5nqbdevfcbmn.jpg', NULL, 3, 1, NULL, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(4, 'รูปทดสอบ 3', 'https://www.nippon.com/en/ncommon/contents/guide-to-japan/133214/133214.jpg', NULL, 4, 1, NULL, '2026-11-03 22:06:23', '2026-11-03 22:06:23');

-- --------------------------------------------------------

--
-- Table structure for table `bills`
--

CREATE TABLE `bills` (
  `id` int(11) NOT NULL,
  `bill_no` varchar(20) NOT NULL,
  `status` enum('open','paid','cancelled') NOT NULL DEFAULT 'open',
  `guests` int(11) NOT NULL,
  `vip_room_id` int(11) DEFAULT NULL,
  `qr_token` varchar(64) NOT NULL,
  `opened_at` datetime NOT NULL DEFAULT current_timestamp(),
  `opened_by` int(11) NOT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int(11) DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `payment_method` enum('cash','promptpay','card') DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_points` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_coupon` decimal(10,2) NOT NULL DEFAULT 0.00,
  `deposit_deducted` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
  `points_earned` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `bills`
--

INSERT INTO `bills` (`id`, `bill_no`, `status`, `guests`, `vip_room_id`, `qr_token`, `opened_at`, `opened_by`, `closed_at`, `closed_by`, `member_id`, `payment_method`, `subtotal`, `discount_points`, `discount_coupon`, `deposit_deducted`, `total_paid`, `points_earned`) VALUES
(1, 'B20261110-001', 'open', 1, NULL, 'ed46a9e9e1d5206abdafc0d8cbdf2319', '2026-11-10 21:21:54', 1, NULL, NULL, NULL, NULL, 0.00, 0.00, 0.00, 0.00, 0.00, 0);

-- --------------------------------------------------------

--
-- Table structure for table `bill_tables`
--

CREATE TABLE `bill_tables` (
  `bill_id` int(11) NOT NULL,
  `table_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `bill_tables`
--

INSERT INTO `bill_tables` (`bill_id`, `table_id`) VALUES
(1, 5);

-- --------------------------------------------------------

--
-- Table structure for table `coupons`
--

CREATE TABLE `coupons` (
  `id` int(11) NOT NULL,
  `code` varchar(30) NOT NULL,
  `coupon_type` enum('amount','percent','free_item') NOT NULL,
  `value` decimal(10,2) DEFAULT NULL,
  `free_menu_item_id` int(11) DEFAULT NULL,
  `min_spend` decimal(10,2) NOT NULL DEFAULT 0.00,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `valid_time_start` time DEFAULT NULL,
  `valid_time_end` time DEFAULT NULL,
  `valid_weekdays` varchar(20) DEFAULT NULL,
  `exclude_holidays` tinyint(1) NOT NULL DEFAULT 0,
  `member_only` tinyint(1) NOT NULL DEFAULT 0,
  `usage_limit` int(11) DEFAULT NULL,
  `per_member_limit` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `coupons`
--

INSERT INTO `coupons` (`id`, `code`, `coupon_type`, `value`, `free_menu_item_id`, `min_spend`, `start_date`, `end_date`, `valid_time_start`, `valid_time_end`, `valid_weekdays`, `exclude_holidays`, `member_only`, `usage_limit`, `per_member_limit`, `is_active`) VALUES
(1, 'HAPPYHOUR', 'percent', 10.00, NULL, 0.00, '2026-01-01', '2099-12-31', '10:00:00', '12:00:00', '1,2,3,4,5', 1, 0, NULL, NULL, 1),
(2, 'WELCOME20', 'percent', 20.00, NULL, 100.00, '2026-01-01', '2099-12-31', NULL, NULL, NULL, 0, 1, NULL, NULL, 1),
(3, 'BDAY', 'percent', 15.00, NULL, 0.00, '2026-01-01', '2099-12-31', NULL, NULL, NULL, 0, 1, NULL, NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `coupon_usages`
--

CREATE TABLE `coupon_usages` (
  `id` int(11) NOT NULL,
  `coupon_id` int(11) NOT NULL,
  `bill_id` int(11) NOT NULL,
  `member_id` int(11) DEFAULT NULL,
  `used_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dining_tables`
--

CREATE TABLE `dining_tables` (
  `id` int(11) NOT NULL,
  `code` varchar(10) NOT NULL,
  `table_type` enum('bar','small','large') NOT NULL,
  `seats` int(11) NOT NULL,
  `status` enum('available','occupied') NOT NULL DEFAULT 'available',
  `pos_x` int(11) NOT NULL DEFAULT 0,
  `pos_y` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `dining_tables`
--

INSERT INTO `dining_tables` (`id`, `code`, `table_type`, `seats`, `status`, `pos_x`, `pos_y`, `is_active`) VALUES
(1, 'B1', 'bar', 1, 'available', 0, 0, 1),
(2, 'B2', 'bar', 1, 'available', 0, 0, 1),
(3, 'B3', 'bar', 1, 'available', 0, 0, 1),
(4, 'B4', 'bar', 1, 'available', 0, 0, 1),
(5, 'B5', 'bar', 1, 'occupied', 0, 0, 1),
(6, 'B6', 'bar', 1, 'available', 0, 0, 1),
(7, 'B7', 'bar', 1, 'available', 0, 0, 1),
(8, 'B8', 'bar', 1, 'available', 0, 0, 1),
(9, 'T01', 'small', 4, 'available', 0, 0, 1),
(10, 'T02', 'small', 4, 'available', 0, 0, 1),
(11, 'T03', 'small', 4, 'available', 0, 0, 1),
(12, 'T04', 'small', 4, 'available', 0, 0, 1),
(13, 'T05', 'small', 4, 'available', 0, 0, 1),
(14, 'T06', 'small', 4, 'available', 0, 0, 1),
(15, 'T07', 'small', 4, 'available', 0, 0, 1),
(16, 'T08', 'small', 4, 'available', 0, 0, 1),
(17, 'T09', 'small', 4, 'available', 0, 0, 1),
(18, 'T10', 'small', 4, 'available', 0, 0, 1),
(19, 'T11', 'small', 4, 'available', 0, 0, 1),
(20, 'T12', 'small', 4, 'available', 0, 0, 1),
(21, 'L01', 'large', 8, 'available', 0, 0, 1),
(22, 'L02', 'large', 8, 'available', 0, 0, 1),
(23, 'L03', 'large', 8, 'available', 0, 0, 1),
(24, 'L04', 'large', 8, 'available', 0, 0, 1),
(25, 'L05', 'large', 8, 'available', 0, 0, 1),
(26, 'L06', 'large', 8, 'available', 0, 0, 1),
(27, 'L07', 'large', 8, 'available', 0, 0, 1),
(28, 'L08', 'large', 8, 'available', 0, 0, 1),
(29, 'L09', 'large', 8, 'available', 0, 0, 1),
(30, 'L10', 'large', 8, 'available', 0, 0, 1);

-- --------------------------------------------------------

--
-- Table structure for table `event_queue`
--

CREATE TABLE `event_queue` (
  `id` bigint(20) NOT NULL,
  `topic` varchar(50) NOT NULL,
  `payload` longtext NOT NULL,
  `status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
  `attempts` int(11) NOT NULL DEFAULT 0,
  `last_error` varchar(255) DEFAULT NULL,
  `locked_by` varchar(64) DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `done_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `event_queue`
--

INSERT INTO `event_queue` (`id`, `topic`, `payload`, `status`, `attempts`, `last_error`, `locked_by`, `locked_at`, `created_at`, `done_at`) VALUES
(1, 'notify', '{\"channel\":\"line\",\"to\":\"charoenkrung_market\",\"title\":\"ใบสั่งซื้อ PO20261112-001\",\"message\":\"สวัสดีครับ ร้านนึ่งสุขขอสั่งของครับ\\n1. หมูสับ 10 กก. (กก.ละ 145)\\n2. กุ้ง 5 กก. (กก.ละ 260)\\n3. แป้งซาลาเปา 8 กก. (กก.ละ 38)\\nรวม 3 รายการ ประมาณ 3,054 บาท\\nขอรับของวันที่ 13 พ.ย. 2569 ครับ\\nขอบคุณครับ 🙏\"}', 'done', 1, NULL, 'fb535b4971fe346180b24137', '2026-11-12 12:11:44', '2026-11-12 12:11:44', '2026-11-12 12:11:44'),
(2, 'notify', '{\"channel\":\"line\",\"to\":\"asia_ingredients\",\"title\":\"ใบสั่งซื้อ PO20261112-002\",\"message\":\"สวัสดีครับ ร้านนึ่งสุขขอสั่งของครับ\\n1. แป้งสาลี 20 กก. (กก.ละ 34)\\n2. น้ำมันพืช 6 ลิตร (ลิตรละ 46)\\n3. น้ำตาล 5 กก. (กก.ละ 29)\\nรวม 3 รายการ ประมาณ 1,101 บาท\\nขอรับของวันที่ 12 พ.ย. 2569 ครับ\\nขอบคุณครับ 🙏\"}', 'done', 1, NULL, '82b306eff6284209cc24f780', '2026-11-12 12:12:32', '2026-11-12 12:12:31', '2026-11-12 12:12:32');

-- --------------------------------------------------------

--
-- Table structure for table `goods_receipts`
--

CREATE TABLE `goods_receipts` (
  `id` int(11) NOT NULL,
  `po_id` int(11) NOT NULL,
  `received_at` datetime NOT NULL DEFAULT current_timestamp(),
  `received_by` int(11) NOT NULL,
  `invoice_no` varchar(50) DEFAULT NULL,
  `invoice_amount` decimal(10,2) DEFAULT NULL,
  `invoice_image` varchar(255) DEFAULT NULL,
  `is_paid` tinyint(1) NOT NULL DEFAULT 0,
  `paid_at` date DEFAULT NULL,
  `payment_slip` varchar(255) DEFAULT NULL,
  `payment_ref` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `goods_receipts`
--

INSERT INTO `goods_receipts` (`id`, `po_id`, `received_at`, `received_by`, `invoice_no`, `invoice_amount`, `invoice_image`, `is_paid`, `paid_at`, `payment_slip`, `payment_ref`) VALUES
(4, 2, '2026-11-12 12:49:59', 1, 'INV-AS-2611-047', 1101.00, '/assets/uploads/invoice_1794462599024_2f147ed27dc2.png', 0, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `ingredients`
--

CREATE TABLE `ingredients` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `unit` varchar(20) NOT NULL,
  `qty_on_hand` decimal(10,2) NOT NULL DEFAULT 0.00,
  `reorder_point` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `ingredients`
--

INSERT INTO `ingredients` (`id`, `name`, `unit`, `qty_on_hand`, `reorder_point`, `is_active`) VALUES
(1, 'แป้งสาลี', 'กก.', 45.00, 10.00, 1),
(2, 'หมูสับ', 'กก.', 8.00, 5.00, 1),
(3, 'กุ้ง', 'กก.', 6.00, 3.00, 1),
(4, 'แป้งซาลาเปา', 'กก.', 15.00, 5.00, 1),
(5, 'น้ำมันพืช', 'ลิตร', 18.00, 4.00, 1),
(6, 'น้ำตาล', 'กก.', 15.00, 3.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `members`
--

CREATE TABLE `members` (
  `id` int(11) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `birth_date` date DEFAULT NULL,
  `tier` enum('normal','silver','gold') NOT NULL DEFAULT 'normal',
  `points_balance` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `members`
--

INSERT INTO `members` (`id`, `phone`, `name`, `birth_date`, `tier`, `points_balance`, `created_at`) VALUES
(1, '0812345678', 'มะลิ รักดี', NULL, 'gold', 320, '2026-11-03 22:06:23'),
(2, '0000000000', 'Wuwu', '2006-02-14', 'gold', 320, '2026-11-03 22:06:23'),
(3, '0927122046', 'shen xingshi', '2007-01-14', 'normal', 0, '2026-11-04 11:07:45');

-- --------------------------------------------------------

--
-- Table structure for table `member_coupons`
--

CREATE TABLE `member_coupons` (
  `id` int(11) NOT NULL,
  `member_id` int(11) NOT NULL,
  `coupon_id` int(11) NOT NULL,
  `issued_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` date DEFAULT NULL,
  `used_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `member_coupons`
--

INSERT INTO `member_coupons` (`id`, `member_id`, `coupon_id`, `issued_at`, `expires_at`, `used_at`) VALUES
(1, 1, 3, '2026-11-03 22:06:23', '2099-12-31', NULL),
(2, 1, 2, '2026-11-03 22:06:23', '2099-12-31', NULL),
(3, 3, 1, '2026-11-04 11:48:07', '2099-12-31', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `menu_categories`
--

CREATE TABLE `menu_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `menu_categories`
--

INSERT INTO `menu_categories` (`id`, `name`, `sort_order`, `is_active`) VALUES
(1, 'ซาลาเปา', 1, 1),
(2, 'ขนมจีบ', 2, 1),
(3, 'ห่อสาหร่าย', 3, 1),
(4, 'ฮะเก๋า', 4, 1),
(5, 'เมนูจานหลัก', 5, 1),
(6, 'เมนูทอด', 6, 1),
(7, 'หมี่หยก', 7, 1),
(8, 'ชุดเซ็ต', 8, 1);

-- --------------------------------------------------------

--
-- Table structure for table `menu_items`
--

CREATE TABLE `menu_items` (
  `id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `unit` varchar(20) NOT NULL DEFAULT 'เข่ง',
  `kitchen_zone` enum('steam','fry','congee_noodle','drink_dessert') NOT NULL DEFAULT 'steam',
  `image_path` varchar(255) DEFAULT NULL,
  `lot_size` int(11) NOT NULL DEFAULT 1,
  `available_qty` int(11) DEFAULT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `menu_items`
--

INSERT INTO `menu_items` (`id`, `category_id`, `name`, `description`, `price`, `unit`, `kitchen_zone`, `image_path`, `lot_size`, `available_qty`, `is_available`, `is_deleted`, `created_at`, `updated_at`) VALUES
(1, 1, 'ซาลาเปาหมูสับ', 'ไส้คลาสสิก', 30.00, 'ลูก', 'steam', '/assets/img/menu/bun-pork.jpg', 10, 39, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(2, 1, 'ซาลาเปาหมูแดง', 'ไส้คลาสสิก', 30.00, 'ลูก', 'steam', '/assets/img/menu/bun-bbq-pork.jpg', 10, 39, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(3, 1, 'ซาลาเปาครีม', 'ไส้คลาสสิก', 30.00, 'ลูก', 'steam', '/assets/img/menu/bun-cream.jpg', 10, 40, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(4, 1, 'ซาลาเปาถั่วแดง', 'ไส้คลาสสิก', 30.00, 'ลูก', 'steam', '/assets/img/menu/bun-red-bean.jpg', 10, 39, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(5, 1, 'ซาลาเปาเห็ดหอม', 'มังสวิรัติ', 30.00, 'ลูก', 'steam', '/assets/img/menu/bun-mushroom.jpg', 10, 29, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(6, 1, 'ซาลาเปาหมูสับไข่เค็ม', 'พรีเมียม', 39.00, 'ลูก', 'steam', '/assets/img/menu/bun-salted-egg.jpg', 10, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(7, 1, 'ซาลาเปาไข่เค็มลาวาทอด', 'แป้งกรอบนอก เยิ้มใน', 39.00, 'ลูก', 'fry', '/assets/img/menu/bun-lava.jpg', 10, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(8, 1, 'เสี่ยวหลงเปา', 'เข่งละ 3 ชิ้น', 59.00, 'เข่ง', 'steam', NULL, 5, 0, 0, 0, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(9, 2, 'ขนมจีบหมู', 'เข่งละ 3–4 ชิ้น', 45.00, 'เข่ง', 'steam', '/assets/img/menu/shumai-pork.jpg', 5, 40, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(10, 2, 'ขนมจีบกุ้ง', 'เข่งละ 3–4 ชิ้น', 59.00, 'เข่ง', 'steam', '/assets/img/menu/shumai-shrimp.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(11, 2, 'ขนมจีบปู', 'เข่งละ 3–4 ชิ้น', 65.00, 'เข่ง', 'steam', '/assets/img/menu/shumai-crab.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(12, 2, 'ขนมจีบเห็ดหอมวุ้นเส้น', 'มังสวิรัติ เข่งละ 3–4 ชิ้น', 45.00, 'เข่ง', 'steam', '/assets/img/menu/shumai-veg.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(13, 3, 'หมูห่อสาหร่าย', 'เข่งละ 3–4 ชิ้น', 45.00, 'เข่ง', 'steam', '/assets/img/menu/seaweed-pork.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(14, 3, 'กุ้งห่อสาหร่าย', 'เข่งละ 3–4 ชิ้น', 59.00, 'เข่ง', 'steam', '/assets/img/menu/seaweed-shrimp.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(15, 3, 'ปูห่อสาหร่าย', 'เข่งละ 3–4 ชิ้น', 65.00, 'เข่ง', 'steam', '/assets/img/menu/seaweed-crab.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(16, 4, 'ฮะเก๋ากุ้ง', 'เข่งละ 3–4 ชิ้น', 59.00, 'เข่ง', 'steam', '/assets/img/menu/hakao-shrimp.jpg', 5, 40, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(17, 4, 'ฮะเก๋าปู', 'เข่งละ 3–4 ชิ้น', 65.00, 'เข่ง', 'steam', '/assets/img/menu/hakao-crab.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(18, 5, 'ก๋วยเตี๋ยวหลอดหมูสับ', NULL, 65.00, 'จาน', 'congee_noodle', '/assets/img/menu/rice-roll.jpg', 1, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(19, 5, 'ขาไก่นึ่งเต้าซี่น้ำแดง', NULL, 69.00, 'จาน', 'steam', '/assets/img/menu/chicken-feet-steamed.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(20, 5, 'ขาไก่ต้มน้ำแดง', NULL, 69.00, 'จาน', 'congee_noodle', '/assets/img/menu/chicken-feet-braised.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(21, 5, 'ซี่โครงหมูน้ำแดง', NULL, 79.00, 'จาน', 'congee_noodle', '/assets/img/menu/pork-ribs.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(22, 5, 'บักกุ๊ดเต๊หม้อดิน', 'กระดูกหมูตุ๋นยาจีนเข้มข้น', 129.00, 'หม้อ', 'congee_noodle', '/assets/img/menu/bak-kut-teh.jpg', 1, 20, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(23, 5, 'ปลากระพงนึ่งซีอิ๊ว', NULL, 149.00, 'จาน', 'steam', '/assets/img/menu/sea-bass.jpg', 1, 20, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(24, 6, 'ขนมผักกาดทอด', 'จานละ 3 ชิ้น', 55.00, 'จาน', 'fry', '/assets/img/menu/turnip-cake.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(25, 6, 'เผือกทอด', 'จานละ 3 ชิ้น', 59.00, 'จาน', 'fry', '/assets/img/menu/taro-fried.jpg', 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(26, 6, 'ถุงทองมังกรหยก', 'จานละ 3 ชิ้น', 59.00, 'จาน', 'fry', NULL, 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(27, 6, 'ฟองเต้าหู้ทอด', 'จานละ 3 ชิ้น', 65.00, 'จาน', 'fry', NULL, 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(28, 6, 'ขนมปังหน้ากุ้งซอสไข่เค็ม', 'เมนูซิกเนเจอร์ จานละ 3 ชิ้น', 69.00, 'จาน', 'fry', NULL, 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(29, 7, 'หมี่หยกพันกุ้ง', 'เข่งละ 3–4 ชิ้น', 55.00, 'เข่ง', 'steam', NULL, 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(30, 7, 'หมี่หยกพันไข่เค็ม', 'เข่งละ 3–4 ชิ้น', 49.00, 'เข่ง', 'steam', NULL, 5, 30, 1, 0, '2026-11-03 22:06:23', '2026-11-03 22:06:23'),
(31, 8, 'Set A: Single Delight', '1 ท่าน · ก๋วยเตี๋ยวหลอดหมูสับ/ซี่โครงหมูน้ำแดง + ขนมจีบหมู/กุ้ง + ซาลาเปา 1 ลูก', 139.00, 'ชุด', 'congee_noodle', '/assets/img/menu/set-a.jpg', 1, 20, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(32, 8, 'Set B: Duo Signature', '2 ท่าน · บักกุ๊ดเต๊/ปลากระพง + ฮะเก๋ากุ้ง + ขนมจีบปู/กุ้งห่อสาหร่าย + ของทอด 1 + ซาลาเปาไข่เค็ม 2 ลูก', 319.00, 'ชุด', 'congee_noodle', '/assets/img/menu/set-b.jpg', 1, 20, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06'),
(33, 8, 'Set C: Family & Gathering', '3–4 ท่าน · จานหลัก 2 + ติ่มซำนึ่ง 3 + เสี่ยวหลงเปา + ของทอด 1 + ซาลาเปารวม 4 ลูก', 549.00, 'ชุด', 'congee_noodle', '/assets/img/menu/set-c.jpg', 1, 20, 1, 0, '2026-11-03 22:06:23', '2026-11-10 21:41:06');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` bigint(20) NOT NULL,
  `event_id` bigint(20) DEFAULT NULL,
  `channel` enum('sms','line','system') NOT NULL DEFAULT 'system',
  `recipient` varchar(100) DEFAULT NULL,
  `title` varchar(150) DEFAULT NULL,
  `message` text NOT NULL,
  `status` enum('sent','failed') NOT NULL DEFAULT 'sent',
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `event_id`, `channel`, `recipient`, `title`, `message`, `status`, `created_at`) VALUES
(1, 1, 'line', 'charoenkrung_market', 'ใบสั่งซื้อ PO20261112-001', 'สวัสดีครับ ร้านนึ่งสุขขอสั่งของครับ\n1. หมูสับ 10 กก. (กก.ละ 145)\n2. กุ้ง 5 กก. (กก.ละ 260)\n3. แป้งซาลาเปา 8 กก. (กก.ละ 38)\nรวม 3 รายการ ประมาณ 3,054 บาท\nขอรับของวันที่ 13 พ.ย. 2569 ครับ\nขอบคุณครับ 🙏', 'sent', '2026-11-12 12:11:44'),
(2, 2, 'line', 'asia_ingredients', 'ใบสั่งซื้อ PO20261112-002', 'สวัสดีครับ ร้านนึ่งสุขขอสั่งของครับ\n1. แป้งสาลี 20 กก. (กก.ละ 34)\n2. น้ำมันพืช 6 ลิตร (ลิตรละ 46)\n3. น้ำตาล 5 กก. (กก.ละ 29)\nรวม 3 รายการ ประมาณ 1,101 บาท\nขอรับของวันที่ 12 พ.ย. 2569 ครับ\nขอบคุณครับ 🙏', 'sent', '2026-11-12 12:12:32');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `bill_id` int(11) NOT NULL,
  `round_no` int(11) NOT NULL,
  `source` enum('qr','staff','vip_preorder') NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `bill_id`, `round_no`, `source`, `created_by`, `cancelled_at`, `created_at`) VALUES
(5, 1, 1, 'qr', NULL, NULL, '2026-11-10 21:30:20');

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `menu_item_id` int(11) NOT NULL,
  `qty` int(11) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `status` enum('waiting','cooking','ready','done','cancelled') NOT NULL DEFAULT 'waiting',
  `cancelled_qty` int(11) NOT NULL DEFAULT 0,
  `stock_taken` int(11) NOT NULL DEFAULT 0,
  `cancel_reason` enum('customer','out_of_stock','spoiled','other') DEFAULT NULL,
  `cancel_note` varchar(255) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Dumping data for table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `menu_item_id`, `qty`, `unit_price`, `status`, `cancelled_qty`, `stock_taken`, `cancel_reason`, `cancel_note`, `updated_by`, `updated_at`) VALUES
(1, 5, 1, 1, 30.00, 'done', 0, 1, NULL, NULL, 1, '2026-11-10 21:56:22'),
(2, 5, 2, 1, 30.00, 'done', 0, 1, NULL, NULL, 1, '2026-11-10 21:56:23'),
(3, 5, 5, 1, 30.00, 'done', 0, 1, NULL, NULL, 1, '2026-11-10 21:56:22'),
(4, 5, 4, 1, 30.00, 'done', 0, 1, NULL, NULL, 1, '2026-11-10 21:56:24');

-- --------------------------------------------------------

--
-- Table structure for table `point_transactions`
--

CREATE TABLE `point_transactions` (
  `id` int(11) NOT NULL,
  `member_id` int(11) NOT NULL,
  `bill_id` int(11) DEFAULT NULL,
  `points` int(11) NOT NULL,
  `type` enum('earn','redeem','expire') NOT NULL,
  `reward_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `prep_plans`
--

CREATE TABLE `prep_plans` (
  `id` int(11) NOT NULL,
  `plan_date` date NOT NULL,
  `menu_item_id` int(11) NOT NULL,
  `suggested_qty` int(11) NOT NULL,
  `confirmed_qty` int(11) DEFAULT NULL,
  `confirmed_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_holidays`
--

CREATE TABLE `public_holidays` (
  `id` int(11) NOT NULL,
  `holiday_date` date NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `public_holidays`
--

INSERT INTO `public_holidays` (`id`, `holiday_date`, `name`) VALUES
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

-- --------------------------------------------------------

--
-- Table structure for table `purchase_orders`
--

CREATE TABLE `purchase_orders` (
  `id` int(11) NOT NULL,
  `po_no` varchar(20) NOT NULL,
  `supplier_id` int(11) NOT NULL,
  `status` enum('draft','sent','received','cancelled') NOT NULL DEFAULT 'draft',
  `order_date` date NOT NULL,
  `expected_date` date DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `purchase_orders`
--

INSERT INTO `purchase_orders` (`id`, `po_no`, `supplier_id`, `status`, `order_date`, `expected_date`, `note`, `created_by`, `created_at`) VALUES
(1, 'PO20261112-001', 1, 'sent', '2026-11-12', '2026-11-13', NULL, 2, '2026-11-12 12:11:44'),
(2, 'PO20261112-002', 2, 'received', '2026-11-12', '2026-11-12', NULL, 2, '2026-11-12 12:12:31');

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_items`
--

CREATE TABLE `purchase_order_items` (
  `id` int(11) NOT NULL,
  `po_id` int(11) NOT NULL,
  `ingredient_id` int(11) NOT NULL,
  `qty` decimal(10,2) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `purchase_order_items`
--

INSERT INTO `purchase_order_items` (`id`, `po_id`, `ingredient_id`, `qty`, `unit_price`) VALUES
(1, 1, 2, 10.00, 145.00),
(2, 1, 3, 5.00, 260.00),
(3, 1, 4, 8.00, 38.00),
(4, 2, 1, 20.00, 34.00),
(5, 2, 5, 6.00, 46.00),
(6, 2, 6, 5.00, 29.00);

-- --------------------------------------------------------

--
-- Table structure for table `queue_tickets`
--

CREATE TABLE `queue_tickets` (
  `id` int(11) NOT NULL,
  `queue_no` varchar(10) NOT NULL,
  `group_type` enum('bar','small','large') NOT NULL,
  `party_size` int(11) NOT NULL,
  `status` enum('waiting','called','seated','skipped') NOT NULL DEFAULT 'waiting',
  `called_count` int(11) NOT NULL DEFAULT 0,
  `bill_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `called_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rewards`
--

CREATE TABLE `rewards` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `points_cost` int(11) NOT NULL,
  `reward_type` enum('free_item','discount') NOT NULL,
  `menu_item_id` int(11) DEFAULT NULL,
  `discount_value` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `rewards`
--

INSERT INTO `rewards` (`id`, `name`, `points_cost`, `reward_type`, `menu_item_id`, `discount_value`, `is_active`) VALUES
(1, 'ฟรีซาลาเปาครีม', 100, 'free_item', 3, NULL, 1),
(2, 'ส่วนลด 20 บาท', 150, 'discount', NULL, 20.00, 1);

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id` int(11) NOT NULL,
  `role_code` varchar(20) NOT NULL,
  `role_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`id`, `role_code`, `role_name`) VALUES
(1, 'customer', 'ลูกค้า'),
(2, 'staff', 'พนักงานหน้าร้าน'),
(3, 'head_chef', 'หัวหน้าเชฟ'),
(4, 'manager', 'ผู้จัดการ'),
(5, 'owner', 'เจ้าของร้าน');

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `sid` varchar(128) NOT NULL,
  `data` mediumtext NOT NULL,
  `expires` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`sid`, `data`, `expires`) VALUES
('CMWBIOc-Yt-Eh6o0iSghSPLyo37B5dA1', '{\"cookie\":{\"originalMaxAge\":null,\"expires\":null,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"userId\":1}', 1794549035183),
('GLM-s8CGZv1CKnSvHGu4pYZ2DcwX5fEO', '{\"cookie\":{\"originalMaxAge\":null,\"expires\":null,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"userId\":4}', 1794546727673),
('Iu-fltpSPjY2HnT3cLkEYxG3nvfnPQ8B', '{\"cookie\":{\"originalMaxAge\":null,\"expires\":null,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"userId\":2}', 1794546778715),
('XfVkriFqMEHkBG3ioV78fdmZNo6l_833', '{\"cookie\":{\"originalMaxAge\":null,\"expires\":null,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"userId\":2}', 1794549367439);

-- --------------------------------------------------------

--
-- Table structure for table `shift_closings`
--

CREATE TABLE `shift_closings` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `shift_date` date NOT NULL,
  `shift` enum('morning','evening') NOT NULL,
  `counted_cash` decimal(10,2) NOT NULL,
  `system_cash` decimal(10,2) NOT NULL,
  `difference` decimal(10,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shop_settings`
--

CREATE TABLE `shop_settings` (
  `id` int(11) NOT NULL DEFAULT 1,
  `shop_name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `morning_open` time NOT NULL DEFAULT '10:00:00',
  `morning_last_order` time NOT NULL DEFAULT '13:30:00',
  `morning_close` time NOT NULL DEFAULT '14:00:00',
  `evening_open` time NOT NULL DEFAULT '16:00:00',
  `evening_last_order` time NOT NULL DEFAULT '19:30:00',
  `evening_close` time NOT NULL DEFAULT '20:00:00',
  `max_qty_per_item` int(11) NOT NULL DEFAULT 10,
  `vip_min_spend` decimal(10,2) NOT NULL DEFAULT 3000.00,
  `vip_deposit_percent` int(11) NOT NULL DEFAULT 50,
  `vip_max_hours` int(11) NOT NULL DEFAULT 4
) ;

--
-- Dumping data for table `shop_settings`
--

INSERT INTO `shop_settings` (`id`, `shop_name`, `phone`, `email`, `address`, `morning_open`, `morning_last_order`, `morning_close`, `evening_open`, `evening_last_order`, `evening_close`, `max_qty_per_item`, `vip_min_spend`, `vip_deposit_percent`, `vip_max_hours`) VALUES
(1, 'นึ่งสุข', '02-000-0000', 'contact@nuengsuk.local', '99/9 ถนนเจริญกรุง แขวงสัมพันธวงศ์ เขตสัมพันธวงศ์ กรุงเทพฯ 10100', '10:00:00', '13:30:00', '14:00:00', '16:00:00', '19:30:00', '20:00:00', 10, 3000.00, 50, 4);

-- --------------------------------------------------------

--
-- Table structure for table `stock_movements`
--

CREATE TABLE `stock_movements` (
  `id` int(11) NOT NULL,
  `ingredient_id` int(11) NOT NULL,
  `qty` decimal(10,2) NOT NULL,
  `movement_type` enum('receive','use','waste','adjust') NOT NULL,
  `goods_receipt_id` int(11) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `stock_movements`
--

INSERT INTO `stock_movements` (`id`, `ingredient_id`, `qty`, `movement_type`, `goods_receipt_id`, `expiry_date`, `note`, `created_by`, `created_at`) VALUES
(9, 1, 20.00, 'receive', 4, NULL, 'รับของตาม PO20261112-002', 1, '2026-11-12 12:49:59'),
(10, 5, 6.00, 'receive', 4, NULL, 'รับของตาม PO20261112-002', 1, '2026-11-12 12:49:59'),
(11, 6, 5.00, 'receive', 4, NULL, 'รับของตาม PO20261112-002', 1, '2026-11-12 12:49:59');

-- --------------------------------------------------------

--
-- Table structure for table `suppliers`
--

CREATE TABLE `suppliers` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `contact_name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `line_id` varchar(50) DEFAULT NULL,
  `lead_time_days` int(11) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `suppliers`
--

INSERT INTO `suppliers` (`id`, `name`, `contact_name`, `phone`, `line_id`, `lead_time_days`, `is_active`) VALUES
(1, 'ตลาดสดเจริญกรุง', 'ฝ่ายขาย', NULL, 'charoenkrung_market', 1, 1),
(2, 'วัตถุดิบเอเชีย', 'ฝ่ายขาย', NULL, 'asia_ingredients', 2, 1),
(3, 'ฟู้ดเซอร์วิส กรุงเทพ', 'ฝ่ายขาย', NULL, 'foodservice_bkk', 2, 1),
(4, 'แป้งดี ซัพพลาย', 'ฝ่ายขาย', NULL, 'pangdee_supply', 3, 1);

-- --------------------------------------------------------

--
-- Table structure for table `supplier_prices`
--

CREATE TABLE `supplier_prices` (
  `supplier_id` int(11) NOT NULL,
  `ingredient_id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `quoted_at` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `supplier_prices`
--

INSERT INTO `supplier_prices` (`supplier_id`, `ingredient_id`, `price`, `quoted_at`) VALUES
(1, 1, 32.00, '2026-10-01'),
(1, 2, 145.00, '2026-10-01'),
(1, 3, 260.00, '2026-10-01'),
(1, 4, 38.00, '2026-10-01'),
(1, 5, 48.00, '2026-10-01'),
(1, 6, 28.00, '2026-10-01'),
(2, 1, 34.00, '2026-10-01'),
(2, 2, 150.00, '2026-10-01'),
(2, 3, 250.00, '2026-10-01'),
(2, 4, 36.00, '2026-10-01'),
(2, 5, 46.00, '2026-10-01'),
(2, 6, 29.00, '2026-10-01'),
(3, 1, 30.00, '2026-10-01'),
(3, 2, 155.00, '2026-10-01'),
(3, 3, 270.00, '2026-10-01'),
(3, 4, 40.00, '2026-10-01'),
(3, 5, 45.00, '2026-10-01'),
(3, 6, 27.00, '2026-10-01'),
(4, 1, 31.00, '2026-10-01'),
(4, 2, 148.00, '2026-10-01'),
(4, 3, 255.00, '2026-10-01'),
(4, 4, 35.00, '2026-10-01'),
(4, 5, 47.00, '2026-10-01'),
(4, 6, 26.00, '2026-10-01');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `role_id` int(11) NOT NULL,
  `can_payment` tinyint(1) NOT NULL DEFAULT 1,
  `can_vip_booking` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `deactivated_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password_hash`, `full_name`, `phone`, `role_id`, `can_payment`, `can_vip_booking`, `is_active`, `deactivated_at`, `created_at`, `updated_at`) VALUES
(1, 'owner', '$2a$10$g4CY/r4Fw/zVwi2DVn7fh.SgFMQ./e0k8cF8HOKKO6dodDiwJhcFy', 'สมชาย', NULL, 5, 1, 1, 1, NULL, '2026-10-28 23:58:13', '2026-10-28 23:58:13'),
(2, 'wipa', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'วิภา', NULL, 4, 1, 1, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43'),
(3, 'ahmei', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'อาเหม่ย', NULL, 3, 0, 0, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43'),
(4, 'ton', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'ต้น', NULL, 2, 1, 1, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43'),
(5, 'fon', '$2a$10$n5Cq4m9NQM.GDbFsGnMwlOUxMmfle7dfcoQqyDxCJpl7/R0cN50Pe', 'ฝน', NULL, 2, 0, 1, 1, NULL, '2026-10-29 00:13:43', '2026-10-29 00:13:43');

-- --------------------------------------------------------

--
-- Table structure for table `vip_bookings`
--

CREATE TABLE `vip_bookings` (
  `id` int(11) NOT NULL,
  `vip_room_id` int(11) NOT NULL,
  `package_id` int(11) DEFAULT NULL,
  `booking_date` date NOT NULL,
  `start_time` time NOT NULL,
  `hours` int(11) DEFAULT NULL,
  `customer_name` varchar(100) NOT NULL,
  `customer_phone` varchar(20) NOT NULL,
  `guests` int(11) NOT NULL,
  `preorder_total` decimal(10,2) NOT NULL,
  `room_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `deposit_amount` decimal(10,2) NOT NULL,
  `deposit_received_at` datetime DEFAULT NULL,
  `deposit_received_by` int(11) DEFAULT NULL,
  `status` enum('pending_deposit','confirmed','arrived','no_show','cancelled','released') NOT NULL DEFAULT 'pending_deposit',
  `bill_id` int(11) DEFAULT NULL,
  `evening_bill_id` int(11) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `reschedule_count` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `rescheduled_from` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`rescheduled_from`)),
  `released_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(255) DEFAULT NULL,
  `deposit_refunded_at` datetime DEFAULT NULL,
  `deposit_refunded_by` int(11) DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `vip_booking_items`
--

CREATE TABLE `vip_booking_items` (
  `id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `menu_item_id` int(11) NOT NULL,
  `qty` int(11) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vip_packages`
--

CREATE TABLE `vip_packages` (
  `id` int(11) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `hours` int(11) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `vip_packages`
--

INSERT INTO `vip_packages` (`id`, `code`, `name`, `hours`, `price`, `sort_order`, `is_active`) VALUES
(1, 'S', 'แพ็กเกจ S', 2, 1200.00, 1, 1),
(2, 'M', 'แพ็กเกจ M', 3, 1600.00, 2, 1),
(3, 'L', 'แพ็กเกจ L', 4, 2000.00, 3, 1),
(4, 'FULLDAY', 'เหมารอบ', NULL, 3500.00, 4, 1);

-- --------------------------------------------------------

--
-- Table structure for table `vip_rooms`
--

CREATE TABLE `vip_rooms` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `seats` int(11) NOT NULL DEFAULT 15,
  `status` enum('available','occupied') NOT NULL DEFAULT 'available',
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ;

--
-- Dumping data for table `vip_rooms`
--

INSERT INTO `vip_rooms` (`id`, `name`, `seats`, `status`, `is_active`) VALUES
(1, 'VIP 1', 15, 'available', 1),
(2, 'VIP 2', 15, 'available', 1),
(3, 'VIP 3', 15, 'available', 1),
(4, 'VIP 4', 15, 'available', 1),
(5, 'VIP 5', 15, 'available', 1),
(6, 'VIP 6', 15, 'available', 1);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_log_time` (`created_at`);

--
-- Indexes for table `banners`
--
ALTER TABLE `banners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `bills`
--
ALTER TABLE `bills`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bill_no` (`bill_no`),
  ADD UNIQUE KEY `qr_token` (`qr_token`),
  ADD KEY `vip_room_id` (`vip_room_id`),
  ADD KEY `opened_by` (`opened_by`),
  ADD KEY `closed_by` (`closed_by`),
  ADD KEY `member_id` (`member_id`),
  ADD KEY `idx_bill_time` (`opened_at`,`closed_at`);

--
-- Indexes for table `bill_tables`
--
ALTER TABLE `bill_tables`
  ADD PRIMARY KEY (`bill_id`,`table_id`),
  ADD KEY `table_id` (`table_id`);

--
-- Indexes for table `coupons`
--
ALTER TABLE `coupons`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `free_menu_item_id` (`free_menu_item_id`);

--
-- Indexes for table `coupon_usages`
--
ALTER TABLE `coupon_usages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `coupon_id` (`coupon_id`),
  ADD KEY `bill_id` (`bill_id`),
  ADD KEY `member_id` (`member_id`);

--
-- Indexes for table `dining_tables`
--
ALTER TABLE `dining_tables`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `event_queue`
--
ALTER TABLE `event_queue`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_queue_pick` (`topic`,`status`,`id`);

--
-- Indexes for table `goods_receipts`
--
ALTER TABLE `goods_receipts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `po_id` (`po_id`),
  ADD KEY `received_by` (`received_by`);

--
-- Indexes for table `ingredients`
--
ALTER TABLE `ingredients`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `members`
--
ALTER TABLE `members`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `phone` (`phone`);

--
-- Indexes for table `member_coupons`
--
ALTER TABLE `member_coupons`
  ADD PRIMARY KEY (`id`),
  ADD KEY `member_id` (`member_id`),
  ADD KEY `coupon_id` (`coupon_id`);

--
-- Indexes for table `menu_categories`
--
ALTER TABLE `menu_categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `menu_items`
--
ALTER TABLE `menu_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `category_id` (`category_id`),
  ADD KEY `idx_menu_name` (`name`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_time` (`created_at`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bill_round` (`bill_id`,`round_no`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `menu_item_id` (`menu_item_id`),
  ADD KEY `updated_by` (`updated_by`);

--
-- Indexes for table `point_transactions`
--
ALTER TABLE `point_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `member_id` (`member_id`),
  ADD KEY `bill_id` (`bill_id`),
  ADD KEY `reward_id` (`reward_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `prep_plans`
--
ALTER TABLE `prep_plans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_plan` (`plan_date`,`menu_item_id`),
  ADD KEY `menu_item_id` (`menu_item_id`),
  ADD KEY `confirmed_by` (`confirmed_by`);

--
-- Indexes for table `public_holidays`
--
ALTER TABLE `public_holidays`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `holiday_date` (`holiday_date`);

--
-- Indexes for table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `po_no` (`po_no`),
  ADD KEY `supplier_id` (`supplier_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `purchase_order_items`
--
ALTER TABLE `purchase_order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `po_id` (`po_id`),
  ADD KEY `ingredient_id` (`ingredient_id`);

--
-- Indexes for table `queue_tickets`
--
ALTER TABLE `queue_tickets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `bill_id` (`bill_id`);

--
-- Indexes for table `rewards`
--
ALTER TABLE `rewards`
  ADD PRIMARY KEY (`id`),
  ADD KEY `menu_item_id` (`menu_item_id`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `role_code` (`role_code`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`sid`),
  ADD KEY `idx_sessions_expires` (`expires`);

--
-- Indexes for table `shift_closings`
--
ALTER TABLE `shift_closings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `shop_settings`
--
ALTER TABLE `shop_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `stock_movements`
--
ALTER TABLE `stock_movements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ingredient_id` (`ingredient_id`),
  ADD KEY `goods_receipt_id` (`goods_receipt_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `suppliers`
--
ALTER TABLE `suppliers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `supplier_prices`
--
ALTER TABLE `supplier_prices`
  ADD PRIMARY KEY (`supplier_id`,`ingredient_id`),
  ADD KEY `ingredient_id` (`ingredient_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD KEY `role_id` (`role_id`);

--
-- Indexes for table `vip_bookings`
--
ALTER TABLE `vip_bookings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vip_room_id` (`vip_room_id`),
  ADD KEY `deposit_received_by` (`deposit_received_by`),
  ADD KEY `bill_id` (`bill_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `fk_vip_booking_package` (`package_id`),
  ADD KEY `fk_vip_booking_evening_bill` (`evening_bill_id`),
  ADD KEY `fk_vip_booking_refunded_by` (`deposit_refunded_by`);

--
-- Indexes for table `vip_booking_items`
--
ALTER TABLE `vip_booking_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `booking_id` (`booking_id`),
  ADD KEY `menu_item_id` (`menu_item_id`);

--
-- Indexes for table `vip_packages`
--
ALTER TABLE `vip_packages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `vip_rooms`
--
ALTER TABLE `vip_rooms`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_logs`
--
ALTER TABLE `activity_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT for table `banners`
--
ALTER TABLE `banners`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `bills`
--
ALTER TABLE `bills`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `coupons`
--
ALTER TABLE `coupons`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `coupon_usages`
--
ALTER TABLE `coupon_usages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `dining_tables`
--
ALTER TABLE `dining_tables`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31;

--
-- AUTO_INCREMENT for table `event_queue`
--
ALTER TABLE `event_queue`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `goods_receipts`
--
ALTER TABLE `goods_receipts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `ingredients`
--
ALTER TABLE `ingredients`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `members`
--
ALTER TABLE `members`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `member_coupons`
--
ALTER TABLE `member_coupons`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `menu_categories`
--
ALTER TABLE `menu_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `menu_items`
--
ALTER TABLE `menu_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `point_transactions`
--
ALTER TABLE `point_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `prep_plans`
--
ALTER TABLE `prep_plans`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_holidays`
--
ALTER TABLE `public_holidays`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT for table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `purchase_order_items`
--
ALTER TABLE `purchase_order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `queue_tickets`
--
ALTER TABLE `queue_tickets`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rewards`
--
ALTER TABLE `rewards`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `shift_closings`
--
ALTER TABLE `shift_closings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stock_movements`
--
ALTER TABLE `stock_movements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `suppliers`
--
ALTER TABLE `suppliers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `vip_bookings`
--
ALTER TABLE `vip_bookings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vip_booking_items`
--
ALTER TABLE `vip_booking_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vip_packages`
--
ALTER TABLE `vip_packages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `vip_rooms`
--
ALTER TABLE `vip_rooms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD CONSTRAINT `activity_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `banners`
--
ALTER TABLE `banners`
  ADD CONSTRAINT `banners_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `bills`
--
ALTER TABLE `bills`
  ADD CONSTRAINT `bills_ibfk_1` FOREIGN KEY (`vip_room_id`) REFERENCES `vip_rooms` (`id`),
  ADD CONSTRAINT `bills_ibfk_2` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `bills_ibfk_3` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `bills_ibfk_4` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`);

--
-- Constraints for table `bill_tables`
--
ALTER TABLE `bill_tables`
  ADD CONSTRAINT `bill_tables_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  ADD CONSTRAINT `bill_tables_ibfk_2` FOREIGN KEY (`table_id`) REFERENCES `dining_tables` (`id`);

--
-- Constraints for table `coupons`
--
ALTER TABLE `coupons`
  ADD CONSTRAINT `coupons_ibfk_1` FOREIGN KEY (`free_menu_item_id`) REFERENCES `menu_items` (`id`);

--
-- Constraints for table `coupon_usages`
--
ALTER TABLE `coupon_usages`
  ADD CONSTRAINT `coupon_usages_ibfk_1` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`),
  ADD CONSTRAINT `coupon_usages_ibfk_2` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  ADD CONSTRAINT `coupon_usages_ibfk_3` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`);

--
-- Constraints for table `goods_receipts`
--
ALTER TABLE `goods_receipts`
  ADD CONSTRAINT `goods_receipts_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  ADD CONSTRAINT `goods_receipts_ibfk_2` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `member_coupons`
--
ALTER TABLE `member_coupons`
  ADD CONSTRAINT `member_coupons_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`),
  ADD CONSTRAINT `member_coupons_ibfk_2` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`);

--
-- Constraints for table `menu_items`
--
ALTER TABLE `menu_items`
  ADD CONSTRAINT `menu_items_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `menu_categories` (`id`);

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  ADD CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`),
  ADD CONSTRAINT `order_items_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `point_transactions`
--
ALTER TABLE `point_transactions`
  ADD CONSTRAINT `point_transactions_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`),
  ADD CONSTRAINT `point_transactions_ibfk_2` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  ADD CONSTRAINT `point_transactions_ibfk_3` FOREIGN KEY (`reward_id`) REFERENCES `rewards` (`id`),
  ADD CONSTRAINT `point_transactions_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `prep_plans`
--
ALTER TABLE `prep_plans`
  ADD CONSTRAINT `prep_plans_ibfk_1` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`),
  ADD CONSTRAINT `prep_plans_ibfk_2` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  ADD CONSTRAINT `purchase_orders_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  ADD CONSTRAINT `purchase_orders_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `purchase_order_items`
--
ALTER TABLE `purchase_order_items`
  ADD CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  ADD CONSTRAINT `purchase_order_items_ibfk_2` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`);

--
-- Constraints for table `queue_tickets`
--
ALTER TABLE `queue_tickets`
  ADD CONSTRAINT `queue_tickets_ibfk_1` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`);

--
-- Constraints for table `rewards`
--
ALTER TABLE `rewards`
  ADD CONSTRAINT `rewards_ibfk_1` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`);

--
-- Constraints for table `shift_closings`
--
ALTER TABLE `shift_closings`
  ADD CONSTRAINT `shift_closings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `stock_movements`
--
ALTER TABLE `stock_movements`
  ADD CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`),
  ADD CONSTRAINT `stock_movements_ibfk_2` FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts` (`id`),
  ADD CONSTRAINT `stock_movements_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `supplier_prices`
--
ALTER TABLE `supplier_prices`
  ADD CONSTRAINT `supplier_prices_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  ADD CONSTRAINT `supplier_prices_ibfk_2` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`);

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

--
-- Constraints for table `vip_bookings`
--
ALTER TABLE `vip_bookings`
  ADD CONSTRAINT `fk_vip_booking_evening_bill` FOREIGN KEY (`evening_bill_id`) REFERENCES `bills` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vip_booking_package` FOREIGN KEY (`package_id`) REFERENCES `vip_packages` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vip_booking_refunded_by` FOREIGN KEY (`deposit_refunded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `vip_bookings_ibfk_1` FOREIGN KEY (`vip_room_id`) REFERENCES `vip_rooms` (`id`),
  ADD CONSTRAINT `vip_bookings_ibfk_2` FOREIGN KEY (`deposit_received_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `vip_bookings_ibfk_3` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  ADD CONSTRAINT `vip_bookings_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `vip_booking_items`
--
ALTER TABLE `vip_booking_items`
  ADD CONSTRAINT `vip_booking_items_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `vip_bookings` (`id`),
  ADD CONSTRAINT `vip_booking_items_ibfk_2` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
