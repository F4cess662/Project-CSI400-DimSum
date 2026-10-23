/**
 * สร้างบัญชีเจ้าของร้าน (Owner) คนแรก — รันครั้งเดียว
 * npm run setup-owner -- <username> <password> "<ชื่อ-นามสกุล>"
 * เช่น  npm run setup-owner -- owner secret123 "เจ้าของร้าน"
 */
const bcrypt = require('bcryptjs');
const { query, queryOne, pool } = require('../lib/db');

(async () => {
  try {
    const [username, password, fullName] = process.argv.slice(2);
    const exists = await queryOne(
      "SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_code = 'owner'");
    if (exists.n > 0) return console.log('มีบัญชีเจ้าของร้านอยู่แล้ว ไม่ต้องสร้างใหม่');
    if (!username || !password || !fullName || password.length < 6) {
      return console.log('วิธีใช้: npm run setup-owner -- <username> <password อย่างน้อย 6 ตัว> "<ชื่อ-นามสกุล>"');
    }
    const role = await queryOne("SELECT id FROM roles WHERE role_code = 'owner'");
    await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, can_payment, can_vip_booking)
       VALUES (?, ?, ?, ?, 1, 1)`,
      [username, await bcrypt.hash(password, 10), fullName, role.id]);
    console.log('สร้างบัญชีเจ้าของร้านสำเร็จ: ' + username);
  } catch (e) {
    console.error('สร้างไม่สำเร็จ:', e.message);
  } finally {
    await pool.end();
  }
})();
