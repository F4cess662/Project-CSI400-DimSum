/* =========================================================
   tables.js — ผังโต๊ะ (คนที่ 4 · เฟส 1)
   - ดึง /api/tables + /api/vip_rooms ทุก 10 วินาที
   - คลิกโต๊ะ → window.openTablePanel(table, panelEl) ของคนที่ 5 (ถ้ามี)
   - เปิด window.reloadTables() ให้คนที่ 5 เรียกรีเฟรชผัง
   - window.pickTable(filterFn) → Promise<table|null> (แก้ตาม Feedback เฟส 1: ย้ายโต๊ะ)
     ไฮไลต์เฉพาะโต๊ะที่ filterFn(table) เป็น true (โต๊ะอื่นจาง) + แถบ "เลือกโต๊ะปลายทาง" + ปุ่มยกเลิก
     คลิกโต๊ะที่ไฮไลต์ → resolve(table) · ยกเลิก / Esc → resolve(null) · ระหว่างเลือกไม่เปิดแผงโต๊ะ
   table ={ id, code, table_type, seats, status, is_vip, bill: {id, bill_no, qr_token, opened_at, guests, total} | null }
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'ผังโต๊ะ', roles: ['staff', 'manager', 'owner'] });
  if (!me) return;

  const ZONES = [
    { key: 'bar', title: '<i data-icon="cup"></i> บาร์', cls: 'bar' },
    { key: 'small', title: '<i data-icon="chair"></i> โต๊ะเล็ก', cls: '' },
    { key: 'large', title: '<i data-icon="utensils"></i> โต๊ะใหญ่', cls: '' },
    { key: 'vip', title: '<i data-icon="crown"></i> ห้อง VIP', cls: 'vip' },
  ];
  const floor = document.getElementById('floor');
  const panel = document.getElementById('sidePanel');

  let items = [];        // โต๊ะ + ห้อง VIP ทั้งหมดที่ได้จาก API
  let selectedKey = null; // เช่น 't5' หรือ 'v2'
  let picking = null;     // { filter, resolve } ระหว่างเลือกโต๊ะปลายทาง (pickTable)

  const keyOf = (t) => (t.is_vip ? 'v' : 't') + t.id;
  const canPick = (t) => { try { return !!picking.filter(t); } catch (e) { return false; } };

  function tileHtml(t, cls) {
    const busy = t.status === 'occupied';
    const sub = busy && t.bill
      ? `${fmt.minutesAgo(t.bill.opened_at)} นาที · ${fmt.baht(t.bill.total)}`
      : busy ? 'มีลูกค้า' : `ว่าง · ${t.seats} ที่`;
    // ระหว่างเลือกโต๊ะปลายทาง: โต๊ะที่เลือกได้ = ไฮไลต์ (selected) · โต๊ะอื่น = จาง (inactive)
    const state = picking
      ? (canPick(t) ? 'selected' : 'inactive')
      : (keyOf(t) === selectedKey ? 'selected' : '');
    return `<div class="tile ${cls} ${busy ? 'busy' : ''} ${state}" data-key="${keyOf(t)}">
      <div class="tile-code">${fmt.esc(t.code)}</div>
      <div class="tile-sub">${fmt.esc(sub)}</div>
    </div>`;
  }

  function pickBar() {
    if (!picking) return '';
    const n = items.filter(canPick).length;
    return `<div class="alert alert-wait row-between" style="margin-bottom:12px">
      <span><b><i data-icon="move"></i> เลือกโต๊ะปลายทาง</b> · คลิกโต๊ะที่ไฮไลต์ (${n} โต๊ะ) · กด Esc เพื่อยกเลิก</span>
      <button class="btn btn-secondary btn-sm" data-pick-cancel>ยกเลิก</button>
    </div>`;
  }

  function draw() {
    floor.innerHTML = pickBar() + ZONES.map((z) => {
      const list = items.filter((t) => (t.is_vip ? 'vip' : t.table_type) === z.key);
      return `<div class="zone-block">
        <div class="bold" style="margin-bottom:8px">${z.title} <span class="small muted">(${list.length})</span></div>
        <div class="table-grid">${list.length
          ? list.map((t) => tileHtml(t, z.cls)).join('')
          : '<span class="small muted">ยังไม่มีรายการ</span>'}</div>
      </div>`;
    }).join('');

    floor.querySelectorAll('.tile').forEach((el) => { el.onclick = () => (picking ? pick(el.dataset.key) : select(el.dataset.key)); });
    const cancelBtn = floor.querySelector('[data-pick-cancel]');
    if (cancelBtn) cancelBtn.onclick = () => endPick(null);

    const tables = items.filter((t) => !t.is_vip);
    const rooms = items.filter((t) => t.is_vip);
    const count = (list, s) => list.filter((t) => t.status === s).length;
    document.getElementById('cntFree').textContent = `โต๊ะว่าง ${count(tables, 'available')}`;
    document.getElementById('cntBusy').textContent = `มีลูกค้า ${count(tables, 'occupied')}`;
    document.getElementById('cntVip').textContent =
      `ห้อง VIP ว่าง ${count(rooms, 'available')} · มีลูกค้า ${count(rooms, 'occupied')}`;
  }

  /** แผงข้างแบบง่าย ใช้เมื่อยังไม่มี bill-panel.js ของคนที่ 5 */
  function basicPanel(t) {
    const b = t.bill;
    panel.innerHTML = `
      <h3 style="margin:0">${t.is_vip ? 'ห้อง' : 'โต๊ะ'} ${fmt.esc(t.code)}</h3>
      <p class="small muted">${t.seats} ที่นั่ง · ${badge(t.status)}</p>
      ${b ? `<div class="stack">
          <div class="row-between"><span class="muted">เลขบิล</span><span class="bold">${fmt.esc(b.bill_no)}</span></div>
          <div class="row-between"><span class="muted">จำนวนคน</span><span>${fmt.num(b.guests)} คน</span></div>
          <div class="row-between"><span class="muted">เปิดเมื่อ</span><span>${fmt.time(b.opened_at)} น. (${fmt.minutesAgo(b.opened_at)} นาที)</span></div>
          <div class="row-between"><span class="muted">ยอดปัจจุบัน</span><span class="price">${fmt.baht(b.total)}</span></div>
        </div>` : '<p class="small muted">ยังไม่มีบิลเปิดอยู่</p>'}`;
  }

  function select(key) {
    selectedKey = key;
    const t = items.find((x) => keyOf(x) === key);
    if (!t) return;
    draw();
    if (typeof window.openTablePanel === 'function') window.openTablePanel(t, panel);
    else basicPanel(t);
  }

  async function load() {
    try {
      const [tables, rooms] = await Promise.all([api.get('tables'), api.get('vip_rooms')]);
      items = [...tables.map((t) => ({ ...t, is_vip: false })), ...rooms.map((r) => ({ ...r, is_vip: true }))];
      // ถ้าโต๊ะที่เลือกอยู่หายไป (ถูกปิดใช้งาน) ให้ยกเลิกการเลือก
      if (selectedKey && !items.some((t) => keyOf(t) === selectedKey)) selectedKey = null;
      draw(); // วาดเฉพาะผัง ไม่แตะแผงข้าง เพื่อไม่ล้างฟอร์มที่พนักงานกำลังกรอก
    } catch (e) {
      floor.innerHTML = `<div class="alert alert-bad">โหลดผังโต๊ะไม่สำเร็จ: ${fmt.esc(e.message)}</div>`;
    }
  }

  /* ---------- เลือกโต๊ะปลายทาง (ย้ายโต๊ะ · คนที่ 5 เรียกจาก bill-panel.js) ---------- */
  function pick(key) {
    const t = items.find((x) => keyOf(x) === key);
    if (!t || !canPick(t)) return; // โต๊ะที่จางกดไม่ได้
    endPick(t);
  }

  function endPick(result) {
    if (!picking) return;
    const { resolve } = picking;
    picking = null;
    document.removeEventListener('keydown', onPickKey);
    draw();
    resolve(result);
  }

  function onPickKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); endPick(null); }
  }

  window.pickTable = (filterFn) => {
    if (picking) endPick(null); // เรียกซ้ำระหว่างเลือก → ยกเลิกอันเดิมก่อน
    return new Promise((resolve) => {
      picking = { filter: typeof filterFn === 'function' ? filterFn : () => true, resolve };
      document.addEventListener('keydown', onPickKey);
      draw();
      floor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  window.reloadTables = load;
  document.getElementById('refreshBtn').onclick = load;
  poll(load, 10);
})();
