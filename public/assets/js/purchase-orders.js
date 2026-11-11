/* =========================================================
   purchase-orders.js — ใบสั่งซื้อวัตถุดิบ PO (คนที่ 5 · เฟส 4)
   ซ้าย: รายการ PO แยกตามสถานะ · ขวา: รายละเอียด + ปุ่มตามสถานะ
   ฟอร์ม: เลือกร้าน → เพิ่มวัตถุดิบ (ราคาตั้งต้นจากร้านนั้น + บอกเจ้าที่ถูกสุด) → บันทึกร่าง / บันทึกและส่ง
   ส่งแล้ว → ข้อความ LINE (รายการมีลำดับ) ให้กดคัดลอกไปส่งร้านค้า
   สถานะ: ร่าง → ส่งแล้ว → รับของแล้ว (คนที่ 6 บันทึกรับของ) · ร่าง/ส่งแล้ว → ยกเลิก
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'ใบสั่งซื้อวัตถุดิบ', roles: ['manager', 'owner'] });
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const STATUS_TABS = [['', 'ทั้งหมด'], ['draft', 'ร่าง'], ['sent', 'ส่งแล้ว'], ['received', 'รับของแล้ว'], ['cancelled', 'ยกเลิก']];
  const STATUS_BADGE = {
    draft: ['ร่าง', 'off'], sent: ['ส่งแล้ว', 'doing'], received: ['รับของแล้ว', 'ok'], cancelled: ['ยกเลิก', 'bad'],
  };
  const statusBadge = (s) => `<span class="badge badge-${STATUS_BADGE[s][1]}">${STATUS_BADGE[s][0]}</span>`;
  const num = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

  const state = { status: '', list: [], form: null, current: null };

  /* ---------- ข้อมูลฟอร์ม (ร้าน วัตถุดิบ ราคา) ---------- */
  async function loadFormData() {
    state.form = await api.get('purchase_orders', { action: 'form_data' });
    renderTabs();
    renderNeedOrder();
  }
  const supplierOf = (id) => state.form.suppliers.find((s) => s.id === Number(id));
  const ingredientOf = (id) => state.form.ingredients.find((i) => i.id === Number(id));
  const priceOf = (supplierId, ingredientId) => {
    const p = state.form.prices.find((x) => x.supplier_id === Number(supplierId) && x.ingredient_id === Number(ingredientId));
    return p ? p.price : null;
  };
  /** เจ้าที่ถูกที่สุดของวัตถุดิบนี้ */
  function cheapest(ingredientId) {
    const list = state.form.prices.filter((p) => p.ingredient_id === Number(ingredientId) && supplierOf(p.supplier_id));
    if (!list.length) return null;
    const best = list.reduce((a, b) => (b.price < a.price ? b : a));
    return { ...best, name: supplierOf(best.supplier_id).name };
  }
  /** จำนวนแนะนำ: เติมให้ถึง 2 เท่าของจุดสั่งซื้อ */
  const suggestQty = (ing) => Math.max(1, Math.ceil(ing.reorder_point * 2 - ing.qty_on_hand));

  function renderTabs() {
    const c = state.form.counts;
    const all = Object.values(c).reduce((a, b) => a + b, 0);
    $('statusTabs').innerHTML = STATUS_TABS.map(([k, label]) =>
      `<button class="tab ${state.status === k ? 'active' : ''}" data-status="${k}">${label} ${fmt.num(k ? c[k] : all)}</button>`).join('');
    $('statusTabs').querySelectorAll('[data-status]').forEach((el) => {
      el.onclick = () => { state.status = el.dataset.status; renderTabs(); loadList(); };
    });
  }

  /** แถบเตือนด้านบน: ใบที่เลยกำหนดรับของ (โทรตามร้านค้า) + วัตถุดิบที่ต่ำกว่าจุดสั่งซื้อ */
  function renderNeedOrder() {
    const need = state.form.ingredients.filter((i) => i.need_order);
    const late = state.form.overdue || [];
    $('needOrder').innerHTML = `
      ${late.length ? `
      <div class="alert alert-bad" style="margin-bottom:12px">
        <i data-icon="clock"></i> <b>เลยกำหนดรับของ ${late.length} ใบ</b> · ส่งแล้วแต่ของยังไม่มา โทรหรือทักไลน์ตามร้านค้า:
        ${late.map((o) => `<a href="#" data-late="${o.id}">${fmt.esc(o.po_no)} ${fmt.esc(o.supplier_name)} (เลย ${o.overdue_days} วัน)</a>`).join(' · ')}
      </div>` : ''}
      ${need.length ? `
      <div class="alert alert-wait row-between" style="margin-bottom:16px;gap:12px;flex-wrap:wrap">
        <span><i data-icon="alert"></i> <b>วัตถุดิบต่ำกว่าจุดสั่งซื้อ ${need.length} รายการ:</b>
          ${need.map((i) => `${fmt.esc(i.name)} (เหลือ ${num(i.qty_on_hand)} ${fmt.esc(i.unit)})`).join(' · ')}</span>
        <button class="btn btn-sm" id="orderNeedBtn">สร้างใบสั่งซื้อจากรายการนี้</button>
      </div>` : ''}`;
    if (need.length) $('orderNeedBtn').onclick = () => openForm(null, { fillNeed: true });
    $('needOrder').querySelectorAll('[data-late]').forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); showDetail(Number(a.dataset.late)); };
    });
  }

  /* ---------- รายการ PO ---------- */
  async function loadList() {
    try {
      state.list = await api.get('purchase_orders', { status: state.status, q: $('search').value.trim() });
    } catch (e) { toast(e.message, 'error'); return; }
    $('rows').innerHTML = state.list.length ? state.list.map((p) => `
      <tr data-id="${p.id}" style="cursor:pointer">
        <td class="bold">${fmt.esc(p.po_no)}</td>
        <td>${fmt.esc(p.supplier_name)}</td>
        <td>${fmt.date(p.order_date)}</td>
        <td>${p.expected_date ? fmt.date(p.expected_date) : '-'}</td>
        <td class="num">${fmt.num(p.item_count)}</td>
        <td class="num">${fmt.baht(p.total)}</td>
        <td>${statusBadge(p.status)}${p.overdue ? ' <span class="badge badge-bad">เลยกำหนด</span>' : ''}</td>
      </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty"><div class="empty-icon"><i data-icon="file"></i></div>
          ${state.status || $('search').value ? 'ไม่พบใบสั่งซื้อตามเงื่อนไข' : 'ยังไม่มีใบสั่งซื้อ กด "สร้างใบสั่งซื้อ" เพื่อเริ่ม'}</div></td></tr>`;
    $('rows').querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => showDetail(Number(tr.dataset.id)); });
    highlight();
  }
  function highlight() {
    $('rows').querySelectorAll('[data-id]').forEach((tr) => {
      tr.querySelectorAll('td').forEach((td) => { td.style.background = Number(tr.dataset.id) === state.current ? 'var(--red-50)' : ''; });
    });
  }

  /* ---------- รายละเอียด ---------- */
  async function showDetail(id) {
    state.current = id;
    highlight();
    $('detail').innerHTML = '<div class="loading">กำลังโหลด...</div>';
    let po;
    try { po = await api.get('purchase_orders', { id }); } catch (e) { toast(e.message, 'error'); return; }
    if (state.current !== id) return;
    const row = (label, value) => `<div class="row-between" style="gap:12px"><span class="muted">${label}</span><span style="text-align:right">${value}</span></div>`;
    $('detail').innerHTML = `
      <div class="stack">
        <div class="row-between">
          <div><h3 style="margin:0">${fmt.esc(po.po_no)}</h3>
            <div class="caption muted">สร้างโดย ${fmt.esc(po.created_by_name || '-')}</div></div>
          ${statusBadge(po.status)}
        </div>
        <div class="small stack" style="gap:4px">
          ${row('ซัพพลายเออร์', `<b>${fmt.esc(po.supplier_name)}</b>`)}
          ${po.contact_name ? row('ผู้ติดต่อ', fmt.esc(po.contact_name)) : ''}
          ${po.line_id ? row('LINE', fmt.esc(po.line_id)) : ''}
          ${po.supplier_phone ? row('เบอร์', fmt.esc(po.supplier_phone)) : ''}
          ${row('วันที่สั่ง', fmt.date(po.order_date))}
          ${row('ต้องการรับของ', po.expected_date ? fmt.date(po.expected_date) : '-')}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th class="num">#</th><th>วัตถุดิบ</th><th class="num">จำนวน</th><th class="num">รวม</th></tr></thead>
            <tbody>${po.items.map((it, i) => `
              <tr>
                <td class="num muted">${i + 1}</td>
                <td>${fmt.esc(it.name)}<div class="caption muted">${fmt.baht(it.unit_price)} / ${fmt.esc(it.unit)}</div></td>
                <td class="num">${num(it.qty)} ${fmt.esc(it.unit)}</td>
                <td class="num">${fmt.baht(it.amount)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="row-between"><span class="muted">รวม ${fmt.num(po.items.length)} รายการ</span>
          <span class="h3" style="margin:0">${fmt.baht(po.total)}</span></div>
        ${po.note ? `<div class="alert alert-ok small">หมายเหตุ: ${fmt.esc(po.note)}</div>` : ''}
        ${po.status === 'draft' ? `
          <div class="alert alert-wait small">ยังไม่ได้ส่งให้ร้านค้า · กด "ส่งใบสั่งซื้อ" คัดลอกข้อความไปส่ง LINE แล้วกดยืนยันว่าส่งแล้ว</div>
          <div class="grid grid-2" style="gap:8px">
            <button class="btn btn-secondary" data-act="edit"><i data-icon="edit"></i> แก้ไข</button>
            <button class="btn" data-act="send"><i data-icon="megaphone"></i> ส่งใบสั่งซื้อ</button>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="cancel">ยกเลิกใบสั่งซื้อ</button>` : ''}
        ${po.status === 'sent' && po.overdue ? `
          <div class="alert alert-bad small"><b>เลยกำหนดรับของมา ${po.overdue_days} วัน</b> · ของยังไม่มา
            โทรหรือทักไลน์ตามร้านค้า${po.supplier_phone ? ` (โทร ${fmt.esc(po.supplier_phone)})` : ''}${po.line_id ? ` (LINE ${fmt.esc(po.line_id)})` : ''}
            · ถ้าร้านค้าไม่ได้รับข้อความ คัดลอกส่งใหม่ได้</div>` : ''}
        ${po.status === 'sent' && !po.overdue ? `
          <div class="alert alert-wait small">ส่งแล้ว รอร้านค้าส่งของ · พอของมาถึง บันทึกที่หน้า "รับของ" ใบนี้จะเปลี่ยนเป็นรับของแล้วเอง</div>` : ''}
        ${po.status === 'sent' ? `
          <div class="stack" style="gap:8px">
            <button class="btn btn-secondary" data-act="reschedule"><i data-icon="calendar"></i> เลื่อนวันรับของ</button>
            <button class="btn btn-secondary" data-act="line"><i data-icon="file"></i> ดู / คัดลอกข้อความ LINE</button>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="cancel">ยกเลิกใบสั่งซื้อ</button>` : ''}
        ${po.status === 'received' ? '<div class="alert alert-ok small">รับของครบแล้ว ดูรายละเอียดการรับของที่หน้า "รับของ"</div>' : ''}
        ${po.status === 'cancelled' ? '<div class="alert alert-bad small">ใบสั่งซื้อนี้ถูกยกเลิกแล้ว</div>' : ''}
      </div>`;
    $('detail').querySelectorAll('[data-act]').forEach((el) => {
      el.onclick = () => ({
        edit: () => openForm(po), send: () => sendPo(po), line: () => showLineMessage(po),
        cancel: () => cancelPo(po), reschedule: () => reschedulePo(po),
      }[el.dataset.act])();
    });
  }

  /* ---------- ฟอร์มสร้าง / แก้ไข ---------- */
  function openForm(po, { fillNeed = false } = {}) {
    const f = state.form;
    if (!f.suppliers.length) { toast('ยังไม่มีซัพพลายเออร์ เพิ่มที่หน้าซัพพลายเออร์ก่อน', 'warn'); return; }
    // rows: { ingredient_id, qty, unit_price, edited (แก้ราคาเองแล้ว ไม่เปลี่ยนตามร้าน) }
    let rows = po ? po.items.map((it) => ({ ingredient_id: it.ingredient_id, qty: it.qty, unit_price: it.unit_price, edited: true })) : [];
    let supplierId = po ? po.supplier_id : (f.suppliers[0] && f.suppliers[0].id);
    const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    let expected = po ? (po.expected_date || '') : addDays(f.today, (supplierOf(supplierId) || {}).lead_time_days || 1);

    const m = openModal({
      title: po ? `แก้ไขใบสั่งซื้อ ${fmt.esc(po.po_no)}` : 'สร้างใบสั่งซื้อ',
      size: 'lg',
      body: '<div id="poForm"></div>',
      footer: `<button class="btn btn-secondary" data-close>ยกเลิก</button>
               <button class="btn btn-secondary" data-save="draft">บันทึกร่าง</button>
               <button class="btn" data-save="send">บันทึกและส่ง</button>`,
    });
    // ฟอร์มนี้มีตาราง 6 คอลัมน์ ขยาย modal ให้กว้างกว่า lg (จอเล็กยังเต็มจอตาม max-width)
    const modalBox = m.el.querySelector('.modal') || m.el;
    modalBox.style.width = '800px';
    const box = m.el.querySelector('#poForm');

    function fillNeedRows() {
      const need = f.ingredients.filter((i) => i.need_order && !rows.some((r) => r.ingredient_id === i.id));
      need.forEach((i) => rows.push({ ingredient_id: i.id, qty: suggestQty(i), unit_price: priceOf(supplierId, i.id) ?? '', edited: false }));
      return need.length;
    }
    if (fillNeed) fillNeedRows();
    if (!rows.length) rows.push({ ingredient_id: '', qty: '', unit_price: '', edited: false });

    const lineTotal = (r) => (Number(r.qty) > 0 && r.unit_price !== '' ? Math.round(Number(r.qty) * Number(r.unit_price) * 100) / 100 : 0);

    function hint(r) {
      if (!r.ingredient_id) return '';
      const own = priceOf(supplierId, r.ingredient_id);
      const best = cheapest(r.ingredient_id);
      const ing = ingredientOf(r.ingredient_id);
      const parts = [];
      if (ing) parts.push(`คงเหลือ ${num(ing.qty_on_hand)} ${fmt.esc(ing.unit)}${ing.need_order ? ' <span class="text-red">· ต้องสั่ง</span>' : ''}`);
      parts.push(own === null ? '<span class="text-red">ร้านนี้ยังไม่มีราคา</span>' : `ราคาร้านนี้ ${fmt.baht(own)}`);
      if (best && best.supplier_id !== Number(supplierId)) parts.push(`ถูกสุด: ${fmt.esc(best.name)} ${fmt.baht(best.price)}`);
      else if (best) parts.push('<span style="color:var(--ok)">ร้านนี้ถูกที่สุด</span>');
      return parts.join(' · ');
    }

    function draw() {
      const sup = supplierOf(supplierId) || {};
      const used = new Set(rows.map((r) => Number(r.ingredient_id)).filter(Boolean));
      const valid = rows.filter((r) => r.ingredient_id && Number(r.qty) > 0);
      const total = rows.reduce((a, r) => a + lineTotal(r), 0);
      box.innerHTML = `
        <div class="grid grid-2" style="gap:12px">
          <div class="field" style="margin:0">
            <label for="poSupplier">ซัพพลายเออร์</label>
            <select class="select" id="poSupplier">${f.suppliers.map((s) =>
              `<option value="${s.id}" ${s.id === Number(supplierId) ? 'selected' : ''}>${fmt.esc(s.name)} · ส่งภายใน ${s.lead_time_days} วัน</option>`).join('')}</select>
            <div class="caption muted">${sup.line_id ? 'LINE ' + fmt.esc(sup.line_id) : ''}${sup.contact_name ? ' · ' + fmt.esc(sup.contact_name) : ''}</div>
          </div>
          <div class="field" style="margin:0">
            <label for="poExpected">ต้องการรับของวันที่</label>
            <input class="input" type="date" id="poExpected" min="${f.today}" value="${fmt.esc(expected)}">
          </div>
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table class="table">
            <thead><tr><th class="num">#</th><th style="min-width:220px">วัตถุดิบ</th><th style="min-width:140px">จำนวน</th><th style="min-width:110px">ราคา / หน่วย</th><th class="num" style="white-space:nowrap">รวม</th><th></th></tr></thead>
            <tbody>${rows.map((r, i) => {
              const ing = ingredientOf(r.ingredient_id);
              return `
              <tr>
                <td class="num muted">${i + 1}</td>
                <td>
                  <select class="select" style="width:100%" data-row="${i}" data-field="ingredient_id">
                    <option value="">เลือกวัตถุดิบ</option>
                    ${f.ingredients.map((g) => `<option value="${g.id}" ${g.id === Number(r.ingredient_id) ? 'selected' : ''}
                      ${used.has(g.id) && g.id !== Number(r.ingredient_id) ? 'disabled' : ''}>${fmt.esc(g.name)}${g.need_order ? ' (ต้องสั่ง)' : ''}</option>`).join('')}
                  </select>
                  <div class="caption muted" style="margin-top:4px">${hint(r)}</div>
                </td>
                <td><div class="row" style="gap:6px;flex-wrap:nowrap">
                  <input class="input" style="width:90px;flex:none" type="number" min="0.01" step="0.01" inputmode="decimal" data-row="${i}" data-field="qty" value="${fmt.esc(r.qty)}">
                  <span class="small muted">${ing ? fmt.esc(ing.unit) : ''}</span></div></td>
                <td><input class="input" style="width:100px" type="number" min="0" step="0.01" inputmode="decimal" data-row="${i}" data-field="unit_price" value="${fmt.esc(r.unit_price)}"></td>
                <td class="num" style="white-space:nowrap">${fmt.baht(lineTotal(r))}</td>
                <td><button class="btn btn-ghost btn-icon btn-sm" data-remove="${i}" aria-label="ลบรายการ"><i data-icon="trash"></i></button></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn btn-secondary btn-sm" id="poAddRow">+ เพิ่มรายการ</button>
          ${f.ingredients.some((i) => i.need_order) ? '<button class="btn btn-secondary btn-sm" id="poFillNeed"><i data-icon="alert"></i> เติมวัตถุดิบที่ต้องสั่ง</button>' : ''}
        </div>
        <div class="row-between" style="margin-top:12px">
          <span class="muted">รวม ${fmt.num(valid.length)} รายการ</span>
          <span class="h3" style="margin:0">ยอดรวม ${fmt.baht(total)}</span>
        </div>
        <div class="field" style="margin:12px 0 0">
          <label for="poNote">หมายเหตุถึงร้านค้า (ถ้ามี)</label>
          <textarea class="textarea" id="poNote" maxlength="255" rows="2" placeholder="เช่น ขอกุ้งไซซ์ใหญ่ · ส่งก่อน 9 โมง">${fmt.esc(m.note || '')}</textarea>
        </div>`;

      box.querySelector('#poSupplier').onchange = (e) => {
        supplierId = Number(e.target.value);
        // ราคาที่ยังไม่ได้แก้เอง เปลี่ยนตามร้านใหม่
        rows.forEach((r) => { if (!r.edited && r.ingredient_id) r.unit_price = priceOf(supplierId, r.ingredient_id) ?? ''; });
        if (!po) expected = addDays(f.today, (supplierOf(supplierId) || {}).lead_time_days || 1);
        draw();
      };
      box.querySelector('#poExpected').onchange = (e) => { expected = e.target.value; };
      box.querySelector('#poNote').oninput = (e) => { m.note = e.target.value; };
      box.querySelectorAll('[data-field]').forEach((el) => {
        const r = rows[Number(el.dataset.row)];
        const field = el.dataset.field;
        el.onchange = () => {
          if (field === 'ingredient_id') {
            r.ingredient_id = el.value ? Number(el.value) : '';
            r.edited = false;
            r.unit_price = r.ingredient_id ? (priceOf(supplierId, r.ingredient_id) ?? '') : '';
            const ing = ingredientOf(r.ingredient_id);
            if (ing && !r.qty) r.qty = ing.need_order ? suggestQty(ing) : '';
          } else {
            r[field] = el.value;
            if (field === 'unit_price') r.edited = true;
          }
          draw();
        };
      });
      box.querySelectorAll('[data-remove]').forEach((el) => {
        el.onclick = () => {
          rows.splice(Number(el.dataset.remove), 1);
          if (!rows.length) rows.push({ ingredient_id: '', qty: '', unit_price: '', edited: false });
          draw();
        };
      });
      box.querySelector('#poAddRow').onclick = () => { rows.push({ ingredient_id: '', qty: '', unit_price: '', edited: false }); draw(); };
      const fillBtn = box.querySelector('#poFillNeed');
      if (fillBtn) fillBtn.onclick = () => {
        rows = rows.filter((r) => r.ingredient_id);
        const n = fillNeedRows();
        if (!rows.length) rows.push({ ingredient_id: '', qty: '', unit_price: '', edited: false });
        toast(n ? `เพิ่มวัตถุดิบที่ต้องสั่ง ${n} รายการ` : 'วัตถุดิบที่ต้องสั่งอยู่ในรายการครบแล้ว', n ? 'ok' : 'warn');
        draw();
      };
    }
    m.note = po ? (po.note || '') : '';
    draw();

    /** ตรวจฝั่งหน้าเว็บก่อนส่ง (server ตรวจซ้ำทุกข้อ) */
    function collect() {
      const filled = rows.filter((r) => r.ingredient_id || r.qty || r.unit_price !== '');
      if (!filled.length) return { error: 'เพิ่มวัตถุดิบอย่างน้อย 1 รายการ' };
      for (const [i, r] of filled.entries()) {
        if (!r.ingredient_id) return { error: `รายการที่ ${i + 1}: เลือกวัตถุดิบ` };
        if (!(Number(r.qty) > 0)) return { error: `รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0` };
        if (r.unit_price === '' || Number(r.unit_price) < 0) return { error: `รายการที่ ${i + 1}: ใส่ราคาต่อหน่วย` };
      }
      return {
        body: {
          supplier_id: supplierId, expected_date: expected || null, note: m.note || '',
          items: filled.map((r) => ({ ingredient_id: Number(r.ingredient_id), qty: Number(r.qty), unit_price: Number(r.unit_price) })),
        },
      };
    }

    m.el.querySelectorAll('[data-save]').forEach((btn) => {
      btn.onclick = async () => {
        const c = collect();
        if (c.error) { toast(c.error, 'warn'); return; }
        const andSend = btn.dataset.save === 'send';
        m.el.querySelectorAll('[data-save]').forEach((b) => { b.disabled = true; });
        const saved = await run(() => api.post('purchase_orders', po ? { action: 'update', id: po.id, ...c.body } : { action: 'create', ...c.body }));
        m.el.querySelectorAll('[data-save]').forEach((b) => { b.disabled = false; });
        if (!saved) return;
        m.close();
        await refresh(saved.id);
        if (andSend) sendPo(await api.get('purchase_orders', { id: saved.id }));
      };
    });
  }

  /* ---------- ส่ง / ยกเลิก / ข้อความ LINE ---------- */
  /**
   * ส่งใบสั่งซื้อ 2 ขั้น: 1) คัดลอกข้อความไปส่ง LINE (ใบยังเป็นร่าง) 2) กด "ส่งให้ร้านค้าแล้ว" → สถานะส่งแล้ว
   * ปิดหน้าต่างก่อนยืนยัน (ไลน์ล่ม / ยังไม่ได้ส่ง) → ใบยังเป็นร่าง ค้างในแท็บร่าง กลับมาส่งใหม่ได้
   */
  function sendPo(po) {
    showLineMessage(po, { confirmSend: true });
  }

  /** หน้าต่างข้อความ LINE · confirmSend = มีปุ่มยืนยันว่าส่งแล้ว (ใบร่าง) · ไม่มี = ดู/คัดลอกส่งซ้ำ (ใบส่งแล้ว) */
  function showLineMessage(po, { confirmSend = false } = {}) {
    const m = openModal({
      title: `${confirmSend ? 'ส่งใบสั่งซื้อ' : 'ข้อความ LINE'} · ${fmt.esc(po.po_no)}`,
      body: `
        ${confirmSend ? `
          <div class="small" style="margin-bottom:8px">
            <b>1.</b> กด "คัดลอกข้อความ" แล้วไปวางในแชต LINE ของ <b>${fmt.esc(po.supplier_name)}</b>${po.line_id ? ` (LINE ${fmt.esc(po.line_id)})` : ''}<br>
            <b>2.</b> ส่งเสร็จแล้ว กลับมากด <b>"ส่งให้ร้านค้าแล้ว"</b></div>
          <div class="caption muted" style="margin-bottom:8px">ยังไม่ได้ส่ง (ไลน์ล่ม / ยังไม่ว่าง) ปิดหน้าต่างได้เลย ใบนี้ยังเป็นร่างอยู่ในแท็บ "ร่าง"</div>`
        : `<p class="small muted" style="margin-top:0">คัดลอกข้อความไปวางในแชต LINE ของร้านค้า${po.line_id ? ` (LINE ${fmt.esc(po.line_id)})` : ''} ส่งซ้ำได้ถ้าร้านค้ายังไม่ได้รับ</p>`}
        <textarea class="textarea" id="lineText" rows="10" readonly style="width:100%;font-family:inherit">${fmt.esc(po.line_message || '')}</textarea>`,
      footer: `<button class="btn btn-secondary" data-close>${confirmSend ? 'ยังไม่ส่ง' : 'ปิด'}</button>
               <button class="btn ${confirmSend ? 'btn-secondary' : ''}" data-copy><i data-icon="file"></i> คัดลอกข้อความ</button>
               ${confirmSend ? '<button class="btn" data-sent><i data-icon="check"></i> ส่งให้ร้านค้าแล้ว</button>' : ''}`,
      size: confirmSend ? 'lg' : '',
    });
    // ปุ่ม 3 ปุ่มยาว · จอแคบให้ขึ้นบรรทัดใหม่แทนล้นขอบ
    const foot = m.el.querySelector('.modal-foot');
    if (foot) foot.style.flexWrap = 'wrap';
    m.el.querySelector('[data-copy]').onclick = async () => {
      const text = m.el.querySelector('#lineText');
      try { await navigator.clipboard.writeText(text.value); }
      catch { text.select(); document.execCommand('copy'); } // เบราว์เซอร์ที่ไม่ให้ใช้ clipboard API
      toast('คัดลอกข้อความแล้ว วางในแชต LINE ได้เลย');
    };
    const sentBtn = m.el.querySelector('[data-sent]');
    if (sentBtn) sentBtn.onclick = async () => {
      sentBtn.disabled = true;
      const done = await run(() => api.post('purchase_orders', { action: 'send', id: po.id }));
      if (!done) { sentBtn.disabled = false; return; }
      m.close();
      refresh(po.id);
    };
  }

  function cancelPo(po) {
    const m = openModal({
      title: `ยกเลิกใบสั่งซื้อ ${fmt.esc(po.po_no)}`,
      body: `
        <p class="small">${po.status === 'sent' ? 'ใบนี้ส่งร้านค้าไปแล้ว ยกเลิกแล้วต้องแจ้งร้านค้าทาง LINE ด้วย' : 'ยกเลิกร่างใบสั่งซื้อนี้'}</p>
        <div class="field" style="margin:0"><label for="cancelReason">เหตุผล (ถ้ามี)</label>
          <textarea class="textarea" id="cancelReason" rows="2" maxlength="255" placeholder="เช่น สั่งผิดร้าน · ร้านค้าไม่มีของ"></textarea></div>`,
      footer: `<button class="btn btn-secondary" data-close>ไม่ยกเลิก</button>
               <button class="btn btn-danger" data-ok>ยกเลิกใบสั่งซื้อ</button>`,
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const done = await run(() => api.post('purchase_orders', { action: 'cancel', id: po.id, reason: m.el.querySelector('#cancelReason').value }));
      if (!done) return;
      m.close();
      refresh(po.id);
    };
  }

  /* เลื่อนวันรับของ (ใบที่ส่งแล้ว) · เปลี่ยนได้แค่วัน รายการ/ราคาเหมือนเดิม */
  function reschedulePo(po) {
    const t = state.form.today;
    const m = openModal({
      title: `เลื่อนวันรับของ · ${fmt.esc(po.po_no)}`,
      body: `
        <p class="small">วันรับของเดิม <b>${po.expected_date ? fmt.date(po.expected_date) : '-'}</b>
          ${po.overdue ? `<span class="badge badge-bad">เลยกำหนด ${po.overdue_days} วัน</span>` : ''}<br>
          <span class="muted">เปลี่ยนได้แค่วันรับของ รายการและราคาเหมือนเดิม</span></p>
        <div class="field"><label for="newDate">วันรับของใหม่</label>
          <input class="input" type="date" id="newDate" min="${t}" value="${fmt.esc(po.expected_date && po.expected_date >= t ? po.expected_date : t)}"></div>
        <div class="field" style="margin:0"><label for="rsReason">เหตุผล</label>
          <textarea class="textarea" id="rsReason" rows="2" maxlength="255" placeholder="เช่น ร้านแจ้งว่าของหมด ส่งพรุ่งนี้"></textarea></div>`,
      footer: `<button class="btn btn-secondary" data-close>ปิด</button>
               <button class="btn" data-ok>บันทึกวันใหม่</button>`,
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const done = await run(() => api.post('purchase_orders', {
        action: 'reschedule', id: po.id,
        expected_date: m.el.querySelector('#newDate').value,
        reason: m.el.querySelector('#rsReason').value,
      }));
      if (!done) return;
      m.close();
      refresh(po.id);
    };
  }

  async function refresh(id) {
    await loadFormData();
    await loadList();
    if (id) showDetail(id);
  }

  let timer;
  $('search').oninput = () => { clearTimeout(timer); timer = setTimeout(loadList, 300); };
  $('addBtn').onclick = () => openForm(null);
  try { await loadFormData(); } catch (e) { toast(e.message, 'error'); return; }
  await loadList();
  if (qs('id')) showDetail(Number(qs('id')));
})();
