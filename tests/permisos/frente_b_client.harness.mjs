/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// FRENTE B — Certificación de INTEGRACIÓN DE CLIENTE (C6, C7, C8-poll, C10, C11-UX,
// C11-AUTHORITY) + REGRESIÓN BEFORE/AFTER del fix PROD-INCIDENT-01 (e1ee4b1), contra
// un PostgREST LOCAL PROD-like (PG16 RLS-off + PostgREST + nginx /rest/v1), usando el
// CÓDIGO REAL del fix — NO funciones puras aisladas ni mocks.
//
// QUÉ ES REAL (importado, ejercido tal cual corre en la app):
//   · crearPersistencia (persistContract.js)      — OCC + confirmación + dirty + cola
//   · crearUsuariosStore (permisosUsuariosStore)  — guardar() + reconciliar() 3-vías
//   · crearAplicadorUsuarios (usuariosGlue.js)    — glue poll/WS→reconciliar→setUsuarios,
//        EXTRAÍDA de App.jsx:2384-2389 y ahora USADA por App.jsx (misma función).
//   · getTabPerm (permisosCore.js)                — lectura efectiva de permiso de pestaña
//   · Transporte: fetch REAL de node contra el PostgREST LOCAL (round-trip timestamptz).
//
// QUÉ SE TRANSCRIBE (fiel, línea-a-línea, citado file:line — NO importado de App.jsx
// porque App.jsx es un componente React de ~3180 L no montable headless):
//   · dbLoadUsuarios      (App.jsx:216-226)  fetch crudo fila dedicada `usuarios`
//   · dbLoad `main`       (App.jsx:121-143)  fetch crudo + persist.registrarCarga
//   · boot-seed usuarios  (App.jsx:2210-2225) load→construirUsuarios→setUsuarios→
//                                            registrarCarga→seed-si-no-existe (1 vez)
//   · Tareas save (dbSave main, guardar())  (App.jsx:145-174, 2749-2758) SIN `usuarios`
//   · save dedicado usuarios (efecto)       (App.jsx:2774-2785) dbSaveUsuarios(ref)
//   · pollTick usuarios (núcleo de pollRow) (guardClient.js:115-148 + App.jsx:2396)
//        GET updated_at+value → onChange(value, upd); onChange = aplicarUsuarios REAL.
//   · WS usuarios (App.jsx:2442-2446) llama al MISMO aplicarUsuarios que el poll.
//
// QUÉ SE SIMULA (etiquetado): el estado React (`usuarios` + setUsuarios + usuariosRef)
//   por un holder mutable; construirUsuarios = identidad (el merge con WORKERS_BASE no
//   es lo que se certifica aquí; el padrón sembrado ya trae los 6 usuarios). El timer
//   del poll y la dedup __selfWrites de pollRow se sustituyen por un tick manual; la
//   llamada que ese tick hace (aplicarUsuarios) es la REAL.
//
// LOCAL/AISLADO. NUNCA PROD/staging. Requiere env FB_URL + FB_KEY (JWT anon local).
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia } from "../../src/persistencia/persistContract.js";
import { crearUsuariosStore, ID_USUARIOS } from "../../src/permisos/permisosUsuariosStore.js";
import { crearAplicadorUsuarios } from "../../src/permisos/usuariosGlue.js";
import { getTabPerm } from "../../src/permisos/permisosCore.js";

const FB_URL = process.env.FB_URL || null;
const FB_KEY = process.env.FB_KEY || null;
if (!FB_URL || !FB_KEY) { console.error("ABORT: faltan FB_URL/FB_KEY (PostgREST local)."); process.exit(2); }
// Tripwire: jamás contra PROD.
if (/bywovqayuzodbzwsriet/.test(FB_URL)) { console.error("ABORT: FB_URL apunta a PROD."); process.exit(2); }

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
let pass = 0, fail = 0; const fallos = [];
const check = (id, desc, cond, nota = "") => {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
};
const H = () => ({ apikey: FB_KEY, Authorization: `Bearer ${FB_KEY}`, "Content-Type": "application/json" });

