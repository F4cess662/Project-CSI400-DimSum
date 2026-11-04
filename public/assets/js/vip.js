/* =========================================================
   vip.js — จองห้อง VIP (คนที่ 4 · เฟส 3)
   - ตารางห้อง × ชั่วโมง (สีตาม badge สถานะ) + รายการจองของวัน · poll ทุก 10 วินาที
   - modal-lg 3 ขั้น: เวลา → ลูกค้า → pre-order (+ แถบยอดขั้นต่ำ)
   - side-panel รายละเอียดการจอง + ปุ่มตามสถานะ (รับมัดจำ / แก้ pre-order / มาถึง / ไม่มา / ยกเลิก)
   ค่าขั้นต่ำ มัดจำ % ชั่วโมงสูงสุด อ่านจาก window.SHOP (ตั้งค่าร้าน)
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'จองห้อง VIP', roles: ['staff', 'manager', 'owner'], perm: 'vip_booking' });
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const shop = () => window.SHOP || {};
  const ymd = (d) => d.toLocaleDateString('sv-SE');
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const panel = $('panel');

  let day = ymd(new Date());
  let avail = null;
  let bookings = [];
  let selectedId = null;

  $('legend').innerHTML = [badge('available', 'ว่าง'), badge('pending_deposit'), badge('confirmed'), badge('arrived')].join(' ');

  /* ---------- ตารางห้อง × ชั่วโมง ---------- */
  function drawGrid() {
    $('gridHead').innerHTML = `<tr><th>ห้อง</th>${avail.hours.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    if (!avail.rooms.length) {
      $('gridBody').innerHTML = `<tr><td colspan="${avail.hours.length + 1}"><div class="empty">ยังไม่มีห้อง VIP ที่เปิดใช้งาน</div></td></tr>`;
      return;
    }
    $('gridBody').innerHTML = avail.rooms.map((r) => {
      const cells = [];
      for (let i = 0; i < r.slots.length; i++) {
        const s = r.slots[i];
        if (s.booking_id) {
          // ช่องติดกันของการจองเดียวกันรวมเป็นช่องเดียว
          let span = 1;
          while (r.slots[i + span] && r.slots[i + span].booking_id === s.booking_id) span++;
          cells.push(`<td colspan="${span}"><button class="btn btn-ghost btn-sm" data-bk="${s.booking_id}">${badge(s.status, s.customer_name)}</button></td>`);
          i += span - 1;
        } else if (s.status === 'free') {
          cells.push(`<td><button class="btn btn-ghost btn-sm" data-new="${r.id}|${s.hour}">+ ว่าง</button></td>`);
        } else {
          cells.push('<td><span class="caption muted">–</span></td>');
        }
      }
      return `<tr><td class="bold">${fmt.esc(r.name)}<div class="caption muted">${r.seats} ที่นั่ง</div></td>${cells.join('')}</tr>`;
    }).join('');
    $('gridBody').querySelectorAll('[data-bk]').forEach((b) => { b.onclick = () => select(Number(b.dataset.bk)); });
    $('gridBody').querySelectorAll('[data-new]').forEach((b) => {
      b.onclick = () => { const [room, hour] = b.dataset.new.split('|'); openBooking({ room_id: Number(room), hour }); };
    });
  }

  function drawList() {
    $('listBody').innerHTML = bookings.length ? bookings.map((b) => `
      <tr class="clickable" data-id="${b.id}">
        <td>${b.start_time}–${b.end_time}</td><td>${fmt.esc(b.room_name)}</td>
        <td>${fmt.esc(b.customer_name)}<div class="caption muted">${fmt.esc(b.customer_phone)}</div></td>
        <td class="num">${b.guests}</td><td class="num">${fmt.baht(b.preorder_total)}</td>
        <td class="num">${fmt.baht(b.deposit_amount)}</td><td>${badge(b.status)}</td>
      </tr>`).join('')
      : '<tr><td colspan="7"><div class="empty"><div class="empty-icon">📅</div>ยังไม่มีการจองวันนี้</div></td></tr>';
    $('listBody').querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => select(Number(tr.dataset.id)); });
  }

  async function loadDay() {
    try {
      [avail, bookings] = await Promise.all([
        api.get('vip_bookings', { action: 'availability', date: day }),
        api.get('vip_bookings', { date: day }),
      ]);
      drawGrid();
      drawList();
    } catch (e) {
      $('gridBody').innerHTML = `<tr><td><div class="alert alert-bad">โหลดตารางจองไม่สำเร็จ: ${fmt.esc(e.message)}</div></td></tr>`;
    }
  }

  function setDay(d) {
    day = d;
    $('dayInput').value = d;
    loadDay();
  }

  /* ---------- side-panel รายละเอียดการจอง ---------- */
  async function select(id) {
    selectedId = id;
    const bk = await run(() => api.get('vip_bookings', { id }));
    if (bk && selectedId === id) renderPanel(bk);
  }

  function renderPanel(bk) {
    const line = (label, value) => `<div class="row-between"><span class="muted">${label}</span><span>${value}</span></div>`;
    const deposit = bk.deposit_received_at
      ? `${fmt.baht(bk.deposit_amount)} ${badge('paid', 'รับแล้ว')}`
      : `${fmt.baht(bk.deposit_amount)} ${badge('pending_deposit', 'ยังไม่รับ')}`;
    const btn = (key, label, cls = 'btn-secondary') => `<button class="btn ${cls} btn-block" data-act="${key}">${label}</button>`;
    panel.innerHTML = `
      <div class="row-between"><h3 style="margin:0">${fmt.esc(bk.room_name)}</h3>${badge(bk.status)}</div>
      <p class="small muted">${fmt.date(bk.booking_date)} · ${bk.start_time}–${bk.end_time} น. (${bk.hours} ชม.)</p>
      <div class="stack">
        <div>
          ${line('ลูกค้า', fmt.esc(bk.customer_name))}
          ${line('เบอร์โทร', fmt.esc(bk.customer_phone))}
          ${line('จำนวนคน', `${bk.guests} คน`)}
          ${line('จองโดย', fmt.esc(bk.created_by_name))}
        </div>
        <div>
          <div class="bold" style="margin-bottom:8px">pre-order</div>
          ${bk.items.map((it) => `<div class="row-between small">
              <span>${fmt.esc(it.name)} × ${it.qty} ${fmt.esc(it.unit)}</span><span>${fmt.baht(it.line_total)}</span></div>`).join('')}
          ${line('<b>ยอดรวม</b>', `<span class="price">${fmt.baht(bk.preorder_total)}</span>`)}
        </div>
        <div>
          ${line('มัดจำ', deposit)}
          ${bk.deposit_received_at ? line('รับเมื่อ', `${fmt.datetime(bk.deposit_received_at)} · ${fmt.esc(bk.deposit_received_by_name || '')}`) : ''}
          ${bk.bill ? line('บิล', `${fmt.esc(bk.bill.bill_no)} ${badge(bk.bill.status)}`) : ''}
        </div>
        ${['no_show', 'cancelled'].includes(bk.status) && bk.deposit_received_at
          ? '<div class="alert alert-wait small">มัดจำไม่คืน (BR-16)</div>' : ''}
        <div class="stack">
          ${bk.can_confirm_deposit ? btn('confirm', `💰 รับมัดจำ ${fmt.baht(bk.deposit_amount)}`, '') : ''}
          ${bk.can_arrive ? btn('arrive', '✅ ลูกค้ามาถึง · เปิดห้อง', '') : ''}
          ${bk.bill && bk.bill.status === 'open' && typeof window.showBillQr === 'function' ? btn('qr', '📱 ดู QR สั่งอาหาร') : ''}
          ${bk.can_edit_preorder ? btn('edit', '✏️ แก้ pre-order') : ''}
          ${bk.can_no_show ? btn('no_show', '🚫 ลูกค้าไม่มา', 'btn-danger') : ''}
          ${bk.can_cancel ? btn('cancel', 'ยกเลิกการจอง', 'btn-ghost') : ''}
        </div>
      </div>`;

    const on = (key, fn) => { const b = panel.querySelector(`[data-act="${key}"]`); if (b) b.onclick = fn; };
    on('confirm', async () => {
      if (await confirmModal(`รับมัดจำ ${fmt.baht(bk.deposit_amount)} จาก ${fmt.esc(bk.customer_name)}?`, 'รับมัดจำแล้ว')) {
        await post({ action: 'confirm_deposit', id: bk.id }, bk.id);
      }
    });
    on('arrive', async () => {
      if (!(await confirmModal(`เปิด${fmt.esc(bk.room_name)} ให้ ${fmt.esc(bk.customer_name)} และส่ง pre-order ${bk.items.length} รายการเข้าครัว?`, 'เปิดห้อง'))) return;
      const bill = await post({ action: 'arrive', id: bk.id }, bk.id);
      if (bill && typeof window.showBillQr === 'function') window.showBillQr(bill);
    });
    on('qr', () => window.showBillQr(bk.bill));
    on('edit', () => openPreorder(bk));
    const depositNote = bk.deposit_received_at ? `<br><span class="small">มัดจำ ${fmt.baht(bk.deposit_amount)} ไม่คืน (BR-16)</span>` : '';
    on('no_show', async () => {
      if (await confirmModal(`บันทึกว่า ${fmt.esc(bk.customer_name)} ไม่มา?${depositNote}`, 'ลูกค้าไม่มา', true)) {
        await post({ action: 'no_show', id: bk.id }, bk.id);
      }
    });
    on('cancel', async () => {
      if (await confirmModal(`ยกเลิกการจองของ ${fmt.esc(bk.customer_name)}?${depositNote}`, 'ยกเลิกการจอง', true)) {
        await post({ action: 'cancel', id: bk.id }, bk.id);
      }
    });
  }

  /** ส่ง POST แล้วโหลดตาราง + แผงใหม่ */
  async function post(body, id) {
    const data = await run(() => api.post('vip_bookings', body));
    if (data !== null) { await loadDay(); if (id) await select(id); }
    return data;
  }

  /* ---------- ตัวเลือก pre-order (ใช้ทั้งจองใหม่และแก้) ---------- */
  function preorderEditor(el, cart, { depositFixed = null } = {}) {
    el.innerHTML = `
      <div class="field"><input class="input" data-q placeholder="🔍 ค้นหาเมนู เช่น ฮะเก๋า, กุ้ง, ซาลาเปา"></div>
      <div class="tabs-scroll" data-cats></div>
      <div class="grid grid-2" style="margin-top:12px">
        <div class="stack" data-menus><div class="loading">กำลังโหลดเมนู...</div></div>
        <div><div class="bold" style="margin-bottom:8px">รายการที่เลือก</div><div data-cart></div></div>
      </div>`;
    const q = el.querySelector('[data-q]');
    let menus = [];
    let categoryId = '';
    let timer = null;

    const total = () => [...cart.values()].reduce((a, it) => a + it.qty * it.price, 0);
    function change(menu, delta) {
      const cur = cart.get(menu.id) || { menu_item_id: menu.id, name: menu.name, unit: menu.unit, price: Number(menu.price), qty: 0 };
      cur.qty = Math.max(0, cur.qty + delta);
      if (cur.qty) cart.set(menu.id, cur); else cart.delete(menu.id);
      drawMenus();
      drawCart();
    }

    function drawMenus() {
      const box = el.querySelector('[data-menus]');
      box.innerHTML = menus.length ? menus.map((mn) => {
        const qty = cart.has(mn.id) ? cart.get(mn.id).qty : 0;
        return `<div class="row-between">
          <div><div class="bold small">${fmt.esc(mn.name)}</div><div class="caption muted">${fmt.baht(mn.price)} / ${fmt.esc(mn.unit)}</div></div>
          <div class="qty"><button class="btn btn-secondary" data-minus="${mn.id}" ${qty ? '' : 'disabled'}>−</button>
            <span class="qty-num">${qty}</span><button class="btn" data-plus="${mn.id}">+</button></div>
        </div>`;
      }).join('') : '<div class="empty small">ไม่พบเมนู</div>';
      const find = (id) => menus.find((mn) => mn.id === Number(id));
      box.querySelectorAll('[data-plus]').forEach((b) => { b.onclick = () => change(find(b.dataset.plus), 1); });
      box.querySelectorAll('[data-minus]').forEach((b) => { b.onclick = () => change(find(b.dataset.minus), -1); });
    }

    function drawCart() {
      const min = Number(shop().vip_min_spend || 0);
      const pct = Number(shop().vip_deposit_percent || 0);
      const sum = total();
      const list = [...cart.values()];
      el.querySelector('[data-cart]').innerHTML = `
        ${list.length ? list.map((it) => `<div class="row-between small">
            <span>${fmt.esc(it.name)} × ${it.qty} ${fmt.esc(it.unit)}</span><span>${fmt.baht(it.qty * it.price)}</span></div>`).join('')
          : '<p class="small muted">ยังไม่ได้เลือกเมนู</p>'}
        <div class="row-between" style="margin-top:8px"><span class="bold">ยอดรวม</span><span class="price">${fmt.baht(sum)}</span></div>
        <div class="alert ${sum >= min ? 'alert-ok' : 'alert-wait'} small" style="margin-top:8px">
          ${sum >= min ? `✓ ถึงยอดขั้นต่ำ ${fmt.baht(min)} แล้ว` : `ยอดขั้นต่ำ ${fmt.baht(min)} · ขาดอีก ${fmt.baht(min - sum)}`}</div>
        <div class="small muted" style="margin-top:8px">${depositFixed !== null
          ? `รับมัดจำไปแล้ว ${fmt.baht(depositFixed)} (ยอดมัดจำไม่เปลี่ยน)`
          : `มัดจำ ${pct}% = ${fmt.baht(Math.round(sum * pct) / 100)}`}</div>`;
    }

    async function loadMenus() {
      try {
        const rows = await api.get('menus', { q: q.value.trim(), category_id: categoryId });
        menus = rows.filter((mn) => mn.is_available === 1);
        // ราคาในตะกร้าใช้ราคาปัจจุบัน (server คิดราคาใหม่ตอนบันทึก)
        menus.forEach((mn) => { if (cart.has(mn.id)) cart.get(mn.id).price = Number(mn.price); });
        drawMenus();
        drawCart();
      } catch (e) {
        el.querySelector('[data-menus]').innerHTML = `<div class="alert alert-bad small">โหลดเมนูไม่สำเร็จ: ${fmt.esc(e.message)}</div>`;
      }
    }

    api.get('categories').then((cats) => {
      const box = el.querySelector('[data-cats]');
      box.innerHTML = [{ id: '', name: 'ทั้งหมด' }, ...cats].map((c) =>
        `<button class="chip ${String(c.id) === String(categoryId) ? 'active' : ''}" data-cat="${c.id}">${fmt.esc(c.name)}</button>`).join('');
      box.querySelectorAll('[data-cat]').forEach((b) => {
        b.onclick = () => {
          categoryId = b.dataset.cat;
          box.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('active', x === b));
          loadMenus();
        };
      });
    }).catch(() => {});
    q.oninput = () => { clearTimeout(timer); timer = setTimeout(loadMenus, 300); };
    drawCart();
    loadMenus();

    return {
      total,
      items: () => [...cart.values()].map((it) => ({ menu_item_id: it.menu_item_id, qty: it.qty })),
    };
  }

  /* ---------- แก้ pre-order ---------- */
  function openPreorder(bk) {
    const cart = new Map(bk.items.map((it) =>
      [it.menu_item_id, { menu_item_id: it.menu_item_id, name: it.name, unit: it.unit, price: it.unit_price, qty: it.qty }]));
    const m = openModal({
      title: `แก้ pre-order · ${fmt.esc(bk.room_name)} ${fmt.date(bk.booking_date)}`,
      size: 'lg',
      body: '<div data-ed></div>',
      footer: '<button class="btn btn-secondary" data-close>ยกเลิก</button><button class="btn" data-save>บันทึก pre-order</button>',
    });
    const ed = preorderEditor(m.el.querySelector('[data-ed]'), cart,
      { depositFixed: bk.status === 'confirmed' ? bk.deposit_amount : null });
    m.el.querySelector('[data-save]').onclick = async () => {
      if (ed.total() < Number(shop().vip_min_spend || 0)) { toast('ยอด pre-order ยังไม่ถึงขั้นต่ำ', 'error'); return; }
      const done = await post({ action: 'update_preorder', id: bk.id, items: ed.items() }, bk.id);
      if (done !== null) m.close();
    };
  }

  /* ---------- จองใหม่: modal 3 ขั้น ---------- */
  async function openBooking(preset = {}) {
    const f = {
      room_id: preset.room_id || '', date: day, start: preset.hour || '', hours: 1,
      name: '', phone: '', guests: '', cart: new Map(),
    };
    let step = 1;
    let dayAvail = avail && avail.date === f.date ? avail : null;
    let editor = null;

    const m = openModal({
      title: 'จองห้อง VIP',
      size: 'lg',
      body: '<div data-wz></div>',
      footer: '<button class="btn btn-secondary" data-back>ยกเลิก</button><button class="btn" data-next>ถัดไป</button>',
    });
    const body = m.el.querySelector('[data-wz]');
    const backBtn = m.el.querySelector('[data-back]');
    const nextBtn = m.el.querySelector('[data-next]');
    const val = (sel) => body.querySelector(sel).value;

    const room = () => dayAvail && dayAvail.rooms.find((r) => r.id === Number(f.room_id));
    const maxGuests = () => Math.min(room() ? room().seats : 15, 15);

    /** ห้องว่างครบทุกชั่วโมงและอยู่ในกะเดียวกันไหม */
    function slotCheck() {
      const r = room();
      if (!r || !f.start) return { ok: false, msg: 'เลือกห้องและเวลาเริ่ม' };
      const start = toMin(f.start);
      for (let i = 0; i < f.hours; i++) {
        const s = r.slots.find((x) => toMin(x.hour) === start + i * 60);
        if (!s) return { ok: false, msg: 'ช่วงเวลานี้เกินเวลาเปิดร้านของกะนั้น' };
        if (s.status === 'past') return { ok: false, msg: 'เลยเวลานี้ไปแล้ว' };
        if (s.status !== 'free') return { ok: false, msg: `${s.hour} มีการจองของ ${s.customer_name || 'ลูกค้าอื่น'} แล้ว` };
      }
      const end = start + f.hours * 60;
      const p = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
      return { ok: true, msg: `${r.name} ว่าง ${f.start}–${p(end)} น.` };
    }

    const tabs = () => `<div class="tabs" style="margin-bottom:16px">${['1. เวลา', '2. ลูกค้า', '3. pre-order']
      .map((t, i) => `<span class="tab ${i + 1 === step ? 'active' : ''}">${t}</span>`).join('')}</div>`;

    async function render() {
      backBtn.textContent = step === 1 ? 'ยกเลิก' : 'ย้อนกลับ';
      nextBtn.textContent = step === 3 ? 'ยืนยันการจอง' : 'ถัดไป';

      if (step === 1) {
        if (!dayAvail || dayAvail.date !== f.date) {
          body.innerHTML = tabs() + '<div class="loading">กำลังโหลดห้องว่าง...</div>';
          dayAvail = await run(() => api.get('vip_bookings', { action: 'availability', date: f.date }));
          if (!dayAvail) return;
        }
        const maxH = Number(shop().vip_max_hours || dayAvail.settings.vip_max_hours || 1);
        f.hours = Math.min(f.hours, maxH);
        body.innerHTML = tabs() + `
          <div class="grid grid-2">
            <div class="field"><label>วันที่</label><input class="input" id="wDate" type="date" min="${ymd(new Date())}" value="${f.date}"></div>
            <div class="field"><label>ห้อง</label><select class="select" id="wRoom">
              <option value="">— เลือกห้อง —</option>
              ${dayAvail.rooms.map((r) => `<option value="${r.id}" ${r.id === Number(f.room_id) ? 'selected' : ''}>${fmt.esc(r.name)} (${r.seats} ที่)</option>`).join('')}
            </select></div>
            <div class="field"><label>เวลาเริ่ม (ต้นชั่วโมง)</label><select class="select" id="wStart">
              <option value="">— เลือกเวลา —</option>
              ${dayAvail.hours.map((h) => `<option value="${h}" ${h === f.start ? 'selected' : ''}>${h} น.</option>`).join('')}
            </select></div>
            <div class="field"><label>จำนวนชั่วโมง (สูงสุด ${maxH})</label><select class="select" id="wHours">
              ${Array.from({ length: maxH }, (_, i) => i + 1).map((h) => `<option value="${h}" ${h === f.hours ? 'selected' : ''}>${h} ชั่วโมง</option>`).join('')}
            </select></div>
          </div>
          <div id="wSlot"></div>`;
        const showSlot = () => {
          const c = slotCheck();
          body.querySelector('#wSlot').innerHTML = `<div class="alert ${c.ok ? 'alert-ok' : 'alert-wait'}">${fmt.esc(c.msg)}</div>`;
        };
        body.querySelector('#wDate').onchange = () => { f.date = val('#wDate'); render(); };
        body.querySelector('#wRoom').onchange = () => { f.room_id = val('#wRoom'); showSlot(); };
        body.querySelector('#wStart').onchange = () => { f.start = val('#wStart'); showSlot(); };
        body.querySelector('#wHours').onchange = () => { f.hours = Number(val('#wHours')); showSlot(); };
        showSlot();
      } else if (step === 2) {
        body.innerHTML = tabs() + `
          <div class="field"><label>ชื่อลูกค้า</label><input class="input" id="wName" maxlength="100" value="${fmt.esc(f.name)}"></div>
          <div class="grid grid-2">
            <div class="field"><label>เบอร์โทร (ใช้ส่ง SMS ยืนยัน)</label><input class="input" id="wPhone" type="tel" maxlength="12" placeholder="08xxxxxxxx" value="${fmt.esc(f.phone)}"></div>
            <div class="field"><label>จำนวนคน (ไม่เกิน ${maxGuests()})</label><input class="input" id="wGuests" type="number" min="1" max="${maxGuests()}" value="${f.guests}"></div>
          </div>`;
      } else {
        body.innerHTML = tabs() + `<p class="small muted">${fmt.esc(room().name)} · ${fmt.date(f.date)} ${f.start} น. · ${f.hours} ชม. · ${fmt.esc(f.name)} ${f.guests} คน</p><div data-ed></div>`;
        editor = preorderEditor(body.querySelector('[data-ed]'), f.cart);
      }
    }

    function saveStep2() {
      f.name = val('#wName').trim();
      f.phone = val('#wPhone').trim();
      f.guests = val('#wGuests');
    }

    backBtn.onclick = (e) => {
      e.stopPropagation();
      if (step === 1) { m.close(); return; }
      if (step === 2) saveStep2();
      step--;
      render();
    };
    nextBtn.onclick = async () => {
      if (step === 1) {
        const c = slotCheck();
        if (!c.ok) { toast(c.msg, 'error'); return; }
      } else if (step === 2) {
        saveStep2();
        const g = Number(f.guests);
        if (!f.name) { toast('กรุณากรอกชื่อลูกค้า', 'error'); return; }
        if (!/^0\d{8,9}$/.test(f.phone.replace(/[\s-]/g, ''))) { toast('เบอร์โทรไม่ถูกต้อง', 'error'); return; }
        if (!Number.isInteger(g) || g < 1 || g > maxGuests()) { toast(`จำนวนคนต้องอยู่ระหว่าง 1 ถึง ${maxGuests()} คน`, 'error'); return; }
      } else {
        if (editor.total() < Number(shop().vip_min_spend || 0)) { toast('ยอด pre-order ยังไม่ถึงขั้นต่ำ', 'error'); return; }
        nextBtn.disabled = true;
        const res = await run(() => api.post('vip_bookings', {
          action: 'create', vip_room_id: Number(f.room_id), booking_date: f.date, start_time: f.start, hours: f.hours,
          customer_name: f.name, customer_phone: f.phone, guests: Number(f.guests), items: editor.items(),
        }));
        nextBtn.disabled = false;
        if (!res) return;
        m.close();
        setDay(f.date);
        select(res.id);
        return;
      }
      step++;
      render();
    };
    render();
  }

  $('dayInput').value = day;
  $('dayInput').onchange = () => { if ($('dayInput').value) setDay($('dayInput').value); };
  $('prevDay').onclick = () => setDay(addDays(day, -1));
  $('nextDay').onclick = () => setDay(addDays(day, 1));
  $('todayBtn').onclick = () => setDay(ymd(new Date()));
  $('newBtn').onclick = () => openBooking();
  poll(loadDay, 10);
})();
