let currentSlide = 0;
const slides = document.querySelectorAll(".slide");
const dots = document.querySelectorAll(".dot");
const slidesContainer = document.querySelector(".slides");

function showSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    currentSlide = index;
    slidesContainer.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((dot) => dot.classList.remove("active"));
    dots[currentSlide].classList.add("active");
}

setInterval(() => {
    showSlide(currentSlide + 1);
}, 4000);

dots.forEach((dot, idx) => {
    dot.addEventListener("click", () => showSlide(idx));
});


async function loadMenu() {
    
    const menuList = document.getElementById('menu-list');

    try {
        const response = await fetch('/api/menu');

        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดเมนูได้');
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error('ไม่สามารถโหลดเมนูได้');
        }

        const menus = result.data;
        const setOrder = ['Set A', 'Set B', 'Set C'];

        menus.sort((a, b) => {
            const indexA = setOrder.indexOf(a.name);
            const indexB = setOrder.indexOf(b.name);

            const orderA = indexA === -1 ? 999 : indexA;
            const orderB = indexB === -1 ? 999 : indexB;

            return orderA - orderB;
        });

        if (!menus.length) {
            menuList.textContent = 'ขณะนี้ยังไม่มีเมนูพร้อมจำหน่าย';
            return;
        }
        

        menuList.replaceChildren();

        menus.forEach(menu => {
            const card = document.createElement('article');
            card.className = 'card-menu';

            const imageBox = document.createElement('div');
            imageBox.className = 'img_menu';

            if (menu.image_path) {
                const img = document.createElement('img');
                img.src = menu.image_path;
                img.alt = menu.name;
                img.loading = 'lazy';

                img.onerror = () => {
                    img.remove();
                    imageBox.textContent = 'ไม่มีรูปภาพ';
                };

                imageBox.appendChild(img);
            } else {
                imageBox.textContent = 'ไม่มีรูปภาพ';
            }

            const category = document.createElement('span');
            category.className = 'menu-category';
            category.textContent = menu.category_name;

            const name = document.createElement('h3');
            name.className = 'menu-name';
            name.textContent = menu.name;

            const description = document.createElement('p');
            description.className = 'menu-description';
            description.textContent = menu.description || '';

            const price = document.createElement('p');
            price.className = 'menu-price';
            price.textContent =
                `${Number(menu.price).toLocaleString('th-TH')} บาท / ${menu.unit}`;

            card.append(imageBox, category, name, description, price);
            menuList.appendChild(card);
        });
    } catch (error) {
        console.error('Load menu error:', error);
        menuList.textContent = 'โหลดเมนูไม่สำเร็จ กรุณาลองใหม่';
    }
}

document.addEventListener('DOMContentLoaded', loadMenu);