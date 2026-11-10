// สแกน QR ที่โต๊ะ → /customer/menu.html?token=<qr_token ของบิล>
// token บอกว่าเป็นบิลไหน โต๊ะไหน · ใช้ token เดิมสั่งอาหาร ดูประวัติ ยกเลิกรอบที่ยังไม่เริ่มทำ
const PUBLIC_API = '/api/public';
const ORDER_API = '/api/orders';
let MAX_QTY = 10; // สั่งได้สูงสุดต่อเมนู ต่อรอบ (อ่านจากตั้งค่าร้าน)
// sale_status จาก API: 'available' ปกติ · 'slow' หมดชั่วคราว ยังสั่งได้ · 'closed' หมด (is_sold_out = 1) สั่งไม่ได้
const SLOW_NOTE = 'ใช้เวลาเตรียมอาหารนานกว่าปกติ 5–10 นาที';

// หน่วยตามหมวด (ถ้า API ส่ง m.unit มาจะใช้ค่านั้นก่อน)
const UNIT_BY_CAT = {
    'ซาลาเปา': 'เข่ง', 'ขนมจีบ': 'เข่ง', 'ห่อสาหร่าย': 'เข่ง', 'ฮะเก๋า': 'เข่ง',
    'เมนูจานหลัก': 'จาน', 'เมนูทอด': 'จาน', 'หมี่หยก': 'จาน', 'ของหวาน': 'จาน',
    'ชุดเซ็ต': 'ชุด', 'เครื่องดื่ม': 'แก้ว'
};
const unitOf = m => m.unit || UNIT_BY_CAT[m.category_name] || 'จาน';

const icon = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
const idOf = m => m.menu_id ?? m.id;
const $ = id => document.getElementById(id);

let allItems = [];
let activeCat = 'all';
let searchText = '';
const cart = new Map();
const token = new URLSearchParams(location.search).get('token') || '';
let blocked = '';         // ข้อความเมื่อสั่งไม่ได้ (ไม่มี token / บิลปิด / ปิดรับออเดอร์)

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const getJson = url => fetch(url).then(r => r.json());

async function loadMenu() {
    if (!token) { blocked = 'กรุณาสแกน QR ที่โต๊ะเพื่อสั่งอาหาร'; return; }
    try {
        const res = await getJson(`${PUBLIC_API}?action=menu&token=${encodeURIComponent(token)}`);
        if (!res.success) { blocked = res.message; return; }
        const d = res.data;
        $('tableNo').textContent = d.bill.place;
        MAX_QTY = d.max_qty || MAX_QTY;
        blocked = d.order_open ? '' : (d.closed_message || 'ปิดรับออเดอร์แล้ว');
        allItems = d.menus;
    } catch (e) { blocked = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'; }
}

async function init() {
    tickClock(); setInterval(tickClock, 30000);
    await loadMenu();
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
    const tabs = [{ id: 'all', name: 'ทั้งหมด' }, ...[...cats].map(([id, name]) => ({ id, name }))];

    $('catTabs').innerHTML = tabs.map(t => `
    <button class="chip ${String(t.id) === String(activeCat) ? 'active' : ''}" onclick="selectCat('${t.id}')">${esc(t.name)}</button>
  `).join('');
}

function selectCat(id) { activeCat = id; renderTabs(); renderMenu(); }
function onSearch(v) { searchText = v.trim().toLowerCase(); renderMenu(); }

function renderMenu() {
    const items = allItems.filter(m =>
        (activeCat === 'all' || String(m.category_id) === String(activeCat)) &&
        (!searchText || m.name.toLowerCase().includes(searchText))
    );
    if (!allItems.length && blocked) { $('menuGrid').innerHTML = `<div class="empty">${esc(blocked)}</div>`; return; }
    if (!items.length) { $('menuGrid').innerHTML = '<div class="empty">ไม่พบเมนูที่ค้นหา</div>'; return; }

    $('menuGrid').innerHTML = items.map(m => {
        const id = idOf(m), q = cart.get(id) || 0;
        return `
    <div class="card ${m.is_sold_out ? 'sold-out' : ''}" data-id="${id}">
      <div class="img">
        ${m.image_path ? `<img src="${esc(m.image_path)}" alt="${esc(m.name)}" onerror="this.remove()">` : ''}
        ${m.is_sold_out ? '<span class="badge">หมด</span>' : ''}
      </div>
      <div class="body">
        <div class="name">${esc(m.name)}</div>
        <div class="price">${Number(m.price).toLocaleString()} บาท <span class="unit">/ ${unitOf(m)}</span></div>
        ${m.sale_status === 'slow' ? `<div class="slow-note">${SLOW_NOTE}</div>` : ''}
        ${stepper(id, q, m.is_sold_out)}
      </div>
    </div>`;
    }).join('');
}

function stepper(id, q, disabled = false) {
    const maxed = q >= MAX_QTY;
    return `<div class="stepper">
    <button onclick="changeQty(${id}, -1)" ${q === 0 || disabled ? 'disabled' : ''} aria-label="ลดจำนวน">−</button>
    <span class="qty">${q}</span>
    <button class="plus ${q > 0 ? 'on' : ''}" onclick="changeQty(${id}, 1)" ${disabled || maxed ? 'disabled' : ''}
      ${maxed ? 'title="สั่งได้สูงสุด 10 ต่อรอบ"' : ''} aria-label="เพิ่มจำนวน">+</button>
  </div>`;
}

function changeQty(id, d) {
    const m = allItems.find(x => idOf(x) === id);
    if (!m || (d > 0 && m.is_sold_out)) return;
    const q = Math.min(MAX_QTY, Math.max(0, (cart.get(id) || 0) + d));
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
    $('confirmBtn').disabled = !rows.length || !!blocked;
    $('confirmBtn').title = blocked;

    $('cartList').innerHTML = rows.length ? rows.map(({ m, q }) => `
    <div class="cart-item">
      <div class="thumb">${m.image_path ? `<img src="${esc(m.image_path)}" alt="" onerror="this.remove()">` : ''}</div>
      <div>
        <div class="nm">${esc(m.name)}</div>
        <div class="pr">${Number(m.price).toLocaleString()} บาท <span class="unit">/ ${unitOf(m)}</span></div>
        ${stepper(idOf(m), q)}
      </div>
      <div class="right">
        <button class="rm" onclick="removeItem(${idOf(m)})" aria-label="ลบรายการ">${icon('close')}</button>
        <div class="line">${(m.price * q).toLocaleString()} บาท</div>
      </div>
    </div>`).join('') : '<div class="cart-empty">ยังไม่มีรายการอาหาร</div>';
}

const postOrder = body => fetch(ORDER_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}).then(r => r.json());

