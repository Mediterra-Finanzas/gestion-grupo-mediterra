// api/_procThrottle.js — Rate-limit del endpoint PROC (Option C, integra R3-S3). SERVER-ONLY.
// La DB (proc_fn_auth_attempt) recibe SOLO claves OPACAS: HMAC-SHA256(PROC_THROTTLE_SECRET, dominio|valor).
// La DB NUNCA conoce email ni IP. Defensa por capas:
//   (A) bucket IDENTIDAD      = HMAC("identity|" + email_norm)         → funciona SIN IP; rotar IP NO lo evade.
//   (B) bucket IDENTIDAD/IP   = HMAC("identity-ip|" + email_norm|ip)   → frena abuso por IP (defensa adicional).
// Si cualquiera está bloqueado → la request se rechaza (429). En éxito de login se resetean ambos.
//
// IP AUTORITATIVA (Vercel): se usa `x-real-ip` (lo setea la plataforma Vercel; valor único, no lista) como
// fuente primaria; fallback al ÚLTIMO segmento de `x-forwarded-for` (el que Vercel anexa como IP conectante).
// NO se confía en un XFF arbitrario multi-valor del cliente. Si no hay IP → solo aplica el bucket IDENTIDAD
// (el límite por identidad nunca desaparece). Doc: vercel.com/docs/headers/request-headers.
const crypto = require("crypto");

const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();

// IP server-trusted. Prioriza x-real-ip (Vercel). Normaliza; null si ausente.
function trustedIp(req) {
  const h = (req && req.headers) || {};
  const real = norm(h["x-real-ip"]);
  if (real) return real;
  const xff = String(h["x-forwarded-for"] || "");
  if (xff) {
    const parts = xff.split(",").map((x) => norm(x)).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]; // el segmento anexado por Vercel (conectante)
  }
  return null;
}

// HMAC-SHA256(secret, dominio|valor) → hex 64 (token opaco; cumple el CHECK de proc_auth_throttle).
function bucket(secret, dominio, valor) {
  return crypto.createHmac("sha256", secret).update(`${dominio}|${valor}`).digest("hex");
}

// Calcula las claves opacas para una request. Fail-closed si falta el secreto (no se puede limitar → no se sigue).
function bucketsFor({ secret, email, ip }) {
  if (!secret) { const e = new Error("PROC_THROTTLE_SECRET ausente"); e.failClosed = true; throw e; }
  const em = norm(email);
  const keys = [bucket(secret, "identity", em)];
  if (ip) keys.push(bucket(secret, "identity-ip", `${em}|${ip}`));
  return keys;
}

// Registra el intento en TODAS las capas; bloqueado si CUALQUIERA excede el límite.
// deps.rpc(fn,args) = llamada RPC server-side (service_role). Devuelve {allowed, keys}.
async function checkAttempt(deps, { secret, email, ip }) {
  const keys = bucketsFor({ secret, email, ip });
  let allowed = true;
  for (const k of keys) {
    const ok = await deps.rpc("proc_fn_auth_attempt", { p_key: k });
    if (ok === false) allowed = false;   // registra en todas las capas; una bloqueada → bloqueado
  }
  return { allowed, keys };
}

// Reset (éxito de login) de las capas dadas. Best-effort (no rompe el login si falla el reset).
async function resetKeys(deps, keys) {
  for (const k of keys || []) { try { await deps.rpc("proc_fn_auth_reset", { p_key: k }); } catch (_) {} }
}

module.exports = { trustedIp, bucket, bucketsFor, checkAttempt, resetKeys, norm };
