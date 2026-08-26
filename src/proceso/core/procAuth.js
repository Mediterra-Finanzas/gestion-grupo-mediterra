/* eslint-disable */
// src/proceso/core/procAuth.js — Sesión PROC-scoped (Opción C, Identity Bridge).
// El access_token (emitido por Supabase Auth) y el contexto de empresa viven EN MEMORIA (no
// localStorage), aislados a esta pestaña (cada tab = su propia instancia de módulo → sin contexto
// compartido entre pestañas/usuarios). Flag REACT_APP_PROC_AUTH: si OFF (o sin token) procesoDB
// cae a la anon key (comportamiento actual, sin regresión). NO intercepta /rest/v1 global, NO toca
// login/roster Mediterra → no reintroduce el lockout histórico. Aislado a src/proceso/**.

let _token = null;
let _exp = 0;              // epoch segundos
let _empresa = null;       // contexto de tenant AUTORIZADO (request-scoped por pestaña)
let _onAuthRequired = null; // callback UI para re-auth cuando falta/expira el token (flag ON)

// Flag leído en cada llamada (en CRA la env var se inlinea → constante en build; lazy = testeable).
export function procAuthActivo() { return process.env.REACT_APP_PROC_AUTH === "true"; }

// Registro del callback de re-auth (lo pone el módulo PROC; idempotente). null lo desregistra.
export function setOnProcAuthRequired(fn) { _onAuthRequired = (typeof fn === "function") ? fn : null; }
// Señala que se requiere re-autenticación PROC (token ausente/expirado con flag ON). Idempotente, sin loop.
export function notifyProcAuthRequired() { if (_onAuthRequired) { try { _onAuthRequired(); } catch {} } }

// Error distinguible para que la UI dispare re-auth controlado (sin loop) en vez de fallback anon.
export class ProcAuthRequiredError extends Error {
  constructor() { super("PROC_AUTH_REQUIRED"); this.name = "ProcAuthRequiredError"; this.code = "PROC_AUTH_REQUIRED"; }
}

// F-2 FAIL-CLOSED: token a usar en Authorization. Con Identity Bridge ACTIVO (flag ON), token
// ausente/expirado/inválido → notifica re-auth y LANZA (NO fallback anon). Con flag OFF devuelve
// null → el caller usa la anon key (baseline/rollback DEV bridge). Es el único punto de decisión.
export function procAuthGuardToken() {
  const t = getProcToken();
  if (procAuthActivo() && !t) { notifyProcAuthRequired(); throw new ProcAuthRequiredError(); }
  return t;   // null sólo con flag OFF → caller usa SUPA_KEY
}

export function setProcToken(token, exp) { _token = token || null; _exp = Number(exp) || 0; }
// Guarda la sesión Option C: access_token + expiración (epoch) + empresa autorizada del login.
export function setProcSession({ access_token, exp, expires_at, empresa_id } = {}) {
  _token = access_token || null;
  _exp = Number(exp || expires_at) || 0;
  _empresa = empresa_id || null;
}
export function clearProcToken() { _token = null; _exp = 0; _empresa = null; }

// Token vigente, o null si flag off / sin token / expirado (margen 15s). Anon fallback en procesoDB.
export function getProcToken(nowSec) {
  if (!procAuthActivo() || !_token) return null;
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (_exp && now >= _exp - 15) return null;
  return _token;
}
// Empresa autorizada del contexto actual (para el header X-Proc-Empresa; single o selección multi).
export function getProcEmpresa() { return (procAuthActivo() && getProcToken()) ? _empresa : null; }
export function setProcEmpresa(empresaId) { _empresa = empresaId || null; }

// Pide sesión al endpoint server-side. Devuelve:
//   { needsSelection:true, memberships:[{id,codigo,nombre}] }  → el usuario debe elegir empresa
//   { ok:true, empresa_id, iam_usuario_id }                    → sesión lista (token en memoria)
// email/pin viajan sólo en este POST (HTTPS). El server valida PIN + membership y pone el empresa_id real.
export async function fetchProcToken({ email, pin, empresaId }) {
  const r = await fetch("/api/proc-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, pin, empresa_id: empresaId || undefined }),
  });
  if (!r.ok) {
    clearProcToken();
    const j = await r.json().catch(() => ({}));
    // Surface el detalle técnico (DEBUG STAGING) en el mensaje → visible en la pantalla de error.
    const msg = j.detail ? `${j.error || "error"} — ${j.detail}` : (j.error || `proc-token HTTP ${r.status}`);
    const err = new Error(msg);
    err.code = j.error; err.status = r.status;
    throw err;
  }
  const j = await r.json();
  if (j && j.needs_selection) { return { needsSelection: true, memberships: j.memberships || [] }; }
  setProcSession(j);
  return { ok: true, empresa_id: j.empresa_id, iam_usuario_id: j.iam_usuario_id };
}
