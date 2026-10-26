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