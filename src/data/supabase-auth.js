/* eslint-disable */
// src/data/supabase-auth.js
// E1.5 Fase 3 (CAMBIO 1) — Cliente de la Edge Function `osiris-auth`.
//
// Obtiene / guarda / refresca una sesión Supabase Auth del SANDBOX para Osiris relacional.
// Todo este flujo es OPCIONAL y va detrás del feature flag REACT_APP_AUTH_DUAL: quien lo
// gatea es App.jsx (CAMBIO 2). Este módulo es un helper puro y nunca lanza excepción al caller.
//
// REGLAS:
// - Tokens SOLO en sessionStorage. Nunca localStorage, nunca cookies.
// - Nunca se loguea el access_token, el refresh_token ni el PIN (solo status/errores).
// - Toda función degrada con gracia: si algo falla, devuelve null / { ok:false } sin romper el login.
//
// Config (CRA → process.env.REACT_APP_*; NO import.meta.env):
//   REACT_APP_OSIRIS_AUTH_URL        URL de la Edge Function (opcional; si falta se deriva del sandbox)
//   REACT_APP_SUPABASE_URL_SANDBOX   URL del proyecto sandbox (para refresh)
//   REACT_APP_SUPABASE_ANON_KEY_SANDBOX  anon/publishable key del sandbox (apikey de los requests)

const SANDBOX_URL = process.env.REACT_APP_SUPABASE_URL_SANDBOX || "";
const SANDBOX_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY_SANDBOX || "";
const ENDPOINT =
  process.env.REACT_APP_OSIRIS_AUTH_URL ||
  (SANDBOX_URL ? `${SANDBOX_URL}/functions/v1/osiris-auth` : "");

// Keys en sessionStorage
const K_ACCESS = "osiris_access_token";
const K_REFRESH = "osiris_refresh_token";
const K_EXP = "osiris_token_exp"; // epoch (segundos)
const K_ROL = "osiris_rol";

const MARGEN_SEG = 60; // tratar como expirado 60s antes, para no usar un token al límite

// ---- sessionStorage seguro (puede lanzar en modo privado/embebido) ----
function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch {} }

function guardarSesion(s) {
  if (!s || !s.access_token) return;
  ssSet(K_ACCESS, s.access_token);
  if (s.refresh_token) ssSet(K_REFRESH, s.refresh_token);
  if (s.expires_at) ssSet(K_EXP, String(s.expires_at));
}

// Devuelve el access_token si existe y NO está (casi) expirado; sino null.
function tokenVigente() {
  const tok = ssGet(K_ACCESS);
  if (!tok) return null;
  const exp = parseInt(ssGet(K_EXP) || "0", 10);
  const ahora = Math.floor(Date.now() / 1000);
  if (exp && exp - MARGEN_SEG > ahora) return tok;
  return null;
}

// ---------------- API pública ----------------

// Limpia toda la sesión Osiris de sessionStorage.
export function clearOsirisSession() {
  ssDel(K_ACCESS); ssDel(K_REFRESH); ssDel(K_EXP); ssDel(K_ROL);
}

// Devuelve el access_token vigente, o null si no hay / expiró. NO refresca solo.
export function getOsirisAccessToken() {
  return tokenVigente();
}

// Check rápido: ¿hay una sesión usable o recuperable? (token vigente o refresh disponible)
export function hasOsirisSession() {
  return !!tokenVigente() || !!ssGet(K_REFRESH);
}

// Llama a la Edge Function con { email, pin }, guarda los tokens y devuelve { ok, error?, rol_osiris? }.
// Nunca lanza: ante cualquier error devuelve { ok:false, error }.
export async function ensureSupabaseSession(email, pin) {
  if (!ENDPOINT || !SANDBOX_ANON) {
    console.error("[osiris-auth] configuración ausente (endpoint o anon key)");
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SANDBOX_ANON },
      body: JSON.stringify({ email, pin }),
    });
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok || !body || !body.access_token) {
      const error = (body && body.error) || `http_${res.status}`;
      console.error("[osiris-auth] sesión no emitida:", res.status, error);
      return { ok: false, error };
    }
    guardarSesion(body);
    const rol = body.user && body.user.rol_osiris;
    if (rol) ssSet(K_ROL, rol);
    return { ok: true, rol_osiris: rol };
  } catch (e) {
    console.error("[osiris-auth] error de red en ensureSupabaseSession:", e && e.message);
    return { ok: false, error: "network_error" };
  }
}

// Refresca con el refresh_token (sin PIN). Devuelve nuevo access_token o null.
// Si el refresh es rechazado (400/401 = inválido/expirado) limpia la sesión para no
// reintentar en loop. Ante error de RED no limpia (es transitorio) y devuelve null.
export async function refreshOsirisSession() {
  const refresh = ssGet(K_REFRESH);
  if (!refresh || !SANDBOX_URL || !SANDBOX_ANON) return null;
  try {
    const res = await fetch(`${SANDBOX_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SANDBOX_ANON },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok || !body || !body.access_token) {
      console.error("[osiris-auth] refresh rechazado:", res.status);
      clearOsirisSession();
      return null;
    }
    guardarSesion(body);
    return body.access_token;
  } catch (e) {
    console.error("[osiris-auth] error de red en refreshOsirisSession:", e && e.message);
    return null; // transitorio: NO limpiar
  }
}
