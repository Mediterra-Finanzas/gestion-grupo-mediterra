/* eslint-disable */
// api/_friskuSpRateLimiter.js — Adaptador del rate limiter DISTRIBUIDO de Frisku (S4.2)
// ------------------------------------------------------------------------------
// Implementa el contrato que espera api/frisku-sp.js:  golpe(key, regla) => Promise<{permitido, retry_after_seg}>
// atómico y fail-closed. Persiste en Supabase vía la RPC dedicada frisku_sp_rl_consumir,
// invocada SOLO con SUPABASE_SERVICE_ROLE_KEY (jamás anon/authenticated).
//
// PRIVACIDAD: la `key` (que en el backend puede contener ip/email en claro, SOLO en memoria)
// se convierte en un `bucket` OPACO por HMAC-SHA256 con un secreto exclusivo
// (FRISKU_SP_RATELIMIT_SECRET) ANTES de salir del proceso. Supabase nunca recibe ip/email/PIN.
//
// FAIL-CLOSED: secreto/clave ausente, timeout, red caída, HTTP no-ok o respuesta con forma
// inválida → LANZA excepción (el endpoint responde 503). No hay defaults ni fallback local.
// Ninguna respuesta cruda de Supabase llega al cliente.

const crypto = require("crypto");

// Clave opaca determinista. Mismo (secreto,key) → mismo bucket; distinta key → distinto bucket.
function bucketHmac(secret, key) {
  return crypto.createHmac("sha256", String(secret)).update(String(key)).digest("hex");
}

// Normaliza IPv4/IPv6 antes del HMAC (no se persiste ni se registra la IP original):
// toma la primera de una lista, quita corchetes/puerto y zona IPv6, minúsculas.
function normalizarIp(raw) {
  let s = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!s) return "";
  s = s.split(",")[0].trim();                                  // "a, b" → "a"
  if (s.startsWith("[")) { const m = s.match(/^\[([^\]]+)\]/); if (m) s = m[1]; }  // [ipv6]:puerto → ipv6
  else if ((s.match(/:/g) || []).length === 1) { s = s.split(":")[0]; }           // ipv4:puerto → ipv4
  s = s.split("%")[0];                                         // fe80::1%eth0 → fe80::1
  return s.trim();
}

function conTimeout(promesa, ms) {
  return Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

// deps = { supaUrl, serviceKey, hmacSecret, fetchImpl, timeoutMs }
function crearLimiterSupabase(deps = {}) {
  const { supaUrl, serviceKey, hmacSecret, fetchImpl, timeoutMs = 4000 } = deps;
  return {
    async golpe(key, regla) {
      // Fail-closed si falta configuración (nunca permite sin poder contar).
      if (!supaUrl || !serviceKey || !hmacSecret) throw new Error("rl_no_configurado");
      if (typeof key !== "string" || !key) throw new Error("rl_key_invalida");
      const tipo = (regla && regla.tipo) || "identidad";
      const bucket = bucketHmac(hmacSecret, `${tipo}:${key}`);
      const body = {
        p_bucket: bucket, p_tipo: tipo,
        p_ventana_seg: Math.max(1, Math.ceil((regla && regla.ventanaMs || 0) / 1000)),
        p_max: (regla && regla.max) || 1,
        p_bloqueo_seg: Math.max(0, Math.ceil((regla && regla.bloqueoMs || 0) / 1000)),
      };
      const url = `${supaUrl}/rest/v1/rpc/frisku_sp_rl_consumir`;
      let r;
      try {
        r = await conTimeout(fetchImpl(url, {
          method: "POST",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }), timeoutMs);
      } catch (e) { throw new Error("rl_red"); }               // timeout/red → 503 aguas arriba
      if (!r || !r.ok) throw new Error("rl_upstream");         // 401/403/429/5xx → 503
      let j; try { j = await r.json(); } catch (e) { throw new Error("rl_json"); }
      if (!j || typeof j.permitido !== "boolean") throw new Error("rl_forma"); // respuesta inválida → 503
      return { permitido: j.permitido, retry_after_seg: Number.isFinite(j.retry_after_seg) ? j.retry_after_seg : 0 };
    },
  };
}

module.exports = { bucketHmac, normalizarIp, crearLimiterSupabase };
