// หน้าเมนูสาธารณะ /customer/web_menu.html
// ดึงเมนูจาก GET /api/menu (รูป image_path ที่เจ้าของอัปโหลด) แล้ววาดเป็นแผ่นเมนูแยกหมวด
// หน้านี้ไม่ได้โหลด api.js จึงมี esc / baht / fetch ของตัวเอง

// สไลด์แบนเนอร์อยู่ที่ /assets/js/banner-slider.js (ดึงจาก /api/banners)

/* ---------- บังคับขนาดรูปภาพและ Layout การ์ดเมนูให้เท่ากันและตรงแนวเดียวกันทุกใบ ---------- */
(function injectUniformMenuCardStyle() {
    if (document.getElementById('mb-uniform-card-style')) return;
    const style = document.createElement('style');
    style.id = 'mb-uniform-card-style';
    style.textContent = `
        .mb-grid {
            align-items: stretch !important;
        }
        .mb-item {
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
            padding-bottom: 12px !important;
        }
        .mb-item .mb-photo {
            position: relative !important;
            width: 100% !important;
            height: 170px !important;
            aspect-ratio: auto !important;
            flex: 0 0 170px !important;
            overflow: hidden !important;
            background: #f7ead0 !important;
        }
        .mb-item .mb-photo img {
            position: absolute !important;
            inset: 0 !important;
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            object-position: center !important;
        }
        .mb-item h3 {
            margin: 10px 12px 2px !important;
            color: #4a2a17 !important;
            font-size: 16px !important;
            font-weight: 600 !important;
            line-height: 1.35 !important;
            min-height: calc(1.35em * 2) !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
        }
        .mb-item .mb-desc {
            margin: 0 12px 4px !important;
            color: #9a7a58 !important;
            font-size: 13px !important;
            line-height: 1.4 !important;
            min-height: 1.4em !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        .mb-item .mb-price {
            margin: auto 12px 0 !important;
            padding-top: 6px !important;
            color: #8f3528 !important;
            font-size: 18px !important;
            font-weight: 700 !important;
            line-height: 1.2 !important;
        }
        .mb-set-grid {
            align-items: stretch !important;
        }
        .mb-set {
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
        }
        .mb-set .mb-photo {
            position: relative !important;
            width: 100% !important;
            height: 190px !important;
            aspect-ratio: 4 / 3 !important;
            flex: 0 0 190px !important;
            overflow: hidden !important;
            background: #f7ead0 !important;
        }
        .mb-set .mb-photo img {
            position: absolute !important;
            inset: 0 !important;
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            object-position: center !important;
        }
        .mb-set-body {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 !important;
        }
        .mb-set-price {
            margin-top: auto !important;
            padding-top: 12px !important;
            align-self: flex-end !important;
        }
    `;
    document.head.appendChild(style);
})();

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

/** การ์ดเมนูทั่วไป: รูปขนาดเท่ากันทุกใบ · ชื่อ · คำอธิบาย · "45 บาท / เข่ง" ตรงแนวเดียวกันเสมอ */
function itemCard(m) {
    return `<article class="mb-item ${Number(m.is_sold_out) === 1 ? 'is-out' : ''}">
        <div class="mb-photo">${photo(m)}${soldOutTag(m)}</div>
        <h3 title="${esc(m.name)}">${esc(m.name)}</h3>
        <p class="mb-desc">${m.description ? esc(m.description) : '&nbsp;'}</p>
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
