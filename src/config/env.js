/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// src/config/env.js — ÚNICA fuente de configuración del cliente Supabase.
//
// SEC-ENV-001. Reemplaza las constantes SUPA_URL/SUPA_KEY hardcodeadas que estaban
// dispersas en App.jsx y en cada módulo. Ahora TODO el cliente lee de acá.
//
// Fuente de los valores: variables REACT_APP_* que Create React App INLINE-a en
// build (CRA/DefinePlugin reemplaza cada referencia DIRECTA process.env.REACT_APP_X
// por un literal en tiempo de compilar — por eso acá se leen de forma directa, no
// con lookups dinámicos process.env[x], que CRA NO reemplaza).
//
//   REACT_APP_APP_ENV            local | staging | preview | production
//   REACT_APP_SUPABASE_URL       https://<ref>.supabase.co
//   REACT_APP_SUPABASE_ANON_KEY  JWT anon (role=anon) del proyecto correspondiente
//
// FAIL-CLOSED (a propósito): este módulo LANZA en tiempo de carga si la config está
// ausente o inconsistente. No hay fallback a ninguna URL/llave productiva. Un build
// mal configurado NO arranca en vez de apuntar silenciosamente a Producción.
//
// TRIPWIRE de aislamiento de entornos:
//   staging/preview ⇒ ref DEBE ser el de staging y NUNCA el de Producción
//   production      ⇒ ref DEBE ser el de Producción y NUNCA el de staging
//   local           ⇒ sin restricción de ref (dev elige), pero igual exige anon + sin service_role
//
// NOTA (bundle-scan): el ref productivo NO se declara como literal top-level. Vive
// SOLO dentro de la rama `process.env.REACT_APP_APP_ENV === "production"`, que
// CRA/Terser eliminan por dead-code en un build de staging/preview (donde esa
// referencia se inline-a a "staging"), dejando el string productivo FUERA del
// bundle de no-producción. La rama de staging valida en positivo (=== REF_STAGING),
// lo que ya excluye Producción sin nombrarla.
// ═══════════════════════════════════════════════════════════════════════════════

const REF_STAGING = "nlvfjpwiecgrosjnwwik";
const ENVS_VALIDOS = ["local", "staging", "preview", "production"];

// ── Lectura de env con referencias ESTÁTICAS (para el inline de CRA) ──────────
function _leerAppEnv()   { try { return String(process.env.REACT_APP_APP_ENV || ""); }           catch (_) { return ""; } }
function _leerSupaUrl()  { try { return String(process.env.REACT_APP_SUPABASE_URL || ""); }        catch (_) { return ""; } }
function _leerAnonKey()  { try { return String(process.env.REACT_APP_SUPABASE_ANON_KEY || ""); }   catch (_) { return ""; } }

// ── Decodificador base64url (browser: atob; node: Buffer) ─────────────────────
function _b64urlDecode(seg) {
  const s = String(seg || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s + pad;
  if (typeof atob === "function") return atob(b64);
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("binary");
  throw new Error("env: no hay decodificador base64 disponible");
}

// Payload JSON del JWT (segmento del medio) o null si no se puede leer.
function _jwtPayload(jwt) {
  const parts = String(jwt || "").split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(_b64urlDecode(parts[1])); } catch (_) { return null; }
}

// Ref desde el host de la URL Supabase (https://<ref>.supabase.co).
function _refDeUrl(url) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(String(url || "").trim());
  return m ? m[1] : "";
}

