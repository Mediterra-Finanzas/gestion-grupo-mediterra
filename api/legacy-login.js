// api/legacy-login.js — Fase E (SEC-P0-CONTAINMENT): validación de PIN legacy SERVER-SIDE.
//
// Objetivo: sacar la credencial del cliente. Hoy el browser lee la fila `pins` (anon) para validar
// el PIN en login; eso obliga a mantener `pins` legible por anon (P0). Este endpoint valida el PIN
// con service_role del lado servidor, de modo que el cliente NO necesite leer `pins` → habilita
// RLS-deny anon sobre `pins` sin romper el login.
//
// NO traslada el problema: valida contra el HASH PBKDF2 (`<nombre>_h`), nunca contra plaintext,
// y NUNCA devuelve `_h`/`_temp`/pin ni ningún secreto. Solo responde {ok:true|false}. Es puente:
// el destino es Supabase Auth (password gestionado por el proveedor); `_h` es transición.
//
// Hash-only: sin `_h` válido => DENY (coherente con F0-A1). El flujo de código provisorio `_temp`
// y el cambio/alta de PIN se mueven en endpoints hermanos (E-2..E-n) antes del REVOKE de anon.
const { supaFetch, faltanSecretos } = require("./_auth.js");
const { verifyPinPBKDF2 } = require("./_iamToken.js");

const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();

async function realGetRowValue(id) {
  const r = await supaFetch(`calendario_data?id=eq.${encodeURIComponent(id)}&select=value`);
  if (!r.ok) throw new Error(`calendario_data/${id} → ${r.status}`);
  const t = await r.text();
  const arr = t ? JSON.parse(t) : [];
  return Array.isArray(arr) && arr[0] ? arr[0].value : null;
}

// Handler inyectable para tests (deps mockeables). Default = Supabase real vía service_role.
function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    verifyPin = verifyPinPBKDF2,
    secretsOk = () => !faltanSecretos(),
  } = deps;

  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    // Fail-closed: sin service_role/secretos, no se valida nada.
    if (!secretsOk()) return res.status(503).json({ error: "auth_no_configurado" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = norm(body && body.email);
    const pin = body && body.pin != null ? String(body.pin) : "";
    // Respuesta neutra anti-enumeración: nunca distingue "no existe" de "PIN incorrecto".
    const DENY = () => res.status(200).json({ ok: false });
    if (!email || !pin) return DENY();

    let mainVal, pinsVal;
    try {
      mainVal = await getMainValue();
      pinsVal = await getPinsValue();
    } catch (e) {
      // Falla de lectura server-side = fail-closed, sin filtrar detalle.
      return res.status(503).json({ error: "backend_no_disponible" });
    }

    const usuarios = (mainVal && Array.isArray(mainVal.usuarios)) ? mainVal.usuarios : [];
    const u = usuarios.find((x) => x && norm(x.email) === email);
    if (!u || u.desactivado) return DENY();

    const pins = pinsVal && typeof pinsVal === "object" ? pinsVal : {};
    const raw = pins[`${u.nombre}_h`];
    if (raw == null) return DENY();                       // hash-only: sin _h => DENY (nunca plaintext)
    let cred;
    try { cred = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return DENY(); }

    let ok = false;
    try { ok = !!verifyPin(pin, cred); } catch { ok = false; }
    if (!ok) return DENY();

    // ÉXITO: solo señal booleana + identidad no sensible que el cliente ya tiene en `main`.
    // NUNCA se devuelve _h/_temp/pin.
    return res.status(200).json({ ok: true, nombre: u.nombre });
  };
}

module.exports = makeHandler();          // export default = handler real (Vercel)
module.exports.makeHandler = makeHandler; // para tests con deps inyectadas
