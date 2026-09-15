let ownerUser = null;
let ownerSchedule = [];

const $d = id => document.getElementById(id);
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function initDuena() {
  ownerUser = await requireRole('owner');
  if (!ownerUser) return;

  const now = new Date();
  $d('ownerDateLabel').textContent = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  $d('ownerAppointmentDate').min = localISODate(now);
  $d('ownerAppointmentDate').value = localISODate(now);

  $d('ownerAppointmentDate').addEventListener('change', loadOwnerSlots);
  $d('ownerService').addEventListener('change', () => {
    updateOwnerServiceDurationHint();
    loadOwnerSlots();
  });
  $d('ownerBookingForm').addEventListener('submit', submitManualBooking);
  $d('photoPicker').addEventListener('change', subirFoto);
  $d('blockedDateForm').addEventListener('submit', bloquearFecha);
  $d('blockedDatesList').addEventListener('click', handleBlockedDateAction);
  $d('ownerGallery').addEventListener('click', handleGalleryAction);

  updateOwnerServiceDurationHint();
  await refreshOwnerData();
}

async function refreshOwnerData() {
  await Promise.all([
    loadPendingUsers(),
    loadOwnerAppointments(),
    loadOwnerGallery(),
    loadSchedule(),
    loadBlockedDates()
  ]);
  await loadOwnerSlots();
}

function updateOwnerServiceDurationHint() {
  const service = $d('ownerService').value;
  const duration = service === 'Polygel' ? '2 horas' : '1 hora';
  $d('ownerServiceDurationHint').textContent = `Duración de la cita: ${duration}`;
}

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

async function loadPendingUsers() {
  const data = await apiFetch('/owner/users');
  const list = $d('pendingUsersList');
  const pending = data.users.filter(user => user.status === 'pending');
  $d('pendingCount').textContent = pending.length;
  list.innerHTML = '';

  if (!data.users.length) {
    list.innerHTML = '<div class="empty-state">No hay solicitudes todavía.</div>';
    return;
  }

  data.users.forEach(user => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    const label = user.status === 'pending' ? 'Pendiente' : user.status === 'accepted' ? 'Aceptada' : 'Rechazada';
    item.innerHTML = `<strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}</p><span class="status ${user.status}">${label}</span>`;
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    if (user.status !== 'accepted') actions.append(actionButton('Aceptar', 'small-button', () => setUserStatus(user.id, 'accepted')));
    if (user.status !== 'rejected') actions.append(actionButton('Rechazar', 'small-button cancel', () => setUserStatus(user.id, 'rejected')));
    if (user.status !== 'pending') actions.append(actionButton('Pendiente', 'small-button ghost', () => setUserStatus(user.id, 'pending')));
    item.appendChild(actions);
    list.appendChild(item);
  });
}

async function setUserStatus(id, status) {
  try {
    await apiFetch(`/owner/users/${id}/status`, { method:'PATCH', body:JSON.stringify({ status }) });
    await loadPendingUsers();
  } catch (error) {
    alert(error.message);
  }
}

