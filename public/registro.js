const registerForm = document.getElementById('registerForm');
const registerButton = document.getElementById('registerButton');
const registerMessage = document.getElementById('registerMessage');

function setRegisterBusy(busy) {
  registerButton.disabled = busy;
  registerButton.innerHTML = busy ? 'Creando cuenta… <span class="spinner"></span>' : 'Solicitar mi cuenta <span>→</span>';
}

async function registrar() {
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim().toLowerCase();
  const password = document.getElementById('registerPassword').value;
  const password2 = document.getElementById('registerPassword2').value;

  setMessage(registerMessage, '');

  if (!name || name.length < 2) return showRegisterError('Escribe tu nombre completo.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return showRegisterError('Escribe un correo electrónico válido.');
  if (password.length < 6) return showRegisterError('La contraseña debe tener mínimo 6 caracteres.');
  if (password !== password2) return showRegisterError('Las contraseñas no coinciden.');

  setRegisterBusy(true);
  try {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    registerForm.reset();
    setMessage(registerMessage, data.message, true);
  } catch (error) {
    showRegisterError(error.message);
  } finally {
    setRegisterBusy(false);
  }
}

function showRegisterError(message) {
  setMessage(registerMessage, message);
  shake(registerForm);
}

document.getElementById('backToLogin').addEventListener('click', () => { location.href = '/'; });

registerForm.addEventListener('submit', event => {
  event.preventDefault();
  registrar();
});

