async function initStaffOrder() {
  const menuGrid = document.getElementById('menuGrid');
  const categoriesEl = document.getElementById('categories');
  const search = document.getElementById('search');
  const tableSelect = document.getElementById('table');
  const cartList = document.getElementById('cartList');
  const totalEl = document.getElementById('total');
  const message = document.getElementById('message');

  let menus = [];
  let activeCategory = 'all';
  const cart = new Map();
  const maxPerMenu = 10;
  const categoryOrder = ['ซาลาเปา', 'ขนมจีบ', 'ห่อสาหร่าย', 'ฮะเก๋า', 'เมนูจานหลัก', 'เมนูทอด', 'หมี่หยก', 'ชุดเซ็ต'];
  const basketCategories = new Set(['ซาลาเปา', 'ขนมจีบ', 'ห่อสาหร่าย', 'ฮะเก๋า', 'หมี่หยก']);
  const plateCategories = new Set(['เมนูจานหลัก', 'เมนูทอด']);

  const categoryLabel = (menu) => menu.category_name || 'อื่น ๆ';
  const unitLabel = (menu) => basketCategories.has(categoryLabel(menu)) ? 'เข่ง'
    : plateCategories.has(categoryLabel(menu)) ? 'จาน'
      : categoryLabel(menu) === 'ชุดเซ็ต' ? 'ชุด' : (menu.unit || 'รายการ');
  const hasStockLimit = (menu) => menu.available_qty !== null
    && menu.available_qty !== undefined
    && Number.isFinite(Number(menu.available_qty));
  const soldOut = (menu) => Number(menu.is_sold_out) === 1
    || (hasStockLimit(menu) && Number(menu.available_qty) <= 0);
  const maxQuantity = (menu) => Math.min(maxPerMenu,
    hasStockLimit(menu) ? Number(menu.available_qty) : maxPerMenu);
  const formatPrice = (price) => `${Number(price || 0).toLocaleString('th-TH')} ฿`;

  function drawCategories() {
    const categories = categoryOrder.filter((category) => menus.some((menu) => categoryLabel(menu) === category));
    categoriesEl.innerHTML = [
      `<button type="button" class="chip ${activeCategory === 'all' ? 'active' : ''}" data-category="all">ทั้งหมด</button>`,
      ...categories.map((category) => `<button type="button" class="chip ${activeCategory === category ? 'active' : ''}" data-category="${fmt.esc(category)}">${fmt.esc(category)}</button>`),
    ].join('');
  }

  function visibleMenus() {
    const query = search.value.trim().toLocaleLowerCase();
    return menus.filter((menu) => (activeCategory === 'all' || categoryLabel(menu) === activeCategory)
      && (!query || `${menu.name} ${categoryLabel(menu)}`.toLocaleLowerCase().includes(query)));
  }

  function drawMenus() {
    const items = visibleMenus();
    menuGrid.innerHTML = items.length
      ? items.map((menu) => {
        const quantity = cart.get(menu.id) || 0;
        const unavailable = soldOut(menu);
        const maxed = quantity >= maxQuantity(menu);
        return `<button type="button" class="menu-item ${unavailable ? 'soldout' : ''}" data-menu-id="${Number(menu.id)}" ${unavailable || maxed ? 'disabled' : ''}>
          ${unavailable ? '<span class="badge badge-bad">หมด</span>' : ''}
          <small>${fmt.esc(categoryLabel(menu))}</small>
          <strong>${fmt.esc(menu.name)}</strong>
          <span>${formatPrice(menu.price)} / ${fmt.esc(unitLabel(menu))}</span>
          ${quantity ? `<small>เลือกแล้ว ${fmt.num(quantity)} ${fmt.esc(unitLabel(menu))} (สูงสุด ${maxPerMenu})</small>` : ''}
        </button>`;
      }).join('')
      : '<p class="empty">ไม่พบเมนูที่เลือก</p>';
  }

  function drawCart() {
    const selected = [...cart.entries()]
      .map(([id, quantity]) => ({ menu: menus.find((item) => item.id === id), quantity }))
      .filter((entry) => entry.menu);
    const total = selected.reduce((sum, entry) => sum + Number(entry.menu.price) * entry.quantity, 0);

    cartList.innerHTML = selected.length
      ? selected.map(({ menu, quantity }) => {
        const canAdd = quantity < maxQuantity(menu);
        return `<li class="cart-row">
          <span class="cart-name">${fmt.esc(menu.name)}<small>${formatPrice(menu.price)} / ${fmt.esc(unitLabel(menu))}</small></span>
          <span class="qty">
            <button type="button" data-cart-action="decrease" data-menu-id="${Number(menu.id)}" aria-label="ลดจำนวน">−</button>
            <span>${fmt.num(quantity)}</span>
            <button type="button" data-cart-action="increase" data-menu-id="${Number(menu.id)}" aria-label="เพิ่มจำนวน" ${canAdd ? '' : 'disabled'}>+</button>
          </span>
        </li>`;
      }).join('')
      : '<li class="empty">ยังไม่มีเมนูในตะกร้า</li>';

    totalEl.textContent = formatPrice(total);
  }

  function setQuantity(menuId, delta) {
    const menu = menus.find((item) => item.id === menuId);
    if (!menu || soldOut(menu)) return;
    const current = cart.get(menuId) || 0;
    const next = Math.max(0, current + delta);
    if (next > maxQuantity(menu)) return;
    if (next) cart.set(menuId, next);
    else cart.delete(menuId);
    drawMenus();
    drawCart();
  }

  async function loadPlaces() {
    try {
      const [tables, rooms] = await Promise.all([
        api.get('tables'),
        api.get('vip_rooms'),
      ]);
      const tableOptions = tables.map((table) => ({
        value: `table:${Number(table.id)}`,
        label: `${table.code} · ${table.seats} ที่นั่ง · ${table.status === 'occupied' ? 'มีลูกค้า' : 'ว่าง'}`,
      }));
      const roomOptions = rooms.map((room) => ({
        value: `vip:${Number(room.id)}`,
        label: `${room.name} · ${room.seats} ที่นั่ง · ${room.status === 'occupied' ? 'มีลูกค้า' : 'ว่าง'}`,
      }));

      tableSelect.innerHTML = '<option value="">เลือกโต๊ะหรือห้อง</option>';
      if (tableOptions.length) {
        tableSelect.insertAdjacentHTML('beforeend', `<optgroup label="โต๊ะ">${tableOptions.map((option) =>
          `<option value="${option.value}">${fmt.esc(option.label)}</option>`).join('')}</optgroup>`);
      }
      if (roomOptions.length) {
        tableSelect.insertAdjacentHTML('beforeend', `<optgroup label="ห้อง VIP">${roomOptions.map((option) =>
          `<option value="${option.value}">${fmt.esc(option.label)}</option>`).join('')}</optgroup>`);
      }
      if (!tableOptions.length && !roomOptions.length) {
        tableSelect.innerHTML = '<option value="">ยังไม่มีโต๊ะหรือห้องที่เปิดใช้งาน</option>';
        tableSelect.disabled = true;
      }
    } catch (error) {
      tableSelect.innerHTML = `<option value="">โหลดโต๊ะและห้องไม่สำเร็จ: ${fmt.esc(error.message)}</option>`;
      tableSelect.disabled = true;
    }
  }

  async function loadMenus() {
    try {
      const result = await api.get('menu');
      menus = result.map((menu) => ({ ...menu, id: Number(menu.id) }))
        .filter((menu) => Number.isInteger(menu.id) && menu.id > 0);
      if (!menus.length) {
        menuGrid.innerHTML = '<p class="empty">ยังไม่มีเมนูที่เปิดขายจากหลังบ้าน</p>';
        categoriesEl.replaceChildren();
        return;
      }
      drawCategories();
      drawMenus();
    } catch (error) {
      menuGrid.innerHTML = `<p class="empty load-error">โหลดเมนูไม่สำเร็จ: ${fmt.esc(error.message)}</p>`;
      categoriesEl.replaceChildren();
    }
  }

  categoriesEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    drawCategories();
    drawMenus();
  });

  menuGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-id]');
    if (button && !button.disabled) setQuantity(Number(button.dataset.menuId), 1);
  });

  cartList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;
    setQuantity(Number(button.dataset.menuId), button.dataset.cartAction === 'increase' ? 1 : -1);
  });

  search.addEventListener('input', drawMenus);
  document.getElementById('clearBtn').addEventListener('click', () => {
    cart.clear();
    drawMenus();
    drawCart();
  });

  message.hidden = true;
  await Promise.all([loadPlaces(), loadMenus()]);
  drawCart();
}
