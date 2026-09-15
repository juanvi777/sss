const readline = require('readline');
const bcrypt = require('bcryptjs');
const { initDatabase, pool } = require('../db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = question => new Promise(resolve => rl.question(question, answer => resolve(answer)));

(async () => {
  try {
    await initDatabase();

    const name = (await ask('Nombre de la dueña: ')).trim();
    const email = (await ask('Correo de la dueña: ')).trim().toLowerCase();
    const password = (await ask('Contraseña de la dueña: ')).trim();

    if (name.length < 2) throw new Error('El nombre no es válido.');
    if (!email.includes('@')) throw new Error('El correo no es válido.');
    if (password.length < 6) throw new Error('La contraseña debe tener mínimo 6 caracteres.');

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (?, ?, ?, 'owner', 'accepted')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_hash = VALUES(password_hash),
         role = 'owner',
         status = 'accepted'`,
      [name, email, passwordHash]
    );

    console.log(`\nDueña configurada correctamente: ${email}`);
  } catch (error) {
    console.error(`\nNo se pudo crear la dueña: ${error.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
})();
