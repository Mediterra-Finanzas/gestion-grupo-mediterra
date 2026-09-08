// api/pin-admin-reset.js — Fase E · E-4: RESET de PIN por ADMIN (emite código provisorio).
//
// Reemplaza App.jsx resetearPinAdmin (~827) y resetPinUsuario (~3269), que hoy ESCRIBEN la fila
// `pins` desde el navegador. El servidor autentica al admin (su `_h` + rol admin/esCFO), emite un
// `_temp` HASHEADO (+exp 45 min) para el usuario objetivo y lo persiste con service_role. El código
// en claro se devuelve SOLO al admin autenticado (mismo contrato que hoy: alert + correo), nunca un
// hash ni el `_temp` almacenado. El correo sigue siendo responsabilidad del cliente (no toca `pins`).
//
// Fail-closed: sin secretos => 503; error de lectura/escritura => 503; admin no válido / sin rol /
// con `_temp` propio pendiente => {ok:false} uniforme (no enumera).
const {
  norm, estadoTempServer, verifyPinPBKDF2, genCodigo6, crearTempCredServer,
  realGetRowValue, realSetRowValue, findUsuario, esAdmin, faltanSecretos,
} = require("./_pinsServer.js");

function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    setPinsValue = (v) => realSetRowValue("pins", v),
    verifyPin = verifyPinPBKDF2,
    estadoTemp = estadoTempServer,
    genCodigo = genCodigo6,
    crearTempCred = crearTempCredServer,
    now = () => Date.now(),
    secretsOk = () => !faltanSecretos(),
  } = deps;

  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (!secretsOk()) return res.status(503).json({ error: "auth_no_configurado" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const adminEmail = norm(body && body.adminEmail);
    const adminPin = body && body.adminPin != null ? String(body.adminPin) : "";
    const targetEmail = norm(body && body.targetEmail);
    const DENY = () => res.status(200).json({ ok: false });
    if (!adminEmail || !adminPin || !targetEmail) return DENY();

    let mainVal, pinsVal;
    try { mainVal = await getMainValue(); pinsVal = await getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    const pins = pinsVal && typeof pinsVal === "object" ? { ...pinsVal } : {};

    // ── Autenticar al ADMIN (hash-only + rol + sin `_temp` propio pendiente) ──
    const admin = findUsuario(mainVal, adminEmail);
    if (!admin || admin.desactivado || !esAdmin(admin)) return DENY();
    if (estadoTemp(pins[`${admin.nombre}_temp`], now()).existe) return DENY(); // debe fijar su propio PIN primero
    const rawA = pins[`${admin.nombre}_h`];
    let credA = null;
    try { credA = rawA == null ? null : (typeof rawA === "string" ? JSON.parse(rawA) : rawA); } catch { credA = null; }
    let adminOk = false;
    try { adminOk = credA ? !!verifyPin(adminPin, credA) : false; } catch { adminOk = false; }
    if (!adminOk) return DENY();

    // ── Emitir `_temp` para el objetivo ──
    const target = findUsuario(mainVal, targetEmail);
    if (!target) return DENY();
    const codigo = genCodigo();
    pins[`${target.nombre}_temp`] = crearTempCred(codigo);

    try { await setPinsValue(pins); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    // Código en claro SOLO al admin autenticado (para relevo/correo). Nunca se devuelve el hash.
    return res.status(200).json({ ok: true, nombre: target.nombre, email: target.email, codigo });
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
