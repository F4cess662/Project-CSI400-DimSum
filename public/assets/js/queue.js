/* =========================================================
   queue.js — คิวหน้าร้าน (คนที่ 4 · เฟส 2)
   - 3 คอลัมน์ บาร์ / โต๊ะเล็ก / โต๊ะใหญ่ · poll ทุก 10 วินาที
   - ออกบัตรคิว: modal ปุ่มจำนวนคน 1–8 → แสดงบัตร + พิมพ์ (print-area)
   - ให้นั่ง: เลือกโต๊ะว่าง → /api/bills open → /api/queue seat (+ QR จาก bill-panel.js ถ้ามี)
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'คิว', roles: ['staff', 'manager', 'owner'] });
  if (!me) return;

  const GROUPS = [
    { key: 'bar', title: '<i data-icon="cup"></i> บาร์', sub: '1 คน', prefix: 'A' },
    { key: 'small', title: '<i data-icon="chair"></i> โต๊ะเล็ก', sub: '2–4 คน', prefix: 'S' },
    { key: 'large', title: '<i data-icon="utensils"></i> โต๊ะใหญ่', sub: '5–8 คน', prefix: 'L' },
  ];
  const TYPE_LABEL = { bar: 'บาร์', small: 'โต๊ะเล็ก', large: 'โต๊ะใหญ่' };
  const $ = (id) => document.getElementById(id);
  let data = { order_open: true, groups: { bar: [], small: [], large: [] } };

  function ticketHtml(t) {
    const called = t.status === 'called';
    const info = called
      ? `เรียกแล้ว ${t.called_count} ครั้ง · ครั้งแรก ${fmt.time(t.called_at)} น.`
      : (t.ahead ? `รอก่อนหน้า ${t.ahead} คิว` : 'คิวถัดไป');
    return `<div class="ticket" style="margin-bottom:12px">
      <div class="ticket-main stack">
        <div class="row-between"><span class="bold">${t.party_size} คน</span>${badge(t.status)}</div>
        <div class="small muted">ออกบัตร ${fmt.time(t.created_at)} น. · รอ ${fmt.num(t.wait_minutes)} นาที</div>
        <div class="small">${info}</div>
        <div class="row">
          <button class="btn btn-secondary btn-sm" data-call="${t.id}"><i data-icon="megaphone"></i> ${called ? 'เรียกซ้ำ' : 'เรียก'}</button>
          <button class="btn btn-sm" data-seat="${t.id}">ให้นั่ง</button>
          <button class="btn btn-ghost btn-sm" data-skip="${t.id}" ${t.can_skip ? '' : 'disabled title="ข้ามได้เมื่อเรียกครบ 3 ครั้ง หรือเรียกครั้งแรกเกิน 5 นาที"'}>ข้าม</button>
        </div>
      </div>
      <div class="ticket-side"><div><div class="caption">คิว</div><div class="stat-value">${fmt.esc(t.queue_no)}</div></div></div>
    </div>`;
  }

  function draw() {
    const all = GROUPS.flatMap((g) => data.groups[g.key]);
    $('cntWait').textContent = `รอ ${all.filter((t) => t.status === 'waiting').length}`;
    $('cntCalled').textContent = `เรียกแล้ว ${all.filter((t) => t.status === 'called').length}`;
    $('closedAlert').innerHTML = data.order_open ? ''
      : `<div class="alert alert-wait" style="margin-bottom:16px"><i data-icon="clock"></i> ${fmt.esc(data.closed_message || 'ปิดรับออเดอร์แล้ว')} — ออกบัตรคิวใหม่ไม่ได้</div>`;
    $('issueBtn').disabled = !data.order_open;

    $('columns').innerHTML = GROUPS.map((g) => {
      const list = data.groups[g.key];
      return `<div class="card">
        <h3 class="card-title">${g.title} <span class="small muted">${g.sub} · ${g.prefix}- · ${list.length} คิว</span></h3>
        ${list.length ? list.map(ticketHtml).join('')
          : '<div class="empty"><div class="empty-icon"><i data-icon="ticket"></i></div>ไม่มีคิวรอ</div>'}
      </div>`;
    }).join('');

    const find = (id) => all.find((t) => t.id === Number(id));
    $('columns').querySelectorAll('[data-call]').forEach((b) => { b.onclick = () => act('call', find(b.dataset.call)); });
    $('columns').querySelectorAll('[data-skip]').forEach((b) => { b.onclick = () => skip(find(b.dataset.skip)); });
    $('columns').querySelectorAll('[data-seat]').forEach((b) => { b.onclick = () => openSeat(find(b.dataset.seat)); });
  }

  async function load() {
    try {
      data = await api.get('queue');
      draw();
    } catch (e) {
      $('columns').innerHTML = `<div class="alert alert-bad">โหลดคิวไม่สำเร็จ: ${fmt.esc(e.message)}</div>`;
    }
  }

  async function act(action, t, extra = {}) {
    const done = await run(() => api.post('queue', { action, id: t.id, ...extra }));
    if (done !== null) load();
    return done;
  }

  async function skip(t) {
    if (await confirmModal(`ข้ามคิว ${fmt.esc(t.queue_no)}? ลูกค้าต้องรับบัตรคิวใหม่`, 'ข้ามคิว', true)) act('skip', t);
  }

  /* ---------- ออกบัตรคิว ---------- */
  function openIssue() {
    const m = openModal({
      title: 'ออกบัตรคิว — มากี่คน?',
      body: `<div class="grid grid-4">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        `<button class="btn btn-secondary btn-lg" data-size="${n}">${n} คน</button>`).join('')}</div>
        <p class="small muted" style="margin-bottom:0">1 คน = บาร์ (A) · 2–4 คน = โต๊ะเล็ก (S) · 5–8 คน = โต๊ะใหญ่ (L)</p>`,
    });
    m.el.querySelectorAll('[data-size]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const t = await run(() => api.post('queue', { action: 'issue', party_size: Number(b.dataset.size) }));
        b.disabled = false;
        if (!t) return;
        m.close();
        showTicket(t);
        load();
      };
    });
  }

  function showTicket(t) {
    const shop = (window.SHOP && window.SHOP.shop_name) || 'นึ่งสุข';
    const m = openModal({
      title: `บัตรคิว ${fmt.esc(t.queue_no)}`,
      body: `<div class="print-area">
          <div class="slip stack" style="text-align:center">
            <div class="bold"><i data-icon="dumpling"></i> ${fmt.esc(shop)}</div>
            <div class="small">บัตรคิว · ${TYPE_LABEL[t.group_type]}</div>
            <div class="stat-value">${fmt.esc(t.queue_no)}</div>
            <div>${t.party_size} คน · ${fmt.date(t.created_at)} ${fmt.time(t.created_at)} น.</div>
            <div class="small">${t.ahead ? `รอก่อนหน้า ${t.ahead} คิว` : 'คิวถัดไป'}</div>
            <div class="caption muted">กรุณารอเรียกคิว หากเรียกครบ 3 ครั้งแล้วไม่อยู่ คิวจะถูกข้าม</div>
          </div>
        </div>`,
      footer: `<button class="btn btn-secondary" data-close>ปิด</button><button class="btn" data-print><i data-icon="printer"></i> พิมพ์บัตรคิว</button>`,
    });
    m.el.querySelector('[data-print]').onclick = () => window.print();
  }

  /* ---------- ให้นั่ง: เลือกโต๊ะ → เปิดบิล → seat ---------- */
  async function openSeat(t) {
    const tables = await run(() => api.get('tables'));
    if (!tables) return;
    const free = tables.filter((x) => x.status === 'available' && !x.bill);
    // ประเภทที่ตรงกับกลุ่มคิวขึ้นก่อน
    const types = [t.group_type, ...['bar', 'small', 'large'].filter((k) => k !== t.group_type)];
    const picked = new Set();

    const m = openModal({
      title: `ให้นั่ง · คิว ${fmt.esc(t.queue_no)} (${t.party_size} คน)`,
      size: 'lg',
      body: `<div class="field" style="max-width:200px"><label>จำนวนคน</label>
          <input class="input" id="qGuests" type="number" min="1" value="${t.party_size}"></div>
        ${free.length ? types.map((k) => {
          const list = free.filter((x) => x.table_type === k);
          return list.length ? `<div class="zone-block"><div class="bold" style="margin-bottom:8px">${TYPE_LABEL[k]}
              ${k === t.group_type ? '<span class="badge badge-ok">แนะนำ</span>' : ''}</div>
            <div class="row">${list.map((x) =>
              `<button class="chip" data-table="${x.id}">${fmt.esc(x.code)} · ${x.seats} ที่</button>`).join('')}</div></div>` : '';
        }).join('') : '<div class="empty"><div class="empty-icon"><i data-icon="chair"></i></div>ตอนนี้ไม่มีโต๊ะว่าง</div>'}
        <p class="small muted" id="qPicked">เลือกได้มากกว่า 1 โต๊ะ (ต่อโต๊ะ)</p>`,
      footer: `<button class="btn btn-secondary" data-close>ยกเลิก</button><button class="btn" data-ok disabled>เปิดโต๊ะและให้นั่ง</button>`,
    });
    const okBtn = m.el.querySelector('[data-ok]');
    m.el.querySelectorAll('[data-table]').forEach((c) => {
      c.onclick = () => {
        const id = Number(c.dataset.table);
        if (picked.has(id)) picked.delete(id); else picked.add(id);
        c.classList.toggle('active', picked.has(id));
        const seats = free.filter((x) => picked.has(x.id)).reduce((a, x) => a + x.seats, 0);
        m.el.querySelector('#qPicked').textContent = picked.size ? `เลือก ${picked.size} โต๊ะ · รวม ${seats} ที่นั่ง` : 'เลือกได้มากกว่า 1 โต๊ะ (ต่อโต๊ะ)';
        okBtn.disabled = !picked.size;
      };
    });
    okBtn.onclick = async () => {
      okBtn.disabled = true;
      const guests = Number(m.el.querySelector('#qGuests').value);
      const bill = await run(() => api.post('bills', { action: 'open', table_ids: [...picked], guests }));
      if (!bill) { okBtn.disabled = false; return; }
      m.close();
      await act('seat', t, { bill_id: bill.bill_id });
      if (typeof window.showBillQr === 'function') window.showBillQr(bill);
    };
  }

  $('issueBtn').onclick = openIssue;
  $('refreshBtn').onclick = load;
  poll(load, 10);
})();
