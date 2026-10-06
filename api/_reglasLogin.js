/* eslint-disable */
// api/_reglasLogin.js — Reglas PURAS de acceso de la app (modo servidor)
// ------------------------------------------------------------------------------
// NO es un endpoint. Única implementación en el servidor de las reglas que hoy
// aplica el navegador (src/App.jsx handleLogin / handleResetPin / handleCambiarPin,
// estadoTemp / verificarTemp y src/pinHash.js). Sin red: recibe filas YA leídas.
//
// Por qué existe: el login server-side anterior (api/login.js, retirado el
// 2026-06-30, commit 8d7116f) NO forzaba la migración de PIN y dejó entrar a un
// usuario con su PIN antiguo de 4 dígitos. Aquí se replica la regla completa:
//   1. Cuenta desactivada → bloqueada (antes de mirar el PIN, igual que el cliente).
//   2. Si existe `<Nombre>_temp` (vigente o vencido) el ÚNICO acceso es el código
//      provisorio: vencido → rechazo; correcto → debe crear PIN nuevo.
//   3. Sin _temp: se valida contra `<Nombre>_h` (PBKDF2). SIN respaldo a PIN en
//      texto plano: quien no tenga _h debe usar "¿Olvidaste tu PIN?".
//   4. PIN correcto pero sin sello pol:"6dig" o con más de 60 días → debe cambiarlo.
//   5. Código provisorio en texto plano: solo con `<Nombre>_temp_exp` vigente (lo fija el
//      administrador por SQL, docs/seguridad-main-pins-servidor.md). Sin vencimiento → no sirve.
//   6. Corte de credenciales (AUTH_CREDENCIALES_DESDE, opcional): un _h o _temp emitido
//      ANTES del corte (o sin sello `ts`) ya no da acceso; se recupera por correo. Existe
//      porque los hashes fueron legibles con la llave pública hasta la fase B.

const crypto = require("crypto");
const { verificarPin, normalizarEmail } = require("./_friskuSpAuth");

const PIN_ITER = 100000;
const TEMP_TTL_MS = 45 * 60 * 1000;     // 45 minutos (TEMP_TTL_MS del cliente)
const DIAS_VIGENCIA_PIN = 60;

// Campos del padrón que el servidor entrega al navegador (nunca credenciales).
const CAMPOS_ROSTER = ["nombre", "email", "cargo", "rol", "esCFO", "desactivado", "modulos",
  "tab_permisos", "empresas_permitidas", "cadenaAprobacion", "rendVerTodas", "rendPorOtros"];
// Claves de `main` que puede escribir PATCH /api/datos/main.
const CLAVES_MAIN = ["estados", "comentarios", "recsDone", "recsComentarios", "mes", "anio",
  "tareasConfig", "supervisores", "tareasExtra", "tareasOverrides"];
const CLAVES_CONFIG = ["tareasConfig", "supervisores", "tareasExtra", "tareasOverrides"];

function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function comoCred(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim().startsWith("{")) return parseJSON(raw);
  return null;
}
function igualesTiempoConstante(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y) && String(a).length === String(b).length;
}

// ── PIN nuevo y celular (réplica exacta de src/pinHash.js) ──
function pinNuevoValido(pin) {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) return { ok: false, msg: "El PIN debe ser exactamente 6 dígitos numéricos." };
  if (/^(\d)\1{5}$/.test(pin)) return { ok: false, msg: "No uses 6 dígitos iguales (ej. 111111)." };
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return { ok: false, msg: "No uses una secuencia (ej. 123456, 654321)." };
  return { ok: true };
}
function normalizarCelular(input) {
  const d = String(input || "").replace(/\D/g, "");
  let n = d;
  if (n.startsWith("56")) n = n.slice(2);
  if (n.length === 9 && n.startsWith("9")) return { ok: true, tel: "56" + n };
  return { ok: false, msg: "Ingresa un celular válido (9 dígitos, ej. 9 1234 5678)." };
}

