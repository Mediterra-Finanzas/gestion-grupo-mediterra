/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// permisos.harness.test.mjs — PERSIST de PERMISOS P1..P15 + concurrencia P16..P18
// + repro del conflicto de Tareas (real vs espurio) + repro del BUG de 27b423b y
// su FIX, todo contra la semántica REAL de persistContract (F0) + fakeSupabase.
//
// Ejecutar:  node tests/permisos/permisos.harness.test.mjs
//
// Objetivo: probar los invariantes del CFO sobre la persistencia de `usuarios`:
//   · un permiso confirmado no desaparece por una sesión vieja;
//   · permisos de usuarios DISTINTOS sobreviven concurrentemente;
//   · cambios independientes al MISMO usuario sobreviven si son fusionables;
//   · mismo permiso concurrente → conflicto EXPLÍCITO, jamás LWW silencioso;
//   · red/HTTP/conflicto/carga-vacía nunca son un "guardado" válido.
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia, MOTIVOS, construirAvisoDesde } from "../../src/persistencia/persistContract.js";
import { crearFakeSupabase } from "../persistencia-contract/fakeSupabase.mjs";
import { crearUsuariosStore, ID_USUARIOS } from "../../src/permisos/permisosUsuariosStore.js";
import { mergeUsuariosThreeWay, getTabPerm } from "../../src/permisos/permisosCore.js";

let pass = 0, fail = 0; const fallos = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── Padrón base: 6 usuarios (piso anti-pérdida), 1 admin ────────────────────────
function padronBase() {
  return [
    { nombre: "Angelo",   rol: "admin",   modulos: ["tareas", "finanzas"], tab_permisos: {} },
    { nombre: "Carol",    rol: "usuario", modulos: ["tareas", "finanzas"], tab_permisos: { finanzas: { nominas: "editar", reporte: "editar" } } },
    { nombre: "Michelle", rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
    { nombre: "Pablo",    rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
    { nombre: "Marcos",   rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
    { nombre: "Raquel",   rol: "usuario", modulos: ["tareas"],             tab_permisos: {} },
  ];
}
// helper: setea un permiso de pestaña en una copia
function setPerm(lista, nombre, modulo, tab, nivel) {
  const l = clone(lista);
  const u = l.find(x => x.nombre === nombre);
  u.tab_permisos = u.tab_permisos || {};
  u.tab_permisos[modulo] = u.tab_permisos[modulo] || {};
  u.tab_permisos[modulo][tab] = nivel;
  return l;
}
const seedUsr = () => ({ [ID_USUARIOS]: { value: padronBase() } });
// arma un store cargado desde el fake
async function sesion(fetch, id = ID_USUARIOS) {
  const P = crearPersistencia({ fetch, logger: mudo });
  const row = await P.load(id);           // lee la fila usuarios
  const store = crearUsuariosStore(P, { id });
  store.registrarCarga(row.value || [], row.version, typeof row.value === "string");
  return { P, store };
}
const leerUsr = (db, id = ID_USUARIOS) => db.leer(id)?.value || [];
const permDe = (db, nombre, modulo, tab, id = ID_USUARIOS) =>
  (leerUsr(db, id).find(u => u.nombre === nombre)?.tab_permisos?.[modulo]?.[tab]);

// ── P1 · otorgar permiso → confirma y persiste; recarga lo ve ───────────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { store } = await sesion(fetch);
  const r = await store.guardar(setPerm(padronBase(), "Michelle", "tareas", "config", "editar"));
  check("P1", "otorgar permiso → ok y persiste; recarga lo ve",
    r.ok === true && permDe(db, "Michelle", "tareas", "config") === "editar", `r=${JSON.stringify(r.motivo||"ok")}`);
}

// ── P2 · autosave del permiso → una recarga (instancia nueva) lo ve ─────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const a = await sesion(fetch);
  await a.store.guardar(setPerm(padronBase(), "Pablo", "finanzas", "nominas", "editar"));
  const b = await sesion(fetch);
  check("P2", "autosave del permiso persiste y otra sesión lo ve",
    permDe(db, "Pablo", "finanzas", "nominas") === "editar" &&
    getTabPerm(b.store.getBaseSesion().find(u => u.nombre === "Pablo"), "finanzas", "nominas") === "editar");
}

// ── P3 · edición inmediata tras montar persiste (sin ventana ciega) ─────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { store } = await sesion(fetch);
  const r = await store.guardar(setPerm(padronBase(), "Marcos", "finanzas", "reporte", "ver"));
  check("P3", "edición inmediata al montar persiste",
    r.ok && permDe(db, "Marcos", "finanzas", "reporte") === "ver");
}

