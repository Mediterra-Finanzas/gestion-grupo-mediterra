// api/pin-reset-self.js — Fase E · E-5: RESET self-service ("¿Olvidaste tu PIN?").
//
// Reemplaza App.jsx handleResetPin (~2934-2965), que hoy lee `_tel` y ESCRIBE `_temp` en la fila
// `pins` desde el navegador. Endpoint PÚBLICO (sin auth): por eso NUNCA devuelve el código —se
// ENVÍA por correo server-side—, y responde SIEMPRE con el mismo mensaje neutro (anti-enumeración),
// exista o no la cuenta y coincida o no el celular. Si la cuenta registró `_tel`, se exige que
// coincida (segundo factor) antes de emitir.
//
// Fail-closed: sin secretos => 503; error de lectura/escritura de `pins` => 503 (no se puede
// confirmar). El envío de correo es best-effort (su fallo no cambia la respuesta neutra).
const {
  norm, normalizarCelularServer, genCodigo6, crearTempCredServer,
  realGetRowValue, realSetRowValue, findUsuario, faltanSecretos,
} = require("./_pinsServer.js");
let enviarCorreoReal; try { enviarCorreoReal = require("./send-email.js").enviarCorreo; } catch { enviarCorreoReal = null; }

const MSG_NEUTRAL = "Si los datos corresponden a una cuenta, te enviamos un PIN temporal al correo.";

function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    setPinsValue = (v) => realSetRowValue("pins", v),
    genCodigo = genCodigo6,
    crearTempCred = crearTempCredServer,
    sendEmail = enviarCorreoReal || (async () => ({ success: false })),
    secretsOk = () => !faltanSecretos(),
  } = deps;

  const NEUTRAL = (res) => res.status(200).json({ ok: true, message: MSG_NEUTRAL });

  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (!secretsOk()) return res.status(503).json({ error: "auth_no_configurado" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = norm(body && body.email);
    const telInput = body && body.tel != null ? String(body.tel) : "";
    // Correo inválido: mismo formato neutro (no confirma nada del backend). No lee `pins`.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NEUTRAL(res);

    let mainVal, pinsVal;
    try { mainVal = await getMainValue(); pinsVal = await getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    const u = findUsuario(mainVal, email);
    const pins = pinsVal && typeof pinsVal === "object" ? { ...pinsVal } : {};

    // Cuenta inexistente o desactivada → neutro (sin escribir, sin enviar).
    if (!u || u.desactivado) return NEUTRAL(res);

    // Segundo factor: si hay `_tel` registrado, exigir coincidencia. Sin coincidir → neutro.
    const telReg = pins[`${u.nombre}_tel`];
    if (telReg) {
      const nc = normalizarCelularServer(telInput);
      if (!nc.ok || nc.tel !== telReg) return NEUTRAL(res);
    }

    // Emitir `_temp` y persistir. Un fallo de escritura sí es fail-closed (no se pudo emitir).
    const codigo = genCodigo();
    pins[`${u.nombre}_temp`] = crearTempCred(codigo);
    try { await setPinsValue(pins); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    // Enviar el código por correo (best-effort). NUNCA se devuelve al cliente.
    try {
      await sendEmail({
        to: u.email, modulo: "mediterra", subject: "Código provisorio - Mediterra",
        message: `Tu código provisorio es: ${codigo}\n\nVence en 45 minutos. Al ingresar deberás crear un PIN nuevo de 6 dígitos. Tu PIN anterior quedó inhabilitado.\n\nhttps://gestion-grupo-mediterra.vercel.app`,
      });
    } catch { /* best-effort: la respuesta neutra no cambia */ }

    return NEUTRAL(res);
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
