const registerForm = document.getElementById('registerForm');
const formMessage = document.getElementById('formMessage');
const registerButton = document.getElementById('registerButton');
const birthDateInput = document.getElementById('birthDate');
const today = new Date();
birthDateInput.max = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';
  formMessage.className = 'form-message';
  registerButton.disabled = true;

  const formData = new FormData(registerForm);
  const payload = {
    name: formData.get('name').trim(),
    phone: formData.get('phone').trim(),
    birth_date: formData.get('birth_date') || null,
  };

  try {
    const response = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'สมัครสมาชิกไม่สำเร็จ กรุณาลองอีกครั้ง');
    }

    window.location.href = `/loginMember?phone=${encodeURIComponent(payload.phone)}&registered=1`;
  } catch (error) {
    formMessage.textContent = error.message || 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง';
    formMessage.classList.add('error');
    registerButton.disabled = false;
  }
});
