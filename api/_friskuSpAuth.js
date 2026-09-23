/* eslint-disable */
// api/_friskuSpAuth.js — Autorización EXCLUSIVA de "SharePoint Frisku" (S4.1)
// ------------------------------------------------------------------------------
// NO es un endpoint. Helper backend, sin red: recibe filas YA cargadas (usuarios/pins)
// y decide, de forma READ-ONLY, si un email+PIN corresponde a un usuario vigente con
// acceso a Frisku. Emite/valida una sesión propia (cookie exclusiva, secreto propio).
//
// Reproduce el MISMO PBKDF2-HMAC-SHA256 del navegador (src/pinHash.js) con crypto nativo
// de Node: 100000 iter, SHA-256, 32 bytes, salt hex. No escribe nada, no toca timestamps.
//
// NO reintroduce el bypass del login retirado (un PIN base de 4 dígitos que saltaba la
// migración a 6): exige cred.pol === "6dig" y NO inicia sesión de app, solo capability
// `frisku-sp:read`. Nunca acepta un token creado por el frontend (HMAC con secreto propio).
//
// Secreto esperado (Vercel env, NUNCA en el bundle): FRISKU_SP_SESSION_SECRET.

const crypto = require("crypto");

const PIN_ITER_DEFAULT = 100000;
const PIN_LEN_BYTES = 32;
const COOKIE_NAME = "frisku_sp_sess";
const COOKIE_PATH = "/api/frisku-sp";      // la cookie SOLO viaja al endpoint Frisku
const SESION_MIN = 30;                      // duración corta
const SESION_VERSION = 1;
const CAP = "frisku-sp:read";
const MODULO_FRISKU = "frisku";

function normalizarEmail(e) { return String(e == null ? "" : e).trim().toLowerCase(); }

// ¿El usuario tiene acceso a Frisku? admin = todo; si no, debe listar "frisku". Debe estar activo.
function tieneCapabilidadFrisku(user) {
  if (!user || user.desactivado) return false;
  if (user.rol === "admin") return true;
  return Array.isArray(user.modulos) && user.modulos.includes(MODULO_FRISKU);
}

// La credencial es vigente solo si es de la política de 6 dígitos (evita honrar PIN legacy).
function credVigente(cred) {
  const c = typeof cred === "string" ? safeParse(cred) : cred;
  return !!(c && c.salt && c.hash && c.pol === "6dig");
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// Verifica un PIN contra una credencial {iter,salt,hash} usando PBKDF2 nativo. Constante en tiempo.
function verificarPin(pin, cred) {
  const c = typeof cred === "string" ? safeParse(cred) : cred;
  if (!c || !c.salt || !c.hash) return false;
  let calc;
  try {
    calc = crypto.pbkdf2Sync(String(pin), Buffer.from(c.salt, "hex"), c.iter || PIN_ITER_DEFAULT, PIN_LEN_BYTES, "sha256").toString("hex");
  } catch (e) { return false; }
  const a = Buffer.from(calc, "utf8");
  const b = Buffer.from(String(c.hash), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Identificador interno OPACO para la sesión (no PII): HMAC del nombre con el secreto.
function idOpaco(nombre, secret) {
  return crypto.createHmac("sha256", String(secret || "")).update("u:" + String(nombre || "")).digest("hex").slice(0, 32);
}

// Decisión READ-ONLY de acceso, dadas las filas ya cargadas. Respuesta genérica ante fallo
// (no distingue email inexistente de PIN incorrecto → no permite enumerar emails).
//   usuarios: array de la fila "usuarios"; pins: objeto de la fila "pins".
// Devuelve { ok:true, sub } | { ok:false, motivo:"credenciales"|"sin_capability" }.
function evaluarAcceso({ usuarios, pins, email, pin, secret }) {
  const arr = Array.isArray(usuarios) ? usuarios : [];
  const em = normalizarEmail(email);
  if (!em || typeof pin !== "string" || !pin) return { ok: false, motivo: "credenciales" };
  // Email debe corresponder a EXACTAMENTE un usuario. 0 → inexistente; >1 → padrón ambiguo:
  // en ambos casos se falla CERRADO (nunca se elige el primero silenciosamente).
  const matches = arr.filter(u => normalizarEmail(u && u.email) === em);
  if (matches.length !== 1) return { ok: false, motivo: "credenciales" };
  const user = matches[0];
  if (user.desactivado || !user.nombre) return { ok: false, motivo: "credenciales" };
  // Nombre duplicado en el padrón → credencial ambigua (`${nombre}_h`) → fallo cerrado.
  if (arr.filter(u => u && u.nombre === user.nombre).length !== 1) return { ok: false, motivo: "credenciales" };
  const cred = pins && Object.prototype.hasOwnProperty.call(pins, `${user.nombre}_h`) ? pins[`${user.nombre}_h`] : null;
  if (!credVigente(cred)) return { ok: false, motivo: "credenciales" };
  if (!verificarPin(pin, cred)) return { ok: false, motivo: "credenciales" };
  // Credencial correcta: recién aquí se distingue la falta de capability (no filtra emails).
  if (!tieneCapabilidadFrisku(user)) return { ok: false, motivo: "sin_capability" };
  return { ok: true, sub: idOpaco(user.nombre, secret) };
}

// ── Sesión HMAC exclusiva ──  token = <payloadB64url>.<firmaB64url>
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromB64url(s) { return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }

function firmarSesionSp(sub, secret, ahoraMs) {
  const now = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  const payload = { sub, cap: CAP, v: SESION_VERSION, iat: now, exp: now + SESION_MIN * 60 * 1000 };
  const body = b64url(JSON.stringify(payload));
  const firma = b64url(crypto.createHmac("sha256", String(secret || "")).update(body).digest());
  return body + "." + firma;
}

// Devuelve el payload si firma + versión + capability + exp son válidos; si no, null.
function verificarSesionSp(token, secret, ahoraMs) {
  if (!token || !secret) return null;
  const partes = String(token).split(".");
  if (partes.length !== 2) return null;
  const [body, firmaRx] = partes;
  const firmaEsp = b64url(crypto.createHmac("sha256", String(secret)).update(body).digest());
  const a = Buffer.from(firmaRx); const b = Buffer.from(firmaEsp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(fromB64url(body)); } catch (e) { return null; }
  if (!p || p.v !== SESION_VERSION || p.cap !== CAP || !p.exp) return null;
  const now = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  if (now > p.exp) return null;
  return p;
}

function leerCookieSp(req) {
  const raw = (req && req.headers && req.headers.cookie) || "";
  const encontrados = [];
  for (const par of raw.split(";")) {
    const [k, ...v] = par.trim().split("=");
    if (k === COOKIE_NAME) encontrados.push(decodeURIComponent(v.join("=")));
  }
  // Cookie duplicada/ambigua → se trata como inválida (sin sesión). Nunca se elige una.
  if (encontrados.length !== 1) return null;
  return encontrados[0];
}
function cookieSesionSp(token) {
  const maxAge = SESION_MIN * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=${maxAge}`;
}
function cookieBorrarSp() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=0`;
}

module.exports = {
  COOKIE_NAME, COOKIE_PATH, SESION_MIN, SESION_VERSION, CAP, MODULO_FRISKU,
  normalizarEmail, tieneCapabilidadFrisku, credVigente, verificarPin, idOpaco,
  evaluarAcceso, firmarSesionSp, verificarSesionSp, leerCookieSp, cookieSesionSp, cookieBorrarSp,
};
