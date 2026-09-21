/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// STG-PERM-3 — Certificación de concurrencia C3/C4/C5/C9 del fix e1ee4b1 contra la
// fila `usuarios` REAL de STAGING, usando el persist+store REALES (persistContract
// F0 + crearUsuariosStore + merge de 3 vías). Dos "admins" = dos instancias persist.
//
// MODOS:
//   · MOCK  (por defecto): fakeSupabase en memoria. Auto-test del harness. Local.
//   · STAGING: si existen env STG_SUPA_URL y STG_SUPA_KEY → usa fetch real contra
//     esa REST. Snapshotea la fila `usuarios`, corre los escenarios (reset por
//     escenario) y RESTAURA la fila al snapshot al final (reversible, idempotente).
//
// Ejecutar MOCK (local):    node tests/permisos/stg_perm_3.harness.mjs
// Ejecutar STAGING:         STG_SUPA_URL=... STG_SUPA_KEY=... node tests/permisos/stg_perm_3.harness.mjs
//   (en Windows PowerShell: $env:STG_SUPA_URL="..."; $env:STG_SUPA_KEY="..."; node ...)
// NUNCA pasar la URL/KEY de PROD. Solo staging nlvfjpwiecgrosjnwwik.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia } from "../../src/persistencia/persistContract.js";
import { crearUsuariosStore, ID_USUARIOS } from "../../src/permisos/permisosUsuariosStore.js";
import { getTabPerm } from "../../src/permisos/permisosCore.js";

