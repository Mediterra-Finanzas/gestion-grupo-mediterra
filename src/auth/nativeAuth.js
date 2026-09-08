/* eslint-disable */
// src/auth/nativeAuth.js — Native Supabase Auth (GoTrue) browser helper. AUTH_NATIVE (Opción A).
// ------------------------------------------------------------------------------------------------
// Frente de credencial nativo: email + password → GoTrue `signInWithPassword` con la ANON key.
// Devuelve un access_token JWT `authenticated` (mismo `sub` = auth.users.id que hoy mintea
// api/proc-token.js), listo para consumirse igual que la sesión del bridge (setProcSession).
//
// DISEÑO (por qué así):
//   - SIN dependencia npm nueva: raw fetch a /auth/v1/* (el repo no usa @supabase/supabase-js;
//     regla 8 de CLAUDE.md). Mismo patrón que api/_supaAdmin.js pero client-side con anon key.
//   - NO importa friskuHelpers en el top (para poder testear con `node --test` sin JSX/env). La
//     config (url/anonKey/fetch/now/store) se inyecta; el default lee de process.env con el MISMO
//     fallback público que friskuHelpers (la anon key ya viaja en el bundle → no es secreto).
//   - Sesión EN MEMORIA por defecto (aislada por pestaña, como procAuth). `store` opcional permite
//     persistir el refresh_token (sessionStorage/localStorage) — documentado, OFF por defecto.
//   - NO intercepta /rest/v1 global, NO toca el login/roster Mediterra. Aislado a src/auth/**.
//   - Fail-closed: cualquier no-2xx → lanza AuthError con code normalizado; nunca devuelve sesión
//     parcial. Anti-enumeración: recover() SIEMPRE resuelve neutro (no revela si el email existe).
//
// El SECRET/service_role NUNCA aparece aquí. Solo la anon key (pública) y las credenciales que el
// usuario digita en ese POST (HTTPS). Password jamás se persiste ni loguea.

// ── Config resolver ────────────────────────────────────────────────────────────────────────────
const DEFAULT_URL =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_SUPA_URL) ||
  ""; // SEC-ENV-001 (STG-7a): sin literal PROD ni fallback silencioso; se inyecta staging vía configureNativeAuth() (friskuHelpers=env.js). Fail-closed: sin URL, nativeAuth no llama a nadie.
const DEFAULT_ANON =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_SUPA_KEY) ||
  ""; // el default real vive en friskuHelpers.SUPA_KEY; se inyecta vía configure() en el browser.

let _cfg = {
  url: DEFAULT_URL,
  anonKey: DEFAULT_ANON,
  fetchImpl: (typeof fetch !== "undefined" ? fetch : null),
  now: () => Math.floor(Date.now() / 1000),
  store: null, // { get(k), set(k,v), del(k) } opcional para persistir refresh_token
};

// Inyección de config desde el browser (App/PROC pasan SUPA_URL/SUPA_KEY reales de friskuHelpers).
export function configureNativeAuth(patch = {}) { _cfg = { ..._cfg, ...patch }; }
function cfg(over) { return over ? { ..._cfg, ...over } : _cfg; }

// Flag: OFF (o sin config) ⇒ nadie usa este path (baseline PIN/bridge intacto). Lazy = testeable.
export function authNativeActivo() {
  return (typeof process !== "undefined" && process.env && process.env.REACT_APP_AUTH_NATIVE === "true");
}

// ── Estado de sesión (en memoria, por pestaña) ───────────────────────────────────────────────────
let _sess = null; // { access_token, refresh_token, exp (epoch s), sub, user }

export class AuthError extends Error {
  constructor(code, status, message) {
    super(message || code || "auth_error");
    this.name = "AuthError";
    this.code = code || "auth_error";
    this.status = status || 0;
  }
}

function normError(status, body) {
  // GoTrue devuelve {error, error_description} o {code, msg}. Normaliza a códigos estables.
  const raw = (body && (body.error_code || body.error || body.code || body.msg || body.error_description)) || "";
  const s = String(raw).toLowerCase();
  if (status === 400 && /invalid login|invalid_grant|invalid credentials/.test(s)) return "credenciales";
  if (status === 400 && /email not confirmed/.test(s)) return "email_no_confirmado";
  if (status === 422 && /weak|password/.test(s)) return "password_debil";
  if (status === 429 || /rate limit|too many/.test(s)) return "demasiados_intentos";
  if (status === 401) return "no_autorizado";
  return s ? s.slice(0, 40) : `http_${status}`;
}

function normalizeSession(j, nowSec) {
  if (!j || !j.access_token) throw new AuthError("sesion_invalida", 0, "respuesta sin access_token");
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  // expires_at (epoch) es autoritativo; si falta, derivar de expires_in.
  const exp = Number(j.expires_at) || (j.expires_in ? now + Number(j.expires_in) : 0);
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token || null,
    exp,
    sub: (j.user && j.user.id) || null,
    user: j.user || null,
  };
}

