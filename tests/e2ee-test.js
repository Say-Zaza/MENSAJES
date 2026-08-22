/**
 * Test de la lógica E2EE del Chat Pareja
 * Replica las funciones de app.js usando WebCrypto de Node (>=18)
 */
const assert = require('assert');

const ENC_PREFIX = 'enc1:';

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return Buffer.from(bytes).toString('base64');
}
function b64ToBuf(b64) {
  return Buffer.from(b64, 'base64').buffer.slice(Buffer.from(b64, 'base64').byteOffset, Buffer.from(b64, 'base64').byteOffset + Buffer.from(b64, 'base64').byteLength);
}
function isEncryptedText(t) {
  return typeof t === 'string' && t.indexOf(ENC_PREFIX) === 0;
}
async function deriveKey(pass) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('chatpareja-e2ee-v1'), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptText(key, plain) {
  if (!key || !plain) return plain || '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return ENC_PREFIX + bufToB64(iv) + ':' + bufToB64(ct);
}
async function decryptText(key, payload) {
  if (!isEncryptedText(payload)) return payload;
  try {
    const parts = payload.split(':');
    const ivB = Buffer.from(parts[1], 'base64');
    const ctB = Buffer.from(parts[2], 'base64');
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivB.buffer, ivB.byteOffset, ivB.byteLength) },
      key,
      ctB
    );
    return new TextDecoder().decode(pt);
  } catch (e) {
    return '[🔒 No se pudo descifrar]';
  }
}

(async () => {
  console.log('=== TEST: E2EE roundtrip ===');

  // 1. Roundtrip con misma frase
  const k1 = await deriveKey('nuestra-frase-secreta');
  const cipher = await encryptText(k1, 'Te amo 💕');
  assert.ok(isEncryptedText(cipher), 'FAIL: el texto debería estar cifrado');
  assert.ok(!cipher.includes('Te amo'), 'FAIL: el plaintext no debe aparecer en el cifrado');
  const plain = await decryptText(k1, cipher);
  assert.strictEqual(plain, 'Te amo 💕');
  console.log('  ✅ PASS 1: Cifrar → descifrar con misma frase restaura el texto');

  // 2. Frase distinta NO descifra
  const k2 = await deriveKey('otra-frase-distinta');
  const wrong = await decryptText(k2, cipher);
  assert.ok(wrong.indexOf('[🔒') === 0, 'FAIL: frase incorrecta no debe revelar texto');
  console.log('  ✅ PASS 2: Frase distinta produce [🔒 No se pudo descifrar]');

  // 3. Texto plano pasa intacto (compatibilidad historial viejo)
  const legacy = await decryptText(k1, 'mensaje antiguo sin cifrar');
  assert.strictEqual(legacy, 'mensaje antiguo sin cifrar');
  console.log('  ✅ PASS 3: Mensajes antiguos en texto plano siguen legibles');

  // 4. Texto vacío no se cifra
  const empty = await encryptText(k1, '');
  assert.strictEqual(empty, '');
  console.log('  ✅ PASS 4: Texto vacío permanece vacío');

  // 5. IV único → mismos textos producen cifrados distintos
  const c1 = await encryptText(k1, 'hola');
  const c2 = await encryptText(k1, 'hola');
  assert.notStrictEqual(c1, c2);
  console.log('  ✅ PASS 5: IV aleatorio — dos cifrados del mismo texto difieren');

  // 6. Determinismo de derivación (misma frase → misma clave)
  const k1b = await deriveKey('nuestra-frase-secreta');
  const rt = await decryptText(k1b, cipher);
  assert.strictEqual(rt, 'Te amo 💕');
  console.log('  ✅ PASS 6: Misma frase deriva la misma clave (PBKDF2 determinista)');

  console.log('\n=== TODOS LOS TESTS E2EE PASARON ===');
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
