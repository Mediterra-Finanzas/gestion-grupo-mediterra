// api/_pinsServer.js — Helpers server-side compartidos de la Fase E (SEC-P0-CONTAINMENT).
//
// Objetivo: dar a los endpoints hermanos de PIN (pin-login, pin-change, pin-admin-reset,
// pin-reset-self, pin-create, pin-status) TODO lo que hoy el navegador resuelve leyendo la
// fila `pins` de calendario_data. Con esto el cliente deja de necesitar `dbLoadPins()` y se
// puede RLS-deny anon SELECT sobre `pins`.
//
// Reglas duras (idénticas a legacy-login.js):
//  - service_role SOLO server-side (vía supaFetch de _auth.js). La llave nunca baja al browser.
//  - Hash-only: se valida contra el HASH PBKDF2 (`_h`/`_temp`), nunca contra plaintext.
//  - No traslada el problema: NUNCA se devuelve `_h`/`_temp`/hash/salt/pin al cliente.
//  - Fail-closed: sin secretos o error de lectura => el endpoint responde 503.
//
// Réplicas EXACTAS de src/pinHash.js (PBKDF2-HMAC-SHA256, 16B salt, 32B hash, 100000 iter) y
// de las funciones de App.jsx (estadoTemp, verificarTemp, pinNuevoValido, normalizarCelular,
// genCodigo6) para que un PIN/código valga igual en browser y servidor.
const crypto = require("crypto");
const { supaFetch, faltanSecretos } = require("./_auth.js");
const { verifyPinPBKDF2 } = require("./_iamToken.js");

const PIN_ITER = 100000;
const PIN_LEN_BYTES = 32;

const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();

// ── Hash de PIN (crea credencial `_h`/`_temp`). Formato = el de src/pinHash.js.hashPin ──
function hashPinPBKDF2(pin) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(String(pin), salt, PIN_ITER, PIN_LEN_BYTES, "sha256");
  return { v: 1, iter: PIN_ITER, salt: salt.toString("hex"), hash: derived.toString("hex") };
}

// ── Código provisorio de 6 dígitos (réplica de genCodigo6 de App.jsx) ──
function genCodigo6() {
  return String(crypto.randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
}

const TEMP_TTL_MS = 45 * 60 * 1000; // 45 minutos (igual que App.jsx)

// Devuelve el JSON string a guardar en pins[`${nombre}_temp`] (hash + expiración).
function crearTempCredServer(codigo) {
  const cred = hashPinPBKDF2(codigo);
  cred.exp = Date.now() + TEMP_TTL_MS;
  return JSON.stringify(cred);
}

// Réplica EXACTA de estadoTemp(rawTemp) de App.jsx. `now` inyectable para tests.
function estadoTempServer(rawTemp, now = Date.now()) {
  if (!rawTemp) return { existe: false, vigente: false, expirado: false, cred: null, legacy: false };
  let cred = null;
  try {
    if (typeof rawTemp === "string" && rawTemp.trim().startsWith("{")) cred = JSON.parse(rawTemp);
    else if (rawTemp && typeof rawTemp === "object") cred = rawTemp;
  } catch { cred = null; }
  if (cred && cred.salt && cred.hash) {
    const expirado = !!(cred.exp && now > cred.exp);
    return { existe: true, vigente: !expirado, expirado, cred, legacy: false };
  }
  return { existe: true, vigente: true, expirado: false, cred: null, legacy: true, plano: String(rawTemp) };
}

// Verifica un código contra el estado del `_temp`. NO exige vigencia (el llamador decide).
function verificarTempServer(codigo, est) {
  if (!est || !est.existe) return false;
  if (est.legacy) return String(codigo) === est.plano;
  try { return !!verifyPinPBKDF2(codigo, est.cred); } catch { return false; }
}

// Réplica EXACTA de pinNuevoValido de src/pinHash.js.
function pinNuevoValido(pin) {
  if (!/^\d{6}$/.test(pin)) return { ok: false, msg: "El PIN debe ser exactamente 6 dígitos numéricos." };
  if (/^(\d)\1{5}$/.test(pin)) return { ok: false, msg: "No uses 6 dígitos iguales (ej. 111111)." };
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return { ok: false, msg: "No uses una secuencia (ej. 123456, 654321)." };
  return { ok: true };
}

// Réplica EXACTA de normalizarCelular de src/pinHash.js.
function normalizarCelularServer(input) {
  const d = String(input || "").replace(/\D/g, "");
  let n = d;
  if (n.startsWith("56")) n = n.slice(2);
  if (n.length === 9 && n.startsWith("9")) return { ok: true, tel: "56" + n };
  return { ok: false, msg: "Ingresa un celular válido (9 dígitos, ej. 9 1234 5678)." };
}

// ── Acceso a calendario_data con service_role (solo servidor) ──
async function realGetRowValue(id) {
  const r = await supaFetch(`calendario_data?id=eq.${encodeURIComponent(id)}&select=value`);
  if (!r.ok) throw new Error(`calendario_data/${id} → ${r.status}`);
  const t = await r.text();
  const arr = t ? JSON.parse(t) : [];
  return Array.isArray(arr) && arr[0] ? arr[0].value : null;
}

// Upsert additivo de la fila `pins` (merge-duplicates). value ya es el objeto pins completo.
async function realSetRowValue(id, value) {
  const r = await supaFetch(`calendario_data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id, value, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`upsert calendario_data/${id} → ${r.status}`);
  return true;
}

// Busca un usuario por email (igualdad normalizada) dentro de main.value.usuarios.
function findUsuario(mainVal, email) {
  const usuarios = mainVal && Array.isArray(mainVal.usuarios) ? mainVal.usuarios : [];
  const e = norm(email);
  return usuarios.find((x) => x && norm(x.email) === e) || null;
}

// ¿El usuario es admin? (rol admin o esCFO). Se usa para gatear endpoints de administración.
function esAdmin(u) {
  return !!(u && (u.rol === "admin" || u.esCFO === true));
}

module.exports = {
  norm, PIN_ITER, TEMP_TTL_MS,
  hashPinPBKDF2, genCodigo6, crearTempCredServer,
  estadoTempServer, verificarTempServer, pinNuevoValido, normalizarCelularServer,
  realGetRowValue, realSetRowValue, findUsuario, esAdmin,
  verifyPinPBKDF2, faltanSecretos,
};
