const { query } = require('./db');

/**
 * บันทึก log (ห้ามเขียนตาราง activity_logs เอง ให้เรียกฟังก์ชันนี้)
 * action  ตั้งชื่อแบบ ตาราง.การกระทำ เช่น 'menu.update', 'user.deactivate', 'bill.open'
 * level   'operation' = ผู้จัดการดูได้ (ค่าเริ่มต้น) / 'system' = เจ้าของร้านเท่านั้น
 *         ใช้ 'system' กับ: สร้าง/แก้/ปิดบัญชีผู้ใช้, เปลี่ยนสิทธิ์, แก้ราคาเมนู, แก้ตั้งค่าร้าน
 *
 * await writeLog(req, 'menu.update', 'menu_items', id, { price: 79 }, 'system')
 */
async function writeLog(req, action, targetType = null, targetId = null, detail = null, level = 'operation') {
  const userId = (req && req.session && req.session.userId) || null;
  await query(
    `INSERT INTO activity_logs (user_id, log_level, action, target_type, target_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, level, action, targetType, targetId, detail === null ? null : JSON.stringify(detail)]);
}

module.exports = { writeLog };
