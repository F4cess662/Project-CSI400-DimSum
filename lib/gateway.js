/**
 * API Gateway — server หลักส่งต่อคำขอไปยัง service ที่ถูกต้อง (ดูรายการใน config.services)
 * เปรียบเหมือนพนักงานต้อนรับ: ลูกค้าคุยกับหน้าร้านที่เดียว หน้าร้านส่งต่อให้สเตชันที่รับผิดชอบ
 * ถ้า service ปลายทางดับ ตอบ 503 "ระบบ...ขัดข้องชั่วคราว" เฉพาะส่วนนั้น ส่วนอื่นของร้านยังใช้ได้ (Fault Isolation)
 */
const http = require('http');
const config = require('../config');
const { ApiError } = require('./response');

const serviceUrl = (name) => {
  const s = config.services[name];
  return `http://${s.host || config.serviceHost}:${s.port}`;
};

/** middleware ส่งต่อคำขอทั้งก้อน (รวม cookie และไฟล์อัปโหลด) ไปยัง service */
function proxyTo(name) {
  const svc = config.services[name];
  const target = new URL(serviceUrl(name));
  return (req, res) => {
    const upstream = http.request({
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: req.originalUrl,
      headers: { ...req.headers, host: target.host, 'x-forwarded-for': req.socket.remoteAddress || '' },
    }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    upstream.setTimeout(15000, () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (res.headersSent) return res.end();
      res.status(503).json({ success: false, data: null, message: `ระบบ${svc.label}ขัดข้องชั่วคราว ส่วนอื่นของร้านยังใช้งานได้` });
    });
    req.pipe(upstream);
  };
}

/** ผูก path ของทุก service เข้ากับ server หลัก (เรียกก่อน express.json) */
function mountServices(app) {
  for (const [name, svc] of Object.entries(config.services)) {
    for (const p of svc.paths) app.use('/api/' + p, proxyTo(name));
  }
}

/** ยิง GET แบบมีเวลาจำกัด คืน { status, body } */
function getJson(url, ms, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (r) => {
      let raw = '';
      r.on('data', (c) => { raw += c; });
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(raw || '{}') }); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(ms, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** เช็กว่าแต่ละ service ยังทำงานอยู่ไหม (หน้าสถานะระบบ) */
async function checkServices() {
  return Promise.all(Object.entries(config.services).map(async ([name, svc]) => {
    const started = Date.now();
    try {
      const { body } = await getJson(serviceUrl(name) + '/health', 1500);
      return { name, label: svc.label, port: svc.port, paths: svc.paths, up: true, ms: Date.now() - started, uptime: body.data && body.data.uptime };
    } catch {
      return { name, label: svc.label, port: svc.port, paths: svc.paths, up: false, ms: null, uptime: null };
    }
  }));
}

/**
 * เรียก API ของ service อื่นจากฝั่ง server (service คุยกันผ่าน API ไม่อ่านตารางของกันและกัน)
 *   const low = await callService(req, 'inventory', '/api/ingredients?low_stock=1');
 * ส่ง cookie ของผู้ใช้ต่อให้ จึงเช็กสิทธิ์ได้ตามปกติ · service ดับ → throw 503 (ให้ catch แล้วแสดง "ไม่พร้อมใช้")
 */
function callService(req, name, path, { method = 'GET', body = null, timeoutMs = 3000 } = {}) {
  const svc = config.services[name];
  const target = new URL(serviceUrl(name));
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const r = http.request({
      hostname: target.hostname,
      port: target.port,
      method,
      path,
      headers: {
        cookie: (req && req.headers.cookie) || '',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      },
    }, (resp) => {
      let raw = '';
      resp.on('data', (c) => { raw += c; });
      resp.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { return reject(new ApiError(`ระบบ${svc.label}ตอบกลับไม่ถูกต้อง`, 502)); }
        if (!json.success) return reject(new ApiError(json.message || `ระบบ${svc.label}ตอบกลับผิดพลาด`, resp.statusCode));
        resolve(json.data);
      });
    });
    r.setTimeout(timeoutMs, () => r.destroy(new Error('timeout')));
    r.on('error', () => reject(new ApiError(`ระบบ${svc.label}ขัดข้องชั่วคราว`, 503)));
    if (payload) r.write(payload);
    r.end();
  });
}

module.exports = { mountServices, checkServices, callService, serviceUrl };
