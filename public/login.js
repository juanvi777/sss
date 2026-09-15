
async function loadLoginGallery() {
  const gallery = document.getElementById('loginGallery');
  if (!gallery) return;
  try {
    const data = await fetch('/api/portfolio', { credentials: 'same-origin' }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'No se pudo cargar el portafolio.');
      return body;
    });
    gallery.innerHTML = '';
    if (!data.photos?.length) {
      gallery.innerHTML = '<div class="empty-state">Pronto podrás ver nuestros diseños aquí.</div>';
      return;
    }

    let index = 0;
    const stage = document.createElement('div');
    stage.className = 'carousel-stage login-carousel-stage';
    const image = document.createElement('img');
    image.className = 'carousel-image';
    image.alt = 'Diseño de Suldery Nails';
    stage.appendChild(image);

    const render = () => {
      image.src = data.photos[index].image_url;
      image.alt = data.photos[index].title || 'Diseño de Suldery Nails';
      dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    };
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'carousel-arrow left';
    previous.textContent = '‹';
    previous.setAttribute('aria-label', 'Foto anterior');
    previous.addEventListener('click', () => { index = (index - 1 + data.photos.length) % data.photos.length; render(); });
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'carousel-arrow right';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Foto siguiente');
    next.addEventListener('click', () => { index = (index + 1) % data.photos.length; render(); });
    stage.append(previous, next);

    const dots = [];
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'carousel-dots';
    data.photos.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `Ver foto ${i + 1}`);
      dot.addEventListener('click', () => { index = i; render(); });
      dots.push(dot);
      dotsWrap.appendChild(dot);
    });
    gallery.append(stage, dotsWrap);
    render();

    if (data.photos.length > 1) {
      window.setInterval(() => { index = (index + 1) % data.photos.length; render(); }, 5000);
    }
  } catch {
    gallery.innerHTML = '<div class="empty-state">No se pudo cargar el portafolio ahora.</div>';
  }
}

const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');
const passwordInput = document.getElementById('loginPassword');
const togglePassword = document.getElementById('togglePassword');

function friendlyLoginMessage(message) {
  const text = String(message || '');
  if (/incorrectos|inválid/i.test(text)) return 'Correo o contraseña incorrectos.';
  return text || 'No se pudo iniciar sesión.';
}

function showLoginError(message) {
  setMessage(loginMessage, friendlyLoginMessage(message));
  shake(loginForm);
}

function setLoginBusy(busy) {
  loginButton.disabled = busy;
  loginButton.innerHTML = busy ? 'Verificando… <span class="spinner"></span>' : 'Iniciar sesión <span>→</span>';
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = passwordInput.value;

  setMessage(loginMessage, '');

  if (!email || !password) return showLoginError('Completa tu correo y contraseña.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return showLoginError('Escribe un correo electrónico válido.');

  setLoginBusy(true);

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data.user.role === 'owner') {
      window.location.href = '/duena.html';
      return;
    }
    window.location.href = '/cliente.html';
  } catch (error) {
    showLoginError(error.message);
    passwordInput.value = '';
    passwordInput.focus();
  } finally {
    setLoginBusy(false);
  }
}

document.getElementById('goRegister').addEventListener('click', () => { location.href = '/registro.html'; });

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  login();
});

togglePassword.addEventListener('click', () => {
  const visible = passwordInput.type === 'text';
  passwordInput.type = visible ? 'password' : 'text';
  togglePassword.textContent = visible ? '◉' : '○';
});


loadLoginGallery();
