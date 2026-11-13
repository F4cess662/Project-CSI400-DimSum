/* =========================================================
   public/assets/js/menus.js — หน้าจัดการเมนูและหมวด + เปิด/ปิดขาย + เติมล็อตด่วน
   เชื่อมฐานข้อมูล MySQL ผ่าน /api/categories และ /api/menus
   ========================================================= */
(async () => {
  const me = await initStaffPage({
    title: 'เมนูและหมวด',
    roles: ['head_chef', 'manager', 'owner'],
  });
  if (!me) return;

  const isOwner = me.role_code === 'owner';
  const UNITS = ['เข่ง', 'ลูก', 'ชิ้น', 'ที่', 'จาน', 'ชาม', 'หม้อ', 'ชุด', 'แก้ว', 'ถ้วย', 'กา', 'ขวด'];
  const ZONE_LIST = [
    { code: 'steam', label: 'นึ่ง' },
    { code: 'fry', label: 'ทอด' },
    { code: 'congee_noodle', label: 'จานหลัก' },
    { code: 'drink_dessert', label: 'เครื่องดื่ม' },
  ];

  let categories = [];
  let allMenusCount = 0;
  let menus = [];
  let selectedCategoryId = 'all';
  let selectedZone = 'all';
  let searchTimer = null;

  const roleNoticeEl = document.getElementById('roleNotice');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const addMenuBtn = document.getElementById('addMenuBtn');
  const catHintEl = document.getElementById('catHint');
  const categoryListEl = document.getElementById('categoryList');
  const menuGridEl = document.getElementById('menuGrid');
  const searchInput = document.getElementById('searchInput');
  const minPriceInput = document.getElementById('minPriceInput');
  const maxPriceInput = document.getElementById('maxPriceInput');
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  const zoneFilterBar = document.getElementById('zoneFilterBar');

  if (!isOwner) {
    addCategoryBtn.classList.add('hidden');
    addMenuBtn.classList.add('hidden');
    catHintEl.classList.add('hidden');
    roleNoticeEl.classList.remove('hidden');
    roleNoticeEl.textContent = `โหมด${ROLES[me.role_code] || me.role_code}: สามารถเปิด/ปิดขาย เติม +1 ล็อต หรือกรอกจำนวนคงเหลือได้ (การเพิ่ม/แก้ไข/ลบหมวดและเมนูสำหรับเจ้าของร้านเท่านั้น)`;
  }

  async function loadCategories() {
    const rows = await run(() => api.get('categories'));
    if (!rows) return;
    categories = rows;
    allMenusCount = categories.reduce((sum, c) => sum + Number(c.menu_count || 0), 0);
    renderCategories();
  }

  async function loadMenus() {
    const params = {
      q: searchInput.value.trim(),
      category_id: selectedCategoryId === 'all' ? '' : selectedCategoryId,
      kitchen_zone: selectedZone === 'all' ? '' : selectedZone,
      min_price: minPriceInput.value.trim(),
      max_price: maxPriceInput.value.trim(),
    };
    const rows = await run(() => api.get('menus', params));
    if (!rows) return;
    menus = rows;
    renderMenus();
  }

  function renderCategories() {
    const allActive = selectedCategoryId === 'all';
    const html = [
      `<button type="button" class="side-link ${allActive ? 'active' : ''}" data-cat="all" style="width:100%; justify-content:space-between; border:0; background:${allActive ? 'var(--red-50)' : 'transparent'}; cursor:pointer">
         <span>ทั้งหมด</span>
         <span class="badge ${allActive ? 'badge-bad' : 'badge-off'}">${fmt.num(allMenusCount)}</span>
       </button>`,
      ...categories.map((cat, idx) => {
        const active = String(selectedCategoryId) === String(cat.id);
        return `
          <div class="row-between" style="padding:6px 8px; border-radius:var(--r-sm); background:${active ? 'var(--red-50)' : 'transparent'}">
            <button type="button" data-cat="${cat.id}" style="flex:1; text-align:left; border:0; background:transparent; cursor:pointer; font:inherit; color:${active ? 'var(--red-600)' : 'var(--brown-900)'}; font-weight:${active ? '600' : '400'}">
              ${fmt.esc(cat.name)}
              <span class="caption muted">(${fmt.num(cat.menu_count || 0)})</span>
            </button>
            ${isOwner ? `
              <div class="row" style="gap:4px">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-cat-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="เลื่อนขึ้น">↑</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-cat-down="${idx}" ${idx === categories.length - 1 ? 'disabled' : ''} title="เลื่อนลง">↓</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-cat-edit="${cat.id}" title="แก้ไขหมวด">✎</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-cat-del="${cat.id}" title="ซ่อนหมวด"><i data-icon="trash"></i></button>
              </div>
            ` : ''}
          </div>
        `;
      }),
    ].join('');
    categoryListEl.innerHTML = html;
  }

  function renderMenus() {
    if (!menus.length) {
      menuGridEl.innerHTML = `
        <div class="card empty" style="grid-column: 1 / -1">
          <div class="empty-icon"><i data-icon="dumpling"></i></div>
          <div>ไม่พบรายการเมนูที่ตรงกับเงื่อนไขการค้นหา</div>
        </div>`;
      return;
    }

    menuGridEl.innerHTML = menus.map((m) => {
      const qty = m.available_qty !== null && m.available_qty !== undefined ? Number(m.available_qty) : 0;
      const lotSize = Number(m.lot_size || 1);
      const isSoldOut = !m.is_available; // หมด = ปิดขาย
      const isTempOut = !isSoldOut && m.available_qty != null && qty <= 0; // หมดชั่วคราว ยังสั่งได้
      const isLow = !isSoldOut && !isTempOut && qty <= lotSize;
      const unitText = fmt.esc(m.unit || 'เข่ง');

      let stockBadge = badge('ok', `คงเหลือ ${fmt.num(qty)} ${m.unit || 'เข่ง'}`);
      if (isSoldOut || isTempOut) {
        stockBadge = isSoldOut ? badge('soldout', 'หมด (ปิดขาย)') : badge('temp_out', `หมดชั่วคราว (0 ${m.unit || 'เข่ง'})`);
      } else if (isLow) {
        stockBadge = badge('low', `ใกล้หมด ${fmt.num(qty)} ${m.unit || 'เข่ง'}`);
      }

      return `
        <article class="menu-card zone-${fmt.esc(m.kitchen_zone)} zone-border ${isSoldOut ? 'soldout' : ''}">
          <div class="menu-img">
            ${menuImage(m)}
            ${isSoldOut ? badge('soldout', 'หมด') : isTempOut ? badge('temp_out') : ''}
          </div>
          <div class="menu-body">
            <div class="row-between">
              <div class="menu-name">${fmt.esc(m.name)}</div>
              ${zoneChip(m.kitchen_zone)}
            </div>
            <div class="menu-desc">${fmt.esc(m.description || m.category_name || '-')}</div>

            <!-- ราคาพร้อมหน่วย และขนาดล็อต -->
            <div class="row-between" style="margin-top:4px">
              <div class="price">${fmt.baht(m.price)} <span class="small muted">/ ${unitText}</span></div>
              <div class="caption muted">1 ล็อต = ${fmt.num(lotSize)} ${unitText}</div>
            </div>

            <!-- แถบจัดการจำนวนคงเหลือ +1 ล็อต หรือกรอกเอง -->
            <div class="row-between" style="margin-top:8px; padding-top:8px; border-top:var(--line)">
              ${stockBadge}
              <div class="row" style="gap:4px">
                <button type="button" class="btn btn-secondary btn-sm" data-add-lot="${m.id}" title="เติม +1 ล็อต (+${lotSize} ${unitText})">
                  +1 ล็อต (+${fmt.num(lotSize)} ${unitText})
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-set-stock="${m.id}" title="กรอกจำนวนคงเหลือเอง">
                  กรอกเอง
                </button>
              </div>
            </div>

            <!-- แถวล่าง: สวิตช์เปิดขาย + ปุ่มแก้ไข/ลบ -->
            <div class="menu-foot" style="border-top:var(--line); margin-top:8px; padding-top:8px">
              <label class="row small bold" style="gap:8px; cursor:pointer">
                <span class="switch">
                  <input type="checkbox" data-toggle-avail="${m.id}" ${m.is_available ? 'checked' : ''}>
                  <span></span>
                </span>
                <span>${m.is_available ? 'เปิดขาย' : 'ปิดขาย'}</span>
              </label>
              ${isOwner ? `
                <div class="row" style="gap:4px">
                  <button type="button" class="btn btn-secondary btn-sm" data-edit-menu="${m.id}">แก้ไข</button>
                  <button type="button" class="btn btn-danger btn-sm" data-del-menu="${m.id}">ลบ</button>
                </div>
              ` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  /* ---------- Modal หมวดหมู่ ---------- */
  function openCategoryModal(cat = null) {
    const isEdit = Boolean(cat);
    const m = openModal({
      title: isEdit ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่',
      body: `
        <form id="catForm">
          <div class="field">
            <label for="catName">ชื่อหมวดหมู่</label>
            <input class="input" id="catName" name="name" required maxlength="100" value="${fmt.esc(cat ? cat.name : '')}" placeholder="เช่น ซาลาเปา">
          </div>
        </form>`,
      footer: `
        <button type="button" class="btn btn-secondary" data-close>ยกเลิก</button>
        <button type="submit" class="btn" form="catForm">ยืนยัน</button>`,
    });

    m.el.querySelector('#catForm').onsubmit = async (e) => {
      e.preventDefault();
      const name = m.el.querySelector('#catName').value.trim();
      if (!name) return;
      const payload = isEdit
        ? { action: 'update', id: cat.id, name, sort_order: cat.sort_order }
        : { action: 'create', name };
      const res = await run(() => api.post('categories', payload));
      if (res) {
        m.close();
        await loadCategories();
        await loadMenus();
      }
    };
  }

  /* ---------- Modal เพิ่ม/แก้ไขเมนู (640px modal-lg + กันชื่อซ้ำ/คล้าย Feedback #3) ---------- */
  function openMenuModal(item = null) {
    const isEdit = Boolean(item);
    const defaultCatId = item
      ? item.category_id
      : (selectedCategoryId !== 'all' ? selectedCategoryId : (categories[0] && categories[0].id));
    const currentUnit = item ? item.unit : 'เข่ง';
    const currentZone = item ? item.kitchen_zone : 'steam';
    const unitOptions = UNITS.includes(currentUnit) ? UNITS : [currentUnit, ...UNITS];

    const m = openModal({
      title: isEdit ? `แก้ไขเมนู: ${fmt.esc(item.name)}` : 'เพิ่มเมนูใหม่',
      size: 'lg',
      body: `
        <form id="menuForm" enctype="multipart/form-data">
          <div class="grid grid-2">
            <div class="field">
              <label>รูปเมนู (อัตราส่วน 4:3 · ไม่เกิน 2MB)</label>
              <div class="menu-img" id="imgPreviewBox" style="margin:0">
                ${item ? menuImage(item) : '<i data-icon="dumpling"></i>'}
              </div>
              <input class="input" type="file" id="menuImgInput" name="image" accept="image/*" style="padding-top:8px">
            </div>

            <div>
              <div class="field">
                <label for="menuCat">หมวดหมู่</label>
                <select class="select" id="menuCat" name="category_id" required>
                  ${categories.map((c) => `<option value="${c.id}" ${String(c.id) === String(defaultCatId) ? 'selected' : ''}>${fmt.esc(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="menuName">ชื่อเมนู</label>
                <input class="input" id="menuName" name="name" required maxlength="100" value="${fmt.esc(item ? item.name : '')}" placeholder="เช่น ฮะเก๋ากุ้ง">
              </div>
              <div class="field">
                <label for="menuDesc">คำอธิบาย</label>
                <input class="input" id="menuDesc" name="description" maxlength="255" value="${fmt.esc(item && item.description ? item.description : '')}" placeholder="เช่น เข่งละ 3–4 ชิ้น">
              </div>
            </div>
          </div>

          <div class="grid grid-3">
            <div class="field">
              <label for="menuPrice">ราคา (บาท)</label>
              <input class="input" type="number" id="menuPrice" name="price" min="1" step="0.01" required value="${item ? Number(item.price) : 45}">
              <div class="caption text-red hidden" id="priceLogHint">* การแก้ราคาจะถูกบันทึก log ระดับ system</div>
            </div>

            <div class="field">
              <label for="menuUnit">หน่วย</label>
              <select class="select" id="menuUnit" name="unit">
                ${unitOptions.map((u) => `<option value="${fmt.esc(u)}" ${u === currentUnit ? 'selected' : ''}>${fmt.esc(u)}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="menuLotSize" id="lotSizeLabel">ขนาดล็อต (1 ล็อต = ${item ? item.lot_size : 5} ${fmt.esc(currentUnit)})</label>
              <input class="input" type="number" id="menuLotSize" name="lot_size" min="1" step="1" required value="${item ? Number(item.lot_size) : 5}">
            </div>
          </div>

          ${!isEdit ? `
            <div class="field">
              <label for="menuInitQty">จำนวนพร้อมขายเริ่มต้น</label>
              <input class="input" type="number" id="menuInitQty" name="available_qty" min="0" step="1" value="30">
            </div>
          ` : ''}

          <div class="field">
            <label>โซนครัว (4 โซน)</label>
            <input type="hidden" id="menuZoneInput" name="kitchen_zone" value="${fmt.esc(currentZone)}">
            <div class="grid grid-4" id="zonePicker">
              ${ZONE_LIST.map((z) => `
                <button type="button" class="chip zone-${z.code} ${z.code === currentZone ? 'active' : ''}" data-pick-zone="${z.code}" style="justify-content:center; height:40px">
                  <span class="zone-dot"></span>${z.label}
                </button>
              `).join('')}
            </div>
          </div>
        </form>`,
      footer: `
        <button type="button" class="btn btn-secondary" data-close>ยกเลิก</button>
        <button type="submit" class="btn" form="menuForm">ยืนยัน</button>`,
    });

    const priceInput = m.el.querySelector('#menuPrice');
    const priceLogHint = m.el.querySelector('#priceLogHint');
    const unitSelect = m.el.querySelector('#menuUnit');
    const lotInput = m.el.querySelector('#menuLotSize');
    const lotLabel = m.el.querySelector('#lotSizeLabel');
    const imgInput = m.el.querySelector('#menuImgInput');
    const imgPreviewBox = m.el.querySelector('#imgPreviewBox');
    const zoneInput = m.el.querySelector('#menuZoneInput');

    if (isEdit) {
      priceInput.oninput = () => {
        const changed = Number(priceInput.value) !== Number(item.price);
        priceLogHint.classList.toggle('hidden', !changed);
      };
    }

    const updateLotLabel = () => {
      lotLabel.textContent = `ขนาดล็อต (1 ล็อต = ${lotInput.value || 1} ${unitSelect.value})`;
    };
    unitSelect.onchange = updateLotLabel;
    lotInput.oninput = updateLotLabel;

    imgInput.onchange = () => {
      const f = imgInput.files && imgInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        imgPreviewBox.innerHTML = `<img src="${ev.target.result}" alt="พรีวิว">`;
      };
      reader.readAsDataURL(f);
    };

    m.el.querySelector('#zonePicker').onclick = (e) => {
      const btn = e.target.closest('[data-pick-zone]');
      if (!btn) return;
      const z = btn.dataset.pickZone;
      zoneInput.value = z;
      m.el.querySelectorAll('[data-pick-zone]').forEach((el) => {
        el.classList.toggle('active', el.dataset.pickZone === z);
      });
    };

    m.el.querySelector('#menuForm').onsubmit = async (e) => {
      e.preventDefault();
      const formEl = e.target;
      const makeFormData = (confirmSimilar = false) => {
        const fd = new FormData(formEl);
        fd.append('action', isEdit ? 'update' : 'create');
        if (isEdit) fd.append('id', String(item.id));
        if (confirmSimilar) fd.append('confirm_similar', '1');
        return fd;
      };

      try {
        const res = await api.upload('menus', makeFormData(false));
        if (api.lastMessage) toast(api.lastMessage);
        if (res) {
          m.close();
          await loadCategories();
          await loadMenus();
        }
      } catch (err) {
        if (err && err.data && err.data.need_confirm) {
          const simName = fmt.esc(err.data.similar || '');
          const yes = await confirmModal(
            `มีเมนูชื่อคล้าย: <b>${simName}</b> ยืนยันว่าเป็นคนละเมนู?`,
            'ยืนยันบันทึก',
            false
          );
          if (yes) {
            const res2 = await run(() => api.upload('menus', makeFormData(true)));
            if (res2) {
              m.close();
              await loadCategories();
              await loadMenus();
            }
          }
          return;
        }
        toast((err && err.message) || 'เกิดข้อผิดพลาด', 'error');
      }
    };
  }

  /* ---------- Modal กรอกจำนวนคงเหลือเอง ---------- */
  function openSetStockModal(item) {
    const unit = fmt.esc(item.unit || 'เข่ง');
    const currentQty = Number(item.available_qty || 0);
    const m = openModal({
      title: `ปรับจำนวนพร้อมขาย: ${fmt.esc(item.name)}`,
      body: `
        <form id="stockForm">
          <div class="field">
            <label for="stockQtyInput">จำนวนคงเหลือจริง (${unit})</label>
            <input class="input" type="number" id="stockQtyInput" min="0" step="1" required value="${currentQty}">
            <div class="caption muted">
              1 ล็อต = ${fmt.num(item.lot_size)} ${unit} · ใส่ <strong>0</strong> = หมดชั่วคราว (ลูกค้ายังสั่งได้ รอนานขึ้น) · ถ้าจะหยุดขายให้กดสวิตช์ปิดขาย
            </div>
          </div>
        </form>`,
      footer: `
        <button type="button" class="btn btn-secondary" data-close>ยกเลิก</button>
        <button type="submit" class="btn" form="stockForm">บันทึกจำนวน</button>`,
    });

    m.el.querySelector('#stockForm').onsubmit = async (e) => {
      e.preventDefault();
      const val = Number(m.el.querySelector('#stockQtyInput').value);
      const res = await run(() => api.post('menus', {
        action: 'set_stock',
        id: item.id,
        available_qty: val,
      }));
      if (res) {
        m.close();
        await loadMenus();
      }
    };
  }

  /* ---------- Event Listeners ---------- */
  addCategoryBtn.onclick = () => openCategoryModal();
  addMenuBtn.onclick = () => openMenuModal();

  const triggerFilter = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadMenus, 300);
  };
  searchInput.oninput = triggerFilter;
  minPriceInput.oninput = triggerFilter;
  maxPriceInput.oninput = triggerFilter;

  clearFilterBtn.onclick = () => {
    searchInput.value = '';
    minPriceInput.value = '';
    maxPriceInput.value = '';
    selectedCategoryId = 'all';
    selectedZone = 'all';
    zoneFilterBar.querySelectorAll('[data-zone]').forEach((el) => {
      el.classList.toggle('active', el.dataset.zone === 'all');
    });
    renderCategories();
    loadMenus();
  };

  zoneFilterBar.onclick = (e) => {
    const btn = e.target.closest('[data-zone]');
    if (!btn) return;
    selectedZone = btn.dataset.zone;
    zoneFilterBar.querySelectorAll('[data-zone]').forEach((el) => {
      el.classList.toggle('active', el.dataset.zone === selectedZone);
    });
    loadMenus();
  };

  categoryListEl.onclick = async (e) => {
    const catBtn = e.target.closest('[data-cat]');
    if (catBtn) {
      selectedCategoryId = catBtn.dataset.cat;
      renderCategories();
      await loadMenus();
      return;
    }

    const upBtn = e.target.closest('[data-cat-up]');
    if (upBtn) {
      const idx = Number(upBtn.dataset.catUp);
      if (idx > 0) {
        const ids = categories.map((c) => c.id);
        [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
        if (await run(() => api.post('categories', { action: 'reorder', ids }))) {
          await loadCategories();
          await loadMenus();
        }
      }
      return;
    }

    const downBtn = e.target.closest('[data-cat-down]');
    if (downBtn) {
      const idx = Number(downBtn.dataset.catDown);
      if (idx < categories.length - 1) {
        const ids = categories.map((c) => c.id);
        [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
        if (await run(() => api.post('categories', { action: 'reorder', ids }))) {
          await loadCategories();
          await loadMenus();
        }
      }
      return;
    }

    const editBtn = e.target.closest('[data-cat-edit]');
    if (editBtn) {
      const cat = categories.find((c) => String(c.id) === String(editBtn.dataset.catEdit));
      if (cat) openCategoryModal(cat);
      return;
    }

    const delBtn = e.target.closest('[data-cat-del]');
    if (delBtn) {
      const cat = categories.find((c) => String(c.id) === String(delBtn.dataset.catDel));
      if (!cat) return;
      if (Number(cat.menu_count || 0) > 0) {
        toast(`ซ่อนหมวด "${cat.name}" ไม่ได้ เนื่องจากยังมีเมนูในหมวดนี้อยู่ ${cat.menu_count} รายการ`, 'error');
        return;
      }
      if (await confirmModal(`ต้องการซ่อนหมวดหมู่ "${fmt.esc(cat.name)}" หรือไม่?`, 'ซ่อนหมวด', true)) {
        const res = await run(() => api.post('categories', { action: 'delete', id: cat.id }));
        if (res) {
          if (String(selectedCategoryId) === String(cat.id)) selectedCategoryId = 'all';
          await loadCategories();
          await loadMenus();
        }
      }
    }
  };

  menuGridEl.onclick = async (e) => {
    const addLotBtn = e.target.closest('[data-add-lot]');
    if (addLotBtn) {
      const id = Number(addLotBtn.dataset.addLot);
      const res = await run(() => api.post('menus', { action: 'add_stock', id, lots: 1 }));
      if (res) await loadMenus();
      return;
    }

    const setStockBtn = e.target.closest('[data-set-stock]');
    if (setStockBtn) {
      const item = menus.find((m) => Number(m.id) === Number(setStockBtn.dataset.setStock));
      if (item) openSetStockModal(item);
      return;
    }

    const editBtn = e.target.closest('[data-edit-menu]');
    if (editBtn) {
      const item = menus.find((m) => Number(m.id) === Number(editBtn.dataset.editMenu));
      if (item) openMenuModal(item);
      return;
    }

    const delBtn = e.target.closest('[data-del-menu]');
    if (delBtn) {
      const item = menus.find((m) => Number(m.id) === Number(delBtn.dataset.delMenu));
      if (!item) return;
      if (await confirmModal(`ยืนยันการลบเมนู "${fmt.esc(item.name)}" (${fmt.baht(item.price)} / ${fmt.esc(item.unit)})?`, 'ลบเมนู', true)) {
        const res = await run(() => api.post('menus', { action: 'delete', id: item.id }));
        if (res) {
          await loadCategories();
          await loadMenus();
        }
      }
    }
  };

  menuGridEl.onchange = async (e) => {
    const toggle = e.target.closest('[data-toggle-avail]');
    if (!toggle) return;
    const id = Number(toggle.dataset.toggleAvail);
    const isAvailable = toggle.checked ? 1 : 0;
    const menu = menus.find((x) => Number(x.id) === id);
    const name = menu ? fmt.esc(menu.name) : 'เมนูนี้';
    const yes = await confirmModal(isAvailable
      ? `เปิดขาย <b>${name}</b>?<br><span class="small muted">ลูกค้าจะเห็นและสั่งเมนูนี้ได้</span>`
      : `ปิดขาย <b>${name}</b>?<br><span class="small muted">ลูกค้าจะเห็นเมนูนี้เป็น "หมด" และสั่งไม่ได้</span>`,
      isAvailable ? 'เปิดขาย' : 'ปิดขาย', !isAvailable);
    if (!yes) { toggle.checked = !toggle.checked; return; }
    const res = await run(() => api.post('menus', { action: 'set_available', id, is_available: isAvailable }));
    await loadMenus();
    if (!res) toggle.checked = !toggle.checked;
  };

  await loadCategories();
  await loadMenus();
})();
