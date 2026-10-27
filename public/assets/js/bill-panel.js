/* =========================================================
   bill-panel.js — แผงเปิดโต๊ะ / ดูบิล (คนที่ 5)
   เสียบเข้าหน้า tables.html ของคนที่ 4 (ห้ามแก้ tables.html)
   - window.openTablePanel(table, panelEl)  ผังโต๊ะเรียกเมื่อคลิกโต๊ะ
   - window.showBillQr(bill)                เปิด modal QR + พิมพ์สลิป (ใช้ในหน้า bills.html ด้วย)
   - ทำเสร็จเรียก window.reloadTables() (คนที่ 4 เปิดไว้ให้)
   table = { id, code, table_type, seats, status, is_vip,
             bill: { id, bill_no, qr_token, opened_at, guests, total } | null }
   ========================================================= */
(function () {
  let mePromise = null;

  /** ผู้ใช้ที่ล็อกอินอยู่ (เรียก API ครั้งเดียว) */
  function me() {
    if (!mePromise) mePromise = api.get('auth').catch(() => null);
    return mePromise;
  }

  function reload() {
    if (typeof window.reloadTables === 'function') window.reloadTables();
  }

  /** แผงว่างตอนยังไม่เลือกโต๊ะ */
  function renderIdle(panelEl) {
    panelEl.innerHTML = `<div class="empty"><div class="empty-icon">🥟</div>เลือกโต๊ะจากผังเพื่อเริ่มต้น</div>`;
  }

  /* ---------- QR ---------- */
  function qrImage(url, size) {
    return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(url)}"
                 width="${size}" height="${size}" alt="QR สั่งอาหาร">`;
  }

  /** modal QR ของบิล + ปุ่มพิมพ์สลิป · bill ต้องมี bill_no, qr_url, place, guests, opened_at */
  function showBillQr(bill) {
    const shop = (window.SHOP && window.SHOP.shop_name) || 'นึ่งสุข';
    const m = openModal({
      title: `QR สั่งอาหาร · ${fmt.esc(bill.place)}`,
      body: `
        <div class="print-area">
          <div class="slip stack" style="text-align:center">
            <div class="bold">🥟 ${fmt.esc(shop)}</div>
            <div class="bold" style="font-size:20px">${fmt.esc(bill.place)}</div>
            <div class="small">บิล ${fmt.esc(bill.bill_no)} · ${fmt.esc(bill.guests)} คน · เปิด ${fmt.time(bill.opened_at)}</div>
            <div>${qrImage(bill.qr_url, 220)}</div>
            <div class="small">สแกนเพื่อดูเมนูและสั่งอาหาร</div>
            <div class="caption muted" style="word-break:break-all">${fmt.esc(bill.qr_url)}</div>
          </div>
        </div>`,
      footer: `<button class="btn btn-secondary" data-close>ปิด</button>
               <button class="btn" data-print>🖨 พิมพ์สลิป</button>`,
    });
    m.el.querySelector('[data-print]').onclick = () => window.print();
    return m;
  }

  /** หาบิลที่เปิดอยู่จาก API (ได้ qr_url, ยอด, จำนวนรอบ) */
  async function findOpenBill(billId) {
    const bills = await api.get('bills', { status: 'open' });
    return bills.find((b) => b.id === billId) || null;
  }

  /* ---------- โต๊ะว่าง: เปิดโต๊ะ ---------- */
  async function renderAvailable(table, panelEl) {
    const maxGuests = table.is_vip ? table.seats : Math.max(table.seats, 1);
    let guests = Math.min(2, maxGuests);
    const joined = new Set(); // โต๊ะที่ต่อเพิ่ม

    // โต๊ะว่างอื่นสำหรับต่อโต๊ะ (ห้อง VIP ต่อโต๊ะไม่ได้)
    let others = [];
    if (!table.is_vip) {
      try {
        const all = await api.get('tables');
        const list = Array.isArray(all) ? all : (all.tables || []);
        others = list.filter((t) => !t.is_vip && t.id !== table.id && t.status === 'available');
      } catch { /* ยังไม่มี API ผังโต๊ะ ก็เปิดโต๊ะเดี่ยวได้ */ }
    }

    const seatsTotal = () => table.seats + others.filter((t) => joined.has(t.id)).reduce((s, t) => s + t.seats, 0);

    function draw() {
      panelEl.innerHTML = `
        <div class="stack">
          <div class="row-between">
            <h3 style="margin:0">เปิด${table.is_vip ? 'ห้อง' : 'โต๊ะ'} ${fmt.esc(table.code)}</h3>
            <button class="btn btn-ghost btn-icon btn-sm" data-x aria-label="ปิด">✕</button>
          </div>
          <div class="field">
            <label>จำนวนคน</label>
            <div class="row">
              <div class="qty">
                <button class="btn btn-secondary" data-minus aria-label="ลดจำนวนคน">−</button>
                <span class="qty-num">${guests}</span>
                <button class="btn btn-secondary" data-plus aria-label="เพิ่มจำนวนคน">+</button>
              </div>
              <span class="small muted">รองรับ ${seatsTotal()} ที่</span>
            </div>
            ${guests > seatsTotal() ? `<div class="field-error">เกินจำนวนที่นั่ง ลองต่อโต๊ะเพิ่ม</div>` : ''}
          </div>
          ${table.is_vip ? '' : `
          <div class="field">
            <label>ต่อโต๊ะเพิ่ม</label>
            <div class="row">
              <span class="chip active">${fmt.esc(table.code)}</span>
              ${others.length
                ? others.map((t) => `<button class="chip ${joined.has(t.id) ? 'active' : ''}" data-join="${t.id}">
                    ${joined.has(t.id) ? '✓ ' : '+ '}${fmt.esc(t.code)}</button>`).join('')
                : '<span class="caption muted">ไม่มีโต๊ะว่างอื่น</span>'}
            </div>
            <div class="caption muted">เลือกโต๊ะว่างที่จะต่อเข้าบิลเดียวกัน</div>
          </div>`}
          <button class="btn btn-lg btn-block" data-open>เปิด${table.is_vip ? 'ห้อง' : 'โต๊ะ'}</button>
        </div>`;

      panelEl.querySelector('[data-x]').onclick = () => renderIdle(panelEl);
      panelEl.querySelector('[data-minus]').onclick = () => { if (guests > 1) { guests--; draw(); } };
      panelEl.querySelector('[data-plus]').onclick = () => {
        if (table.is_vip && guests >= maxGuests) return toast(`ห้อง VIP รับได้ไม่เกิน ${maxGuests} คน`, 'warn');
        guests++; draw();
      };
      panelEl.querySelectorAll('[data-join]').forEach((btn) => {
        btn.onclick = () => {
          const id = Number(btn.dataset.join);
          if (joined.has(id)) joined.delete(id); else joined.add(id);
          draw();
        };
      });
      panelEl.querySelector('[data-open]').onclick = openNow;
    }

    async function openNow() {
      const btn = panelEl.querySelector('[data-open]');
      btn.disabled = true;
      const body = table.is_vip
        ? { action: 'open', vip_room_id: table.id, guests }
        : { action: 'open', table_ids: [table.id, ...joined], guests };
      const bill = await run(() => api.post('bills', body));
      if (!bill) { btn.disabled = false; return; }
      renderIdle(panelEl);
      reload();
      showBillQr(bill);
    }

    draw();
  }

  /* ---------- โต๊ะมีลูกค้า: ดูบิล ---------- */
  async function renderBusy(table, panelEl) {
    const b = table.bill;
    panelEl.innerHTML = `<div class="loading">กำลังโหลด...</div>`;
    const [user, full] = await Promise.all([me(), findOpenBill(b.id).catch(() => null)]);
    const bill = full || { ...b, place: table.code, rounds: 0 };
    const isManager = user && ['manager', 'owner'].includes(user.role_code);
    const canPay = user && (isManager || (user.role_code === 'staff' && user.can_payment === 1));
    const canCancel = isManager && Number(bill.rounds || 0) === 0;

    panelEl.innerHTML = `
      <div class="stack">
        <div class="row-between">
          <div>
            <h3 style="margin:0">${table.is_vip ? 'ห้อง' : 'โต๊ะ'} ${fmt.esc(bill.place || table.code)}</h3>
            <div class="caption muted">${fmt.esc(bill.bill_no)}</div>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" data-x aria-label="ปิด">✕</button>
        </div>
        <div class="grid grid-3" style="gap:8px">
          <div class="card" style="padding:12px;text-align:center"><div class="caption muted">เวลาเปิด</div><div class="bold">${fmt.time(bill.opened_at)} น.</div></div>
          <div class="card" style="padding:12px;text-align:center"><div class="caption muted">นั่งมาแล้ว</div><div class="bold">${fmt.minutesAgo(bill.opened_at)} นาที</div></div>
          <div class="card" style="padding:12px;text-align:center"><div class="caption muted">จำนวนคน</div><div class="bold">${fmt.esc(bill.guests)} คน</div></div>
        </div>
        <div class="row-between">
          <span class="muted">สั่งไปแล้ว ${fmt.num(bill.rounds || 0)} รอบ</span>
          <span><span class="muted">ยอดรวม</span> <span class="price" style="font-size:20px">${fmt.baht(bill.total)}</span></span>
        </div>
        <div class="grid grid-2" style="gap:8px">
          <button class="btn btn-secondary" data-qr ${full ? '' : 'disabled'}>🔳 ดู QR</button>
          <a class="btn btn-secondary" href="/admin/order-staff.html?bill_id=${bill.id}">📝 สั่งแทนลูกค้า</a>
        </div>
        ${canPay
          ? `<a class="btn btn-lg btn-block" href="/admin/checkout.html?bill_id=${bill.id}">💳 ไปชำระเงิน</a>`
          : `<button class="btn btn-lg btn-block" disabled title="ไม่มีสิทธิ์รับเงิน">💳 ไปชำระเงิน</button>`}
        ${isManager ? `
          <button class="btn btn-danger btn-block" data-cancel ${canCancel ? '' : 'disabled'}>ยกเลิกโต๊ะ</button>
          ${canCancel ? '' : '<div class="caption muted" style="text-align:center">ยกเลิกได้เฉพาะบิลที่ยังไม่มีออเดอร์</div>'}` : ''}
      </div>`;

    panelEl.querySelector('[data-x]').onclick = () => renderIdle(panelEl);
    const qrBtn = panelEl.querySelector('[data-qr]');
    if (qrBtn && full) qrBtn.onclick = () => showBillQr(full);
    const cancelBtn = panelEl.querySelector('[data-cancel]');
    if (cancelBtn && canCancel) {
      cancelBtn.onclick = async () => {
        const yes = await confirmModal(
          `ยกเลิก${table.is_vip ? 'ห้อง' : 'โต๊ะ'} ${fmt.esc(bill.place || table.code)} (บิล ${fmt.esc(bill.bill_no)})?<br>
           <span class="small muted">QR ของบิลนี้จะใช้ไม่ได้ และโต๊ะจะกลับเป็นว่าง</span>`, 'ยกเลิกโต๊ะ', true);
        if (!yes) return;
        const done = await run(() => api.post('bills', { action: 'cancel', bill_id: bill.id }));
        if (done === null) return;
        renderIdle(panelEl);
        reload();
      };
    }
  }

  /* ---------- ทางเข้าหลัก ---------- */
  window.openTablePanel = function (table, panelEl) {
    if (!table || !panelEl) return;
    if (table.status === 'occupied' && table.bill) return renderBusy(table, panelEl);
    if (table.status === 'occupied') {
      panelEl.innerHTML = `<div class="alert alert-wait">โต๊ะ ${fmt.esc(table.code)} มีลูกค้าแต่ไม่พบบิลที่เปิดอยู่ แจ้งผู้จัดการ</div>`;
      return;
    }
    return renderAvailable(table, panelEl);
  };
  window.showBillQr = showBillQr;
})();