function hashPin(pin, ahora) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, PIN_ITER, 32, "sha256").toString("hex");
  // ts = instante de emisión (lo usa el corte de credenciales).
  return { v: 1, iter: PIN_ITER, salt: salt.toString("hex"), hash, ts: new Date(Number.isFinite(ahora) ? ahora : Date.now()).toISOString() };
}
// Mismo costo que verificar un PIN real: iguala el tiempo de respuesta cuando el
// correo no existe, la cuenta no tiene _h o está desactivada (no enumera cuentas).
const CRED_FICTICIA = { iter: PIN_ITER, salt: "00".repeat(16), hash: "00".repeat(32) };
function trabajoFicticio(pin) { verificarPin(String(pin || ""), CRED_FICTICIA); }

// Corte de credenciales (ms) desde AUTH_CREDENCIALES_DESDE (ISO 8601) o null (sin corte).
function corteCredenciales(env) {
  const v = (env || process.env).AUTH_CREDENCIALES_DESDE;
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new Error("AUTH_CREDENCIALES_DESDE_invalido");
  return t;
}
// ¿La credencial (objeto) fue emitida antes del corte? Sin `ts` = antigua.
function anteriorAlCorte(cred, corteMs) {
  if (!corteMs) return false;
  const t = cred && cred.ts ? Date.parse(cred.ts) : NaN;
  return !(Number.isFinite(t) && t >= corteMs);
}
function generarCodigo6() { return String(crypto.randomInt(0, 1000000)).padStart(6, "0"); }
// Código de recuperación (D4): 12 caracteres Crockford base32 = 60 bits, "XXXX-XXXX-XXXX".
// Con esa entropía basta un límite POR ORIGEN: no hace falta un tope global por cuenta,
// que un tercero podría agotar para bloquear a la persona.
const ALFABETO_CODIGO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function generarCodigoRecuperacion() {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALFABETO_CODIGO[crypto.randomInt(0, 32)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
// Tolerante a lo que escribe una persona: minúsculas, espacios, guiones, O→0, I/L→1.
function normalizarCodigo(v) {
  return String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}
// JSON string a guardar en pins[`${nombre}_temp`] (mismo formato que crearTempCred del cliente).
// `origen` (D4): "propio" = lo pidió la persona ("¿Olvidaste tu PIN?"): su PIN vigente
// SIGUE valiendo hasta que complete el cambio. "admin" = reseteo del administrador (o
// cuenta comprometida): el PIN anterior queda inhabilitado. Un código sin origen
// (antiguo o en texto plano) se trata como "admin".
function crearTempCred(codigo, ahora, origen = "admin") {
  const largo = normalizarCodigo(codigo).length === 12;
  const cred = hashPin(largo ? normalizarCodigo(codigo) : codigo, ahora);
  if (largo) cred.formato = "c12";
  cred.exp = (Number.isFinite(ahora) ? ahora : Date.now()) + TEMP_TTL_MS;
  cred.origen = origen === "propio" ? "propio" : "admin";
  return JSON.stringify(cred);
}
// Origen del código pendiente (o null si no hay). Usado al emitir uno nuevo: un pedido
// propio NO puede rebajar un reseteo del administrador (el nuevo hereda "admin").
function origenTemp(rawTemp) {
  if (!rawTemp) return null;
  const c = comoCred(rawTemp);
  return c && c.origen === "propio" ? "propio" : "admin";
}

// ── Código provisorio (réplica de estadoTemp / verificarTemp) ──
// `expPlano` = pins[`${nombre}_temp_exp`] (ms o ISO): obligatorio para un código en texto
// plano. Con corte, un código hasheado emitido antes del corte cuenta como vencido.
function estadoTemp(rawTemp, ahora, expPlano, corteMs) {
  const now = Number.isFinite(ahora) ? ahora : Date.now();
  if (!rawTemp) return { existe: false, vigente: false, expirado: false, cred: null, legacy: false };
  const cred = comoCred(rawTemp);
  if (cred && cred.salt && cred.hash) {
    const expirado = !cred.exp || now > cred.exp || anteriorAlCorte(cred, corteMs);
    return { existe: true, vigente: !expirado, expirado, cred, legacy: false, origen: cred.origen === "propio" ? "propio" : "admin" };
  }
  const exp = typeof expPlano === "number" ? expPlano : Date.parse(expPlano || "");
  const expirado = !(Number.isFinite(exp) && now <= exp);
  return { existe: true, vigente: !expirado, expirado, cred: null, legacy: true, plano: String(rawTemp), origen: "admin" };
}
function tempDe(P, nombre, ahora, corteMs) {
  return estadoTemp(P[`${nombre}_temp`], ahora, P[`${nombre}_temp_exp`], corteMs);
}
function verificarTemp(codigo, est) {
  if (!est || !est.existe || !est.vigente) return false;
  if (est.legacy) return igualesTiempoConstante(String(codigo), est.plano);
  if (est.cred && est.cred.formato === "c12") return verificarPin(normalizarCodigo(codigo), est.cred);
  return verificarPin(String(codigo), est.cred);
}

// ── Política del PIN: ¿debe cambiarlo? (réplica de debeMigrar del cliente) ──
// Devuelve { debe, motivo:"politica"|"vencido"|null }.
function decidirMigracion(credRaw, ahora) {
  const now = Number.isFinite(ahora) ? ahora : Date.now();
  const c = comoCred(credRaw);
  let vencido = false;
  if (c && c.fecha) vencido = (now - new Date(c.fecha).getTime()) / 86400000 > DIAS_VIGENCIA_PIN;
  const cumple = !!(c && c.pol === "6dig");
  if (!cumple) return { debe: true, motivo: "politica" };
  if (vencido) return { debe: true, motivo: "vencido" };
  return { debe: false, motivo: null };
}

// Email → EXACTAMENTE un usuario (0 o >1 → null, fallo cerrado) con nombre único.
function buscarUsuario(usuarios, email) {
  const arr = Array.isArray(usuarios) ? usuarios : [];
  const em = normalizarEmail(email);
  if (!em) return null;
  const m = arr.filter((u) => u && normalizarEmail(u.email) === em);
  if (m.length !== 1 || !m[0].nombre) return null;
  if (arr.filter((u) => u && u.nombre === m[0].nombre).length !== 1) return null;
  return m[0];
}

// Huella de la credencial vigente (_h + _temp). Va en la cookie "cambio_pin":
// si la credencial cambia (otro reseteo, otro cambio) la cookie deja de servir
// para cambiar el PIN sin volver a presentar el PIN/código actual.
function huellaCredencial(pins, nombre) {
  const p = pins || {};
  const s = JSON.stringify([p[`${nombre}_h`] || null, p[`${nombre}_temp`] || null]);
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}
// Época de los equipos reconocidos de una persona (cookie mediterra_disp, D4). La suben el
// cambio de PIN y el reseteo del administrador: los equipos reconocidos antes dejan de serlo.
function epocaDispositivo(pins, nombre) { return Number((pins || {})[`${nombre}_epoca_disp`]) || 0; }

// Huella de la sesión "completa": PIN vigente (_h) + época (`_epoca`, la sube el
// reseteo del administrador). Si cambia, toda sesión emitida antes deja de valer.
// No incluye _temp: pedir un código (público) no debe cerrar la sesión de nadie.
function huellaSesion(pins, nombre) {
  const p = pins || {};
  const s = JSON.stringify(["s", p[`${nombre}_h`] || null, p[`${nombre}_epoca`] || 0]);
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

// Decisión de login. Respuesta genérica ante fallo (no distingue email inexistente
// de PIN incorrecto). `detalle` es solo para pruebas/auditoría, NO va al cliente.
//  → { ok:false, error:"credenciales"|"desactivado"|"debe_recuperar", detalle }
//  → { ok:true, usuario, debeCambiarPin:false }
//  → { ok:true, usuario, debeCambiarPin:true, motivo:"temp"|"politica"|"vencido" }
// "desactivado" y "debe_recuperar" se informan SOLO con la credencial correcta (si no,
// revelarían que la cuenta existe). Todos los caminos hacen un PBKDF2 (mismo tiempo).
// `soloCodigo` (D4): la cuenta superó el umbral de fallos desde orígenes no reconocidos;
// desde este origen solo vale el código enviado por correo (el PIN NO se evalúa).
// Resultado con viaCodigo:true si entró con el código.
function evaluarLogin({ usuarios, pins, email, pin, ahora, corteMs = null, soloCodigo = false, codigoBloqueado = false }) {
  const pinIn = typeof pin === "string" ? pin.trim() : "";
  if (!pinIn || pinIn.length > 64) { trabajoFicticio(pinIn); return { ok: false, error: "credenciales", detalle: "forma" }; }
  const u = buscarUsuario(usuarios, email);
  // Con verificación exigida, una cuenta inexistente responde igual que una existente.
  if (!u) { trabajoFicticio(pinIn); return { ok: false, error: soloCodigo ? "verificacion_requerida" : "credenciales", detalle: "sin_usuario" }; }
  const P = pins && typeof pins === "object" ? pins : {};
  const desact = (detalle) => ({ ok: false, error: u.desactivado ? "desactivado" : "credenciales", detalle });
  const est = tempDe(P, u.nombre, ahora, corteMs);
  // codigoBloqueado: este origen agotó sus intentos con el código vigente → el código no se
  // evalúa desde aquí (el PIN sí, con las reglas normales).
  if (!codigoBloqueado && est.existe && est.vigente && verificarTemp(pinIn, est)) {
    if (u.desactivado) return desact("desactivado");
    return { ok: true, usuario: u, debeCambiarPin: true, motivo: "temp", viaCodigo: true };
  }
  if (soloCodigo) {
    if (!(est.existe && est.vigente)) trabajoFicticio(pinIn);
    return { ok: false, error: "verificacion_requerida", detalle: est.existe && est.vigente ? "codigo" : "sin_codigo" };
  }
  if (est.existe && est.origen === "admin") {
    // Reseteo del administrador: el PIN anterior está inhabilitado.
    if (est.expirado) { trabajoFicticio(pinIn); return { ok: false, error: "credenciales", detalle: "temp_vencido" }; }
    return { ok: false, error: "credenciales", detalle: "pin_con_temp" };
  }
  // Sin código, o código propio (vigente o vencido): el PIN vigente sigue valiendo.
  const credH = P[`${u.nombre}_h`];
  if (!credH) { trabajoFicticio(pinIn); return { ok: false, error: "credenciales", detalle: "sin_h" }; }   // sin respaldo a texto plano
  if (!verificarPin(pinIn, comoCred(credH))) return { ok: false, error: "credenciales", detalle: "pin" };
  if (u.desactivado) return desact("desactivado");
  if (anteriorAlCorte(comoCred(credH), corteMs)) return { ok: false, error: "debe_recuperar", detalle: "anterior_al_corte" };
  const mig = decidirMigracion(credH, ahora);
  if (mig.debe) return { ok: true, usuario: u, debeCambiarPin: true, motivo: mig.motivo };
  return { ok: true, usuario: u, debeCambiarPin: false };
}

// Cambio de PIN. `sesion` = payload de la cookie (scope, fp). Si no viene pinActual,
// solo se acepta una sesión "cambio_pin" cuya huella coincide con la credencial actual.
//  → { ok:false, status, error, detalle } | { ok:true, nuevosPins }
// `soloCodigo` (D4): con el umbral por cuenta superado desde este origen, el PIN actual no
// se evalúa; solo el código del correo.
function evaluarCambioPin({ usuario, pins, pinActual, pinNuevo, tel, sesion, ahora, corteMs = null, soloCodigo = false, codigoBloqueado = false }) {
  const nombre = usuario && usuario.nombre;
  if (!nombre) return { ok: false, status: 401, error: "sin_sesion" };
  const P = pins && typeof pins === "object" ? pins : {};
  const est = tempDe(P, nombre, ahora, corteMs);
  const credH = P[`${nombre}_h`];
  const traeActual = typeof pinActual === "string" && pinActual.length > 0;
  let viaCodigo = false;
  if (traeActual) {
    if (!codigoBloqueado && est.existe && est.origen === "propio" && est.vigente && verificarTemp(pinActual, est)) {
      viaCodigo = true;   // código propio correcto
    } else if (soloCodigo) {
      return { ok: false, status: 403, error: "verificacion_requerida", detalle: "solo_codigo" };
    } else if (est.existe && est.origen === "admin") {
      if (est.expirado) return { ok: false, status: 401, error: "credenciales", detalle: "temp_vencido" };
      if (codigoBloqueado || !verificarTemp(pinActual, est)) return { ok: false, status: 401, error: "credenciales", detalle: "temp" };
      viaCodigo = true;
    } else if (!credH || !verificarPin(pinActual, comoCred(credH))) {
      return { ok: false, status: 401, error: "credenciales", detalle: "pin_actual" };
    } else if (anteriorAlCorte(comoCred(credH), corteMs)) {
      // El PIN anterior al corte estuvo expuesto (su hash era legible): no basta para fijar uno nuevo.
      return { ok: false, status: 401, error: "debe_recuperar", detalle: "anterior_al_corte" };
    }
  } else {
    const okHuella = sesion && sesion.scope === "cambio_pin" && sesion.fp && sesion.fp === huellaCredencial(P, nombre);
    if (!okHuella) return { ok: false, status: 401, error: "credenciales", detalle: "sin_pin_actual" };
    if (est.existe && est.origen === "admin" && est.expirado) return { ok: false, status: 401, error: "credenciales", detalle: "temp_vencido" };
  }
  const vp = pinNuevoValido(pinNuevo);
  if (!vp.ok) return { ok: false, status: 400, error: "pin_invalido", detalle: vp.msg };
  let telNorm = P[`${nombre}_tel`];
  if (typeof tel === "string" && tel.trim()) {
    const nc = normalizarCelular(tel);
    if (!nc.ok) return { ok: false, status: 400, error: "tel_invalido", detalle: nc.msg };
    telNorm = nc.tel;
  }
  // No repetir las últimas 3 claves (actual + historial), como el cliente.
  let hist = [];
  const hRaw = P[`${nombre}_hist`];
  const hParsed = typeof hRaw === "string" ? parseJSON(hRaw) : hRaw;
  if (Array.isArray(hParsed)) hist = hParsed;
  const recientes = [comoCred(credH), ...hist].filter(Boolean).slice(0, 3);
  for (const c of recientes) {
    if (verificarPin(pinNuevo, c)) return { ok: false, status: 400, error: "pin_repetido" };
  }
  const cred = hashPin(pinNuevo, ahora);
  cred.fecha = new Date(Number.isFinite(ahora) ? ahora : Date.now()).toISOString().slice(0, 10);
  cred.pol = "6dig";
  const nuevosPins = { ...P };
  nuevosPins[`${nombre}_h`] = JSON.stringify(cred);
  nuevosPins[`${nombre}_hist`] = JSON.stringify(recientes.map((c) => ({ salt: c.salt, hash: c.hash, iter: c.iter })));
  if (telNorm) nuevosPins[`${nombre}_tel`] = telNorm;
  delete nuevosPins[nombre];              // override plano residual
  delete nuevosPins[`${nombre}_temp`];    // el código provisorio queda invalidado
  delete nuevosPins[`${nombre}_temp_exp`];
  // Cambiar el PIN deja de reconocer los demás equipos (D4); el que lo cambió recibe uno nuevo.
  nuevosPins[`${nombre}_epoca_disp`] = epocaDispositivo(P, nombre) + 1;
  return { ok: true, nuevosPins, viaCodigo };
}

// Recuperación: ¿a quién se le emite código? (FASE 2b del cliente: si la cuenta
// registró celular, debe coincidir). Cuenta desactivada → no se emite.
function evaluarRecuperacion({ usuarios, pins, email, tel }) {
  const u = buscarUsuario(usuarios, email);
  if (!u || u.desactivado || !u.email) return { emitir: false };
  const telReg = pins && pins[`${u.nombre}_tel`];
  if (telReg) {
    const nc = normalizarCelular(tel);
    if (!nc.ok || nc.tel !== telReg) return { emitir: false };
  }
  return { emitir: true, usuario: u };
}

// ── Padrón ──
function filtrarRoster(u) {
  const o = {};
  for (const k of CAMPOS_ROSTER) if (u && u[k] !== undefined) o[k] = u[k];
  return o;
}
// `pin` vacío (pin:"" que deja el alta de usuarios) no es credencial: se ignora.
function esCampoCredencial(k, v) {
  const s = String(k);
  if (s === "pin" && (v === "" || v == null)) return false;
  return s === "pin" || s === "pinsPersonalizados" || /^(hash|salt|iter)$/i.test(s) ||
    /_(h|temp|hist|tel)$/.test(s) || /pin/i.test(s);
}
// Valida el padrón entrante (PUT). Devuelve null si está bien o el código de error.
function validarUsuariosEntrantes(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "valor_invalido";
  const emails = new Set(), nombres = new Set();
  for (const u of arr) {
    if (!u || typeof u !== "object" || Array.isArray(u)) return "valor_invalido";
    if (typeof u.nombre !== "string" || !u.nombre.trim()) return "valor_invalido";
    if (Object.entries(u).some(([k, v]) => esCampoCredencial(k, v))) return "campos_credenciales";
    const em = normalizarEmail(u.email);
    if (em && emails.has(em)) return "duplicado";
    if (nombres.has(u.nombre)) return "duplicado";
    if (em) emails.add(em);
    nombres.add(u.nombre);
  }
  return null;
}
// Fusiona: por usuario (nombre), los campos que el navegador NO ve (incluido `pin`
// heredado) se conservan del valor guardado; los que envía, mandan.
function fusionarUsuarios(guardados, entrantes) {
  const prev = new Map((Array.isArray(guardados) ? guardados : []).filter((u) => u && u.nombre).map((u) => [u.nombre, u]));
  return entrantes.map((u) => {
    const g = prev.get(u.nombre) || {};
    const conservado = {};
    for (const [k, v] of Object.entries(g)) if (!CAMPOS_ROSTER.includes(k)) conservado[k] = v;
    const entrante = { ...u };
    delete entrante.pin;                  // nunca se escribe `pin` desde el navegador
    return { ...conservado, ...entrante };
  });
}
// Espejo de `main.usuarios` para el trigger guard_main_no_user_shrink: el padrón de
// la fila `usuarios` + los que main ya tenía y faltan (el trigger rechazaría quitarlos).
function espejoUsuarios(filaUsuarios, mainUsuarios) {
  const base = Array.isArray(filaUsuarios) ? filaUsuarios.slice() : [];
  const emails = new Set(base.map((u) => normalizarEmail(u && u.email)).filter(Boolean));
  for (const u of Array.isArray(mainUsuarios) ? mainUsuarios : []) {
    const em = normalizarEmail(u && u.email);
    if (em && !emails.has(em)) { base.push(u); emails.add(em); }
  }
  return base;
}

// ── main ──
function puedeEditarConfig(usuario, esAdmin) {
  if (esAdmin) return true;
  return !!(usuario && usuario.tab_permisos && usuario.tab_permisos.tareas &&
    usuario.tab_permisos.tareas.config === "editar");
}
function igualJSON(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
// Aplica un patch a `main`. Claves de configuración: solo con permiso, salvo que el
// valor enviado sea idéntico al guardado (el navegador manda el estado completo).
//  → { ok:true, valor } | { ok:false, status, error }
function aplicarPatchMain(valorActual, patch, { puedeConfig }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, status: 400, error: "patch_invalido" };
  const claves = Object.keys(patch);
  if (claves.some((k) => !CLAVES_MAIN.includes(k))) return { ok: false, status: 400, error: "campos_no_permitidos" };
  const actual = valorActual && typeof valorActual === "object" ? valorActual : {};
  for (const k of claves) {
    if (CLAVES_CONFIG.includes(k) && !puedeConfig && !igualJSON(actual[k], patch[k])) {
      return { ok: false, status: 403, error: "sin_permiso" };
    }
  }
  const valor = { ...actual };
  for (const k of claves) valor[k] = patch[k];
  return { ok: true, valor };
}
function mainParaCliente(valor) {
  const v = { ...(valor && typeof valor === "object" ? valor : {}) };
  delete v.pinsPersonalizados;
  delete v.usuarios;
  return v;
}

module.exports = {
  TEMP_TTL_MS, DIAS_VIGENCIA_PIN, CAMPOS_ROSTER, CLAVES_MAIN, CLAVES_CONFIG,
  pinNuevoValido, normalizarCelular, hashPin, generarCodigo6, generarCodigoRecuperacion, normalizarCodigo, crearTempCred,
  estadoTemp, verificarTemp, decidirMigracion, buscarUsuario, huellaCredencial, huellaSesion,
  corteCredenciales, anteriorAlCorte, trabajoFicticio, origenTemp, epocaDispositivo,
  evaluarLogin, evaluarCambioPin, evaluarRecuperacion,
  filtrarRoster, esCampoCredencial, validarUsuariosEntrantes, fusionarUsuarios, espejoUsuarios,
  puedeEditarConfig, aplicarPatchMain, mainParaCliente,
};
