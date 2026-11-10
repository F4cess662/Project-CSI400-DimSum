const titles = { coupons: "คูปองของฉัน", points: "ประวัติแต้ม", usage: "ประวัติการใช้คูปอง" };
let filter = "all";
let accountData = null;
const title = document.getElementById("title");
const view = document.getElementById("view");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date);
}

// หน้านี้ไม่ได้โหลด api.js จึงจัดรูปแบบเงินเอง → "1,234 บาท"
const baht = (n) => `${Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

function couponValue(coupon) {
  if (coupon.coupon_type === "percent") return `ลด ${Number(coupon.value)}%`;
  if (coupon.coupon_type === "amount") {
    return `ลด ${baht(coupon.value)}`;
  }
  return `ฟรี${coupon.free_item_name || "สินค้า"}`;
}

function couponStatus(status) {
  return {
    available: ["ใช้ได้", "b-ok"],
    wait: ["รอเริ่ม", "b-wait"],
    used: ["ใช้แล้ว", "b-off"],
    expired: ["หมดอายุ", "b-off"],
  }[status] || ["ไม่พร้อมใช้", "b-off"];
}

/** ป้ายจำนวนคูปองที่ใช้ได้ข้างเมนู "คูปองของฉัน" · ไม่มีคูปองก็ซ่อนป้าย */
function setCouponCount(n) {
  const el = document.getElementById("cc");
  el.textContent = n || "";
  el.hidden = !n;
}

function renderCoupons() {
  const coupons = accountData.coupons;
  const availableCount = coupons.filter((coupon) => coupon.status === "available").length;
  setCouponCount(availableCount);
  if (!coupons.length) return '<p class="empty panel">ยังไม่มีคูปองในบัญชี</p>';

  return `<div class="grid">${coupons.map((coupon) => {
    const [statusText, statusClass] = couponStatus(coupon.status);
    const minSpend = Number(coupon.min_spend) > 0
      ? `<p>เมื่อซื้อครบ ${baht(coupon.min_spend)}</p>` : "";
    const value = escapeHtml(couponValue(coupon));
    return `<article class="ticket">
      <div class="info"><b class="code">${escapeHtml(coupon.code)}</b>
        <div class="val">${value}</div>${minSpend}
        <p>หมดอายุ ${escapeHtml(formatDate(coupon.expires_at))}</p>
        <span class="badge ${statusClass}">${statusText}</span>
      </div><div class="stub">${value}</div>
    </article>`;
  }).join("")}</div><p class="note">คูปองที่ใช้ได้ ${availableCount} ใบ</p>`;
}

function renderPoints() {
  const points = accountData.points.map((point) => ({
    ...point,
    amount: point.type === "earn" ? Math.abs(Number(point.points)) : -Math.abs(Number(point.points)),
  })).filter((point) => filter === "all" || (filter === "in" ? point.amount > 0 : point.amount < 0));
  const filters = [["all", "ทั้งหมด"], ["in", "ได้รับ"], ["out", "ใช้ไป"]];
  return `<div class="chips">${filters.map(([key, label]) =>
    `<button type="button" data-f="${key}" aria-pressed="${filter === key}">${label}</button>`).join("")}</div>
    <div class="panel">
      <header><span>แต้มคงเหลือ</span><strong>${Number(accountData.member.points_balance).toLocaleString("th-TH")} แต้ม</strong></header>
      ${points.length ? points.map((point) => {
        const description = point.type === "earn"
          ? `สะสมแต้ม${point.bill_no ? ` บิล ${point.bill_no}` : ""}`
          : point.type === "redeem"
            ? `แลกแต้ม${point.reward_name ? ` ${point.reward_name}` : ""}`
            : "แต้มหมดอายุ";
        return `<div class="row"><div>${escapeHtml(description)}<small>${escapeHtml(formatDate(point.created_at))}</small></div>
          <span class="${point.amount > 0 ? "plus" : "minus"}">${point.amount > 0 ? "+" : "−"}${Math.abs(point.amount)}</span>
        </div>`;
      }).join("") : '<div class="empty">ไม่มีรายการแต้ม</div>'}
    </div>`;
}

function renderUsage() {
  if (!accountData.usage.length) return '<div class="panel empty">ยังไม่มีประวัติการใช้คูปอง</div>';
  return `<div class="panel wrap"><table>
    <thead><tr><th>คูปอง</th><th>ส่วนลด</th><th>วันที่ใช้</th><th>เลขที่บิล</th><th>สถานะ</th></tr></thead>
    <tbody>${accountData.usage.map((usage) => `<tr>
      <td><b>${escapeHtml(usage.code)}</b></td>
      <td>${escapeHtml(couponValue(usage))}</td>
      <td>${escapeHtml(formatDate(usage.used_at))}</td>
      <td>${escapeHtml(usage.bill_no || "-")}</td>
      <td><span class="badge b-ok">ใช้แล้ว</span></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function render() {
  if (!accountData) return;
  const hash = location.hash.slice(1);
  const section = titles[hash] ? hash : "coupons";
  title.textContent = titles[section];
  view.innerHTML = {
    coupons: renderCoupons,
    points: renderPoints,
    usage: renderUsage,
  }[section]();
  document.querySelectorAll(".side a").forEach((link) =>
    link.dataset.v === section
      ? link.setAttribute("aria-current", "page")
      : link.removeAttribute("aria-current"));
}

view.addEventListener("click", (event) => {
  const button = event.target.closest("[data-f]");
  if (button) {
    filter = button.dataset.f;
    render();
  }
});
window.addEventListener("hashchange", render);

async function loadMemberAccount() {
  try {
    const response = await fetch("/api/members/me");
    const result = await response.json();
    if (response.status === 401) {
      window.location.href = "/loginMember";
      return;
    }
    if (!response.ok || !result.success) {
      throw new Error(result.message || "โหลดข้อมูลสมาชิกไม่สำเร็จ");
    }

    accountData = result.data;
    setCouponCount(accountData.coupons.filter((coupon) => coupon.status === "available").length);
    document.getElementById("memberName").textContent = accountData.member.name;
    document.getElementById("memberPhone").textContent = accountData.member.phone;
    document.getElementById("memberTier").textContent = {
      normal: "สมาชิกทั่วไป",
      silver: "สมาชิกเงิน",
      gold: "สมาชิกทอง",
    }[accountData.member.tier] || "สมาชิก";
    document.getElementById("memberPoints").textContent =
      Number(accountData.member.points_balance).toLocaleString("th-TH");
    document.getElementById("memberCode").textContent =
      `TS-${String(accountData.member.id).padStart(6, "0")}`;
    render();
  } catch (error) {
    title.textContent = "โหลดข้อมูลไม่สำเร็จ";
    view.innerHTML = `<div class="panel empty">${escapeHtml(error.message)} กรุณาโหลดหน้าใหม่</div>`;
  }
}

loadMemberAccount();