// Detección de service_role en el entorno del cliente. El cliente JAMÁS debe
// embeber una service_role key. Escanea cualquier REACT_APP_*SERVICE_ROLE* con
// valor no vacío. (En browser `typeof process` es "undefined" → se omite; corre
// de verdad en node/tooling, que es donde importa cazarla antes de compilar.)
function _hayServiceRoleEnEntorno() {
  try {
    if (typeof process === "undefined" || !process.env) return false;
    return Object.keys(process.env).some(
      (k) => /REACT_APP_.*SERVICE_ROLE/i.test(k) && String(process.env[k] || "").length > 0
    );
  } catch (_) { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validación (corre en cada carga del módulo). Devuelve config o lanza.
// ═══════════════════════════════════════════════════════════════════════════════
function _resolver() {
  const APP_ENV = _leerAppEnv().trim();
  const url     = _leerSupaUrl().trim();
  const anon    = _leerAnonKey().trim();

  // 1) APP_ENV presente y exactamente uno de los válidos (minúscula).
  if (!APP_ENV) {
    throw new Error("SEC-ENV-001: falta REACT_APP_APP_ENV (local|staging|preview|production). Fail-closed.");
  }
  if (!ENVS_VALIDOS.includes(APP_ENV)) {
    throw new Error(`SEC-ENV-001: REACT_APP_APP_ENV inválido ("${APP_ENV}"). Válidos: ${ENVS_VALIDOS.join("|")}.`);
  }

  // 2) URL y anon key presentes (sin fallback a Producción).
  if (!url)  throw new Error("SEC-ENV-001: falta REACT_APP_SUPABASE_URL. Sin fallback a Producción (fail-closed).");
  if (!anon) throw new Error("SEC-ENV-001: falta REACT_APP_SUPABASE_ANON_KEY. Sin fallback a Producción (fail-closed).");

  // 3) Ningún service_role en el entorno del cliente.
  if (_hayServiceRoleEnEntorno()) {
    throw new Error("SEC-ENV-001: se detectó una variable REACT_APP_*SERVICE_ROLE* en el entorno del cliente. El cliente NUNCA lleva service_role.");
  }

  // 4) La anon key debe decodificar a role=anon (nunca service_role).
  const payload = _jwtPayload(anon);
  if (!payload) {
    throw new Error("SEC-ENV-001: REACT_APP_SUPABASE_ANON_KEY no es un JWT decodificable.");
  }
  if (payload.role === "service_role") {
    throw new Error("SEC-ENV-001: REACT_APP_SUPABASE_ANON_KEY es una service_role key. Prohibido en el cliente.");
  }
  if (payload.role !== "anon") {
    throw new Error(`SEC-ENV-001: REACT_APP_SUPABASE_ANON_KEY tiene role="${payload.role}", se esperaba "anon".`);
  }

  // 5) Ref desde la URL y (defensa en profundidad) coherente con el claim ref del JWT.
  const refUrl = _refDeUrl(url);
  if (!refUrl) {
    throw new Error(`SEC-ENV-001: REACT_APP_SUPABASE_URL no tiene forma https://<ref>.supabase.co ("${url}").`);
  }
  if (payload.ref && payload.ref !== refUrl) {
    throw new Error(`SEC-ENV-001: la anon key es del proyecto "${payload.ref}" pero la URL apunta a "${refUrl}". Mismatch.`);
  }
  const SUPABASE_REF = refUrl;

  // 6) TRIPWIRE de aislamiento por entorno.
  //    Las condiciones usan la referencia DIRECTA process.env.REACT_APP_APP_ENV
  //    (además del APP_ENV normalizado) para que Terser haga dead-code de la rama
  //    de production —y de su literal de ref productivo— en builds de staging.
  if (process.env.REACT_APP_APP_ENV === "staging" || process.env.REACT_APP_APP_ENV === "preview") {
    if (SUPABASE_REF !== REF_STAGING) {
      throw new Error(`SEC-ENV-001: entorno "${APP_ENV}" debe apuntar a staging (${REF_STAGING}), no a "${SUPABASE_REF}". Tripwire (excluye Producción).`);
    }
  } else if (process.env.REACT_APP_APP_ENV === "production") {
    const REF_PROD = "bywovqayuzodbzwsriet"; // literal SOLO en esta rama (DCE en no-prod)
    if (SUPABASE_REF === REF_STAGING) {
      throw new Error(`SEC-ENV-001: entorno "production" NO puede apuntar a staging (${REF_STAGING}). Tripwire.`);
    }
    if (SUPABASE_REF !== REF_PROD) {
      throw new Error(`SEC-ENV-001: entorno "production" debe apuntar a Producción, no a "${SUPABASE_REF}". Tripwire.`);
    }
  }
  // local: sin restricción de ref (ya validamos anon + sin service_role).

  return { SUPA_URL: url, SUPA_KEY: anon, APP_ENV, SUPABASE_REF };
}

const _cfg = _resolver();

export const SUPA_URL     = _cfg.SUPA_URL;
export const SUPA_KEY     = _cfg.SUPA_KEY;
export const APP_ENV      = _cfg.APP_ENV;
export const SUPABASE_REF = _cfg.SUPABASE_REF;

// Export del resolvedor para tests (re-evaluar con env inyectada).
export const __resolverParaTests = _resolver;

export default { SUPA_URL, SUPA_KEY, APP_ENV, SUPABASE_REF };
