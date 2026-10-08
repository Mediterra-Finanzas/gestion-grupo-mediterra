/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// authServidor.js — cliente del modo "autenticación en el servidor"
// (rama claude/seguridad-main-pins; contrato: endpoints /api/auth/* y /api/datos/*).
//
// Interruptor: REACT_APP_AUTH_SERVER === 'true'. Con el interruptor apagado
// NADA de este archivo se usa y la app se comporta exactamente como antes.
//
// Con el interruptor prendido el navegador ya no lee ni escribe las filas
// `pins`, `usuarios` ni `main` con la llave pública: el PIN se valida en el
// servidor (cookie de sesión HttpOnly), el roster llega sin credenciales y
// Tareas (`main`) se guarda por PATCH de claves de primer nivel con versión.
//
// Todo lo que no toca la red (diff, fusión, saneo, mensajes) es puro y se
// prueba en src/__tests__/authServidor.test.js.
// ══════════════════════════════════════════════════════════════════════

export const AUTH_SERVER = process.env.REACT_APP_AUTH_SERVER === "true";

// Error tipado: `codigo` = el {error} del servidor ("credenciales", "desactivado",
// "bloqueado", "sin_sesion", "sin_permiso", "conflicto", "pin_invalido",
// "pin_repetido") o "sin_conexion" (red) / "http" (respuesta inesperada).
export class ErrorServidor extends Error {
  constructor(codigo, status, datos) {
    super(`${codigo}${status ? " (HTTP " + status + ")" : ""}`);
    this.name = "ErrorServidor";
    this.codigo = codigo;
    this.status = status || 0;
    this.datos = datos || {};
  }
}

// Claves de `main` que el cliente puede enviar (el resto lo conserva el servidor).
export const CLAVES_MAIN = ["estados", "comentarios", "recsDone", "recsComentarios", "mes", "anio",
  "tareasConfig", "supervisores", "tareasExtra", "tareasOverrides"];
// Claves de configuración: el servidor exige admin o Config = "editar".
export const CLAVES_CONFIG_MAIN = ["tareasConfig", "supervisores", "tareasExtra", "tareasOverrides"];
// Filas que en modo servidor el navegador NUNCA lee ni escribe con la llave pública
// (ni para restaurar un respaldo): se gestionan por /api/auth/* y /api/datos/*.
export const FILAS_SOLO_SERVIDOR = ["pins", "usuarios", "main"];
// Campos de usuario que viajan por /api/datos/usuarios (jamás credenciales).
export const CAMPOS_USUARIO = ["nombre", "email", "cargo", "rol", "esCFO", "desactivado", "modulos",
  "tab_permisos", "empresas_permitidas", "cadenaAprobacion", "rendVerTodas", "rendPorOtros"];

