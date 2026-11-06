/**
 * /api/banners — แบนเนอร์สไลด์หน้า Home (คนที่ 2 · เฟส 3)
 * GET [?all=1]   → แบนเนอร์ที่เปิดใช้ เรียงตาม sort_order (สาธารณะ) · ?all=1 รวมที่ปิดอยู่ (manager+)
 * POST (form-data) action=create  title, link_url, is_active, image(ไฟล์ ≤ 2MB)   (manager+)
 * POST (form-data) action=update  id, title, link_url, is_active, [image]        (ไม่ส่งรูป = ใช้รูปเดิม)
 * POST (JSON)      action=delete  id
 * POST (JSON)      action=reorder ids:[3,1,2]   → ตั้ง sort_order ตามลำดับใหม่
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = require('express').Router();
const multer = require('multer');
const { query, queryOne, transaction } = require('../lib/db');
const { ok, fail, requireFields, handle } = require('../lib/response');
const { requireRole, mustBe } = require('../lib/auth');
const { writeLog } = require('../lib/log');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'assets', 'uploads');
const UPLOAD_URL = '/assets/uploads/';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, 'banner_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(fail('อนุญาตเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) ขนาดไม่เกิน 2MB', 422));
    }
    cb(null, true);
  },
});

function maybeUpload(req, res, next) {
  if (!String(req.headers['content-type'] || '').includes('multipart/form-data')) return next();
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    next(err.code === 'LIMIT_FILE_SIZE' ? fail('ขนาดไฟล์รูปภาพต้องไม่เกิน 2MB', 422) : err);
  });
}

/** ลบไฟล์รูปเฉพาะที่อยู่ใน public/assets/uploads (รูปในที่อื่น/URL ภายนอกไม่แตะ) */
function removeImage(imagePath) {
  if (!imagePath || !String(imagePath).startsWith(UPLOAD_URL)) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(imagePath)), () => {});
}

const flag = (v, fallback = 1) => (v === undefined ? fallback : (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0));

function cleanTitle(v) {
  const s = String(v ?? '').trim();
  if (s.length > 100) throw fail('ชื่อแบนเนอร์ยาวไม่เกิน 100 ตัวอักษร', 422);
  return s || null;
}
function cleanLink(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.length > 255) throw fail('ลิงก์ยาวไม่เกิน 255 ตัวอักษร', 422);
  if (!/^(\/|https?:\/\/)/.test(s)) throw fail('ลิงก์ต้องขึ้นต้นด้วย / หรือ http(s)://', 422);
  return s;
}

/* ---------- GET ---------- */
router.get('/', handle(async (req, res) => {
  if (req.query.all === '1') await mustBe(req, ['manager', 'owner']);
  const rows = await query(
    `SELECT id, title, image_path, link_url, sort_order, is_active FROM banners
      ${req.query.all === '1' ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, id`);
  return ok(res, rows);
}));

/* ---------- POST (ตรวจสิทธิ์ก่อนรับไฟล์ ไม่ให้คนนอกอัปโหลดได้) ---------- */
router.post('/', requireRole(['manager', 'owner']), maybeUpload, handle(async (req, res) => {
  const b = req.body || {};
  try {
    switch (b.action) {
      case 'create': {
        if (!req.file) throw fail('กรุณาเลือกรูปแบนเนอร์', 422);
        const title = cleanTitle(b.title);
        const link = cleanLink(b.link_url);
        const next = await queryOne('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM banners');
        const r = await query(
          'INSERT INTO banners (title, image_path, link_url, sort_order, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          [title, UPLOAD_URL + req.file.filename, link, next.n, flag(b.is_active), req.user.id]);
        await writeLog(req, 'banner.create', 'banners', r.insertId, { title });
        return ok(res, { id: r.insertId }, 'เพิ่มแบนเนอร์แล้ว');
      }

      case 'update': {
        requireFields(b, ['id']);
        const old = await queryOne('SELECT * FROM banners WHERE id = ?', [b.id]);
        if (!old) throw fail('ไม่พบแบนเนอร์นี้', 404);
        const title = b.title !== undefined ? cleanTitle(b.title) : old.title;
        const link = b.link_url !== undefined ? cleanLink(b.link_url) : old.link_url;
        const imagePath = req.file ? UPLOAD_URL + req.file.filename : old.image_path;
        await query('UPDATE banners SET title = ?, image_path = ?, link_url = ?, is_active = ? WHERE id = ?',
          [title, imagePath, link, flag(b.is_active, old.is_active), old.id]);
        if (req.file) removeImage(old.image_path);
        await writeLog(req, 'banner.update', 'banners', old.id, { title, image_changed: !!req.file });
        return ok(res, { id: old.id }, 'บันทึกแบนเนอร์แล้ว');
      }

      case 'delete': {
        requireFields(b, ['id']);
        const old = await queryOne('SELECT * FROM banners WHERE id = ?', [b.id]);
        if (!old) throw fail('ไม่พบแบนเนอร์นี้', 404);
        await query('DELETE FROM banners WHERE id = ?', [old.id]);
        removeImage(old.image_path);
        await writeLog(req, 'banner.delete', 'banners', old.id, { title: old.title });
        return ok(res, { id: old.id }, 'ลบแบนเนอร์แล้ว');
      }

      case 'reorder': {
        const ids = Array.isArray(b.ids) ? b.ids.map(Number) : [];
        if (!ids.length || ids.some((n) => !Number.isInteger(n)) || new Set(ids).size !== ids.length) {
          throw fail('ลำดับแบนเนอร์ไม่ถูกต้อง', 422);
        }
        await transaction(async (conn) => {
          for (let i = 0; i < ids.length; i++) {
            await conn.query('UPDATE banners SET sort_order = ? WHERE id = ?', [i + 1, ids[i]]);
          }
        });
        await writeLog(req, 'banner.reorder', 'banners', null, { ids });
        return ok(res, null, 'จัดลำดับแบนเนอร์แล้ว');
      }

      default:
        throw fail('ไม่รู้จัก action นี้', 400);
    }
  } catch (e) {
    if (req.file) removeImage(UPLOAD_URL + req.file.filename); // ทำไม่สำเร็จ → ไม่ทิ้งไฟล์ค้าง
    throw e;
  }
}));

module.exports = router;