/* =========================================================
   vip.js — จองห้อง VIP แบบแพ็กเกจ (คนที่ 4 · เฟส 3 + แก้ตาม Feedback เฟส 3)
   - ตารางห้อง × ชั่วโมง (สีตาม badge สถานะ · ช่วงที่ปล่อยห้องแล้วกลับเป็นว่าง) + รายการจองของวัน · poll ทุก 10 วินาที
   - modal-lg 4 ขั้น: เวลา + แพ็กเกจ → ลูกค้า → สั่งล่วงหน้า (ไม่บังคับ) → ทวนรายการ
   - side-panel รายละเอียด + ปุ่มตามสถานะ: รับมัดจำ / มาถึง (เหมาวันรอบละครั้ง) / แก้สั่งล่วงหน้า / เลื่อน /
     ปล่อยห้อง / ไม่มา / ยกเลิก · ผู้จัดการ: เลื่อนแบบร้าน + ยกเลิกคืนมัดจำ + ปุ่ม "เหตุสุดวิสัย"
   - ป้าย "โทรตาม" + เบอร์ลูกค้า เมื่อยืนยันแล้วเลยเวลาเริ่ม ≥ 10 นาทียังไม่มา
   % มัดจำ เวลาเปิด-ปิด อ่านจาก window.SHOP (ตั้งค่าร้าน) · ราคาแพ็กเกจจาก API
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'จองห้อง VIP', roles: ['staff', 'manager', 'owner'], perm: 'vip_booking' });
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const shop = () => window.SHOP || {};
  const isManager = ['manager', 'owner'].includes(me.role_code);
  const ymd = (d) => d.toLocaleDateString('sv-SE');
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const fromMin = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const pct = () => Number(shop().vip_deposit_percent || 0);
  const panel = $('panel');
  const SETUP = 10;

  let day = ymd(new Date());
  let avail = null;
  let bookings = [];
  let selectedId = null;

  $('legend').innerHTML = [badge('available', 'ว่าง'), badge('pending_deposit'), badge('confirmed'), badge('arrived'),
    badge('released', 'ปล่อยห้องแล้ว')].join(' ');
  if (isManager) $('forceBtn').classList.remove('hidden');

  /* ---------- คำนวณช่วงเวลาตามแพ็กเกจ (ฝั่งหน้าเว็บ ใช้แสดงผล · server เช็กซ้ำตอนบันทึก) ---------- */
  const pkgText = (p) => p ? `${p.name} · ${p.hours === null ? 'เหมาวัน (กะเช้า + กะเย็น)' : p.hours + ' ชม.'} · ${fmt.baht(p.price)}` : '';

  /** เวลาใช้ห้องจริงเมื่อเริ่ม start ด้วยแพ็กเกจ p → "10:00–11:50" · เหมาวัน "10:00–13:50, 16:00–19:50" */
  function usageLabel(p, start) {
    if (!p || !start) return '';
    if (p.hours !== null) return `${start}–${fromMin(toMin(start) + p.hours * 60 - SETUP)}`;
    const s = shop();
    return [[s.morning_open, s.morning_close], [s.evening_open, s.evening_close]]
      .filter(([o, c]) => o && c)
      .map(([o, c]) => [Math.max(toMin(start), toMin(o)), toMin(c)])
      .filter(([f, t]) => f < t)
      .map(([f, t]) => `${fromMin(f)}–${fromMin(t - SETUP)}`).join(', ');
  }

  /**
   * เวลาเริ่มที่จองได้ของห้อง r ด้วยแพ็กเกจ p → ['10:00', ...]
   * selfId = การจองตัวเอง (ตอนเลื่อน) ให้นับช่องของตัวเองเป็นว่าง
   */
  function validStarts(r, p, selfId = 0) {
    if (!r || !p) return [];
    const free = (x) => x.status === 'free' || (selfId && x.booking_id === selfId);
    const open = r.slots.filter((x) => x.status !== 'past');
    if (p.hours === null) return open.length && open.every(free) ? [open[0].hour] : [];
    const out = [];
    r.slots.forEach((x, i) => {
      const run = r.slots.slice(i, i + p.hours);
      if (run.length < p.hours) return;
      const sameShift = run.every((y, k) => y.shift === x.shift && toMin(y.hour) === toMin(x.hour) + k * 60);
      if (sameShift && run.every(free)) out.push(x.hour);
    });
    return out;
  }

  /** ทวนรายการสั่งล่วงหน้า "1. ขนมจีบกุ้ง × 2 เข่ง" + "รวม x รายการ" */
  function reviewList(items) {
    if (!items.length) return '<p class="small muted">ไม่สั่งอาหารล่วงหน้า (สั่งเพิ่มได้ตอนมาถึง)</p>';
    return items.map((it, i) => `<div class="row-between small">
        <span>${i + 1}. ${fmt.esc(it.name)} × ${it.qty} ${fmt.esc(it.unit)}</span><span>${fmt.baht(it.qty * it.price)}</span></div>`).join('')
      + `<div class="caption muted" style="margin-top:4px">รวม ${items.length} รายการ</div>`;
  }

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
          // ช่องติดกันของการจองเดียวกัน (กะเดียวกัน) รวมเป็นช่องเดียว
          let span = 1;
          while (r.slots[i + span] && r.slots[i + span].booking_id === s.booking_id && r.slots[i + span].shift === s.shift) span++;
          const text = s.status === 'released' ? `${s.customer_name} · ปล่อยแล้ว` : s.customer_name;
          cells.push(`<td colspan="${span}"><button class="btn btn-ghost btn-sm" data-bk="${s.booking_id}">${badge(s.status, text)}</button></td>`);
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
        <td>${b.time_label}</td><td>${fmt.esc(b.room_name)}</td>
        <td>${fmt.esc(b.package_name || (b.is_fullday ? 'เหมาวัน' : b.hours + ' ชม.'))}</td>
        <td>${fmt.esc(b.customer_name)}<div class="caption muted">${fmt.esc(b.customer_phone)}</div>
          ${b.can_call_follow ? `<div>${badge('low', 'โทรตาม')}</div>` : ''}</td>
        <td class="num">${b.guests}</td><td class="num">${fmt.baht(b.room_fee + b.preorder_total)}</td>
        <td class="num">${fmt.baht(b.deposit_amount)}</td><td>${statusBadge(b)}</td>
      </tr>`).join('')
      : '<tr><td colspan="8"><div class="empty"><div class="empty-icon"><i data-icon="calendar"></i></div>ยังไม่มีการจองวันนี้</div></td></tr>';
    $('listBody').querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => select(Number(tr.dataset.id)); });

    // ป้ายโทรตามรวมด้านบน
    const calls = bookings.filter((b) => b.can_call_follow);
    $('followBox').innerHTML = calls.length ? `<div class="alert alert-wait">
        <b><i data-icon="phone"></i> โทรตาม ${calls.length} การจอง</b> (ยืนยันแล้ว เลยเวลาเริ่มเกิน 10 นาทียังไม่มา)
        ${calls.map((b) => `<div class="small">${fmt.esc(b.room_name)} ${b.start_time} · ${fmt.esc(b.customer_name)}
          · <a href="tel:${fmt.esc(b.customer_phone)}">${fmt.esc(b.customer_phone)}</a></div>`).join('')}
      </div>` : '';
  }

  const statusBadge = (b) => b.status === 'released' ? badge('released', 'ปล่อยห้องแล้ว') : badge(b.status);

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
    const deposit = bk.deposit_refunded_at
      ? `${fmt.baht(bk.deposit_amount)} ${badge('cancelled', 'คืนแล้ว')}`
      : bk.deposit_received_at
        ? `${fmt.baht(bk.deposit_amount)} ${badge('paid', 'รับแล้ว')}`
        : `${fmt.baht(bk.deposit_amount)} ${badge('pending_deposit', 'ยังไม่รับ')}`;
    const btn = (key, label, cls = 'btn-secondary') => `<button class="btn ${cls} btn-block" data-act="${key}">${label}</button>`;
    const moved = bk.rescheduled_from;
    const kept = ['no_show', 'cancelled', 'released'].includes(bk.status) && bk.deposit_received_at && !bk.deposit_refunded_at;
    const bills = [bk.bill, bk.evening_bill].filter(Boolean);

    panel.innerHTML = `
      <div class="row-between"><h3 style="margin:0">${fmt.esc(bk.room_name)}</h3>${statusBadge(bk)}</div>
      <p class="small muted">${fmt.date(bk.booking_date)} · ${fmt.esc(bk.package_name || (bk.is_fullday ? 'เหมาวัน' : bk.hours + ' ชม.'))}<br>
        ใช้ห้อง ${bk.time_label} น. (รวมเวลาจัดห้อง ${SETUP} นาที)</p>
      ${bk.can_call_follow ? `<div class="alert alert-wait small"><b>โทรตาม</b> เลยเวลาเริ่มแล้วยังไม่มา ·
        <a href="tel:${fmt.esc(bk.customer_phone)}">${fmt.esc(bk.customer_phone)}</a></div>` : ''}
      <div class="stack">
        <div>
          ${line('ลูกค้า', fmt.esc(bk.customer_name))}
          ${line('เบอร์โทร', `<a href="tel:${fmt.esc(bk.customer_phone)}">${fmt.esc(bk.customer_phone)}</a>`)}
          ${line('จำนวนคน', `${bk.guests} คน`)}
          ${line('จองโดย', fmt.esc(bk.created_by_name))}
        </div>
        <div>
          <div class="bold" style="margin-bottom:8px">อาหารสั่งล่วงหน้า</div>
          ${reviewList(bk.items.map((it) => ({ name: it.name, unit: it.unit, qty: it.qty, price: it.unit_price })))}
        </div>
        <div>
          ${line('ค่าห้อง', fmt.baht(bk.room_fee))}
          ${line('ค่าอาหารสั่งล่วงหน้า', fmt.baht(bk.preorder_total))}
          ${line('<b>รวม</b>', `<span class="price">${fmt.baht(bk.room_fee + bk.preorder_total)}</span>`)}
          ${line('มัดจำ', deposit)}
          ${bk.deposit_received_at ? line('รับเมื่อ', `${fmt.datetime(bk.deposit_received_at)} · ${fmt.esc(bk.deposit_received_by_name || '')}`) : ''}
          ${bk.deposit_refunded_at ? line('คืนเมื่อ', `${fmt.datetime(bk.deposit_refunded_at)} · ${fmt.esc(bk.deposit_refunded_by_name || '')}`) : ''}
          ${bills.map((b) => line(b.label, `${fmt.esc(b.bill_no)} ${badge(b.status)}`)).join('')}
        </div>
        ${moved ? `<div class="alert alert-wait small">${moved.by === 'shop' ? 'ร้านเลื่อนให้' : 'ลูกค้าเลื่อน'}จาก ${fmt.date(moved.booking_date)} ${fmt.esc(moved.start_time)} น.
          ${moved.reason ? ` · ${fmt.esc(moved.reason)}` : ''}${bk.reschedule_count ? ' · ใช้สิทธิ์เลื่อนแล้ว' : ''}</div>` : ''}
        ${bk.cancel_reason ? `<div class="small muted">เหตุผลยกเลิก: ${fmt.esc(bk.cancel_reason)}</div>` : ''}
        ${bk.released_at ? `<div class="small muted">ปล่อยห้องเมื่อ ${fmt.datetime(bk.released_at)}</div>` : ''}
        ${kept ? `<div class="alert alert-wait small">มัดจำ ${fmt.baht(bk.deposit_amount)} ไม่คืน (BR-16)</div>` : ''}
        <div class="stack">
          ${bk.can_confirm_deposit ? btn('confirm', `<i data-icon="cash"></i> รับมัดจำ ${fmt.baht(bk.deposit_amount)}`, '') : ''}
          ${bk.can_arrive ? btn('arrive', `<i data-icon="check"></i> ${bk.is_evening_arrive ? 'ลูกค้ามาถึง · เปิดห้องรอบเย็น' : 'ลูกค้ามาถึง · เปิดห้อง'}`, '') : ''}
          ${typeof window.showBillQr === 'function'
            ? bills.filter((b) => b.status === 'open').map((b) => `<button class="btn btn-secondary btn-block" data-qr="${b.id}"><i data-icon="qr"></i> QR สั่งอาหาร (${fmt.esc(b.label)})</button>`).join('')
            : ''}
          ${bk.can_edit_preorder ? btn('edit', '<i data-icon="edit"></i> แก้อาหารสั่งล่วงหน้า') : ''}
          ${bk.can_reschedule ? btn('reschedule', '<i data-icon="calendar"></i> เลื่อนวัน/เวลา (สิทธิ์ลูกค้า 1 ครั้ง)') : ''}
          ${bk.can_release ? btn('release', 'ปล่อยห้อง (ลูกค้ายืนยันไม่มา)', 'btn-ghost') : ''}
          ${bk.can_no_show ? btn('no_show', '<i data-icon="ban"></i> ลูกค้าไม่มา', 'btn-danger') : ''}
          ${bk.can_cancel ? btn('cancel', 'ลูกค้ายกเลิกการจอง', 'btn-ghost') : ''}
          ${bk.can_shop_reschedule ? btn('shop_reschedule', '<i data-icon="alert"></i> ร้านเลื่อนให้ (เหตุสุดวิสัย)') : ''}
          ${bk.can_cancel_refund ? btn('refund', 'ร้านยกเลิก + คืนมัดจำ (เหตุสุดวิสัย)', 'btn-danger') : ''}
        </div>
      </div>`;

    const on = (key, fn) => { const b = panel.querySelector(`[data-act="${key}"]`); if (b) b.onclick = fn; };
    on('confirm', async () => {
      if (await confirmModal(`รับมัดจำ ${fmt.baht(bk.deposit_amount)} จาก ${fmt.esc(bk.customer_name)}?`, 'รับมัดจำแล้ว')) {
        await post({ action: 'confirm_deposit', id: bk.id }, bk.id);
      }
    });
    on('arrive', async () => {
      const what = bk.is_evening_arrive ? 'รอบเย็น (บิลใหม่)'
        : bk.items.length ? `และส่งอาหารสั่งล่วงหน้า ${bk.items.length} รายการเข้าครัว` : '(ไม่มีอาหารสั่งล่วงหน้า เปิดบิลเปล่า)';
      if (!(await confirmModal(`เปิด${fmt.esc(bk.room_name)} ให้ ${fmt.esc(bk.customer_name)} ${what}?`, 'เปิดห้อง'))) return;
      const bill = await post({ action: 'arrive', id: bk.id }, bk.id);
      if (bill && typeof window.showBillQr === 'function') window.showBillQr(bill);
    });
    panel.querySelectorAll('[data-qr]').forEach((b) => {
      b.onclick = () => window.showBillQr(bills.find((x) => x.id === Number(b.dataset.qr)));
    });
    on('edit', () => openPreorder(bk));
    on('reschedule', () => openReschedule(bk, false));
    on('shop_reschedule', () => openReschedule(bk, true));
    const keptNote = bk.deposit_received_at ? `<br><span class="small">มัดจำ ${fmt.baht(bk.deposit_amount)} ไม่คืน (BR-16)</span>` : '';
    on('release', async () => {
      if (await confirmModal(`ลูกค้า ${fmt.esc(bk.customer_name)} ยืนยันไม่มา ปล่อย${fmt.esc(bk.room_name)}คืน? เวลาที่เหลือจะกลับเป็นว่าง${keptNote}`, 'ปล่อยห้อง', true)) {
        await post({ action: 'release', id: bk.id }, bk.id);
      }
    });
    on('no_show', async () => {
      if (await confirmModal(`บันทึกว่า ${fmt.esc(bk.customer_name)} ไม่มา?${keptNote}`, 'ลูกค้าไม่มา', true)) {
        await post({ action: 'no_show', id: bk.id }, bk.id);
      }
    });
    on('cancel', () => openCancel(bk, false));
    on('refund', () => openCancel(bk, true));
  }

  /** ส่ง POST แล้วโหลดตาราง + แผงใหม่ */
  async function post(body, id) {
    const data = await run(() => api.post('vip_bookings', body));
    if (data !== null) { await loadDay(); if (id) await select(id); }
    return data;
  }

  /* ---------- ยกเลิก (ลูกค้ายกเลิก = มัดจำไม่คืน · ร้านยกเลิก = คืนมัดจำ ต้องมีเหตุผล) ---------- */
  function openCancel(bk, refund) {
    const depositText = !bk.deposit_received_at ? 'ยังไม่ได้รับมัดจำ'
      : refund ? `คืนมัดจำ ${fmt.baht(bk.deposit_amount)} ให้ลูกค้า` : `มัดจำ ${fmt.baht(bk.deposit_amount)} ไม่คืน (BR-16)`;
    const m = openModal({
      title: refund ? 'ร้านยกเลิกการจอง (เหตุสุดวิสัย)' : 'ลูกค้ายกเลิกการจอง',
      body: `<p>${fmt.esc(bk.room_name)} · ${fmt.date(bk.booking_date)} ${bk.time_label} น. · ${fmt.esc(bk.customer_name)}</p>
        <div class="alert ${refund ? 'alert-ok' : 'alert-wait'} small">${depositText}</div>
        <div class="field"><label>เหตุผล${refund ? ' (จำเป็น · ส่ง SMS ถึงลูกค้า)' : ' (ไม่บังคับ)'}</label>
          <textarea class="textarea" data-reason rows="2" maxlength="255" placeholder="${refund ? 'เช่น ไฟดับทั้งอาคาร' : ''}"></textarea></div>`,
      footer: `<button class="btn btn-secondary" data-close>ปิด</button><button class="btn btn-danger" data-ok>ยืนยันยกเลิก</button>`,
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const reason = m.el.querySelector('[data-reason]').value.trim();
      if (refund && !reason) { toast('กรุณาใส่เหตุผล', 'error'); return; }
      const body = { action: 'cancel', id: bk.id, cancel_reason: reason };
      if (refund) body.refund = 1;
      const done = await post(body, bk.id);
      if (done !== null) m.close();
    };
  }

  /* ---------- ตัวเลือกอาหารสั่งล่วงหน้า (ใช้ทั้งจองใหม่และแก้) ---------- */
  function preorderEditor(el, cart, { roomFee = 0, depositFixed = null } = {}) {
    el.innerHTML = `
      <p class="small muted">สั่งอาหารล่วงหน้าเป็นสิทธิ์ห้อง VIP <b>ไม่บังคับ ไม่มียอดขั้นต่ำ</b> · สั่งแล้วมัดจำเพิ่ม ${pct()}% ของค่าอาหาร</p>
      <div class="field"><input class="input" data-q placeholder="ค้นหาเมนู เช่น ฮะเก๋า, กุ้ง, ซาลาเปา"></div>
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
      const sum = total();
      const list = [...cart.values()];
      el.querySelector('[data-cart]').innerHTML = `
        ${list.length ? list.map((it) => `<div class="row-between small">
            <span>${fmt.esc(it.name)} × ${it.qty} ${fmt.esc(it.unit)}</span><span>${fmt.baht(it.qty * it.price)}</span></div>`).join('')
          : '<p class="small muted">ยังไม่ได้เลือกเมนู (ไม่สั่งก็ได้)</p>'}
        <div class="row-between" style="margin-top:8px"><span class="bold">ค่าอาหาร</span><span class="price">${fmt.baht(sum)}</span></div>
        <div class="small muted" style="margin-top:8px">${depositFixed !== null
          ? `รับมัดจำไปแล้ว ${fmt.baht(depositFixed)} (ยอดมัดจำไม่เปลี่ยน ส่วนต่างจ่ายตอนชำระเงิน)`
          : `มัดจำ ${pct()}% ของ (ค่าห้อง ${fmt.baht(roomFee)} + ค่าอาหาร) = ${fmt.baht(Math.round((roomFee + sum) * pct()) / 100)}`}</div>`;
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
      list: () => [...cart.values()],
      items: () => [...cart.values()].map((it) => ({ menu_item_id: it.menu_item_id, qty: it.qty })),
    };
  }

  /* ---------- แก้อาหารสั่งล่วงหน้า (ทวนรายการก่อนบันทึก) ---------- */
  function openPreorder(bk) {
    const cart = new Map(bk.items.map((it) =>
      [it.menu_item_id, { menu_item_id: it.menu_item_id, name: it.name, unit: it.unit, price: it.unit_price, qty: it.qty }]));
    const m = openModal({
      title: `แก้อาหารสั่งล่วงหน้า · ${fmt.esc(bk.room_name)} ${fmt.date(bk.booking_date)}`,
      size: 'lg',
      body: '<div data-ed></div>',
      footer: '<button class="btn btn-secondary" data-close>ยกเลิก</button><button class="btn" data-save>ทวนรายการ</button>',
    });
    const fixed = bk.deposit_received_at ? bk.deposit_amount : null;
    const ed = preorderEditor(m.el.querySelector('[data-ed]'), cart, { roomFee: bk.room_fee, depositFixed: fixed });
    m.el.querySelector('[data-save]').onclick = async () => {
      const list = ed.list();
      const food = ed.total();
      const deposit = fixed !== null ? fixed : Math.round((bk.room_fee + food) * pct()) / 100;
      const okSave = await confirmModal(`${reviewList(list)}
        <div class="row-between"><span>ค่าอาหาร</span><b>${fmt.baht(food)}</b></div>
        <div class="row-between"><span>ค่าห้อง</span><b>${fmt.baht(bk.room_fee)}</b></div>
        <div class="row-between"><span>มัดจำ${fixed !== null ? ' (รับแล้ว ไม่เปลี่ยน)' : ''}</span><b>${fmt.baht(deposit)}</b></div>`, 'บันทึก');
      if (!okSave) return;
      const done = await post({ action: 'update_preorder', id: bk.id, items: ed.items() }, bk.id);
      if (done !== null) m.close();
    };
  }

  /* ---------- ส่วนเลือก วัน + ห้อง + แพ็กเกจ + เวลาเริ่ม (ใช้ทั้งจองใหม่และเลื่อน) ---------- */
  function slotPicker(el, f, { selfId = 0, minDate = ymd(new Date()), maxDate = '', onChange = () => {} } = {}) {
    let dayAvail = avail && avail.date === f.date ? avail : null;
    const room = () => dayAvail && dayAvail.rooms.find((r) => r.id === Number(f.room_id));
    const pkg = () => dayAvail && dayAvail.packages.find((p) => p.id === Number(f.package_id));

    function check() {
      const r = room();
      const p = pkg();
      if (!r || !p) return { ok: false, msg: 'เลือกห้องและแพ็กเกจ' };
      const starts = validStarts(r, p, selfId);
      if (p.hours === null) {
        if (!starts.length) return { ok: false, msg: `${r.name} ไม่ว่างทั้งวัน จองเหมาวันไม่ได้` };
        f.start = starts[0];
      } else if (!f.start) {
        return { ok: false, msg: starts.length ? 'เลือกเวลาเริ่ม' : `${r.name} ไม่มีช่วงว่างพอสำหรับ ${p.name}` };
      } else if (!starts.includes(f.start)) {
        return { ok: false, msg: `${r.name} เริ่ม ${f.start} ไม่ได้ (ไม่ว่าง เลยเวลา หรือเกินเวลาปิดรอบ)` };
      }
      return { ok: true, msg: `${r.name} ว่าง · ใช้ห้อง ${usageLabel(p, f.start)} น. (รวมเวลาจัดห้อง ${SETUP} นาที)` };
    }

    async function render() {
      if (!dayAvail || dayAvail.date !== f.date) {
        el.innerHTML = '<div class="loading">กำลังโหลดห้องว่าง...</div>';
        dayAvail = await run(() => api.get('vip_bookings', { action: 'availability', date: f.date }));
        if (!dayAvail) return;
      }
      const r = room();
      const p = pkg();
      const starts = validStarts(r, p, selfId);
      if (p && p.hours !== null && f.start && !starts.includes(f.start)) f.start = '';
      el.innerHTML = `
        <div class="grid grid-2">
          <div class="field"><label>วันที่</label><input class="input" data-date type="date" min="${minDate}" ${maxDate ? `max="${maxDate}"` : ''} value="${f.date}"></div>
          <div class="field"><label>ห้อง</label><select class="select" data-room>
            <option value="">— เลือกห้อง —</option>
            ${dayAvail.rooms.map((x) => `<option value="${x.id}" ${x.id === Number(f.room_id) ? 'selected' : ''}>${fmt.esc(x.name)} (${x.seats} ที่)</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>แพ็กเกจ</label><div class="row" style="flex-wrap:wrap">
          ${dayAvail.packages.map((x) => `<button type="button" class="chip ${x.id === Number(f.package_id) ? 'active' : ''}" data-pkg="${x.id}">${fmt.esc(pkgText(x))}</button>`).join('')}
        </div></div>
        ${p && p.hours !== null ? `<div class="field"><label>เวลาเริ่ม (ต้นชั่วโมง · แสดงเฉพาะเวลาที่ห้องว่าง)</label><div class="row" style="flex-wrap:wrap">
          ${starts.length ? starts.map((h) => `<button type="button" class="chip ${h === f.start ? 'active' : ''}" data-start="${h}">${usageLabel(p, h)}</button>`).join('')
            : '<span class="small muted">ไม่มีช่วงว่าง</span>'}
        </div></div>` : ''}
        <div data-slot></div>`;
      el.querySelector('[data-date]').onchange = (e) => {
        if (!e.target.value) return;
        f.date = e.target.value;
        f.start = '';
        render();
      };
      el.querySelector('[data-room]').onchange = (e) => { f.room_id = e.target.value; render(); };
      el.querySelectorAll('[data-pkg]').forEach((b) => { b.onclick = () => { f.package_id = Number(b.dataset.pkg); render(); }; });
      el.querySelectorAll('[data-start]').forEach((b) => { b.onclick = () => { f.start = b.dataset.start; render(); }; });
      const c = check();
      el.querySelector('[data-slot]').innerHTML = `<div class="alert ${c.ok ? 'alert-ok' : 'alert-wait'}">${fmt.esc(c.msg)}</div>`;
      onChange();
    }
    render();
    return { check, room, pkg };
  }

  /* ---------- จองใหม่: modal 4 ขั้น ---------- */
  function openBooking(preset = {}) {
    const f = {
      room_id: preset.room_id || '', date: day, start: preset.hour || '', package_id: '',
      name: '', phone: '', guests: '', cart: new Map(),
    };
    let step = 1;
    let picker = null;
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
    const maxGuests = () => Math.min((picker && picker.room() && picker.room().seats) || 15, 15);

    const tabs = () => `<div class="tabs" style="margin-bottom:16px">${['1. เวลา + แพ็กเกจ', '2. ลูกค้า', '3. สั่งล่วงหน้า', '4. ทวนรายการ']
      .map((t, i) => `<span class="tab ${i + 1 === step ? 'active' : ''}">${t}</span>`).join('')}</div>`;

    function render() {
      backBtn.textContent = step === 1 ? 'ยกเลิก' : 'ย้อนกลับ';
      nextBtn.textContent = step === 4 ? 'ยืนยันการจอง' : 'ถัดไป';
      if (step === 1) {
        body.innerHTML = tabs() + '<div data-pick></div>';
        picker = slotPicker(body.querySelector('[data-pick]'), f);
      } else if (step === 2) {
        body.innerHTML = tabs() + `
          <div class="field"><label>ชื่อลูกค้า</label><input class="input" id="wName" maxlength="100" value="${fmt.esc(f.name)}"></div>
          <div class="grid grid-2">
            <div class="field"><label>เบอร์โทร (ใช้ส่ง SMS ยืนยัน)</label><input class="input" id="wPhone" type="tel" maxlength="12" placeholder="08xxxxxxxx" value="${fmt.esc(f.phone)}"></div>
            <div class="field"><label>จำนวนคน (ไม่เกิน ${maxGuests()})</label><input class="input" id="wGuests" type="number" min="1" max="${maxGuests()}" value="${f.guests}"></div>
          </div>`;
      } else if (step === 3) {
        body.innerHTML = tabs() + `<p class="small muted">${fmt.esc(picker.room().name)} · ${fmt.date(f.date)} · ${fmt.esc(picker.pkg().name)}
          ${usageLabel(picker.pkg(), f.start)} น. · ${fmt.esc(f.name)} ${f.guests} คน</p><div data-ed></div>`;
        editor = preorderEditor(body.querySelector('[data-ed]'), f.cart, { roomFee: picker.pkg().price });
      } else {
        const p = picker.pkg();
        const food = [...f.cart.values()].reduce((a, it) => a + it.qty * it.price, 0);
        const deposit = Math.round((p.price + food) * pct()) / 100;
        body.innerHTML = tabs() + `
          <div class="grid grid-2">
            <div class="stack">
              <div><div class="bold">${fmt.esc(picker.room().name)} · ${fmt.esc(p.name)}</div>
                <div class="small">${fmt.date(f.date)} · ใช้ห้อง ${usageLabel(p, f.start)} น.</div>
                <div class="caption muted">รวมเวลาจัดห้อง ${SETUP} นาที · รอบถัดไปเริ่มตรงชั่วโมง</div></div>
              <div class="small">${fmt.esc(f.name)} · ${fmt.esc(f.phone)} · ${f.guests} คน</div>
            </div>
            <div>
              <div class="bold" style="margin-bottom:8px">อาหารสั่งล่วงหน้า</div>
              ${reviewList([...f.cart.values()])}
              <div class="row-between" style="margin-top:8px"><span>ค่าห้อง (${fmt.esc(p.name)})</span><span>${fmt.baht(p.price)}</span></div>
              <div class="row-between"><span>ค่าอาหาร</span><span>${fmt.baht(food)}</span></div>
              <div class="row-between"><span class="bold">รวม</span><span class="price">${fmt.baht(p.price + food)}</span></div>
              <div class="alert alert-wait small" style="margin-top:8px">มัดจำ ${pct()}% = <b>${fmt.baht(deposit)}</b>
                · ไม่มา / ปล่อยห้อง / ลูกค้ายกเลิก มัดจำไม่คืน</div>
            </div>
          </div>`;
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
        const c = picker.check();
        if (!c.ok) { toast(c.msg, 'error'); return; }
      } else if (step === 2) {
        saveStep2();
        const g = Number(f.guests);
        if (!f.name) { toast('กรุณากรอกชื่อลูกค้า', 'error'); return; }
        if (!/^0\d{8,9}$/.test(f.phone.replace(/[\s-]/g, ''))) { toast('เบอร์โทรไม่ถูกต้อง', 'error'); return; }
        if (!Number.isInteger(g) || g < 1 || g > maxGuests()) { toast(`จำนวนคนต้องอยู่ระหว่าง 1 ถึง ${maxGuests()} คน`, 'error'); return; }
      } else if (step === 4) {
        nextBtn.disabled = true;
        const p = picker.pkg();
        const res = await run(() => api.post('vip_bookings', {
          action: 'create', vip_room_id: Number(f.room_id), package_id: p.id, booking_date: f.date,
          start_time: p.hours === null ? undefined : f.start,
          customer_name: f.name, customer_phone: f.phone, guests: Number(f.guests),
          items: [...f.cart.values()].map((it) => ({ menu_item_id: it.menu_item_id, qty: it.qty })),
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

  /* ---------- เลื่อน: ลูกค้า (1 ครั้ง · ≤ 14 วัน · แจ้งก่อน 1 วัน) / ร้าน (เหตุสุดวิสัย ไม่นับสิทธิ์) ---------- */
  function openReschedule(bk, byShop) {
    const f = { room_id: bk.vip_room_id, date: bk.booking_date, start: bk.start_time, package_id: bk.package_id || '' };
    const maxDate = byShop ? '' : addDays(bk.booking_date, 14);
    const m = openModal({
      title: byShop ? 'ร้านเลื่อนการจองให้ (เหตุสุดวิสัย)' : 'เลื่อนการจอง (สิทธิ์ลูกค้า 1 ครั้ง)',
      size: 'lg',
      body: `<p class="small muted">เดิม: ${fmt.esc(bk.room_name)} · ${fmt.date(bk.booking_date)} ${bk.time_label} น.
          · ${fmt.esc(bk.package_name || '')} · ค่าห้อง ${fmt.baht(bk.room_fee)}</p>
        ${byShop ? '<div class="field"><label>เหตุผล (จำเป็น · ส่ง SMS ถึงลูกค้า)</label><textarea class="textarea" data-reason rows="2" maxlength="255" placeholder="เช่น แอร์ห้องเสีย"></textarea></div>'
          : `<div class="alert alert-wait small">เลื่อนได้ 1 ครั้ง ไม่เกิน ${fmt.date(maxDate)} · ถ้าเลื่อนไม่ได้เพราะเต็ม ลูกค้ายกเลิกได้ (มัดจำไม่คืน)</div>`}
        <div data-pick></div>
        <div class="small muted" data-diff></div>`,
      footer: '<button class="btn btn-secondary" data-close>ปิด</button><button class="btn" data-ok>ยืนยันเลื่อน</button>',
    });
    const diff = m.el.querySelector('[data-diff]');
    const picker = slotPicker(m.el.querySelector('[data-pick]'), f, {
      selfId: bk.id, maxDate,
      onChange: () => {
        const p = picker && picker.pkg();
        if (!p || p.price === bk.room_fee) { diff.textContent = ''; return; }
        diff.textContent = bk.deposit_received_at
          ? `ค่าห้องใหม่ ${fmt.baht(p.price)} · มัดจำที่รับแล้ว ${fmt.baht(bk.deposit_amount)} ย้ายตาม ส่วนต่างจ่ายตอนชำระเงิน`
          : `ค่าห้องใหม่ ${fmt.baht(p.price)} · มัดจำคิดใหม่ ${fmt.baht(Math.round((p.price + bk.preorder_total) * pct()) / 100)}`;
      },
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const c = picker.check();
      if (!c.ok) { toast(c.msg, 'error'); return; }
      const p = picker.pkg();
      const body = {
        action: byShop ? 'shop_reschedule' : 'reschedule', id: bk.id, booking_date: f.date,
        start_time: p.hours === null ? undefined : f.start, package_id: p.id, vip_room_id: Number(f.room_id),
      };
      if (byShop) {
        body.reason = m.el.querySelector('[data-reason]').value.trim();
        if (!body.reason) { toast('กรุณาใส่เหตุผล', 'error'); return; }
      }
      const done = await run(() => api.post('vip_bookings', body));
      if (done === null) return;
      m.close();
      setDay(f.date);
      select(bk.id);
    };
  }

  /* ---------- เหตุสุดวิสัยฝั่งร้าน (manager+): การจองที่โดน เรียงตามใครจองก่อน ---------- */
  function openForceMajeure() {
    const m = openModal({
      title: 'เหตุสุดวิสัยฝั่งร้าน · การจองที่ได้รับผลกระทบ',
      size: 'lg',
      body: `<div class="grid grid-2">
          <div class="field"><label>วันที่</label><input class="input" data-date type="date" value="${day}"></div>
          <div class="field"><label>ห้อง</label><select class="select" data-room><option value="">ทุกห้อง</option>
            ${(avail ? avail.rooms : []).map((r) => `<option value="${r.id}">${fmt.esc(r.name)}</option>`).join('')}</select></div>
        </div>
        <p class="small muted">ใครจองก่อนได้เลือกก่อน: ติดต่อลูกค้าตามลำดับ แล้วกด "เลื่อน" (ไม่นับสิทธิ์ลูกค้า) หรือ "ยกเลิก + คืนมัดจำ"</p>
        <div data-list><div class="loading">กำลังโหลด...</div></div>`,
      footer: '<button class="btn btn-secondary" data-close>ปิด</button>',
    });
    const list = m.el.querySelector('[data-list]');
    async function load() {
      const rows = await run(() => api.get('vip_bookings', {
        action: 'affected', date: m.el.querySelector('[data-date]').value, vip_room_id: m.el.querySelector('[data-room]').value,
      }));
      if (!rows) { list.innerHTML = ''; return; }
      list.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>ลำดับ</th><th>เวลา</th><th>ห้อง</th><th>ลูกค้า</th><th class="num">มัดจำ</th><th></th></tr></thead>
        <tbody>${rows.map((b) => `<tr>
          <td>${b.queue_order}</td><td>${b.time_label}</td><td>${fmt.esc(b.room_name)}</td>
          <td>${fmt.esc(b.customer_name)}<div class="caption muted"><a href="tel:${fmt.esc(b.customer_phone)}">${fmt.esc(b.customer_phone)}</a> · จองเมื่อ ${fmt.datetime(b.created_at)}</div></td>
          <td class="num">${fmt.baht(b.deposit_amount)}<div>${b.deposit_received_at ? badge('paid', 'รับแล้ว') : badge('pending_deposit', 'ยังไม่รับ')}</div></td>
          <td><div class="row"><button class="btn btn-secondary btn-sm" data-move="${b.id}">เลื่อน</button>
            <button class="btn btn-danger btn-sm" data-refund="${b.id}">ยกเลิก + คืนมัดจำ</button></div></td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">ไม่มีการจองที่ได้รับผลกระทบ</div>';
      const find = (id) => rows.find((x) => x.id === Number(id));
      const detail = async (id) => api.get('vip_bookings', { id });
      list.querySelectorAll('[data-move]').forEach((b) => {
        b.onclick = async () => { const bk = await run(() => detail(b.dataset.move)); if (bk) { m.close(); openReschedule(bk, true); } };
      });
      list.querySelectorAll('[data-refund]').forEach((b) => {
        b.onclick = async () => { const bk = await run(() => detail(find(b.dataset.refund).id)); if (bk) { m.close(); openCancel(bk, true); } };
      });
    }
    m.el.querySelector('[data-date]').onchange = load;
    m.el.querySelector('[data-room]').onchange = load;
    load();
  }

  $('dayInput').value = day;
  $('dayInput').onchange = () => { if ($('dayInput').value) setDay($('dayInput').value); };
  $('prevDay').onclick = () => setDay(addDays(day, -1));
  $('nextDay').onclick = () => setDay(addDays(day, 1));
  $('todayBtn').onclick = () => setDay(ymd(new Date()));
  $('newBtn').onclick = () => openBooking();
  $('forceBtn').onclick = () => openForceMajeure();
  poll(loadDay, 10);
})();