// ── Transporte ─────────────────────────────────────────────────────────
export function crearClienteServidor(opts = {}) {
  // fetch se resuelve en cada llamada (los tests y el E2E pueden reemplazarlo).
  const f = () => opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
  const base = opts.base || "";

  async function llamar(ruta, { method = "GET", body } = {}) {
    const fx = f();
    let res;
    try {
      res = await fx(base + ruta, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: body !== undefined
          ? { "Content-Type": "application/json", "Cache-Control": "no-cache" }
          : { "Cache-Control": "no-cache" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ErrorServidor("sin_conexion", 0, { detalle: String((e && e.message) || e) });
    }
    let datos = {};
    try { datos = await res.json(); } catch (e) { datos = {}; }
    if (!res.ok) {
      const codigo = (datos && typeof datos.error === "string" && datos.error) ||
        (res.status === 401 ? "sin_sesion" : res.status === 403 ? "sin_permiso" :
         res.status === 409 ? "conflicto" : res.status === 429 ? "bloqueado" : "http");
      throw new ErrorServidor(codigo, res.status, datos);
    }
    return datos || {};
  }

  return {
    login: (email, pin) => llamar("/api/auth/login", { method: "POST", body: { email, pin } }),
    cambiarPin: ({ pinActual, pinNuevo, tel }) => {
      const body = { pinNuevo };
      if (pinActual) body.pinActual = pinActual;
      if (tel) body.tel = tel;
      return llamar("/api/auth/cambiar-pin", { method: "POST", body });
    },
    recuperar: (email, tel) => llamar("/api/auth/recuperar", { method: "POST", body: tel ? { email, tel } : { email } }),
    // Devuelve {usuario, scope} o null si no hay sesión (401). Otros errores lanzan.
    sesion: async () => {
      try { return await llamar("/api/auth/sesion"); }
      catch (e) { if (e.status === 401) return null; throw e; }
    },
    // revocar:true (Salir) cierra TODAS las sesiones de la persona en el servidor;
    // revocar:false (cierre por inactividad de esta pestaña) solo borra la cookie local.
    logout: (revocar = true) => llamar("/api/auth/logout", { method: "POST", body: { revocar: revocar !== false } }),
    adminResetPin: (nombre) => llamar("/api/auth/admin-reset-pin", { method: "POST", body: { nombre } }),
    leerRoster: () => llamar("/api/datos/roster"),
    leerUsuarios: () => llamar("/api/datos/usuarios"),
    guardarUsuarios: (valor, version) => llamar("/api/datos/usuarios", { method: "PUT", body: { valor, version } }),
    leerMain: () => llamar("/api/datos/main"),
    patchMain: (patch, version) => llamar("/api/datos/main", { method: "PATCH", body: { patch, version } }),
  };
}

export const servidor = crearClienteServidor();

// ── Mensajes en español ────────────────────────────────────────────────
export function mensajeErrorLogin(e) {
  const c = e && e.codigo;
  if (c === "credenciales") return "Correo o PIN incorrecto.";
  if (c === "desactivado") return "Tu cuenta no está activa. Contacta al administrador.";
  if (c === "verificacion_requerida") return "Por seguridad, desde este equipo necesitas un código enviado a tu correo. Usa \"¿Olvidaste tu PIN?\" y escribe el código en lugar del PIN.";
  if (c === "codigo_agotado") return "Ese código ya no se puede usar (demasiados intentos). Pide uno nuevo con \"¿Olvidaste tu PIN?\".";
  if (c === "verificacion_bloqueada") return "Se superó el límite de intentos con código para esta cuenta. Ingresa desde un equipo donde ya hayas entrado o pide ayuda a un administrador.";
  if (c === "debe_recuperar") return "Por seguridad tu PIN debe restablecerse por correo. Usa \"¿Olvidaste tu PIN?\" para recibir un código.";
  if (c === "bloqueado") return "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.";
  if (c === "sin_conexion") return "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  return "No se pudo iniciar sesión. Intenta de nuevo en unos minutos.";
}
export function mensajeErrorCambioPin(e) {
  const c = e && e.codigo;
  if (c === "pin_invalido") return "El PIN nuevo no cumple la política (6 dígitos, no obvio), o la clave actual es incorrecta.";
  if (c === "pin_repetido") return "No puedes repetir tus últimas 3 claves.";
  if (c === "sin_sesion" || c === "credenciales") return "Tu sesión venció. Vuelve a ingresar con tu correo y tu clave.";
  if (c === "bloqueado") return "Demasiados intentos. Espera unos minutos.";
  if (c === "sin_conexion") return "No se pudo conectar con el servidor. Intenta de nuevo.";
  return "Error al guardar. Intenta de nuevo.";
}

// ── Utilidades puras ───────────────────────────────────────────────────
function igual(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}
const esObj = (x) => x != null && typeof x === "object" && !Array.isArray(x);

// Claves de primer nivel de `local` que difieren de `base` (solo CLAVES_MAIN).
export function diffMain(base, local, claves = CLAVES_MAIN) {
  const b = base || {}, l = local || {};
  const patch = {};
  for (const k of claves) {
    if (!Object.prototype.hasOwnProperty.call(l, k) || l[k] === undefined) continue;
    if (!igual(b[k], l[k])) patch[k] = l[k];
  }
  return patch;
}

// Claves de vista (mes/año que se está mirando): no son trabajo de nadie, así que
// gana la última escritura y nunca abren un conflicto.
export const CLAVES_VISTA_MAIN = ["mes", "anio"];

// Fusión a tres bandas tras un 409. Para claves objeto se compara por sub-clave
// (p. ej. cada estado de tarea); para el resto, la clave completa. Lo que cambié
// yo y el servidor no tocó → gana lo mío. Lo que cambiaron los dos distinto →
// CONFLICTO: el guardador NO escribe ni descarta nada y deja la fila en conflicto
// pendiente (ver crearGuardadorMain).
export function fusionarMain(base, local, servidor, claves = CLAVES_MAIN) {
  const b = base || {}, l = local || {}, s = servidor || {};
  const valor = { ...s };
  const conflictos = [];
  for (const k of claves) {
    if (!Object.prototype.hasOwnProperty.call(l, k) || l[k] === undefined) continue;
    if (igual(b[k], l[k])) continue; // no lo cambié yo
    if (CLAVES_VISTA_MAIN.includes(k)) { valor[k] = l[k]; continue; }
    if (igual(s[k], l[k])) continue; // el servidor ya tiene lo mío
    if (igual(b[k], s[k])) { valor[k] = l[k]; continue; } // solo lo cambié yo
    if (esObj(l[k]) && esObj(s[k]) && (b[k] === undefined || esObj(b[k]))) {
      const bk = b[k] || {}, lk = l[k], sk = s[k];
      const out = { ...sk };
      const subs = new Set([...Object.keys(bk), ...Object.keys(lk)]);
      for (const sub of subs) {
        if (igual(bk[sub], lk[sub])) continue;
        if (igual(sk[sub], lk[sub])) continue;
        if (igual(bk[sub], sk[sub])) {
          if (lk[sub] === undefined) delete out[sub]; else out[sub] = lk[sub];
          continue;
        }
        conflictos.push(`${k}.${sub}`);
      }
      valor[k] = out;
      continue;
    }
    conflictos.push(k);
  }
  return { valor, conflictos };
}

// Aplica sobre `actual` (la pantalla) solo lo que el servidor cambió desde
// `baseAnterior`, y solo donde la pantalla sigue como en esa base (lo editado
// después no se toca). Claves objeto por sub-clave; el resto, la clave completa.
export function aplicarCambiosServidor(actual, servidor, baseAnterior, claves = CLAVES_MAIN) {
  const a = actual || {}, s = servidor || {}, b = baseAnterior || {};
  const out = { ...a };
  for (const k of claves) {
    if (igual(b[k], s[k])) continue;
    if (esObj(s[k]) && (b[k] === undefined || esObj(b[k])) && (a[k] === undefined || esObj(a[k]))) {
      const bk = b[k] || {}, sk = s[k], ak = { ...(a[k] || {}) };
      for (const sub of new Set([...Object.keys(bk), ...Object.keys(sk)])) {
        if (igual(bk[sub], sk[sub])) continue;
        if (!igual(ak[sub], bk[sub])) continue; // editado en la pantalla después
        if (sk[sub] === undefined) delete ak[sub]; else ak[sub] = sk[sub];
      }
      out[k] = ak;
      continue;
    }
    if (igual(a[k], b[k])) out[k] = s[k];
  }
  return out;
}

// Usuario → solo los campos del contrato (nunca pin/_h/_tel).
export function sanearUsuario(u) {
  const o = {};
  for (const c of CAMPOS_USUARIO) if (u && Object.prototype.hasOwnProperty.call(u, c) && u[c] !== undefined) o[c] = u[c];
  return o;
}
export function sanearUsuarios(lista) {
  return (Array.isArray(lista) ? lista : []).map(sanearUsuario);
}

// ── Guardado de `main` por PATCH con versión ───────────────────────────
// `persist` = instancia del contrato F0 (se usa su base/versión/dirty de la fila
// "main" para no duplicar estado). `alFusionar(valor)` aplica a la pantalla el
// resultado de una fusión tras 409.
//
// Conflicto (oct-2026, igual que el contrato de main para las filas-blob): tras un
// 409 se intenta la fusión a tres bandas. Si los cambios no se cruzan, se guarda la
// fusión. Si los dos tocaron lo MISMO, no se escribe nada, no se descarta lo local
// y la fila queda en CONFLICTO PENDIENTE hasta que la persona elija una de las dos
// salidas (`recuperarDelServidor` / `reconciliarConservandoLocal`); ningún
// auto-guardado la resuelve. Las salidas usan /api/datos/main, nunca la llave pública.
export function crearGuardadorMain({ cliente = servidor, persist, id = "main", alFusionar } = {}) {
  let cadena = Promise.resolve();
  let gen = 0;
  let enVuelo = 0;
  let pendiente = null; // { version, valorServidor, conflictos, ts }
  const motivoDe = (e) => (e && e.codigo === "sin_conexion" ? "red" : "http");
  const bloqueado = () => ({ ok: false, motivo: "conflicto_pendiente", conflictoPendiente: true,
    conflictos: pendiente.conflictos, version: pendiente.version, valorServidor: pendiente.valorServidor });

  // `localDe` puede ser un valor o una función: con función, el estado local se lee
  // RECIÉN al escribir (un guardado que esperó en la cola no envía una copia vieja).
  async function unaVez(localDe, opts) {
    const est = persist.estado(id);
    if (!est.cargaOk) return { ok: false, motivo: "sin_carga" };
    if (pendiente) { persist.marcarSucio(id); return bloqueado(); }
    let local = typeof localDe === "function" ? localDe() : localDe;
    const claves = opts.sinConfig ? CLAVES_MAIN.filter((k) => !CLAVES_CONFIG_MAIN.includes(k)) : CLAVES_MAIN;
    // Cambios de configuración que esta sesión no puede enviar: no se pierden en
    // silencio, se informa que quedaron sin guardar.
    const configNoEnviada = !!opts.sinConfig && Object.keys(diffMain(est.base || {}, local, CLAVES_CONFIG_MAIN)).length > 0;
    const conAviso = (r) => (configNoEnviada && r && r.ok ? { ...r, sinPermisoConfig: true } : r);
    let base = est.base || {};
    let version = est.version || null;
    let patch = diffMain(base, local, claves);
    if (Object.keys(patch).length === 0) { persist.marcarLimpio(id); return conAviso({ ok: true, sinCambios: true }); }
    persist.marcarSucio(id);
    let fusionado = false, conflictos = [];
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await cliente.patchMain(patch, version);
        const nuevaBase = { ...base, ...patch };
        persist.registrarCarga(id, nuevaBase, r.version || null, "object");
        return conAviso({ ok: true, version: r.version, fusionado, conflictos });
      } catch (e) {
        if (e && e.codigo === "conflicto") {
          const fresco = await cliente.leerMain();
          const f = fusionarMain(base, local, fresco.valor || {}, claves);
          if (f.conflictos.length) {
            // Los dos cambiaron lo mismo: no se fusiona ni se escribe. Lo local se
            // conserva (base y versión NO avanzan, así el diff lo sigue llevando).
            pendiente = { version: fresco.version || null, valorServidor: fresco.valor || {},
              conflictos: conflictos.concat(f.conflictos), ts: Date.now() };
            persist.marcarSucio(id);
            return { ...bloqueado(), motivo: "conflicto" };
          }
          conflictos = conflictos.concat(f.conflictos);
          fusionado = true;
          const baseAnterior = base;
          base = fresco.valor || {};
          version = fresco.version || null;
          persist.registrarCarga(id, base, version, "object");
          persist.marcarSucio(id);
          // A la pantalla va SOLO lo que cambió el servidor (base anterior → servidor),
          // nunca la fusión completa: así no se pisa lo que se editó mientras tanto.
          if (alFusionar) { try { alFusionar(base, baseAnterior); } catch (_) {} }
          local = f.valor;
          patch = diffMain(base, local, claves);
          if (Object.keys(patch).length === 0) { persist.marcarLimpio(id); return { ok: true, fusionado, conflictos }; }
          continue;
        }
        if (e && e.codigo === "sin_permiso" && !opts.sinConfig && Object.keys(patch).some((k) => CLAVES_CONFIG_MAIN.includes(k))) {
          // Sin permiso de configuración: se guarda lo demás y se avisa.
          const r2 = await unaVez(local, { ...opts, sinConfig: true });
          return { ...r2, sinPermisoConfig: true };
        }
        return { ok: false, motivo: motivoDe(e), status: e && e.status, codigo: e && e.codigo };
      }
    }
    return { ok: false, motivo: "reintentos_agotados" };
  }

  // Salida (a): trae lo vigente del servidor y DESCARTA lo local.
  // Si falla, el conflicto sigue puesto.
  async function recuperarDelServidor() {
    try {
      const r = await cliente.leerMain();
      const value = (r && r.valor) || {};
      persist.registrarCarga(id, value, (r && r.version) || null, "object");
      pendiente = null;
      return { ok: true, value, version: (r && r.version) || null, existe: true, descartaLocal: true };
    } catch (e) {
      return { ok: false, motivo: motivoDe(e), status: e && e.status, codigo: e && e.codigo };
    }
  }
  // Salida (b): toma la versión VIGENTE como base, así el próximo guardado escribe lo
  // local sobre ella (por PATCH con esa versión). Si el servidor se mueve otra vez en
  // el medio, el PATCH da 409 y el conflicto vuelve a quedar pendiente.
  async function reconciliarConservandoLocal() {
    try {
      const r = await cliente.leerMain();
      const v = (r && r.valor) || {};
      persist.registrarCarga(id, v, (r && r.version) || null, "object");
      persist.marcarSucio(id);
      pendiente = null;
      return { ok: true, desbloqueado: true, version: (r && r.version) || null, valorServidor: v };
    } catch (e) {
      return { ok: false, motivo: motivoDe(e), status: e && e.status, codigo: e && e.codigo };
    }
  }

  // Serializa y coalesce: si llega un guardado nuevo mientras otro espera, solo
  // corre el último (contiene a los anteriores).
  function guardar(local, opts = {}) {
    const mio = ++gen;
    enVuelo++;
    const corrida = cadena.then(async () => {
      // Reemplazado por un guardado posterior: NO es una confirmación (el que sigue
      // informa el resultado real).
      if (mio !== gen) return { ok: true, superseded: true };
      try { return await unaVez(local, opts); }
      catch (e) { return { ok: false, motivo: "red", detalle: String((e && e.message) || e) }; }
    }).finally(() => { enVuelo--; });
    cadena = corrida.catch(() => {});
    return corrida;
  }

  return { guardar, ocupado: () => enVuelo > 0, conflictoPendiente: () => pendiente,
    recuperarDelServidor, reconciliarConservandoLocal,
    // Interfaz que espera crearResolucionConflicto (las dos salidas del panel).
    comoPersist: () => ({ conflictoPendiente: () => pendiente,
      recuperarDelServidor: () => recuperarDelServidor(),
      reconciliarConservandoLocal: () => reconciliarConservandoLocal() }) };
}

// ── Usuarios: diff contra lo último cargado/guardado + PUT con versión ─
export function crearSincroUsuarios({ cliente = servidor } = {}) {
  let base = null;     // JSON saneado de lo último confirmado
  let version = null;
  function registrar(lista, v) { base = JSON.stringify(sanearUsuarios(lista)); version = v == null ? null : v; }
  function cambio(lista) { return base !== null && JSON.stringify(sanearUsuarios(lista)) !== base; }
  async function guardar(lista) {
    if (base === null) return { ok: false, motivo: "sin_carga" };
    const valor = sanearUsuarios(lista);
    const txt = JSON.stringify(valor);
    if (txt === base) return { ok: true, sinCambios: true };
    try {
      const r = await cliente.guardarUsuarios(valor, version);
      base = txt; version = r.version || null;
      return { ok: true, version };
    } catch (e) {
      if (e && e.codigo === "conflicto") return { ok: false, motivo: "conflicto", status: 409 };
      if (e && e.codigo === "sin_permiso") return { ok: false, motivo: "http", status: 403 };
      return { ok: false, motivo: e && e.codigo === "sin_conexion" ? "red" : "http", status: e && e.status };
    }
  }
  return { registrar, cambio, guardar, version: () => version };
}
