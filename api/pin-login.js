// api/pin-login.js — Fase E · E-2: DECISIÓN DE LOGIN completa server-side.
//
// Supera a legacy-login.js (E-1, que solo valida `_h`): resuelve la máquina de estados que hoy
// vive en App.jsx handleLogin (líneas ~2855-2931) leyendo la fila `pins` con anon. Al mover TODA
// esa lógica al servidor, el cliente ya no necesita `dbLoadPins()` en el login → habilita el
// RLS-deny anon SELECT sobre `pins`.
//
// Cubre, en este orden (idéntico a App.jsx):
//   1. usuario desconocido / desactivado           → {ok:false}  (anti-enumeración)
//   2. `_temp` (código provisorio) presente:
//        - código correcto y vigente               → {ok:true, nombre, pinTemporal:true}
//        - código correcto pero expirado           → {ok:false, pinTemporalVencido:true}
//        - código incorrecto / PIN viejo            → {ok:false}  (uniforme)
//   3. sin `_temp`: valida el PIN contra `_h` (PBKDF2 hash-only):
//        - inválido                                 → {ok:false}
//        - válido + debe migrar (pol!=6dig o venc.) → {ok:true, nombre, needsMigration:true}
//        - válido                                   → {ok:true, nombre}
//
// Invariantes (= legacy-login.js): POST-only; hash-only; NUNCA devuelve `_h`/`_temp`/hash/salt/pin;
// fail-closed 503 sin secretos o si falla la lectura; los flags `pinTemporalVencido`/`needsNewPin`
// solo se exponen tras acertar el código/PIN (no enumeran).
const {
  norm, estadoTempServer, verificarTempServer, verifyPinPBKDF2,
  realGetRowValue, findUsuario, faltanSecretos,
} = require("./_pinsServer.js");

function makeHandler(deps = {}) {
  const {
    getMainValue = () => realGetRowValue("main"),
    getPinsValue = () => realGetRowValue("pins"),
    verifyPin = verifyPinPBKDF2,
    verificarTemp = verificarTempServer,
    estadoTemp = estadoTempServer,
    now = () => Date.now(),
    secretsOk = () => !faltanSecretos(),
  } = deps;

  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (!secretsOk()) return res.status(503).json({ error: "auth_no_configurado" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const email = norm(body && body.email);
    const pin = body && body.pin != null ? String(body.pin) : "";
    const DENY = () => res.status(200).json({ ok: false });
    if (!email || !pin) return DENY();

    let mainVal, pinsVal;
    try { mainVal = await getMainValue(); pinsVal = await getPinsValue(); }
    catch { return res.status(503).json({ error: "backend_no_disponible" }); }

    const u = findUsuario(mainVal, email);
    if (!u || u.desactivado) return DENY();
    const pins = pinsVal && typeof pinsVal === "object" ? pinsVal : {};

    // ── (2) Código provisorio: mientras exista, INHABILITA el PIN antiguo ──
    const est = estadoTemp(pins[`${u.nombre}_temp`], now());
    if (est.existe) {
      let match = false;
      try { match = !!verificarTemp(pin, est); } catch { match = false; }
      if (!match) return DENY();                       // PIN viejo o código incorrecto → uniforme
      if (est.expirado) return res.status(200).json({ ok: false, pinTemporalVencido: true });
      return res.status(200).json({ ok: true, nombre: u.nombre, pinTemporal: true });
    }

    // ── (3) Validación normal contra `_h` (hash-only; sin `_h` => DENY) ──
    const raw = pins[`${u.nombre}_h`];
    if (raw == null) return DENY();
    let cred;
    try { cred = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return DENY(); }
    let ok = false;
    try { ok = !!verifyPin(pin, cred); } catch { ok = false; }
    if (!ok) return DENY();

    // Política de PIN (igual que App.jsx): fuerza cambio si no cumple `pol:6dig` o venció (60 días).
    let pinVencido = false;
    try { if (cred && cred.fecha) pinVencido = (now() - new Date(cred.fecha).getTime()) / 86400000 > 60; } catch {}
    const debeMigrar = !(cred && cred.pol === "6dig") || pinVencido;
    if (debeMigrar) return res.status(200).json({ ok: true, nombre: u.nombre, needsMigration: true });
    return res.status(200).json({ ok: true, nombre: u.nombre });
  };
}

module.exports = makeHandler();
module.exports.makeHandler = makeHandler;
