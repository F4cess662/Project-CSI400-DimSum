/**
 * สร้าง/อัปเดตบัญชีพนักงานตัวอย่างสำหรับร้านนึ่งสุข
 * รหัสผ่านของทุกบัญชี: 1234
 * ใช้: node scripts/seed-users.js
 */
const bcrypt = require('bcryptjs');
const { query, queryOne, pool } = require('../lib/db');

const USERS = [
  { username: 'wipa', full_name: 'วิภา', role_code: 'manager', can_payment: 1, can_vip_booking: 1 },
  { username: 'ahmei', full_name: 'อาเหม่ย', role_code: 'head_chef', can_payment: 0, can_vip_booking: 0 },
  { username: 'ton', full_name: 'ต้น', role_code: 'staff', can_payment: 1, can_vip_booking: 1 },
  { username: 'fon', full_name: 'ฝน', role_code: 'staff', can_payment: 0, can_vip_booking: 1 },
];

async function main() {
  const passwordHash = await bcrypt.hash('1234', 10);
  for (const user of USERS) {
    const role = await queryOne('SELECT id FROM roles WHERE role_code = ?', [user.role_code]);
    if (!role) throw new Error(`ไม่พบ role_code=${user.role_code} กรุณารัน database/dimsum_schema.sql ก่อน`);

    await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, can_payment, can_vip_booking, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         full_name = VALUES(full_name),
         role_id = VALUES(role_id),
         can_payment = VALUES(can_payment),
         can_vip_booking = VALUES(can_vip_booking),
         is_active = 1,
         deactivated_at = NULL`,
      [user.username, passwordHash, user.full_name, role.id, user.can_payment, user.can_vip_booking]
    );
    console.log(`พร้อมใช้งาน: ${user.username} (${user.full_name} / ${user.role_code})`);
  }
  console.log('รหัสผ่านของบัญชีตัวอย่างทุกบัญชีคือ 1234');
}

main()
  .catch((err) => {
    console.error('สร้างบัญชีตัวอย่างไม่สำเร็จ:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
