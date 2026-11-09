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
  baht: (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' ฿',
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
  temp_out: ['หมดชั่วคราว', 'wait'], // จำนวน 0 แต่ยังเปิดขาย ลูกค้ายังสั่งได้ (รอนานขึ้น)
};
function badge(status, text) {
  const [label, kind] = STATUS[status] || [status, 'off'];
  return `<span class="badge badge-${kind}">${fmt.esc(text || label)}</span>`;
}

/* ---------- ไอคอนเส้น (outline) ใช้แทนอีโมจิ ----------
   ใน JS:   `${icon('search')} ค้นหา`        → <svg> ขนาด 1em (ตามขนาดตัวอักษรที่อยู่รอบๆ)
   ใน HTML: <i data-icon="search"></i>      → api.js เปลี่ยนเป็น <svg> ให้เอง (รวมถึงที่ใส่ทีหลังด้วย innerHTML)
   ชื่อที่มี: ดู ICON_PATHS ด้านล่าง */
const ICON_PATHS = {
  dumpling: '<path d="M3 14c0-4.4 4-8 9-8s9 3.6 9 8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 7.5l1 3M12 6v3.5M16 7.5l-1 3"/>',
  chair: '<path d="M6 3v10h12V3"/><path d="M6 13l-1 8M18 13l1 8M6 17h12"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8H8M16 12H8M13 16H8"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  crown: '<path d="M3 7l4.5 5L12 5l4.5 7L21 7l-2 12H5z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  utensils: '<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20"/><path d="M20 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zM20 15v7"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13v2M15 13v2"/><circle cx="12" cy="3" r="1"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
  move: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  printer: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v8h14v-8M10 21v-5h4v5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>',
  serve: '<path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 8V6M10 6h4"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 9a4 4 0 0 1 0 6M20 6a8 8 0 0 1 0 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  cup: '<path d="M4 8h13v5a6 6 0 0 1-12 0z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2M16 7c0-1 1-1 1-2"/>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
  'chevron-right': '<path d="M9 18l6-6-6-6"/>',
  external: '<path d="M7 17L17 7M8 7h9v9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
function icon(name, size) {
  const s = size ? `${size}px` : '1em';
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.125em;flex:none">${ICON_PATHS[name] || ICON_PATHS.dumpling}</svg>`;
}
/** เปลี่ยน <i data-icon="x"> ในหน้าเป็นไอคอน · เรียกเองอัตโนมัติ */
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]:not([data-icon-done])').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconSize);
    el.setAttribute('data-icon-done', '');
  });
}
if (typeof document !== 'undefined' && document.body) {
  hydrateIcons();
  new MutationObserver(() => hydrateIcons()).observe(document.body, { childList: true, subtree: true });
}

const ZONES = { steam: 'นึ่ง', fry: 'ทอด', congee_noodle: 'โจ๊ก-เส้น', drink_dessert: 'เครื่องดื่ม-ของหวาน' };
const ZONE_ICON = { steam: 'dumpling', fry: 'flame', congee_noodle: 'bowl', drink_dessert: 'cup' };
const ZONE_EMOJI = Object.fromEntries(Object.entries(ZONE_ICON).map(([z, n]) => [z, icon(n)])); // ชื่อเดิม เก็บไว้ให้โค้ดเก่าใช้ได้
function zoneChip(zone) {
  return `<span class="row small zone-${zone}" style="gap:8px"><span class="zone-dot"></span>${ZONES[zone] || zone}</span>`;
}
const ROLES = { customer: 'ลูกค้า', staff: 'พนักงานหน้าร้าน', head_chef: 'หัวหน้าเชฟ', manager: 'ผู้จัดการ', owner: 'เจ้าของร้าน' };

/** รูปเมนู หรือ emoji ถ้าไม่มีรูป */
function menuImage(m) {
  return m.image_path ? `<img src="${fmt.esc(m.image_path)}" alt="">` : icon(ZONE_ICON[m.kitchen_zone] || 'dumpling');
}

/** ดึงซ้ำทุก n วินาที (จอครัว ผังโต๊ะ สถานะลูกค้า): poll(loadData, 5) */
function poll(fn, seconds = 10) { fn(); return setInterval(fn, seconds * 1000); }

/** อ่านค่าจาก URL: qs('token') */
function qs(key) { return new URLSearchParams(location.search).get(key); }
