/* =========================================================
   stock.js — ปรับสต็อกวัตถุดิบ (คนที่ 4 · เฟส 4) · หน้า public/admin/stock.html
   - แท็บ นับปลายวัน: ตารางกรอกจำนวนนับได้ (พร้อมหน่วย) + ส่วนต่างสด → POST /api/stock adjust (items)
   - แท็บ ของเสีย: ฟอร์มบันทึก waste + กราฟแท่งของเสียรายสัปดาห์ (SVG)
   - แท็บ ประวัติ: กรองตามวัตถุดิบ / ประเภท / ช่วงวัน · badge ตามประเภท
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'ปรับสต็อก', roles: ['manager', 'owner'] });
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  const qty = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + qty(Math.abs(n));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
  const TYPE = {
    receive: ['รับของ', 'ok'], use: ['ใช้ไป', 'doing'], waste: ['ของเสีย', 'bad'], adjust: ['ปรับยอด', 'wait'],
  };
  const typeBadge = (t) => `<span class="badge badge-${(TYPE[t] || [t, 'off'])[1]}">${fmt.esc((TYPE[t] || [t])[0])}</span>`;

  let ingredients = [];
  let tab = 'count';
  let weeksData = [];

  /* ---------- แท็บ ---------- */
  function showTab(name) {
    tab = name;
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
    if (name === 'waste') loadWaste();
    if (name === 'history') loadHistory();
  }
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

  async function loadIngredients() {
    try {
      ingredients = await api.get('stock', { action: 'ingredients' });
    } catch (e) {
      const msg = `<div class="alert alert-bad">โหลดวัตถุดิบไม่สำเร็จ (ระบบคลังอาจไม่พร้อมใช้): ${fmt.esc(e.message)}</div>`;
      $('countBody').innerHTML = `<tr><td colspan="5">${msg}</td></tr>`;
      return;
    }
    drawCount();
    const opts = ingredients.map((g) => `<option value="${g.id}">${fmt.esc(g.name)} (${fmt.esc(g.unit)})</option>`).join('');
    const keepW = $('wIng').value;
    $('wIng').innerHTML = '<option value="">— เลือกวัตถุดิบ —</option>' + opts;
    $('wIng').value = keepW;
    const keepH = $('hIng').value;
    $('hIng').innerHTML = '<option value="">ทุกวัตถุดิบ</option>' + opts;
    $('hIng').value = keepH;
    wasteHint();
  }

  /* ---------- นับปลายวัน ---------- */
  function drawCount() {
    $('countBody').innerHTML = ingredients.length ? ingredients.map((g) => `
      <tr data-id="${g.id}">
        <td class="bold">${fmt.esc(g.name)} ${g.is_low ? badge('low') : ''}
          <div class="caption muted">จุดสั่งซื้อซ้ำ ${qty(g.reorder_point)} ${fmt.esc(g.unit)}</div></td>
        <td class="num">${qty(g.qty_on_hand)} ${fmt.esc(g.unit)}</td>
        <td class="num"><div class="row" style="justify-content:flex-end">
          <input class="input" data-count type="number" min="0" step="0.01" style="max-width:120px" placeholder="${qty(g.qty_on_hand)}">
          <span class="small muted">${fmt.esc(g.unit)}</span></div></td>
        <td class="num" data-diff><span class="muted">–</span></td>
        <td><input class="input" data-note maxlength="255" placeholder="ไม่บังคับ"></td>
      </tr>`).join('')
      : '<tr><td colspan="5"><div class="empty"><div class="empty-icon"><i data-icon="box"></i></div>ยังไม่มีวัตถุดิบ</div></td></tr>';
    $('countBody').querySelectorAll('[data-count]').forEach((inp) => { inp.oninput = updateDiffs; });
    updateDiffs();
  }

  function countLines() {
    return [...$('countBody').querySelectorAll('tr[data-id]')].map((tr) => {
      const g = ingredients.find((x) => x.id === Number(tr.dataset.id));
      const v = tr.querySelector('[data-count]').value;
      return { tr, g, value: v === '' ? null : Number(v), note: tr.querySelector('[data-note]').value.trim() };
    });
  }

  function updateDiffs() {
    let counted = 0;
    let changed = 0;
    for (const l of countLines()) {
      const cell = l.tr.querySelector('[data-diff]');
      if (l.value === null || Number.isNaN(l.value)) { cell.innerHTML = '<span class="muted">–</span>'; continue; }
      counted += 1;
      const d = Math.round((l.value - l.g.qty_on_hand) * 100) / 100;
      if (d) changed += 1;
      const kind = d < 0 ? 'text-red' : d > 0 ? '' : 'muted';
      cell.innerHTML = `<span class="${kind} bold">${signed(d)} ${fmt.esc(l.g.unit)}</span>
        <div class="caption muted">${d < 0 ? 'บันทึกเป็น ใช้ไป' : d > 0 ? 'บันทึกเป็น ปรับยอด' : 'ตรงกับระบบ'}</div>`;
    }
    $('countSummary').textContent = counted ? `นับแล้ว ${counted} จาก ${ingredients.length} รายการ · มีส่วนต่าง ${changed} รายการ` : '';
  }

  $('countSave').onclick = async () => {
    const lines = countLines().filter((l) => l.value !== null && !Number.isNaN(l.value));
    if (!lines.length) { toast('ยังไม่ได้กรอกจำนวนที่นับได้', 'error'); return; }
    if (lines.some((l) => l.value < 0)) { toast('จำนวนที่นับได้ต้องไม่ติดลบ', 'error'); return; }
    const review = lines.map((l, i) => {
      const d = Math.round((l.value - l.g.qty_on_hand) * 100) / 100;
      return `<div class="row-between small"><span>${i + 1}. ${fmt.esc(l.g.name)}</span>
        <span>${qty(l.value)} ${fmt.esc(l.g.unit)} (${signed(d)})</span></div>`;
    }).join('');
    if (!(await confirmModal(`${review}<div class="caption muted">รวม ${lines.length} รายการ</div>`, 'บันทึกการนับ'))) return;
    $('countSave').disabled = true;
    const res = await run(() => api.post('stock', {
      action: 'adjust',
      items: lines.map((l) => ({ ingredient_id: l.g.id, counted_qty: l.value, note: l.note || undefined })),
    }));
    $('countSave').disabled = false;
    if (res) loadIngredients();
  };

  /* ---------- ของเสีย ---------- */
  function wasteHint() {
    const g = ingredients.find((x) => x.id === Number($('wIng').value));
    $('wUnit').textContent = g ? `(${g.unit})` : '';
    $('wLeft').textContent = g ? `คงเหลือในระบบ ${qty(g.qty_on_hand)} ${g.unit}` : '';
  }
  $('wIng').onchange = wasteHint;

  $('wasteForm').onsubmit = async (e) => {
    e.preventDefault();
    const g = ingredients.find((x) => x.id === Number($('wIng').value));
    const n = Number($('wQty').value);
    const note = $('wNote').value.trim();
    if (!g) { toast('กรุณาเลือกวัตถุดิบ', 'error'); return; }
    if (!(n > 0)) { toast('จำนวนต้องมากกว่า 0', 'error'); return; }
    if (n > g.qty_on_hand) { toast(`ของเสียมากกว่าคงเหลือในระบบ (${qty(g.qty_on_hand)} ${g.unit})`, 'error'); return; }
    if (!note) { toast('กรุณาใส่สาเหตุ', 'error'); return; }
    if (!(await confirmModal(`บันทึกของเสีย ${fmt.esc(g.name)} ${qty(n)} ${fmt.esc(g.unit)} · ${fmt.esc(note)}?`, 'บันทึก', true))) return;
    $('wSave').disabled = true;
    const res = await run(() => api.post('stock', { action: 'adjust', ingredient_id: g.id, movement_type: 'waste', qty: n, note }));
    $('wSave').disabled = false;
    if (!res) return;
    $('wQty').value = '';
    $('wNote').value = '';
    await loadIngredients();
    loadWaste();
  };

  async function loadWaste() {
    try {
      const data = await api.get('stock', { action: 'waste_weekly', weeks: $('wWeeks').value });
      weeksData = data.weeks;
      drawChart();
    } catch (e) {
      $('wasteChart').innerHTML = `<div class="alert alert-bad small">โหลดกราฟไม่สำเร็จ: ${fmt.esc(e.message)}</div>`;
    }
  }
  $('wWeeks').onchange = loadWaste;

  /** กราฟแท่งตั้ง: มูลค่าของเสียต่อสัปดาห์ (บาท) */
  function drawChart() {
    const box = $('wasteChart');
    const W = Math.max(box.clientWidth, 280);
    const H = 220;
    const pad = { l: 56, r: 8, t: 16, b: 40 };
    const max = Math.max(...weeksData.map((w) => w.total_value), 0);
    if (!weeksData.length) { box.innerHTML = '<div class="empty small">ไม่มีข้อมูล</div>'; return; }
    const top = max > 0 ? Math.ceil(max / 100) * 100 : 100;
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const step = plotW / weeksData.length;
    const barW = Math.min(36, step * 0.6);
    const y = (v) => pad.t + plotH - (v / top) * plotH;
    const color = { bar: css('bad') || '#c0392b', grid: css('cream-300') || '#e8dcc8', ink: css('brown-500') || '#8a7a6a' };
    const label = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

    const grid = [0, 0.5, 1].map((f) => {
      const v = top * f;
      return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${color.grid}"/>
        <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" fill="${color.ink}" font-size="12">${qty(v)}</text>`;
    }).join('');
    const bars = weeksData.map((w, i) => {
      const x = pad.l + step * i + (step - barW) / 2;
      const h = Math.max(w.total_value > 0 ? 2 : 0, (w.total_value / top) * plotH);
      return `<g data-week="${i}" style="cursor:pointer">
        <rect x="${pad.l + step * i}" y="${pad.t}" width="${step}" height="${plotH}" fill="transparent"/>
        <rect x="${x}" y="${pad.t + plotH - h}" width="${barW}" height="${h}" rx="4" fill="${color.bar}"/>
        <text x="${x + barW / 2}" y="${H - pad.b + 16}" text-anchor="middle" fill="${color.ink}" font-size="12">${label(w.week_start)}</text>
        <title>${label(w.week_start)}–${label(w.week_end)}: ${qty(w.total_value)} บาท</title>
      </g>`;
    }).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="มูลค่าของเสียรายสัปดาห์">
      ${grid}${bars}
      <text x="${pad.l}" y="${H - 6}" fill="${color.ink}" font-size="12">สัปดาห์ที่เริ่ม (จันทร์) · หน่วย: บาท</text></svg>`;
    box.querySelectorAll('[data-week]').forEach((g) => { g.onclick = () => showWeek(Number(g.dataset.week)); });
    showWeek(weeksData.length - 1);
  }

  function showWeek(i) {
    const w = weeksData[i];
    if (!w) return;
    const d = (s) => fmt.date(s);
    $('wasteDetail').innerHTML = `<div class="bold" style="margin-top:8px">${d(w.week_start)} – ${d(w.week_end)} · ${fmt.baht(w.total_value)}</div>
      ${w.items.length ? w.items.map((it, k) => `<div class="row-between"><span>${k + 1}. ${fmt.esc(it.name)} ${qty(it.qty)} ${fmt.esc(it.unit)}</span>
        <span class="muted">${fmt.baht(it.value)}</span></div>`).join('') : '<div class="muted">ไม่มีของเสียในสัปดาห์นี้</div>'}`;
  }

  /* ---------- ประวัติ ---------- */
  async function loadHistory() {
    const from = $('hFrom').value;
    const to = $('hTo').value;
    if (from && to && from > to) { toast('วันเริ่มต้องไม่หลังวันสิ้นสุด', 'error'); return; }
    $('histBody').innerHTML = '<tr><td colspan="6" class="loading">กำลังโหลด...</td></tr>';
    try {
      const rows = await api.get('stock', { ingredient_id: $('hIng').value, movement_type: $('hType').value, from, to });
      $('histBody').innerHTML = rows.length ? rows.map((r) => `<tr>
          <td>${fmt.datetime(r.created_at)}</td>
          <td>${fmt.esc(r.ingredient_name)}</td>
          <td>${typeBadge(r.movement_type)}</td>
          <td class="num ${r.qty < 0 ? 'text-red' : ''}">${signed(r.qty)} ${fmt.esc(r.unit)}</td>
          <td class="small">${fmt.esc(r.note || '')}${r.expiry_date ? `<div class="caption muted">หมดอายุ ${fmt.date(r.expiry_date)}</div>` : ''}</td>
          <td class="small">${fmt.esc(r.created_by_name || '-')}</td>
        </tr>`).join('')
        : '<tr><td colspan="6"><div class="empty"><div class="empty-icon"><i data-icon="clipboard"></i></div>ไม่มีความเคลื่อนไหวในช่วงนี้</div></td></tr>';
    } catch (e) {
      $('histBody').innerHTML = `<tr><td colspan="6"><div class="alert alert-bad">โหลดประวัติไม่สำเร็จ: ${fmt.esc(e.message)}</div></td></tr>`;
    }
  }
  $('hSearch').onclick = loadHistory;

  $('refreshBtn').onclick = async () => {
    await loadIngredients();
    if (tab === 'waste') loadWaste();
    if (tab === 'history') loadHistory();
  };
  window.addEventListener('resize', () => { if (tab === 'waste' && weeksData.length) drawChart(); });

  loadIngredients();
})();
