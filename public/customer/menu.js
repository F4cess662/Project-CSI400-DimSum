const API = '/api/menu';
const ORDER_API = '/api/orders';

const CAT_ICON = {
    'ซาลาเปา': 'bun', 'ขนมจีบ': 'dumpling', 'ห่อสาหร่าย': 'rice', 'ฮะเก๋า': 'dumpling',
    'เมนูจานหลัก': 'rice', 'เมนูทอด': 'fried', 'หมี่หยก': 'noodle', 'ชุดเซ็ต': 'box',
    'เครื่องดื่ม': 'drink', 'ของหวาน': 'dessert'
};

const icon = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
const FIRST_CAT = 'ชุดเซ็ต';
const idOf = m => m.menu_id ?? m.id;
const $ = id => document.getElementById(id);

let allItems = [];
let activeCat = 'all';
const cart = new Map();
const tableNo = new URLSearchParams(location.search).get('table') || localStorage.getItem('tableNo') || '-';

async function init() {
    $('tableNo').textContent = tableNo;
    tickClock(); setInterval(tickClock, 30000);
    const res = await fetch(API).then(r => r.json());
    if (!res.success) return;
    allItems = [...res.data].sort((a, b) => (b.category_name === FIRST_CAT) - (a.category_name === FIRST_CAT));
    const first = allItems.find(m => m.category_name === FIRST_CAT);
    if (first) activeCat = first.category_id;
    renderTabs(); renderMenu(); renderCart();
}

function tickClock() {
    const d = new Date();
    $('clockDate').textContent = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    $('clockTime').textContent = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

function renderTabs() {
    const cats = new Map();
    allItems.forEach(m => cats.set(m.category_id, m.category_name));
    const catTabs = [...cats].map(([id, name]) => ({ id, name, icon: CAT_ICON[name] || 'rice' }));
    const firstTab = catTabs.filter(t => t.name === FIRST_CAT);
    const restTabs = catTabs.filter(t => t.name !== FIRST_CAT);
    const tabs = [...firstTab, { id: 'all', name: 'ทั้งหมด', icon: 'star' }, ...restTabs];

    $('catTabs').innerHTML = tabs.map(t => `
    <button class="tab ${String(t.id) === String(activeCat) ? 'active' : ''}" onclick="selectCat('${t.id}')">
      ${icon(t.icon, t.id === 'all' ? 'filled' : '')}<span>${t.name}</span>
    </button>`).join('');
    const cur = tabs.find(t => String(t.id) === String(activeCat));
    $('catTitle').innerHTML = `${icon(cur.icon, cur.id === 'all' ? 'filled' : '')}<span>${cur.name}</span>`;
}

function selectCat(id) { activeCat = id; renderTabs(); renderMenu(); }

function renderMenu() {
    const items = activeCat === 'all' ? allItems : allItems.filter(m => String(m.category_id) === String(activeCat));
    if (!items.length) { $('menuGrid').innerHTML = '<div class="empty">ยังไม่มีเมนูในหมวดนี้</div>'; return; }

    $('menuGrid').innerHTML = items.map(m => {
        const id = idOf(m), q = cart.get(id) || 0;
        return `
    <div class="card ${m.is_sold_out ? 'sold-out' : ''}" data-id="${id}">
      <div class="img">
        <img src="${m.image_path || ''}" alt="${m.name}">
        ${m.is_sold_out ? '<span class="badge">หมด</span>' : ''}
      </div>
      <div class="body">
        <div class="name">${m.name}</div>
        <div class="price">${Number(m.price).toLocaleString()} บาท</div>
        ${stepper(id, q, m.is_sold_out)}
      </div>
    </div>`;
    }).join('');
}

function stepper(id, q, disabled = false) {
    return `<div class="stepper">
    <button onclick="changeQty(${id}, -1)" ${q === 0 || disabled ? 'disabled' : ''} aria-label="ลดจำนวน">−</button>
    <span class="qty">${q}</span>
    <button class="plus ${q > 0 ? 'on' : ''}" onclick="changeQty(${id}, 1)" ${disabled ? 'disabled' : ''} aria-label="เพิ่มจำนวน">+</button>
  </div>`;
}

function changeQty(id, d) {
    const q = Math.max(0, (cart.get(id) || 0) + d);
    q ? cart.set(id, q) : cart.delete(id);
    renderMenu(); renderCart();
}

function removeItem(id) { cart.delete(id); renderMenu(); renderCart(); }
function clearCart() { cart.clear(); renderMenu(); renderCart(); }

function renderCart() {
    const rows = [...cart].map(([id, q]) => ({ m: allItems.find(x => idOf(x) === id), q })).filter(r => r.m);
    const total = rows.reduce((s, r) => s + r.m.price * r.q, 0);

    $('cartCount').textContent = $('cartCount2').textContent = rows.length;
    $('cartTotal').textContent = total.toLocaleString() + ' บาท';
    $('confirmBtn').disabled = !rows.length;

    $('cartList').innerHTML = rows.length ? rows.map(({ m, q }) => `
    <div class="cart-item">
      <div class="thumb"><img src="${m.image_path || ''}" alt=""></div>
      <div>
        <div class="nm">${m.name}</div>
        <div class="pr">${Number(m.price).toLocaleString()} บาท</div>
        ${stepper(idOf(m), q)}
      </div>
      <div class="right">
        <button class="rm" onclick="removeItem(${idOf(m)})" aria-label="ลบรายการ">${icon('close')}</button>
        <div class="line">${(m.price * q).toLocaleString()} บาท</div>
      </div>
    </div>`).join('') : '<div class="cart-empty">ยังไม่มีรายการอาหาร</div>';
}

async function confirmOrder() {
    const items = [...cart].map(([menu_id, quantity]) => ({ menu_id, quantity }));
    if (!items.length) return;
    try {
        const res = await fetch(ORDER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table_no: tableNo, items })
        }).then(r => r.json());
        if (res.success) { alert('สั่งอาหารเรียบร้อย'); clearCart(); }
        else alert(res.message || 'สั่งอาหารไม่สำเร็จ');
    } catch (e) { alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
}

init();

const STATUS_TH = { pending: 'รอทำ', cooking: 'กำลังทำ', served: 'เสิร์ฟแล้ว', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };

async function openHistory() {
    $('historyModal').hidden = false;
    const box = $('historyList');
    box.innerHTML = '<div class="cart-empty">กำลังโหลด...</div>';
    try {
        const res = await fetch(`${ORDER_API}?table_no=${encodeURIComponent(tableNo)}`).then(r => r.json());
        if (!res.success || !res.data.length) {
            box.innerHTML = '<div class="cart-empty">ยังไม่มีประวัติการสั่งอาหาร</div>';
            return;
        }
        box.innerHTML = res.data.map(o => `
      <div class="order">
        <div class="order-head">
          <span>ออเดอร์ #${o.order_id ?? o.id}</span>
          <span class="status">${STATUS_TH[o.status] || o.status || '-'}</span>
        </div>
        ${(o.items || []).map(i => `
          <div class="order-row">
            <span>${i.name} x ${i.quantity}</span>
            <span>${(i.price * i.quantity).toLocaleString()} บาท</span>
          </div>`).join('')}
        <div class="order-total">รวม ${Number(o.total ?? 0).toLocaleString()} บาท</div>
      </div>`).join('');
    } catch (e) {
        box.innerHTML = '<div class="cart-empty">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</div>';
    }
}

function closeHistory() { $('historyModal').hidden = true; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHistory(); });