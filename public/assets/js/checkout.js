/* =========================================================
   checkout.js — หน้าชำระเงิน (คนที่ 5 · เฟส 2–3)
   ซ้าย: เลือกบิล (หลายบิลได้) + สมาชิก แต้ม คูปอง + รายการ
   ขวา: สรุปยอด (BR-10) + วิธีชำระ → ใบเสร็จ
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'ชำระเงิน', roles: ['staff', 'manager', 'owner'], perm: 'payment' });
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const METHOD_TABS = [['cash', '<i data-icon="cash"></i> เงินสด'], ['promptpay', '<i data-icon="phone"></i> พร้อมเพย์'], ['card', '<i data-icon="card"></i> บัตร']];
  const state = {
    bills: [],                 // บิลที่เปิดอยู่ทั้งหมด
    selected: new Set(),       // id ของบิลที่เลือก
    sum: null,                 // ผล preview
    method: 'cash',
    cash: '',
    member: null,              // { id, name, phone, points_balance } จาก /api/members lookup
    rewardIds: [],             // รางวัลที่จะแลก
    coupon: '',                // โค้ดคูปองที่ใช้ (1 บิล 1 ใบ)
  };
  const first = Number(qs('bill_id'));
  if (first) state.selected.add(first);

  /* ---------- เลือกบิล ---------- */
  async function loadBills() {
    let rows;
    try { rows = await api.get('bills', { status: 'open' }); } catch (e) { toast(e.message, 'error'); return; }
    state.bills = rows;
    const openIds = new Set(rows.map((b) => b.id));
    [...state.selected].forEach((id) => { if (!openIds.has(id)) state.selected.delete(id); });
    if (first && !openIds.has(first) && !state.warned) {
      state.warned = true;
      toast('บิลนี้ปิดไปแล้วหรือไม่มีอยู่', 'warn');
    }
    renderChips();
    refresh();
  }

  function renderChips() {
    $('billChips').innerHTML = state.bills.length
      ? state.bills.map((b) => `
          <button class="chip ${state.selected.has(b.id) ? 'active' : ''}" data-bill="${b.id}">
            ${b.vip_room_id ? '<i data-icon="crown"></i>' : '<i data-icon="utensils"></i>'} ${fmt.esc(b.place)} · ${fmt.baht(b.total)}
          </button>`).join('')
      : '<span class="muted">ไม่มีบิลที่เปิดอยู่</span>';
    $('billChips').querySelectorAll('[data-bill]').forEach((el) => {
      el.onclick = () => {
        const id = Number(el.dataset.bill);
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        renderChips();
        refresh();
      };
    });
  }

  /* ---------- ยอด ---------- */
  async function refresh() {
    if (!state.selected.size) {
      state.sum = null;
      $('items').innerHTML = '';
      $('memberCard').classList.add('hidden');
      $('summary').innerHTML = '<div class="empty"><div class="empty-icon"><i data-icon="card"></i></div>เลือกบิลทางซ้ายเพื่อชำระเงิน</div>';
      return;
    }
    try {
      state.sum = await api.post('checkout', {
        action: 'preview',
        bill_ids: [...state.selected],
        member_id: state.member ? state.member.id : null,
        reward_ids: state.rewardIds,
        coupon_code: state.coupon,
      });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }
    // รางวัลที่ใช้ไม่ได้แล้ว (เช่น เอาบิลที่มีเมนูของฟรีออก) ไม่ต้องติ๊กค้างไว้
    state.rewardIds = state.sum.used_rewards.map((r) => r.id);
    renderMember();
    renderItems();
    renderSummary();
  }

  /* ---------- สมาชิก แต้ม คูปอง ---------- */
  function renderMember() {
    const s = state.sum;
    const card = $('memberCard');
    card.classList.remove('hidden');
    const m = s.member;

    const memberPart = m ? `
      <div class="row-between">
        <div class="row" style="gap:12px">
          <span class="avatar">${fmt.esc(m.name.charAt(0))}</span>
          <div><div class="bold">${fmt.esc(m.name)}</div>
            <div class="caption muted">${fmt.esc(m.phone)} · มี <span class="points">${fmt.num(m.points_balance)} แต้ม</span></div></div>
        </div>
        <button class="btn btn-ghost btn-sm" id="memberClear">เปลี่ยน / ไม่ใช้สมาชิก</button>
      </div>` : `
      <div class="row" style="gap:8px;flex-wrap:nowrap">
        <input class="input" id="memberCode" placeholder="เบอร์โทร หรือรหัสสมาชิก TS-000005">
        <button class="btn btn-secondary" id="memberFind">ค้นหา</button>
      </div>
      <div class="caption muted" style="margin-top:6px">ไม่กรอกเบอร์ = ไม่ได้แต้ม (สมาชิกได้ 1 แต้มทุก 100 บาท)</div>`;

    const rewardPart = m ? `
      <div>
        <div class="label" style="margin:12px 0 6px">แลกแต้ม</div>
        ${s.rewards.length ? s.rewards.map((r) => {
          const on = state.rewardIds.includes(r.id);
          const afford = on || (m.points_balance - s.points_redeemed) >= r.points_cost;
          const can = r.usable && afford;
          return `<label class="check" style="display:flex;margin-bottom:6px;${can || on ? '' : 'opacity:.5'}">
              <input type="checkbox" data-reward="${r.id}" ${on ? 'checked' : ''} ${can || on ? '' : 'disabled'}>
              <span>${fmt.esc(r.name)} <span class="points">${fmt.num(r.points_cost)} แต้ม</span>
              ${!r.usable ? '<span class="caption muted">(ต้องมีเมนูนี้ในบิล)</span>' : !afford ? '<span class="caption muted">(แต้มไม่พอ)</span>' : ''}</span>
            </label>`;
        }).join('') : '<div class="small muted">ยังไม่มีรางวัล</div>'}
        ${s.reward_errors.map((e) => `<div class="field-error">${fmt.esc(e)}</div>`).join('')}
      </div>` : '';

    const chip = (c, from) => `
      <button class="chip ${s.coupon && s.coupon.code === c.code ? 'active' : ''}" data-coupon="${fmt.esc(c.code)}"
              ${c.usable ? '' : 'disabled'} title="${fmt.esc(c.reason || '')}" style="${c.usable ? '' : 'opacity:.5'}">
        ${from === 'wallet' ? '<i data-icon="ticket"></i>' : '<i data-icon="sparkle"></i>'} ${fmt.esc(c.code)} · ${fmt.esc(c.label)}${c.usable && c.discount ? ` (−${fmt.baht(c.discount)})` : ''}
      </button>`;
    const couponPart = `
      <div>
        <div class="label" style="margin:12px 0 6px">คูปอง <span class="caption muted">(ใช้ได้ 1 ใบต่อบิล)</span></div>
        ${s.suggested_coupons.length ? `<div class="caption muted">แนะนำตอนนี้</div>
          <div class="row" style="gap:8px;margin-bottom:8px">${s.suggested_coupons.map((c) => chip(c, 'shop')).join('')}</div>` : ''}
        ${s.member_coupons.length ? `<div class="caption muted">คูปองในบัญชีสมาชิก</div>
          <div class="row" style="gap:8px;margin-bottom:8px">${s.member_coupons.map((c) => chip(c, 'wallet')).join('')}</div>` : ''}
        ${s.coupon ? `
          <div class="row-between alert alert-ok">
            <span>ใช้คูปอง ${fmt.esc(s.coupon.code)} · ${fmt.esc(s.coupon.label)}</span>
            <button class="btn btn-ghost btn-sm" id="couponClear">เอาออก</button>
          </div>` : `
          <div class="row" style="gap:8px;flex-wrap:nowrap">
            <input class="input" id="couponCode" placeholder="กรอกโค้ดคูปอง" value="${fmt.esc(state.coupon)}" style="text-transform:uppercase">
            <button class="btn btn-secondary" id="couponApply">ใช้คูปอง</button>
          </div>`}
        ${s.coupon_error ? `<div class="field-error" style="margin-top:6px">${fmt.esc(s.coupon_error)}</div>` : ''}
      </div>`;

    card.innerHTML = `<h3 class="card-title">สมาชิกและส่วนลด</h3>${memberPart}${rewardPart}${couponPart}`;

    const find = $('memberFind');
    if (find) {
      const input = $('memberCode');
      find.onclick = () => findMember(input.value);
      input.onkeydown = (e) => { if (e.key === 'Enter') findMember(input.value); };
    }
    const clear = $('memberClear');
    if (clear) clear.onclick = () => { state.member = null; state.rewardIds = []; refresh(); };

    card.querySelectorAll('[data-reward]').forEach((el) => {
      el.onchange = () => {
        const id = Number(el.dataset.reward);
        state.rewardIds = el.checked ? [...state.rewardIds, id] : state.rewardIds.filter((x) => x !== id);
        refresh();
      };
    });
    card.querySelectorAll('[data-coupon]').forEach((el) => {
      el.onclick = () => {
        state.coupon = s.coupon && s.coupon.code === el.dataset.coupon ? '' : el.dataset.coupon;
        refresh();
      };
    });
    const apply = $('couponApply');
    if (apply) {
      const input = $('couponCode');
      apply.onclick = () => { state.coupon = input.value.trim().toUpperCase(); refresh(); };
      input.onkeydown = (e) => { if (e.key === 'Enter') apply.onclick(); };
    }
    const cc = $('couponClear');
    if (cc) cc.onclick = () => { state.coupon = ''; refresh(); };
  }

  /** ค้นสมาชิกด้วยเบอร์โทร หรือรหัสบนบัตรสมาชิก TS-000005 */
  async function findMember(code) {
    code = String(code || '').trim();
    if (!code) { toast('กรอกเบอร์โทรหรือบาร์โค้ดสมาชิก', 'warn'); return; }
    try {
      const m = await api.post('checkout', { action: 'member', code });
      state.member = { id: m.id, name: m.name, phone: m.phone };
      state.rewardIds = [];
      toast(`สมาชิก: ${m.name}`);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function renderItems() {
    $('items').innerHTML = state.sum.bills.map((b) => `
      <div class="card" style="margin-top:16px">
        <div class="row-between" style="margin-bottom:12px">
          <div>
            <h3 style="margin:0">${b.vip_room_id ? 'ห้อง' : 'โต๊ะ'} ${fmt.esc(b.place)}</h3>
            <div class="caption muted">${fmt.esc(b.bill_no)} · ${fmt.esc(b.guests)} คน · เปิด ${fmt.time(b.opened_at)} น.</div>
          </div>
          <span class="price" style="font-size:20px">${fmt.baht(b.subtotal + (b.room_fee || 0))}</span>
        </div>
        ${b.deposit ? `<div class="alert alert-ok" style="margin-bottom:12px"><i data-icon="crown"></i> ห้องนี้จองไว้ มัดจำ ${fmt.baht(b.deposit)} หักจากยอดรวมตอนจ่าย</div>` : ''}
        ${b.is_evening_bill ? `<div class="alert alert-ok" style="margin-bottom:12px"><i data-icon="crown"></i> จองห้องทั้ง 2 รอบ · บิลรอบเย็น ค่าห้องจ่ายไปแล้วในบิลรอบเช้า</div>` : ''}
        ${b.pending_items ? `<div class="alert alert-wait" style="margin-bottom:12px"><i data-icon="clock"></i> ยังไม่เสิร์ฟ ${b.pending_items} รายการ</div>` : ''}
        ${b.lines.length || b.room_fee ? `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th class="num" style="width:40px">#</th><th>รายการ</th><th class="num">ราคา</th><th class="num">รวม</th></tr></thead>
              <tbody>${b.lines.map((l, i) => `
                <tr>
                  <td class="num muted">${i + 1}</td>
                  <td>${fmt.esc(l.name)} × ${fmt.num(l.qty)} ${fmt.esc(l.unit)}</td>
                  <td class="num">${fmt.baht(l.unit_price)}</td>
                  <td class="num">${fmt.baht(l.amount)}</td>
                </tr>`).join('')}
                ${b.room_fee ? `
                <tr>
                  <td class="num muted"><i data-icon="crown"></i></td>
                  <td class="bold">${fmt.esc(b.room_label)}</td>
                  <td class="num"></td>
                  <td class="num bold">${fmt.baht(b.room_fee)}</td>
                </tr>` : ''}
              </tbody>
            </table>
          </div>
          <div class="caption muted" style="margin-top:6px">รวม ${fmt.num(b.lines.length)} รายการอาหาร${b.room_fee ? ' + ค่าห้อง VIP' : ''}</div>`
          : '<div class="muted">ยังไม่มีรายการที่ต้องชำระ</div>'}
      </div>`).join('');
  }

  /* ---------- สรุปยอด (BR-10) ---------- */
  function renderSummary() {
    const s = state.sum;
    const row = (label, value, cls = '') => `<div class="row-between ${cls}"><span class="muted">${label}</span><span>${value}</span></div>`;
    const warn = !s.has_orders && !s.has_booking ? 'บิลนี้ยังไม่มีออเดอร์ ถ้าลูกค้าไม่สั่งอาหาร ให้ผู้จัดการยกเลิกโต๊ะที่ผังโต๊ะ'
      : s.pending_items > 0 ? 'ยังมีอาหารที่ยังไม่เสิร์ฟ ให้ครัวเสิร์ฟหรือยกเลิกรายการก่อน' : '';
    $('summary').innerHTML = `
      <h3>สรุปยอด</h3>
      ${row(s.bills.length > 1 ? `ค่าอาหาร (${s.bills.length} บิล)` : 'ค่าอาหาร', fmt.baht(s.subtotal))}
      ${s.used_rewards.map((r) => row(`<i data-icon="gift"></i> ${fmt.esc(r.name)} (${fmt.num(r.points_cost)} แต้ม)`, `<span class="text-red">−${fmt.baht(r.discount)}</span>`)).join('')}
      ${s.coupon ? row(`<i data-icon="ticket"></i> คูปอง ${fmt.esc(s.coupon.code)}`, `<span class="text-red">−${fmt.baht(s.discount_coupon)}</span>`) : ''}
      ${(s.room_lines || []).map((r) => row(`<i data-icon="crown"></i> ${fmt.esc(r.label)}`, fmt.baht(r.amount))).join('')}
      ${s.deposit_deducted ? row('<b>ยอดชำระ</b>', `<b>${fmt.baht(s.total)}</b>`) : ''}
      ${s.deposit_deducted ? row('<i data-icon="crown"></i> หักมัดจำห้อง VIP', `<span class="text-red">−${fmt.baht(s.deposit_deducted)}</span>`) : ''}
      <div class="row-between">
        <span class="h3">${s.deposit_deducted ? 'ต้องจ่ายเพิ่ม' : 'ยอดชำระ'}</span>
        <span class="h1 text-red">${fmt.baht(s.amount_due)}</span>
      </div>
      <div class="caption muted">ราคารวม VAT ${fmt.baht(s.vat)} แล้ว</div>
      ${s.member ? `<div class="alert alert-ok"><i data-icon="star"></i> ${fmt.esc(s.member.name)} จะได้รับ <b>${fmt.num(s.points_to_earn)} แต้ม</b>
        <div class="caption">แต้มหลังจ่าย ${fmt.num(s.member.points_after)} แต้ม</div></div>` : ''}
      <div class="tabs">${METHOD_TABS.map(([k, label]) =>
        `<button class="tab ${state.method === k ? 'active' : ''}" data-method="${k}">${label}</button>`).join('')}</div>
      <div id="methodBody"></div>
      ${warn ? `<div class="alert alert-wait">${warn}</div>` : ''}
      ${s.coupon_error || s.reward_errors.length ? '<div class="alert alert-bad">มีคูปองหรือรางวัลที่ใช้ไม่ได้ แก้ก่อนกดยืนยัน</div>' : ''}
      <button class="btn btn-lg btn-block" id="payBtn">ยืนยันรับเงิน ${fmt.baht(s.amount_due)}</button>
      <button class="btn btn-ghost btn-sm" id="reloadBtn">↻ โหลดยอดใหม่</button>`;
    $('summary').querySelectorAll('[data-method]').forEach((el) => {
      el.onclick = () => { state.method = el.dataset.method; renderSummary(); };
    });
    $('reloadBtn').onclick = loadBills;
    $('payBtn').onclick = pay;
    renderMethod();
  }

  /** เนื้อหาตามวิธีชำระ + เปิด/ปิดปุ่มยืนยัน */
  function renderMethod() {
    const s = state.sum;
    const due = s.amount_due;
    const box = $('methodBody');
    const payBtn = $('payBtn');
    const blocked = s.pending_items > 0 || (!s.has_orders && !s.has_booking) || !!s.coupon_error || s.reward_errors.length > 0;

    if (state.method === 'cash') {
      const quick = [...new Set([due, Math.ceil(due / 100) * 100, 500, 1000].filter((n) => n >= due))].slice(0, 4);
      box.innerHTML = `
        <div class="field" style="margin:0">
          <label for="cashInput">รับเงินมา (บาท)</label>
          <input class="input" id="cashInput" type="number" min="0" step="1" inputmode="numeric" value="${fmt.esc(state.cash)}" placeholder="${due}">
        </div>
        <div class="row" style="gap:8px">${quick.map((n) =>
          `<button class="btn btn-secondary btn-sm" data-cash="${n}">${n === due ? 'พอดี' : fmt.baht(n)}</button>`).join('')}</div>
        <div class="row-between"><span class="muted">เงินทอน</span><span class="h2" id="change">-</span></div>`;
      const input = $('cashInput');
      const update = () => {
        state.cash = input.value;
        const got = input.value === '' ? (due === 0 ? 0 : null) : Number(input.value);
        const enough = got !== null && got >= due;
        $('change').textContent = got === null ? '-' : enough ? fmt.baht(got - due) : 'เงินไม่พอ';
        $('change').className = 'h2' + (got !== null && !enough ? ' text-red' : '');
        payBtn.disabled = blocked || !enough;
      };
      input.oninput = update;
      box.querySelectorAll('[data-cash]').forEach((el) => {
        el.onclick = () => { input.value = el.dataset.cash; update(); };
      });
      update();
      return;
    }

    if (state.method === 'promptpay') {
      const payload = due > 0 ? promptPayPayload((window.SHOP && window.SHOP.phone) || '', due) : null;
      box.innerHTML = due === 0 ? '<div class="alert alert-ok">มัดจำครอบคลุมยอดแล้ว ไม่ต้องรับเงินเพิ่ม</div>'
        : payload
          ? `<div style="text-align:center">
               <img alt="QR พร้อมเพย์" width="200" height="200"
                    src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(payload)}">
               <div class="bold">${fmt.baht(due)}</div>
               <div class="caption muted">ให้ลูกค้าสแกน แล้วเช็กยอดเข้าในแอปธนาคารก่อนกดยืนยัน</div>
             </div>`
          : `<div class="alert alert-wait">ยังไม่มีเบอร์มือถือพร้อมเพย์ของร้าน (ตั้งที่หน้าตั้งค่าร้าน ช่องเบอร์โทร)<br>
               <span class="small">ให้ลูกค้าโอนตามป้ายหน้าร้าน แล้วเช็กยอดในแอปธนาคารก่อนกดยืนยัน</span></div>`;
      payBtn.disabled = blocked;
      return;
    }

    box.innerHTML = due === 0 ? '<div class="alert alert-ok">มัดจำครอบคลุมยอดแล้ว ไม่ต้องรับเงินเพิ่ม</div>'
      : `<div class="alert alert-ok">รูดบัตรที่เครื่อง EDC ยอด ${fmt.baht(due)} ให้ผ่านก่อน แล้วกดยืนยัน</div>`;
    payBtn.disabled = blocked;
  }

  /* ---------- จ่าย ---------- */
  async function pay() {
    const s = state.sum;
    const due = s.amount_due;
    const label = METHOD_TABS.find(([k]) => k === state.method)[1];
    const cash = state.method === 'cash' ? Number(state.cash || due) : null;
    const yes = await confirmModal(
      `รับเงิน ${s.bills.map((b) => fmt.esc(b.place)).join(', ')} <b>${fmt.baht(due)}</b> ด้วย ${label}?` +
      (cash !== null ? `<br><span class="small muted">รับ ${fmt.baht(cash)} · ทอน ${fmt.baht(cash - due)}</span>` : '') +
      (s.member ? `<br><span class="small muted">สมาชิก ${fmt.esc(s.member.name)} · ได้ ${fmt.num(s.points_to_earn)} แต้ม` +
        (s.points_redeemed ? ` · ใช้ ${fmt.num(s.points_redeemed)} แต้ม` : '') + '</span>' : ''),
      'ยืนยันรับเงิน');
    if (!yes) return;

    $('payBtn').disabled = true;
    const data = await run(() => api.post('checkout', {
      action: 'pay',
      bill_ids: s.bills.map((b) => b.id),
      payment_method: state.method,
      cash_received: cash,
      member_id: state.member ? state.member.id : null,
      reward_ids: state.rewardIds,
      coupon_code: state.coupon,
    }));
    if (!data) { $('payBtn').disabled = false; return; }

    state.selected.clear();
    state.cash = '';
    state.member = null;
    state.rewardIds = [];
    state.coupon = '';
    state.warned = true; // บิลจาก ?bill_id ปิดแล้วเพราะเพิ่งจ่าย ไม่ต้องเตือน
    showReceipt(data.receipt);
    loadBills();
  }

  /* ---------- ใบเสร็จ ---------- */
  function showReceipt(r) {
    const line = (left, right, bold) =>
      `<div class="row-between ${bold ? 'bold' : ''}" style="gap:8px"><span>${left}</span><span>${right}</span></div>`;
    const hr = '<hr style="border:0;border-top:1px dashed var(--brown-500);width:100%;margin:4px 0">';
    const discounts = r.rewards.length || r.coupon;
    // ยอดที่ลูกค้าจ่ายที่เคาน์เตอร์ (มีมัดจำ = จ่ายเพิ่ม) แสดงในกรอบเด่นที่สุด
    const bigLabel = r.deposit_deducted ? 'จ่ายเพิ่ม' : 'ยอดชำระ';
    const m = openModal({
      title: 'ชำระเงินเรียบร้อย',
      body: `
        <div class="print-area">
          <div class="slip stack" id="receiptSlip" style="gap:5px">
            <div style="text-align:center">
              <div class="bold" style="font-size:18px">${fmt.esc(r.shop_name || 'นึ่งสุข')}</div>
              ${r.address ? `<div class="caption">${fmt.esc(r.address)}</div>` : ''}
              ${r.phone ? `<div class="caption">โทร ${fmt.esc(r.phone)}</div>` : ''}
              <div class="bold" style="margin-top:4px">ใบเสร็จรับเงิน</div>
            </div>
            <div class="small">
              ${line('บิล', fmt.esc(r.bill_nos.join(', ')))}
              ${line('โต๊ะ', fmt.esc(r.places.join(', ')) + ' · ' + fmt.esc(r.guests) + ' คน')}
              ${line('วันที่', fmt.datetime(r.closed_at))}
              ${line('แคชเชียร์', fmt.esc(r.cashier))}
            </div>
            ${hr}
            ${r.lines.map((l, i) => `
              <div>
                <div>${i + 1}. ${fmt.esc(l.name)}</div>
                ${line(`<span class="small" style="padding-left:14px">${fmt.num(l.qty)} ${fmt.esc(l.unit)} × ${fmt.baht(l.unit_price)}</span>`, fmt.baht(l.amount))}
              </div>`).join('')}
            ${r.lines.length ? `<div class="small bold">รวม ${fmt.num(r.item_count || r.lines.length)} รายการ</div>` : ''}
            ${hr}
            ${line('ค่าอาหาร', fmt.baht(r.subtotal))}
            ${r.rewards.map((x) => line(`แลกแต้ม ${fmt.esc(x.name)}`, '−' + fmt.baht(x.discount))).join('')}
            ${r.coupon ? line(`คูปอง ${fmt.esc(r.coupon.code)}`, '−' + fmt.baht(r.discount_coupon)) : ''}
            ${(r.room_lines || []).map((x) => line(fmt.esc(x.label), fmt.baht(x.amount))).join('')}
            ${r.deposit_deducted || discounts || r.room_fee ? line('ยอดชำระ', fmt.baht(r.total), true) : ''}
            ${r.deposit_deducted ? line('หักมัดจำห้อง VIP', '−' + fmt.baht(r.deposit_deducted)) : ''}
            <div style="border:2px solid currentColor;border-radius:6px;padding:6px 8px;margin:4px 0">
              ${line(`<span style="font-size:17px">${bigLabel}</span>`, `<span style="font-size:22px">${fmt.baht(r.amount_due)}</span>`, true)}
            </div>
            ${line('ชำระด้วย', fmt.esc(r.payment_label))}
            ${r.cash_received !== null ? line('รับเงิน', fmt.baht(r.cash_received)) + line('เงินทอน', fmt.baht(r.change), true) : ''}
            ${r.member ? `${hr}
              ${line('สมาชิก ' + fmt.esc(r.member.name), '+' + fmt.num(r.points_earned) + ' แต้ม')}
              <div class="caption">${r.points_redeemed ? `ใช้ ${fmt.num(r.points_redeemed)} แต้ม · ` : ''}คงเหลือ ${fmt.num(r.points_balance)} แต้ม</div>` : ''}
            ${hr}
            <div class="caption" style="text-align:center">ราคารวม VAT 7% (${fmt.baht(r.vat)}) แล้ว</div>
            <div class="small" style="text-align:center">ขอบคุณที่ใช้บริการ</div>
          </div>
        </div>`,
      footer: `
        <a class="btn btn-secondary" href="/admin/tables.html">กลับผังโต๊ะ</a>
        <button class="btn" data-print><i data-icon="printer"></i> บันทึก PDF / พิมพ์</button>`,
    });
    // พิมพ์ / บันทึก PDF ขนาดสลิป 80 มม. (printSlip อยู่ใน bill-panel.js ใช้ร่วมกับสลิป QR)
    m.el.querySelector('[data-print]').onclick = () => printSlip(m.el.querySelector('#receiptSlip'));
  }

  /* ---------- QR พร้อมเพย์ (มาตรฐาน EMVCo ของธนาคารแห่งประเทศไทย) ---------- */
  function promptPayPayload(phone, amount) {
    const digits = String(phone).replace(/\D/g, '');
    if (!/^0[689]\d{8}$/.test(digits)) return null; // รับเฉพาะเบอร์มือถือ 10 หลัก
    const f = (id, value) => id + String(value.length).padStart(2, '0') + value;
    const account = f('00', 'A000000677010111') + f('01', '0066' + digits.slice(1));
    const body = f('00', '01') + f('01', '12') + f('29', account) + f('53', '764') +
      f('54', Number(amount).toFixed(2)) + f('58', 'TH') + '6304';
    return body + crc16(body);
  }

  function crc16(text) {
    let crc = 0xFFFF;
    for (let i = 0; i < text.length; i++) {
      crc ^= text.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  loadBills();
})();
