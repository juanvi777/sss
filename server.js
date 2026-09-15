const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();
const { pool, initDatabase, testConnection, ensureUploadDirectory } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe existir en .env y tener al menos 32 caracteres.');
}
const isProduction = process.env.NODE_ENV === 'production';
const uploadDir = path.join(__dirname, 'uploads', 'portfolio');

const services = {
  'Manicure semipermanente': 60,
  'Pedicure': 60,
  'Polygel': 120,
  'Dipping': 60,
  'Forrado': 60
};

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(cors({ origin: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Conserva enlaces antiguos sin duplicar la raíz pública.
app.use('/public', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const target = req.path === '/' ? '/' : req.path;
  res.redirect(302, target);
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP, GIF o AVIF.'));
    }
    cb(null, true);
  }
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginAttempts = new Map();

function loginAttemptKey(req, email) {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${email}`;
}

function loginIsBlocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function registerLoginFailure(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, startedAt: now });
    return;
  }
  entry.count += 1;
}
function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '8h' });
}

function readCookie(req, name) {
  const prefix = `${name}=`;
  const item = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

function setSessionCookie(res, token) {
  const flags = [`suldery_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=28800'];
  if (isProduction) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

function clearSessionCookie(res) {
  const flags = ['suldery_session=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProduction) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = readCookie(req, 'suldery_session') || (header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!token) return res.status(401).json({ message: 'Sesión no válida.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.id);
    if (!user || user.status !== 'accepted') {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Tu sesión ya no está activa.' });
    }
    req.auth = { id: user.id, role: user.role, user };
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ message: 'Tu sesión expiró. Inicia sesión nuevamente.' });
  }
}

function ownerRequired(req, res, next) {
  if (req.auth?.role !== 'owner') return res.status(403).json({ message: 'No tienes permisos de dueña.' });
  next();
}

function toMinutes(time) {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function toTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

function toISODate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : text;
}

function isDateInPast(date) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return date < today;
}

