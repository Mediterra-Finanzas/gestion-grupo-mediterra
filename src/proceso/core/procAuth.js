/* eslint-disable */
// src/proceso/core/procAuth.js — Sesión PROC-scoped (Opción C, Identity Bridge).
// El access_token (emitido por Supabase Auth) y el contexto de empresa viven EN MEMORIA (no
// localStorage), aislados a esta pestaña (cada tab = su propia instancia de módulo → sin contexto
// compartido entre pestañas/usuarios). Flag REACT_APP_PROC_AUTH: si OFF (o sin token) procesoDB
// cae a la anon key (comportamiento actual, sin regresión). NO intercepta /rest/v1 global, NO toca
// login/roster Mediterra → no reintroduce el lockout histórico. Aislado a src/proceso/**.

const PROC_AUTH_ON = (process.env.REACT_APP_PROC_AUTH === "true");
let _token = null;
let _exp = 0;              // epoch segundos
let _empresa = null;       // contexto de tenant AUTORIZADO (request-scoped por pestaña)

export function procAuthActivo() { return PROC_AUTH_ON; }

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
  if (!PROC_AUTH_ON || !_token) return null;
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (_exp && now >= _exp - 15) return null;
  return _token;
}
// Empresa autorizada del contexto actual (para el header X-Proc-Empresa; single o selección multi).
export function getProcEmpresa() { return (PROC_AUTH_ON && getProcToken()) ? _empresa : null; }
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
  if (r.status === 401 || r.status === 403 || r.status === 429) {
    clearProcToken();
    const j = await r.json().catch(() => ({}));
    const err = new Error(j.error || `proc-token HTTP ${r.status}`);
    err.code = j.error; err.status = r.status;
    throw err;
  }
  if (!r.ok) { clearProcToken(); throw new Error(`proc-token HTTP ${r.status}`); }
  const j = await r.json();
  if (j && j.needs_selection) { return { needsSelection: true, memberships: j.memberships || [] }; }
  setProcSession(j);
  return { ok: true, empresa_id: j.empresa_id, iam_usuario_id: j.iam_usuario_id };
}