// Padrón sintético (sin PII): 1 admin + 5 usuarios. Coincide con el MOCK del harness
// hermano stg_perm_3. Ninguno tiene permiso de `finanzas.nominas` al inicio.
const PADRON = () => ([
  { nombre: "Angelo", rol: "admin",   modulos: ["tareas", "finanzas"], tab_permisos: {} },
  { nombre: "Carol",  rol: "usuario", modulos: ["tareas", "finanzas"], tab_permisos: { finanzas: { reporte: "editar" } } },
  { nombre: "Michelle", rol: "usuario", modulos: ["tareas"],           tab_permisos: {} },
  { nombre: "Pablo",  rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
  { nombre: "Marcos", rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
  { nombre: "Raquel", rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
]);
// `main` legacy: contiene `usuarios` (pre-migración) + campos de Tareas.
const MAIN_LEGACY = () => ({ usuarios: PADRON(), estados: { t1: { estadoResp: "verde" } }, tareasConfig: { x: 1 } });

// ── DB helpers (REST directo, para montar estado inicial de forma reproducible) ──
async function resetDb() {
  // borrar todo
  await fetch(`${FB_URL}/rest/v1/calendario_data?id=neq.__none__`, { method: "DELETE", headers: H() });
  // sembrar `main` legacy (string-encoded, como las filas vivas)
  await fetch(`${FB_URL}/rest/v1/calendario_data`, {
    method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "main", value: JSON.stringify(MAIN_LEGACY()), updated_at: new Date().toISOString() }),
  });
}
async function leerFilaCruda(id) {
  const r = await fetch(`${FB_URL}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H() });
  const j = await r.json(); const row = j?.[0];
  if (!row) return { existe: false, value: null, version: null };
  const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  return { existe: true, value, version: row.updated_at };
}
const permDe = (lista, nombre, mod, tab) => (lista || []).find(u => u.nombre === nombre)?.tab_permisos?.[mod]?.[tab];
function setPermList(lista, nombre, mod, tab, nivel) {
  const l = clone(lista); const u = l.find(x => x.nombre === nombre);
  u.tab_permisos = u.tab_permisos || {}; u.tab_permisos[mod] = u.tab_permisos[mod] || {}; u.tab_permisos[mod][tab] = nivel; return l;
}

// ════════════════════════════════════════════════════════════════════════════════
// CLIENTE NUEVO (post-fix). Transcribe fiel el glue de App.jsx sobre persist/store REALES.
// ════════════════════════════════════════════════════════════════════════════════
function crearClienteNuevo(label) {
  const persist = crearPersistencia({ supaUrl: FB_URL, supaKey: FB_KEY, fetch: globalThis.fetch, logger: mudo });
  const store = crearUsuariosStore(persist, { id: ID_USUARIOS });
  // Estado React SIMULADO: holder + setUsuarios + usuariosRef (sincronizados como el
  // efecto usuariosRef.current=usuarios de App.jsx:2719).
  const react = { usuarios: [] };
  const usuariosRef = { current: [] };
  const setUsuarios = (v) => { react.usuarios = clone(v); usuariosRef.current = clone(v); };
  let aviso = null; const setAviso = (a) => { aviso = a; };
  // GLUE REAL extraída de App.jsx (misma función que corre en producción):
  const aplicarUsuarios = crearAplicadorUsuarios({ store, setUsuarios, getUsuariosActual: () => usuariosRef.current, setAviso });

  // dbLoadUsuarios — fiel a App.jsx:216-226 (fetch crudo fila dedicada).
  async function dbLoadUsuarios() {
    const res = await fetch(`${FB_URL}/rest/v1/calendario_data?id=eq.usuarios&select=value,updated_at`, { headers: H() });
    if (!res.ok) throw new Error(`dbLoadUsuarios HTTP ${res.status}`);
    const data = await res.json(); const row = data?.[0];
    const value = row?.value != null ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
    return { existe: !!row, value: Array.isArray(value) ? value : null, version: row?.updated_at || null };
  }
  // dbSaveUsuarios — fiel a App.jsx:228-231 → store.guardar REAL.
  async function dbSaveUsuarios(local) {
    try { return await store.guardar(local); }
    catch (e) { return { ok: false, motivo: "red", detalle: String(e && e.message || e) }; }
  }
  // dbLoad `main` — fiel a App.jsx:121-143 (fetch crudo + persist.registrarCarga).
  async function dbLoadMain() {
    const res = await fetch(`${FB_URL}/rest/v1/calendario_data?id=eq.main&select=value,updated_at`, { headers: H() });
    if (!res.ok) throw new Error(`dbLoad HTTP ${res.status}`);
    const data = await res.json(); const row = data?.[0];
    const value = row?.value != null ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
    persist.registrarCarga("main", value, row?.updated_at || null, typeof row?.value === "string");
    return value;
  }
  // dbSave `main` (Tareas) — fiel a App.jsx:145-174 + guardar() 2749-2758: SIN `usuarios`.
  async function dbSaveMainTareas(patch) {
    try { return await persist.saveConfirmed("main", patch, {}); }
    catch (e) { return { ok: false, motivo: "red", detalle: String(e && e.message || e) }; }
  }

  // BOOT — fiel a App.jsx:2210-2225. construirUsuarios = identidad (SIMULADO; ver cabecera).
  async function boot() {
    const d = await dbLoadMain(); // main (Tareas) — como la carga inicial de App
    const construirUsuarios = (fuente) => clone(fuente); // identidad
    let fuenteUsuarios = d && d.usuarios, filaExiste = false, filaVersion = null;
    const dr = await dbLoadUsuarios();
    filaExiste = dr.existe; filaVersion = dr.version;
    if (Array.isArray(dr.value)) fuenteUsuarios = dr.value;
    if (fuenteUsuarios) {
      const mergedUsuarios = construirUsuarios(fuenteUsuarios);
      setUsuarios(mergedUsuarios);
      store.registrarCarga(mergedUsuarios, filaVersion, false);
      if (!filaExiste) { try { await dbSaveUsuarios(mergedUsuarios); } catch (e) {} } // seed 1 vez
    }
    return { filaExiste };
  }

  // Editar permiso: setUsuarios(next) + save dedicado (efecto App.jsx:2774-2785).
  async function editarPermiso(nombre, mod, tab, nivel) {
    const next = setPermList(usuariosRef.current, nombre, mod, tab, nivel);
    setUsuarios(next);
    return await dbSaveUsuarios(usuariosRef.current);
  }
  // Editar Tareas: save `main` SIN usuarios (App.jsx guardar()).
  async function editarTareas(campo, valor) {
    return await dbSaveMainTareas({ estados: react._estados || { t1: { estadoResp: "verde" } }, tareasConfig: { [campo]: valor } });
  }
  // pollTick usuarios — núcleo de pollRow(guardClient:115-148) + App.jsx:2396: GET fila
  // dedicada `usuarios` (value+updated_at) → aplicarUsuarios REAL (= WS branch 2442-2446).
  async function pollTickUsuarios() {
    const r = await leerFilaCruda(ID_USUARIOS);
    if (r.existe) return aplicarUsuarios(r.value, r.version);
    return null;
  }

  return {
    label, persist, store, boot, editarPermiso, editarTareas, pollTickUsuarios, dbSaveUsuarios,
    getUsuarios: () => clone(react.usuarios), getRef: () => clone(usuariosRef.current),
    getAviso: () => aviso, isDirty: () => persist.isDirty(ID_USUARIOS),
    getVersionUsuarios: () => persist.estado(ID_USUARIOS).version,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// CLIENTE LEGACY / PRE-FIX. Modela el bundle/sesión vieja: `usuarios` viaja DENTRO de
// `main`; el sync entrante NO re-aplica usuarios; el save de Tareas ESCRIBE usuarios.
// (Reproduce la RCA de PROD-INCIDENT-01: pérdida silenciosa de permisos.)
// ════════════════════════════════════════════════════════════════════════════════
function crearClienteLegacy(label) {
  const persist = crearPersistencia({ supaUrl: FB_URL, supaKey: FB_KEY, fetch: globalThis.fetch, logger: mudo });
  const react = { main: null };
  async function dbLoadMain() {
    const res = await fetch(`${FB_URL}/rest/v1/calendario_data?id=eq.main&select=value,updated_at`, { headers: H() });
    const data = await res.json(); const row = data?.[0];
    const value = row?.value != null ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
    persist.registrarCarga("main", value, row?.updated_at || null, typeof row?.value === "string");
    react.main = clone(value);
    return value;
  }
  async function boot() { await dbLoadMain(); }
  // Sync entrante PRE-FIX: reconcileIncoming("main") adelanta version/base pero
  // aplicarCamposMain NO incluye `usuarios` (App.jsx:2361-2371) → usuarios NO se re-aplica.
  async function pollTickMain() {
    const r = await leerFilaCruda("main");
    const dec = persist.reconcileIncoming("main", r.value, r.version);
    if (dec.apply) {
      // aplicarCamposMain: estados/tareasConfig/... PERO NO usuarios (fiel al pre-fix)
      const v = dec.value;
      if (v.estados) react.main = { ...react.main, estados: v.estados };
      if (v.tareasConfig) react.main = { ...react.main, tareasConfig: v.tareasConfig };
      // usuarios: NO se toca → react.main.usuarios queda STALE
    }
    return dec;
  }
  // Save de Tareas PRE-FIX: escribe `main` COMPLETO, incluido `usuarios` (stale).
  async function editarTareasIncluyeUsuarios(campo, valor) {
    const payload = { ...react.main, tareasConfig: { ...(react.main.tareasConfig || {}), [campo]: valor }, usuarios: react.main.usuarios };
    const r = await persist.saveConfirmed("main", payload, {});
    if (r.ok && Array.isArray(r.value?.usuarios)) react.main = clone(r.value);
    return r;
  }
  // Otorgar permiso a la vieja usanza: escribir main con usuarios+grant.
  async function otorgarPermisoEnMain(nombre, mod, tab, nivel) {
    const nu = setPermList(react.main.usuarios, nombre, mod, tab, nivel);
    const payload = { ...react.main, usuarios: nu };
    const r = await persist.saveConfirmed("main", payload, {});
    if (r.ok) react.main = clone(r.value);
    return r;
  }
  return { label, persist, boot, pollTickMain, editarTareasIncluyeUsuarios, otorgarPermisoEnMain,
    getMainUsuarios: () => clone(react.main?.usuarios), getMain: () => clone(react.main) };
}

console.log(`\n── FRENTE B · CLIENT-INTEGRATION · PostgREST LOCAL (${FB_URL}) ──`);

// ════════════════════════════════════════════════════════════════════════════════
// C6 — bundle/sesión antigua conviviendo con cliente nuevo.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  // B = cliente NUEVO: boot → siembra fila dedicada `usuarios` desde main (1 vez).
  const B = crearClienteNuevo("B-nuevo");
  const b1 = await B.boot();
  const filaTrasSeed = await leerFilaCruda(ID_USUARIOS);
  // B otorga Nóminas a Michelle en la fila DEDICADA.
  const rGrant = await B.editarPermiso("Michelle", "finanzas", "nominas", "editar");
  const filaTrasGrant = await leerFilaCruda(ID_USUARIOS);

  // A = cliente LEGACY: escribe main.usuarios (stale, SIN el grant) — simula sesión vieja.
  const A = crearClienteLegacy("A-legacy");
  await A.boot(); // su react.main.usuarios NO tiene el grant (cargó antes)
  const rLegacy = await A.editarTareasIncluyeUsuarios("k", 1); // legacy pisa main.usuarios
  const mainTrasLegacy = await leerFilaCruda("main");
  const dedicadaTrasLegacy = await leerFilaCruda(ID_USUARIOS);

  // B recarga (nuevo boot): fuente de verdad = fila dedicada.
  const B2 = crearClienteNuevo("B2-reload");
  const b2 = await B2.boot();
  const permB2 = permDe(B2.getUsuarios(), "Michelle", "finanzas", "nominas");

  // Segundo cliente nuevo booteando con fila dedicada EXISTENTE → NO re-siembra.
  const dedicadaAntesC = await leerFilaCruda(ID_USUARIOS);
  const C = crearClienteNuevo("C-nuevo");
  const c = await C.boot();
  const dedicadaDespuesC = await leerFilaCruda(ID_USUARIOS);

  check("C6.seed-1vez", "boot nuevo siembra fila dedicada `usuarios` (no existía)",
    b1.filaExiste === false && filaTrasSeed.existe === true && Array.isArray(filaTrasSeed.value),
    `filaExiste=${b1.filaExiste} sembrada=${filaTrasSeed.existe}`);
  check("C6.grant-dedicada", "B otorga Nóminas → queda en la fila dedicada",
    rGrant.ok === true && permDe(filaTrasGrant.value, "Michelle", "finanzas", "nominas") === "editar",
    `ok=${rGrant.ok} perm=${permDe(filaTrasGrant.value, "Michelle", "finanzas", "nominas")}`);
  check("C6.legacy-no-toca-dedicada", "write legacy a main.usuarios NO altera la fila dedicada",
    rLegacy.ok === true &&
    permDe(mainTrasLegacy.value.usuarios, "Michelle", "finanzas", "nominas") === undefined &&   // main quedó stale (sin grant)
    permDe(dedicadaTrasLegacy.value, "Michelle", "finanzas", "nominas") === "editar",             // dedicada intacta
    `mainPerm=${permDe(mainTrasLegacy.value.usuarios, "Michelle", "finanzas", "nominas")} dedicadaPerm=${permDe(dedicadaTrasLegacy.value, "Michelle", "finanzas", "nominas")}`);
  check("C6.reload-ve-perm", "B recarga y sigue viendo el permiso (fuente = fila dedicada)",
    permB2 === "editar", `permB2=${permB2}`);
  check("C6.nuevo-no-repromueve-main", "cliente nuevo NUNCA re-promueve main.usuarios (no re-siembra si ya existe)",
    b2.filaExiste === true && c.filaExiste === true &&
    JSON.stringify(dedicadaAntesC.value) === JSON.stringify(dedicadaDespuesC.value),
    `b2.filaExiste=${b2.filaExiste} c.filaExiste=${c.filaExiste} dedicadaIgual=${JSON.stringify(dedicadaAntesC.value) === JSON.stringify(dedicadaDespuesC.value)}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// C7 — Tareas desacopladas de permisos (cliente nuevo completo).
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteNuevo("A"); await A.boot();        // siembra dedicada
  const B = crearClienteNuevo("B"); await B.boot();
  const rPerm = await A.editarPermiso("Pablo", "finanzas", "reporte", "editar"); // A → usuarios
  const rTar  = await B.editarTareas("cfg", 42);                                  // B → main (Tareas)
  const dedicada = await leerFilaCruda(ID_USUARIOS);
  const main = await leerFilaCruda("main");
  // recarga
  const R = crearClienteNuevo("R"); await R.boot();
  check("C7", "A permisos ∥ B Tareas → ambos sobreviven, sin conflicto espurio ni perm viejo re-introducido",
    rPerm.ok === true && rTar.ok === true &&
    permDe(dedicada.value, "Pablo", "finanzas", "reporte") === "editar" &&
    main.value.tareasConfig?.cfg === 42 &&
    main.value.usuarios === undefined &&                                  // main NO recupera usuarios
    permDe(R.getUsuarios(), "Pablo", "finanzas", "reporte") === "editar",
    `rPerm=${rPerm.ok} rTar=${rTar.ok} perm=${permDe(dedicada.value, "Pablo", "finanzas", "reporte")} tar=${main.value.tareasConfig?.cfg} mainUsuarios=${main.value.usuarios}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// C8 — POLL (reproducible). Cadena: NEW PERM(A) → poll(B) → Tareas save(B) → reload → perm.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteNuevo("A"); await A.boot();
  const B = crearClienteNuevo("B"); await B.boot();     // B abierto, versión usuarios = seed
  const vAntes = B.getVersionUsuarios();
  const rGrant = await A.editarPermiso("Michelle", "finanzas", "nominas", "editar"); // A otorga
  // B sigue con estado viejo (no ha reconciliado):
  const permBpre = permDe(B.getUsuarios(), "Michelle", "finanzas", "nominas");
  // POLL en B → reconciliar → setUsuarios + versión alineada (GLUE REAL):
  const dec = await B.pollTickUsuarios();
  const permBpost = permDe(B.getUsuarios(), "Michelle", "finanzas", "nominas");
  const vDespues = B.getVersionUsuarios();
  // B guarda Tareas (main) — NO debe restaurar permisos viejos:
  const rTar = await B.editarTareas("cfg", 7);
  // reload A y B:
  const RA = crearClienteNuevo("RA"); await RA.boot();
  const RB = crearClienteNuevo("RB"); await RB.boot();
  const mainFin = await leerFilaCruda("main");
  check("C8.poll", "A otorga → poll B reconcilia → Tareas save B no restaura → reload conserva perm",
    permBpre === undefined && dec.apply === true && permBpost === "editar" &&
    vDespues === rGrant.version && rTar.ok === true &&
    permDe(RA.getUsuarios(), "Michelle", "finanzas", "nominas") === "editar" &&
    permDe(RB.getUsuarios(), "Michelle", "finanzas", "nominas") === "editar" &&
    mainFin.value.usuarios === undefined,
    `pre=${permBpre} apply=${dec.apply} post=${permBpost} vAlineada=${vDespues === rGrant.version} rTar=${rTar.ok} RA=${permDe(RA.getUsuarios(), "Michelle", "finanzas", "nominas")} RB=${permDe(RB.getUsuarios(), "Michelle", "finanzas", "nominas")}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// C10 — reload/login: cambio → ACK → recrear cliente (=reload) → persiste; SoT = dedicada.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteNuevo("A"); await A.boot();
  const rGrant = await A.editarPermiso("Pablo", "finanzas", "nominas", "editar");
  // ACK autoritativo = el server confirmó una versión (rGrant.ok + version).
  const ack = rGrant.ok === true && !!rGrant.version;
  // reload 1
  const R1 = crearClienteNuevo("R1"); const b1 = await R1.boot();
  const perm1 = permDe(R1.getUsuarios(), "Pablo", "finanzas", "nominas");
  // main.usuarios NO es SoT (sigue stale, sin el grant):
  const main = await leerFilaCruda("main");
  const mainStale = permDe(main.value.usuarios, "Pablo", "finanzas", "nominas") === undefined;
  // reload 2 con fila dedicada existente → seed idempotente (no re-siembra):
  const dedAntes = await leerFilaCruda(ID_USUARIOS);
  const R2 = crearClienteNuevo("R2"); const b2 = await R2.boot();
  const dedDespues = await leerFilaCruda(ID_USUARIOS);
  check("C10", "cambio→ACK→reload conserva; SoT=fila dedicada; 2º reload = seed idempotente",
    ack && perm1 === "editar" && b1.filaExiste === true && mainStale &&
    b2.filaExiste === true && JSON.stringify(dedAntes.value) === JSON.stringify(dedDespues.value),
    `ack=${ack} perm1=${perm1} mainStale=${mainStale} idempotente=${JSON.stringify(dedAntes.value) === JSON.stringify(dedDespues.value)}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// C11-UX — getTabPerm gobierna visibilidad/acceso; DENY↔ALLOW tras rehidratar/reload.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteNuevo("A"); await A.boot();
  const B = crearClienteNuevo("B"); await B.boot();
  const uMichelle = (cli) => cli.getUsuarios().find(u => u.nombre === "Michelle");
  // Estado inicial: Michelle no tiene finanzas.nominas → getTabPerm = editar por defecto
  // (nominas no está en sus tab_permisos.finanzas). Para DENY explícito, otorgamos sin_acceso.
  await A.editarPermiso("Michelle", "finanzas", "nominas", "sin_acceso"); // DENY explícito
  await B.pollTickUsuarios(); // B rehidrata
  const denyB = getTabPerm(uMichelle(B), "finanzas", "nominas");
  // flip DENY→ALLOW
  await A.editarPermiso("Michelle", "finanzas", "nominas", "editar");
  await B.pollTickUsuarios();
  const allowB = getTabPerm(uMichelle(B), "finanzas", "nominas");
  // reload independiente ve el ALLOW desde la fila dedicada (no main):
  const R = crearClienteNuevo("R"); await R.boot();
  const allowR = getTabPerm(uMichelle(R), "finanzas", "nominas");
  // admin siempre editar; getTabPerm de un no-autorizado real:
  const admin = A.getUsuarios().find(u => u.nombre === "Angelo");
  const adminPerm = getTabPerm(admin, "finanzas", "nominas");
  check("C11-UX", "getTabPerm: DENY(sin_acceso)↔ALLOW(editar) reflejado tras poll/reload; admin=editar",
    denyB === "sin_acceso" && allowB === "editar" && allowR === "editar" && adminPerm === "editar",
    `denyB=${denyB} allowB=${allowB} allowR=${allowR} admin=${adminPerm}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// C11-AUTHORITY — ¿hay enforcement server-side por-pestaña para Nóminas HOY? (honesto)
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteNuevo("A"); await A.boot();
  await A.editarPermiso("Michelle", "finanzas", "nominas", "sin_acceso"); // "denegado" en UI
  // Prueba de autoridad: ¿la clave anon (sin per-tab authz / RLS) puede LEER los datos
  // sensibles igual? Leemos la fila `finanzas` directamente con el MISMO JWT anon.
  await fetch(`${FB_URL}/rest/v1/calendario_data`, { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "finanzas", value: JSON.stringify({ nominas: [{ secreto: "sueldos" }] }), updated_at: new Date().toISOString() }) });
  const rLeak = await fetch(`${FB_URL}/rest/v1/calendario_data?id=eq.finanzas&select=value`, { headers: H() });
  const leak = await rLeak.json();
  const leakOk = rLeak.ok && leak?.[0]?.value != null; // el anon LEE los datos → sin autoridad server-side
  // NO cuenta en el tally PASS/FAIL: C11-AUTHORITY = NO PASS por definición (no hay
  // authz server-side). Se imprime como clasificación de deuda GRUPO/PROD.
  console.log(`● C11-AUTHORITY  NO PASS (deuda GRUPO/PROD) — el JWT anon LEE la fila \`finanzas\`/Nóminas pese al DENY de UI (anonPuedeLeer=${leakOk}). El ocultamiento en frontend ≠ seguridad. RLS/authz por-pestaña en calendario_data = P0 de grupo pendiente.`);
}

// ════════════════════════════════════════════════════════════════════════════════
// REGRESIÓN BEFORE (PRE-FIX) — la RCA DEBE reproducirse: pérdida silenciosa de permiso.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
let beforeLoss = false, beforeSilent = false;
{
  // Dos sesiones LEGACY sobre `main` (usuarios dentro de main).
  const A = crearClienteLegacy("A"); await A.boot();
  const B = crearClienteLegacy("B"); await B.boot();  // B abre con usuarios STALE (sin grant)
  // A otorga Nóminas a Michelle (a la vieja usanza: escribe main.usuarios+grant).
  const rGrant = await A.otorgarPermisoEnMain("Michelle", "finanzas", "nominas", "editar");
  const mainConGrant = await leerFilaCruda("main");
  const grantEnServer = permDe(mainConGrant.value.usuarios, "Michelle", "finanzas", "nominas");
  // B recibe el sync entrante PRE-FIX: reconcileIncoming adelanta version/base de `main`
  // pero NO re-aplica usuarios → react.main.usuarios de B sigue STALE.
  const decPoll = await B.pollTickMain();
  const permBstale = permDe(B.getMainUsuarios(), "Michelle", "finanzas", "nominas");
  // B edita Tareas → autosave escribe main COMPLETO con usuarios STALE (sin grant).
  const rTarB = await B.editarTareasIncluyeUsuarios("k", 99);
  const mainFin = await leerFilaCruda("main");
  const permFin = permDe(mainFin.value.usuarios, "Michelle", "finanzas", "nominas");
  beforeLoss = (grantEnServer === "editar" && permFin === undefined); // el grant se PERDIÓ
  beforeSilent = (rTarB.ok === true && !rTarB.fusionado && !rTarB.motivo); // sin error/conflicto/aviso
  check("REGRESSION-BEFORE", "PRE-FIX: grant Nóminas + poll + Tareas autosave → PÉRDIDA SILENCIOSA (reproduce RCA)",
    beforeLoss && beforeSilent && decPoll.apply === true && permBstale === undefined,
    `grantServer=${grantEnServer} permFinal=${permFin} loss=${beforeLoss} silent=${beforeSilent} pollApply=${decPoll.apply} permBstale=${permBstale}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// REGRESIÓN AFTER (POST-FIX) — MISMO escenario con el fix: grant preservado, 0 pérdida.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
let afterLoss = null, afterFalseSave = false, afterSpuriousConflict = false;
{
  const A = crearClienteNuevo("A"); await A.boot();   // siembra dedicada
  const B = crearClienteNuevo("B"); await B.boot();
  const rGrant = await A.editarPermiso("Michelle", "finanzas", "nominas", "editar"); // dedicada
  await B.pollTickUsuarios();                          // B reconcilia (glue REAL)
  const rTarB = await B.editarTareas("k", 99);         // Tareas save NO toca usuarios
  const dedFin = await leerFilaCruda(ID_USUARIOS);
  const mainFin = await leerFilaCruda("main");
  const RA = crearClienteNuevo("RA"); await RA.boot();
  const permFin = permDe(dedFin.value, "Michelle", "finanzas", "nominas");
  afterLoss = (rGrant.version && permFin !== "editar"); // ¿se perdió? debe ser false
  afterFalseSave = (rTarB && rTarB.ok === false);        // Tareas NO debió fallar
  afterSpuriousConflict = !!B.getAviso();                // no debe haber aviso de conflicto espurio
  check("REGRESSION-AFTER", "POST-FIX: grant preservado, Tareas preservadas, 0 pérdida, sin false-save ni conflicto espurio",
    permFin === "editar" && rTarB.ok === true && mainFin.value.tareasConfig?.k === 99 && mainFin.value.usuarios === undefined &&
    afterLoss === false && !afterFalseSave && !afterSpuriousConflict &&
    permDe(RA.getUsuarios(), "Michelle", "finanzas", "nominas") === "editar",
    `permFin=${permFin} rTar=${rTarB.ok} tareasK=${mainFin.value.tareasConfig?.k} mainUsuarios=${mainFin.value.usuarios} loss=${afterLoss} falseSave=${afterFalseSave} conflicto=${afterSpuriousConflict}`);
}

// ── DATA LOSS / false-save / silent-conflict = 0 (agregado) ─────────────────────
check("INVARIANTES", "DATA LOSS=0 (post-fix), false-saved=0, silent-conflict=0",
  afterLoss === false && afterFalseSave === false && afterSpuriousConflict === false,
  `afterLoss=${afterLoss} falseSave=${afterFalseSave} conflicto=${afterSpuriousConflict}`);

console.log(`\n── RESUMEN FRENTE B: PASS=${pass} FAIL=${fail} ${fail ? ("FALLOS: " + fallos.join(",")) : ""} ──`);
console.log(`   (+ C11-AUTHORITY = NO PASS por diseño, fuera del tally: deuda GRUPO/PROD documentada arriba)`);
process.exit(fail ? 1 : 0);