function isToday(date) {
  const now = new Date();
  return date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dateWeekday(date) {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function formatDbTime(value) {
  return value ? String(value).slice(0, 5) : null;
}

function serviceDuration(service) {
  return services[service] || null;
}

async function getSchedule() {
  const [rows] = await pool.query(
    'SELECT weekday, is_open, start_time, end_time FROM working_hours ORDER BY weekday'
  );
  return rows.map(row => ({
    weekday: row.weekday,
    is_open: Boolean(row.is_open),
    start_time: formatDbTime(row.start_time),
    end_time: formatDbTime(row.end_time)
  }));
}

async function getScheduleDay(weekday) {
  const [rows] = await pool.query(
    'SELECT weekday, is_open, start_time, end_time FROM working_hours WHERE weekday=? LIMIT 1',
    [weekday]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, is_open: Boolean(row.is_open), start_time: formatDbTime(row.start_time), end_time: formatDbTime(row.end_time) };
}

async function getDayAppointments(date) {
  const [rows] = await pool.query(
    `SELECT appointment_time, duration_minutes, status
     FROM appointments
     WHERE appointment_date=? AND status IN ('pending','accepted')
     ORDER BY appointment_time`,
    [date]
  );
  return rows;
}


async function isDateBlocked(date) {
  const [rows] = await pool.query(
    'SELECT id, blocked_date, reason FROM blocked_dates WHERE blocked_date=? LIMIT 1',
    [date]
  );
  return rows[0] || null;
}

async function getBlockedDates(startDate, endDate) {
  const [rows] = await pool.query(
    'SELECT blocked_date, reason FROM blocked_dates WHERE blocked_date BETWEEN ? AND ? ORDER BY blocked_date',
    [startDate, endDate]
  );
  return rows.map(row => ({
    date: row.blocked_date instanceof Date
      ? row.blocked_date.toISOString().slice(0, 10)
      : String(row.blocked_date).slice(0, 10),
    reason: row.reason || ''
  }));
}

function slotIsFree(start, duration, appointments) {
  const end = start + duration;
  return !appointments.some(appt => {
    const aStart = toMinutes(appt.appointment_time);
    const aDuration = Number(appt.duration_minutes) || 60;
    const aEnd = aStart + aDuration;
    return start < aEnd && end > aStart;
  });
}

function slotsForDate(date, scheduleDay, appointments, duration = 60) {
  if (!scheduleDay?.is_open || !scheduleDay.start_time || !scheduleDay.end_time) return [];
  const start = toMinutes(scheduleDay.start_time);
  const end = toMinutes(scheduleDay.end_time);
  const slots = [];

  let earliest = start;
  if (isToday(date)) {
    const now = new Date();
    const nextFullHour = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 60) * 60;
    earliest = Math.max(start, nextFullHour);
  }

  for (let minute = start; minute + duration <= end; minute += 60) {
    if (minute < earliest) continue;
    if (slotIsFree(minute, duration, appointments)) slots.push(toTime(minute).slice(0, 5));
  }
  return slots;
}

function dayMessage(date, scheduleDay, slots) {
  if (dateWeekday(date) === 7) return 'Bebé, hoy estoy descansando. Nos vemos otro día. ♡';
  if (!scheduleDay?.is_open) return 'Bebé, hoy no estoy atendiendo. Elige otro día. ♡';
  if (!slots.length) return 'Bebé, hoy ya tengo todas las citas agendadas.';
  return '';
}

async function findUserById(id) {
  const [rows] = await pool.query(
    'SELECT id,name,email,role,status,created_at FROM users WHERE id=?',
    [id]
  );
  return rows[0] || null;
}

function validateScheduleHours(start, end) {
  if (!/^\d{2}:00$/.test(start) || !/^\d{2}:00$/.test(end)) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s >= 0 && e <= 1440 && s < e;
}

app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.json({ ok: true, message: 'Servidor y MySQL conectados.' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo conectar a MySQL.', detail: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (name.length < 2) return res.status(400).json({ message: 'Escribe tu nombre completo.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Escribe un correo válido.' });
    if (password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener mínimo 6 caracteres.' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length) return res.status(409).json({ message: 'Ese correo ya está registrado.' });

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,'client','pending')`,
      [name, email, passwordHash]
    );
    res.status(201).json({ message: 'Solicitud enviada. Suldery debe aprobar tu cuenta antes de que puedas reservar.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Completa correo y contraseña.' });
    const attemptKey = loginAttemptKey(req, email);
    if (loginIsBlocked(attemptKey)) return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos antes de reintentar.' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
    const user = rows[0];
    if (!user) { registerLoginFailure(attemptKey); return res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); }
    if (!(await bcrypt.compare(password, user.password_hash))) { registerLoginFailure(attemptKey); return res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); }
    if (user.status === 'pending') return res.status(403).json({ message: 'Tu cuenta todavía está pendiente de aprobación.' });
    if (user.status === 'rejected') return res.status(403).json({ message: 'Tu cuenta fue rechazada. Comunícate con Suldery.' });

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
    loginAttempts.delete(attemptKey);
    setSessionCookie(res, signToken(user));
    res.json({ user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo iniciar sesión.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/me', authRequired, async (req, res) => {
  try {
    const user = await findUserById(req.auth.id);
    if (!user) return res.status(401).json({ message: 'Usuario no encontrado.' });
    res.json({ user });
  } catch {
    res.status(500).json({ message: 'No se pudo cargar tu cuenta.' });
  }
});

app.get('/api/schedule', authRequired, async (_req, res) => {
  try { res.json({ schedule: await getSchedule() }); }
  catch { res.status(500).json({ message: 'No se pudo cargar el horario.' }); }
});

app.get('/api/calendar', authRequired, async (req, res) => {
  try {
    const month = String(req.query.month || '');
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!/^\d{4}-\d{2}$/.test(month) || !duration) return res.status(400).json({ message: 'Mes o servicio inválido.' });

    const [year, monthNumber] = month.split('-').map(Number);
    if (monthNumber < 1 || monthNumber > 12) return res.status(400).json({ message: 'Mes inválido.' });

    const totalDays = new Date(year, monthNumber, 0).getDate();
    const scheduleRows = await getSchedule();
    const scheduleMap = new Map(scheduleRows.map(row => [row.weekday, row]));
    const startDate = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
    const blockedRows = await getBlockedDates(startDate, endDate);
    const blockedMap = new Map(blockedRows.map(row => [row.date, row]));
    const [appointments] = await pool.query(
      `SELECT appointment_date, appointment_time, duration_minutes
       FROM appointments
       WHERE appointment_date BETWEEN ? AND ?
       AND status IN ('pending','accepted')
       ORDER BY appointment_date, appointment_time`,
      [startDate, endDate]
    );

    const grouped = new Map();
    appointments.forEach(item => {
      const key = item.appointment_date instanceof Date
        ? item.appointment_date.toISOString().slice(0, 10)
        : String(item.appointment_date).slice(0, 10);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });

    const days = [];
    for (let d = 1; d <= totalDays; d++) {
      const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (isDateInPast(date)) {
        days.push({ date, status: 'past', slots: 0, message: 'Esta fecha ya pasó.' });
        continue;
      }

      const weekday = dateWeekday(date);
      const scheduleDay = scheduleMap.get(weekday);
      const blocked = blockedMap.get(date);
      if (blocked) {
        days.push({ date, status: 'blocked', slots: 0, message: blocked.reason ? `No hay atención: ${blocked.reason}` : 'Este día no está disponible para citas.' });
        continue;
      }
      if (weekday === 7 || !scheduleDay?.is_open) {
        days.push({ date, status: 'rest', slots: 0, message: dayMessage(date, scheduleDay, []) });
        continue;
      }

      const slots = slotsForDate(date, scheduleDay, grouped.get(date) || [], duration);
      if (!slots.length) {
        days.push({ date, status: 'full', slots: 0, message: 'Bebé, hoy ya tengo todas las citas agendadas.' });
      } else {
        days.push({ date, status: 'available', slots: slots.length, message: '', duration });
      }
    }
    res.json({ month, service, duration, days });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el calendario.' });
  }
});

app.get('/api/appointments/slots', authRequired, async (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!date || !duration) return res.status(400).json({ message: 'Fecha o servicio inválido.' });
    if (isDateInPast(date)) return res.json({ date, service, duration, slots: [], message: 'Esta fecha ya pasó.' });

    const scheduleDay = await getScheduleDay(dateWeekday(date));
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) {
      return res.json({ date, service, duration, slots: [], message: 'Bebé, hoy estoy descansando. Nos vemos otro día. ♡' });
    }

    const appointments = await getDayAppointments(date);
    const slots = slotsForDate(date, scheduleDay, appointments, duration);
    res.json({ date, service, duration, slots, message: dayMessage(date, scheduleDay, slots) });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los horarios.' });
  }
});

app.get('/api/appointments/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,client_name,service,duration_minutes,appointment_date,appointment_time,status,created_at
       FROM appointments WHERE user_id=? ORDER BY appointment_date,appointment_time`,
      [req.auth.id]
    );
    res.json({ appointments: rows });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar tus citas.' });
  }
});