/** กล่องยืนยันในหน้า (หน้านี้ไม่ได้โหลด api.js จึงใช้ confirmModal() ไม่ได้) → Promise<boolean> */
function askConfirm(text, okText = 'ยืนยัน', title = 'ยืนยัน') {
    return new Promise(resolve => {
        $('askTitle').textContent = title;
        $('askText').textContent = text;
        $('askYes').textContent = okText;
        $('askModal').hidden = false;
        const done = v => { $('askModal').hidden = true; resolve(v); };
        $('askYes').onclick = () => done(true);
        $('askNo').onclick = () => done(false);
        $('askModal').onclick = e => { if (e.target === $('askModal')) done(false); };
    });
}

/** รายการที่จะส่งจริง (ตัดเมนูที่เพิ่งปิดขาย) */
function orderRows() {
    return [...cart]
        .map(([id, q]) => ({ m: allItems.find(x => idOf(x) === id), q: Math.min(q, MAX_QTY) }))
        .filter(r => r.m && !r.m.is_sold_out);
}

/** กดยืนยันสั่ง → เปิดหน้าทวนรายการก่อน */
function confirmOrder() {
    if (blocked) return alert(blocked);
    const rows = orderRows();
    if (!rows.length) return;
    const total = rows.reduce((s, r) => s + r.m.price * r.q, 0);
    $('reviewList').innerHTML = rows.map(({ m, q }, i) => `
    <div class="order-row">
      <span>${i + 1}. ${esc(m.name)} × ${q} ${esc(unitOf(m))}
        ${m.sale_status === 'slow' ? `<br><small style="color:#c25e00">รอนานขึ้น 5–10 นาที</small>` : ''}</span>
      <span style="white-space:nowrap">${(m.price * q).toLocaleString()} บาท</span>
    </div>`).join('');
    $('reviewTotal').textContent = `รวม ${rows.length} รายการ · ยอด ${total.toLocaleString()} บาท`;
    $('reviewOkBtn').disabled = false;
    $('reviewModal').hidden = false;
}

function closeReview() { $('reviewModal').hidden = true; }