// ── P4 · cerrar/reabrir conserva el permiso ─────────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const a = await sesion(fetch);
  await a.store.guardar(setPerm(padronBase(), "Raquel", "tareas", "config", "editar"));
  const b = await sesion(fetch); // proceso nuevo
  check("P4", "cerrar y reabrir conserva el permiso",
    b.store.getBaseSesion().find(u => u.nombre === "Raquel").tab_permisos.tareas.config === "editar");
}

// ── P5 · dos admins, usuarios distintos → ambos permisos sobreviven ─────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const A = await sesion(fetch), B = await sesion(fetch);
  const r1 = await A.store.guardar(setPerm(padronBase(), "Michelle", "tareas", "config", "editar"));
  const r2 = await B.store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  check("P5", "dos admins, usuarios distintos → ambos sobreviven",
    r1.ok && r2.ok && permDe(db, "Michelle", "tareas", "config") === "editar" &&
    permDe(db, "Pablo", "tareas", "config") === "editar");
}

// ── P6 · dos admins, módulos distintos del mismo... (usuarios distintos) ────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const A = await sesion(fetch), B = await sesion(fetch);
  await A.store.guardar(setPerm(padronBase(), "Marcos", "finanzas", "nominas", "editar"));
  await B.store.guardar(setPerm(padronBase(), "Raquel", "finanzas", "reporte", "ver"));
  check("P6", "dos admins editan usuarios distintos → ambos sobreviven",
    permDe(db, "Marcos", "finanzas", "nominas") === "editar" &&
    permDe(db, "Raquel", "finanzas", "reporte") === "ver");
}

// ── P7 · entrante durante edición local sucia → no clobber ──────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { P, store } = await sesion(fetch);
  P.marcarSucio(ID_USUARIOS); // el admin está editando, sin confirmar
  const local = setPerm(padronBase(), "Pablo", "tareas", "config", "editar"); // mi edición
  const remoto = setPerm(padronBase(), "Michelle", "tareas", "config", "editar"); // llegó de otro
  const dec = store.reconciliar(remoto, "vX", local);
  const pabloOk = dec.value?.find(u => u.nombre === "Pablo")?.tab_permisos?.tareas?.config === "editar";
  const michOk  = dec.value?.find(u => u.nombre === "Michelle")?.tab_permisos?.tareas?.config === "editar";
  check("P7", "entrante + edición local sucia → fusión no destructiva (ambos)",
    dec.apply === true && dec.fusionado && pabloOk && michOk);
}

// ── P8 · fallo de red → NO "guardado", queda dirty, aviso de error ──────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { P, store } = await sesion(fetch);
  db.modo = "network";
  const r = await store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  const aviso = construirAvisoDesde(ID_USUARIOS, r.res || r, "los permisos");
  check("P8", "red caída → ok:false, dirty, nada persiste",
    r.ok === false && P.isDirty(ID_USUARIOS) && permDe(db, "Pablo", "tareas", "config") === undefined &&
    (aviso?.tipo === "error" || r.motivo === MOTIVOS.RED), `motivo=${r.motivo}`);
}

// ── P9 · 401/403 (RLS) → NO "guardado" ──────────────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { P, store } = await sesion(fetch);
  db.modo = "403";
  const r = await store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  check("P9", "401/403 → ok:false, no persiste, dirty",
    r.ok === false && P.isDirty(ID_USUARIOS) && permDe(db, "Pablo", "tareas", "config") === undefined);
}

// ── P10 · guardado lento + segundo cambio → ninguno se pierde (coalescencia) ────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { store } = await sesion(fetch);
  db.modo = "slow"; db.slowMs = 30;
  const p1 = store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  const l2 = setPerm(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"), "Marcos", "tareas", "config", "editar");
  const p2 = store.guardar(l2);
  await Promise.all([p1, p2]);
  db.modo = "ok";
  check("P10", "save lento + 2º cambio → ambos permisos persisten",
    permDe(db, "Pablo", "tareas", "config") === "editar" && permDe(db, "Marcos", "tareas", "config") === "editar",
    `pablo=${permDe(db, "Pablo", "tareas", "config")} marcos=${permDe(db, "Marcos", "tareas", "config")}`);
}

