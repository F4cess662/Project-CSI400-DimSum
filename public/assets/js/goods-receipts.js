/* =========================================================
   goods-receipts.js — รับของเข้า + ใบแจ้งหนี้ + บันทึกจ่ายเงิน (คนที่ 6 · เฟส 4)
   แท็บ "รับของเข้า": เลือก PO ที่ส่งแล้ว (GET /api/purchase_orders ของคนที่ 5) → กรอกจำนวนที่รับจริงพร้อมหน่วย
                       + วันหมดอายุ + ข้อมูลใบแจ้งหนี้ + รูป → ทวนรายการ → POST /api/goods_receipts create
   แท็บ "รอจ่ายเงิน": ใบที่ยังไม่จ่าย (GET ?unpaid=1) → ดูรูปใบแจ้งหนี้ / บันทึกจ่าย (mark_paid)
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'รับของเข้า · ใบแจ้งหนี้', roles: ['manager', 'owner'] });
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const num = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const state = { pos: [], po: null };

  /* ---------- แท็บ ---------- */
  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    $('tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    $('tab-receive').hidden = btn.dataset.tab !== 'receive';
    $('tab-unpaid').hidden = btn.dataset.tab !== 'unpaid';
    $('tab-paid').hidden = btn.dataset.tab !== 'paid';
    if (btn.dataset.tab === 'unpaid') loadUnpaid();
    if (btn.dataset.tab === 'paid') loadPaid();
  });

  /** เปิดรูป (ใบแจ้งหนี้ / สลิป) ใน modal */
  const showImage = (title, src) => openModal({
    title: fmt.esc(title), size: 'lg', body: `<img src="${fmt.esc(src)}" alt="${fmt.esc(title)}" style="max-width:100%">`,
  });

  /* =========================================================
     แท็บ 1: รับของเข้า
     ========================================================= */
  async function loadPos() {
    try {
      state.pos = await api.get('purchase_orders', { status: 'sent' });
    } catch (e) {
      $('poSelect').innerHTML = '<option value="">โหลดใบสั่งซื้อไม่ได้</option>';
      $('receiveForm').innerHTML = `<div class="alert alert-bad">${fmt.esc(e.message)}</div>`;
      return;
    }
    $('poSelect').innerHTML = state.pos.length
      ? '<option value="">— เลือกใบสั่งซื้อ —</option>' + state.pos.map((p) =>
        `<option value="${p.id}">${fmt.esc(p.po_no)} · ${fmt.esc(p.supplier_name)} · ${fmt.num(p.item_count)} รายการ`
        + `${p.expected_date ? ` · รับ ${fmt.date(p.expected_date)}` : ''}${p.overdue ? ` (เลยกำหนด ${p.overdue_days} วัน)` : ''}</option>`).join('')
      : '<option value="">ไม่มีใบสั่งซื้อที่รอรับของ</option>';
    const preset = qs('po_id');   // เข้าจากหน้าใบสั่งซื้อด้วย ?po_id= จะเลือกให้เอง
    if (preset && state.pos.some((p) => String(p.id) === preset)) { $('poSelect').value = preset; openPo(preset); }
    else renderEmptyForm();
  }

  function renderEmptyForm() {
    state.po = null;
    $('receiveForm').innerHTML = `<div class="empty"><div class="empty-icon"><i data-icon="inbox"></i></div>
      ${state.pos.length ? 'เลือกใบสั่งซื้อเพื่อบันทึกรับของ' : 'ยังไม่มีใบสั่งซื้อที่ส่งแล้ว · สร้างและส่งได้ที่หน้า <a href="purchase-orders.html">ใบสั่งซื้อ</a>'}</div>`;
  }

  $('poSelect').onchange = (e) => (e.target.value ? openPo(e.target.value) : renderEmptyForm());

  async function openPo(id) {
    $('receiveForm').innerHTML = '<div class="card loading">กำลังโหลดใบสั่งซื้อ...</div>';
    const po = await run(() => api.get('purchase_orders', { id }));
    if (!po) return renderEmptyForm();
    state.po = po;
    $('receiveForm').innerHTML = `
      <div class="card stack">
        <div class="row-between">
          <div>
            <div class="card-title" style="margin:0">${fmt.esc(po.po_no)} · ${fmt.esc(po.supplier_name)}</div>
            <div class="small muted">สั่งวันที่ ${fmt.date(po.order_date)}${po.expected_date ? ` · ต้องการรับ ${fmt.date(po.expected_date)}` : ''}
              · ยอดตามใบสั่ง ${fmt.baht(po.total)}</div>
          </div>
          ${po.overdue ? `<span class="badge badge-bad">เลยกำหนด ${po.overdue_days} วัน</span>` : '<span class="badge badge-doing">รอรับของ</span>'}
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>วัตถุดิบ</th><th class="num">สั่ง</th><th style="width:180px">รับจริง</th><th style="width:170px">วันหมดอายุ</th></tr></thead>
            <tbody>
              ${po.items.map((it, i) => `<tr>
                <td>${i + 1}</td>
                <td>${fmt.esc(it.name)}</td>
                <td class="num">${num(it.qty)} ${fmt.esc(it.unit)}</td>
                <td><div class="row" style="gap:6px;flex-wrap:nowrap">
                  <input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-qty="${it.ingredient_id}" value="${it.qty}">
                  <span class="small muted">${fmt.esc(it.unit)}</span></div></td>
                <td><input class="input" type="date" min="${todayStr()}" data-exp="${it.ingredient_id}"></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="caption muted" style="margin:0">ได้ของไม่ครบใส่จำนวนที่ได้จริง · ไม่ได้ของรายการไหนใส่ 0 · วันหมดอายุไม่บังคับ (ของแห้งเว้นว่างได้)</p>

        <div class="grid grid-2">
          <div class="field" style="margin:0">
            <label for="invoiceNo">เลขที่ใบแจ้งหนี้</label>
            <input class="input" id="invoiceNo" maxlength="50" placeholder="เช่น INV-2026-0012">
          </div>
          <div class="field" style="margin:0">
            <label for="invoiceAmount">ยอดตามใบแจ้งหนี้ (บาท)</label>
            <input class="input" id="invoiceAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${po.total}">
          </div>
        </div>
        <div class="field" style="margin:0">
          <label for="invoiceImage">รูปใบแจ้งหนี้ (JPG / PNG / WEBP ไม่เกิน 2MB)</label>
          <input class="input" id="invoiceImage" type="file" accept="image/jpeg,image/png,image/webp" style="padding-top:8px">
          <img id="invoicePreview" alt="ตัวอย่างรูปใบแจ้งหนี้" hidden style="max-width:240px;margin-top:8px">
        </div>

        <div class="row-between">
          <span class="small muted" id="receiveSummary"></span>
          <button class="btn" id="saveReceive"><i data-icon="inbox"></i> บันทึกรับของ</button>
        </div>
      </div>`;

    $('receiveForm').querySelectorAll('[data-qty]').forEach((el) => { el.oninput = updateSummary; });
    $('invoiceImage').onchange = previewImage;
    $('saveReceive').onclick = saveReceive;
    updateSummary();
  }

  /** อ่านรายการจากตาราง → [{ ingredient_id, qty, expiry_date, name, unit, ordered }] */
  function readRows() {
    return state.po.items.map((it) => ({
      ingredient_id: it.ingredient_id,
      qty: $('receiveForm').querySelector(`[data-qty="${it.ingredient_id}"]`).value,
      expiry_date: $('receiveForm').querySelector(`[data-exp="${it.ingredient_id}"]`).value,
      name: it.name, unit: it.unit, ordered: Number(it.qty),
    }));
  }

  function updateSummary() {
    const rows = readRows();
    const got = rows.filter((r) => Number(r.qty) > 0).length;
    const diff = rows.filter((r) => r.qty !== '' && Number(r.qty) !== r.ordered).length;
    $('receiveSummary').textContent = `ได้ของ ${got} จาก ${rows.length} รายการ${diff ? ` · ไม่ตรงที่สั่ง ${diff} รายการ` : ''}`;
  }

  function previewImage() {
    const file = $('invoiceImage').files[0];
    const img = $('invoicePreview');
    if (!file) { img.hidden = true; return; }
    if (file.size > 2 * 1024 * 1024) {
      toast('รูปใบแจ้งหนี้ต้องไม่เกิน 2MB', 'warn');
      $('invoiceImage').value = ''; img.hidden = true; return;
    }
    img.src = URL.createObjectURL(file);
    img.hidden = false;
  }

  async function saveReceive() {
    const rows = readRows();
    if (rows.some((r) => r.qty === '' || Number(r.qty) < 0)) return toast('กรอกจำนวนที่รับจริงให้ครบ (ไม่ได้ของใส่ 0)', 'warn');
    if (!rows.some((r) => Number(r.qty) > 0)) return toast('ยังไม่ได้รับของเลย ถ้าร้านไม่ส่งของให้ยกเลิกใบสั่งซื้อแทน', 'warn');

    // ทวนรายการก่อนบันทึก (บวกเข้าคลังแล้วแก้ไม่ได้)
    const list = rows.map((r, i) => {
      const q = Number(r.qty);
      const mark = q === 0 ? ' <b class="text-red">ไม่ได้ของ</b>' : q !== r.ordered ? ` <span class="muted">(สั่ง ${num(r.ordered)})</span>` : '';
      return `${i + 1}. ${fmt.esc(r.name)} × ${num(q)} ${fmt.esc(r.unit)}${mark}${r.expiry_date ? ` · หมดอายุ ${fmt.date(r.expiry_date)}` : ''}`;
    }).join('<br>');
    const amount = $('invoiceAmount').value;
    const okGo = await confirmModal(
      `<b>${fmt.esc(state.po.po_no)} · ${fmt.esc(state.po.supplier_name)}</b><br>${list}<br><br>`
      + `รวม ${rows.filter((r) => Number(r.qty) > 0).length} รายการที่ได้ของ`
      + `${amount ? ` · ใบแจ้งหนี้ ${fmt.baht(amount)}` : ''}<br>`
      + '<span class="small muted">บันทึกแล้วจำนวนจะถูกบวกเข้าคลังทันที</span>', 'ยืนยันรับของ');
    if (!okGo) return;

    const fd = new FormData();
    fd.append('action', 'create');
    fd.append('po_id', state.po.id);
    fd.append('items', JSON.stringify(rows.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty), expiry_date: r.expiry_date || null }))));
    fd.append('invoice_no', $('invoiceNo').value.trim());
    fd.append('invoice_amount', amount);
    if ($('invoiceImage').files[0]) fd.append('invoice_image', $('invoiceImage').files[0]);

    $('saveReceive').disabled = true;
    const result = await run(() => api.upload('goods_receipts', fd));
    if ($('saveReceive')) $('saveReceive').disabled = false;
    if (!result) return;
    if (result.diffs && result.diffs.length) {
      openModal({
        title: 'ได้ของไม่ตรงที่สั่ง',
        body: `<p class="small">แจ้งร้านค้าหรือสั่งเพิ่มในใบสั่งซื้อใหม่</p>` + result.diffs.map((d) =>
          `<div>${fmt.esc(d.name)}: สั่ง ${num(d.ordered_qty)} ได้ ${num(d.received_qty)} ${fmt.esc(d.unit)}</div>`).join(''),
        footer: '<button class="btn" data-close>รับทราบ</button>',
      });
    }
    await Promise.all([loadPos(), loadUnpaidCount()]);
  }

  /* =========================================================
     แท็บ 2: รอจ่ายเงิน
     ========================================================= */
  async function loadUnpaidCount() {
    try {
      const rows = await api.get('goods_receipts', { unpaid: 1 });
      $('unpaidCount').textContent = rows.length ? fmt.num(rows.length) : '';
      return rows;
    } catch (e) { return null; }
  }

  async function loadUnpaid() {
    const rows = await loadUnpaidCount();
    if (!rows) {
      $('unpaidRows').innerHTML = '<tr><td colspan="7"><div class="alert alert-bad">ระบบคลังสินค้าไม่พร้อมใช้ ลองใหม่อีกครั้ง</div></td></tr>';
      return;
    }
    $('unpaidRows').innerHTML = rows.length ? rows.map((r) => `<tr>
        <td class="bold">${fmt.esc(r.po_no)}</td>
        <td>${fmt.esc(r.supplier_name)}</td>
        <td>${fmt.date(r.received_at)}<div class="caption ${r.days_unpaid > 30 ? 'text-red' : 'muted'}">ค้างจ่าย ${r.days_unpaid} วัน</div></td>
        <td>${r.invoice_no ? fmt.esc(r.invoice_no) : '<span class="muted">-</span>'}</td>
        <td class="num">${r.invoice_amount === null ? `<span class="muted" title="ยอดตามใบสั่งซื้อ">~${fmt.baht(r.po_total)}</span>` : fmt.baht(r.invoice_amount)}</td>
        <td>${r.invoice_image ? `<button class="btn btn-ghost btn-sm" data-img="${r.id}">ดูรูป</button>` : '<span class="muted small">ไม่มีรูป</span>'}</td>
        <td><button class="btn btn-sm" data-pay="${r.id}">บันทึกจ่าย</button></td>
      </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty"><div class="empty-icon"><i data-icon="inbox"></i></div>ไม่มีใบแจ้งหนี้ค้างจ่าย</div></td></tr>`;

    $('unpaidRows').querySelectorAll('[data-img]').forEach((b) => {
      const r = rows.find((x) => String(x.id) === b.dataset.img);
      b.onclick = () => showImage(`ใบแจ้งหนี้ ${r.invoice_no || r.po_no}`, r.invoice_image);
    });
    $('unpaidRows').querySelectorAll('[data-pay]').forEach((b) => {
      b.onclick = () => payDialog(rows.find((x) => String(x.id) === b.dataset.pay));
    });
  }

  /** บันทึกจ่าย: วันที่จ่าย + เลขอ้างอิงการโอน + สลิป (ไม่บังคับทั้งสองอย่าง) */
  function payDialog(r) {
    const m = openModal({
      title: 'บันทึกจ่ายเงินร้านค้า',
      body: `<p><b>${fmt.esc(r.po_no)}</b> · ${fmt.esc(r.supplier_name)}<br>
          ${r.invoice_no ? `ใบแจ้งหนี้ ${fmt.esc(r.invoice_no)} · ` : ''}${r.invoice_amount === null ? 'ไม่ได้ระบุยอด' : fmt.baht(r.invoice_amount)}</p>
        <div class="field">
          <label for="paidAt">วันที่จ่ายเงิน</label>
          <input class="input" type="date" id="paidAt" value="${todayStr()}" max="${todayStr()}" min="${String(r.received_date)}">
        </div>
        <div class="field">
          <label for="paymentRef">เลขอ้างอิงการโอน (ไม่บังคับ)</label>
          <input class="input" id="paymentRef" maxlength="50" placeholder="เช่น เลขที่รายการจากสลิป หรือเลขเช็ค">
        </div>
        <div class="field" style="margin:0">
          <label for="paymentSlip">สลิปโอนเงิน (ไม่บังคับ · JPG / PNG / WEBP ไม่เกิน 2MB)</label>
          <input class="input" id="paymentSlip" type="file" accept="image/jpeg,image/png,image/webp" style="padding-top:8px">
          <img id="slipPreview" alt="ตัวอย่างสลิป" hidden style="max-width:200px;margin-top:8px">
        </div>`,
      footer: `<button class="btn btn-secondary" data-close>ยกเลิก</button><button class="btn" data-ok>บันทึกว่าจ่ายแล้ว</button>`,
    });
    const fileInput = m.el.querySelector('#paymentSlip');
    const preview = m.el.querySelector('#slipPreview');
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (file && file.size > 2 * 1024 * 1024) { toast('สลิปต้องไม่เกิน 2MB', 'warn'); fileInput.value = ''; }
      preview.hidden = !fileInput.files[0];
      if (fileInput.files[0]) preview.src = URL.createObjectURL(fileInput.files[0]);
    };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const fd = new FormData();
      fd.append('action', 'mark_paid');
      fd.append('id', r.id);
      fd.append('paid_at', m.el.querySelector('#paidAt').value);
      fd.append('payment_ref', m.el.querySelector('#paymentRef').value.trim());
      if (fileInput.files[0]) fd.append('payment_slip', fileInput.files[0]);
      e.target.disabled = true;
      const done = await run(() => api.upload('goods_receipts', fd));
      e.target.disabled = false;
      if (done) { m.close(); loadUnpaid(); }
    };
  }

  /* =========================================================
     แท็บ 3: จ่ายแล้ว (หลักฐานการจ่ายย้อนหลัง)
     ========================================================= */
  async function loadPaid() {
    let rows;
    try { rows = await api.get('goods_receipts', { paid: 1 }); } catch (e) {
      $('paidRows').innerHTML = '<tr><td colspan="7"><div class="alert alert-bad">ระบบคลังสินค้าไม่พร้อมใช้ ลองใหม่อีกครั้ง</div></td></tr>';
      return;
    }
    $('paidRows').innerHTML = rows.length ? rows.map((r) => `<tr>
        <td class="bold">${fmt.esc(r.po_no)}</td>
        <td>${fmt.esc(r.supplier_name)}</td>
        <td>${fmt.date(r.paid_at)}<div class="caption muted">รับของ ${fmt.date(r.received_at)}</div></td>
        <td>${r.invoice_no ? fmt.esc(r.invoice_no) : '<span class="muted">-</span>'}</td>
        <td class="num">${r.invoice_amount === null ? `<span class="muted">~${fmt.baht(r.po_total)}</span>` : fmt.baht(r.invoice_amount)}</td>
        <td>${r.payment_ref ? fmt.esc(r.payment_ref) : '<span class="muted">-</span>'}</td>
        <td class="row" style="gap:4px">
          ${r.payment_slip ? `<button class="btn btn-ghost btn-sm" data-slip="${r.id}">ดูสลิป</button>` : '<span class="badge badge-off">ไม่มีสลิป</span>'}
          ${r.invoice_image ? `<button class="btn btn-ghost btn-sm" data-img="${r.id}">ใบแจ้งหนี้</button>` : ''}
        </td>
      </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty"><div class="empty-icon"><i data-icon="inbox"></i></div>ยังไม่มีรายการที่จ่ายแล้ว</div></td></tr>`;

    const find = (id) => rows.find((x) => String(x.id) === id);
    $('paidRows').querySelectorAll('[data-slip]').forEach((b) => {
      const r = find(b.dataset.slip);
      b.onclick = () => showImage(`สลิปโอนเงิน ${r.po_no}${r.payment_ref ? ' · ' + r.payment_ref : ''}`, r.payment_slip);
    });
    $('paidRows').querySelectorAll('[data-img]').forEach((b) => {
      const r = find(b.dataset.img);
      b.onclick = () => showImage(`ใบแจ้งหนี้ ${r.invoice_no || r.po_no}`, r.invoice_image);
    });
  }

  await Promise.all([loadPos(), loadUnpaidCount()]);
})();