async function loadOwnerAppointments() {
  const data = await apiFetch('/owner/appointments');
  const list = $d('ownerAppointmentsList');
  const today = localISODate(new Date());
  const todayCount = data.appointments.filter(a => a.appointment_date === today && ['pending','accepted'].includes(a.status)).length;
  $d('todayCount').textContent = todayCount;
  list.innerHTML = '';

  if (!data.appointments.length) {
    list.innerHTML = '<div class="empty-state">No hay citas registradas.</div>';
    return;
  }

  data.appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    item.innerHTML = `<strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${String(appt.appointment_time).slice(0,5)}</p><span class="status ${appt.status}">${statusLabel(appt.status)}</span><small>${escapeHtml(appt.client_email || 'Cita manual')}</small>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    if (appt.status === 'pending') actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
    if (['pending','accepted'].includes(appt.status)) actions.append(actionButton('Cancelar', 'small-button cancel', () => setApptStatus(appt.id, 'cancelled')));
    if (appt.status !== 'rejected') actions.append(actionButton('Rechazar', 'small-button ghost', () => setApptStatus(appt.id, 'rejected')));
    item.appendChild(actions);
    list.appendChild(item);
  });
}

async function setApptStatus(id, status) {
  try {
    await apiFetch(`/owner/appointments/${id}/status`, { method:'PATCH', body:JSON.stringify({status}) });
    await loadOwnerAppointments();
  } catch (error) { alert(error.message); }
}

async function loadSchedule() {
  const data = await apiFetch('/owner/schedule');
  ownerSchedule = data.schedule;
  const grid = $d('scheduleGrid');
  grid.innerHTML = '';

  ownerSchedule.forEach(day => {
    const card = document.createElement('article');
    card.className = `schedule-day ${day.is_open ? 'open' : 'closed'}`;
    card.innerHTML = `<div class="schedule-day-title"><strong>${DAY_NAMES[day.weekday]}</strong><span>${day.is_open ? 'Abierto' : 'Descanso'}</span></div>
      <div class="schedule-fields">
        <label class="switch-row"><span>Atender</span><input type="checkbox" class="day-open-toggle" ${day.is_open ? 'checked' : ''}></label>
        <label>Desde<input class="day-start" type="time" value="${day.start_time || '07:00'}"></label>
        <label>Hasta<input class="day-end" type="time" value="${day.end_time || '18:00'}"></label>
      </div>
      <button type="button" class="secondary-button schedule-save">Guardar horario</button>`;

    const toggle = card.querySelector('.day-open-toggle');
    const start = card.querySelector('.day-start');
    const end = card.querySelector('.day-end');
    toggle.addEventListener('change', () => card.classList.toggle('closed', !toggle.checked));
    card.querySelector('.schedule-save').addEventListener('click', async () => {
      try {
        await apiFetch(`/owner/schedule/${day.weekday}`, {
          method: 'PATCH',
          body: JSON.stringify({ isOpen: toggle.checked, start: start.value, end: end.value })
        });
        await loadSchedule();
        await loadOwnerSlots();
      } catch (error) {
        alert(error.message);
        shake(card);
      }
    });
    grid.appendChild(card);
  });
}

async function loadOwnerSlots() {
  const date = $d('ownerAppointmentDate').value;
  const select = $d('ownerAppointmentTime');
  select.innerHTML = '<option value="">Cargando…</option>';
  if (!date) return;
  try {
    const data = await apiFetch(`/owner/slots?date=${encodeURIComponent(date)}`);
    select.innerHTML = '';
    if (!data.slots.length) {
      select.innerHTML = '<option value="">No hay horarios disponibles</option>';
      return;
    }
    data.slots.forEach(time => {
      const option = document.createElement('option');
      option.value = time; option.textContent = time;
      select.appendChild(option);
    });
  } catch (error) {
    select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
  }
}

async function submitManualBooking(event) {
  event.preventDefault();
  const message = $d('ownerBookingMessage');
  const button = $d('ownerBookingButton');
  const body = {
    clientName: $d('ownerClientName').value.trim(),
    service: $d('ownerService').value,
    date: $d('ownerAppointmentDate').value,
    time: $d('ownerAppointmentTime').value
  };
  if (!body.clientName || !body.date || !body.time) {
    setMessage(message, 'Completa nombre, fecha y hora.');
    shake($d('ownerBookingForm'));
    return;
  }

  button.disabled = true;
  setMessage(message, 'Guardando cita…');
  try {
    const data = await apiFetch('/owner/appointments', { method:'POST', body:JSON.stringify(body) });
    setMessage(message, data.message, true);
    $d('ownerClientName').value = '';
    await Promise.all([loadOwnerSlots(), loadOwnerAppointments()]);
  } catch (error) {
    setMessage(message, error.message);
    shake($d('ownerBookingForm'));
  } finally {
    button.disabled = false;
  }
}


async function loadBlockedDates() {
  const data = await apiFetch('/owner/blocked-dates');
  const list = $d('blockedDatesList');
  list.innerHTML = '';
  const today = localISODate(new Date());
  $d('blockedDate').min = today;

  if (!data.dates.length) {
    list.innerHTML = '<div class="empty-state">No tienes fechas especiales bloqueadas.</div>';
    return;
  }

  data.dates.forEach(item => {
    const article = document.createElement('article');
    article.className = 'blocked-date-item';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>${escapeHtml(item.reason || 'Sin motivo indicado')}</span></div>
      <button type="button" class="small-button cancel" data-blocked-id="${item.id}">Desbloquear</button>`;
    list.appendChild(article);
  });
}