// ── P11 · sesión VIEJA no pisa el permiso NUEVO del servidor ────────────────────
// Núcleo del P0. La sesión vieja intenta guardar con su padrón sin el permiso que
// otra sesión ya otorgó. El merge de 3 vías conserva el permiso nuevo.
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const vieja = await sesion(fetch); // cargó padrón sin permisos
  const nueva = await sesion(fetch);
  // La sesión nueva otorga a Pablo un permiso.
  await nueva.store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  // La sesión VIEJA guarda un cambio a OTRO usuario, con su copia sin el permiso de Pablo.
  const r = await vieja.store.guardar(setPerm(padronBase(), "Marcos", "tareas", "config", "editar"));
  check("P11", "sesión vieja no borra el permiso nuevo del servidor",
    r.ok && permDe(db, "Pablo", "tareas", "config") === "editar" &&
    permDe(db, "Marcos", "tareas", "config") === "editar",
    `pablo=${permDe(db, "Pablo", "tareas", "config")}`);
}

// ── P12 · RLS permitido persiste; denegado no reporta éxito ─────────────────────
{
  const { db: d1, fetch: f1 } = crearFakeSupabase(seedUsr());
  const A = await sesion(f1);
  const rOk = await A.store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  const { db: d2, fetch: f2 } = crearFakeSupabase(seedUsr());
  const B = await sesion(f2);
  d2.modo = "403";
  const rDen = await B.store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  check("P12", "RLS permitido persiste; denegado → ok:false y no persiste",
    rOk.ok && permDe(d1, "Pablo", "tareas", "config") === "editar" &&
    rDen.ok === false && permDe(d2, "Pablo", "tareas", "config") === undefined);
}

// ── P13 · sin carga previa exitosa → guardado BLOQUEADO (Regla 9) ───────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const P = crearPersistencia({ fetch, logger: mudo });
  const store = crearUsuariosStore(P); // NO se llamó registrarCarga → sin cargaOk
  const r = await store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  check("P13", "sin carga previa exitosa → guardado bloqueado (nunca escribe defaults)",
    r.ok === false && permDe(db, "Pablo", "tareas", "config") === undefined);
}

// ── P14 · 2xx sin confirmación de fila/versión → NO saved ───────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { P, store } = await sesion(fetch);
  db.modo = "mismatch";
  const r = await store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  check("P14", "2xx sin representación válida → ok:false, dirty, no persiste",
    r.ok === false && P.isDirty(ID_USUARIOS) && permDe(db, "Pablo", "tareas", "config") === undefined);
}

// ── P15 · error fire-and-forget queda visible (dirty + flush().ok=false) ────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const { P, store } = await sesion(fetch);
  db.modo = "network";
  store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar")); // resultado IGNORADO
  const f = await P.flush(ID_USUARIOS);
  check("P15", "error fire-and-forget: dirty + flush().ok=false",
    P.isDirty(ID_USUARIOS) === true && f.ok === false && f.pendiente === true);
}

// ═══════════════════ CONCURRENCIA — cláusulas del CFO P16..P18 ═════════════════

// ── P16 · A×userX ∥ B×userY → ambos sobreviven ─────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const A = await sesion(fetch), B = await sesion(fetch);
  const rA = await A.store.guardar(setPerm(padronBase(), "Michelle", "finanzas", "nominas", "editar"));
  const rB = await B.store.guardar(setPerm(padronBase(), "Pablo",   "finanzas", "nominas", "editar"));
  check("P16", "A permiso-userX ∥ B permiso-userY → ambos sobreviven",
    rA.ok && rB.ok && permDe(db, "Michelle", "finanzas", "nominas") === "editar" &&
    permDe(db, "Pablo", "finanzas", "nominas") === "editar", `rB=${rB.motivo || "ok"}`);
}

// ── P17 · A Nóminas-X ∥ B otro-permiso-mismo-X → definido, sin pérdida ──────────
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const A = await sesion(fetch), B = await sesion(fetch);
  // Ambos editan a "Michelle", pero pestañas DISTINTAS.
  const rA = await A.store.guardar(setPerm(padronBase(), "Michelle", "finanzas", "nominas", "editar"));
  const rB = await B.store.guardar(setPerm(padronBase(), "Michelle", "finanzas", "reporte", "ver"));
  check("P17", "mismo usuario, pestañas distintas → merge por-pestaña, ambos sobreviven",
    rA.ok && rB.ok && permDe(db, "Michelle", "finanzas", "nominas") === "editar" &&
    permDe(db, "Michelle", "finanzas", "reporte") === "ver",
    `rB=${rB.motivo || "ok"} nominas=${permDe(db, "Michelle", "finanzas", "nominas")} reporte=${permDe(db, "Michelle", "finanzas", "reporte")}`);
}

