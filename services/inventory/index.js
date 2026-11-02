// ระบบคลังสินค้า (inventory-service) · port 4002 · เฟส 4
// route ในโฟลเดอร์ routes/: ingredients.js (คน 1) · suppliers.js (คน 2) · stock.js (คน 4) · purchase_orders.js (คน 5) · goods_receipts.js (คน 6)
// รันเดี่ยว: npm run dev:inventory · รันทั้งระบบ: npm run dev:all
require('../../lib/service').startService({ name: 'inventory', dir: __dirname });
