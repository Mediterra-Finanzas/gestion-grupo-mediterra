/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// api/_serverEnv.js — SEC-ENV-002. Resolución FAIL-CLOSED de la config Supabase
// del lado SERVIDOR (api/*). Análogo server-side de src/config/env.js.
//
// Regla dura (CFO): ZERO SILENT ENVIRONMENT FALLBACK.
//   - SUPABASE_URL es OBLIGATORIA. Si falta o tiene mala forma → LANZA (fail-closed).
//   - NUNCA hay fallback a la URL de Producción ni hardcode de proyecto.
//   - Tripwire por entorno cuando APP_ENV está presente:
//       staging | preview  ⇒ ref DEBE ser el de staging (excluye Producción)
//       production          ⇒ ref DEBE ser el de Producción y NUNCA el de staging
//       local | (ausente)   ⇒ sin restricción de ref (igual exige SUPABASE_URL válida)
//
// LAZY a propósito: la validación corre cuando se USA (serverSupaUrl()), no al
// importar el módulo. Así los tests unitarios que inyectan deps y no tocan la red
// no fallan por env ausente, y la red real sí queda fail-closed.
// ═══════════════════════════════════════════════════════════════════════════════

const REF_STAGING = "nlvfjpwiecgrosjnwwik";
const ENVS_VALIDOS = ["local", "staging", "preview", "production"];

function _refDeUrl(url) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(String(url || "").trim());
  return m ? m[1] : "";
}

// Resuelve y valida la config server-side. Devuelve {SUPA_URL, SUPABASE_REF, APP_ENV}
// o LANZA. Acepta un `env` explícito (para tests); por defecto usa process.env.
function resolverServerEnv(env) {
  env = env || (typeof process !== "undefined" ? process.env : {});
  const APP_ENV = String(env.APP_ENV || "").trim();
  const url = String(env.SUPABASE_URL || "").trim();

  if (!url) {
    throw new Error("SEC-ENV-002: falta SUPABASE_URL (server). Sin fallback a Producción (fail-closed).");
  }
  const ref = _refDeUrl(url);
  if (!ref) {
    throw new Error(`SEC-ENV-002: SUPABASE_URL no tiene forma https://<ref>.supabase.co ("${url}").`);
  }

  if (APP_ENV) {
    if (!ENVS_VALIDOS.includes(APP_ENV)) {
      throw new Error(`SEC-ENV-002: APP_ENV inválido ("${APP_ENV}"). Válidos: ${ENVS_VALIDOS.join("|")}.`);
    }
    if (APP_ENV === "staging" || APP_ENV === "preview") {
      if (ref !== REF_STAGING) {
        throw new Error(`SEC-ENV-002: entorno "${APP_ENV}" debe apuntar a staging (${REF_STAGING}), no a "${ref}". Tripwire (excluye Producción).`);
      }
    } else if (APP_ENV === "production") {
      const REF_PROD = "bywovqayuzodbzwsriet"; // literal SOLO en la rama production (no es bundle de cliente; server node)
      if (ref === REF_STAGING) {
        throw new Error(`SEC-ENV-002: entorno "production" NO puede apuntar a staging (${REF_STAGING}). Tripwire.`);
      }
      if (ref !== REF_PROD) {
        throw new Error(`SEC-ENV-002: entorno "production" debe apuntar a Producción, no a "${ref}". Tripwire.`);
      }
    }
  }

  return { SUPA_URL: url, SUPABASE_REF: ref, APP_ENV: APP_ENV || null };
}

// URL base de Supabase resuelta y validada. Lanza si la config no cuadra (fail-closed).
function serverSupaUrl() {
  return resolverServerEnv().SUPA_URL;
}

// Llave service_role server-side (o ""); helper para fail-closed donde se requiera.
function serverServiceKey() {
  return (typeof process !== "undefined" && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || "";
}
function faltaServiceKey() {
  return !serverServiceKey();
}

module.exports = { resolverServerEnv, serverSupaUrl, serverServiceKey, faltaServiceKey, REF_STAGING };
