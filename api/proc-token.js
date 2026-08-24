// api/proc-token.js — Identity Bridge PROC (Option C: Supabase Auth asimétrico, SIN hook global).
// PROC-scoped: NO guard global, NO intercepta /rest/v1, NO toca login/roster Mediterra.
//
// Flujo server-side: rate-limit → valida email+PIN (SOLO hash PBKDF2, sin fallback plano) →
// resuelve iam_usuario activo → asegura binding auth.users ↔ iam (auth_user_id) → resuelve
// memberships 0/1/N (autorización = iam_usuario_empresa) → mintea sesión Supabase Auth
// (generate_link+verify) → devuelve access_token real. El tenant NO va en el token: single se
// auto-deriva en RLS; multi viaja como header X-Proc-Empresa re-validado por request. service_role
// nunca sale del server; el browser usa el access_token como Bearer y su apikey anon.
const { supaFetch, faltanSecretos } = require("./_auth.js");
const { verifyPinPBKDF2 } = require("./_iamToken.js");
const { makeAdmin } = require("./_supaAdmin.js");
const { trustedIp, checkAttempt, resetKeys } = require("./_procThrottle.js");

const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();

async function realGetJSON(path) {
  const r = await supaFetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function realRpc(fn, args) {
  // PostgREST exige Content-Type: application/json para parsear el body del RPC (sin él → 415).
  const r = await supaFetch(`rpc/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc/${fn} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function realPatch(path, body) {
  const r = await supaFetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`);
}

// Handler inyectable para tests (deps mockeables). El default usa Supabase real.
function makeHandler(deps) {
  const { getJSON, rpc, patch, admin, verifyPin } = deps;
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    // Fail-closed: sin service_role/sesión o sin secreto de throttle no se emite/limita nada.
    const throttleSecret = process.env.PROC_THROTTLE_SECRET || "";
    if (faltanSecretos() || !throttleSecret) return res.status(503).json({ error: "auth_no_configurado" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = norm(body && body.email);
    const pin = String((body && body.pin) || "");
    const seleccion = String((body && body.empresa_id) || "").trim();  // solo selección multiempresa
    if (!email || !pin) return res.status(400).json({ error: "faltan_credenciales" });

    let thrKeys = [];
    try {
      // 0) rate-limit por CAPAS (identidad + identidad/IP), claves OPACAS HMAC → la DB no ve email/IP.
      //    Cualquier capa bloqueada → 429 uniforme. Rotar/spoofear IP no evade la capa de identidad.
      const thr = await checkAttempt({ rpc }, { secret: throttleSecret, email, ip: trustedIp(req) });
      thrKeys = thr.keys;
      if (!thr.allowed) return res.status(429).json({ error: "demasiados_intentos" });

      // 1) PIN: SOLO credencial hash autoritativa. Sin hash → FAIL CLOSED. Sin fallback plano.
      const usuarios = (await getJSON(`calendario_data?id=eq.main&select=value`))?.[0]?.value?.usuarios || [];
      const u = usuarios.find((x) => x && norm(x.email) === email && !x.desactivado);
      const pinsRow = (await getJSON(`calendario_data?id=eq.pins&select=value`))?.[0]?.value || {};
      const credH = u ? pinsRow[u.nombre + "_h"] : null;
      if (!u || !credH || !verifyPin(pin, credH)) return res.status(401).json({ error: "credenciales" });

      // 2) identidad IAM activa (SoT). service_role bypassa RLS de iam_*.
      const iamU = (await getJSON(
        `iam_usuario?email=eq.${encodeURIComponent(u.email)}&activo=eq.true&select=id,auth_user_id`
      ))?.[0];
      if (!iamU || !iamU.id) return res.status(403).json({ error: "identidad_no_provisionada" });

      // 3) binding estable auth.users ↔ iam_usuario. email solo para bootstrap; luego UUID estable.
      //    Carrera de primer login: PATCH CONDICIONADO (solo si auth_user_id sigue null) + re-fetch
      //    autoritativo. Dos requests concurrentes convergen al mismo au.id (mismo email); el índice
      //    único ux_iam_usuario_auth_user_id impide binding inconsistente. Conflicto → FAIL CLOSED.
      const au = await admin.ensureUser(u.email);
      if (!au || !au.id) return res.status(502).json({ error: "auth_provision_falla" });
      let bound = iamU.auth_user_id || null;
      if (!bound) {
        await patch(`iam_usuario?id=eq.${iamU.id}&auth_user_id=is.null`, { auth_user_id: au.id });
        const re = (await getJSON(`iam_usuario?id=eq.${iamU.id}&select=auth_user_id`))?.[0];
        bound = (re && re.auth_user_id) || null;
      }
      if (bound !== au.id) return res.status(403).json({ error: "binding_conflicto" });   // FAIL CLOSED

      // 4) memberships activas (autorización). 0/1/N.
      const mems = (await getJSON(
        `iam_usuario_empresa?usuario_id=eq.${iamU.id}&activo=eq.true&select=empresa_id`
      )) || [];
      if (mems.length === 0) return res.status(403).json({ error: "sin_membership" });

      let empresa = null;
      if (mems.length === 1) {
        empresa = mems[0].empresa_id;                              // auto-resolución
      } else {
        const set = new Set(mems.map((m) => m.empresa_id));
        if (!seleccion || !set.has(seleccion)) {
          // N sin selección válida → devolver SOLO memberships autorizadas (sin token).
          const ids = [...set].map((x) => `"${x}"`).join(",");
          const emp = (await getJSON(`contab_empresas?id=in.(${ids})&select=id,codigo,nombre`)) || [];
          return res.status(200).json({ needs_selection: true, memberships: emp });
        }
        empresa = seleccion;                                       // selección re-validada
      }

      // 5) sesión Supabase Auth (asimétrica). El token NO lleva empresa_id (tenant = header/RLS).
      const sess = await admin.mintSession(u.email);
      if (!sess || !sess.access_token) return res.status(502).json({ error: "sesion_falla" });

      await resetKeys({ rpc }, thrKeys);   // éxito → limpia ambas capas de throttle
      return res.status(200).json({
        access_token: sess.access_token,
        refresh_token: sess.refresh_token || null,
        expires_at: sess.expires_at || null,
        sub: au.id,                        // = auth.users.id (JWT sub)
        iam_usuario_id: iamU.id,           // actor IAM real (auditoría)
        empresa_id: empresa,               // contexto autorizado (header X-Proc-Empresa en cada request)
      });
    } catch (e) {
      // Log server-side (Vercel Runtime Logs) — sin PIN/token/secreto, solo el error técnico.
      console.error("[proc-token] error_interno:", (e && (e.stack || e.message)) || String(e));
      // DEBUG STAGING (quitar antes de Producción — registrado en zero-loss): detalle no sensible para el gate.
      return res.status(500).json({ error: "error_interno", detail: String((e && e.message) || e).slice(0, 300) });
    }
  };
}

// Wiring real (Supabase). El adapter GoTrue usa service_role solo server-side.
module.exports = makeHandler({
  getJSON: realGetJSON, rpc: realRpc, patch: realPatch,
  admin: makeAdmin(), verifyPin: verifyPinPBKDF2,
});
module.exports.makeHandler = makeHandler;
module.exports.realRpc = realRpc;      // exportados para test de wiring (Content-Type)
module.exports.realPatch = realPatch;
