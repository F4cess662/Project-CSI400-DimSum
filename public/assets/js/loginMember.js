
let generatedOTP = "";

const phoneInput = document.getElementById("phone");
const loginParams = new URLSearchParams(window.location.search);
if (loginParams.has("phone")) phoneInput.value = loginParams.get("phone");
if (loginParams.get("registered") === "1") {
    alert("สมัครสมาชิกสำเร็จ กรุณายืนยันเบอร์โทรศัพท์เพื่อเข้าสู่ระบบ");
}

function sendOTP() {
    const phone = phoneInput.value.trim();

    if (!/^0[0-9]{9}$/.test(phone)) {
        alert("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง 10 หลัก");
        return;
    }

    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    alert("รหัส OTP ของคุณคือ: " + generatedOTP);

    document.getElementById("phoneSection").hidden = true;
    document.getElementById("otpSection").hidden = false;
}

async function verifyOTP() {
    const otp = document.getElementById("otp").value.trim();

    if (otp === "") {
        alert("กรุณากรอกรหัส OTP");
        return;
    }

    if (otp === generatedOTP) {
        const phone = phoneInput.value.trim();
        try {
            const response = await fetch("/api/members/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "login", phone }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "เข้าสู่ระบบไม่สำเร็จ");
            }

            localStorage.setItem("userPhone", phone);
            alert("เข้าสู่ระบบสำเร็จ ยินดีต้อนรับสู่ร้านนึ่งสุข");
            window.location.href = "/";
        } catch (error) {
            alert(error.message || "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
        }
    } else {
        alert("รหัส OTP ไม่ถูกต้อง กรุณาลองอีกครั้ง");
    }
}

function backToPhone() {
    generatedOTP = "";

    document.getElementById("otp").value = "";

    document.getElementById("otpSection").hidden = true;
    document.getElementById("phoneSection").hidden = false;
}