async function submitOrder() {
    const items = orderRows().map(({ m, q }) => ({ menu_item_id: idOf(m), qty: q }));
    if (!items.length) return closeReview();
    $('reviewOkBtn').disabled = true;
    $('confirmBtn').disabled = true;
    closeReview();
    try {
        const res = await postOrder({ action: 'create', token, items });
        if (res.success) {
            const slow = res.data.slow_items || [];
            alert(`สั่งอาหารรอบที่ ${res.data.round_no} เรียบร้อย`
                + (slow.length ? `\n${slow.join(', ')} ${SLOW_NOTE}` : '')
                + `\nกดดูสถานะได้ที่ "ประวัติการสั่งอาหาร"`);
            cart.clear();
        } else alert(res.message || 'สั่งอาหารไม่สำเร็จ');
    } catch (e) { alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    await loadMenu();            // จำนวนพร้อมขายเปลี่ยน
    renderMenu(); renderCart();
}

init();

const STATUS_TH = { waiting: 'รอทำ', cooking: 'กำลังทำ', ready: 'พร้อมเสิร์ฟ', done: 'เสิร์ฟแล้ว', cancelled: 'ยกเลิก' };
const STATUS_COLOR = { waiting: '#9a6b00', cooking: '#c25e00', ready: '#1f6feb', done: '#2e7d32', cancelled: '#9e9e9e' };
const CANCEL_TH = { customer: 'ลูกค้ายกเลิก', out_of_stock: 'วัตถุดิบหมด', spoiled: 'ของเสีย', other: 'อื่น ๆ' };
const pill = st => `<b style="font-size:15px;color:${STATUS_COLOR[st] || '#666'}">${STATUS_TH[st] || esc(st)}</b>`;
const hhmm = d => new Date(String(d).replace(' ', 'T')).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

/** ประวัติทุกรอบของบิลนี้ + สถานะแต่ละรายการ (ใหม่สุดอยู่บน) */
async function openHistory() {
    $('historyModal').hidden = false;
    const box = $('historyList');
    box.innerHTML = '<div class="cart-empty">กำลังโหลด...</div>';
    if (!token) { box.innerHTML = '<div class="cart-empty">กรุณาสแกน QR ที่โต๊ะ</div>'; return; }
    try {
        const res = await getJson(`${PUBLIC_API}?action=bill_status&token=${encodeURIComponent(token)}`);
        if (!res.success) { box.innerHTML = `<div class="cart-empty">${esc(res.message)}</div>`; return; }
        const d = res.data;
        if (!d.orders.length) { box.innerHTML = '<div class="cart-empty">ยังไม่มีประวัติการสั่งอาหาร</div>'; return; }
        box.innerHTML = d.orders.slice().reverse().map(o => `
      <div class="order" ${o.cancelled_at ? 'style="opacity:.6"' : ''}>
        <div class="order-head">
          <span>รอบที่ ${o.round_no} · ${hhmm(o.created_at)} น.${o.source === 'staff' ? ' · พนักงานสั่งให้' : ''}</span>
          <span class="status">${o.cancelled_at ? 'ยกเลิกแล้ว' : ''}</span>
        </div>
        ${o.items.map(i => `
          <div class="order-row">
            <span>${esc(i.name)} x ${i.status === 'cancelled' ? i.qty : i.qty - i.cancelled_qty} ${esc(i.unit)}
              ${i.cancelled_qty && i.status !== 'cancelled' ? `<small>(ยกเลิก ${i.cancelled_qty})</small>` : ''}
              ${i.status === 'cancelled' && i.cancel_reason && i.cancel_reason !== 'customer'
                ? `<br><small style="color:#c62828">ร้านยกเลิก: ${CANCEL_TH[i.cancel_reason] || ''}${i.cancel_note ? ' · ' + esc(i.cancel_note) : ''}</small>` : ''}</span>
            <span style="text-align:right">${pill(i.status)}<br><small>${i.amount.toLocaleString()} บาท</small></span>
          </div>`).join('')}
        <div class="order-total">
          ${o.can_cancel ? `<button class="clear-btn" style="float:left" onclick="cancelRound(${o.id}, ${o.round_no})">ยกเลิกรอบนี้</button>` : ''}
          รวม ${Number(o.total).toLocaleString()} บาท
        </div>
      </div>`).join('') + `
      <div class="order-total">
        ${d.pending_items ? `รออีก ${d.pending_items} รายการ · ` : ''}ยอดรวมทั้งบิล ${Number(d.total).toLocaleString()} บาท
      </div>`;
    } catch (e) {
        box.innerHTML = '<div class="cart-empty">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</div>';
    }
}

/** ยกเลิกทั้งรอบ ได้เฉพาะตอนครัวยังไม่เริ่มทำ (BR-07) */
async function cancelRound(orderId, roundNo) {
    if (!await askConfirm(`ยกเลิกออเดอร์รอบที่ ${roundNo}?`, 'ยกเลิกรอบนี้', 'ยกเลิกออเดอร์')) return;
    try {
        const res = await postOrder({ action: 'cancel', token, order_id: orderId });
        alert(res.success ? `ยกเลิกรอบที่ ${roundNo} แล้ว` : (res.message || 'ยกเลิกไม่สำเร็จ'));
    } catch (e) { alert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    openHistory();
    await loadMenu(); renderMenu();
}

function closeHistory() { $('historyModal').hidden = true; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeHistory(); closeReview(); } });