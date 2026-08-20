/* eslint-disable */
// src/proceso/core/procAuth.js — Token PROC-scoped (Opción C, Identity Bridge).
// El token authenticated se guarda EN MEMORIA (no localStorage) y sólo lo usa la capa proc_*.
// Flag REACT_APP_PROC_AUTH: si está OFF (o no hay token), procesoDB cae a la anon key
// (comportamiento actual, sin regresión). NO intercepta /rest/v1 global, NO toca login/roster
// ni otros módulos → no reintroduce el lockout histórico. Aislado a src/proceso/**.

const PROC_AUTH_ON = (process.env.REACT_APP_PROC_AUTH === "true");
let _token = null;
let _exp = 0; // epoch segundos

export function procAuthActivo() { return PROC_AUTH_ON; }

export function setProcToken(token, exp) { _token = token || null; _exp = Number(exp) || 0; }
export function clearProcToken() { _token = null; _exp = 0; }

// Devuelve el token vigente, o null si el flag está off / no hay token / expiró (margen 15s).
export function getProcToken(nowSec) {
  if (!PROC_AUTH_ON || !_token) return null;
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (_exp && now >= _exp - 15) return null;
  return _token;
}

// Pide un token al endpoint server-side (valida PIN + membresía; el server pone el empresa_id real).
// email/pin viajan sólo en este POST (HTTPS); el token vuelve y queda en memoria.
export async function fetchProcToken({ email, pin, empresaId }) {
  const r = await fetch("/api/proc-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, pin, empresa_id: empresaId }),
  });
  if (!r.ok) { clearProcToken(); throw new Error(`proc-token HTTP ${r.status}`); }
  const j = await r.json();
  setProcToken(j.token, j.exp);
  return j;
}
