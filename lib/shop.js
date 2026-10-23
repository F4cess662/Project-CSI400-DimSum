const { queryOne } = require('./db');
const config = require('../config');

/** ตั้งค่าร้าน (แถวเดียว id = 1) */
async function shopSettings() {
  return queryOne('SELECT * FROM shop_settings WHERE id = 1');
}

/** เวลาปัจจุบันของไทยเป็น 'HH:MM:SS' */
function nowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date());
}

/** กะปัจจุบัน 'morning' / 'evening' หรือ null ถ้าร้านปิด */
async function currentShift(time = nowTime()) {
  const s = await shopSettings();
  if (time >= s.morning_open && time < s.morning_close) return 'morning';
  if (time >= s.evening_open && time < s.evening_close) return 'evening';
  return null;
}

/** ร้านเปิดอยู่ไหม (ใช้ตอนเปิดโต๊ะ) */
async function isOpenNow(time = nowTime()) {
  return (await currentShift(time)) !== null;
}

/** ยังรับออเดอร์ / ออกบัตรคิวได้ไหม (ก่อนเวลาปิดรับออเดอร์ของกะนั้น) — UC-58, BR-01 */
async function isOrderOpenNow(time = nowTime()) {
  const s = await shopSettings();
  return (time >= s.morning_open && time < s.morning_last_order)
      || (time >= s.evening_open && time < s.evening_last_order);
}

/** ข้อความแจ้งลูกค้าเมื่อปิดรับออเดอร์ เช่น "ปิดรับออเดอร์แล้ว รอบเย็นเปิด 16:00" */
async function closedMessage(time = nowTime()) {
  const s = await shopSettings();
  if (time < s.morning_open) return 'ร้านยังไม่เปิด รอบเช้าเปิด ' + s.morning_open.slice(0, 5);
  if (time < s.evening_open) return 'ปิดรับออเดอร์แล้ว รอบเย็นเปิด ' + s.evening_open.slice(0, 5);
  return 'ปิดรับออเดอร์แล้ว พรุ่งนี้เปิด ' + s.morning_open.slice(0, 5);
}

module.exports = { shopSettings, nowTime, currentShift, isOpenNow, isOrderOpenNow, closedMessage };
