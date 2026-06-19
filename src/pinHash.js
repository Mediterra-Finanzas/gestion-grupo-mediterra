/* eslint-disable */
// src/pinHash.js — Cifrado de PINs (FASE 2b)
// ------------------------------------------------------------------
// Hashea y verifica PINs con PBKDF2-HMAC-SHA256 vía Web Crypto (nativo,
// sin dependencias). El mismo formato lo entienden el navegador, el guardia
// (api/login.js, Node) y la Edge Function osiris-auth (Deno), para que un PIN
// migrado valide igual en cualquiera.
//
// Formato almacenado (JSON string en pinsPersonalizados[`${nombre}_h`]):
//   { "v":1, "iter":100000, "salt":"<hex>", "hash":"<hex>" }

const PIN_ITER = 100000;
const PIN_LEN_BYTES = 32;

function bufToHex(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
function hexToBuf(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
}

async function pbkdf2(pin, saltBuf, iter) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: iter, hash: "SHA-256" },
    key, PIN_LEN_BYTES * 8
  );
  return bufToHex(bits);
}

// Devuelve el objeto credencial (para guardar como JSON.stringify(...)).
export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(String(pin), salt, PIN_ITER);
  return { v: 1, iter: PIN_ITER, salt: bufToHex(salt), hash };
}

// Verifica un PIN contra una credencial (objeto o string JSON). Comparación
// en tiempo razonablemente constante (longitudes iguales).
export async function verifyPin(pin, cred) {
  try {
    const c = typeof cred === "string" ? JSON.parse(cred) : cred;
    if (!c || !c.salt || !c.hash) return false;
    const calc = await pbkdf2(String(pin), hexToBuf(c.salt), c.iter || PIN_ITER);
    if (calc.length !== c.hash.length) return false;
    let diff = 0;
    for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ c.hash.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    return false;
  }
}

// Validación de clave nueva: mínimo 6 caracteres alfanuméricos (letras y/o
// números), no obvia. FASE 3: se permite alfanumérico (antes era 6 dígitos).
export function pinNuevoValido(pin) {
  if (!/^[A-Za-z0-9]{6,64}$/.test(pin)) {
    return { ok: false, msg: "Mínimo 6 caracteres, solo letras y/o números." };
  }
  if (/^(.)\1+$/.test(pin)) return { ok: false, msg: "No uses todos los caracteres iguales." };
  // Si es solo numérica, bloquear secuencias obvias
  if (/^\d+$/.test(pin) && ("0123456789".includes(pin) || "9876543210".includes(pin))) {
    return { ok: false, msg: "No uses una secuencia (ej. 123456)." };
  }
  return { ok: true };
}

// Normaliza/valida celular chileno. Acepta "+56 9 1234 5678", "9 1234 5678",
// "912345678". Devuelve { ok, tel } con tel normalizado a "569XXXXXXXX".
export function normalizarCelular(input) {
  const d = String(input || "").replace(/\D/g, "");
  let n = d;
  if (n.startsWith("56")) n = n.slice(2);
  if (n.length === 9 && n.startsWith("9")) return { ok: true, tel: "56" + n };
  return { ok: false, msg: "Ingresa un celular válido (9 dígitos, ej. 9 1234 5678)." };
}
