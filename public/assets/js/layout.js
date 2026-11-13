/* =========================================================
   layout.js กลาง — สร้าง sidebar + topbar (พนักงาน) และ navbar + footer (ลูกค้า)
   ห้ามแก้เอง ถ้าจะเพิ่มเมนูแจ้งคนที่ 2
   ========================================================= */

/* รายการหน้าทั้งระบบ = ชื่อไฟล์ที่ทุกคนต้องใช้ตรงนี้
   roles: บทบาทที่เห็นเมนู / perm: ช่องติ๊กที่ staff ต้องมี */
const STAFF_MENU = [
  { group: 'หน้าร้าน', items: [
    { file: 'tables.html',          icon: '<i data-icon="chair"></i>', label: 'ผังโต๊ะ',          roles: ['staff', 'manager', 'owner'] },
    { file: 'queue.html',           icon: '<i data-icon="ticket"></i>', label: 'คิว',              roles: ['staff', 'manager', 'owner'] },
    { file: 'bills.html',           icon: '<i data-icon="receipt"></i>', label: 'บิลที่เปิดอยู่',      roles: ['staff', 'manager', 'owner'] },
    { file: 'order-staff.html',     icon: '<i data-icon="edit"></i>', label: 'สั่งแทนลูกค้า',     roles: ['staff', 'manager', 'owner'] },
    { file: 'checkout.html',        icon: '<i data-icon="card"></i>', label: 'ชำระเงิน',          roles: ['staff', 'manager', 'owner'], perm: 'payment' },
    { file: 'shift-close.html',     icon: '<i data-icon="cash"></i>', label: 'ปิดยอดกะ',          roles: ['staff', 'manager', 'owner'], perm: 'payment' },
    { file: 'vip.html',             icon: '<i data-icon="crown"></i>', label: 'จองห้อง VIP',       roles: ['staff', 'manager', 'owner'], perm: 'vip_booking' },
  ]},
  { group: 'ครัว', items: [
    { file: 'kitchen.html',         icon: '<i data-icon="flame"></i>', label: 'จอครัว',            roles: ['head_chef', 'manager', 'owner'] },
    { file: 'stock-today.html',     icon: '<i data-icon="box"></i>', label: 'จำนวนพร้อมขาย',     roles: ['head_chef', 'manager', 'owner'] },
    // { file: 'prep-today.html',      icon: '<i data-icon="clipboard"></i>', label: 'ยอดเตรียมวันนี้',    roles: ['head_chef', 'manager', 'owner'] },
  ]},
  { group: 'ผู้จัดการ', items: [
    { file: 'dashboard.html',       icon: '<i data-icon="chart"></i>', label: 'Dashboard',         roles: ['manager', 'owner'] },
    { file: 'bills-search.html',    icon: '<i data-icon="search"></i>', label: 'ค้นบิล',            roles: ['manager', 'owner'] },
    { file: 'coupons.html',         icon: '<i data-icon="ticket"></i>', label: 'คูปอง',             roles: ['manager', 'owner'] },
    { file: 'banners.html',         icon: '<i data-icon="image"></i>', label: 'แบนเนอร์หน้าแรก',   roles: ['manager', 'owner'] },
    { file: 'rewards.html',         icon: '<i data-icon="star"></i>', label: 'รางวัลแลกแต้ม',      roles: ['manager', 'owner'] },
    { file: 'prep-plans.html',      icon: '<i data-icon="calendar"></i>', label: 'แผนเตรียมของ',      roles: ['manager', 'owner'] },
    { file: 'ingredients.html',     icon: '<i data-icon="leaf"></i>', label: 'วัตถุดิบ',           roles: ['manager', 'owner'] },
    { file: 'suppliers.html',       icon: '<i data-icon="truck"></i>', label: 'ซัพพลายเออร์',      roles: ['manager', 'owner'] },
    { file: 'purchase-orders.html', icon: '<i data-icon="file"></i>', label: 'ใบสั่งซื้อ',         roles: ['manager', 'owner'] },
    { file: 'goods-receipts.html',  icon: '<i data-icon="inbox"></i>', label: 'รับของ',            roles: ['manager', 'owner'] },
    { file: 'stock.html',           icon: '<i data-icon="scale"></i>', label: 'ปรับสต็อก',         roles: ['manager', 'owner'] },
    { file: 'reports.html',         icon: '<i data-icon="trend"></i>', label: 'รายงาน',            roles: ['manager', 'owner'] },
    { file: 'logs.html',            icon: '<i data-icon="clock"></i>', label: 'Log',               roles: ['manager', 'owner'] },
    { file: 'notifications.html',   icon: '<i data-icon="bell"></i>', label: 'การแจ้งเตือน',      roles: ['manager', 'owner'] },
    { file: 'system.html',          icon: '<i data-icon="pulse"></i>', label: 'สถานะระบบ',         roles: ['manager', 'owner'] },
  ]},
  { group: 'เจ้าของร้าน', items: [
    { file: 'staff-management.html',icon: '<i data-icon="users"></i>', label: 'พนักงาน',           roles: ['owner'] },
    { file: 'menus.html',           icon: '<i data-icon="utensils"></i>', label: 'เมนูและหมวด',       roles: ['owner'] },
    { file: 'tables-setup.html',    icon: '<i data-icon="wrench"></i>', label: 'โต๊ะและห้อง VIP',    roles: ['owner'] },
    { file: 'settings.html',        icon: '<i data-icon="gear"></i>', label: 'ตั้งค่าร้าน',        roles: ['owner'] },
    { file: 'holidays.html',        icon: '<i data-icon="calendar"></i>', label: 'วันหยุดราชการ',      roles: ['owner'] },
    { file: 'tasks.html',           icon: '<i data-icon="bot"></i>', label: 'งานระบบ',           roles: ['owner'] },
  ]},
];

