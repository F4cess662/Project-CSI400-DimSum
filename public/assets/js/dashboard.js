/* =========================================================
   dashboard.js — หน้า Dashboard ผู้จัดการ/เจ้าของร้าน (FR-47)
   เรียก GET /api/dashboard ซ้ำทุก 10 วินาที
   ========================================================= */
(async () => {
  const me = await initStaffPage({ title: 'Dashboard', roles: ['manager', 'owner'] });
  if (!me) return;
  if (me.role_code === 'owner') document.getElementById('usersLink').classList.remove('hidden');

  const $ = (id) => document.getElementById(id);
  const TABLE_GROUPS = [
    { type: 'bar', label: 'บาร์' },
    { type: 'small', label: 'โต๊ะเล็ก (2–4 คน)' },
    { type: 'large', label: 'โต๊ะใหญ่ (5–8 คน)' },
  ];

  /** ข้อความ tooltip ของโต๊ะ/ห้องที่มีบิลเปิด */
  function billTitle(name, t) {
    if (!t.bill_id) return `${name} · ว่าง`;
    return `${name} · ${t.bill_no} · ${t.guests} คน · เปิด ${fmt.time(t.opened_at)} (${fmt.minutesAgo(t.opened_at)} นาที)`;
  }

  function renderStats(d) {
    $('statTables').textContent = `${d.tables.occupied}/${d.tables.total}`;
    $('statBills').textContent = fmt.num(d.open_bills.count);
    $('statBillsSub').textContent = `บิลที่เปิด · ${fmt.num(d.open_bills.guests)} คน · ${fmt.baht(d.open_bills.amount)}`;
    $('statMenus').textContent = fmt.num(d.unavailable_menus.length);
    const today = d.generated_at.slice(0, 10);
    const loggedIn = d.active_staff.filter((s) => s.last_login_at && s.last_login_at.slice(0, 10) === today).length;
    $('statStaff').textContent = fmt.num(d.active_staff.length);
    $('statStaffSub').textContent = `พนักงานใช้งาน · เข้าระบบวันนี้ ${loggedIn} คน`;
  }

  function renderTableMap(d) {
    const tile = (t) => `
      <div class="tile ${t.table_type === 'bar' ? 'bar' : ''} ${t.status === 'occupied' ? 'busy' : ''}"
           style="width:48px;height:48px" title="${fmt.esc(billTitle(t.code, t))}">
        <span class="small bold">${fmt.esc(t.code)}</span>
      </div>`;
    const groups = TABLE_GROUPS.map((g) => {
      const items = d.tables.items.filter((t) => t.table_type === g.type);
      if (!items.length) return '';
      const busy = items.filter((t) => t.status === 'occupied').length;
      return `<div class="zone-block">
        <div class="small muted" style="margin-bottom:8px">${g.label} · มีลูกค้า ${busy}/${items.length}</div>
        <div class="table-grid">${items.map(tile).join('')}</div></div>`;
    }).join('');

    const vip = d.vip_rooms.items.length ? `<div class="zone-block">
      <div class="small muted" style="margin-bottom:8px">ห้อง VIP · มีลูกค้า ${d.vip_rooms.occupied}/${d.vip_rooms.total}</div>
      <div class="table-grid">${d.vip_rooms.items.map((v) => `
        <div class="tile vip ${v.status === 'occupied' ? 'busy' : ''}" style="width:96px;height:48px"
             title="${fmt.esc(billTitle(v.name, v))}">
          <span class="small bold">${fmt.esc(v.name)}</span>
        </div>`).join('')}</div></div>` : '';

    $('tableMap').innerHTML = groups + vip
      || `<div class="empty"><div class="empty-icon">🪑</div>ยังไม่มีโต๊ะในระบบ</div>`;
  }

  function renderMenus(d) {
    const list = d.unavailable_menus;
    $('menuList').innerHTML = list.length
      ? `<div class="stack" style="gap:8px">${list.map((m) => `
          <div class="row-between">
            <div>
              <div class="bold">${fmt.esc(m.name)}</div>
              <div class="caption muted">${fmt.esc(m.category_name)} · ${ZONES[m.kitchen_zone] || m.kitchen_zone}</div>
            </div>
            ${m.available_qty === 0 ? badge('soldout') : badge('inactive', 'ปิดขาย')}
          </div>`).join('')}</div>`
      : `<div class="empty" style="padding:16px"><div class="empty-icon">✅</div>ทุกเมนูเปิดขายอยู่</div>`;
  }

  function renderStaff(d) {
    const today = d.generated_at.slice(0, 10);
    const list = d.active_staff;
    $('staffList').innerHTML = list.length
      ? `<div class="stack" style="gap:8px">${list.map((s) => {
          const inToday = s.last_login_at && s.last_login_at.slice(0, 10) === today;
          return `<div class="row-between">
            <div class="row" style="gap:8px">
              <span class="avatar" style="width:32px;height:32px;font-size:14px;cursor:default">${fmt.esc(s.full_name.charAt(0))}</span>
              <div>
                <div class="bold small">${fmt.esc(s.full_name)}</div>
                <div class="caption muted">${ROLES[s.role_code] || fmt.esc(s.role_name)}</div>
              </div>
            </div>
            ${inToday
              ? `<span class="badge badge-ok">เข้าระบบ ${fmt.time(s.last_login_at)}</span>`
              : `<span class="badge badge-off">ยังไม่เข้าระบบวันนี้</span>`}
          </div>`;
        }).join('')}</div>`
      : `<div class="empty" style="padding:16px"><div class="empty-icon">👥</div>ยังไม่มีพนักงาน</div>`;
  }

  let failed = false;
  async function load(manual = false) {
    let d;
    try {
      d = await api.get('dashboard');
    } catch (e) {
      // ดึงซ้ำอัตโนมัติ: แสดงแถบแจ้งเตือนแทน toast จะได้ไม่เด้งทุก 10 วินาที
      $('loadError').textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message;
      $('loadError').classList.remove('hidden');
      if (manual || !failed) toast(e.message, 'error');
      failed = true;
      return;
    }
    failed = false;
    $('loadError').classList.add('hidden');
    renderStats(d);
    renderTableMap(d);
    renderMenus(d);
    renderStaff(d);
    $('updatedAt').textContent = 'อัปเดตล่าสุด ' + fmt.time(d.generated_at) + ' · รีเฟรชอัตโนมัติทุก 10 วินาที';
    if (manual) toast('อัปเดตข้อมูลแล้ว');
  }

  $('refreshBtn').onclick = () => load(true);
  poll(() => load(false), 10);
})();
