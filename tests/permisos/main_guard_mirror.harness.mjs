/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// MAIN-GUARD-MIRROR — certificación del fix "Option App" (espejo main.usuarios
// WRITE-ONLY) contra un PostgREST LOCAL con los DOS triggers PROD instalados
// (trg_cd_scrub_main + trg_guard_main_no_user_shrink). Usa el CÓDIGO REAL del fix
// (persistContract + permisosUsuariosStore + usuariosGlue), no funciones puras.
//
// RCA (verificada en PROD): tras el hotfix que sacó `usuarios` del blob `main`, cada
// save de Tareas hace UPDATE de `main` SIN `usuarios`. El trigger BEFORE-UPDATE
// `guard_main_no_user_shrink` exige que todo email presente en OLD.main.usuarios siga
// en NEW.main.usuarios; si falta → RAISE errcode=check_violation → SQLSTATE 23514 →
// PostgREST HTTP 400. Resultado: Tareas no persiste NUNCA en PROD.
//
// FIX: reincluir `usuarios` en el payload de `main` como ESPEJO WRITE-ONLY, tomado
// del roster reconciliado autoritativo (usuariosRef.current), sin releer main.usuarios
// ni copias rancias. La fila dedicada `usuarios` sigue siendo la ÚNICA fuente de
// verdad (lecturas por dbLoadUsuarios, escrituras por dbSaveUsuarios/store).
//
// Env: MG_URL (http://127.0.0.1:PORT servible en /rest/v1) + MG_KEY (JWT anon HS256
// local). Tripwire: jamás PROD. Sin env → ABORT(2).
//   node tests/permisos/main_guard_mirror.harness.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia } from "../../src/persistencia/persistContract.js";
import { crearUsuariosStore, ID_USUARIOS } from "../../src/permisos/permisosUsuariosStore.js";
import { crearAplicadorUsuarios } from "../../src/permisos/usuariosGlue.js";
import { getTabPerm } from "../../src/permisos/permisosCore.js";

const URL = process.env.MG_URL || null;
const KEY = process.env.MG_KEY || null;
if (!URL || !KEY) { console.error("ABORT: faltan MG_URL/MG_KEY (PostgREST local con triggers)."); process.exit(2); }
if (/bywovqayuzodbzwsriet/.test(URL)) { console.error("ABORT: MG_URL apunta a PROD."); process.exit(2); }

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
let pass = 0, fail = 0; const fallos = [];
const check = (id, desc, cond, nota = "") => {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
};
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

// Padrón sintético (con EMAIL — el guard PROD llavea por email). 1 admin + 5 usuarios.
const PADRON = () => ([
  { nombre: "Angelo",   email: "angelo@mediterra.cl",   rol: "admin",   modulos: ["tareas", "finanzas"], tab_permisos: {}, pin: "1111" },
  { nombre: "Carol",    email: "carol@mediterra.cl",    rol: "usuario", modulos: ["tareas", "finanzas"], tab_permisos: { finanzas: { reporte: "editar" } }, pin: "2222" },
  { nombre: "Michelle", email: "michelle@mediterra.cl", rol: "usuario", modulos: ["tareas"],             tab_permisos: {}, pin: "3333" },
  { nombre: "Pablo",    email: "pablo@mediterra.cl",    rol: "usuario", modulos: ["tareas"],             tab_permisos: {}, pin: "4444" },
  { nombre: "Marcos",   email: "marcos@mediterra.cl",   rol: "usuario", modulos: ["tareas"],             tab_permisos: {}, pin: "5555" },
  { nombre: "Raquel",   email: "raquel@mediterra.cl",   rol: "usuario", modulos: ["tareas"],             tab_permisos: {}, pin: "6666" },
]);
// `main` legacy PRE-hotfix: OBJECT-encoded (como PROD), con usuarios (emails) + Tareas
// + pinsPersonalizados (que el scrub debe eliminar).
const MAIN_LEGACY = () => ({
  usuarios: PADRON(),
  estados: { t1: { estadoResp: "verde" } },
  tareasConfig: { x: 1 },
  pinsPersonalizados: { Angelo_h: "hashsecreto" },
});
const emailsDe = (lista) => (lista || []).map(u => String(u.email || "").toLowerCase()).filter(Boolean).sort();
const permDe = (lista, nombre, mod, tab) => (lista || []).find(u => u.nombre === nombre)?.tab_permisos?.[mod]?.[tab];
function setPermList(lista, nombre, mod, tab, nivel) {
  const l = clone(lista); const u = l.find(x => x.nombre === nombre);
  u.tab_permisos = u.tab_permisos || {}; u.tab_permisos[mod] = u.tab_permisos[mod] || {}; u.tab_permisos[mod][tab] = nivel; return l;
}

