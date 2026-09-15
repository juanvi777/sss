let currentUser = null;
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = '';
let selectedTime = '';
let selectedService = '';
let calendarData = new Map();
let carouselIndex = 0;
let carouselTimer = null;

const $ = id => document.getElementById(id);

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function serviceDuration(service) {
  return service === 'Polygel' ? 2 : 1;
}

function updateServiceDurationHint() {
  const service = $('service')?.value;
  $('serviceDurationHint').textContent = `Duración de la cita: ${serviceDuration(service) === 2 ? '2 horas' : '1 hora'}`;
}

function setStepVisibility(element, visible) {
  if (!element) return;
  element.classList.toggle('hidden-step', !visible);
}

async function initCliente() {
  currentUser = await requireRole('client');
  if (!currentUser) return;

  $('welcomeName').textContent = `Hola, ${currentUser.name}`;
  $('openBookingButton').addEventListener('click', openBooking);
  $('closeBookingButton').addEventListener('click', closeBooking);
  $('previousMonth').addEventListener('click', previousMonth);
  $('nextMonth').addEventListener('click', nextMonth);
  $('bookingButton').addEventListener('click', crearCita);
  $('service').addEventListener('change', onServiceChange);

  await refreshCalendar();
  await Promise.all([loadAppointments(), loadGallery()]);
}

function openBooking() {
  const section = $('agenda');
  section.classList.remove('hidden-booking');
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  $('calendarFeedback').textContent = 'Selecciona un día disponible para continuar.';
}

function closeBooking() {
  $('agenda').classList.add('hidden-booking');
  resetBooking();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetBooking() {
  selectedDate = '';
  selectedTime = '';
  selectedService = '';
  $('service').value = 'Manicure semipermanente';
  updateServiceDurationHint();
  setStepVisibility($('serviceStep'), false);
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  $('calendarFeedback').textContent = 'Selecciona un día disponible para continuar.';
  $('timeSlots').innerHTML = '<span class="time-help">Primero selecciona una fecha.</span>';
  $('timeHint').textContent = 'Selecciona primero un día';
  setMessage($('bookingMessage'), '');
  renderCalendar();
}

function onServiceChange() {
  selectedService = $('service').value;
  updateServiceDurationHint();
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);

  if (!selectedDate || !selectedTime) return;
  verifySelectedTimeForService();
}

async function previousMonth() {
  const now = new Date();
  const minMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const target = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  if (target < minMonth) return;
  currentMonth = target;
  selectedDate = '';
  selectedTime = '';
  setStepVisibility($('serviceStep'), false);
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  clearTimeSelection();
  await refreshCalendar();
}

async function nextMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  selectedDate = '';
  selectedTime = '';
  setStepVisibility($('serviceStep'), false);
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  clearTimeSelection();
  await refreshCalendar();
}

async function refreshCalendar() {
  const key = monthKey(currentMonth);
  $('calendarMonthLabel').textContent = new Date(currentMonth).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  try {
    const data = await apiFetch(`/calendar?month=${encodeURIComponent(key)}&service=Manicure%20semipermanente`);
    calendarData = new Map(data.days.map(day => [day.date, day]));
    renderCalendar();
  } catch (error) {
    $('calendarFeedback').textContent = error.message;
    shake(document.querySelector('.booking-card'));
  }
}

