/* =========================================================
   public/assets/js/prep-plans.js — หน้าแผนเตรียมของประจำวัน (FR-45, 46 · BR-24 · UC-40)
   - แสดงยอดขายวันนี้, ค่าเฉลี่ยวันเดียวกันย้อนหลัง 4 สัปดาห์, ยอดแนะนำ (+10% ปัดขึ้น)
   - ปุ่ม "ใช้ค่าแนะนำทั้งหมด" และปุ่ม "ยืนยันแผนเตรียมของ"
   - เมื่อกดยืนยัน ระบบบันทึก confirmed_qty ลง prep_plans และตั้งเป็น available_qty เริ่มต้นของวัน
   ========================================================= */
(async () => {
  const me = await initStaffPage({
    title: 'แผนเตรียมของ',
    roles: ['manager', 'owner'],
  });
  if (!me) return;

  const statMenuCountEl = document.getElementById('statMenuCount');
  const statSuggestedTotalEl = document.getElementById('statSuggestedTotal');
  const statConfirmedStatusEl = document.getElementById('statConfirmedStatus');
  const statConfirmedSubEl = document.getElementById('statConfirmedSub');
  const planDateInput = document.getElementById('planDateInput');
  const historyRangeHint = document.getElementById('historyRangeHint');
  const applySuggestedBtn = document.getElementById('applySuggestedBtn');
  const confirmPlanBtn = document.getElementById('confirmPlanBtn');
  const zoneTabsEl = document.getElementById('zoneTabs');
  const catSelectEl = document.getElementById('catSelect');
  const searchInputEl = document.getElementById('searchInput');
  const prepRowsEl = document.getElementById('prepRows');

  let planDate = '';
  let planItems = [];
  // เก็บค่าที่ผู้ใช้กรอก/แก้ไขในช่องยืนยันแยกตาม menu_item_id
  const draftQtyMap = new Map();
  let selectedZone = 'all';
  let selectedCat = 'all';
  let searchQuery = '';

  async function loadCategories() {
    const cats = await run(() => api.get('categories'));
    if (!cats) return;
    catSelectEl.innerHTML = [
      '<option value="all">ทุกหมวดอาหาร</option>',
      ...cats.map((c) => `<option value="${c.id}">${fmt.esc(c.name)}</option>`),
    ].join('');
  }

  async function loadPrepPlan(targetDate = '') {
    const data = await run(() => api.get('prep_plans', targetDate ? { date: targetDate } : {}));
    if (!data) return;

    planDate = data.plan_date;
    planDateInput.value = planDate;
    planItems = data.items || [];

    if (data.history_dates) {
      const h = data.history_dates;
      historyRangeHint.textContent = `เทียบวันเดียวกัน 4 สัปดาห์ก่อน (${fmt.date(h.w4_date)} – ${fmt.date(h.w1_date)})`;
    }

    draftQtyMap.clear();
    planItems.forEach((it) => {
      const initialVal = it.confirmed_qty !== null && it.confirmed_qty !== undefined
        ? Number(it.confirmed_qty)
        : Number(it.suggested_qty || 0);
      draftQtyMap.set(Number(it.menu_item_id), initialVal);
    });

    renderPrepTable();
  }

  function getFilteredItems() {
    const q = searchQuery.trim().toLowerCase();
    return planItems.filter((it) => {
      if (selectedZone !== 'all' && it.kitchen_zone !== selectedZone) return false;
      if (selectedCat !== 'all' && String(it.category_id) !== String(selectedCat)) return false;
      if (q && !String(it.menu_name || '').toLowerCase().includes(q) && !String(it.category_name || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }

  function renderPrepTable() {
    const filtered = getFilteredItems();

    const totalSuggested = planItems.reduce((sum, it) => sum + Number(it.suggested_qty || 0), 0);
    const confirmedItems = planItems.filter((it) => it.confirmed_qty !== null && it.confirmed_qty !== undefined);
    const totalDraft = planItems.reduce(
      (sum, it) => sum + Number(draftQtyMap.get(Number(it.menu_item_id)) ?? it.suggested_qty ?? 0),
      0
    );

    statMenuCountEl.textContent = fmt.num(planItems.length);
    statSuggestedTotalEl.textContent = fmt.num(totalSuggested);

    if (confirmedItems.length === planItems.length && planItems.length > 0) {
      const byName = confirmedItems[0].confirmed_by_name ? ` โดย ${confirmedItems[0].confirmed_by_name}` : '';
      statConfirmedStatusEl.textContent = `ยืนยันแล้ว (${fmt.num(totalDraft)})`;
      statConfirmedSubEl.textContent = `ยืนยันครบ ${fmt.num(confirmedItems.length)} เมนู${byName}`;
    } else if (confirmedItems.length > 0) {
      statConfirmedStatusEl.textContent = `ยืนยันบางส่วน (${confirmedItems.length}/${planItems.length})`;
      statConfirmedSubEl.textContent = 'กดยืนยันแผนเตรียมของเพื่ออัปเดตจำนวนพร้อมขาย';
    } else {
      statConfirmedStatusEl.textContent = 'รอยืนยันแผน';
      statConfirmedSubEl.textContent = `ยอดที่กรอกรวม ${fmt.num(totalDraft)} หน่วย · กดยืนยันเพื่อตั้งเป็นจำนวนพร้อมขายเริ่มต้น`;
    }

    if (!filtered.length) {
      prepRowsEl.innerHTML = `
        <tr><td colspan="8">
          <div class="empty">
            <div class="empty-icon"><i data-icon="clipboard"></i></div>
            <div>ไม่พบรายการเมนูตามตัวกรองที่เลือก</div>
          </div>
        </td></tr>`;
      return;
    }

    prepRowsEl.innerHTML = filtered.map((it) => {
      const id = Number(it.menu_item_id);
      const unit = fmt.esc(it.unit || 'เข่ง');
      const draftVal = Number(draftQtyMap.get(id) ?? it.suggested_qty ?? 0);
      const isConfirmed = it.confirmed_qty !== null && it.confirmed_qty !== undefined;
      const avgText = Number(it.avg_4weeks || 0).toLocaleString('th-TH', { maximumFractionDigits: 1 });
      const wBreakdown = `สัปดาห์ -1: ${it.w1_qty}, -2: ${it.w2_qty}, -3: ${it.w3_qty}, -4: ${it.w4_qty}`;

      return `
        <tr>
          <td>
            <div class="bold">${fmt.esc(it.menu_name)}</div>
            <div class="caption muted">1 ล็อต = ${fmt.num(it.lot_size)} ${unit}</div>
          </td>
          <td>
            <div class="small">${fmt.esc(it.category_name)}</div>
            ${zoneChip(it.kitchen_zone)}
          </td>
          <td class="num">
            <span class="bold">${fmt.num(it.sold_today)}</span>
            <span class="small muted">${unit}</span>
          </td>
          <td class="num" title="${fmt.esc(wBreakdown)}">
            <span>${avgText}</span>
            <span class="small muted">${unit}</span>
            <div class="caption muted">(${it.w4_qty}/${it.w3_qty}/${it.w2_qty}/${it.w1_qty})</div>
          </td>
          <td class="num">
            <span class="bold text-red">${fmt.num(it.suggested_qty)}</span>
            <span class="small muted">${unit}</span>
          </td>
          <td class="num">
            <span>${it.available_qty !== null ? fmt.num(it.available_qty) : 'ไม่จำกัด'}</span>
            <span class="small muted">${it.available_qty !== null ? unit : ''}</span>
          </td>
          <td>
            <div class="row" style="gap:6px; flex-wrap:nowrap">
              <input
                type="number"
                class="input"
                min="0"
                step="1"
                data-confirm-input="${id}"
                value="${draftVal}"
                style="width:110px; height:36px; text-align:right"
              >
              <span class="small muted" style="min-width:28px">${unit}</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-use-suggested="${id}"
                title="ใช้ค่าแนะนำ (${fmt.num(it.suggested_qty)} ${unit})"
                style="padding:0 8px"
              >ใช้แนะนำ</button>
            </div>
          </td>
          <td>
            ${isConfirmed
              ? `<span class="badge badge-ok">ยืนยันแล้ว (${fmt.num(it.confirmed_qty)} ${unit})</span>`
              : `<span class="badge badge-wait">รอยืนยัน</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  planDateInput.onchange = () => {
    if (planDateInput.value) {
      loadPrepPlan(planDateInput.value);
    }
  };

  zoneTabsEl.onclick = (e) => {
    const tab = e.target.closest('[data-zone]');
    if (!tab) return;
    selectedZone = tab.dataset.zone;
    zoneTabsEl.querySelectorAll('[data-zone]').forEach((el) => {
      el.classList.toggle('active', el.dataset.zone === selectedZone);
    });
    renderPrepTable();
  };

  catSelectEl.onchange = () => {
    selectedCat = catSelectEl.value;
    renderPrepTable();
  };

  searchInputEl.oninput = () => {
    searchQuery = searchInputEl.value;
    renderPrepTable();
  };

  prepRowsEl.oninput = (e) => {
    const inp = e.target.closest('[data-confirm-input]');
    if (!inp) return;
    const id = Number(inp.dataset.confirmInput);
    const val = Math.max(0, Math.floor(Number(inp.value) || 0));
    draftQtyMap.set(id, val);
  };

  prepRowsEl.onclick = (e) => {
    const btn = e.target.closest('[data-use-suggested]');
    if (!btn) return;
    const id = Number(btn.dataset.useSuggested);
    const item = planItems.find((x) => Number(x.menu_item_id) === id);
    if (!item) return;
    draftQtyMap.set(id, Number(item.suggested_qty || 0));
    renderPrepTable();
  };

  applySuggestedBtn.onclick = () => {
    planItems.forEach((it) => {
      draftQtyMap.set(Number(it.menu_item_id), Number(it.suggested_qty || 0));
    });
    renderPrepTable();
    toast('นำค่าแนะนำ (+10%) มาใส่ในช่องยืนยันทุกเมนูแล้ว');
  };

  confirmPlanBtn.onclick = async () => {
    if (!planItems.length) return;

    const payloadItems = planItems.map((it) => {
      const id = Number(it.menu_item_id);
      const qty = Math.max(0, Math.floor(Number(draftQtyMap.get(id) ?? it.suggested_qty ?? 0)));
      return { menu_item_id: id, confirmed_qty: qty };
    });

    const totalQty = payloadItems.reduce((s, x) => s + x.confirmed_qty, 0);
    const yes = await confirmModal(
      `ยืนยันแผนเตรียมของวันที่ <b>${fmt.date(planDate)}</b> จำนวน <b>${fmt.num(payloadItems.length)} เมนู</b> (รวม <b>${fmt.num(totalQty)} หน่วย</b>)?<br><span class="small muted">จำนวนที่ยืนยันจะถูกตั้งเป็นจำนวนพร้อมขายเริ่มต้นของวันทันที</span>`,
      'ยืนยันแผนเตรียมของ',
      false
    );
    if (!yes) return;

    const res = await run(() => api.post('prep_plans', {
      action: 'confirm',
      date: planDate,
      items: payloadItems,
    }));
    if (res) {
      await loadPrepPlan(planDate);
    }
  };

  await loadCategories();
  await loadPrepPlan();
})();
