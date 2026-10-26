/* =========================================================
   api.js กลาง — ทุกหน้าใช้ไฟล์นี้ ห้ามเขียน fetch เองในหน้า
   ห้ามแก้เอง ถ้าต้องการฟังก์ชันเพิ่ม แจ้งคนที่ 1
   ========================================================= */

const api = {
  /** อ่านข้อมูล: const menus = await api.get('menus', { q: 'ฮะ' }) → ได้ data เลย */
  async get(name, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return api._send('/api/' + name + (qs.toString() ? '?' + qs : ''), { method: 'GET' });
  },
  /** เปลี่ยนข้อมูล: await api.post('bills', { action: 'open', table_ids: [5], guests: 4 }) */
  async post(name, body = {}) {
    return api._send('/api/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  },
  /** ส่งไฟล์รูป: const fd = new FormData(form); fd.append('action','create'); await api.upload('menus', fd) */
  async upload(name, formData) {
    return api._send('/api/' + name, { method: 'POST', body: formData });
  },
  async _send(url, opts) {
    let json;
    try {
      const res = await fetch(url, opts);
      json = await res.json();
      if (res.status === 401 && location.pathname.startsWith('/admin/') && !location.pathname.endsWith('login.html')) {
        location.href = '/admin/login.html';
      }
    } catch (e) {
      json = { success: false, data: null, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    }
    if (!json.success) {
      const err = new Error(json.message || 'เกิดข้อผิดพลาด');
      err.data = json.data;
      throw err;
    }
    api.lastMessage = json.message;
    return json.data;
  },
};

/** เรียก API แล้วแสดง toast ให้อัตโนมัติ: await run(() => api.post(...), 'บันทึกแล้ว') → คืน data หรือ null ถ้า error */
async function run(fn, successText) {
  try {
    const data = await fn();
    const msg = successText || api.lastMessage;
    if (msg) toast(msg);
    return data;
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

/* ---------- toast ---------- */
function toast(message, type = 'ok') {
  let box = document.querySelector('.toast-box');
  if (!box) { box = document.createElement('div'); box.className = 'toast-box'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'warn' ? ' toast-warn' : '');
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ---------- modal ---------- */
/** เปิด modal: const m = openModal({ title, body: '<html>', size: 'lg', footer: '<button>...' }); m.close() */
function openModal({ title = '', body = '', footer = '', size = '' }) {
  const bg = document.createElement('div');
  bg.className = 'modal-backdrop';
  bg.innerHTML = `
    <div class="modal ${size === 'lg' ? 'modal-lg' : ''}" role="dialog">
      <div class="modal-head"><h3>${title}</h3><button class="btn btn-ghost btn-icon btn-sm" data-close>✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(bg);
  return { el: bg.querySelector('.modal'), close };
}

/** ถามยืนยัน: if (await confirmModal('ยกเลิกโต๊ะ T08?', 'ยืนยัน', true)) { ... } */
function confirmModal(message, confirmText = 'ยืนยัน', danger = false) {
  return new Promise((resolve) => {
    const m = openModal({
      title: 'ยืนยัน',
      body: `<p>${message}</p>`,
      footer: `<button class="btn btn-secondary" data-close>ยกเลิก</button>
               <button class="btn ${danger ? 'btn-danger' : ''}" data-ok>${confirmText}</button>`,
    });
    m.el.querySelector('[data-ok]').onclick = () => { m.close(); resolve(true); };
    m.el.parentElement.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m.el.parentElement) resolve(false); });
  });
}

/* ---------- แปลงค่าแสดงผล ---------- */
const fmt = {
  baht: (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }),
  num: (n) => Number(n || 0).toLocaleString('th-TH'),
  time: (d) => d ? new Date(String(d).replace(' ', 'T')).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
  date: (d) => d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
  datetime: (d) => d ? fmt.date(d) + ' ' + fmt.time(d) : '-',
  minutesAgo: (d) => Math.max(0, Math.floor((Date.now() - new Date(String(d).replace(' ', 'T'))) / 60000)),
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
};

/* ---------- ป้ายสถานะมาตรฐาน: badge('cooking') ---------- */
const STATUS = {
  // รายการอาหาร
  waiting: ['รอทำ', 'wait'], cooking: ['กำลังทำ', 'doing'], ready: ['พร้อมเสิร์ฟ', 'wait'], done: ['เสิร์ฟแล้ว', 'ok'], cancelled: ['ยกเลิก', 'bad'],
  // โต๊ะ / บิล
  available: ['ว่าง', 'ok'], occupied: ['มีลูกค้า', 'bad'], open: ['เปิดอยู่', 'doing'], paid: ['จ่ายแล้ว', 'ok'],
  // คิว
  called: ['เรียกแล้ว', 'doing'], seated: ['นั่งแล้ว', 'ok'], skipped: ['ข้าม', 'off'],
  // VIP
  pending_deposit: ['รอมัดจำ', 'wait'], confirmed: ['ยืนยันแล้ว', 'ok'], arrived: ['มาแล้ว', 'doing'], no_show: ['ไม่มา', 'off'],
  // PO
  draft: ['ร่าง', 'off'], sent: ['ส่งแล้ว', 'doing'], received: ['รับของแล้ว', 'ok'],
  // ทั่วไป
  active: ['ใช้งาน', 'ok'], inactive: ['ปิดใช้งาน', 'off'], soldout: ['หมด', 'bad'], low: ['ใกล้หมด', 'wait'],
};
function badge(status, text) {
  const [label, kind] = STATUS[status] || [status, 'off'];
  return `<span class="badge badge-${kind}">${fmt.esc(text || label)}</span>`;
}

const ZONES = { steam: 'นึ่ง', fry: 'ทอด', congee_noodle: 'โจ๊ก-เส้น', drink_dessert: 'เครื่องดื่ม-ของหวาน' };
const ZONE_EMOJI = { steam: '🥟', fry: '🍤', congee_noodle: '🍜', drink_dessert: '🧋' };
function zoneChip(zone) {
  return `<span class="row small zone-${zone}" style="gap:8px"><span class="zone-dot"></span>${ZONES[zone] || zone}</span>`;
}
const ROLES = { customer: 'ลูกค้า', staff: 'พนักงานหน้าร้าน', head_chef: 'หัวหน้าเชฟ', manager: 'ผู้จัดการ', owner: 'เจ้าของร้าน' };

/** รูปเมนู หรือ emoji ถ้าไม่มีรูป */
function menuImage(m) {
  return m.image_path ? `<img src="${fmt.esc(m.image_path)}" alt="">` : (ZONE_EMOJI[m.kitchen_zone] || '🥟');
}

/** ดึงซ้ำทุก n วินาที (จอครัว ผังโต๊ะ สถานะลูกค้า): poll(loadData, 5) */
function poll(fn, seconds = 10) { fn(); return setInterval(fn, seconds * 1000); }

/** อ่านค่าจาก URL: qs('token') */
function qs(key) { return new URLSearchParams(location.search).get(key); }
