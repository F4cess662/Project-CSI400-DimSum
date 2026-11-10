// สไลด์แบนเนอร์หน้าลูกค้า (หน้า Home + หน้าเมนู)
// ดึงรูปจาก GET /api/banners (คนที่ 2 · เปิดใช้ เรียงตาม sort_order)
// API ล่ม / ยังไม่มีแบนเนอร์ → ใช้รูป <img class="slide"> ที่ฝังไว้ใน HTML เป็นรูปสำรอง
// แบนเนอร์ที่มี link_url → กดแล้วไปลิงก์นั้น
(function () {
    const slider = document.querySelector('.slider');
    if (!slider) return;
    const track = slider.querySelector('.slides');
    const dotsBox = slider.querySelector('.indicators');
    let current = 0;
    let timer = null;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const slides = () => track.querySelectorAll('.slide');

    function show(index) {
        const all = slides();
        if (!all.length) return;
        current = (index + all.length) % all.length;
        track.style.transform = `translateX(-${current * 100}%)`;
        dotsBox.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === current));
    }

    function restartTimer() {
        clearInterval(timer);
        if (slides().length > 1) timer = setInterval(() => show(current + 1), 4000);
    }

    function drawDots() {
        const n = slides().length;
        dotsBox.innerHTML = Array.from({ length: n }, (_, i) =>
            `<button type="button" class="dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="แสดงรูปที่ ${i + 1}"></button>`).join('');
        // รูปเดียวไม่ต้องมีปุ่มเลื่อน/จุด
        slider.querySelectorAll('.slider-btn').forEach((b) => { b.hidden = n < 2; });
        dotsBox.hidden = n < 2;
    }

    // ปุ่มใน HTML เรียก plusSlides(±1) / showSlide(i)
    window.plusSlides = (step) => { show(current + step); restartTimer(); };
    window.showSlide = (i) => { show(i); restartTimer(); };
    dotsBox.addEventListener('click', (e) => {
        const dot = e.target.closest('[data-i]');
        if (dot) window.showSlide(Number(dot.dataset.i));
    });

    function slideHtml(b, i) {
        const img = `<img src="${esc(b.image_path)}" class="${b.link_url ? '' : 'slide'}" alt="${esc(b.title || 'แบนเนอร์ ' + (i + 1))}"
            ${i ? 'loading="lazy"' : ''}>`;
        return b.link_url ? `<a class="slide" href="${esc(b.link_url)}">${img}</a>` : img;
    }

    async function load() {
        try {
            const res = await fetch('/api/banners').then((r) => r.json());
            const list = (res.success && Array.isArray(res.data) ? res.data : []).filter((b) => b.image_path);
            if (list.length) track.innerHTML = list.map(slideHtml).join('');
        } catch (e) {
            console.warn('โหลดแบนเนอร์ไม่สำเร็จ ใช้รูปสำรอง', e);
        }
        // รูปไหนโหลดไม่ขึ้น (ลิงก์ภายนอกเสีย) ตัดออกจากสไลด์
        slides().forEach((s) => {
            const img = s.tagName === 'IMG' ? s : s.querySelector('img');
            img.addEventListener('error', () => {
                if (slides().length > 1) { s.remove(); drawDots(); show(0); restartTimer(); }
            }, { once: true });
        });
        drawDots();
        show(0);
        restartTimer();
    }

    load();
})();
