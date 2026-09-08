// api/auth-password-set.js — AUTH_NATIVE (Opción A). Set/temp password de un usuario en Supabase Auth.
// SERVER-ONLY (service_role). Uso previsto: BOOTSTRAP de staging + relevo administrado (Fase 2/3 del
// diseño de migración) — NO es la vía de producción, donde el usuario fija su propia clave por
// `resetPasswordForEmail` (el admin nunca la ve). Por eso está DOBLEMENTE gateado:
//   1. secretos presentes (service_role) — si no → 503 fail-closed.
//   2. flag explícito AUTH_ADMIN_PWD_SET === "true" — si no → 403 (desactivado por defecto en prod).
//
// Autentica al admin igual que E-4 (adminEmail + adminPin contra el `_h` hash-only), verifica que el
// admin sea admin/esCFO, y que el target esté ACTIVO en main. Asegura auth.users (idempotente) y
// setea un password TEMPORAL generado server-side, devuelto SOLO al admin (para relevo). NUNCA se
// loguea; NUNCA se devuelve el PIN del admin ni ningún `_h`. Respuesta anti-enumeración en fallos.
const {
  norm, realGetRowValue, findUsuario, esAdmin, verifyPinPBKDF2, faltanSecretos,
} = require("./_pinsServer.js");
const crypto = require("crypto");

// Password temporal fuerte (no es un PIN): 16 chars base64url. Cumple políticas GoTrue razonables.
function genTempPassword() {
  return crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 16) + "aZ9";
}

// Wiring real de GoTrue admin (service_role). findAuthUser/ensure vía _supaAdmin; setPassword inline.
function realDeps() {
  const { makeAdmin } = require("./_supaAdmin.js");
  const admin = makeAdmin();
  const SUPA_URL = require("./_serverEnv.js").serverSupaUrl(); // SEC-ENV-002 (STG-7b): fail-closed, sin fallback PROD
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return {
    getMainValue: () => realGetRowValue("main"),
    getPinsValue: () => realGetRowValue("pins"),
    ensureAuthUser: (email) => admin.ensureUser(email),
    setAuthPassword: async (authUserId, password) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${authUserId}`, {
        method: "PUT",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) throw new Error(`admin/set-password ${r.status}`);
      return true;
    },
    verifyPin: verifyPinPBKDF2,
    secretsOk: () => !faltanSecretos(),
    adminEnabled: () => process.env.AUTH_ADMIN_PWD_SET === "true",
    genPwd: genTempPassword,
  };
}

function makeHandler(deps = {}) {
  const d = { ...realDeps(), ...deps };
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (!d.secretsOk()) return res.status(503).json({ error: "auth_no_configurado" });
    if (!d.adminEnabled()) return res.status(403).json({ error: "deshabilitado" }); // gate de prod

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const adminEmail = norm(body && body.adminEmail);
    const adminPin = body && body.adminPin != null ? String(body.adminPin) : "";
    const targetEmail = norm(body && body.targetEmail);
    const DENY = () => res.status(200).json({ ok: false }); // uniforme anti-enumeración
    if (!adminEmail || !adminPin || !targetEmail) return DENY();

    let mainVal, pinsVal;
    try { mainVal = await d.getMainValue(); pinsVal = await d.getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    // Autenticar al admin (hash-only) y exigir rol admin/esCFO.
    const adminU = findUsuario(mainVal, adminEmail);
    if (!adminU || adminU.desactivado || !esAdmin(adminU)) return DENY();
    const pins = pinsVal && typeof pinsVal === "object" ? pinsVal : {};
    const raw = pins[`${adminU.nombre}_h`];
    if (raw == null) return DENY();
    let cred; try { cred = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return DENY(); }
    let okAdmin = false; try { okAdmin = !!d.verifyPin(adminPin, cred); } catch { okAdmin = false; }
    if (!okAdmin) return DENY();

    // Target debe existir y estar activo en la identidad de negocio.
    const targetU = findUsuario(mainVal, targetEmail);
    if (!targetU || targetU.desactivado) return DENY();

    try {
      const au = await d.ensureAuthUser(targetEmail);
      if (!au || !au.id) return res.status(502).json({ error: "auth_provision_falla" });
      const tempPwd = d.genPwd();
      await d.setAuthPassword(au.id, tempPwd);
      // El password temporal se devuelve SOLO al admin autenticado (para relevo/entrega en persona).
      return res.status(200).json({ ok: true, targetEmail, tempPassword: tempPwd });
    } catch (e) {
      console.error("[auth-password-set] error:", (e && e.message) || String(e)); // sin secretos
      return res.status(500).json({ error: "error_interno" });
    }
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
module.exports.genTempPassword = genTempPassword;
