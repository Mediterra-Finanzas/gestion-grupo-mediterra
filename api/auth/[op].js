/* eslint-disable */
// api/auth/[op].js — Autenticación de la app en el SERVIDOR (rama seguridad-main-pins)
// ------------------------------------------------------------------------------
// Una sola función de Vercel; la operación llega en req.query.op:
//   POST login           {email,pin}            → 200 {ok,debeCambiarPin:false,usuario} + cookie "completa"
//                                                 200 {ok,debeCambiarPin:true,motivo,nombre} + cookie "cambio_pin"
//                                                 401 credenciales · 403 desactivado · 429 bloqueado
//   POST cambiar-pin     {pinActual?,pinNuevo,tel?} (cookie de cualquier scope) → 200 {ok,usuario} + cookie completa
//   POST recuperar       {email,tel?}           → SIEMPRE 200 {ok:true} (código por correo, _temp hasheado 45 min)
//   GET  sesion                                  → 200 {usuario,scope,admin} | 401
//   POST logout          {revocar?}             → 200 {ok,revocado} (borra la cookie). Con sesión
//                                                 "completa" vigente y revocar≠false, sube la época
//                                                 de la persona: TODAS sus sesiones (y copias de
//                                                 cookies) quedan inválidas en toda instancia.
//                                                 503 {revocado:false} si no se pudo confirmar.
//   POST admin-reset-pin {nombre}               → solo seg_administradores → 200 {ok,codigo}
//   POST verificar       {email,pin} + header x-mediterra-secreto (servidor a servidor, osiris-auth)
//                                                 → 200 {ok,email,nombre,debeCambiarPin} | 401
// Reglas: api/_reglasLogin.js (única implementación). E/S: api/_segServidor.js.
// No registra PIN, códigos, cookies ni cuerpos.

const crypto = require("crypto");
const A = require("../_auth");
const R = require("../_reglasLogin");
const S = require("../_segServidor");
const I = require("../_intentos");

const METODO = { login: "POST", "cambiar-pin": "POST", recuperar: "POST", sesion: "GET", logout: "POST", "admin-reset-pin": "POST", verificar: "POST" };