app.post('/api/appointments', authRequired, async (req, res) => {
  try {
    const user = await findUserById(req.auth.id);
    if (!user || user.role !== 'client' || user.status !== 'accepted') return res.status(403).json({ message: 'Tu cuenta no puede solicitar citas todavía.' });

    const service = String(req.body.service || '').trim();
    const date = toISODate(req.body.date);
    const time = String(req.body.time || '').trim();
    const duration = serviceDuration(service);
    if (!duration || !date || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ message: 'Selecciona un servicio, día y hora válidos.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'La fecha ya pasó.' });

    const scheduleDay = await getScheduleDay(dateWeekday(date));
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) return res.status(400).json({ message: 'Bebé, ese día es de descanso. Elige otro.' });

    const start = toMinutes(time);
    const end = start + duration;
    if (start % 60 !== 0 || start < toMinutes(scheduleDay.start_time) || end > toMinutes(scheduleDay.end_time)) {
      return res.status(409).json({ message: 'Ese horario está fuera de la jornada disponible.' });
    }
    if (isToday(date)) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (start <= currentMinutes) return res.status(409).json({ message: 'Esa hora ya pasó. Elige otra.' });
    }

    const appointments = await getDayAppointments(date);
    if (!slotIsFree(start, duration, appointments)) return res.status(409).json({ message: 'Ese horario ya no está disponible. Elige otro.' });

    const [same] = await pool.query(
      `SELECT id FROM appointments
       WHERE user_id=? AND appointment_date=? AND status IN ('pending','accepted')
       AND appointment_time < ? AND ADDTIME(appointment_time, SEC_TO_TIME(duration_minutes*60)) > ?`,
      [req.auth.id, date, `${time}:00`, `${time}:00`]
    );
    if (same.length) return res.status(409).json({ message: 'Ya tienes una cita que se cruza con ese horario.' });

    await pool.query(
      `INSERT INTO appointments(user_id,client_name,service,duration_minutes,appointment_date,appointment_time,status)
       VALUES(?,?,?,?,?,?,'pending')`,
      [req.auth.id, user.name, service, duration, date, `${time}:00`]
    );
    res.status(201).json({ message: 'Cita enviada. Queda pendiente de confirmación por Suldery.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo crear la cita.' });
  }
});

