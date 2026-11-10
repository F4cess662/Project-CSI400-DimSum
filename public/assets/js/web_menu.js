// หน้าเมนูสาธารณะ /customer/web_menu.html
// ดึงเมนูจาก GET /api/menu (รูป image_path ที่เจ้าของอัปโหลด) แล้ววาดเป็นแผ่นเมนูแยกหมวด
// หน้านี้ไม่ได้โหลด api.js จึงมี esc / baht / fetch ของตัวเอง

// สไลด์แบนเนอร์อยู่ที่ /assets/js/banner-slider.js (ดึงจาก /api/banners)

/* ---------- เมนู ---------- */
const SET_CATEGORY = 'ชุดเซ็ต';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท';

// ไอคอนเข่งนึ่ง ใช้หัวหมวดและแทนรูปเมนูที่ยังไม่มีรูป
const STEAMER_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 13h16l-1.6 6H5.6L4 13Z" />
    <path d="M6 10a2 2 0 0 1 4 0m0 0a2 2 0 0 1 4 0m0 0a2 2 0 0 1 4 0" />
    <path d="M12 3v2m-5-1 1 2m9-2-1 2" /></svg>`;

function photo(m) {
    const src = m.image_path;   // รูปจากระบบ (หลังบ้าน / seed ใน dimsum_full.sql)
    return src
        ? `<img src="${esc(src)}" alt="${esc(m.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mb-noimg',innerHTML:STEAMER_SVG}))">`
        : `<span class="mb-noimg">${STEAMER_SVG}</span>`;
}

function soldOutTag(m) {
    return Number(m.is_sold_out) === 1 ? '<span class="mb-tag">หมด</span>' : '';
}

/** การ์ดเมนูทั่วไป: รูป · ชื่อ · คำอธิบาย · "45 บาท / เข่ง" */
function itemCard(m) {
    return `<article class="mb-item ${Number(m.is_sold_out) === 1 ? 'is-out' : ''}">
        <div class="mb-photo">${photo(m)}${soldOutTag(m)}</div>
        <h3>${esc(m.name)}</h3>
        ${m.description ? `<p class="mb-desc">${esc(m.description)}</p>` : ''}
        <p class="mb-price">${baht(m.price)} <span>/ ${esc(m.unit || 'จาน')}</span></p>
    </article>`;
}

/** การ์ดชุดเซ็ต: description รูปแบบ "1 ท่าน · ของ A + ของ B + ..." → ป้ายจำนวนคน + รายการ bullet */
function setCard(m) {
    const [head, rest] = String(m.description || '').includes('·')
        ? m.description.split('·').map((s) => s.trim())
        : ['', m.description || ''];
    const parts = rest.split('+').map((s) => s.trim()).filter(Boolean);
    const [code, title] = m.name.includes(':') ? m.name.split(':').map((s) => s.trim()) : [m.name, ''];
    return `<article class="mb-set ${Number(m.is_sold_out) === 1 ? 'is-out' : ''}">
        <div class="mb-photo">${photo(m)}${soldOutTag(m)}</div>
        <div class="mb-set-body">
            <h3>${esc(code)}${title ? ` <small>${esc(title)}</small>` : ''}</h3>
            ${head ? `<span class="mb-serves">${esc(head)}</span>` : ''}
            <ul>${parts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
            <p class="mb-set-price">${baht(m.price)}</p>
        </div>
    </article>`;
}

function section(cat, i) {
    const isSet = cat.name === SET_CATEGORY;
    return `<section class="mb-section" id="cat-${i}">
        <h2 class="mb-title">${STEAMER_SVG}<span>${isSet ? 'เซตอาหาร' : esc(cat.name)}</span></h2>
        <div class="${isSet ? 'mb-set-grid' : 'mb-grid'}">
            ${cat.items.map(isSet ? setCard : itemCard).join('')}
        </div>
    </section>`;
}

async function loadMenuBoard() {
    const board = document.getElementById('menuBoard');
    const jump = document.getElementById('menuJump');
    try {
        const res = await fetch('/api/menu').then((r) => r.json());
        if (!res.success) throw new Error(res.message);
        const menus = res.data || [];
        if (!menus.length) { board.innerHTML = '<p class="mb-empty">ขณะนี้ยังไม่มีเมนูพร้อมจำหน่าย</p>'; return; }

        // จัดกลุ่มตามหมวด (API เรียงตาม sort_order มาแล้ว) · ชุดเซ็ตขึ้นก่อนเหมือนแผ่นเมนู
        const cats = [];
        menus.forEach((m) => {
            let c = cats.find((x) => x.id === m.category_id);
            if (!c) cats.push(c = { id: m.category_id, name: m.category_name, items: [] });
            c.items.push(m);
        });
        cats.sort((a, b) => (b.name === SET_CATEGORY) - (a.name === SET_CATEGORY));

        jump.innerHTML = cats.map((c, i) =>
            `<a href="#cat-${i}">${c.name === SET_CATEGORY ? 'เซตอาหาร' : esc(c.name)}</a>`).join('');
        board.innerHTML = cats.map(section).join('');
    } catch (e) {
        console.error('Load menu error:', e);
        board.innerHTML = '<p class="mb-empty">โหลดเมนูไม่สำเร็จ กรุณาลองใหม่</p>';
    }
}

loadMenuBoard();