// ── P18 · A ∥ B mismo permiso mismo X (valores distintos) → conflicto EXPLÍCITO ─
{
  const { db, fetch } = crearFakeSupabase(seedUsr());
  const A = await sesion(fetch), B = await sesion(fetch);
  const rA = await A.store.guardar(setPerm(padronBase(), "Michelle", "finanzas", "nominas", "editar"));
  const rB = await B.store.guardar(setPerm(padronBase(), "Michelle", "finanzas", "nominas", "sin_acceso"));
  const aviso = construirAvisoDesde(ID_USUARIOS, rB, "los permisos");
  check("P18", "mismo permiso mismo usuario concurrente → conflicto explícito, NUNCA LWW silencioso",
    rA.ok && rB.ok === false && rB.motivo === MOTIVOS.CONFLICTO &&
    permDe(db, "Michelle", "finanzas", "nominas") === "editar" && // gana el primero, se preserva
    aviso?.tipo === "conflicto",
    `rB.ok=${rB.ok} motivo=${rB.motivo} server=${permDe(db, "Michelle", "finanzas", "nominas")}`);
}

// ═══════════════════ REPRO DEL BUG 27b423b (main-blob) y su FIX ════════════════

// ── BUG · usuarios DENTRO de main + hidratación que no re-aplica usuarios ───────
// Reproduce el mecanismo real: reconcileIncoming adelanta la versión del contrato
// pero la UI NO rehidrata `usuarios`; el siguiente save de main (Tareas) arrastra
// el `usuarios` viejo y PASA el OCC → pérdida silenciosa del permiso.
{
  const seedMain = { main: { value: { usuarios: padronBase(), estados: {} } } };
  const { db, fetch } = crearFakeSupabase(seedMain);
  const A = crearPersistencia({ fetch, logger: mudo }); const la = await A.load("main");
  const B = crearPersistencia({ fetch, logger: mudo }); const lb = await B.load("main");
  // Estado "React" de B (stale): copia de lo cargado.
  let bReactUsuarios = clone(lb.value.usuarios);
  let bReactEstados  = clone(lb.value.estados);
  // A otorga a Pablo un permiso (guarda todo el blob main, como guardarAhora).
  const grant = clone(la.value); grant.usuarios = setPerm(la.value.usuarios, "Pablo", "tareas", "config", "editar");
  await A.saveConfirmed("main", grant, {});
  const serverV1 = db.leer("main");
  // B recibe el entrante: reconcileIncoming (no dirty) → apply, PERO como en App.jsx
  // solo se re-aplican estados/etc, NO usuarios. Simulamos exactamente eso:
  const dec = B.reconcileIncoming("main", serverV1.value, serverV1.updated_at);
  if (dec.apply) { bReactEstados = clone(dec.value.estados); /* usuarios: NO se re-aplica (bug) */ }
  // B marca una Tarea → auto-save de main con usuarios STALE:
  bReactEstados = { t1: "hecha" };
  const rB = await B.saveConfirmed("main", { usuarios: bReactUsuarios, estados: bReactEstados }, {});
  const permTrasBug = db.leer("main").value.usuarios.find(u => u.nombre === "Pablo")?.tab_permisos?.tareas?.config;
  check("BUG-27b423b", "main-blob: save de Tareas con usuarios stale PISA el permiso, SIN conflicto (silencioso)",
    rB.ok === true && permTrasBug === undefined,
    `rB.ok=${rB.ok} permiso=${permTrasBug} (esperado: ok:true & undefined = pérdida silenciosa reproducida)`);
}

