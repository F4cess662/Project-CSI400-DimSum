// หน้าจัดเลี้ยง /customer/web_catering.html
// แพ็กเกจห้อง VIP จาก GET /api/vip_packages (คนที่ 4) · เบอร์ร้าน เวลาเปิด-ปิด % มัดจำ จาก GET /api/settings
// หน้านี้ไม่ได้โหลด api.js จึงมี esc / baht / fetch ของตัวเอง

const MAX_GUESTS = 15;          // ห้อง VIP ขนาดเดียว 15 ท่าน (vip_rooms.seats)
const SETUP_MINUTES = 10;       // ใช้ห้องได้ถึง :50 รวมเวลาจัดห้อง 10 นาที

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท';
const getJson = (url) => fetch(url).then((r) => r.json());

/** 'HH:MM:SS' → นาทีตั้งแต่เที่ยงคืน */
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
/** นาที → 'HH:MM' */
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const range = (a, b) => `${hhmm(a)}–${hhmm(b)}`;
const fillAll = (selector, text) => document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });

/** ช่วงเวลาที่ใช้ห้องได้ของแพ็กเกจ เช่น S เริ่มเปิดร้าน 10:00 → "10:00–11:50" */
function usableWindow(pkg, s) {
    const mOpen = toMin(s.morning_open), mClose = toMin(s.morning_close);
    const eOpen = toMin(s.evening_open), eClose = toMin(s.evening_close);
    if (pkg.hours == null) {
        return `${range(mOpen, mClose - SETUP_MINUTES)} และ ${range(eOpen, eClose - SETUP_MINUTES)}`;
    }
    return `เช่น ${range(mOpen, mOpen + pkg.hours * 60 - SETUP_MINUTES)}`;
}

function packageCard(pkg, s) {
    const pct = Number(s.vip_deposit_percent ?? 50);
    const isFullDay = pkg.hours == null;
    return `<article class="package-card ${isFullDay ? 'is-fullday' : ''}">
        <div class="package-head">
            <span class="package-code">${esc(pkg.code)}</span>
            <h3>${esc(pkg.name)}</h3>
            <p class="package-hours">${isFullDay ? 'ทั้งวัน (กะเช้า + กะเย็น)' : `${pkg.hours} ชั่วโมง`}</p>
        </div>
        <p class="package-price">${baht(pkg.price)}</p>
        <ul class="package-facts">
            <li><b>ใช้ห้องได้</b> ${usableWindow(pkg, s)}<br><small>รวมเวลาจัดห้อง ${SETUP_MINUTES} นาที</small></li>
            <li><b>มัดจำค่าห้อง ${pct}%</b> ${baht(pkg.price * pct / 100)}</li>
            <li><b>รับได้</b> ไม่เกิน ${MAX_GUESTS} ท่าน</li>
        </ul>
    </article>`;
}

function applySettings(s) {
    const mOpen = toMin(s.morning_open), mClose = toMin(s.morning_close);
    const eOpen = toMin(s.evening_open), eClose = toMin(s.evening_close);
    fillAll('.js-morning', `${range(mOpen, mClose)} น.`);
    fillAll('.js-evening', `${range(eOpen, eClose)} น.`);
    fillAll('.js-break', range(mClose, eOpen));

    const pct = Number(s.vip_deposit_percent ?? 50);
    document.getElementById('depositPct').textContent = `${pct}%`;
    document.getElementById('depositExample').textContent =
        `เช่น ค่าห้อง 1,200 + อาหาร 800 มัดจำ ${baht((1200 + 800) * pct / 100)}`;

    const footer = document.getElementById('footerHours');
    if (footer) {
        footer.textContent = `${range(mOpen, mClose)} (ปิดรับออเดอร์ ${hhmm(toMin(s.morning_last_order))}) `
            + `${range(eOpen, eClose)} (ปิดรับออเดอร์ ${hhmm(toMin(s.evening_last_order))})`;
    }

    if (s.phone) {
        fillAll('.js-phone', s.phone);
        document.getElementById('callButton').href = 'tel:' + String(s.phone).replace(/[^\d+]/g, '');
    } else {
        fillAll('.js-phone', 'ติดต่อที่ร้าน');
    }
}

async function loadCatering() {
    const grid = document.getElementById('packageGrid');
    let settings = null;
    try {
        const res = await getJson('/api/settings');
        if (res.success && res.data) { settings = res.data; applySettings(settings); }
    } catch (e) {
        console.warn('โหลดตั้งค่าร้านไม่สำเร็จ', e);
    }
    if (!settings) fillAll('.js-phone', 'ติดต่อที่ร้าน');

    try {
        const res = await getJson('/api/vip_packages');
        if (!res.success) throw new Error(res.message);
        const list = res.data || [];
        if (!list.length) { grid.innerHTML = '<p class="package-empty">ยังไม่มีแพ็กเกจที่เปิดให้จอง</p>'; return; }
        // ไม่มีตั้งค่าร้าน → ใช้เวลามาตรฐานตามข้อตกลงทีม เพื่อให้แสดงการ์ดได้
        const s = settings || { morning_open: '10:00', morning_close: '14:00', evening_open: '16:00', evening_close: '20:00', vip_deposit_percent: 50 };
        grid.innerHTML = list.map((p) => packageCard(p, s)).join('');
    } catch (e) {
        console.warn('โหลดแพ็กเกจไม่สำเร็จ', e);
        grid.innerHTML = '<p class="package-empty">ยังไม่พร้อมแสดงแพ็กเกจ กรุณาโทรสอบถามร้าน</p>';
    }
}

loadCatering();
