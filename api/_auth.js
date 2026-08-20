// api/_auth.js — Helpers compartidos del "guardia intermedio" (Etapa 1)
// ---------------------------------------------------------------------
// NO es un endpoint: lo importan api/login.js y api/db/[...path].js.
//
// Qué hace:
//   - Firma/verifica un token de sesión (HMAC-SHA256) → cookie httpOnly.
//   - Lee la llave de servicio de Supabase desde variables de entorno
//     (NUNCA va en el navegador).
//
// Secretos que esperan estar en Vercel (Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY   La llave "service_role" de Supabase.
//   SESSION_SECRET              Clave larga al azar para firmar sesiones.
//
// Sin dependencias npm nuevas: solo 'crypto' (nativo de Node).

const crypto = require("crypto");

// Preview (staging) → SUPABASE_URL apunta a gestion-mediterra-staging.
// Production → sin SUPABASE_URL, cae al fallback productivo CURRENT (sin cambio de comportamiento).
const SUPA_URL = process.env.SUPABASE_URL || "https://bywovqayuzodbzwsriet.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";

const COOKIE_NAME = "mediterra_sess";
const SESION_HORAS = 12; // la sesión dura 12 horas

// ---- base64url ----
function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJSON(obj) { return b64url(JSON.stringify(obj)); }
function fromB64url(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

// ---- firma de sesión ----
// token = <payloadB64>.<firmaB64>
function firmarSesion(payload) {
  const body = b64urlJSON(payload);
  const firma = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest();
  return body + "." + b64url(firma);
}

// Devuelve el payload si el token es válido y no expiró; si no, null.
function verificarSesion(token) {
  if (!token || !SESSION_SECRET) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [body, firmaRecibida] = partes;
  const firmaEsperada = b64url(
    crypto.createHmac("sha256", SESSION_SECRET).update(body).digest()
  );
  // comparación en tiempo constante
  const a = Buffer.from(firmaRecibida);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(body)); } catch { return null; }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function crearToken({ email, nombre, rol }) {
  return firmarSesion({
    email, nombre, rol,
    exp: Date.now() + SESION_HORAS * 3600 * 1000,
  });
}

// ---- cookies ----
function leerCookie(req, nombre) {
  const raw = req.headers.cookie || "";
  for (const par of raw.split(";")) {
    const [k, ...v] = par.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return null;
}
function cookieSesion(token) {
  const maxAge = SESION_HORAS * 3600;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function cookieBorrar() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// Lee la sesión vigente del request (o null).
function sesionDeRequest(req) {
  return verificarSesion(leerCookie(req, COOKIE_NAME));
}

// ---- acceso a Supabase con la llave de servicio (solo servidor) ----
async function supaFetch(path, opts = {}) {
  const url = `${SUPA_URL}/rest/v1/${path}`;
  const headers = Object.assign({
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  }, opts.headers || {});
  return fetch(url, { ...opts, headers });
}

function faltanSecretos() {
  return !SERVICE_KEY || !SESSION_SECRET;
}

module.exports = {
  SUPA_URL, COOKIE_NAME, SESION_HORAS,
  crearToken, verificarSesion, sesionDeRequest,
  cookieSesion, cookieBorrar, leerCookie,
  supaFetch, faltanSecretos,
};
