// ===== ค่าที่แต่ละเครื่องต้องแก้เอง =====
// ไฟล์นี้อยู่ฝั่ง server เบราว์เซอร์มองไม่เห็น (หน้าเว็บอยู่ในโฟลเดอร์ public/ เท่านั้น)
module.exports = {
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',       // XAMPP ค่าเริ่มต้นไม่มีรหัสผ่าน
    database: process.env.DB_NAME || 'dimsum',
  },
  port: Number(process.env.PORT || 3000),

  // ตอนพัฒนา: ใช้ localhost ได้เลย
  // วัน demo ถ้าให้มือถือสแกน QR: เปลี่ยนเป็น IP ของเครื่อง server เช่น 'http://192.168.1.25:3000'
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  sessionSecret: 'dimsum-csi400-change-me',

  // ===== Microservices =====
  // server หลัก (port ด้านบน) เป็น API Gateway: รับทุกคำขอแล้วส่งต่อ path ของ service ไปยัง port ของมัน
  // หน้าเว็บเรียก /api/kitchen เหมือนเดิม ไม่ต้องรู้ว่าอยู่ service ไหน
  // ถ้า service ไหนแยกไปเครื่องอื่น ให้ตั้ง SERVICE_HOST หรือแก้ host ของตัวนั้น
  serviceHost: process.env.SERVICE_HOST || '127.0.0.1',
  services: {
    kitchen:   { label: 'ครัว',       port: Number(process.env.KITCHEN_PORT || 4001),   paths: ['kitchen'] },
    inventory: { label: 'คลังสินค้า', port: Number(process.env.INVENTORY_PORT || 4002), paths: ['ingredients', 'suppliers', 'purchase_orders', 'goods_receipts', 'stock'] },
    notify:    { label: 'แจ้งเตือน',  port: Number(process.env.NOTIFY_PORT || 4003),    paths: ['notifications'] },
  },
  timezone: 'Asia/Bangkok',
};