const HOME_BY_ROLE = { staff: 'tables.html', head_chef: 'kitchen.html', manager: 'dashboard.html', owner: 'dashboard.html' };

function canSee(user, item) {
  if (!item.roles.includes(user.role_code)) return false;
  if (item.perm && user.role_code === 'staff') {
    return item.perm === 'payment' ? user.can_payment === 1 : user.can_vip_booking === 1;
  }
  return true;
}

/** สถานะร้านจาก settings → { open, text } */
function shopStatus(s) {
  const now = new Date().toTimeString().slice(0, 8);
  if (now >= s.morning_open && now < s.morning_close)
    return { open: true, text: `เปิดอยู่ · กะเช้า · ปิดรับออเดอร์ ${s.morning_last_order.slice(0, 5)}` };
  if (now >= s.evening_open && now < s.evening_close)
    return { open: true, text: `เปิดอยู่ · กะเย็น · ปิดรับออเดอร์ ${s.evening_last_order.slice(0, 5)}` };
  return { open: false, text: 'ปิดอยู่' };
}

/* สีประจำหมวด (ใช้ตัวแปรสีที่ style.css มีอยู่แล้ว) · หมวดประจำ role = หมวดที่เปิดไว้ตอนแรก */
const GROUP_STYLE = {
  'หน้าร้าน':    { fg: 'var(--brown-900)',   bg: 'var(--cream-200)' },
  'ครัว':        { fg: 'var(--doing)',      bg: 'var(--doing-bg)' },
  'ผู้จัดการ':    { fg: 'var(--wait)',        bg: 'var(--wait-bg)' },
  'เจ้าของร้าน': { fg: 'var(--ok)', bg: 'var(--ok-bg)' },
};
const GROUP_BY_ROLE = { staff: 'หน้าร้าน', head_chef: 'ครัว', manager: 'ผู้จัดการ', owner: 'เจ้าของร้าน' };

/* จำสถานะเปิด/พับของแต่ละหมวดไว้ในเบราว์เซอร์ แยกตามผู้ใช้ (คนละบัญชีไม่ปนกัน) */
const sideKey = (user) => 'dimsum_sidebar_' + user.id;
function loadSideState(user) {
  try { return JSON.parse(localStorage.getItem(sideKey(user))) || {}; } catch { return {}; }
}
function saveSideState(user, state) {
  try { localStorage.setItem(sideKey(user), JSON.stringify(state)); } catch { /* เบราว์เซอร์ไม่ให้เก็บ ก็ใช้งานต่อได้ */ }
}