const STG_URL = process.env.STG_SUPA_URL || null;
const STG_KEY = process.env.STG_SUPA_KEY || null;
const MODO = (STG_URL && STG_KEY) ? "STAGING" : "MOCK";
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
const clone = (x) => JSON.parse(JSON.stringify(x));
let pass = 0, fail = 0; const fallos = [];
const check = (id, desc, cond, nota="") => { if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); } else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota?"  — "+nota:""}`); } };

// ── Tripwire STAGING: nunca correr contra PROD ─────────────────────────────────
if (MODO === "STAGING" && /bywovqayuzodbzwsriet/.test(STG_URL)) {
  console.error("ABORT: STG_SUPA_URL apunta a PROD (bywovqayuzodbzwsriet). Solo staging."); process.exit(2);
}

// ── Transporte ─────────────────────────────────────────────────────────────────
let makeFetch, snapshotInicial = null, restore = async () => {};
if (MODO === "MOCK") {
  const { crearFakeSupabase } = await import("../persistencia-contract/fakeSupabase.mjs");
  const padron = [
    { nombre:"Angelo", rol:"admin",   modulos:["tareas","finanzas"], tab_permisos:{} },
    { nombre:"Carol",  rol:"usuario", modulos:["tareas","finanzas"], tab_permisos:{ finanzas:{ reporte:"editar" } } },
    { nombre:"Michelle",rol:"usuario",modulos:["tareas"],            tab_permisos:{} },
    { nombre:"Pablo",  rol:"usuario", modulos:["tareas"],            tab_permisos:{} },
    { nombre:"Marcos", rol:"usuario", modulos:["tareas"],            tab_permisos:{} },
    { nombre:"Raquel", rol:"usuario", modulos:["tareas"],            tab_permisos:{} },
  ];
  const fk = crearFakeSupabase({ [ID_USUARIOS]: { value: clone(padron) } });
  makeFetch = () => fk.fetch;
  snapshotInicial = clone(padron);
  restore = async () => { fk.db.filas.set(ID_USUARIOS, { fisico: JSON.stringify(clone(snapshotInicial)), updated_at: fk.db._ts() }); };
} else {
  const H = () => ({ apikey: STG_KEY, Authorization: `Bearer ${STG_KEY}`, "Content-Type": "application/json" });
  makeFetch = () => globalThis.fetch;
  // snapshot (read-only)
  const r0 = await fetch(`${STG_URL}/rest/v1/calendario_data?id=eq.${ID_USUARIOS}&select=value,updated_at`, { headers: H() });
  const j0 = await r0.json(); const row0 = j0?.[0];
  if (!row0) { console.error("ABORT: no existe fila `usuarios` en staging. Corre STG-PERM-1 primero."); process.exit(2); }
  snapshotInicial = typeof row0.value === "string" ? JSON.parse(row0.value) : row0.value;
  // reset/restore: PATCH incondicional value=snapshot + updated_at=now()
  restore = async (val = snapshotInicial) => {
    await fetch(`${STG_URL}/rest/v1/calendario_data?id=eq.${ID_USUARIOS}`, {
      method: "PATCH", headers: { ...H(), Prefer: "return=minimal" },
      body: JSON.stringify({ value: clone(val), updated_at: new Date().toISOString() }),
    });
  };
}

const persistArgs = () => (MODO === "STAGING") ? { supaUrl: STG_URL, supaKey: STG_KEY, fetch: makeFetch(), logger: mudo } : { fetch: makeFetch(), logger: mudo };
// abre una "sesión" (admin) con su propio persist + store cargado del server
async function sesion() {
  const P = crearPersistencia(persistArgs());
  const row = await P.load(ID_USUARIOS);
  const store = crearUsuariosStore(P, { id: ID_USUARIOS });
  store.registrarCarga(row.value || [], row.version, typeof row.value === "string");
  return { P, store, base: clone(row.value || []) };
}
async function leerServidor() {
  const P = crearPersistencia(persistArgs());
  const row = await P.load(ID_USUARIOS);
  return row.value || [];
}
const permDe = (lista, nombre, mod, tab) => lista.find(u => u.nombre === nombre)?.tab_permisos?.[mod]?.[tab];
function setPerm(lista, nombre, mod, tab, nivel) {
  const l = clone(lista); const u = l.find(x => x.nombre === nombre);
  u.tab_permisos = u.tab_permisos || {}; u.tab_permisos[mod] = u.tab_permisos[mod] || {}; u.tab_permisos[mod][tab] = nivel; return l;
}

console.log(`\n── STG-PERM-3 · MODO=${MODO} ──`);

// ── C3 · Admin A cambia X, Admin B cambia Y (concurrente) → ambos sobreviven ────
await restore();
{
  const A = await sesion(); const B = await sesion();            // ambos cargan la MISMA versión
  const rA = await A.store.guardar(setPerm(A.base, "Michelle", "finanzas", "nominas", "editar")); // A commitea
  const rB = await B.store.guardar(setPerm(B.base, "Pablo",    "finanzas", "reporte", "editar")); // B con base vieja → conflicto→re-merge
  const srv = await leerServidor();
  check("C3", "A×Michelle ∥ B×Pablo → ambos permisos sobreviven",
    rA.ok===true && rB.ok===true && permDe(srv,"Michelle","finanzas","nominas")==="editar" && permDe(srv,"Pablo","finanzas","reporte")==="editar",
    `rA=${rA.ok} rB=${rB.ok} M=${permDe(srv,"Michelle","finanzas","nominas")} P=${permDe(srv,"Pablo","finanzas","reporte")}`);
}

// ── C4 · Dos permisos DISTINTOS del MISMO usuario, concurrentes → ambos sobreviven ──
await restore();
{
  const A = await sesion(); const B = await sesion();
  const rA = await A.store.guardar(setPerm(A.base, "Michelle", "finanzas", "nominas", "editar"));
  const rB = await B.store.guardar(setPerm(B.base, "Michelle", "finanzas", "eeff",    "ver"));
  const srv = await leerServidor();
  check("C4", "mismo usuario, pestañas distintas → ambos sobreviven (merge por-tab)",
    rA.ok===true && rB.ok===true && permDe(srv,"Michelle","finanzas","nominas")==="editar" && permDe(srv,"Michelle","finanzas","eeff")==="ver",
    `rA=${rA.ok} rB=${rB.ok} nom=${permDe(srv,"Michelle","finanzas","nominas")} eeff=${permDe(srv,"Michelle","finanzas","eeff")}`);
}

// ── C5 · MISMO permiso del MISMO usuario, valores distintos → conflicto EXPLÍCITO ──
await restore();
{
  const A = await sesion(); const B = await sesion();
  const rA = await A.store.guardar(setPerm(A.base, "Michelle", "finanzas", "config", "editar"));      // A commitea editar
  const rB = await B.store.guardar(setPerm(B.base, "Michelle", "finanzas", "config", "sin_acceso"));  // B mismo campo, valor distinto
  const srv = await leerServidor();
  check("C5", "mismo permiso concurrente → conflicto explícito, server preservado, NUNCA LWW",
    rA.ok===true && rB.ok===false && (rB.motivo==="conflicto") && permDe(srv,"Michelle","finanzas","config")==="editar",
    `rA=${rA.ok} rB=${JSON.stringify({ok:rB.ok,motivo:rB.motivo})} server=${permDe(srv,"Michelle","finanzas","config")}`);
}

// ── C9 · carga fallida/vacía nunca habilita guardado (fail-closed, Regla 9) ─────
await restore();
{
  // persist cuya load falla (fetch 500) → cargaOk debe quedar false → guardar = sin_carga
  const fetchFalla = async () => ({ ok:false, status:500, json: async()=>([]), text: async()=>"" });
  const P = crearPersistencia(MODO==="STAGING" ? { supaUrl:STG_URL, supaKey:STG_KEY, fetch:fetchFalla, logger:mudo } : { fetch:fetchFalla, logger:mudo });
  const store = crearUsuariosStore(P, { id: ID_USUARIOS });
  let cargaLanzo = false;
  try { await P.load(ID_USUARIOS); } catch(e){ cargaLanzo = true; }   // Regla 9: load lanza ante !ok
  const r = await store.guardar(setPerm(snapshotInicial, "Michelle", "finanzas", "nominas", "editar"));
  const srv = await leerServidor();
  check("C9", "load fallida (500) → NO guarda (sin_carga); server intacto",
    r.ok===false && (r.motivo==="sin_carga") && permDe(srv,"Michelle","finanzas","nominas")===undefined,
    `cargaLanzo=${cargaLanzo} r=${JSON.stringify({ok:r.ok,motivo:r.motivo})} server=${permDe(srv,"Michelle","finanzas","nominas")}`);
}

// ── Restaurar la fila al snapshot inicial (reversibilidad / DATA LOSS = 0) ───────
await restore();
{
  const srv = await leerServidor();
  const igual = JSON.stringify(srv) === JSON.stringify(snapshotInicial);
  check("RESTORE", "fila `usuarios` restaurada al snapshot inicial (0 residuo)", igual,
    `len srv=${srv.length} snap=${snapshotInicial.length}`);
}

console.log(`\n── RESUMEN STG-PERM-3 (${MODO}): PASS=${pass} FAIL=${fail} ${fail?("FALLOS: "+fallos.join(",")):""} ──`);
process.exit(fail ? 1 : 0);
