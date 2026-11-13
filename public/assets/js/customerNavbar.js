function updateCustomerNavbar(isLoggedIn) {
    const loginLink = document.getElementById("navLogin");
    const accountLink = document.getElementById("navAccount");
    const couponLink = document.getElementById("navCoupon");
    const logoutButton = document.getElementById("navLogout");

    if (loginLink) loginLink.hidden = isLoggedIn;
    if (accountLink) accountLink.hidden = !isLoggedIn;
    if (couponLink) couponLink.hidden = !isLoggedIn;
    if (logoutButton) logoutButton.hidden = !isLoggedIn;
}

async function loadCustomerSession() {
    try {
        const response = await fetch("/api/members/session");
        if (response.status === 401) {
            localStorage.removeItem("userPhone");
            updateCustomerNavbar(false);
            return;
        }

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "ตรวจสอบสถานะสมาชิกไม่สำเร็จ");
        }

        localStorage.setItem("userPhone", result.data.phone);
        updateCustomerNavbar(true);
    } catch (error) {
        updateCustomerNavbar(false);
        console.error("ตรวจสอบสถานะสมาชิกไม่สำเร็จ:", error);
    }
}

async function logoutCustomer() {
    const logoutButton = document.getElementById("navLogout");
    if (logoutButton) logoutButton.disabled = true;

    try {
        const response = await fetch("/api/members/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "logout" }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "ออกจากระบบไม่สำเร็จ");
        }

        localStorage.removeItem("userPhone");
        window.location.href = "/";
    } catch (error) {
        if (logoutButton) logoutButton.disabled = false;
        alert(error.message || "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadCustomerSession();
    const logoutButton = document.getElementById("navLogout");
    if (logoutButton) logoutButton.addEventListener("click", logoutCustomer);
    markActiveNav();
    renderSiteFooter();
});

/* =========================================================
   เมนู navbar: ไฮไลต์หน้าที่เปิดอยู่
   ========================================================= */
function markActiveNav() {
    const here = location.pathname.replace(/\/index\.html$/, "/");
    const isHome = here === "/" || here.endsWith("/web_homePage.html");
    document.querySelectorAll(".nav-menu a, .nav-login a").forEach((a) => {
        const target = new URL(a.getAttribute("href"), location.origin).pathname;
        const active = target === "/" ? isHome : here === target;
        a.classList.toggle("active", active);
        if (active) a.setAttribute("aria-current", "page");
    });
}

/* =========================================================
   Footer กลางของหน้าลูกค้า (ทุกหน้าที่โหลดไฟล์นี้ใช้ footer เดียวกัน)
   - หน้าไหนมี <footer class="footer"> จะเติมเนื้อหาให้ · ไม่มีจะสร้างต่อท้ายหน้าให้เอง
   - เบอร์โทร อีเมล ที่อยู่ เวลาเปิด-ปิด อ่านจาก GET /api/settings (เจ้าของแก้ได้ที่หน้าตั้งค่าร้าน)
   - LINE ยังไม่มีในตั้งค่าร้าน → ตั้งค่าไว้ที่ SHOP_LINE_ID ด้านล่าง
   ========================================================= */
const SHOP_LINE_ID = "@nuengsuk";
const FOOTER_DEFAULTS = {
    shop_name: "นึ่งสุข",
    phone: "",
    email: "",
    address: "",
    morning_open: "10:00", morning_last_order: "13:30", morning_close: "14:00",
    evening_open: "16:00", evening_last_order: "19:30", evening_close: "20:00",
};

const footerEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const footerTime = (t) => String(t || "").slice(0, 5);

const FOOTER_ICONS = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    line: '<path d="M21 10.6C21 6.4 16.97 3 12 3S3 6.4 3 10.6c0 3.75 3.2 6.9 7.53 7.5.29.06.69.2.79.45.09.23.06.58.03.81l-.13.8c-.04.23-.18.92.8.5.98-.41 5.3-3.12 7.23-5.35C20.5 13.84 21 12.29 21 10.6z"/><path d="M7.5 9v3.2h2M11 9v3.2M13 12.2V9l2.5 3.2V9M19 9h-2v3.2h2M17 10.6h1.8"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const footerIcon = (name) => `<svg class="footer-icon" viewBox="0 0 24 24" aria-hidden="true">${FOOTER_ICONS[name]}</svg>`;

function footerHtml(s) {
    const tel = String(s.phone || "").replace(/[^\d+]/g, "");
    const lineUrl = "https://line.me/R/ti/p/" + encodeURIComponent(SHOP_LINE_ID);
    const mapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((s.shop_name || "") + " " + (s.address || ""));
    const year = new Date().getFullYear() + 543;
    const contact = [
        s.phone && `<li><a href="tel:${footerEsc(tel)}">${footerIcon("phone")}<span><small>โทร</small>${footerEsc(s.phone)}</span></a></li>`,
        `<li><a href="${lineUrl}" target="_blank" rel="noopener">${footerIcon("line")}<span><small>LINE</small>${footerEsc(SHOP_LINE_ID)}</span></a></li>`,
        s.email && `<li><a href="mailto:${footerEsc(s.email)}">${footerIcon("mail")}<span><small>อีเมล</small>${footerEsc(s.email)}</span></a></li>`,
        s.address && `<li><a href="${mapUrl}" target="_blank" rel="noopener">${footerIcon("pin")}<span><small>ที่อยู่ (ดูแผนที่)</small>${footerEsc(s.address)}</span></a></li>`,
    ].filter(Boolean).join("");

    return `
    <div class="footer-inner">
        <section class="footer-col footer-about">
            <a href="/" class="footer-logo-row" aria-label="หน้าแรก">
                <span class="logo footer-logo"></span>
                <span><b>${footerEsc(s.shop_name || "นึ่งสุข")}</b><small>NUENG SUK DIM SUM</small></span>
            </a>
            <h2>เกี่ยวกับเรา</h2>
            <p>ร้านติ่มซำนึ่งสดใหม่ทุกวัน ซาลาเปา ขนมจีบ ฮะเก๋า และเมนูจานหลักสไตล์จีน
               ใช้วัตถุดิบคุณภาพ นึ่งร้อน ๆ เสิร์ฟถึงโต๊ะ มีห้อง VIP สำหรับจัดเลี้ยงสูงสุด 15 ท่าน</p>
        </section>

        <nav class="footer-col" aria-label="ลิงก์ในเว็บไซต์">
            <h2>เมนูลัด</h2>
            <ul class="footer-links">
                <li><a href="/">หน้าแรก</a></li>
                <li><a href="/customer/web_menu.html">เมนูอาหาร</a></li>
                <li><a href="/customer/web_catering.html">จัดเลี้ยง · ห้อง VIP</a></li>
                <li><a href="/loginMember">สมัครสมาชิก · สะสมแต้ม</a></li>
            </ul>
        </nav>

        <section class="footer-col">
            <h2>เวลาเปิด-ปิด</h2>
            <ul class="footer-hours">
                <li>${footerIcon("clock")}<span><b>กะเช้า ${footerTime(s.morning_open)}–${footerTime(s.morning_close)} น.</b>
                    <small>ปิดรับออเดอร์ ${footerTime(s.morning_last_order)} น.</small></span></li>
                <li>${footerIcon("clock")}<span><b>กะเย็น ${footerTime(s.evening_open)}–${footerTime(s.evening_close)} น.</b>
                    <small>ปิดรับออเดอร์ ${footerTime(s.evening_last_order)} น.</small></span></li>
            </ul>
            <p class="footer-note">พักร้าน ${footerTime(s.morning_close)}–${footerTime(s.evening_open)} น. · เปิดทุกวัน (ยกเว้นวันหยุดที่ประกาศ)</p>
        </section>

        <section class="footer-col">
            <h2>ติดต่อเรา</h2>
            <ul class="footer-contact-list">${contact}</ul>
        </section>
    </div>
    <div class="footer-bottom">
        <span>© ${year} ร้าน${footerEsc(s.shop_name || "นึ่งสุข")} · สงวนลิขสิทธิ์</span>
        <span>สะสมแต้ม 100 บาท = 1 แต้ม · จองห้อง VIP ทางโทรศัพท์</span>
    </div>`;
}

async function renderSiteFooter() {
    let footer = document.querySelector("footer.footer");
    if (!footer) {
        footer = document.createElement("footer");
        footer.className = "footer";
        document.body.appendChild(footer);
    }
    footer.classList.add("site-footer");
    footer.innerHTML = footerHtml(FOOTER_DEFAULTS);   // แสดงทันที แล้วค่อยแทนด้วยข้อมูลจริงของร้าน
    try {
        const res = await fetch("/api/settings").then((r) => r.json());
        if (res.success && res.data) footer.innerHTML = footerHtml({ ...FOOTER_DEFAULTS, ...res.data });
    } catch (e) {
        console.warn("โหลดข้อมูลร้านสำหรับ footer ไม่สำเร็จ ใช้ค่ามาตรฐาน", e);
    }
}
