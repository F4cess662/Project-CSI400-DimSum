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
    if (!total) return `<div class="empty"><div class="empty-icon">🪑</div>ยังไม่มีโต๊ะในระบบ</div>`;
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
  function splitBar(parts, height, tip) {
    const id = 'bar' + (barSeq++);
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
      const tip = `${m.name} · ${m.state === 'soldout' ? 'หมด' : 'เหลือ ' + (m.available_qty === null ? 'ไม่จำกัด' : m.available_qty + ' ' + m.unit)}`;
      return `<div>
        <div class="row-between small"><span>${esc(m.name)}</span>
          ${m.state === 'soldout' ? badge('soldout') : `<span class="bold">${qtyText(m)}</span>`}</div>
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
      low.length ? `<div class="small bold" style="color:var(--wait)">ใกล้หมด: ${low.map((m) => `${esc(m.name)} เหลือ ${qtyText(m)}`).join(', ')}</div>` : '',
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
    $('soldoutAll').textContent = '⚠ เมนูที่หมดตอนนี้: ' + names.join(' · ');
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

  function hourlyBars(rows, W) {
    if (!rows.length) return `<div class="empty">ยังไม่มีข้อมูล</div>`;
    const shifts = [...new Set(rows.map((r) => r.shift))];
    const H = 240, left = 28, top = 26, gapW = 24;
    const plotW = W - left - gapW * (shifts.length - 1);
    const band = plotW / rows.length;
    const oneLine = band >= 96;                                    // แคบ → แสดงช่วงเวลา 2 บรรทัด
    const bottom = oneLine ? 26 : 44, plotH = H - top - bottom;
    const barW = Math.min(band * 0.55, 40);
    const maxVal = Math.max(...rows.map((r) => r.count));
    const yMax = Math.max(4, Math.ceil(maxVal / 2) * 2);          // แกน y เป็นเลขคู่ อย่างน้อย 4
    const yOf = (v) => top + plotH - (v / yMax) * plotH;
    const grid = [0, yMax / 2, yMax].map((v) => `
      <line x1="${left}" x2="${W}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="${COLOR.grid}" stroke-width="1"/>
      <text x="${left - 8}" y="${yOf(v) + 5}" text-anchor="end" fill="${COLOR.muted}">${v}</text>`).join('');
    const peak = rows.findIndex((r) => r.count === maxVal && maxVal > 0);

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
      const cx = x + band / 2, h = (r.count / yMax) * plotH;
      const range = `${hh(r.hour)}–${hh(r.hour + 1)}`;
      const tip = `${range} · เปิด ${r.count} บิล`;
      const labelY = top + plotH + 20;
      const label = oneLine
        ? `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">${range}</text>`
        : `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="${COLOR.muted}" font-size="12">${hh(r.hour)}–<tspan x="${cx}" dy="16">${hh(r.hour + 1)}</tspan></text>`;
      const g = `<g><title>${tip}</title>
        <rect x="${x}" y="${top}" width="${band}" height="${plotH}" fill="transparent"/>
        ${h > 0 ? `<path d="${endRoundedRect(cx - barW / 2, yOf(r.count), barW, h, 4, 'up')}" fill="${COLOR.wait}"/>` : ''}
        ${i === peak ? `<text x="${cx}" y="${yOf(r.count) - 6}" text-anchor="middle" fill="${COLOR.ink}" font-weight="600">${r.count}</text>` : ''}
        ${label}
      </g>`;
      x += band;
      return g;
    }).join('');
    const total = rows.reduce((s, r) => s + r.count, 0);
    return `<div class="small muted" style="margin-bottom:8px">รวมวันนี้ ${fmt.num(total)} บิล · เฉพาะเวลาที่ร้านเปิด</div>` +
      svgOpen(W, H, `บิลที่เปิดวันนี้รายชั่วโมง รวม ${total} บิล`) + grid + extras + bars + '</svg>';
  }

  /* ---------- รายการย่อ ---------- */
  const MAX_ROWS = 5;
  const more = (n) => (n > MAX_ROWS ? `<div class="caption muted">และอีก ${n - MAX_ROWS} รายการ</div>` : '');

  function renderMenuList(list) {
    $('menuList').innerHTML = list.length
      ? `<div class="stack" style="gap:8px">${list.slice(0, MAX_ROWS).map((m) => `
          <div class="row-between small">
            <span>${esc(m.name)} <span class="caption muted">· ${esc(m.category_name)}</span></span>
            ${m.available_qty === 0 ? badge('soldout') : badge('inactive', 'ปิดขาย')}
          </div>`).join('')}${more(list.length)}</div>`
      : `<div class="empty" style="padding:16px">✅ ทุกเมนูขายได้</div>`;
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
    $('chartHours').innerHTML = hourlyBars(d.bills_by_hour, widthOf('chartHours'));
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