/**
 * เรียกบนสุดของทุกหน้าพนักงาน:
 *   const me = await initStaffPage({ title: 'ผังโต๊ะ', roles: ['staff','manager','owner'], perm: 'payment' });
 * - ไม่ได้ล็อกอิน → ไปหน้า login / ไม่มีสิทธิ์ → แสดงหน้าไม่มีสิทธิ์
 * - หน้า HTML ต้องมี <div id="app"></div> และใส่เนื้อหาใน <template id="page">...</template>
 * - คืนค่า user (id, full_name, role_code, can_payment, can_vip_booking) และ window.SHOP = ตั้งค่าร้าน
 */
async function initStaffPage({ title, roles, perm } = {}) {
  let user;
  try { user = await api.get('auth'); } catch { location.href = '/admin/login.html'; return; }
  let settings = {};
  try { settings = await api.get('settings'); } catch { /* ยังไม่มี API settings ก็ใช้ได้ */ }
  window.SHOP = settings;

  const current = location.pathname.split('/').pop();
  const sideState = loadSideState(user);
  const menuHtml = STAFF_MENU.map((g) => {
    const items = g.items.filter((it) => canSee(user, it));
    if (!items.length) return '';
    const c = GROUP_STYLE[g.group] || GROUP_STYLE['เจ้าของร้าน'];
    // เปิดไว้ตอนแรกเฉพาะหมวดประจำ role · ถ้าเคยกดเปิด/พับเองแล้ว ใช้ตามที่จำไว้
    const open = g.group in sideState ? sideState[g.group] : g.group === GROUP_BY_ROLE[user.role_code];
    return `<div class="side-section" data-group="${g.group}">
      <button type="button" class="side-group-head" aria-expanded="${open}"
        style="display:flex;align-items:center;justify-content:space-between;width:100%;margin:var(--s3) 0 var(--s1);padding:8px var(--s3);border:0;border-left:4px solid ${c.fg};border-radius:var(--r-sm);background:${c.bg};color:${c.fg};font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">
        <span>${g.group}</span><span class="side-caret" style="transition:transform .15s;${open ? '' : 'transform:rotate(-90deg)'}">▾</span></button>
      <div class="side-items ${open ? '' : 'hidden'}">` +
      items.map((it) =>
        `<a class="side-link ${it.file === current ? 'active' : ''}" href="/admin/${it.file}">
           <span class="side-icon">${it.icon}</span>${it.label}</a>`).join('') +
      `</div></div>`;
  }).join('');

  const st = settings.morning_open ? shopStatus(settings) : null;
  const page = document.getElementById('page');
  document.getElementById('app').innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo"><a class="logo" href="/admin/${HOME_BY_ROLE[user.role_code] || ''}">
          <span class="logo-mark logo-img"><img src="/assets/img/logo_rantimsum.png" alt="นึ่งสุข"></span><span class="logo-text">นึ่งสุข</span></a></div>
        ${menuHtml}
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="row">
            <button class="btn btn-ghost btn-icon sidebar-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
            <h2>${title || ''}</h2>
          </div>
          <div class="topbar-right">
            ${st ? `<span class="badge ${st.open ? 'badge-ok' : 'badge-off'}">● ${st.text}</span>` : ''}
            <div class="user-box">
              <span class="avatar">${fmt.esc(user.full_name.charAt(0))}</span>
              <div><div class="bold small">${fmt.esc(user.full_name)}</div><div class="caption muted">${ROLES[user.role_code]}</div></div>
            </div>
            <button class="btn btn-secondary btn-sm" id="logoutBtn">ออกจากระบบ</button>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;

  document.querySelectorAll('.side-group-head').forEach((btn) => {
    btn.onclick = () => {
      const sec = btn.parentElement;
      const hidden = sec.querySelector('.side-items').classList.toggle('hidden');   // true = ตอนนี้พับอยู่
      btn.setAttribute('aria-expanded', String(!hidden));
      btn.querySelector('.side-caret').style.transform = hidden ? 'rotate(-90deg)' : '';
      sideState[sec.dataset.group] = !hidden;
      saveSideState(user, sideState);
    };
  });

  document.getElementById('logoutBtn').onclick = async () => {
    await api.post('auth', { action: 'logout' }).catch(() => {});
    location.href = '/admin/login.html';
  };

  const allowed = (!roles || roles.includes(user.role_code)) && (!perm || canSee(user, { roles: [user.role_code], perm }));
  const content = document.getElementById('content');
  if (!allowed) {
    content.innerHTML = `<div class="empty"><div class="empty-icon"><i data-icon="lock"></i></div><h3>ไม่มีสิทธิ์เข้าถึงหน้านี้</h3>
      <p><a class="btn" href="/admin/${HOME_BY_ROLE[user.role_code]}">กลับหน้าแรก</a></p></div>`;
    return null;
  }
  if (page) content.appendChild(page.content.cloneNode(true));
  return user;
}