app.patch('/api/appointments/:id/cancel', authRequired, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE appointments SET status='cancelled'
       WHERE id=? AND user_id=? AND status IN ('pending','accepted')`,
      [req.params.id, req.auth.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'No se encontró la cita.' });
    res.json({ message: 'Cita cancelada.' });
  } catch {
    res.status(500).json({ message: 'No se pudo cancelar la cita.' });
  }
});

app.get('/api/portfolio', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,title,image_url,display_order,created_at
       FROM portfolio_photos ORDER BY display_order ASC, created_at DESC LIMIT 6`
    );
    res.json({ photos: rows });
  } catch {
    res.status(500).json({ message: 'No se pudo cargar el portafolio.' });
  }
});

app.get('/api/owner/users', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,name,email,role,status,created_at FROM users
       WHERE role='client'
       ORDER BY FIELD(status,'pending','accepted','rejected'),created_at DESC`
    );
    res.json({ users: rows });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar las solicitudes.' });
  }
});

app.patch('/api/owner/users/:id/status', authRequired, ownerRequired, async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['accepted', 'rejected', 'pending'].includes(status)) return res.status(400).json({ message: 'Estado inválido.' });
    const [result] = await pool.query(
      `UPDATE users SET status=? WHERE id=? AND role='client'`,
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Clienta no encontrada.' });
    res.json({ message: 'Estado actualizado correctamente.' });
  } catch {
    res.status(500).json({ message: 'No se pudo actualizar la cuenta.' });
  }
});

app.get('/api/owner/appointments', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id,a.client_name,a.service,a.duration_minutes,a.appointment_date,a.appointment_time,a.status,u.email AS client_email
       FROM appointments a LEFT JOIN users u ON u.id=a.user_id
       ORDER BY a.appointment_date,a.appointment_time`
    );
    res.json({ appointments: rows });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar las citas.' });
  }
});

app.patch('/api/owner/appointments/:id/status', authRequired, ownerRequired, async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['accepted', 'rejected', 'cancelled', 'pending'].includes(status)) return res.status(400).json({ message: 'Estado inválido.' });
    const [result] = await pool.query('UPDATE appointments SET status=? WHERE id=?', [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Cita no encontrada.' });
    res.json({ message: 'Estado de la cita actualizado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo actualizar la cita.' });
  }
});

app.get('/api/owner/schedule', authRequired, ownerRequired, async (_req, res) => {
  try { res.json({ schedule: await getSchedule() }); }
  catch { res.status(500).json({ message: 'No se pudo cargar el horario.' }); }
});

