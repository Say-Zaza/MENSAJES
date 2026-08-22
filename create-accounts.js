// ============================================
// ALTA DE CUENTAS (UNA SOLA VEZ)
// Crea las 2 cuentas email/contraseña de la pareja en Firebase Auth.
// Uso: 1) edita sync-config.json con tus emails y contraseñas
//       2) ejecuta: node create-accounts.js
// ============================================
const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk';

function loadConfig() {
  const cfgPath = path.join(__dirname, 'sync-config.json');
  if (!fs.existsSync(cfgPath)) {
    console.error('❌ No existe sync-config.json. Edítalo con tus emails y contraseñas antes de ejecutar.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

async function api(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  }
  return data;
}

async function getUid(email, password) {
  const data = await api(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { email, password, returnSecureToken: true }
  );
  return data.localId;
}

async function createAccount(email, password) {
  const data = await api(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    { email, password, returnSecureToken: true }
  );
  return data.localId;
}

async function ensureAccount(label, email, password) {
  if (!email || !password || email === 'tucorreo@ejemplo.com' || email === 'su_correo@ejemplo.com') {
    console.log(`⚠️ [${label}] Falta email/contraseña real en sync-config.json. Se omite.`);
    return;
  }
  try {
    const uid = await createAccount(email, password);
    console.log(`✅ [${label}] ${email} creada -> UID: ${uid}`);
  } catch (e) {
    if (e.message === 'EMAIL_EXISTS' || e.message.includes('EMAIL_EXISTS')) {
      try {
        const uid = await getUid(email, password);
        console.log(`ℹ️ [${label}] ${email} ya existe -> UID: ${uid}`);
      } catch (e2) {
        console.error(`❌ [${label}] ${email} ya existe pero la contraseña no coincide. Revisa sync-config.json.`);
      }
    } else {
      console.error(`❌ [${label}] ${e.message}`);
    }
  }
}

async function main() {
  const cfg = loadConfig();
  console.log('=== Alta de cuentas (una sola vez) ===');
  await ensureAccount('Tú (user1)', cfg.user1Email, cfg.user1Password);
  await ensureAccount('Mi Amor (user2)', cfg.user2Email, cfg.user2Password);
  console.log('\nListo. Ya puedes iniciar sesión en la web con esos emails.');
  console.log('Si cambias las contraseñas en la consola de Firebase, actualiza también sync-config.json.');
}

main().catch(console.error);