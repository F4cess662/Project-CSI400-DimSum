/* =========================================================
   dashboard.js — หน้า Dashboard ผู้จัดการ/เจ้าของร้าน (FR-47)
   เรียก GET /api/dashboard ซ้ำทุก 10 วินาที แล้ววาดกราฟเป็น SVG เอง (ไม่ใช้ไลบรารี)
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'Dashboard', roles: ['manager', 'owner'] });
  if (!me) return;
  if (me.role_code === 'owner') document.getElementById('usersLink').classList.remove('hidden');

  const $ = (id) => document.getElementById(id);
  const esc = fmt.esc;

  /* ---------- สีจาก CSS variable ใน style.css ---------- */
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
  const COLOR = {
    ok: css('ok'), bad: css('bad'), wait: css('wait'),
    ink: css('brown-900'), muted: css('brown-500'), grid: css('cream-300'), track: css('cream-200'), white: css('white'),
    surface: css('cream-50'),
  };
  // สถานะ "ไม่ว่าง/หมด" ใช้ลายเส้นทแยงซ้อนบนสีแดง คนตาบอดสีแดง-เขียวจะแยกจากสีเขียวได้
  const SERIES = {
    free:      { name: 'ว่าง',      color: COLOR.ok },
    busy:      { name: 'มีลูกค้า',   color: COLOR.bad, hatch: true },
    available: { name: 'พร้อมขาย',  color: COLOR.ok },
    low:       { name: 'ใกล้หมด',   color: COLOR.wait },
    soldout:   { name: 'หมด',       color: COLOR.bad, hatch: true },
    track:     { name: '',          color: COLOR.track },      // ส่วนว่างของแถบเล็ก (ไม่อยู่ใน legend)
  };
  const ZONE_LABEL = { bar: 'บาร์', small: 'โต๊ะ 2–4 คน', large: 'โต๊ะ 5–8 คน', vip: 'ห้อง VIP' };

  /* ---------- ชิ้นส่วน SVG ที่ใช้ร่วมกัน ---------- */
  const hatchDef = (id, color) => `
    <pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="${color}"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="${COLOR.white}" stroke-width="2" stroke-opacity=".5"/>
    </pattern>`;
  const paint = (s, chartId) => (s.hatch ? `url(#hatch-${chartId})` : s.color);
  // วาด SVG ตามความกว้างจริงของการ์ด (viewBox = พิกเซลจริง) ตัวหนังสือจึงไม่ถูกยืด/หดตามการ์ด
  const FONT = 14;
  const widthOf = (id) => Math.max($(id).clientWidth, 260);
  const svgOpen = (w, h, label) =>
    `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${esc(label)}" font-size="${FONT}">`;

  /** สี่เหลี่ยมที่มนเฉพาะด้านปลาย (ขวาสำหรับแท่งนอน / บนสำหรับแท่งตั้ง) ด้านฐานตรง */
  function endRoundedRect(x, y, w, h, r, dir) {
    r = Math.min(r, dir === 'right' ? w : h, dir === 'right' ? h / 2 : w / 2);
    if (dir === 'right') {
      return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    }
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /** คำอธิบายสี (legend) แบบ HTML ใช้ class ของ style.css */
  function legend(keys, chartId) {
    return `<div class="row small" style="margin-bottom:8px">${keys.map((k) => {
      const s = SERIES[k];
      const pid = `hatch-${chartId}-lg-${k}`;
      return `<span class="row" style="gap:6px"><svg width="12" height="12" aria-hidden="true">
          ${s.hatch ? `<defs>${hatchDef(pid, s.color)}</defs>` : ''}
          <rect width="12" height="12" rx="3" fill="${s.hatch ? `url(#${pid})` : s.color}"/></svg>${s.name}</span>`;
    }).join('')}</div>`;
  }

  /* ---------- กราฟโดนัท: โต๊ะว่าง / มีลูกค้า ---------- */
  function donutChart(busy, total) {
    if (!total) return `<div class="empty"><div class="empty-icon"><i data-icon="chair"></i></div>ยังไม่มีโต๊ะในระบบ</div>`;
    const free = total - busy;
    const size = 200, cx = 100, cy = 100, r = 72, sw = 22, C = 2 * Math.PI * r;
    const gap = busy && free ? 3 : 0;
    // วงกลมเริ่มที่ 12 นาฬิกา (หมุน -90°) ส่วน "มีลูกค้า" ก่อน แล้วตามด้วย "ว่าง"
    const seg = (len, offset, s, label) => len <= 0 ? '' : `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${paint(s, 'donut')}" stroke-width="${sw}"
        stroke-dasharray="${Math.max(len - gap, 0.1)} ${C}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})"><title>${label}</title></circle>`;
    const busyLen = (busy / total) * C;
    return legend(['busy', 'free'], 'donut') + `
      <div style="max-width:220px;margin:0 auto">${svgOpen(size, size, `โต๊ะมีลูกค้า ${busy} จาก ${total}`)}
        <defs>${hatchDef('hatch-donut', COLOR.bad)}</defs>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLOR.track}" stroke-width="${sw}"/>
        ${seg(busyLen, 0, SERIES.busy, `มีลูกค้า ${busy} โต๊ะ`)}
        ${seg(C - busyLen, busyLen, SERIES.free, `ว่าง ${free} โต๊ะ`)}
        <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="Mitr" font-size="40" fill="${COLOR.ink}">${busy}<tspan font-size="20" fill="${COLOR.muted}">/${total}</tspan></text>
        <text x="${cx}" y="${cy + 30}" text-anchor="middle" fill="${COLOR.muted}">มีลูกค้า · ว่าง ${free}</text>
      </svg></div>`;
  }

  /* ขนาดแท่งนอนที่ใช้ร่วมกันทั้งกราฟโซนและกราฟหมวด ให้สองกราฟหน้าตาสมดุลกัน */
  const HBAR = { labelW: 112, valueW: 64, rowH: 40, barH: 20 };

  /**
   * กราฟหลอด (แท่งนอนเทียบเต็มหลอด): rows = [{ label, value, total, unit }]
   * หลอดเต็ม = value เท่ากับ total · ตัวเลข "value/total" ชิดขวา
   */
  function progressBars(rows, W, ariaLabel) {
    if (!rows.length) return `<div class="empty">ยังไม่มีข้อมูล</div>`;
    const { labelW, valueW, rowH, barH } = HBAR;
    const plotW = W - labelW - valueW, r = barH / 2;
    const body = rows.map((row, i) => {
      const y = i * rowH + (rowH - barH) / 2, ty = y + barH / 2 + 5;
      const w = row.total ? (row.value / row.total) * plotW : 0;
      const tip = `${esc(row.label)} · มีลูกค้า ${row.value} จาก ${row.total} ${row.unit}`;
      return `<g><title>${tip}</title>
        <rect x="0" y="${i * rowH}" width="${W}" height="${rowH}" fill="transparent"/>
        <text x="0" y="${ty}" fill="${COLOR.ink}">${esc(row.label)}</text>
        <rect x="${labelW}" y="${y}" width="${plotW}" height="${barH}" rx="${r}" fill="${COLOR.track}"/>
        ${w > 0 ? `<rect x="${labelW}" y="${y}" width="${Math.max(w, barH)}" height="${barH}" rx="${r}" fill="${COLOR.ok}"/>` : ''}
        <text x="${W}" y="${ty}" text-anchor="end" fill="${COLOR.ink}" font-weight="600">${row.value}/${row.total}</text>
      </g>`;
    }).join('');
    return `<div class="small muted" style="margin-bottom:8px">หลอดเต็ม = โซนนั้นมีลูกค้าครบทุกโต๊ะ</div>` +
      svgOpen(W, rows.length * rowH, ariaLabel) + body + '</svg>';
  }

  /* ---------- การ์ดสถานะเมนูวันนี้ ตามหมวด (ดูอย่างเดียว) ---------- */
  const STATE_SERIES = { ok: 'available', low: 'low', soldout: 'soldout' };
  const expanded = new Set();                      // category_id ที่กางอยู่ (คงไว้ข้ามรอบ poll)

  /** จำนวนพร้อมขายพร้อมหน่วย เช่น "40 เข่ง" · NULL = ไม่จำกัดจำนวน */
  const qtyText = (m) => (m.available_qty === null ? 'ไม่จำกัด' : `${fmt.num(m.available_qty)} ${esc(m.unit)}`);

  /**
   * แถบแนวนอนแบ่งตามสัดส่วน: parts = [{ key: 'available'|'low'|'soldout', n }]
   * ความกว้างเป็น % จึงพอดีการ์ดทุกขนาด · ขอบมนด้วย clipPath · เส้นคั่นสีพื้นการ์ดระหว่างส่วน
   */
  let barSeq = 0;
  function splitBar(parts, height, tip, prefix = 'bar') {
    const id = prefix + (barSeq++);                    // prefix ต่างกันต่อการ์ด กัน id ของ clipPath ซ้ำกัน
    const sum = parts.reduce((s, p) => s + p.n, 0);
    let x = 0;
    const segs = sum ? parts.filter((p) => p.n > 0).map((p) => {
      const w = (p.n / sum) * 100;
      const seg = `<rect x="${x}%" y="0" width="${w}%" height="${height}" fill="${paint(SERIES[p.key], id)}"
        stroke="${COLOR.surface}" stroke-width="2"/>`;
      x += w;
      return seg;
    }).join('') : '';
    return `<svg width="100%" height="${height}" role="img" aria-label="${esc(tip)}" style="margin:8px 0">
      <title>${esc(tip)}</title>
      <defs>${hatchDef('hatch-' + id, COLOR.bad)}<clipPath id="${id}-clip"><rect width="100%" height="${height}" rx="${height / 2}"/></clipPath></defs>
      <g clip-path="url(#${id}-clip)"><rect width="100%" height="${height}" fill="${COLOR.track}"/>${segs}</g>
    </svg>`;
  }

  /** รายการทุกเมนูในหมวด (ตอนกาง): ชื่อ · จำนวน · แถบเล็กเทียบกับเมนูที่เหลือมากสุดในหมวด */
  function menuRows(c) {
    const max = Math.max(1, ...c.menus.map((m) => m.available_qty || 0));
    return `<div class="stack" style="gap:4px;margin-top:8px">${c.menus.map((m) => {
      const n = m.state === 'soldout' ? 0 : m.available_qty === null ? max : m.available_qty;
      const tip = `${m.name} · ${m.state === 'soldout' ? 'หมด' : m.temp_out ? 'หมดชั่วคราว (ยังสั่งได้)' : 'เหลือ ' + (m.available_qty === null ? 'ไม่จำกัด' : m.available_qty + ' ' + m.unit)}`;
      return `<div>
        <div class="row-between small"><span>${esc(m.name)}</span>
          ${m.state === 'soldout' ? badge('soldout') : m.temp_out ? badge('temp_out') : `<span class="bold">${qtyText(m)}</span>`}</div>
        ${splitBar([{ key: STATE_SERIES[m.state], n }, { key: 'track', n: max - n }], 6, tip)}
      </div>`;
    }).join('')}
      <a class="small" href="/admin/stock-today.html">→ ไปหน้าจำนวนพร้อมขาย</a></div>`;
  }

  function categoryCard(c) {
    const soldout = c.menus.filter((m) => m.state === 'soldout');
    const low = c.menus.filter((m) => m.state === 'low');
    const open = expanded.has(c.category_id);
    const tip = `${c.category} · พร้อมขาย ${c.available - c.low} · ใกล้หมด ${c.low} · หมด ${c.soldout}`;
    // สีตัวหนังสือเหลือง/เขียว และขอบแดง ยังไม่มี class ใน style.css (ขอ .text-wait .text-ok .card-bad จากคนที่ 1)
    const lines = !c.total ? `<div class="small muted">ยังไม่มีเมนูในหมวดนี้</div>` : [
      soldout.length ? `<div class="small bold text-red">หมด: ${soldout.map((m) => esc(m.name)).join(', ')}</div>` : '',
      low.length ? `<div class="small bold" style="color:var(--wait)">ใกล้หมด: ${low.map((m) => (m.temp_out ? `${esc(m.name)} หมดชั่วคราว` : `${esc(m.name)} เหลือ ${qtyText(m)}`)).join(', ')}</div>` : '',
      !soldout.length && !low.length ? `<div class="small bold" style="color:var(--ok)">✓ พร้อมขายทุกเมนู</div>` : '',
    ].join('');
    return `<div class="card"${c.soldout ? ' style="border-color:var(--bad)"' : ''}>
      <div class="row-between"><span class="bold">${esc(c.category)}</span><span class="bold">${c.available}/${c.total}</span></div>
      ${splitBar([{ key: 'available', n: c.available - c.low }, { key: 'low', n: c.low }, { key: 'soldout', n: c.soldout }], 12, tip)}
      ${lines}
      ${c.total ? `<button class="btn btn-ghost btn-sm" data-cat="${c.category_id}" style="margin-top:8px">${open ? 'ย่อ ▴' : 'ดูทุกเมนู ▾'}</button>` : ''}
      ${open ? menuRows(c) : ''}
    </div>`;
  }

  function renderMenuStatus(cats) {
    barSeq = 0;
    const total = cats.reduce((s, c) => s + c.total, 0);
    const available = cats.reduce((s, c) => s + c.available, 0);
    const soldout = cats.reduce((s, c) => s + c.soldout, 0);
    const low = cats.reduce((s, c) => s + c.low, 0);
    $('menuSummary').textContent = `พร้อมขาย ${available}/${total} เมนู · หมด ${soldout} · ใกล้หมด ${low}`;
    $('menuLegend').innerHTML = legend(['available', 'low', 'soldout'], 'menuStatus');
    $('menuCategories').innerHTML = cats.length ? cats.map(categoryCard).join('') : `<div class="empty">ยังไม่มีหมวดเมนู</div>`;

    const names = cats.flatMap((c) => c.menus.filter((m) => m.state === 'soldout').map((m) => `${m.name} (${c.category})`));
    $('soldoutAll').textContent = 'เมนูที่หมดตอนนี้: ' + names.join(' · ');
    $('soldoutAll').classList.toggle('hidden', !names.length);
  }

  // กด "ดูทุกเมนู / ย่อ" → จำ category_id แล้ววาดใหม่จากข้อมูลล่าสุด (ไม่ต้องรอ poll)
  $('menuCategories').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    const id = Number(btn.dataset.cat);
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    if (lastData) renderMenuStatus(lastData.menus_by_category);
  });

  /* ---------- กราฟแท่งตั้ง: บิลรายชั่วโมง (เฉพาะชั่วโมงที่ร้านเปิด แยกกะเช้า/เย็น) ---------- */
  const SHIFT_LABEL = { morning: 'กะเช้า', evening: 'กะเย็น' };
  const hh = (h) => String(h).padStart(2, '0') + ':00';

  /** ค่าสูงสุดของแกน y ให้เป็นเลขกลมๆ (1, 2, 2.5, 5 × 10ⁿ) อย่างน้อย 4 */
  const niceMax = (v) => {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  };
  /** เงินแบบสั้นสำหรับแกน/ป้ายกราฟ เช่น 1500 → "1.5k" */
  const shortBaht = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));

  /**
   * กราฟแท่งตั้งรายชั่วโมง ใช้ได้ทั้ง "จำนวนบิล" และ "ยอดขาย"
   * opt: { value(r), axis(v), peak(v), tip(r, range), summary, aria }
   */
  const HOURLY_BILLS = {
    value: (r) => r.count, axis: String, peak: String,
    tip: (r, range) => `${range} · เปิด ${r.count} บิล`,
  };
  const HOURLY_SALES = {
    value: (r) => r.amount, axis: shortBaht, peak: shortBaht,
    tip: (r, range) => `${range} · ${fmt.baht(r.amount)} · ${r.bills} บิล`,
  };

  function hourlyBars(rows, W, opt = HOURLY_BILLS) {
    if (!rows.length) return `<div class="empty">ยังไม่มีข้อมูล</div>`;
    const shifts = [...new Set(rows.map((r) => r.shift))];
    const H = 240, left = opt === HOURLY_SALES ? 44 : 28, top = 26, gapW = 24;
    const plotW = W - left - gapW * (shifts.length - 1);
    const band = plotW / rows.length;
    const oneLine = band >= 96;                                    // แคบ → แสดงช่วงเวลา 2 บรรทัด
    const bottom = oneLine ? 26 : 44, plotH = H - top - bottom;
    const barW = Math.min(band * 0.55, 40);
    const maxVal = Math.max(...rows.map(opt.value));
    const yMax = niceMax(maxVal);
    const yOf = (v) => top + plotH - (v / yMax) * plotH;
    const grid = [0, yMax / 2, yMax].map((v) => `
      <line x1="${left}" x2="${W}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="${COLOR.grid}" stroke-width="1"/>
      <text x="${left - 8}" y="${yOf(v) + 5}" text-anchor="end" fill="${COLOR.muted}">${opt.axis(v)}</text>`).join('');
    const peak = rows.findIndex((r) => opt.value(r) === maxVal && maxVal > 0);

    let x = left, prevShift = null, extras = '';
    const bars = rows.map((r, i) => {
      if (r.shift !== prevShift) {
        if (prevShift) {                                           // เส้นคั่นช่วงร้านพักระหว่างกะ
          extras += `<line x1="${x + gapW / 2}" x2="${x + gapW / 2}" y1="${top}" y2="${top + plotH}" stroke="${COLOR.grid}" stroke-dasharray="4 4"/>`;
          x += gapW;
        }
        extras += `<text x="${x + 4}" y="${top - 10}" fill="${COLOR.muted}" font-size="12">${SHIFT_LABEL[r.shift] || ''}</text>`;
        prevShift = r.shift;
      }
      const val = opt.value(r);
      const cx = x + band / 2, h = (val / yMax) * plotH;
      const range = `${hh(r.hour)}–${hh(r.hour + 1)}`;
      const tip = opt.tip(r, range);
      const labelY = top + plotH + 20;
      const label = oneLine
        ? `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">${range}</text>`
        : `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">${hh(r.hour)}–<tspan x="${cx}" dy="16">${hh(r.hour + 1)}</tspan></text>`;
      const g = `<g><title>${tip}</title>
        <rect x="${x}" y="${top}" width="${band}" height="${plotH}" fill="transparent"/>
        ${h > 0 ? `<path d="${endRoundedRect(cx - barW / 2, yOf(val), barW, h, 4, 'up')}" fill="${opt === HOURLY_SALES ? COLOR.ok : COLOR.wait}"/>` : ''}
        ${val > 0 && (i === peak || band >= 48) ? `<text x="${cx}" y="${yOf(val) - 6}" text-anchor="middle" fill="${COLOR.ink}" font-size="${i === peak ? FONT : 12}" font-weight="${i === peak ? 700 : 400}">${opt.peak(val)}</text>` : ''}
        ${label}
      </g>`;
      x += band;
      return g;
    }).join('');
    const total = rows.reduce((s, r) => s + opt.value(r), 0);
    const summary = opt === HOURLY_SALES
      ? `ยอดจากบิลที่ชำระวันนี้ ${fmt.baht(total)} (ไม่รวมมัดจำที่ยึด) · นับตามเวลาที่ชำระเงิน · เฉพาะเวลาที่ร้านเปิด`
      : `รวมวันนี้ ${fmt.num(total)} บิล · นับตามเวลาที่เปิดบิล · เฉพาะเวลาที่ร้านเปิด`;
    const aria = opt === HOURLY_SALES ? `ยอดขายวันนี้รายชั่วโมง รวม ${fmt.baht(total)}` : `บิลที่เปิดวันนี้รายชั่วโมง รวม ${total} บิล`;
    return `<div class="small muted" style="margin-bottom:8px">${summary}</div>` +
      svgOpen(W, H, aria) + grid + extras + bars + '</svg>';
  }

  // การ์ดรายชั่วโมง (เฟส 4): แท็บ ยอดขาย / จำนวนบิล · ค่าเริ่มต้น = ยอดขาย
  let hourlyMode = 'sales';
  const hourlyCard = $('chartHours').closest('.card');
  hourlyCard.querySelector('.card-title').textContent = 'รายชั่วโมงวันนี้';
  const hourlyTabs = document.createElement('div');
  hourlyTabs.className = 'tabs';
  hourlyTabs.style.marginBottom = '12px';
  hourlyTabs.innerHTML = `<button class="tab active" data-mode="sales">ยอดขาย</button><button class="tab" data-mode="bills">จำนวนบิล</button>`;
  $('chartHours').before(hourlyTabs);
  hourlyTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    hourlyMode = btn.dataset.mode;
    hourlyTabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    if (lastData) renderHourly(lastData);
  });
  function renderHourly(d) {
    $('chartHours').innerHTML = hourlyMode === 'sales' && d.sales_by_hour
      ? hourlyBars(d.sales_by_hour, widthOf('chartHours'), HOURLY_SALES)
      : hourlyBars(d.bills_by_hour, widthOf('chartHours'), HOURLY_BILLS);
  }

  /* ---------- ห้อง VIP วันนี้ (เฟส 3 + Feedback เฟส 3): ไทม์ไลน์ + โดนัทสถานะ + รายการต้องติดตาม ---------- */
  const VIP_STATUS = ['pending_deposit', 'confirmed', 'arrived', 'released', 'no_show', 'cancelled'];
  const VIP_INACTIVE = ['no_show', 'cancelled'];             // ไม่ได้ใช้ห้องแล้ว → วาดเป็นกรอบเส้นประ
  // สีตามป้ายสถานะมาตรฐานใน api.js (STATUS) จะได้ตรงกับ badge() ทั้งหน้า
  // released ยังไม่มีใน STATUS ของ api.js → ใช้ค่านี้ไปก่อน (ขอคนที่ 1 เพิ่ม released: ['ปล่อยห้องแล้ว', 'off'])
  const VIP_EXTRA = { released: ['ปล่อยห้องแล้ว', 'off'] };
  const statusOf = (st) => STATUS[st] || VIP_EXTRA[st] || [st, 'off'];
  const statusColor = (st) => css(statusOf(st)[1]);
  const statusName = (st) => statusOf(st)[0];
  const hm = (t) => t.slice(0, 5);
  const hourOf = (t) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;
  /** ชั่วโมงทศนิยม → 'HH:MM' เช่น 11.8333 → '11:50' */
  const hmOf = (h) => {
    const m = Math.round(h * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  /** ชื่อแพ็กเกจ · ข้อมูลเก่าที่ไม่มีแพ็กเกจแสดงจำนวนชั่วโมงแทน */
  const packageLabel = (k) => k.package_name || (k.hours ? `${k.hours} ชม.` : 'เหมาวัน');
  const rangeText = (k) => k.segments.map((g) => `${hmOf(g.from)}–${hmOf(g.to)}`).join(', ') || hm(k.start_time);

  // การ์ดนี้สร้างด้วย JS (เฟส 3 แก้ได้เฉพาะไฟล์ JS) วางต่อจากแถวกราฟโต๊ะ
  const vipCard = document.createElement('div');
  vipCard.className = 'card section';
  vipCard.innerHTML = `
    <div class="row-between">
      <h3 class="card-title">ห้อง VIP วันนี้</h3>
      <a class="btn btn-ghost btn-sm" href="/admin/vip.html">จองห้อง VIP →</a>
    </div>
    <div id="vipGantt"><div class="loading">กำลังโหลด...</div></div>
    <div class="grid grid-2" style="margin-top:16px">
      <div><div class="bold" style="margin-bottom:8px">สถานะการจองวันนี้</div><div id="vipDonut"></div></div>
      <div><div class="bold" style="margin-bottom:8px">ต้องติดตาม</div><div id="vipFollow"></div></div>
    </div>`;
  $('chartZones').closest('.grid').after(vipCard);

  /**
   * ไทม์ไลน์ห้อง × ชั่วโมงเปิดร้าน: แท่งตามช่วงใช้ห้องของแพ็กเกจ (จบ :50) สีตามสถานะ · เส้นแดง = ตอนนี้
   * เหมาวัน = 2 แท่ง (กะเช้า + กะเย็น) · released = แท่งถึงเวลาปล่อยห้อง ช่วงที่เหลือว่าง
   * ป้ายบนแท่ง: ชื่อแพ็กเกจ · ชื่อลูกค้า (ตัดตามความกว้างแท่ง)
   */
  function vipGantt(v, W, nowAt) {
    if (!v.rooms.length) return `<div class="empty">ยังไม่มีห้อง VIP ในระบบ</div>`;
    const labelW = 64, top = 22, rowH = 40, barH = 28;
    const span = Math.max(1, v.close_hour - v.open_hour), plotW = W - labelW - 4;
    const xOf = (h) => labelW + ((h - v.open_hour) / span) * plotW;
    const plotH = v.rooms.length * rowH, H = top + plotH + 4;
    const every = plotW / span < 40 ? 2 : 1;                     // จอแคบ: ป้ายเวลาทุก 2 ชั่วโมง

    const closed = v.closed_ranges.map((r) => `
      <rect x="${xOf(r.from)}" y="${top}" width="${xOf(r.to) - xOf(r.from)}" height="${plotH}" fill="${COLOR.track}"/>
      <text x="${(xOf(r.from) + xOf(r.to)) / 2}" y="${top + plotH / 2 + 5}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">ปิดพัก</text>`).join('');
    let grid = '';
    for (let h = v.open_hour; h <= v.close_hour; h++) {
      grid += `<line x1="${xOf(h)}" x2="${xOf(h)}" y1="${top}" y2="${top + plotH}" stroke="${COLOR.grid}"/>`;
      if ((h - v.open_hour) % every === 0) {
        grid += `<text x="${xOf(h)}" y="${top - 8}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">${String(h).padStart(2, '0')}:00</text>`;
      }
    }
    const rows = v.rooms.map((r, i) => `
      <text x="0" y="${top + i * rowH + rowH / 2 + 5}" fill="${COLOR.ink}" font-weight="600">${esc(r.name)}</text>
      <line x1="${labelW}" x2="${W}" y1="${top + (i + 1) * rowH}" y2="${top + (i + 1) * rowH}" stroke="${COLOR.grid}"/>`).join('');

    const rowOf = new Map(v.rooms.map((r, i) => [r.id, i]));
    const bar = (k) => {
      const i = rowOf.get(k.vip_room_id);
      if (i === undefined) return '';
      const y = top + i * rowH + (rowH - barH) / 2, color = statusColor(k.status);
      const inactive = VIP_INACTIVE.includes(k.status);
      const tip = `${k.room_name} · ${packageLabel(k)} · ${rangeText(k)} · ${k.customer_name} ${k.guests} คน · ${statusName(k.status)}`
        + (k.status === 'pending_deposit' ? ` · มัดจำ ${fmt.baht(k.deposit_amount)} ยังไม่รับ` : '')
        + (k.status === 'released' && k.released_at ? ` · ปล่อยห้อง ${fmt.time(k.released_at)}` : '');
      const full = `${packageLabel(k)} · ${k.customer_name}`;
      // ตัดให้อยู่ในช่วงเวลาเปิดร้านของกราฟ (ข้อมูลเก่าอาจจองเลยเวลาปิด)
      const segs = k.segments
        .map((g) => ({ from: Math.max(g.from, v.open_hour), to: Math.min(g.to, v.close_hour) }))
        .filter((g) => g.to > g.from);
      return segs.map((g) => {
        const x = xOf(g.from), w = Math.max(xOf(g.to) - x - 1, 4);
        const chars = Math.floor((w - 12) / 9);
        const label = chars < 3 ? '' : (full.length > chars ? full.slice(0, chars - 1) + '…' : full);
        return `<g><title>${esc(tip)}</title>
          <rect x="${x + 1}" y="${y}" width="${w}" height="${barH}" rx="6"
            fill="${inactive ? 'none' : color}" stroke="${color}" stroke-width="${inactive ? 1.5 : 0}" ${inactive ? 'stroke-dasharray="4 3"' : ''}/>
          ${label ? `<text x="${x + 8}" y="${y + barH / 2 + 5}" fill="${inactive ? color : COLOR.white}" font-size="13">${esc(label)}</text>` : ''}
        </g>`;
      }).join('');
    };
    // การจองที่ไม่ใช้ห้องแล้ววาดก่อน (อยู่ด้านหลัง) เผื่อมีการจองใหม่ทับช่วงเวลาเดิม
    const bars = [...v.bookings.filter((k) => VIP_INACTIVE.includes(k.status)), ...v.bookings.filter((k) => !VIP_INACTIVE.includes(k.status))]
      .map(bar).join('');

    const nowH = hourOf(nowAt.slice(11, 16));
    const now = nowH >= v.open_hour && nowH <= v.close_hour ? `
      <line x1="${xOf(nowH)}" x2="${xOf(nowH)}" y1="${top - 4}" y2="${top + plotH}" stroke="${COLOR.bad}" stroke-width="2"/>
      <text x="${xOf(nowH) + 4}" y="${top + plotH - 4}" fill="${COLOR.bad}" font-size="12" font-weight="600">ตอนนี้</text>` : '';
    return svgOpen(W, H, `ไทม์ไลน์ห้อง VIP วันนี้ ${v.bookings.length} การจอง`) + closed + grid + rows + bars + now + '</svg>'
      + (v.bookings.length ? '' : `<div class="small muted" style="margin-top:8px">วันนี้ยังไม่มีการจองห้อง VIP</div>`);
  }

  /** โดนัทจำนวนการจองแยกสถานะ + คำอธิบายพร้อมตัวเลข (ไม่ต้องอาศัยสีอย่างเดียว) */
  function vipDonut(byStatus) {
    const total = VIP_STATUS.reduce((s, st) => s + (byStatus[st] || 0), 0);
    if (!total) return `<div class="empty" style="padding:16px">ยังไม่มีการจองวันนี้</div>`;
    const size = 150, c = size / 2, r = 54, sw = 18, C = 2 * Math.PI * r;
    const parts = VIP_STATUS.filter((st) => byStatus[st] > 0);
    const gap = parts.length > 1 ? 3 : 0;
    let offset = 0;
    const segs = parts.map((st) => {
      const len = (byStatus[st] / total) * C;
      const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${statusColor(st)}" stroke-width="${sw}"
        stroke-dasharray="${Math.max(len - gap, 0.1)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})">
        <title>${statusName(st)} ${byStatus[st]} การจอง</title></circle>`;
      offset += len;
      return el;
    }).join('');
    const legendRows = VIP_STATUS.map((st) => `
      <div class="row-between small"><span class="row" style="gap:6px">
        <svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${statusColor(st)}"/></svg>${statusName(st)}</span>
        <span class="bold">${byStatus[st] || 0}</span></div>`).join('');
    return `<div class="row" style="gap:16px">
      <div style="width:${size}px">${svgOpen(size, size, `การจองวันนี้ ${total} รายการ`)}
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${COLOR.track}" stroke-width="${sw}"/>${segs}
        <text x="${c}" y="${c + 6}" text-anchor="middle" font-family="Mitr" font-size="30" fill="${COLOR.ink}">${total}</text>
        <text x="${c}" y="${c + 26}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">การจอง</text></svg></div>
      <div class="stack" style="gap:4px;min-width:140px">${legendRows}</div></div>`;
  }

  /** นาที → "25 นาที" / "2 ชม. 5 นาที" */
  const duration = (m) => (m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}`);

  /**
   * รายการต้องติดตาม (Feedback เฟส 3) · 1 การจอง = 1 แถว
   *   "โทรตาม" (ขึ้นก่อน) = ยืนยันแล้วแต่เลยเวลาเริ่ม ≥ call_after_min นาทียังไม่มา → แสดงเบอร์ให้กดโทรได้
   *   "ยังไม่รับมัดจำ" = การจองที่ยังรอมัดจำ
   */
  function vipFollowUp(list, callAfter) {
    if (!list.length) return `<div class="small bold" style="color:var(--ok)">✓ ไม่มีรายการต้องติดตาม</div>`;
    return `<div class="caption muted" style="margin-bottom:8px">โทรตาม = ยืนยันแล้ว เลยเวลาเริ่ม ${callAfter} นาทียังไม่มา</div>
      <div class="stack" style="gap:8px">${list.slice(0, MAX_ROWS).map((f) => `
      <div>
        <div class="small"><span class="bold">${esc(f.room_name)}</span> · ${esc(packageLabel(f))} · ${hm(f.start_time)} · ${esc(f.customer_name)} (${f.guests} คน)</div>
        <div class="row" style="gap:4px;margin-top:4px">
          ${f.call ? `<span class="badge badge-bad">โทรตาม · เลยมา ${duration(f.minutes_late)}</span>` : ''}
          ${f.no_deposit ? `<span class="badge badge-wait">ยังไม่รับมัดจำ ${fmt.baht(f.deposit_amount)}</span>` : ''}
          <a class="small bold" href="tel:${esc(f.customer_phone)}">☎ ${esc(f.customer_phone)}</a>
        </div>
      </div>`).join('')}${more(list.length)}</div>`;
  }

  function renderVip(d) {
    if (!d.vip_today) return;
    $('vipGantt').innerHTML = vipGantt(d.vip_today, widthOf('vipGantt'), d.generated_at);
    $('vipDonut').innerHTML = vipDonut(d.vip_today.by_status);
    $('vipFollow').innerHTML = vipFollowUp(d.vip_today.follow_up, d.vip_today.call_after_min);
  }

  /* ---------- ยอดขายวันนี้ (Feedback เฟส 3): บิลที่ชำระ + ค่าห้อง VIP + มัดจำที่ยึด · มัดจำที่คืนไม่นับ ---------- */
  // เฟส 4: ป้าย % เทียบเมื่อวาน ใต้ยอดรวม (สร้างด้วย JS เพราะเฟสนี้แก้ HTML ไม่ได้)
  const salesChange = document.createElement('div');
  salesChange.style.marginTop = '4px';
  $('salesTotal').parentElement.append(salesChange);

  function renderSales(s) {
    if (!s) return;
    $('salesTotal').textContent = fmt.baht(s.total);
    $('salesSub').textContent = `ชำระแล้ว ${fmt.num(s.bills)} บิล`;
    $('salesFood').textContent = fmt.baht(s.food);
    $('salesRoom').textContent = fmt.baht(s.room_fee);
    $('salesDeposit').textContent = fmt.baht(s.deposit_forfeited);
    $('salesDepositSub').textContent = `มัดจำที่ยึด (ไม่มา/ยกเลิก ${fmt.num(s.forfeited_count)} การจอง)`;
    if (!s.yesterday) { salesChange.innerHTML = ''; return; }
    // เทียบเมื่อวาน "ถึงเวลาเดียวกัน" · ใช้ลูกศร + คำ ไม่อาศัยสีอย่างเดียว
    const pct = s.change_pct;
    const tag = pct === null ? `<span class="badge badge-off">เมื่อวานถึงเวลานี้ยังไม่มียอด</span>`
      : pct > 0 ? `<span class="badge badge-ok">▲ เพิ่มขึ้น ${pct}%</span>`
      : pct < 0 ? `<span class="badge badge-bad">▼ ลดลง ${Math.abs(pct)}%</span>`
      : `<span class="badge badge-off">เท่าเดิม</span>`;
    salesChange.innerHTML = `${tag}<div class="caption muted" style="margin-top:4px">
      เทียบเมื่อวานถึงเวลาเดียวกัน ${fmt.baht(s.yesterday.total)} · ทั้งวันเมื่อวาน ${fmt.baht(s.yesterday.total_full_day)}</div>`;
  }

  /* ---------- เฟส 4: Top 5 เมนู · เมนูใกล้หมด · วัตถุดิบต่ำ · ใบแจ้งหนี้ค้างจ่าย ---------- */
  // แจ้งเตือนวัตถุดิบต่ำด้านบนสุด (alert-wait)
  const ingredientAlert = document.createElement('div');
  ingredientAlert.className = 'alert alert-wait hidden';
  ingredientAlert.style.marginBottom = '16px';
  $('loadError').after(ingredientAlert);

  const salesCard = $('salesTotal').closest('.card');
  const menuRow = document.createElement('div');
  menuRow.className = 'grid grid-2 section';
  menuRow.innerHTML = `
    <div class="card">
      <div class="row-between"><h3 class="card-title">เมนูขายดีวันนี้ (Top 5)</h3><span class="small muted">นับจำนวนที่สั่ง</span></div>
      <div id="topMenus"><div class="loading">กำลังโหลด...</div></div>
    </div>
    <div class="card">
      <div class="row-between">
        <h3 class="card-title">เมนูใกล้หมด</h3>
        <a class="btn btn-ghost btn-sm" href="/admin/stock-today.html">เติมจำนวน →</a>
      </div>
      <div id="lowMenus"><div class="loading">กำลังโหลด...</div></div>
    </div>`;
  const stockRow = document.createElement('div');
  stockRow.className = 'grid grid-2 section';
  stockRow.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h3 class="card-title">วัตถุดิบต่ำกว่าจุดสั่งซื้อ</h3>
        <a class="btn btn-secondary btn-sm" href="/admin/purchase-orders.html">ไปใบสั่งซื้อ →</a>
      </div>
      <div id="lowIngredients"><div class="loading">กำลังโหลด...</div></div>
    </div>
    <div class="card">
      <div class="row-between">
        <h3 class="card-title">ใบแจ้งหนี้รอจ่าย</h3>
        <a class="btn btn-ghost btn-sm" href="/admin/goods-receipts.html">รับของ / จ่ายเงิน →</a>
      </div>
      <div id="unpaidInvoices"><div class="loading">กำลังโหลด...</div></div>
    </div>`;
  salesCard.after(menuRow);
  menuRow.after(stockRow);

  // การ์ด "เร็วๆ นี้" ไม่ต้องใช้แล้ว (ทุกส่วนทำครบในเฟส 4)
  [...document.querySelectorAll('.card-title')].filter((t) => t.textContent.trim() === 'เร็วๆ นี้')
    .forEach((t) => t.closest('.card').remove());

  /** แท่งนอน Top 5: ความยาวตามจำนวน · ป้ายขวา = จำนวน + หน่วย · tooltip มียอดเงิน */
  function topMenuBars(list, W) {
    if (!list.length) return `<div class="empty" style="padding:16px">วันนี้ยังไม่มีออเดอร์</div>`;
    const labelW = Math.min(170, W * 0.4), valueW = 72, rowH = 36, barH = 18;
    const plotW = W - labelW - valueW, max = Math.max(...list.map((m) => m.qty));
    const body = list.map((m, i) => {
      const y = i * rowH + (rowH - barH) / 2, ty = y + barH / 2 + 5;
      const w = Math.max((m.qty / max) * plotW, 4);
      const chars = Math.floor(labelW / 9);
      const name = m.name.length > chars ? m.name.slice(0, chars - 1) + '…' : m.name;
      return `<g><title>${esc(`${i + 1}. ${m.name} · ${m.qty} ${m.unit} · ${fmt.baht(m.amount)}`)}</title>
        <rect x="0" y="${i * rowH}" width="${W}" height="${rowH}" fill="transparent"/>
        <text x="0" y="${ty}" fill="${COLOR.ink}">${i + 1}. ${esc(name)}</text>
        <path d="${endRoundedRect(labelW, y, w, barH, 4, 'right')}" fill="${i === 0 ? COLOR.ok : COLOR.wait}"/>
        <text x="${W}" y="${ty}" text-anchor="end" fill="${COLOR.ink}" font-weight="600">${fmt.num(m.qty)} ${esc(m.unit)}</text>
      </g>`;
    }).join('');
    return svgOpen(W, list.length * rowH, `เมนูขายดีวันนี้ ${list.length} อันดับ`) + body + '</svg>';
  }

  function lowMenuList(list) {
    if (!list.length) return `<div class="small bold" style="color:var(--ok)">✓ ไม่มีเมนูใกล้หมด</div>`;
    return `<div class="stack" style="gap:8px">${list.slice(0, MAX_ROWS).map((m) => `
      <div class="row-between small">
        <span>${esc(m.name)} <span class="caption muted">· ${esc(m.category_name)}</span></span>
        ${m.temp_out ? badge('temp_out') : `<span class="badge badge-wait">เหลือ ${fmt.num(m.available_qty)} ${esc(m.unit)}</span>`}
      </div>`).join('')}${more(list.length)}
      <div class="caption muted">ใกล้หมด = เหลือไม่เกิน 1 ล็อต · หมดชั่วคราว = เหลือ 0 แต่ลูกค้ายังสั่งได้</div></div>`;
  }

  /** การ์ดที่มาจาก inventory-service: ระบบคลังดับ → ขึ้นข้อความในการ์ดนั้นอย่างเดียว */
  const inventoryDown = (part) => `<div class="alert alert-bad">${esc(part.message || 'ระบบคลังสินค้าไม่พร้อมใช้')}</div>
    <div class="caption muted" style="margin-top:8px">ส่วนอื่นของ Dashboard ยังใช้งานได้ตามปกติ</div>`;

  /** วัตถุดิบต่ำ: แถบคงเหลือเทียบจุดสั่งซื้อซ้ำ (เต็มหลอด = เท่าจุดสั่งซื้อ) */
  function lowIngredientList(part) {
    if (!part) return '';
    if (!part.available) return inventoryDown(part);
    if (!part.items.length) return `<div class="small bold" style="color:var(--ok)">✓ วัตถุดิบทุกอย่างยังเกินจุดสั่งซื้อ</div>`;
    return `<div class="stack" style="gap:8px">${part.items.slice(0, MAX_ROWS).map((g) => {
      const tip = `${g.name} · คงเหลือ ${g.qty_on_hand} ${g.unit} · จุดสั่งซื้อ ${g.reorder_point} ${g.unit}`;
      return `<div>
        <div class="row-between small"><span>${esc(g.name)}</span>
          <span class="bold">${fmt.num(g.qty_on_hand)} / ${fmt.num(g.reorder_point)} ${esc(g.unit)}</span></div>
        ${splitBar([{ key: g.qty_on_hand <= 0 ? 'soldout' : 'low', n: Math.max(g.qty_on_hand, 0) },
          { key: 'track', n: Math.max(g.reorder_point - g.qty_on_hand, 0) }], 8, tip, 'ing')}
      </div>`;
    }).join('')}${more(part.items.length)}
      <div class="caption muted">ตัวเลข = คงเหลือ / จุดสั่งซื้อซ้ำ</div></div>`;
  }

  function unpaidInvoiceList(part) {
    if (!part) return '';
    if (!part.available) return inventoryDown(part);
    if (!part.items.length) return `<div class="small bold" style="color:var(--ok)">✓ ไม่มีใบแจ้งหนี้ค้างจ่าย</div>`;
    return `<div class="bold" style="margin-bottom:8px">รวม ${fmt.baht(part.total)} · ${part.count} ใบ</div>
      <div class="stack" style="gap:8px">${part.items.slice(0, MAX_ROWS).map((g) => `
        <div class="row-between small">
          <span>${esc(g.supplier_name || g.po_no || 'ใบรับของ #' + g.id)}
            <span class="caption muted">· ${g.invoice_no ? 'เลขที่ ' + esc(g.invoice_no) : 'ไม่มีเลขใบแจ้งหนี้'}${g.received_at ? ' · รับของ ' + fmt.date(g.received_at) : ''}</span></span>
          <span class="bold">${fmt.baht(g.invoice_amount)}</span>
        </div>`).join('')}${more(part.items.length)}</div>`;
  }

  function renderStock(d) {
    $('topMenus').innerHTML = d.top_menus ? topMenuBars(d.top_menus, widthOf('topMenus')) : '';
    $('lowMenus').innerHTML = d.low_menus ? lowMenuList(d.low_menus) : '';
    $('lowIngredients').innerHTML = lowIngredientList(d.low_ingredients);
    $('unpaidInvoices').innerHTML = unpaidInvoiceList(d.unpaid_invoices);
    const low = d.low_ingredients;
    const showAlert = low && low.available && low.items.length > 0;
    ingredientAlert.classList.toggle('hidden', !showAlert);
    if (showAlert) {
      ingredientAlert.innerHTML = `⚠ วัตถุดิบต่ำกว่าจุดสั่งซื้อ ${low.count} รายการ: ${low.items.slice(0, 5).map((g) => esc(g.name)).join(', ')}${low.count > 5 ? ' …' : ''}
        · <a href="/admin/purchase-orders.html">ไปออกใบสั่งซื้อ →</a>`;
    }
  }

  /* ---------- รายการย่อ ---------- */
  const MAX_ROWS = 5;
  const more = (n) => (n > MAX_ROWS ? `<div class="caption muted">และอีก ${n - MAX_ROWS} รายการ</div>` : '');

  function renderMenuList(list) {
    $('menuList').innerHTML = list.length
      ? `<div class="stack" style="gap:8px">${list.slice(0, MAX_ROWS).map((m) => `
          <div class="row-between small">
            <span>${esc(m.name)} <span class="caption muted">· ${esc(m.category_name)}</span></span>
            ${badge('soldout', 'หมด (ปิดขาย)')}
          </div>`).join('')}${more(list.length)}</div>`
      : `<div class="empty" style="padding:16px"><i data-icon="check"></i> ทุกเมนูขายได้</div>`;
  }

  function renderStaffList(list, today) {
    const sorted = [...list].sort((a, b) => String(b.last_login_at || '').localeCompare(String(a.last_login_at || '')));
    $('staffList').innerHTML = sorted.length
      ? `<div class="stack" style="gap:8px">${sorted.slice(0, MAX_ROWS).map((s) => {
          const inToday = s.last_login_at && s.last_login_at.slice(0, 10) === today;
          return `<div class="row-between small">
            <span>${esc(s.full_name)} <span class="caption muted">· ${ROLES[s.role_code] || esc(s.role_name)}</span></span>
            ${inToday ? `<span class="badge badge-ok">${fmt.time(s.last_login_at)}</span>` : `<span class="badge badge-off">ยังไม่เข้า</span>`}
          </div>`;
        }).join('')}${more(sorted.length)}</div>`
      : `<div class="empty" style="padding:16px">ยังไม่มีพนักงาน</div>`;
  }

  /* ---------- วาดทั้งหน้า ---------- */
  function render(d) {
    const today = d.generated_at.slice(0, 10);
    const loggedIn = d.active_staff.filter((s) => s.last_login_at && s.last_login_at.slice(0, 10) === today).length;
    $('statTables').textContent = `${d.tables.occupied}/${d.tables.total}`;
    $('statVip').textContent = `${d.vip_rooms.occupied}/${d.vip_rooms.total}`;
    $('statBills').textContent = fmt.num(d.open_bills.count);
    $('statBillsSub').textContent = `บิลที่เปิด · ${fmt.baht(d.open_bills.amount)}`;
    $('statMenus').textContent = fmt.num(d.unavailable_menus.length);
    $('staffSummary').textContent = `เข้าระบบวันนี้ ${loggedIn} จาก ${d.active_staff.length} คน`;

    renderSales(d.sales_today);
    renderStock(d);
    renderCharts(d);
    renderMenuStatus(d.menus_by_category);
    renderMenuList(d.unavailable_menus);
    renderStaffList(d.active_staff, today);
  }

  /** วาดกราฟทั้งหมดตามความกว้างการ์ดตอนนี้ (เรียกซ้ำตอนย่อ/ขยายหน้าต่าง) */
  function renderCharts(d) {
    $('chartDonut').innerHTML = donutChart(d.tables.occupied, d.tables.total);
    $('chartZones').innerHTML = progressBars(
      d.tables_by_zone.map((z) => ({
        label: ZONE_LABEL[z.zone] || z.zone, value: z.busy, total: z.busy + z.free, unit: z.zone === 'vip' ? 'ห้อง' : 'โต๊ะ',
      })),
      widthOf('chartZones'), 'จำนวนโต๊ะที่มีลูกค้าเทียบกับทั้งหมด แยกตามโซน');
    renderHourly(d);
    renderVip(d);
    $('topMenus').innerHTML = d.top_menus ? topMenuBars(d.top_menus, widthOf('topMenus')) : '';
  }

  let lastData = null, resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => lastData && renderCharts(lastData), 150);
  });

  let failed = false;
  async function load(manual = false) {
    let d;
    try {
      d = await api.get('dashboard');
    } catch (e) {
      // ดึงซ้ำอัตโนมัติ: แสดงแถบแจ้งเตือนแทน toast จะได้ไม่เด้งทุก 10 วินาที (ข้อมูลเดิมยังอยู่บนจอ)
      $('loadError').textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message;
      $('loadError').classList.remove('hidden');
      if (manual || !failed) toast(e.message, 'error');
      failed = true;
      return;
    }
    failed = false;
    $('loadError').classList.add('hidden');
    lastData = d;
    render(d);
    $('updatedAt').textContent = 'อัปเดตล่าสุด ' + fmt.time(d.generated_at) + ' · รีเฟรชอัตโนมัติทุก 10 วินาที';
    if (manual) toast('อัปเดตข้อมูลแล้ว');
  }

  $('refreshBtn').onclick = () => load(true);
  poll(() => load(false), 10);
})();