app.patch('/api/owner/schedule/:weekday', authRequired, ownerRequired, async (req, res) => {
  try {
    const weekday = Number(req.params.weekday);
    const isOpen = Boolean(req.body.isOpen);
    const start = String(req.body.start || '').trim();
    const end = String(req.body.end || '').trim();
    if (weekday < 1 || weekday > 7) return res.status(400).json({ message: 'Día inválido.' });
    if (isOpen && !validateScheduleHours(start, end)) return res.status(400).json({ message: 'Usa horas exactas, por ejemplo 07:00 a 18:00.' });

    await pool.query(
      'UPDATE working_hours SET is_open=?,start_time=?,end_time=? WHERE weekday=?',
      [isOpen ? 1 : 0, isOpen ? `${start}:00` : null, isOpen ? `${end}:00` : null, weekday]
    );
    const name = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][weekday];
    res.json({ message: `Horario de ${name} actualizado.` });
  } catch {
    res.status(500).json({ message: 'No se pudo guardar el horario.' });
  }
});


app.get('/api/owner/blocked-dates', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, blocked_date, reason FROM blocked_dates ORDER BY blocked_date');
    res.json({
      dates: rows.map(row => ({
        id: row.id,
        date: row.blocked_date instanceof Date ? row.blocked_date.toISOString().slice(0, 10) : String(row.blocked_date).slice(0, 10),
        reason: row.reason || ''
      }))
    });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los días bloqueados.' });
  }
});

