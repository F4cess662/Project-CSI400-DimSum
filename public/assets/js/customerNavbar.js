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
});
