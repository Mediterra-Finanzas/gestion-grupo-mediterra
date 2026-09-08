// api/pin-status.js — Fase E · E-7: ESTADO no sensible de credenciales (panel de permisos).
//
// Reemplaza la lectura directa de `pins` que hace PanelPermisos en App.jsx (~996-997) para pintar,
// por usuario: si tiene `_h` (tieneHash) y el estado del `_temp` (vigente/expirado/none). El admin
// se autentica (su `_h` + rol). NUNCA devuelve hashes, códigos, salts ni `_temp`: solo booleanos y
// un enum de estado derivados server-side.
//
// Fail-closed: sin secretos => 503; error de lectura => 503; admin inválido/sin rol => {ok:false}.
const {
  norm, verifyPinPBKDF2, estadoTempServer,
  realGetRowValue, findUsuario, esAdmin, faltanSecretos,
} = require("./_pinsServer.js");

function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    verifyPin = verifyPinPBKDF2,
    estadoTemp = estadoTempServer,
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
    const DENY = () => res.status(200).json({ ok: false });
    if (!adminEmail || !adminPin) return DENY();

    let mainVal, pinsVal;
    try { mainVal = await getMainValue(); pinsVal = await getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }
    const pins = pinsVal && typeof pinsVal === "object" ? pinsVal : {};

    const admin = findUsuario(mainVal, adminEmail);
    if (!admin || admin.desactivado || !esAdmin(admin)) return DENY();
    const rawA = pins[`${admin.nombre}_h`];
    let credA = null;
    try { credA = rawA == null ? null : (typeof rawA === "string" ? JSON.parse(rawA) : rawA); } catch { credA = null; }
    let adminOk = false;
    try { adminOk = credA ? !!verifyPin(adminPin, credA) : false; } catch { adminOk = false; }
    if (!adminOk) return DENY();

    const usuarios = mainVal && Array.isArray(mainVal.usuarios) ? mainVal.usuarios : [];
    const out = usuarios.map((u) => {
      const nombre = u && u.nombre != null ? String(u.nombre) : "";
      const est = estadoTemp(pins[`${nombre}_temp`], now());
      const temp = !est.existe ? "none" : (est.expirado ? "expirado" : "vigente");
      return { nombre, tieneHash: !!pins[`${nombre}_h`], temp, tieneTel: !!pins[`${nombre}_tel`] };
    });

    return res.status(200).json({ ok: true, usuarios: out });
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