async function post(path, body, headers, c) {
  const conf = cfg(c);
  if (!conf.fetchImpl) throw new AuthError("sin_fetch", 0, "fetch no disponible");
  if (!conf.anonKey) throw new AuthError("sin_config", 0, "anon key no configurada (configureNativeAuth)");
  const r = await conf.fetchImpl(`${conf.url}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: conf.anonKey, "Content-Type": "application/json", ...(headers || {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text().catch(() => "");
  let j = {};
  if (text) { try { j = JSON.parse(text); } catch { j = {}; } }
  if (!r.ok) throw new AuthError(normError(r.status, j), r.status);
  return j;
}

// ── API pública ───────────────────────────────────────────────────────────────────────────────

// email + password → sesión GoTrue. NO persiste el password. Guarda la sesión en memoria y,
// si hay `store`, el refresh_token (documentado: trade-off XSS vs UX de recarga).
export async function signInWithPassword({ email, password }, c) {
  const conf = cfg(c);
  const j = await post("/token?grant_type=password", {
    email: String(email || "").trim().toLowerCase(),
    password: String(password || ""),
  }, null, conf);
  _sess = normalizeSession(j, conf.now());
  if (conf.store && _sess.refresh_token) { try { conf.store.set("rt", _sess.refresh_token); } catch {} }
  return { ..._sess };
}

// Renueva la sesión con el refresh_token (rotativo: GoTrue devuelve uno nuevo). Fail-closed.
export async function refreshSession(c) {
  const conf = cfg(c);
  let rt = (_sess && _sess.refresh_token) || null;
  if (!rt && conf.store) { try { rt = conf.store.get("rt"); } catch {} }
  if (!rt) throw new AuthError("sin_refresh", 0, "no hay refresh_token");
  const j = await post("/token?grant_type=refresh_token", { refresh_token: rt }, null, conf);
  _sess = normalizeSession(j, conf.now());
  if (conf.store && _sess.refresh_token) { try { conf.store.set("rt", _sess.refresh_token); } catch {} }
  return { ..._sess };
}

// Devuelve un access_token válido, refrescando si está por vencer (margen 60s). null si no hay sesión
// y no se pudo refrescar. Lanza solo si el refresh falla de forma dura (para que el caller re-autentique).
export async function ensureFreshToken(c) {
  const conf = cfg(c);
  const t = getAccessToken(conf.now(), 60);
  if (t) return t;
  // token ausente/por vencer → intentar refresh si hay refresh_token
  const hasRt = (_sess && _sess.refresh_token) || (conf.store && (() => { try { return conf.store.get("rt"); } catch { return null; } })());
  if (!hasRt) return null;
  await refreshSession(conf);
  return getAccessToken(conf.now(), 60);
}

// Cierra la sesión: revoca en GoTrue (best-effort) y limpia memoria/store. `scope` global|local.
export async function signOut(c) {
  const conf = cfg(c);
  const at = _sess && _sess.access_token;
  try {
    if (at) {
      await post("/logout?scope=global", null, { Authorization: `Bearer ${at}` }, conf);
    }
  } catch { /* best-effort: la limpieza local ocurre igual */ }
  clearSession(conf);
}

// Dispara el correo de recuperación (reset password). ANTI-ENUMERACIÓN: SIEMPRE resuelve, nunca
// revela si el email existe (GoTrue 200 uniforme; cualquier error se traga y también resuelve).
export async function recoverPassword(email, c) {
  const conf = cfg(c);
  try {
    await post("/recover", { email: String(email || "").trim().toLowerCase() }, null, conf);
  } catch { /* neutro */ }
  return { ok: true };
}

// Cambia el password del usuario autenticado (requiere sesión vigente o token de recovery).
// `accessToken` opcional: para el callback de recovery (token del link), si no usa la sesión actual.
export async function updatePassword(newPassword, accessToken, c) {
  const conf = cfg(c);
  const at = accessToken || (_sess && _sess.access_token);
  if (!at) throw new AuthError("sin_sesion", 0, "no hay sesión para cambiar password");
  if (!conf.fetchImpl) throw new AuthError("sin_fetch", 0, "fetch no disponible");
  const r = await conf.fetchImpl(`${conf.url}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: conf.anonKey, Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: String(newPassword || "") }),
  });
  const text = await r.text().catch(() => "");
  let j = {}; if (text) { try { j = JSON.parse(text); } catch {} }
  if (!r.ok) throw new AuthError(normError(r.status, j), r.status);
  return { ok: true, user: j };
}

// ── Acceso a la sesión en memoria ────────────────────────────────────────────────────────────────
export function setSession(sess) { _sess = sess ? { ...sess } : null; }
export function getSession() { return _sess ? { ..._sess } : null; }
export function clearSession(c) {
  _sess = null;
  const conf = cfg(c);
  if (conf.store) { try { conf.store.del("rt"); } catch {} }
}
// access_token vigente o null (margen `marginSec` antes del exp, default 15s).
export function getAccessToken(nowSec, marginSec = 15) {
  if (!_sess || !_sess.access_token) return null;
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (_sess.exp && now >= _sess.exp - marginSec) return null;
  return _sess.access_token;
}
export function getSub() { return _sess ? _sess.sub : null; }