app.post('/api/owner/blocked-dates', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.body.date);
    const reason = String(req.body.reason || '').trim().slice(0, 255);
    if (!date) return res.status(400).json({ message: 'Selecciona una fecha válida.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'No puedes bloquear una fecha que ya pasó.' });
    const result = await pool.query(
      `INSERT INTO blocked_dates(blocked_date,reason) VALUES(?,?)
       ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
      [date, reason || null]
    );
    res.status(201).json({ message: 'Día bloqueado correctamente.', date, reason, result: result[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo bloquear el día.' });
  }
});

app.delete('/api/owner/blocked-dates/:id', authRequired, ownerRequired, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM blocked_dates WHERE id=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Día bloqueado no encontrado.' });
    res.json({ message: 'Día desbloqueado correctamente.' });
  } catch {
    res.status(500).json({ message: 'No se pudo desbloquear el día.' });
  }
});

app.get('/api/owner/slots', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!date || !duration) return res.status(400).json({ message: 'Fecha o servicio inválido.' });
    if (isDateInPast(date)) return res.json({ date, service, duration, slots: [] });

    const scheduleDay = await getScheduleDay(dateWeekday(date));
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) return res.json({ date, service, duration, slots: [] });
    const appointments = await getDayAppointments(date);
    res.json({ date, service, duration, slots: slotsForDate(date, scheduleDay, appointments, duration) });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los horarios.' });
  }
});

app.post('/api/owner/appointments', authRequired, ownerRequired, async (req, res) => {
  try {
    const clientName = String(req.body.clientName || '').trim();
    const service = String(req.body.service || '').trim();
    const date = toISODate(req.body.date);
    const time = String(req.body.time || '').trim();
    const duration = serviceDuration(service);
    if (!clientName || !duration || !date || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ message: 'Completa todos los datos.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'La fecha ya pasó.' });

    const scheduleDay = await getScheduleDay(dateWeekday(date));
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) return res.status(400).json({ message: 'Ese día está marcado como descanso.' });

    const start = toMinutes(time);
    const end = start + duration;
    if (start % 60 !== 0 || start < toMinutes(scheduleDay.start_time) || end > toMinutes(scheduleDay.end_time)) {
      return res.status(409).json({ message: 'Ese horario está fuera de tu jornada.' });
    }
    const appointments = await getDayAppointments(date);
    if (!slotIsFree(start, duration, appointments)) return res.status(409).json({ message: 'Ese horario está ocupado.' });

    await pool.query(
      `INSERT INTO appointments(user_id,client_name,service,duration_minutes,appointment_date,appointment_time,status)
       VALUES(NULL,?,?,?,?,?,'accepted')`,
      [clientName, service, duration, date, `${time}:00`]
    );
    res.status(201).json({ message: 'Cita manual registrada y confirmada.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo registrar la cita.' });
  }
});

app.post('/api/owner/portfolio', authRequired, ownerRequired, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen.' });
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM portfolio_photos');
    if (Number(countRows[0].total) >= 6) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ message: 'Ya tienes 6 fotos. Elimina una antes de subir otra.' });
    }

    const title = String(req.body.title || 'Diseño Suldery Nails').trim().slice(0, 120) || 'Diseño Suldery Nails';
    const imageUrl = `/uploads/portfolio/${encodeURIComponent(req.file.filename)}`;
    const [orderRows] = await pool.query('SELECT COALESCE(MAX(display_order),0) + 1 AS next_order FROM portfolio_photos');
    const displayOrder = Number(orderRows[0].next_order) || 1;
    const [result] = await pool.query(
      'INSERT INTO portfolio_photos(title,image_url,display_order) VALUES(?,?,?)',
      [title, imageUrl, displayOrder]
    );
    res.status(201).json({ photo: { id: result.insertId, title, image_url: imageUrl, display_order: displayOrder } });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: error.message || 'No se pudo subir la foto.' });
  }
});

app.delete('/api/owner/portfolio/:id', authRequired, ownerRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM portfolio_photos WHERE id=?', [req.params.id]);
    const photo = rows[0];
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada.' });

    await pool.query('DELETE FROM portfolio_photos WHERE id=?', [req.params.id]);
    const fileName = decodeURIComponent(photo.image_url.replace('/uploads/portfolio/', ''));
    const filePath = path.join(uploadDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await normalizePortfolioOrder();
    res.json({ message: 'Foto eliminada.' });
  } catch {
    res.status(500).json({ message: 'No se pudo eliminar la foto.' });
  }
});

async function normalizePortfolioOrder() {
  const [rows] = await pool.query('SELECT id FROM portfolio_photos ORDER BY display_order ASC, created_at DESC');
  for (let index = 0; index < rows.length; index++) {
    await pool.query('UPDATE portfolio_photos SET display_order=? WHERE id=?', [index + 1, rows[index].id]);
  }
}

app.patch('/api/owner/portfolio/:id/move', authRequired, ownerRequired, async (req, res) => {
  try {
    const direction = req.body.direction === 'up' ? 'up' : req.body.direction === 'down' ? 'down' : null;
    if (!direction) return res.status(400).json({ message: 'Movimiento inválido.' });

    const [rows] = await pool.query(
      'SELECT id,display_order FROM portfolio_photos ORDER BY display_order ASC, created_at DESC'
    );
    const index = rows.findIndex(row => String(row.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ message: 'Foto no encontrada.' });
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return res.json({ message: 'La foto ya está en ese extremo.' });

    const current = rows[index];
    const target = rows[targetIndex];
    await pool.query('UPDATE portfolio_photos SET display_order=? WHERE id=?', [target.display_order, current.id]);
    await pool.query('UPDATE portfolio_photos SET display_order=? WHERE id=?', [current.display_order, target.id]);
    await normalizePortfolioOrder();
    res.json({ message: 'Orden del portafolio actualizado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo cambiar el orden de las fotos.' });
  }
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ message: error.message || 'Solicitud inválida.' });
});

(async () => {
  try {
    ensureUploadDirectory();
    await initDatabase();
    await pool.query(`ALTER TABLE portfolio_photos ADD COLUMN display_order INT NOT NULL DEFAULT 0`)
      .catch(error => {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      });
    await normalizePortfolioOrder();
    app.listen(PORT, () => console.log(`Suldery Nails funcionando en http://localhost:${PORT}`));
  } catch (error) {
    console.error('\nNo se pudo iniciar Suldery Nails.');
    console.error(error.message);
    console.error('\nRevisa tu archivo .env y las credenciales de MySQL.\n');
    process.exit(1);
  }
})();
