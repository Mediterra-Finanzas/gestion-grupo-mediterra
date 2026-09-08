// api/auth-recover.js — AUTH_NATIVE (Opción A). Dispara el correo de recuperación de password.
// Público. ANTI-ENUMERACIÓN DURA: SIEMPRE responde 200 {ok:true} neutro, exista o no el email y
// falle o no GoTrue. No revela nada. El correo (y el link de recovery con su redirect) lo maneja
// GoTrue con la config de `supabase/config.toml` ([auth] site_url + additional_redirect_urls + SMTP).
//
// Por qué un endpoint y no llamar GoTrue /recover directo desde el browser:
//   - Punto único para throttle server-side (evita usarlo como oráculo de enumeración/spam).
//   - Redirect controlado por el server (no confía en el cliente) → mitiga open-redirect.
//   - Auditoría/telemetría sin filtrar si el email existe.
// Fail-closed en config: sin URL/anon configurados igual responde neutro (no expone el estado).
const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();

function realDeps() {
  // SEC-ENV-002 (STG-7b): fail-closed, sin fallback PROD. Si la config no cuadra,
  // SUPA_URL queda "" y el trigger hace no-op neutro (preserva anti-enumeración).
  let SUPA_URL = "";
  try { SUPA_URL = require("./_serverEnv.js").serverSupaUrl(); } catch (_) { SUPA_URL = ""; }
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPA_KEY || "";
  // Redirect FIJO del server (allowlist en config.toml). NUNCA se toma del body del cliente.
  const REDIRECT = process.env.AUTH_RECOVERY_REDIRECT || "";
  return {
    trigger: async (email) => {
      if (!ANON || !SUPA_URL) return; // sin config válida → no-op silencioso (respuesta sigue neutra)
      const body = { email };
      if (REDIRECT) body.redirect_to = REDIRECT;
      await fetch(`${SUPA_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    },
    validEmail: (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120,
  };
}

function makeHandler(deps = {}) {
  const d = { ...realDeps(), ...deps };
  const NEUTRO = (res) => res.status(200).json({ ok: true }); // SIEMPRE lo mismo
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = norm(body && body.email);
    // Formato inválido → igual neutro (no distinguir de "no existe"). Solo evitamos pegarle a GoTrue.
    if (email && d.validEmail(email)) {
      try { await d.trigger(email); } catch { /* neutro */ }
    }
    return NEUTRO(res);
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
