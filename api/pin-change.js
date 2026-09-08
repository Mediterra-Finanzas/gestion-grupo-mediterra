// api/pin-change.js — Fase E · E-3: CAMBIO/ALTA de PIN server-side.
//
// Reemplaza App.jsx handleCambiarPin (~2967-3040), que hoy lee y ESCRIBE la fila `pins` desde el
// navegador. El servidor: valida la credencial actual (código `_temp` vigente si existe, si no el
// `_h`), valida el PIN nuevo (mismas reglas de pinNuevoValido), impide repetir las últimas 3
// claves, escribe el nuevo `_h` (+`_hist`, +`_tel` opcional), borra `_temp` y cualquier override
// plano. NUNCA devuelve hash/credencial. Read-modify-write de la fila completa `pins` con
// service_role (merge-duplicates), preservando las demás claves.
//
// Fail-closed: sin secretos => 503; error de lectura/escritura => 503; credencial actual inválida
// => {ok:false, error:"credencial"} (uniforme temp/hash, no enumera cuál). Los errores de formato
// del PIN NUEVO sí se detallan (son datos que eligió el propio usuario, no enumeran cuentas).
const {
  norm, estadoTempServer, verificarTempServer, verifyPinPBKDF2, hashPinPBKDF2,
  pinNuevoValido, normalizarCelularServer, realGetRowValue, realSetRowValue,
  findUsuario, faltanSecretos,
} = require("./_pinsServer.js");

function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    setPinsValue = (v) => realSetRowValue("pins", v),
    verifyPin = verifyPinPBKDF2,
    verificarTemp = verificarTempServer,
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
    const email = norm(body && body.email);
    const actual = body && body.actual != null ? String(body.actual) : "";
    const nuevo = body && body.nuevo != null ? String(body.nuevo) : "";
    const confirm = body && body.confirm != null ? String(body.confirm) : nuevo;
    const telInput = body && body.tel != null ? String(body.tel) : "";

    const DENY_CRED = () => res.status(200).json({ ok: false, error: "credencial" });
    if (!email || !actual || !nuevo) return DENY_CRED();

    let mainVal, pinsVal;
    try { mainVal = await getMainValue(); pinsVal = await getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    const u = findUsuario(mainVal, email);
    if (!u || u.desactivado) return DENY_CRED();
    const pins = pinsVal && typeof pinsVal === "object" ? { ...pinsVal } : {};

    // ── Validar credencial ACTUAL: código provisorio vigente manda; si no, el `_h` ──
    const est = estadoTemp(pins[`${u.nombre}_temp`], now());
    if (est.existe) {
      if (est.expirado) return res.status(200).json({ ok: false, error: "codigo_vencido" });
      let okTemp = false;
      try { okTemp = !!verificarTemp(actual, est); } catch { okTemp = false; }
      if (!okTemp) return DENY_CRED();
    } else {
      const raw = pins[`${u.nombre}_h`];
      let credAct = null;
      try { credAct = raw == null ? null : (typeof raw === "string" ? JSON.parse(raw) : raw); } catch { credAct = null; }
      let okAct = false;
      try { okAct = credAct ? !!verifyPin(actual, credAct) : false; } catch { okAct = false; }
      if (!okAct) return DENY_CRED();  // hash-only: sin `_h` válido => DENY
    }

    // ── Validar PIN NUEVO (formato + confirmación) ──
    const vp = pinNuevoValido(nuevo);
    if (!vp.ok) return res.status(200).json({ ok: false, error: "pin_invalido", msg: vp.msg });
    if (nuevo !== confirm) return res.status(200).json({ ok: false, error: "no_coincide", msg: "Los PINs no coinciden." });

    // Celular opcional (segundo factor de recuperación). Solo valida si vino uno.
    let telNorm = pins[`${u.nombre}_tel`];
    if (telInput.trim()) {
      const nc = normalizarCelularServer(telInput);
      if (!nc.ok) return res.status(200).json({ ok: false, error: "tel_invalido", msg: nc.msg });
      telNorm = nc.tel;
    }

    // ── No repetir las últimas 3 claves ──
    const rawH = pins[`${u.nombre}_h`];
    let credActualObj = null;
    try { credActualObj = rawH == null ? null : (typeof rawH === "string" ? JSON.parse(rawH) : rawH); } catch { credActualObj = null; }
    let hist = [];
    try { hist = JSON.parse(pins[`${u.nombre}_hist`] || "[]"); } catch { hist = []; }
    const recientes = [credActualObj, ...hist].filter(Boolean).slice(0, 3);
    for (const c of recientes) {
      let rep = false;
      try { rep = !!verifyPin(nuevo, c); } catch { rep = false; }
      if (rep) return res.status(200).json({ ok: false, error: "repetido", msg: "No puedes repetir tus últimas 3 claves." });
    }

    // ── Escribir credencial nueva (hash-only), preservando el resto de la fila ──
    const cred = hashPin(nuevo);
    cred.fecha = new Date(now()).toISOString().slice(0, 10);
    cred.pol = "6dig";
    const histGuardar = recientes.map((c) => ({ salt: c.salt, hash: c.hash, iter: c.iter }));
    pins[`${u.nombre}_h`] = JSON.stringify(cred);
    pins[`${u.nombre}_hist`] = JSON.stringify(histGuardar);
    if (telNorm) pins[`${u.nombre}_tel`] = telNorm;
    delete pins[u.nombre];               // borra override plano residual
    delete pins[`${u.nombre}_temp`];     // invalida el código provisorio

    try { await setPinsValue(pins); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    return res.status(200).json({ ok: true, nombre: u.nombre });
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
