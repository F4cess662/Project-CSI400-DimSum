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
      app.innerHTML = `<div class="empty"><div class="empty-icon"><i data-icon="flame"></i></div><h3>ไม่รู้จักโซนครัวนี้</h3>
        <p>ใช้ ?zone=steam, fry, congee_noodle หรือ drink_dessert</p></div>`;
      return null;
    }
    if (!KITCHEN_ROLES.includes(user.role_code)) {
      app.innerHTML = `<div class="empty"><div class="empty-icon"><i data-icon="lock"></i></div><h3>ไม่มีสิทธิ์เข้าถึงหน้านี้</h3>
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

  /**
   * ปุ่มเปลี่ยนสถานะ สีต่างกันตามขั้น (สีแดงเก็บไว้ให้ "ยกเลิก" อย่างเดียว)
   *   รอ → เริ่มทำ = สีไม้ไผ่ · กำลังทำ → พร้อมเสิร์ฟ = ส้มอำพัน · พร้อม → เสิร์ฟแล้ว = เขียว
   * style.css ยังไม่มี class สีเหล่านี้ จึงใส่สีแบบ inline ไปก่อน
   * (ขอคนที่ 1 เพิ่ม .btn-step-start / .btn-step-ready / .btn-step-serve แล้วเปลี่ยนมาใช้ class)
   */
  const STEP = {
    waiting: { to: 'cooking', label: '<i data-icon="flame"></i> เริ่มทำ', all: 'เริ่มทำทั้งหมด',
      style: 'background:var(--bamboo);color:var(--brown-900);box-shadow:0 4px 0 var(--cream-300)' },
    cooking: { to: 'ready', label: '<i data-icon="check"></i> พร้อมเสิร์ฟ', all: 'พร้อมเสิร์ฟทั้งหมด',
      style: 'background:var(--wait);color:var(--white);box-shadow:0 4px 0 var(--brown-900)' },
    ready:   { to: 'done', label: '<i data-icon="serve"></i> เสิร์ฟแล้ว', all: 'เสิร์ฟทั้งหมด',
      style: 'background:var(--ok);color:var(--white);box-shadow:0 4px 0 var(--brown-900)' },
  };
  const ORDER = ['waiting', 'cooking', 'ready'];

  /* ---------- จัดกลุ่มการ์ด: ตามรอบที่สั่ง (โต๊ะ + รอบ) หรือตามโต๊ะ (ทุกรอบของบิลเดียวกัน) ---------- */
  const GROUP_KEY = 'kitchenGroup';
  let groupBy = 'round';
  try { if (localStorage.getItem(GROUP_KEY) === 'table') groupBy = 'table'; } catch { /* ไม่มี storage ก็ใช้ค่าเริ่มต้น */ }

  /** items เรียงตามเวลาสั่งอยู่แล้ว → กลุ่มเรียงตามรายการที่รอนานสุดของกลุ่ม */
  function groupItems(items) {
    const groups = new Map();
    for (const it of items) {
      const key = groupBy === 'table' ? `b${it.bill_id}` : `b${it.bill_id}-r${it.round_no}`;
      if (!groups.has(key)) groups.set(key, { key, place: placeOf(it), items: [] });
      groups.get(key).items.push(it);
    }
    return [...groups.values()];
  }

  /** 1 รายการในการ์ด: ชื่อ × จำนวน + ป้ายสถานะ + ปุ่ม */
  function itemRow(it, showRound) {
    const step = STEP[it.status];
    const skipQc = it.kitchen_zone === 'drink_dessert' && it.status === 'cooking';
    const late = it.wait_minutes >= LATE_MINUTES;
    const actions = viewMode ? '' : `
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn" style="${step.style}" data-act="status" data-id="${it.id}" data-to="${step.to}">${step.label}</button>
        ${skipQc ? `<button class="btn btn-secondary" data-act="status" data-id="${it.id}" data-to="done">ข้าม QC · เสิร์ฟเลย</button>` : ''}
        <button class="btn btn-danger btn-sm" data-act="cancel" data-id="${it.id}">ยกเลิก</button>
      </div>`;
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--cream-300)">
      <div class="row-between" style="align-items:flex-start;flex-wrap:nowrap">
        <div>
          <div class="item-name bold">${!zone ? `<span class="zone-dot zone-${it.kitchen_zone}" title="${esc(ZONES[it.kitchen_zone] || '')}"></span> ` : ''}${esc(it.menu_name)}</div>
          <div class="${viewMode ? 'h2' : 'bold'}">× ${it.remaining_qty} ${esc(it.unit)}
            ${it.cancelled_qty ? `<span class="small text-red">(ยกเลิกแล้ว ${it.cancelled_qty})</span>` : ''}</div>
          ${showRound || late ? `<div class="small ${late ? 'text-red bold' : 'muted'}">${showRound ? `รอบ ${it.round_no} · ` : ''}รอ ${it.wait_minutes} นาที</div>` : ''}
        </div>
        ${badge(it.status)}
      </div>
      ${actions}
    </div>`;
  }

  function card(g) {
    const oldest = g.items[0];
    const late = g.items.some((it) => it.wait_minutes >= LATE_MINUTES);
    const zones = [...new Set(g.items.map((it) => it.kitchen_zone))];
    const rounds = [...new Set(g.items.map((it) => it.round_no))];
    // ปุ่มทำทั้งการ์ด: เลื่อนทุกรายการที่อยู่ขั้นแรกสุดของการ์ดไปขั้นถัดไป (มีตั้งแต่ 2 รายการขึ้นไป)
    const first = ORDER.find((st) => g.items.some((it) => it.status === st));
    const firstIds = g.items.filter((it) => it.status === first).map((it) => it.id);
    const bulk = !viewMode && firstIds.length > 1
      ? `<button class="btn btn-block" style="${STEP[first].style};margin-top:12px" data-act="bulk" data-ids="${firstIds.join(',')}" data-to="${STEP[first].to}">
          ${STEP[first].all} (${firstIds.length})</button>` : '';
    return `<div class="card order-card${zones.length === 1 ? ` zone-border zone-${zones[0]}` : ''}${late ? ' late' : ''}">
      <div class="row-between">
        <span class="tile-code">${esc(g.place)}</span>
        <span class="${late ? 'bold text-red' : 'muted'}">${late ? '<i data-icon="clock"></i> ' : ''}${oldest.wait_minutes} นาที</span>
      </div>
      <div class="small muted">${groupBy === 'table' ? `รอบ ${rounds.join(', ')}` : `รอบ ${oldest.round_no} · สั่ง ${fmt.time(oldest.created_at)}`}
        · ${g.items.length} รายการ</div>
      ${bulk}
      ${g.items.map((it) => itemRow(it, groupBy === 'table' && rounds.length > 1)).join('')}
    </div>`;
  }

  /* ---------- วาดหน้า ---------- */
  function renderTabs(d) {
    // แท็บที่เลือกใช้สีไม้ไผ่แทนสีแดง (สีแดง = ยกเลิก/ปิด)
    const tab = (key, label, count) => `
      <button class="btn btn-lg ${zone === key ? '' : 'btn-secondary'}" data-zone="${key}"
        ${zone === key ? `style="${STEP.waiting.style}"` : ''}>
        ${key ? `<span class="zone-dot zone-${key}"></span>` : ''}${label}
        <span class="badge ${count ? 'badge-wait' : 'badge-off'}">${count}</span>
      </button>`;
    $('zoneTabs').innerHTML = tab('', 'ทุกโซน', d.total) +
      Object.keys(ZONES).map((z) => tab(z, ZONES[z], d.counts[z] || 0)).join('');
    $('zoneLinks').innerHTML = '<span class="muted">เปิดจอโซน:</span>' + Object.keys(ZONES).map((z) =>
      `<a class="btn btn-ghost btn-sm" href="/admin/kitchen.html?zone=${z}&view=1" target="_blank" rel="noopener">${ZONES[z]} <i data-icon="external"></i></a>`).join('');
  }

  function render(d) {
    const items = zone ? d.items.filter((it) => it.kitchen_zone === zone) : d.items;
    if (viewMode) $('viewPending').textContent = `ค้าง ${items.length} รายการ`;
    else renderTabs(d);
    $('cards').className = items.length ? 'grid grid-3' : '';      // ไม่มีรายการ: ข้อความกลางจอเต็มความกว้าง
    $('cards').innerHTML = items.length
      ? groupItems(items).map(card).join('')
      : `<div class="empty"><div class="empty-icon"><i data-icon="dumpling"></i></div><h3>ยังไม่มีรายการ</h3></div>`;
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

  // ปุ่มสลับการจัดกลุ่ม (ใช้ได้ทั้งจอหัวหน้าเชฟและจอโซน) · จำค่าที่เลือกไว้ในเครื่อง
  const groupTabs = document.createElement('div');
  groupTabs.className = 'tabs';
  groupTabs.style.marginBottom = '12px';
  const drawGroupTabs = () => {
    groupTabs.innerHTML = `<button class="tab${groupBy === 'round' ? ' active' : ''}" data-group="round">แยกตามรอบที่สั่ง</button>
      <button class="tab${groupBy === 'table' ? ' active' : ''}" data-group="table">รวมตามโต๊ะ</button>`;
  };
  drawGroupTabs();
  $('svcAlert').before(groupTabs);
  groupTabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    groupBy = b.dataset.group;
    try { localStorage.setItem(GROUP_KEY, groupBy); } catch { /* ไม่มี storage ก็ไม่เป็นไร */ }
    drawGroupTabs();
    if (last) render(last);
  });

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
      if (b.dataset.act === 'bulk') {
        // ทำทั้งการ์ด: ส่งทีละรายการ (API เปลี่ยนสถานะทีละรายการ) แล้วโหลดใหม่ครั้งเดียว
        b.disabled = true;
        const ids = b.dataset.ids.split(',').map(Number);
        let okCount = 0;
        for (const id of ids) {
          try { await api.post('kitchen', { action: 'update_status', item_id: id, status: b.dataset.to }); okCount++; } catch (err) { toast(err.message, 'error'); }
        }
        if (okCount) toast(`อัปเดต ${okCount} รายการแล้ว`);
        load();
        return;
      }
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