/**
 * เรียกบนสุดของหน้าลูกค้า (index.html, member.html):
 *   const member = await initPublicPage();   // null = ยังไม่ล็อกอินสมาชิก
 * หน้า HTML ต้องมี <div id="app"></div> และ <template id="page">...</template>
 */
async function initPublicPage() {
  let member = null;
  try { member = (await api.get('members', { action: 'me' })); } catch { /* ยังไม่ล็อกอิน หรือยังไม่มี API */ }
  let s = {};
  try { s = await api.get('settings'); } catch {}
  window.SHOP = s;
  const t = (v) => (v ? v.slice(0, 5) : '');
  const name = member && (member.name || (member.member && member.member.name)) || '';

  const right = member
    ? `<div class="dropdown"><button class="avatar" id="avatarBtn">${fmt.esc(name.charAt(0) || '<i data-icon="user"></i>')}</button>
         <div class="dropdown-menu hidden" id="avatarMenu">
           <a href="/customer/member.html">บัญชีของฉัน</a><button id="memberLogout">ออกจากระบบ</button></div></div>`
    : `<a class="btn btn-secondary btn-sm" href="/customer/member.html">เข้าสู่ระบบสมาชิก</a>`;

  const page = document.getElementById('page');
  document.getElementById('app').innerHTML = `
    <nav class="navbar"><div class="navbar-inner">
      <a class="logo" href="/"><span class="logo-mark logo-img"><img src="/assets/img/logo_rantimsum.png" alt="นึ่งสุข"></span><span class="logo-text">นึ่งสุข</span></a>
      <div class="nav-links" id="navLinks">
        <a href="/#menu">เมนู</a><a href="/#promo">โปรโมชัน</a><a href="/#hours">เวลาเปิด-ปิด</a><a href="/#contact">ติดต่อ</a>
      </div>
      <div class="row">${right}
        <button class="btn btn-ghost btn-icon nav-toggle" onclick="document.getElementById('navLinks').classList.toggle('open')">☰</button></div>
    </div></nav>
    <div id="content"></div>
    <footer class="footer" id="contact"><div class="container grid grid-3">
      <div><a class="logo" href="/"><span class="logo-mark logo-img"><img src="/assets/img/logo_rantimsum.png" alt="นึ่งสุข"></span><span class="logo-text">นึ่งสุข</span></a>
        <p class="small muted">ติ่มซำร้อนๆ นึ่งสดทุกเข่ง</p></div>
      <div id="hours"><div class="bold">เวลาเปิด-ปิด</div>
        <div class="small">${t(s.morning_open) || '10:00'}–${t(s.morning_close) || '14:00'} และ ${t(s.evening_open) || '16:00'}–${t(s.evening_close) || '20:00'}</div>
        <div class="small muted">ปิดรับออเดอร์ ${t(s.morning_last_order) || '13:30'} / ${t(s.evening_last_order) || '19:30'}</div></div>
      <div><div class="bold">ติดต่อ</div>
        <div class="small">${fmt.esc(s.address || '99/9 ถนนเจริญกรุง แขวงสัมพันธวงศ์ เขตสัมพันธวงศ์ กรุงเทพฯ 10100')}</div>
        <div class="small">โทร ${fmt.esc(s.phone || '02-000-0000')} · LINE @nuengsuk</div></div>
    </div></footer>`;

  if (page) document.getElementById('content').appendChild(page.content.cloneNode(true));
  if (member) {
    document.getElementById('avatarBtn').onclick = () => document.getElementById('avatarMenu').classList.toggle('hidden');
    document.getElementById('memberLogout').onclick = async () => {
      await api.post('members', { action: 'logout' }).catch(() => {});
      location.href = '/';
    };
  }
  return member;
}