// ── FIX · usuarios en fila dedicada: el save de Tareas NO puede arrastrar usuarios
{
  const seedMain = { main: { value: { estados: {} } } };          // main SIN usuarios
  const seed = { ...seedMain, ...seedUsr() };
  const { db, fetch } = crearFakeSupabase(seed);
  // Sesiones: cada una con store de usuarios + persist de main.
  const A = await sesion(fetch);
  const Bp = crearPersistencia({ fetch, logger: mudo });
  const lbMain = await Bp.load("main");
  const Brow = await Bp.load(ID_USUARIOS);
  const Bstore = crearUsuariosStore(Bp, { id: ID_USUARIOS });
  Bstore.registrarCarga(Brow.value || [], Brow.version, typeof Brow.value === "string");
  let bReactUsuarios = clone(Brow.value);
  // A otorga a Pablo un permiso (fila dedicada).
  await A.store.guardar(setPerm(padronBase(), "Pablo", "tareas", "config", "editar"));
  const serverUsr = db.leer(ID_USUARIOS);
  // B rehidrata la fila usuarios (poll) → reconciliar re-APLICA usuarios a "React".
  const dec = Bstore.reconciliar(serverUsr.value, serverUsr.updated_at, bReactUsuarios);
  if (dec.apply) bReactUsuarios = clone(dec.value);
  // B marca una Tarea → save de main SIN usuarios (ya no viven ahí).
  const rB = await Bp.saveConfirmed("main", { ...lbMain.value, estados: { t1: "hecha" } }, {});
  const permFix = db.leer(ID_USUARIOS).value.find(u => u.nombre === "Pablo")?.tab_permisos?.tareas?.config;
  const bVePermiso = bReactUsuarios.find(u => u.nombre === "Pablo")?.tab_permisos?.tareas?.config;
  check("FIX-decoupling", "fila dedicada: el permiso sobrevive al save de Tareas y B lo rehidrata",
    rB.ok && permFix === "editar" && bVePermiso === "editar",
    `permFix=${permFix} bVe=${bVePermiso}`);
}

// ═══════════════════ CONFLICTO DE TAREAS — real vs espurio ═════════════════════

// ── TAREAS-REAL · dos sesiones editan main.estados en la misma versión → conflicto
// legítimo del blob main (no-función). Se emite el toast "las Tareas".
{
  const seedMain = { main: { value: { estados: { t0: "x" } } } };
  const { db, fetch } = crearFakeSupabase(seedMain);
  const A = crearPersistencia({ fetch, logger: mudo }); const la = await A.load("main");
  const B = crearPersistencia({ fetch, logger: mudo }); const lb = await B.load("main");
  await A.saveConfirmed("main", { estados: { t0: "x", tA: "hecha" } }, {}); // A escribe primero
  const rB = await B.saveConfirmed("main", { estados: { t0: "x", tB: "hecha" } }, {}); // B choca
  const aviso = construirAvisoDesde("main", rB, "las Tareas");
  check("TAREAS-REAL", "dos ediciones concurrentes de main → conflicto explícito + toast 'las Tareas'",
    rB.ok === false && rB.motivo === MOTIVOS.CONFLICTO && aviso?.tipo === "conflicto" &&
    /no se puede combinar autom/i.test(aviso.texto));
}

// ── TAREAS-ESPURIO · con el FIX, editar Tareas (main) NO colisiona con editar
// permisos (fila usuarios): B guarda Tareas aunque A haya cambiado usuarios.
{
  const seed = { main: { value: { estados: {} } }, ...seedUsr() };
  const { db, fetch } = crearFakeSupabase(seed);
  const A = await sesion(fetch);
  const Bp = crearPersistencia({ fetch, logger: mudo }); const lbMain = await Bp.load("main");
  // A cambia PERMISOS (fila usuarios), no toca main.
  await A.store.guardar(setPerm(padronBase(), "Michelle", "tareas", "config", "editar"));
  // B guarda TAREAS (main) — antes esto chocaba porque usuarios vivía en main.
  const rB = await Bp.saveConfirmed("main", { estados: { t1: "hecha" } }, {});
  check("TAREAS-ESPURIO", "editar permisos ya NO bloquea guardar Tareas (acoplamiento roto)",
    rB.ok === true && permDe(db, "Michelle", "tareas", "config") === "editar" &&
    db.leer("main").value.estados.t1 === "hecha");
}

// ── Extra · merge puro: A y B agregan usuarios NUEVOS distintos → sin conflicto ─
{
  const base = padronBase();
  const localA = [...clone(base), { nombre: "Nuevo1", rol: "usuario", modulos: ["tareas"], tab_permisos: {} }];
  const freshB = [...clone(base), { nombre: "Nuevo2", rol: "usuario", modulos: ["tareas"], tab_permisos: {} }];
  const m = mergeUsuariosThreeWay(base, localA, freshB);
  const nombres = m.merged.map(u => u.nombre);
  check("MERGE-nuevos", "dos altas de usuario distintas → ambas presentes, sin conflicto",
    m.conflicts.length === 0 && nombres.includes("Nuevo1") && nombres.includes("Nuevo2"));
}

console.log(`\n${pass} OK · ${fail} FALLA`);
if (fail) { console.log(`\nCasos en rojo: ${fallos.join(", ")}`); process.exitCode = 1; }
else console.log(`\n✅ TODOS VERDE — permisos P1..P18 + Tareas(real/espurio) + BUG/FIX 27b423b.`);
