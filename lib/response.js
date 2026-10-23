// รูปแบบคำตอบกลางของทุก API: {"success": true/false, "data": ..., "message": ""}

class ApiError extends Error {
  constructor(message, status = 400, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** ตอบสำเร็จ: return ok(res, data, 'ข้อความ') */
function ok(res, data = null, message = '') {
  return res.json({ success: true, data, message });
}

/** ตอบไม่สำเร็จ: throw fail('ข้อความ', 403) — ใช้ throw เพื่อหยุดทำงานทันที */
function fail(message, status = 400, data = null) {
  return new ApiError(message, status, data);
}

/** ตรวจว่าส่งข้อมูลครบ ไม่ครบโยน error 422 ทันที: requireFields(req.body, ['name','price']) */
function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw fail('ข้อมูลไม่ครบ: ' + missing.join(', '), 422);
  return body;
}

/** ห่อ handler แบบ async ให้ error ทุกชนิดไปถึงตัวจัดการ error กลาง */
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** ตัวจัดการ error กลาง (อยู่ท้ายสุดใน server.js) ตอบเป็น JSON เสมอ */
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ success: false, data: err.data, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ success: false, data: null, message: 'เกิดข้อผิดพลาดในระบบ: ' + err.message });
}

module.exports = { ApiError, ok, fail, requireFields, handle, errorHandler };
