/* =========================================================
   kitchen.js — จอครัว (FR-15–19)
   โหมดหัวหน้าเชฟ: kitchen.html          → แท็บโซน + ปุ่มเปลี่ยนสถานะ / ข้าม QC / ยกเลิก
   โหมดจอโซน:     kitchen.html?zone=fry&view=1 → เต็มจอ แสดงผลอย่างเดียว ตัวหนังสือใหญ่ (FR-16)
   ดึง GET /api/kitchen ซ้ำทุก 5 วินาที · kitchen-service ดับ → แถบแจ้งเตือน การ์ดเดิมยังอยู่
   ========================================================= */
(async () => {
  const KITCHEN_ROLES = ['head_chef', 'manager', 'owner'];
  const LATE_MINUTES = 15;
  const VIEW_ZONE = qs('view') === '1' ? qs('zone') : null;
  const viewMode = VIEW_ZONE !== null;

  /* ---------- เริ่มหน้า ---------- */
  let me;
  if (viewMode) {
    me = await initZoneScreen();
  } else {
    me = await initStaffPage({ title: 'จอครัว', roles: KITCHEN_ROLES });
    if (me) document.getElementById('content').classList.add('kitchen');
  }
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const esc = fmt.esc;
  let zone = viewMode ? VIEW_ZONE : (ZONES[qs('zone')] ? qs('zone') : '');   // '' = ทุกโซน
  let last = null;

  /**
   * จอโซนไม่มี sidebar/topbar (เต็มจอ มองจากเตา) จึงไม่ใช้ initStaffPage
   * ยังต้องล็อกอินด้วยบัญชีหัวหน้าเชฟ/ผู้จัดการ/เจ้าของร้าน
   */
  async function initZoneScreen() {
    const app = document.getElementById('app');
    let user;
    try { user = await api.get('auth'); } catch { location.href = '/admin/login.html'; return null; }
    if (!ZONES[VIEW_ZONE]) {
      app.innerHTML = `<div class="empty"><div class="empty-icon">🔥</div><h3>ไม่รู้จักโซนครัวนี้</h3>
        <p>ใช้ ?zone=steam, fry, congee_noodle หรือ drink_dessert</p></div>`;
      return null;
    }
    if (!KITCHEN_ROLES.includes(user.role_code)) {
      app.innerHTML = `<div class="empty"><div class="empty-icon">🔒</div><h3>ไม่มีสิทธิ์เข้าถึงหน้านี้</h3>
        <p>ล็อกอินด้วยบัญชีหัวหน้าเชฟที่จอนี้</p></div>`;
      return null;
    }
    document.title = 'จอโซน' + ZONES[VIEW_ZONE] + ' · นึ่งสุข';
    app.innerHTML = '<main class="content kitchen" id="content"></main>';
    document.getElementById('content').appendChild(document.getElementById('page').content.cloneNode(true));
    document.getElementById('chefBar').classList.add('hidden');
    document.getElementById('viewHead').classList.remove('hidden');
    document.getElementById('viewZone').innerHTML =
      `<span class="zone-dot zone-${VIEW_ZONE}" style="width:20px;height:20px"></span>${ZONES[VIEW_ZONE]}`;
    const tick = () => {
      document.getElementById('viewClock').textContent =
        new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);
    return user;
  }

  /* ---------- ข้อความแสดงผล ---------- */
  const placeOf = (it) => it.vip_room_name || it.table_codes || it.bill_no;
  const STEP = {
    waiting: { to: 'cooking', label: '🔥 เริ่มทำ' },
    cooking: { to: 'ready', label: '✅ พร้อมเสิร์ฟ' },
    ready:   { to: 'done', label: '🛎️ เสิร์ฟแล้ว' },
  };

  function card(it) {
    const late = it.wait_minutes >= LATE_MINUTES;
    const step = STEP[it.status];
    const skipQc = it.kitchen_zone === 'drink_dessert' && it.status === 'cooking';
    const actions = viewMode ? '' : `
      <div class="stack" style="gap:8px;margin-top:12px">
        <button class="btn btn-lg btn-block" data-act="status" data-id="${it.id}" data-to="${step.to}">${step.label}</button>
        ${skipQc ? `<button class="btn btn-secondary btn-lg btn-block" data-act="status" data-id="${it.id}" data-to="done">ข้าม QC · เสิร์ฟเลย</button>` : ''}
        <button class="btn btn-danger btn-sm btn-block" data-act="cancel" data-id="${it.id}">ยกเลิกรายการ</button>
      </div>`;
    return `<div class="card order-card zone-border zone-${it.kitchen_zone}${late ? ' late' : ''}">
      <div class="row-between">
        <span class="tile-code">${esc(placeOf(it))}</span>
        <span class="${late ? 'bold text-red' : 'muted'}">${late ? '⏰ ' : ''}${it.wait_minutes} นาที</span>
      </div>
      <div class="item-name bold">${esc(it.menu_name)}</div>
      <div class="${viewMode ? 'h1' : 'h2'}">× ${it.remaining_qty} ${esc(it.unit)}</div>
      ${it.cancelled_qty ? `<div class="small text-red">ยกเลิกแล้ว ${it.cancelled_qty} ${esc(it.unit)}</div>` : ''}
      <div class="row-between" style="margin-top:8px">
        ${badge(it.status)}
        <span class="small muted">รอบ ${it.round_no} · สั่ง ${fmt.time(it.created_at)}</span>
      </div>
      ${!viewMode && !zone ? `<div style="margin-top:8px">${zoneChip(it.kitchen_zone)}</div>` : ''}
      ${actions}
    </div>`;
  }

  /* ---------- วาดหน้า ---------- */
  function renderTabs(d) {
    const tab = (key, label, count) => `
      <button class="btn btn-lg ${zone === key ? '' : 'btn-secondary'}" data-zone="${key}">
        ${key ? `<span class="zone-dot zone-${key}"></span>` : ''}${label}
        <span class="badge ${count ? 'badge-wait' : 'badge-off'}">${count}</span>
      </button>`;
    $('zoneTabs').innerHTML = tab('', 'ทุกโซน', d.total) +
      Object.keys(ZONES).map((z) => tab(z, ZONES[z], d.counts[z] || 0)).join('');
    $('zoneLinks').innerHTML = '<span class="muted">เปิดจอโซน:</span>' + Object.keys(ZONES).map((z) =>
      `<a class="btn btn-ghost btn-sm" href="/admin/kitchen.html?zone=${z}&view=1" target="_blank" rel="noopener">${ZONES[z]} ↗</a>`).join('');
  }

  function render(d) {
    const items = zone ? d.items.filter((it) => it.kitchen_zone === zone) : d.items;
    if (viewMode) $('viewPending').textContent = `ค้าง ${items.length} รายการ`;
    else renderTabs(d);
    $('cards').className = items.length ? 'grid grid-4' : '';      // ไม่มีรายการ: ข้อความกลางจอเต็มความกว้าง
    $('cards').innerHTML = items.length
      ? items.map(card).join('')
      : `<div class="empty"><div class="empty-icon">🥟</div><h3>ยังไม่มีรายการ</h3></div>`;
  }

  async function load() {
    try {
      // จอโซนขอเฉพาะโซนตัวเอง · จอหัวหน้าเชฟขอทุกโซนแล้วกรองตามแท็บ (สลับแท็บได้ทันทีไม่ต้องรอ)
      last = await api.get('kitchen', viewMode ? { zone } : {});
      $('svcAlert').classList.add('hidden');
      render(last);
    } catch (e) {
      // service ดับ (503) หรือเชื่อมต่อไม่ได้: แจ้งเตือนแล้ว poll ต่อ ไม่ล้างการ์ดเดิม
      $('svcAlert').classList.remove('hidden');
    }
  }

  /* ---------- ปุ่ม (เฉพาะโหมดหัวหน้าเชฟ) ---------- */
  const REASONS = { out_of_stock: 'วัตถุดิบหมด (ปิดขายเมนูนี้ทันที)', spoiled: 'ของเสีย', other: 'อื่นๆ' };

  function openCancel(it) {
    const m = openModal({
      title: 'ยกเลิก ' + esc(it.menu_name),
      body: `
        <p class="muted">${esc(placeOf(it))} · สั่ง ${it.remaining_qty} ${esc(it.unit)}</p>
        <div class="field"><label>จำนวนที่ยกเลิก (${esc(it.unit)})</label>
          <input class="input" type="number" id="cQty" min="1" max="${it.remaining_qty}" value="${it.remaining_qty}"></div>
        <div class="field"><label>เหตุผล</label>
          <select class="select" id="cReason">${Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>รายละเอียด (ลูกค้าจะเห็นเหตุผลนี้)</label>
          <textarea class="textarea" id="cNote" maxlength="255" placeholder="เช่น กุ้งหมด"></textarea></div>`,
      footer: `<button class="btn btn-secondary" data-close>กลับ</button>
               <button class="btn btn-danger" id="cOk">ยืนยันยกเลิก</button>`,
    });
    m.el.querySelector('#cOk').onclick = async (e) => {
      const qty = Number(m.el.querySelector('#cQty').value);
      if (!Number.isInteger(qty) || qty < 1 || qty > it.remaining_qty) {
        return toast(`จำนวนต้องอยู่ระหว่าง 1–${it.remaining_qty}`, 'error');
      }
      e.target.disabled = true;
      const r = await run(() => api.post('kitchen', {
        action: 'cancel_item', item_id: it.id, cancel_qty: qty,
        reason: m.el.querySelector('#cReason').value, note: m.el.querySelector('#cNote').value,
      }));
      e.target.disabled = false;
      if (r) { m.close(); load(); }
    };
  }

  if (!viewMode) {
    $('zoneTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-zone]');
      if (!b) return;
      zone = b.dataset.zone;
      if (last) render(last);
    });
    $('cards').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !last) return;
      const it = last.items.find((x) => x.id === Number(b.dataset.id));
      if (!it) return;
      if (b.dataset.act === 'cancel') return openCancel(it);
      b.disabled = true;
      const r = await run(() => api.post('kitchen', { action: 'update_status', item_id: it.id, status: b.dataset.to }));
      if (r) load(); else b.disabled = false;
    });
  }

  poll(load, 5);
})();
