const API_BASE = '/api';


function clearSession() {
  localStorage.removeItem('suldery_token');
  localStorage.removeItem('suldery_user');
}


async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }


  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'same-origin' });
  let data = {};
  try { data = await response.json(); } catch {}

  if (response.status === 401) {
    clearSession();
    const publicPage = ['/', '/index.html', '/registro.html'].includes(location.pathname);
    if (!publicPage) location.href = '/';
  }

  if (!response.ok) {
    throw new Error(data.message || 'Ocurrió un error. Inténtalo nuevamente.');
  }

  return data;
}

function setMessage(element, text, success = false) {
  if (!element) return;
  element.textContent = text || '';
  element.classList.toggle('success', Boolean(success));
}

function shake(element) {
  if (!element) return;
  element.classList.remove('shake');
  void element.offsetWidth;
  element.classList.add('shake');
  window.setTimeout(() => element.classList.remove('shake'), 500);
}

function formatDate(dateValue) {
  const d = new Date(`${dateValue}T12:00:00`);
  return d.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

async function requireRole(role) {
  try {
    const data = await apiFetch('/me');
    if (data.user.role !== role || data.user.status !== 'accepted') {
      location.href = data.user.role === 'owner' ? '/duena.html' : '/cliente.html';
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

async function logout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); }
  catch { /* La navegación limpia igualmente el estado local heredado. */ }
  clearSession();
  location.href = '/';
}

window.apiFetch = apiFetch;
window.clearSession = clearSession;
window.setMessage = setMessage;
window.shake = shake;
window.formatDate = formatDate;
window.requireRole = requireRole;
function updateThemeToggle() {
  const dark = document.body.classList.contains('dark-mode');
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.querySelector('.theme-icon').textContent = dark ? '☀' : '☾';
    button.querySelector('.theme-label').textContent = dark ? 'Modo claro' : 'Modo oscuro';
    button.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    button.setAttribute('aria-pressed', String(dark));
  });
}

function applySavedTheme() {
  const saved = localStorage.getItem('suldery_theme');
  document.body.classList.toggle('dark-mode', saved === 'dark');
  updateThemeToggle();
}

function toggleTheme() {
  const dark = !document.body.classList.contains('dark-mode');
  document.body.classList.toggle('dark-mode', dark);
  localStorage.setItem('suldery_theme', dark ? 'dark' : 'light');
  updateThemeToggle();
}
document.addEventListener('DOMContentLoaded', () => {
  applySavedTheme();
  document.querySelectorAll('[data-action="logout"]').forEach(button => button.addEventListener('click', logout));
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
});

// PWA: permite instalar Suldery Nails como una app con su propio icono y ventana.
let deferredInstallPrompt = null;

function isInstalledPWA() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}

function updateInstallButtons() {
  document.querySelectorAll('#installAppButton').forEach(button => {
    button.hidden = isInstalledPWA() || !deferredInstallPrompt;
  });
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtons();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButtons();
});

document.addEventListener('click', async event => {
  const button = event.target.closest('#installAppButton');
  if (!button || !deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch {}
  deferredInstallPrompt = null;
  updateInstallButtons();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

window.setTimeout(updateInstallButtons, 0);