async function bloquearFecha(event) {
  event.preventDefault();
  const date = $d('blockedDate').value;
  const reason = $d('blockedReason').value.trim();
  if (!date) return;
  try {
    await apiFetch('/owner/blocked-dates', {
      method: 'POST',
      body: JSON.stringify({ date, reason })
    });
    $d('blockedDateForm').reset();
    await loadBlockedDates();
  } catch (error) {
    alert(error.message);
  }
}

async function handleBlockedDateAction(event) {
  const button = event.target.closest('[data-blocked-id]');
  if (!button) return;
  if (!confirm('¿Desbloquear este día para recibir citas?')) return;
  try {
    await apiFetch(`/owner/blocked-dates/${button.dataset.blockedId}`, { method: 'DELETE' });
    await loadBlockedDates();
    await refreshOwnerData();
  } catch (error) {
    alert(error.message);
  }
}

async function loadOwnerGallery() {
  const data = await apiFetch('/portfolio');
  $d('photoCount').textContent = data.photos.length;
  const gallery = $d('ownerGallery'); gallery.innerHTML = '';
  if (!data.photos.length) {
    gallery.innerHTML = '<div class="empty-state">Todavía no hay fotos publicadas.</div>';
    return;
  }
  data.photos.forEach((photo, index) => {
    const figure = document.createElement('figure');
    figure.className = 'portfolio-photo owner-photo';
    figure.innerHTML = `
      <div class="owner-photo-number">${index + 1}</div>
      <img src="${escapeAttribute(photo.image_url)}" alt="${escapeAttribute(photo.title)}" loading="lazy">
      <figcaption>${escapeAttribute(photo.title)}</figcaption>
      <div class="photo-actions">
        <button type="button" class="small-button ghost" ${index === 0 ? 'disabled' : ''} data-photo-action="move" data-id="${photo.id}" data-direction="up" aria-label="Mover foto hacia arriba">â†‘</button>
        <button type="button" class="small-button ghost" ${index === data.photos.length - 1 ? 'disabled' : ''} data-photo-action="move" data-id="${photo.id}" data-direction="down" aria-label="Mover foto hacia abajo">â†“</button>
        <button type="button" class="remove-photo" data-photo-action="delete" data-id="${photo.id}">Eliminar</button>
      </div>`;
    gallery.appendChild(figure);
  });
}

function handleGalleryAction(event) {
  const button = event.target.closest('[data-photo-action]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.id);
  if (!Number.isInteger(id) || id < 1) return;
  if (button.dataset.photoAction === 'delete') eliminarFoto(id);
  if (button.dataset.photoAction === 'move') moverFoto(id, button.dataset.direction);
}

async function subirFoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('photo', file);
  form.append('title', 'Diseño Suldery Nails');
  try {
    await apiFetch('/owner/portfolio', { method:'POST', body:form });
    await loadOwnerGallery();
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = '';
  }
}

async function eliminarFoto(id) {
  if (!confirm('¿Eliminar esta foto del portafolio?')) return;
  try {
    await apiFetch(`/owner/portfolio/${id}`, { method:'DELETE' });
    await loadOwnerGallery();
  } catch (error) { alert(error.message); }
}


async function moverFoto(id, direction) {
  try {
    await apiFetch(`/owner/portfolio/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ direction })
    });
    await loadOwnerGallery();
  } catch (error) {
    alert(error.message);
  }
}

function actionButton(text, cls, handler) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = cls; button.textContent = text; button.addEventListener('click', handler);
  return button;
}

function statusLabel(status) {
  return status === 'accepted' ? 'Confirmada' : status === 'pending' ? 'Pendiente' : status === 'cancelled' ? 'Cancelada' : 'Rechazada';
}

function escapeHtml(text){ return String(text ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttribute(text){ return escapeHtml(text); }

document.addEventListener('DOMContentLoaded', initDuena);
window.loadOwnerSlots = loadOwnerSlots;
window.agendarManual = submitManualBooking;
window.subirFoto = subirFoto;
window.eliminarFoto = eliminarFoto;
window.moverFoto = moverFoto;
