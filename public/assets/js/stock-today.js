/* =========================================================
   public/assets/js/stock-today.js — หน้าจำนวนพร้อมขาย + เติมล็อตตามหน่วยเมนู + ปุ่มล้างสต็อก (#5)
   คงเหลือ 0 = "หมดชั่วคราว" ลูกค้ายังสั่งได้ (รอนานขึ้น) · ปิดขาย = "หมด" ต้องกดสวิตช์เอง
   ========================================================= */
(async () => {
  const me = await initStaffPage({
    title: 'จำนวนพร้อมขาย',
    roles: ['head_chef', 'manager', 'owner'],
  });
  if (!me) return;

  let selectedZone = 'all';
  let selectedCategory = 'all';
  let menus = [];
  let searchTimer = null;

  const statOkEl = document.getElementById('statOkCount');
  const statLowEl = document.getElementById('statLowCount');
  const statOutEl = document.getElementById('statOutCount');
  const zoneTabsEl = document.getElementById('zoneTabs');
  const catSelectEl = document.getElementById('catSelect');
  const searchInputEl = document.getElementById('searchInput');
  const resetStockBtn = document.getElementById('resetStockBtn');
  const clearBtn = document.getElementById('clearBtn') || document.getElementById('clearFilterBtn');
  const stockRowsEl = document.getElementById('stockRows');

  async function loadCategories() {
    const cats = await run(() => api.get('categories'));
    if (!cats) return;
    catSelectEl.innerHTML = [
      '<option value="all">ทุกหมวดอาหาร</option>',
      ...cats.map((c) => `<option value="${c.id}">${fmt.esc(c.name)}</option>`),
    ].join('');
  }

  async function loadStock() {
    const rows = await api.get('menus', {
      q: searchInputEl.value.trim(),
      kitchen_zone: selectedZone === 'all' ? '' : selectedZone,
      category_id: selectedCategory === 'all' ? '' : selectedCategory,
    }).catch(() => null);
    if (!rows) return;
    menus = rows;
    renderStock();
  }

  function renderStock() {
    let okCount = 0;
    let lowCount = 0;
    let outCount = 0;

    menus.forEach((m) => {
      const qty = Number(m.available_qty || 0);
      const lotSize = Number(m.lot_size || 1);
      if (!m.is_available) outCount += 1; // ปิดขาย = หมด
      else if (qty <= lotSize) lowCount += 1; // ใกล้หมด หรือ หมดชั่วคราว (0)
      else okCount += 1;
    });

    statOkEl.textContent = fmt.num(okCount);
    statLowEl.textContent = fmt.num(lowCount);
    statOutEl.textContent = fmt.num(outCount);

    if (!menus.length) {
      stockRowsEl.innerHTML = `
        <tr><td colspan="8">
          <div class="empty"><div class="empty-icon"><i data-icon="dumpling"></i></div>ไม่พบรายการเมนูที่ค้นหา</div>
        </td></tr>`;
      return;
    }

    // เรียง: หมด (ปิดขาย) → หมดชั่วคราว (เหลือ 0) → ใกล้หมด (≤ 1 ล็อต) → ปกติ · กลุ่มเดียวกันคงลำดับเดิม
    const rank = (m) => {
      const qty = Number(m.available_qty || 0);
      if (!m.is_available) return 0;
      if (m.available_qty != null && qty <= 0) return 1;
      if (m.available_qty != null && qty <= Number(m.lot_size || 1)) return 2;
      return 3;
    };
    const sorted = [...menus].sort((a, b) => rank(a) - rank(b));

    stockRowsEl.innerHTML = sorted.map((m) => {
      const qty = Number(m.available_qty || 0);
      const lotSize = Number(m.lot_size || 1);
      const unit = fmt.esc(m.unit || 'เข่ง');
      const isOut = !m.is_available;
      const isLow = !isOut && qty <= lotSize;

      let statusBadge = badge('ok', 'พร้อมขาย');
      if (!m.is_available) statusBadge = badge('soldout', 'หมด (ปิดขาย)');
      else if (m.available_qty != null && qty <= 0) statusBadge = badge('temp_out', 'หมดชั่วคราว');
      else if (isLow) statusBadge = badge('low', 'ใกล้หมด');

      return `
        <tr>
          <td>
            <div class="bold">${fmt.esc(m.name)}</div>
            <div class="caption muted">${fmt.esc(m.description || '')}</div>
          </td>
          <td>
            <div class="small">${fmt.esc(m.category_name)}</div>
            ${zoneChip(m.kitchen_zone)}
          </td>
          <td class="num price">${fmt.baht(m.price)} <span class="caption muted">/ ${unit}</span></td>
          <td class="num small">1 ล็อต = <strong>${fmt.num(lotSize)} ${unit}</strong></td>
          <td class="num">
            <span class="bold" style="font-size:18px">${fmt.num(qty)}</span>
            <span class="small muted">${unit}</span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="row" style="gap:6px">
              <button type="button" class="btn btn-sm" data-add-lot="${m.id}">
                +1 ล็อต (+${fmt.num(lotSize)} ${unit})
              </button>
              <button type="button" class="btn btn-secondary btn-sm" data-set-stock="${m.id}">
                กรอกเอง
              </button>
              <button type="button" class="btn btn-danger btn-sm" data-clear-stock="${m.id}" ${qty <= 0 ? 'disabled' : ''}>
                ล้าง
              </button>
            </div>
          </td>
          <td>
            <label class="switch">
              <input type="checkbox" data-toggle-avail="${m.id}" ${m.is_available ? 'checked' : ''}>
              <span></span>
            </label>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openSetStockModal(item) {
    const unit = fmt.esc(item.unit || 'เข่ง');
    const m = openModal({
      title: `กรอกจำนวนคงเหลือ: ${fmt.esc(item.name)}`,
      body: `
        <form id="setStockForm">
          <div class="field">
            <label for="newStockQty">จำนวนพร้อมขาย (${unit})</label>
            <input class="input" type="number" id="newStockQty" min="0" step="1" required value="${Number(item.available_qty || 0)}">
            <div class="caption muted">
              ขนาดล็อตของเมนูนี้: 1 ล็อต = ${fmt.num(item.lot_size)} ${unit} · ใส่ <strong>0</strong> = หมดชั่วคราว (ลูกค้ายังสั่งได้ รอนานขึ้น) · ถ้าจะหยุดขายให้กดสวิตช์ปิดขาย
            </div>
          </div>
        </form>`,
      footer: `
        <button type="button" class="btn btn-secondary" data-close>ยกเลิก</button>
        <button type="submit" class="btn" form="setStockForm">ยืนยัน</button>`,
    });

    m.el.querySelector('#setStockForm').onsubmit = async (e) => {
      e.preventDefault();
      const val = Number(m.el.querySelector('#newStockQty').value);
      const res = await run(() => api.post('menus', {
        action: 'set_stock',
        id: item.id,
        available_qty: val,
      }));
      if (res) {
        m.close();
        await loadStock();
      }
    };
  }

  async function handleResetAllStock() {
    const yes = await confirmModal(
      'ทุกเมนูจะเป็น 0 (หมดชั่วคราว) ใช้ตอนเริ่มหลังหยุดยาว · เชฟต้องเติมล็อตก่อนเปิดร้าน',
      'ล้างจำนวนพร้อมขายทั้งหมด',
      true
    );
    if (!yes) return;
    const res = await run(() => api.post('menus', { action: 'reset_stock' }));
    if (res) await loadStock();
  }

  if (resetStockBtn) {
    resetStockBtn.onclick = handleResetAllStock;
  }
  if (clearBtn) {
    clearBtn.onclick = handleResetAllStock;
  }

  zoneTabsEl.onclick = (e) => {
    const tab = e.target.closest('[data-zone]');
    if (!tab) return;
    selectedZone = tab.dataset.zone;
    zoneTabsEl.querySelectorAll('[data-zone]').forEach((el) => {
      el.classList.toggle('active', el.dataset.zone === selectedZone);
    });
    loadStock();
  };

  catSelectEl.onchange = () => {
    selectedCategory = catSelectEl.value;
    loadStock();
  };

  searchInputEl.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadStock, 300);
  };

  stockRowsEl.onclick = async (e) => {
    const addBtn = e.target.closest('[data-add-lot]');
    if (addBtn) {
      const id = Number(addBtn.dataset.addLot);
      const res = await run(() => api.post('menus', { action: 'add_stock', id, lots: 1 }));
      if (res) await loadStock();
      return;
    }

    const setBtn = e.target.closest('[data-set-stock]');
    if (setBtn) {
      const item = menus.find((m) => Number(m.id) === Number(setBtn.dataset.setStock));
      if (item) openSetStockModal(item);
      return;
    }

    const clearStockBtn = e.target.closest('[data-clear-stock]');
    if (clearStockBtn) {
      const item = menus.find((m) => Number(m.id) === Number(clearStockBtn.dataset.clearStock));
      if (!item) return;
      const unit = fmt.esc(item.unit || 'เข่ง');
      const yes = await confirmModal(
        `ล้างจำนวนพร้อมขายของ <b>${fmt.esc(item.name)}</b> เป็น 0 ${unit} (หมดชั่วคราว · ลูกค้ายังสั่งได้ รอนานขึ้น) หรือไม่?`,
        'ล้างจำนวนพร้อมขาย',
        true
      );
      if (!yes) return;
      const res = await run(() => api.post('menus', {
        action: 'set_stock',
        id: item.id,
        available_qty: 0,
      }));
      if (res) await loadStock();
    }
  };

  stockRowsEl.onchange = async (e) => {
    const toggle = e.target.closest('[data-toggle-avail]');
    if (!toggle) return;
    const id = Number(toggle.dataset.toggleAvail);
    const isAvailable = toggle.checked ? 1 : 0;
    const menu = menus.find((x) => Number(x.id) === id);
    const name = menu ? fmt.esc(menu.name) : 'เมนูนี้';
    const yes = await confirmModal(
      isAvailable
        ? `เปิดขาย <b>${name}</b>?<br><span class="small muted">ลูกค้าจะเห็นและสั่งเมนูนี้ได้</span>`
        : `ปิดขาย <b>${name}</b>?<br><span class="small muted">ลูกค้าจะเห็นเมนูนี้เป็น "หมด" และสั่งไม่ได้</span>`,
      isAvailable ? 'เปิดขาย' : 'ปิดขาย',
      !isAvailable
    );
    if (!yes) {
      toggle.checked = !toggle.checked;
      return;
    }
    const res = await run(() => api.post('menus', { action: 'set_available', id, is_available: isAvailable }));
    await loadStock();
    if (!res) toggle.checked = !toggle.checked;
  };

  await loadCategories();
  poll(loadStock, 10);
})();