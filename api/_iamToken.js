// api/_iamToken.js — Minteo/verificación de JWT `authenticated` para PROC (Opción C).
// HS256 con el SECRET JWT DEL PROYECTO SUPABASE (PGRST_JWT_SECRET), NO el service_role.
// Sólo crypto nativo de Node (sin dependencias npm nuevas). Server-side únicamente.
//
// El JWT resultante lo acepta PostgREST: cambia el rol de DB a `authenticated` (claim role) y
// expone los claims en request.jwt.claims → proc_current_empresa()=empresa_id, proc_current_user()=sub.
// El empresa_id lo pone SIEMPRE el server tras verificar membresía; nunca se confía al browser.
const crypto = require("crypto");

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJSON(obj) { return b64url(Buffer.from(JSON.stringify(obj), "utf8")); }
function fromB64url(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

// Mintea un JWT authenticated. `now` inyectable (segundos) para tests deterministas.
function mintProcToken({ secret, sub, empresaId, ttlSec = 1200, now = Math.floor(Date.now() / 1000) }) {
  if (!secret) throw new Error("mintProcToken: falta secret");
  if (!sub || !empresaId) throw new Error("mintProcToken: sub y empresaId son obligatorios");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "authenticated",
    aud: "authenticated",
    sub: String(sub),
    empresa_id: String(empresaId),
    iat: now,
    exp: now + ttlSec,
  };
  const body = `${b64urlJSON(header)}.${b64urlJSON(payload)}`;
  const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

// Verifica firma + exp. Devuelve el payload o null. `now` inyectable para tests.
function verifyProcToken(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const esperada = b64url(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
  const a = Buffer.from(sig), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(p).toString("utf8")); } catch { return null; }
  if (!payload || payload.role !== "authenticated") return null;
  if (!payload.exp || now >= payload.exp) return null;
  return payload;
}

// Verifica un PIN contra la credencial PBKDF2 de la fila `pins` ({v,iter,salt,hash}).
// Replica exactamente pinHash.js (PBKDF2-HMAC-SHA256, 32 bytes) con crypto nativo. Constant-time.
function verifyPinPBKDF2(pin, cred) {
  try {
    if (!cred || cred.v !== 1 || !cred.salt || !cred.hash) return false;
    const salt = Buffer.from(cred.salt, "hex");
    const derived = crypto.pbkdf2Sync(String(pin), salt, cred.iter || 100000, 32, "sha256");
    const expected = Buffer.from(cred.hash, "hex");
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch { return false; }
}

module.exports = { mintProcToken, verifyProcToken, verifyPinPBKDF2, b64url };