async function leerFilaCruda(id) {
  const r = await fetch(`${URL}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H() });
  const j = await r.json(); const row = j?.[0];
  if (!row) return { existe: false, value: null, version: null };
  const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  return { existe: true, value, version: row.updated_at };
}
async function resetDb() {
  await fetch(`${URL}/rest/v1/calendario_data?id=neq.__none__`, { method: "DELETE", headers: H() });
  // `main` OBJECT-encoded (como PROD: única fila objeto). value = objeto jsonb literal.
  await fetch(`${URL}/rest/v1/calendario_data`, {
    method: "POST", headers: { ...H(), Prefer: "return=minimal" },
    body: JSON.stringify({ id: "main", value: MAIN_LEGACY(), updated_at: new Date().toISOString() }),
  });
  // fila dedicada `pins` (SoT de PINs) — string-encoded.
  await fetch(`${URL}/rest/v1/calendario_data`, {
    method: "POST", headers: { ...H(), Prefer: "return=minimal" },
    body: JSON.stringify({ id: "pins", value: JSON.stringify({ Angelo_h: "hashsecreto" }), updated_at: new Date().toISOString() }),
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// CLIENTE POST-FIX. Transcribe fiel App.jsx: `main` object-encoded; el save de Tareas
// (dbSave→persist.saveConfirmed("main")) INCLUYE `usuarios: usuariosRef.current` como
// ESPEJO WRITE-ONLY; los permisos SIEMPRE leen/escriben la fila dedicada `usuarios`.
// ════════════════════════════════════════════════════════════════════════════════
function crearClienteApp(label) {
  const persist = crearPersistencia({ supaUrl: URL, supaKey: KEY, fetch: globalThis.fetch, logger: mudo });
  const store = crearUsuariosStore(persist, { id: ID_USUARIOS });
  const react = { usuarios: [], estados: null, tareasConfig: null };
  const usuariosRef = { current: [] };
  const setUsuarios = (v) => { react.usuarios = clone(v); usuariosRef.current = clone(v); };
  let aviso = null; const setAviso = (a) => { aviso = a; };
  const aplicarUsuarios = crearAplicadorUsuarios({ store, setUsuarios, getUsuariosActual: () => usuariosRef.current, setAviso });

  async function dbLoadUsuarios() {
    const res = await fetch(`${URL}/rest/v1/calendario_data?id=eq.usuarios&select=value,updated_at`, { headers: H() });
    if (!res.ok) throw new Error(`dbLoadUsuarios HTTP ${res.status}`);
    const data = await res.json(); const row = data?.[0];
    const value = row?.value != null ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
    return { existe: !!row, value: Array.isArray(value) ? value : null, version: row?.updated_at || null };
  }
  async function dbSaveUsuarios(local) {
    try { return await store.guardar(local); }
    catch (e) { return { ok: false, motivo: "red", detalle: String(e && e.message || e) }; }
  }
  // dbLoad `main` — fiel a App.jsx:122-143 (fetch crudo + persist.registrarCarga). El
  // 4º arg `typeof value === "string"` da false para objeto → encoding DESCONOCIDO →
  // detección perezosa lo fija 'object' en el primer write (como PROD).
  async function dbLoadMain() {
    const res = await fetch(`${URL}/rest/v1/calendario_data?id=eq.main&select=value,updated_at`, { headers: H() });
    if (!res.ok) throw new Error(`dbLoad HTTP ${res.status}`);
    const data = await res.json(); const row = data?.[0];
    const value = row?.value != null ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
    persist.registrarCarga("main", value, row?.updated_at || null, typeof row?.value === "string");
    react.estados = value?.estados || null; react.tareasConfig = value?.tareasConfig || null;
    return value;
  }
  // dbSave `main` (Tareas) — POST-FIX: payload INCLUYE `usuarios: usuariosRef.current`
  // (ESPEJO WRITE-ONLY). Fiel a App.jsx guardar() (2777-2778).
  async function saveTareas(campo, valor) {
    react.tareasConfig = { ...(react.tareasConfig || {}), [campo]: valor };
    const payload = {
      estados: react.estados || { t1: { estadoResp: "verde" } },
      comentarios: {}, tareasConfig: react.tareasConfig, supervisores: {}, tareasExtra: {},
      recsDone: {}, recsComentarios: {},
      usuarios: usuariosRef.current,   // ← ESPEJO WRITE-ONLY (el fix)
      mes: 0, anio: 2026,
    };
    try { return await persist.saveConfirmed("main", payload, {}); }
    catch (e) { return { ok: false, motivo: "red", detalle: String(e && e.message || e) }; }
  }
  // BOOT — fiel a App.jsx:2211-2226. construirUsuarios = identidad (el padrón ya trae 6).
  async function boot() {
    const d = await dbLoadMain();
    let fuenteUsuarios = d && d.usuarios, filaExiste = false, filaVersion = null;
    const dr = await dbLoadUsuarios();
    filaExiste = dr.existe; filaVersion = dr.version;
    if (Array.isArray(dr.value)) fuenteUsuarios = dr.value;
    if (fuenteUsuarios) {
      const merged = clone(fuenteUsuarios);
      setUsuarios(merged);
      store.registrarCarga(merged, filaVersion, false);
      if (!filaExiste) { try { await dbSaveUsuarios(merged); } catch (e) {} }
    }
    return { filaExiste };
  }
  async function editarPermiso(nombre, mod, tab, nivel) {
    const next = setPermList(usuariosRef.current, nombre, mod, tab, nivel);
    setUsuarios(next);
    return await dbSaveUsuarios(usuariosRef.current);
  }
  async function pollTickUsuarios() {
    const r = await leerFilaCruda(ID_USUARIOS);
    if (r.existe) return aplicarUsuarios(r.value, r.version);
    return null;
  }
  return {
    label, persist, store, boot, saveTareas, editarPermiso, pollTickUsuarios, dbSaveUsuarios,
    getUsuarios: () => clone(react.usuarios), getRef: () => clone(usuariosRef.current),
    getAviso: () => aviso, getVersionUsuarios: () => persist.estado(ID_USUARIOS).version,
    getVersionMain: () => persist.estado("main").version,
  };
}

console.log(`\n── MAIN-GUARD-MIRROR · PostgREST LOCAL con triggers (${URL}) ──`);

// ════════════════════════════════════════════════════════════════════════════════
// BEFORE — save de Tareas SIN `usuarios` (comportamiento del hotfix) → 400/23514.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
let beforeStatus = null, beforeCode = null;
{
  const A = crearClienteApp("BEFORE"); await A.boot();
  const verAntes = A.getVersionMain();
  // PATCH condicionado SIN usuarios, por el MISMO persistContract (ruta hotfix).
  const r = await A.persist.saveConfirmed("main", { estados: A.getUsuarios() ? { t1: { estadoResp: "rojo" } } : {}, tareasConfig: { x: 2 } }, {});
  const row = await leerFilaCruda("main");
  // Comprobación directa del status/errcode con un PATCH crudo (evidencia HTTP).
  const raw = await fetch(`${URL}/rest/v1/calendario_data?id=eq.main&updated_at=eq.${encodeURIComponent(verAntes)}`, {
    method: "PATCH", headers: { ...H(), Prefer: "return=representation" },
    body: JSON.stringify({ value: { estados: { t1: { estadoResp: "rojo" } }, tareasConfig: { x: 3 } }, updated_at: new Date().toISOString() }),
  });
  beforeStatus = raw.status; const bodyTxt = await raw.text();
  try { beforeCode = JSON.parse(bodyTxt).code; } catch { beforeCode = null; }
  check("BEFORE.saveConfirmed", "save de Tareas SIN usuarios NO persiste (ok:false via contrato)",
    r.ok === false && r.motivo === "http" && r.status === 400, `ok=${r.ok} motivo=${r.motivo} status=${r.status}`);
  check("BEFORE.http400-23514", "PATCH crudo sin usuarios → HTTP 400 + SQLSTATE 23514 + ROSTER_ANTISHRINK",
    beforeStatus === 400 && beforeCode === "23514" && /ROSTER_ANTISHRINK/.test(bodyTxt), `status=${beforeStatus} code=${beforeCode} body=${bodyTxt.slice(0,90)}`);
  check("BEFORE.fila-intacta", "la fila `main` NO cambió (sin false-save)",
    row.value.tareasConfig?.x === 1, `x=${row.value.tareasConfig?.x}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// AFTER — save de Tareas CON espejo usuarios (todos los emails) → 200; persiste.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteApp("AFTER"); await A.boot();
  const r = await A.saveTareas("cfg", 42);
  const row = await leerFilaCruda("main");
  const ded = await leerFilaCruda(ID_USUARIOS);
  check("AFTER.persiste", "save de Tareas con espejo → ok:true (persiste)", r.ok === true, `ok=${r.ok} motivo=${r.motivo} status=${r.status}`);
  check("AFTER.tareas", "campo de Tareas persistido tras recarga", row.value.tareasConfig?.cfg === 42, `cfg=${row.value.tareasConfig?.cfg}`);
  check("AFTER.mirror-emails", "espejo main.usuarios contiene TODOS los emails del roster",
    JSON.stringify(emailsDe(row.value.usuarios)) === JSON.stringify(emailsDe(PADRON())), `mirror=${emailsDe(row.value.usuarios).join(",")}`);
  check("AFTER.scrub-pin", "el scrub eliminó `pin` de cada usuario del espejo",
    (row.value.usuarios || []).every(u => u.pin === undefined), "");
  check("AFTER.scrub-pinsPersonalizados", "el scrub eliminó `pinsPersonalizados` de main (no reintroducido)",
    row.value.pinsPersonalizados === undefined, "");
  check("AFTER.object-encoded", "main sigue object-encoded (no se flipeó a string)",
    typeof (await (await fetch(`${URL}/rest/v1/calendario_data?id=eq.main&select=value`, { headers: H() })).json())[0].value === "object", "");
  check("AFTER.dedicada-SoT", "la fila dedicada `usuarios` existe y es el roster (SoT)",
    ded.existe && Array.isArray(ded.value) && ded.value.length === 6, `len=${ded.value?.length}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// CONCURRENCY — A carga vN; B otorga permiso → dedicada vN+1; A guarda Tareas con su
// espejo (roster vN, más viejo). Debe: (a) main 200; (b) grant vN+1 sobrevive en la
// dedicada; (c) leer permisos por la fila dedicada devuelve vN+1; (d) 0 clobber.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
let concClobber = null;
{
  const A = crearClienteApp("A"); await A.boot();  // A carga usuarios vN (seed)
  const B = crearClienteApp("B"); await B.boot();
  const dedAntes = await leerFilaCruda(ID_USUARIOS);
  // B otorga Nóminas a Michelle → escribe la fila DEDICADA (vN+1). Emails SIN cambio.
  const rGrant = await B.editarPermiso("Michelle", "finanzas", "nominas", "editar");
  const dedTrasGrant = await leerFilaCruda(ID_USUARIOS);
  // A (con su usuariosRef.current viejo, sin el grant) guarda Tareas → UPDATE main con
  // espejo del roster vN (emails completos, pero SIN el grant de Michelle).
  const refAemails = emailsDe(A.getRef());
  const rTarA = await A.saveTareas("cfg", 7);
  const mainFin = await leerFilaCruda("main");
  const dedFin = await leerFilaCruda(ID_USUARIOS);
  // Leer permisos por la RUTA AUTORITATIVA (fila dedicada), como hace la app:
  const permViaDedicada = permDe(dedFin.value, "Michelle", "finanzas", "nominas");
  // Lo que quedó en el ESPEJO (stale, no autoridad): NO tiene el grant.
  const permEnEspejo = permDe(mainFin.value.usuarios, "Michelle", "finanzas", "nominas");
  concClobber = (rGrant.ok === true && permViaDedicada !== "editar"); // debe ser false

  check("CONC.a-main200", "(a) A guarda Tareas → main UPDATE = 200 (persiste pese al espejo viejo)",
    rTarA.ok === true && mainFin.value.tareasConfig?.cfg === 7, `ok=${rTarA.ok} status=${rTarA.status} cfg=${mainFin.value.tareasConfig?.cfg}`);
  check("CONC.b-grant-sobrevive", "(b) el grant vN+1 SIGUE en la fila dedicada (A no la tocó)",
    permViaDedicada === "editar", `permDedicada=${permViaDedicada}`);
  check("CONC.c-dedicada-autoridad", "(c) leer permisos por la fila dedicada devuelve vN+1; el espejo es stale (no autoridad)",
    permViaDedicada === "editar" && permEnEspejo === undefined &&
    dedFin.version === dedTrasGrant.version && dedFin.version !== dedAntes.version,
    `dedicada=${permViaDedicada} espejo=${permEnEspejo} vGrant=${dedFin.version === dedTrasGrant.version}`);
  check("CONC.d-no-clobber", "(d) 0 clobber silencioso: el grant nunca se perdió",
    concClobber === false && rGrant.ok === true, `clobber=${concClobber}`);
  check("CONC.espejo-emails", "el espejo de A preservó TODOS los emails (por eso pasó el guard)",
    JSON.stringify(refAemails) === JSON.stringify(emailsDe(PADRON())) &&
    JSON.stringify(emailsDe(mainFin.value.usuarios)) === JSON.stringify(emailsDe(PADRON())), `refA=${refAemails.length}`);
}

// ════════════════════════════════════════════════════════════════════════════════
// INVARIANTES adicionales — roster/admin/pins/OCC/reconciliación por glue.
// ════════════════════════════════════════════════════════════════════════════════
await resetDb();
{
  const A = crearClienteApp("A"); await A.boot();
  const B = crearClienteApp("B"); await B.boot();
  // reconciliación entrante por el GLUE real: A otorga, B hace poll → ve el grant.
  const vB0 = B.getVersionUsuarios();
  await A.editarPermiso("Pablo", "finanzas", "nominas", "editar");
  // Se lee el tab_permisos CRUDO (permDe): getTabPerm devuelve "editar" por DEFECTO
  // cuando no hay entrada explícita, así que no distinguiría el grant. permDe observa
  // la aparición real de la clave tras la reconciliación por glue.
  const permBpre = permDe(B.getUsuarios(), "Pablo", "finanzas", "nominas");
  const dec = await B.pollTickUsuarios();
  const permBpost = permDe(B.getUsuarios(), "Pablo", "finanzas", "nominas");
  // B guarda Tareas → NO restaura permisos viejos (espejo write-only).
  const rTarB = await B.saveTareas("k", 5);
  const dedFin = await leerFilaCruda(ID_USUARIOS);
  const mainFin = await leerFilaCruda("main");
  const pinsRow = await leerFilaCruda("pins");
  const admins = (dedFin.value || []).filter(u => u.rol === "admin");
  // OCC primitivo: PATCH con versión FRESCA → 1 fila; con versión RANCIA → 0 filas.
  const vMain = mainFin.version;
  const okFresh = await fetch(`${URL}/rest/v1/calendario_data?id=eq.pins&updated_at=eq.${encodeURIComponent(pinsRow.version)}`, {
    method: "PATCH", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify({ updated_at: new Date(Date.now()+1000).toISOString() }) });
  const fresh = await okFresh.json();
  const okStale = await fetch(`${URL}/rest/v1/calendario_data?id=eq.pins&updated_at=eq.${encodeURIComponent(pinsRow.version)}`, {
    method: "PATCH", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify({ updated_at: new Date().toISOString() }) });
  const stale = await okStale.json();

  check("INV.glue-reconcilia", "poll/glue reaplica usuarios entrantes (pre=undefined → post=editar)",
    permBpre === undefined && dec && dec.apply === true && permBpost === "editar", `pre=${permBpre} apply=${dec?.apply} post=${permBpost}`);
  check("INV.tareas-no-restaura", "B guarda Tareas → grant preservado en dedicada; espejo no es autoridad",
    rTarB.ok === true && permDe(dedFin.value, "Pablo", "finanzas", "nominas") === "editar", `rTar=${rTarB.ok}`);
  check("INV.roster-admin", "roster completo (6) + ≥1 admin preservado",
    (dedFin.value || []).length === 6 && admins.length >= 1, `len=${dedFin.value?.length} admins=${admins.length}`);
  check("INV.pins-SoT", "fila `pins` intacta (SoT de PINs); main.pinsPersonalizados NO reintroducido",
    pinsRow.existe && mainFin.value.pinsPersonalizados === undefined, `pins=${pinsRow.existe} mainPins=${mainFin.value.pinsPersonalizados}`);
  check("INV.occ-primitivo", "OCC: versión fresca escribe (1 fila), versión rancia conflicto (0 filas)",
    Array.isArray(fresh) && fresh.length === 1 && Array.isArray(stale) && stale.length === 0, `fresh=${fresh.length} stale=${stale.length}`);
}

console.log(`\n── RESUMEN MAIN-GUARD-MIRROR: PASS=${pass} FAIL=${fail} ${fail ? ("FALLOS: " + fallos.join(",")) : ""} ──`);
console.log(`   BEFORE: status=${beforeStatus} code=${beforeCode}  |  CLOBBER(concurrencia)=${concClobber}`);
process.exit(fail ? 1 : 0);
