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

const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();
const clientIp = (req) =>
  norm((req.headers["x-forwarded-for"] || "").split(",")[0]) || norm(req.headers["x-real-ip"]) || "noip";

async function realGetJSON(path) {
  const r = await supaFetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function realRpc(fn, args) {
  const r = await supaFetch(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc/${fn} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function realPatch(path, body) {
  const r = await supaFetch(path, { method: "PATCH", body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}`);
}

// Handler inyectable para tests (deps mockeables). El default usa Supabase real.
function makeHandler(deps) {
  const { getJSON, rpc, patch, admin, verifyPin } = deps;
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (faltanSecretos()) return res.status(503).json({ error: "auth_no_configurado" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = norm(body && body.email);
    const pin = String((body && body.pin) || "");
    const seleccion = String((body && body.empresa_id) || "").trim();  // solo selección multiempresa
    if (!email || !pin) return res.status(400).json({ error: "faltan_credenciales" });

    const bucket = `${email}|${clientIp(req)}`;
    try {
      // 0) rate-limit atómico (server-authoritative). Respuesta uniforme al agotarse.
      const allowed = await rpc("proc_fn_auth_attempt", { p_key: bucket });
      if (allowed === false) return res.status(429).json({ error: "demasiados_intentos" });

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
      const au = await admin.ensureUser(u.email);
      if (!au || !au.id) return res.status(502).json({ error: "auth_provision_falla" });
      if (!iamU.auth_user_id) {
        await patch(`iam_usuario?id=eq.${iamU.id}`, { auth_user_id: au.id });
      } else if (iamU.auth_user_id !== au.id) {
        return res.status(403).json({ error: "binding_conflicto" });   // FAIL CLOSED
      }

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

      await rpc("proc_fn_auth_reset", { p_key: bucket }).catch(() => {});
      return res.status(200).json({
        access_token: sess.access_token,
        refresh_token: sess.refresh_token || null,
        expires_at: sess.expires_at || null,
        sub: au.id,                        // = auth.users.id (JWT sub)
        iam_usuario_id: iamU.id,           // actor IAM real (auditoría)
        empresa_id: empresa,               // contexto autorizado (header X-Proc-Empresa en cada request)
      });
    } catch (e) {
      return res.status(500).json({ error: "error_interno" });
    }
  };
}

// Wiring real (Supabase). El adapter GoTrue usa service_role solo server-side.
module.exports = makeHandler({
  getJSON: realGetJSON, rpc: realRpc, patch: realPatch,
  admin: makeAdmin(), verifyPin: verifyPinPBKDF2,
});
module.exports.makeHandler = makeHandler;
