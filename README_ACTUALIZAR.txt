SULDERY NAILS - MYSQL
VERSIÓN 1.4

Estructura:
public/index.html      -> solo inicio de sesión
public/registro.html   -> solo registro
public/cliente.html    -> solo panel de clienta
public/duena.html      -> solo panel de dueña
public/auth.js         -> sesión y API común
public/login.js        -> login
public/registro.js     -> registro
public/cliente.js      -> calendario, horas, citas y carrusel
public/duena.js        -> cuentas, citas, horarios y portafolio
public/style.css       -> diseño completo
server.js              -> API Express + MySQL
schema.sql             -> tablas
scripts/create-owner.js -> crear/actualizar dueña

IMPORTANTE:
- No subas .env a GitHub.
- MySQL usa localhost:3306 por defecto.
- Las citas usan la duración configurada por servicio (Polygel: 2 horas; demás servicios: 1 hora).
- Horario inicial: lunes a sábado 07:00-18:00 y domingo descanso.
- La dueña puede cambiar cada día desde duena.html.

ARRANQUE:
1) npm install
2) npm start
3) abrir http://localhost:3000


ACTUALIZACION V1.3

Servicios configurados:
- Manicure semipermanente: 1 hora
- Pedicure: 1 hora
- Polygel: 2 horas
- Dipping: 1 hora
- Forrado: 1 hora

La disponibilidad del calendario ahora se calcula segun el servicio elegido. Para Polygel solo aparecen horas en las que caben las 2 horas completas.

PORTAFOLIO:
La dueña puede subir hasta 6 fotos, eliminarlas y cambiar el orden con las flechas ↑ y ↓. Ese mismo orden es el que aparece en el carrusel de las clientas.

HORARIO:
La dueña puede abrir/cerrar cada dia y cambiar la hora de inicio y fin desde su panel. El horario inicial es lunes a sabado de 07:00 a 18:00 y domingo de descanso.

NOVEDADES V1.4
- Interfaz visible completamente en español y corregida la codificación UTF-8.
- Modo oscuro aplicado a toda la interfaz.
- Reserva para clientas por pasos: día → hora → servicio → confirmación.
- El formulario de reserva permanece oculto hasta pulsar “Agendar cita”.
- Los domingos están cerrados por defecto.
- La dueña puede bloquear fechas específicas desde su panel.
- Las fechas bloqueadas se muestran en rojo y no aceptan reservas.
- El portafolio de hasta 6 fotos se reutiliza en el carrusel del panel de clienta y en la pantalla de inicio de sesión.


SULDERY NAILS · VERSIÓN 1.5

Mejoras recientes:
- Calendario de reservas con cabecera de marca y logo visible en modo claro y oscuro.
- Días del calendario con estados visuales: disponible, bloqueado, descanso, agotado y pasado.
- Flujo de reserva paso a paso: día → hora → servicio → confirmación.
- Tema oscuro aplicado correctamente al body y a toda la interfaz.
- Correcciones de texto/acentos para evitar problemas de codificación.