function cookieDe(usuario, scope, pins) {
  if (scope === "completa") return S.cookieCompleta(usuario, pins);
  const fp = R.huellaCredencial(pins, usuario.nombre);
  return A.cookieSesion(A.crearToken({ email: usuario.email, nombre: usuario.nombre, scope, fp }), scope);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Errores de login que se devuelven tal cual (el resto → "credenciales").
const ESTADO_LOGIN = { desactivado: 403, debe_recuperar: 401, verificacion_requerida: 403 };

// Núcleo común de login (app y osiris-auth): reserva el intento en los contadores
// combinados (api/_intentos.js) ANTES de evaluar, evalúa y libera si es correcto.
// → { fallo:{status,error,retry} } | { r, pins, usuario, em, dispositivo, epocaD }
async function nucleoLogin({ email, pin, ip, canal, req }) {
  let usuarios, pins, corteMs;
  try { ({ usuarios } = await S.leerUsuarios()); pins = await S.leerPins(); corteMs = R.corteCredenciales(); }
  catch (e) { return { fallo: { status: 503, error: "no_disponible" } }; }
  const em = email.trim().toLowerCase();
  const u = R.buscarUsuario(usuarios, em);
  const epocaD = u ? R.epocaDispositivo(pins, u.nombre) : 0;
  const dispositivo = req && u ? I.dispositivoReconocido(req, em, epocaD) : null;
  const ahora = Date.now();
  const est = u ? R.estadoTemp(pins[`${u.nombre}_temp`], ahora, pins[`${u.nombre}_temp_exp`], corteMs) : { existe: false };
  const hayCodigo = !!(est.existe && est.vigente);
  const idCodigo = hayCodigo ? (est.cred && est.cred.salt ? String(est.cred.salt).slice(0, 16) : "plano") : "";
  let reserva;
  try { reserva = await I.reservarLogin({ email: em, ip, dispositivo, canal, hayCodigo, idCodigo }); }
  catch (e) { return { fallo: { status: 503, error: "no_disponible" } }; }
  if (!reserva.ok) return { fallo: { status: reserva.status, error: reserva.error, retry: reserva.retry } };
  const r = R.evaluarLogin({ usuarios, pins, email, pin, ahora, corteMs, soloCodigo: reserva.soloCodigo, codigoBloqueado: reserva.codigoBloqueado });
  if (r.ok) { try { await reserva.liberar(!!r.viaCodigo); } catch (e) { /* el contador vence solo */ } }
  return { r, pins, usuario: u, em, dispositivo: reserva.dispositivo, epocaD };
}
function respuestaFallo(res, f) {
  const extra = f.retry ? { "Retry-After": String(f.retry) } : undefined;
  return S.json(res, f.status, { error: f.error }, extra);
}
function str(v, max) { return typeof v === "string" && v.length > 0 && v.length <= max ? v : null; }

async function login(req, res, b) {
  const email = str(b.email, 320), pin = str(b.pin, 64);
  if (!email || !pin) return S.json(res, 401, { error: "credenciales" });
  const ip = S.ipDe(req);
  if (!ip) return S.json(res, 503, { error: "no_disponible" });
  const n = await nucleoLogin({ email, pin, ip, canal: "app", req });
  if (n.fallo) return respuestaFallo(res, n.fallo);
  const { r, pins } = n;
  if (!r.ok) return S.json(res, ESTADO_LOGIN[r.error] || 401, { error: ESTADO_LOGIN[r.error] ? r.error : "credenciales" });
  if (r.debeCambiarPin) {
    return S.json(res, 200, { ok: true, debeCambiarPin: true, motivo: r.motivo, nombre: r.usuario.nombre },
      { "Set-Cookie": cookieDe(r.usuario, "cambio_pin", pins) });
  }
  // Ingreso correcto: este equipo queda (o sigue) reconocido para esta persona.
  return S.json(res, 200, { ok: true, debeCambiarPin: false, usuario: R.filtrarRoster(r.usuario) },
    { "Set-Cookie": [cookieDe(r.usuario, "completa", pins), I.cookieDisp(n.em, n.epocaD, n.dispositivo)] });
}

async function cambiarPin(req, res, b) {
  const s = await S.resolverSesion(req, { permitirCambioPin: true });
  if (!s.ok) return S.json(res, s.status, { error: s.error });
  const l = await S.limitar(`cambio:${s.usuario.nombre}`, S.reglas().id);
  if (l === "bloqueado") return S.json(res, 429, { error: "bloqueado" });
  if (l !== "ok") return S.json(res, 503, { error: "no_disponible" });
  const corteMs = R.corteCredenciales();
  // Con sesión "completa" el PIN (o código) actual se prueba igual que en el login: pasa por
  // los mismos contadores (D4). Una cookie robada no da intentos aparte.
  let reserva = null;
  if (typeof b.pinActual === "string" && b.pinActual.length > 0) {
    let pinsAhora;
    try { pinsAhora = await S.leerPins(); } catch (e) { return S.json(res, 503, { error: "no_disponible" }); }
    const em0 = String(s.usuario.email || "").trim().toLowerCase();
    const epocaD = R.epocaDispositivo(pinsAhora, s.usuario.nombre);
    const est = R.estadoTemp(pinsAhora[`${s.usuario.nombre}_temp`], Date.now(), pinsAhora[`${s.usuario.nombre}_temp_exp`], corteMs);
    const hayCodigo = !!(est.existe && est.vigente);
    try {
      reserva = await I.reservarLogin({ email: em0, ip: S.ipDe(req) || null, dispositivo: I.dispositivoReconocido(req, em0, epocaD), canal: "app",
        hayCodigo, idCodigo: hayCodigo ? (est.cred && est.cred.salt ? String(est.cred.salt).slice(0, 16) : "plano") : "" });
    } catch (e) { return S.json(res, 503, { error: "no_disponible" }); }
    if (!reserva.ok) return respuestaFallo(res, reserva);
  }
  let escritos = null, viaCodigo = false;
  await S.puntoDePrueba("cambiarPin:antesDeEscribir");
  const w = await S.actualizarFila("pins", (valor) => {
    // Dentro de la escritura condicionada: si entre la validación y este punto la sesión
    // fue revocada ("Salir", reseteo, otro cambio), no se cambia el PIN.
    if (s.ses.scope === "completa" && s.ses.fp !== R.huellaSesion(valor || {}, s.usuario.nombre)) {
      return { abortar: { status: 401, error: "sin_sesion" } };
    }
    const r = R.evaluarCambioPin({ usuario: s.usuario, pins: valor || {}, pinActual: b.pinActual, pinNuevo: b.pinNuevo,
      tel: b.tel, sesion: s.ses, ahora: Date.now(), corteMs,
      soloCodigo: !!(reserva && reserva.soloCodigo), codigoBloqueado: !!(reserva && reserva.codigoBloqueado) });
    if (!r.ok) return { abortar: r };
    escritos = r.nuevosPins;
    viaCodigo = !!r.viaCodigo;
    return r.nuevosPins;
  });
  if (w.abortado) return S.json(res, w.abortado.status, { error: w.abortado.error });
  if (reserva) { try { await reserva.liberar(viaCodigo); } catch (e) { /* el contador vence solo */ } }
  // La cookie nueva lleva la huella del PIN recién guardado: las demás sesiones de
  // esta persona (otro navegador, un tercero) quedan fuera.
  // Cambiar el PIN subió la época de equipos: solo este equipo queda reconocido.
  const prev = I.leerDisp(req);
  const em = String(s.usuario.email || "").trim().toLowerCase();
  const idDisp = prev && prev.e === em ? prev.d : null;
  return S.json(res, 200, { ok: true, usuario: R.filtrarRoster(s.usuario) },
    { "Set-Cookie": [cookieDe(s.usuario, "completa", escritos), I.cookieDisp(em, R.epocaDispositivo(escritos, s.usuario.nombre), idDisp)] });
}

// Emite un código provisorio (hash + exp en pins[`${nombre}_temp`]) y lo envía por correo.
// `admin` (reseteo del administrador): inhabilita el PIN anterior, cierra todas las sesiones
// (época) y deja de reconocer sus equipos. Pedido propio: el PIN vigente sigue valiendo,
// salvo que haya un reseteo del administrador pendiente (el código nuevo lo hereda).
// Un pedido propio NO reemplaza un código vigente: el que ya llegó al correo de la persona
// sigue sirviendo (un tercero no puede invalidarlo pidiendo otro, ni inundar su casilla).
async function emitirCodigo(usuario, saludo, admin) {
  const codigo = R.generarCodigoRecuperacion();
  let origen = "admin", emitido = true;
  await S.actualizarFila("pins", (valor) => {
    emitido = true;   // (se reevalúa en cada reintento de la escritura condicionada)
    const actual = (valor || {})[`${usuario.nombre}_temp`];
    if (!admin && actual) {
      const est = R.estadoTemp(actual, Date.now(), (valor || {})[`${usuario.nombre}_temp_exp`], null);
      if (est.vigente) { emitido = false; return { abortar: "vigente" }; }
    }
    const previo = R.origenTemp(actual);
    origen = !admin && previo !== "admin" ? "propio" : "admin";
    const v = { ...(valor || {}), [`${usuario.nombre}_temp`]: R.crearTempCred(codigo, Date.now(), origen) };
    delete v[`${usuario.nombre}_temp_exp`];
    if (admin) {
      v[`${usuario.nombre}_epoca`] = (Number(v[`${usuario.nombre}_epoca`]) || 0) + 1;
      v[`${usuario.nombre}_epoca_disp`] = R.epocaDispositivo(v, usuario.nombre) + 1;
    }
    return v;
  });
  let enviado = false;
  try {
    if (!emitido) return { codigo: null, enviado: false, vigente: true };
    const r = await S.enviarCorreo({ to: usuario.email, subject: "Código provisorio - Mediterra", message: S.textoCodigo(usuario.nombre, codigo, saludo, origen) });
    enviado = !!(r && r.success !== false);
  } catch (e) { enviado = false; }
  return { codigo, enviado };
}

// Respuesta SIEMPRE igual y no antes de RECUPERAR_MIN_MS: sin ese piso, el tiempo
// (escritura + SMTP) revelaría si el correo existe y si el celular coincide.
const RECUPERAR_MIN_MS = 3000;
async function recuperar(req, res, b) {
  const t0 = Date.now();
  const OK = async () => { await espera(Math.max(0, RECUPERAR_MIN_MS - (Date.now() - t0))); return S.json(res, 200, { ok: true }); };
  const email = str(b.email, 320);
  if (!email) return OK();
  const ip = S.ipDe(req);
  if (!ip) return OK();
  const rg = S.reglas();
  if (await S.limitar(`ip:${ip}`, rg.ip) !== "ok") return OK();
  if (await S.limitar(`recuperar:${email.trim().toLowerCase()}`, rg.id) !== "ok") return OK();
  try {
    const { usuarios } = await S.leerUsuarios();
    const pins = await S.leerPins();
    const d = R.evaluarRecuperacion({ usuarios, pins, email, tel: b.tel });
    if (d.emitir) await emitirCodigo(d.usuario, false, false);
  } catch (e) { console.error("auth recuperar: error interno"); }
  return OK();
}

// Revocación en el servidor: la época (`<Nombre>_epoca`, fila pins) forma parte de la
// huella de toda sesión "completa"; subirla invalida todas las cookies emitidas antes,
// incluidas las copiadas, en cualquier instancia (la huella se relee de la base en cada
// petición). Solo la puede subir una sesión cuya huella siga vigente: una copia ya
// inválida no puede cerrar las sesiones nuevas de esa persona.
async function logout(req, res, b) {
  const borrar = { "Set-Cookie": A.cookieBorrar() };
  const ses = A.sesionCualquierScope(req);
  // motivo: "no_solicitada" (cierre por inactividad), "sin_sesion" (no hay sesión en este
  // navegador) o "ya_invalida" (la sesión ya había terminado): el cliente avisa si pidió revocar.
  if (b.revocar === false) return S.json(res, 200, { ok: true, revocado: false, motivo: "no_solicitada" }, borrar);
  if (!ses || ses.scope !== "completa") return S.json(res, 200, { ok: true, revocado: false, motivo: "sin_sesion" }, borrar);
  if (A.faltanSecretos()) return S.json(res, 503, { error: "no_disponible", revocado: false }, borrar);
  try {
    const { usuarios } = await S.leerUsuarios();
    const u = R.buscarUsuario(usuarios, ses.email);
    if (!u || u.nombre !== ses.nombre) return S.json(res, 200, { ok: true, revocado: false, motivo: "sin_sesion" }, borrar);
    await S.puntoDePrueba("logout:antesDeEscribir");
    const w = await S.actualizarFila("pins", (valor) => {
      if (!ses.fp || ses.fp !== R.huellaSesion(valor, u.nombre)) return { abortar: "ya_invalida" };
      const v = { ...valor };
      v[`${u.nombre}_epoca`] = (Number(v[`${u.nombre}_epoca`]) || 0) + 1;
      return v;
    });
    return S.json(res, 200, w.ok ? { ok: true, revocado: true } : { ok: true, revocado: false, motivo: "ya_invalida" }, borrar);
  } catch (e) {
    console.error("auth logout: error interno");
    return S.json(res, 503, { error: "no_disponible", revocado: false }, borrar);
  }
}

async function sesion(req, res) {
  let s;
  try { s = await S.resolverSesion(req, { permitirCambioPin: true }, res); }
  catch (e) { return S.json(res, 503, { error: "no_disponible" }); }
  if (!s.ok) return S.json(res, 401, { error: "sin_sesion" }, { "Set-Cookie": A.cookieBorrar() });
  if (s.ses.scope === "cambio_pin") {
    return S.json(res, 200, { usuario: { nombre: s.usuario.nombre, email: s.usuario.email }, scope: "cambio_pin", debeCambiarPin: true, admin: false });
  }
  const admin = await S.esAdmin(s.usuario.email);
  return S.json(res, 200, { usuario: R.filtrarRoster(s.usuario), scope: "completa", admin });
}

async function adminResetPin(req, res, b) {
  const s = await S.resolverSesion(req);
  if (!s.ok) return S.json(res, s.status, { error: s.error });
  if (!(await S.esAdmin(s.usuario.email))) return S.json(res, 403, { error: "sin_permiso" });
  const nombre = str(b.nombre, 200);
  const objetivo = nombre ? s.usuarios.filter((u) => u && u.nombre === nombre) : [];
  if (objetivo.length !== 1) return S.json(res, 404, { error: "no_encontrado" });
  const { codigo, enviado } = await emitirCodigo(objetivo[0], true, true);
  // Desbloqueo controlado: libera el umbral por cuenta y los contadores de código.
  let desbloqueado = true;
  try { await I.desbloquearCuenta(objetivo[0].email); } catch (e) { desbloqueado = false; }
  return S.json(res, 200, { ok: true, codigo, correoEnviado: enviado, desbloqueado });
}

async function verificar(req, res, b) {
  const esperado = process.env.OSIRIS_VERIFICAR_SECRETO || "";
  if (!esperado) return S.json(res, 503, { error: "no_configurado" });
  const recibido = String(S.hdr(req, "x-mediterra-secreto") || "");
  const h = (x) => crypto.createHash("sha256").update(x).digest();
  if (!recibido || !crypto.timingSafeEqual(h(recibido), h(esperado))) return S.json(res, 401, { error: "sin_permiso" });
  const email = str(b.email, 320), pin = str(b.pin, 64);
  if (!email || !pin) return S.json(res, 401, { error: "credenciales" });
  // Mismos contadores que el login de la app (cuenta y umbral por cuenta). osiris-auth no
  // reenvía la IP del cliente: su origen es el canal "osiris" (sin equipo reconocido).
  // IP del navegador reenviada por osiris-auth (solo se confía en ella porque la petición
  // trae el secreto). Sin ella, el origen es el canal completo (contador por cuenta).
  const ipCliente = require("../_friskuSpRateLimiter").normalizarIp(S.hdr(req, "x-mediterra-ip-cliente")) || null;
  const n = await nucleoLogin({ email, pin, ip: ipCliente, canal: "osiris", req: null });
  if (n.fallo) return respuestaFallo(res, n.fallo);
  const r = n.r;
  if (!r.ok) return S.json(res, 401, { error: r.error === "verificacion_requerida" ? "verificacion_requerida" : "credenciales" });
  return S.json(res, 200, { ok: true, email: String(r.usuario.email).trim().toLowerCase(), nombre: r.usuario.nombre, debeCambiarPin: !!r.debeCambiarPin });
}

module.exports = async function handler(req, res) {
  const op = req.query && req.query.op;
  if (!METODO[op]) return S.json(res, 404, { error: "op_desconocida" });
  if (req.method !== METODO[op]) { res.setHeader("Allow", METODO[op]); return S.json(res, 405, { error: "metodo" }); }
  if (op === "logout") {
    // Siempre borra la cookie del navegador; la revocación exige JSON (como toda mutación).
    const b = S.esJSON(req) ? (S.cuerpo(req) || {}) : { revocar: false };
    return await logout(req, res, b);
  }
  if (A.faltanSecretos()) return S.json(res, 503, { error: "no_configurado" });
  let b = {};
  if (METODO[op] === "POST") {
    if (!S.esJSON(req)) return S.json(res, 415, { error: "content_type" });
    b = S.cuerpo(req);
    if (!b) return S.json(res, 400, { error: "body_invalido" });
  }
  try {
    if (op === "login") return await login(req, res, b);
    if (op === "cambiar-pin") return await cambiarPin(req, res, b);
    if (op === "recuperar") return await recuperar(req, res, b);
    if (op === "sesion") return await sesion(req, res);
    if (op === "admin-reset-pin") return await adminResetPin(req, res, b);
    if (op === "verificar") return await verificar(req, res, b);
  } catch (e) {
    console.error("auth " + op + ": error interno");
    return S.json(res, 503, { error: "no_disponible" });
  }
};
