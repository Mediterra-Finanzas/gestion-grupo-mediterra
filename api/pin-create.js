// api/pin-create.js — Fase E · E-6: ALTA de credencial `_h` para usuarios nuevos.
//
// Reemplaza las escrituras de `pins` en el ALTA de usuarios que hoy hace el navegador:
//   - NuevoUsuarioForm (App.jsx ~1245-1251)
//   - alta en el componente principal (App.jsx ~3239-3244)
//   - CargaMasivaUsuariosForm (App.jsx ~1357-1369, batch)
// El admin se autentica (su `_h` + rol). El servidor hashea el PIN inicial de cada usuario y
// escribe `${nombre}_h` (con fecha + pol:"6dig") vía service_role, preservando el resto de `pins`.
// NUNCA devuelve hashes; solo la lista de nombres creados.
//
// Fail-closed: sin secretos => 503; error de lectura/escritura => 503; admin inválido/sin rol =>
// {ok:false}. Si algún PIN inicial no cumple formato, ese usuario se rechaza (se informa en
// `rechazados`) sin abortar los válidos.
const {
  norm, verifyPinPBKDF2, hashPinPBKDF2, pinNuevoValido, estadoTempServer,
  realGetRowValue, realSetRowValue, findUsuario, esAdmin, faltanSecretos,
} = require("./_pinsServer.js");

function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    setPinsValue = (v) => realSetRowValue("pins", v),
    verifyPin = verifyPinPBKDF2,
    estadoTemp = estadoTempServer,
    hashPin = hashPinPBKDF2,
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
    // Acepta un solo usuario o batch: normaliza a array [{nombre, pin}].
    let lista = [];
    if (Array.isArray(body && body.usuarios)) lista = body.usuarios;
    else if (body && body.nombre != null) lista = [{ nombre: body.nombre, pin: body.pin }];
    const DENY = () => res.status(200).json({ ok: false });
    if (!adminEmail || !adminPin || lista.length === 0) return DENY();

    let mainVal, pinsVal;
    try { mainVal = await getMainValue(); pinsVal = await getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }
    const pins = pinsVal && typeof pinsVal === "object" ? { ...pinsVal } : {};

    // ── Autenticar admin (hash-only + rol + sin `_temp` propio pendiente) ──
    const admin = findUsuario(mainVal, adminEmail);
    if (!admin || admin.desactivado || !esAdmin(admin)) return DENY();
    if (estadoTemp(pins[`${admin.nombre}_temp`], now()).existe) return DENY();
    const rawA = pins[`${admin.nombre}_h`];
    let credA = null;
    try { credA = rawA == null ? null : (typeof rawA === "string" ? JSON.parse(rawA) : rawA); } catch { credA = null; }
    let adminOk = false;
    try { adminOk = credA ? !!verifyPin(adminPin, credA) : false; } catch { adminOk = false; }
    if (!adminOk) return DENY();

    // ── Hashear y escribir cada `_h` ──
    const creados = [], rechazados = [];
    const fecha = new Date(now()).toISOString().slice(0, 10);
    for (const item of lista) {
      const nombre = item && item.nombre != null ? String(item.nombre).trim() : "";
      const pin = item && item.pin != null ? String(item.pin).trim() : "";
      if (!nombre) { continue; }
      const vp = pinNuevoValido(pin);
      if (!vp.ok) { rechazados.push({ nombre, msg: vp.msg }); continue; }
      const cred = hashPin(pin);
      cred.fecha = fecha; cred.pol = "6dig";
      pins[`${nombre}_h`] = JSON.stringify(cred);
      creados.push(nombre);
    }
    if (creados.length === 0) return res.status(200).json({ ok: false, rechazados });

    try { await setPinsValue(pins); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    return res.status(200).json({ ok: true, creados, rechazados });
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
