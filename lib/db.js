const mysql = require('mysql2/promise');
const config = require('../config');

// การเชื่อมต่อฐานข้อมูลชุดเดียวที่ทุกไฟล์ใช้ร่วมกัน
const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: true,          // วันเวลาได้เป็นข้อความ 'YYYY-MM-DD HH:MM:SS' ตรงตามข้อตกลง
  decimalNumbers: true,       // DECIMAL ได้เป็นตัวเลข ไม่ใช่ข้อความ
  waitForConnections: true,
  connectionLimit: 10,
});

/** รัน SQL แล้วคืนแถวทั้งหมด: const rows = await query('SELECT ... WHERE id = ?', [id]) */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** รัน SQL แล้วคืนแถวแรก หรือ null */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * ทำหลายคำสั่งแบบทั้งหมดหรือไม่ทำเลย เช่น เปิดบิล + เปลี่ยนสถานะโต๊ะ
 * await transaction(async (conn) => { await conn.execute(...); await conn.execute(...); })
 */
async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, transaction };
