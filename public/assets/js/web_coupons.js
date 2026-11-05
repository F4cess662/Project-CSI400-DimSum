const COUPON_API = "/api/coupons";
const couponList = document.getElementById("list");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function discountText(coupon) {
  if (coupon.coupon_type === "percent") return `ลด ${Number(coupon.value)}%`;
  if (coupon.coupon_type === "amount" || coupon.coupon_type === "fixed") {
    return `ลด ${Number(coupon.value).toLocaleString("th-TH")} บาท`;
  }
  if (coupon.coupon_type === "free_item") {
    return `รับ${coupon.free_item_name || "เมนู"}ฟรี`;
  }
  return escapeHtml(coupon.coupon_type);
}

/** '2027-12-31' → '31 ธ.ค. 2570' (แบบเดียวกับหน้าบัญชีสมาชิก) */
function thaiDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function renderCoupons(coupons, isLoggedIn) {
  if (!coupons.length) {
    couponList.innerHTML = '<p class="coupon-message">ยังไม่มีคูปองให้เก็บในขณะนี้</p>';
    return;
  }

  couponList.innerHTML = coupons.map((coupon) => {
    const disabled = coupon.collected || coupon.sold_out;
    const label = coupon.collected ? "เก็บแล้ว" : coupon.sold_out ? "หมดแล้ว" : "เก็บคูปอง";
    const time = coupon.valid_time_start && coupon.valid_time_end
      ? `<p class="meta">เวลา ${escapeHtml(String(coupon.valid_time_start).slice(0, 5))} - ${escapeHtml(String(coupon.valid_time_end).slice(0, 5))}</p>`
      : "";
    const memberOnly = coupon.member_only ? '<p class="meta">เฉพาะสมาชิก</p>' : "";
    const collectControl = isLoggedIn
      ? `<button type="button" data-collect="${Number(coupon.id)}" ${disabled ? "disabled" : ""}>${label}</button>`
      : '<a class="coupon-collect" href="/loginMember">เข้าสู่ระบบเพื่อเก็บคูปอง</a>';

    return `
      <article class="card">
        <span class="tag">${escapeHtml(coupon.code)}</span>
        <div class="discount">${discountText(coupon)}</div>
        <p class="meta">ขั้นต่ำ ${Number(coupon.min_spend).toLocaleString("th-TH")} บาท</p>
        <p class="meta">ใช้ได้ถึง ${escapeHtml(thaiDate(coupon.end_date))}</p>
        ${time}
        ${memberOnly}
        ${collectControl}
      </article>`;
  }).join("");
}

async function loadCoupons() {
  try {
    const response = await fetch(COUPON_API);
    const result = await response.json();

    if (response.status === 401) {
      couponList.innerHTML = '<p class="coupon-message">กรุณาเข้าสู่ระบบสมาชิกเพื่อดูและเก็บคูปอง <a href="/loginMember">เข้าสู่ระบบ</a></p>';
      return;
    }
    if (!response.ok || !result.success) {
      throw new Error(result.message || "โหลดคูปองไม่สำเร็จ");
    }

    renderCoupons(result.data.coupons, result.data.isLoggedIn);
  } catch (error) {
    console.error("โหลดคูปองไม่สำเร็จ:", error);
    couponList.innerHTML = `<p class="coupon-message">${escapeHtml(error.message || "โหลดคูปองไม่สำเร็จ กรุณาลองอีกครั้ง")}</p>`;
  }
}

couponList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-collect]");
  if (!button || button.disabled) return;

  button.disabled = true;
  try {
    const response = await fetch(`${COUPON_API}/${encodeURIComponent(button.dataset.collect)}/collect`, {
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "เก็บคูปองไม่สำเร็จ");
    }
    await loadCoupons();
  } catch (error) {
    button.disabled = false;
    alert(error.message || "เก็บคูปองไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
});

loadCoupons();