function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const grid = $('calendarDays');
  grid.innerHTML = '';

  for (let i = 0; i < first; i++) {
    const empty = document.createElement('span');
    empty.className = 'calendar-empty';
    grid.appendChild(empty);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= days; day++) {
    const date = isoDate(year, month, day);
    const meta = calendarData.get(date) || { status: 'closed', slots: 0, message: 'Fecha no disponible.' };
    const localDate = new Date(year, month, day);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-day ${meta.status}`;
    if (date === selectedDate) button.classList.add('selected');
    if (localDate.getTime() === today.getTime()) button.classList.add('today');
    const weekday = localDate.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
    const statusLabel = meta.status === 'available' ? 'Disponible' : meta.status === 'blocked' ? 'Bloqueado' : meta.status === 'rest' ? 'Descanso' : meta.status === 'full' ? 'Agotado' : meta.status === 'past' ? 'Pasado' : 'No disponible';
    button.innerHTML = `<strong>${day}</strong><span class="calendar-weekday">${weekday}</span><small>${statusLabel}</small>`;

    if (meta.status === 'past') {
      button.disabled = true;
      button.title = 'Esta fecha ya pasó.';
    } else if (meta.status === 'available') {
      button.addEventListener('click', () => selectDate(date));
      button.title = `${meta.slots} horario${meta.slots === 1 ? '' : 's'} disponible${meta.slots === 1 ? '' : 's'}`;
    } else {
      button.addEventListener('click', () => showDayMessage(meta));
      button.title = meta.message;
    }

    grid.appendChild(button);
  }

  $('previousMonth').disabled = currentMonth <= new Date(today.getFullYear(), today.getMonth(), 1);
}

function showDayMessage(meta) {
  selectedDate = '';
  selectedTime = '';
  setStepVisibility($('serviceStep'), false);
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  renderCalendar();
  clearTimeSelection();
  $('calendarFeedback').textContent = meta.message;
  shake($('calendarFeedback'));
}

async function selectDate(date) {
  selectedDate = date;
  selectedTime = '';
  selectedService = '';
  setStepVisibility($('serviceStep'), false);
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  renderCalendar();

  $('calendarFeedback').textContent = `Elegiste ${formatDate(date)}. Ahora escoge una hora.`;
  $('timeHint').textContent = 'Horarios disponibles';
  $('timeSlots').innerHTML = '<span class="time-help">Cargando horarios…</span>';

  try {
    const data = await apiFetch(`/appointments/slots?date=${encodeURIComponent(date)}&service=Manicure%20semipermanente`);
    renderSlots(data.slots);
    if (!data.slots.length) {
      $('calendarFeedback').textContent = data.message || 'No hay horarios disponibles para ese día.';
      shake($('calendarFeedback'));
    }
  } catch (error) {
    $('timeSlots').innerHTML = `<span class="time-help">${escapeHtml(error.message)}</span>`;
    shake(document.querySelector('.booking-card'));
  }
}

function renderSlots(slots) {
  const wrap = $('timeSlots');
  wrap.innerHTML = '';
  if (!slots.length) {
    wrap.innerHTML = '<span class="time-help">No quedan horas disponibles para este día.</span>';
    return;
  }

  slots.forEach(time => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'time-slot';
    button.textContent = time;
    if (time === selectedTime) button.classList.add('selected');
    button.addEventListener('click', () => selectTime(time));
    wrap.appendChild(button);
  });
}

async function selectTime(time) {
  selectedTime = time;
  selectedService = '';
  setStepVisibility($('serviceStep'), true);
  setStepVisibility($('bookingSummary'), false);
  setStepVisibility($('bookingButton'), false);
  $('service').value = 'Manicure semipermanente';
  updateServiceDurationHint();
  setMessage($('bookingMessage'), '');
  $('calendarFeedback').textContent = `${formatDate(selectedDate)} a las ${time}. Ahora dinos qué servicio deseas realizar.`;
  renderSlots(Array.from(document.querySelectorAll('.time-slot')).map(button => button.textContent));
  await refreshServiceValidation();
  $('serviceStep').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function refreshServiceValidation() {
  if (!selectedDate || !selectedTime) return;
  const service = $('service').value;
  try {
    const data = await apiFetch(`/appointments/slots?date=${encodeURIComponent(selectedDate)}&service=${encodeURIComponent(service)}`);
    if (!data.slots.includes(selectedTime)) {
      selectedTime = '';
      setStepVisibility($('bookingSummary'), false);
      setStepVisibility($('bookingButton'), false);
      setMessage($('bookingMessage'), service === 'Polygel'
        ? 'Ese horario no tiene espacio suficiente para 2 horas. Elige otra hora.'
        : 'Ese horario ya no está disponible. Elige otra hora.');
      renderSlots(data.slots);
      return;
    }
    updateSummary();
  } catch (error) {
    setMessage($('bookingMessage'), error.message);
  }
}

async function verifySelectedTimeForService() {
  await refreshServiceValidation();
}

function updateSummary() {
  selectedService = $('service').value;
  $('summaryDate').textContent = formatDate(selectedDate);
  $('summaryTime').textContent = selectedTime;
  $('summaryService').textContent = selectedService;
  $('summaryDuration').textContent = serviceDuration(selectedService) === 2 ? '2 horas' : '1 hora';
  setStepVisibility($('bookingSummary'), true);
  setStepVisibility($('bookingButton'), true);
  $('bookingSummary').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearTimeSelection() {
  $('timeSlots').innerHTML = '<span class="time-help">Primero selecciona un día disponible.</span>';
  $('timeHint').textContent = 'Selecciona primero un día';
  setMessage($('bookingMessage'), '');
}

async function crearCita() {
  const message = $('bookingMessage');
  const button = $('bookingButton');
  if (!selectedDate) {
    setMessage(message, 'Primero selecciona un día disponible.');
    shake(document.querySelector('.booking-card'));
    return;
  }
  if (!selectedTime) {
    setMessage(message, 'Ahora selecciona una hora disponible.');
    shake(document.querySelector('.booking-card'));
    return;
  }
  if (!$('service').value) {
    setMessage(message, 'Selecciona el servicio que deseas realizar.');
    return;
  }

  button.disabled = true;
  setMessage(message, 'Enviando tu solicitud…');

  try {
    const data = await apiFetch('/appointments', {
      method: 'POST',
      body: JSON.stringify({ service: $('service').value, date: selectedDate, time: selectedTime })
    });
    setMessage(message, data.message, true);
    const dateJustBooked = selectedDate;
    selectedTime = '';
    setStepVisibility($('bookingSummary'), false);
    setStepVisibility($('bookingButton'), false);
    setStepVisibility($('serviceStep'), false);
    await Promise.all([loadAppointments(), refreshCalendar()]);
    if (calendarData.get(dateJustBooked)?.status === 'available') {
      await selectDate(dateJustBooked);
    } else {
      showDayMessage(calendarData.get(dateJustBooked) || { message: 'No quedan horarios disponibles.' });
    }
  } catch (error) {
    setMessage(message, error.message);
    shake(document.querySelector('.booking-card'));
    await refreshCalendar();
  } finally {
    button.disabled = false;
  }
}

async function loadAppointments() {
  const data = await apiFetch('/appointments/my');
  const list = $('appointmentsList');
  list.innerHTML = '';
  if (!data.appointments.length) {
    list.innerHTML = '<div class="empty-state">Todavía no tienes citas.</div>';
    return;
  }

  data.appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'appointment-item';
    const statusText = appt.status === 'accepted' ? 'Confirmada' : appt.status === 'pending' ? 'Pendiente de confirmación' : appt.status === 'cancelled' ? 'Cancelada' : 'Rechazada';
    item.innerHTML = `<div class="appointment-top"><strong>${escapeHtml(appt.service)}</strong><span class="status ${appt.status}">${statusText}</span></div><p>${formatDate(appt.appointment_date)} · ${String(appt.appointment_time).slice(0,5)}</p>`;
    if (['pending', 'accepted'].includes(appt.status)) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'link-button subtle-link';
      cancel.textContent = 'Cancelar cita';
      cancel.addEventListener('click', () => cancelarCita(appt.id));
      item.appendChild(cancel);
    }
    list.appendChild(item);
  });
}

async function cancelarCita(id) {
  if (!confirm('¿Quieres cancelar esta cita?')) return;
  try {
    await apiFetch(`/appointments/${id}/cancel`, { method: 'PATCH' });
    await Promise.all([loadAppointments(), refreshCalendar()]);
    if (selectedDate) await selectDate(selectedDate);
  } catch (error) {
    setMessage($('bookingMessage'), error.message);
    shake(document.querySelector('.booking-card'));
  }
}

async function buildCarousel(gallery, photos, large = false) {
  gallery.innerHTML = '';
  if (!photos.length) {
    gallery.innerHTML = '<div class="empty-state">Pronto verás aquí los diseños de Suldery.</div>';
    return;
  }

  const stage = document.createElement('div');
  stage.className = large ? 'carousel-stage login-carousel-stage' : 'carousel-stage';
  const image = document.createElement('img');
  image.className = 'carousel-image';
  image.alt = 'Diseño de Suldery Nails';
  stage.appendChild(image);

  const previous = document.createElement('button');
  previous.className = 'carousel-arrow left';
  previous.type = 'button';
  previous.textContent = '‹';
  previous.setAttribute('aria-label', 'Foto anterior');
  previous.addEventListener('click', () => updateCarousel(photos, -1, gallery));

  const next = document.createElement('button');
  next.className = 'carousel-arrow right';
  next.type = 'button';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Foto siguiente');
  next.addEventListener('click', () => updateCarousel(photos, 1, gallery));

  const dots = document.createElement('div');
  dots.className = 'carousel-dots';
  photos.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Ver foto ${index + 1}`);
    dot.addEventListener('click', () => {
      carouselIndex = index;
      drawCarousel(photos, gallery);
    });
    dots.appendChild(dot);
  });

  stage.append(previous, next);
  gallery.append(stage, dots);
  carouselIndex = 0;
  drawCarousel(photos, gallery);

  if (photos.length > 1) {
    clearInterval(carouselTimer);
    carouselTimer = setInterval(() => updateCarousel(photos, 1, gallery), 5000);
  }
}

async function loadGallery() {
  const data = await apiFetch('/portfolio');
  await buildCarousel($('clientGallery'), data.photos);
  if ($('clientHeroGallery')) {
    await buildCarousel($('clientHeroGallery'), data.photos, true);
  }
}

function drawCarousel(photos, gallery) {
  const image = gallery.querySelector('.carousel-image');
  const dots = gallery.querySelectorAll('.carousel-dot');
  if (!image || !photos.length) return;
  image.src = photos[carouselIndex].image_url;
  image.alt = photos[carouselIndex].title || 'Diseño de Suldery Nails';
  dots.forEach((dot, index) => dot.classList.toggle('active', index === carouselIndex));
}

function updateCarousel(photos, direction, gallery) {
  carouselIndex = (carouselIndex + direction + photos.length) % photos.length;
  drawCarousel(photos, gallery);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

document.addEventListener('DOMContentLoaded', initCliente);
