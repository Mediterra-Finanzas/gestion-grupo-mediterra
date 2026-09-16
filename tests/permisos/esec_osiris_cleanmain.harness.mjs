/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// esec_osiris_cleanmain.harness.mjs — E-SEC hardening (PROD-INCIDENT-01)
//
// Prueba el fix de App.jsx (~2295): la migración de osirisData reescribe la fila
// `main` con `cleanMain`. ANTES quitaba solo `osirisData`, dejando una copia rancia
// y anon-legible de `usuarios`/permisos en `main`. El fix agrega
// `delete cleanMain.usuarios` para que esa copia deje de reescribirse.
//
// Se replica el bloque REAL de App.jsx (mismo fetch POST a la fila `osiris` +
// persist.saveConfirmed("main", cleanMain, {})) contra persistContract + fakeSupabase.
//
// Invariantes probados:
//   (a) tras la migración, la fila dedicada `usuarios` (SoT) queda INTACTA
//       (mismo value y misma versión) — no se toca;
//   (b) la copia rancia de `usuarios` YA NO se escribe en `main`;
//   (c) osirisData sí se migró (fila `osiris`) y se quitó de `main`;
//   (d) el resto de `main` (estados) se conserva;
//   (e) CONTROL: sin el `delete cleanMain.usuarios`, la copia rancia SÍ persiste
//       en `main` (demuestra que el test detecta la regresión).
//
// Ejecutar:  node tests/permisos/esec_osiris_cleanmain.harness.mjs
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia } from "../../src/persistencia/persistContract.js";
import { crearFakeSupabase } from "../persistencia-contract/fakeSupabase.mjs";
import { ID_USUARIOS } from "../../src/permisos/permisosUsuariosStore.js";

let pass = 0, fail = 0; const fallos = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
const clone = (x) => JSON.parse(JSON.stringify(x));

// URL/KEY de PRUEBA (nunca PROD): el transporte es fakeSupabase, que solo lee el
// `id` del query-string e ignora el host. No se emite ninguna petición real.
const SUPA_URL = "http://fake.local";
const SUPA_KEY = "anon-test-key";

function padron() {
  return [
    { nombre: "Angelo", rol: "admin",   modulos: ["tareas", "finanzas"], tab_permisos: {} },
    { nombre: "Carol",  rol: "usuario", modulos: ["tareas", "finanzas"], tab_permisos: { finanzas: { nominas: "editar" } } },
    { nombre: "Pablo",  rol: "usuario", modulos: ["tareas"],             tab_permisos: { tareas: { config: "editar" } } },
  ];
}

// Replica EXACTA del bloque App.jsx ~2287-2298. `aplicarFix` conmuta el delete nuevo.
async function correrMigracion(fetch, d, { aplicarFix }) {
  const persist = crearPersistencia({ fetch, logger: mudo });
  // App.jsx carga `main` una vez y registra esa lectura para habilitar el guardado.
  const rowMain = await persist.load("main");
  persist.registrarCarga("main", rowMain.value, rowMain.version, typeof rowMain.value === "string");

  // --- inicio bloque replicado de App.jsx (if(d.osirisData)) ---
  await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "osiris", value: d.osirisData, updated_at: new Date().toISOString() }),
  });
  const cleanMain = { ...d };
  delete cleanMain.osirisData;
  if (aplicarFix) delete cleanMain.usuarios; // ← el fix E-SEC
  const rSave = await persist.saveConfirmed("main", cleanMain, {});
  // --- fin bloque replicado ---
  return { rSave };
}

// Semilla común: main con osirisData + copia rancia de usuarios + estados; y la
// fila dedicada `usuarios` (SoT) con su propio padrón. Ambas string-encoded (legacy).
function seed() {
  return {
    main: { value: { osirisData: { contratos: [{ id: 1 }] }, usuarios: padron(), estados: { t0: "x" } } },
    [ID_USUARIOS]: { value: padron() },
  };
}

// ── FIX aplicado ────────────────────────────────────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seed());
  const d = clone(db.leer("main").value);
  const usrVersionAntes = db.leer(ID_USUARIOS).updated_at;
  const usrValorAntes   = clone(db.leer(ID_USUARIOS).value);

  const { rSave } = await correrMigracion(fetch, d, { aplicarFix: true });

  const mainFinal = db.leer("main").value;
  const usrFinal  = db.leer(ID_USUARIOS);
  const osirisFinal = db.leer("osiris");

  check("ESEC-1a", "fila dedicada `usuarios` (SoT) INTACTA: misma versión y mismo valor",
    usrFinal.updated_at === usrVersionAntes &&
    JSON.stringify(usrFinal.value) === JSON.stringify(usrValorAntes),
    `verAntes=${usrVersionAntes} verDespues=${usrFinal.updated_at}`);

  check("ESEC-1b", "la copia rancia de `usuarios` YA NO se escribe en `main`",
    rSave.ok === true && !("usuarios" in mainFinal),
    `rSave.ok=${rSave.ok} keys=${Object.keys(mainFinal).join(",")}`);

  check("ESEC-1c", "osirisData migrado a fila `osiris` y removido de `main`",
    osirisFinal && osirisFinal.value && !("osirisData" in mainFinal),
    `osiris=${!!osirisFinal} mainKeys=${Object.keys(mainFinal).join(",")}`);

  check("ESEC-1d", "el resto de `main` (estados) se conserva",
    mainFinal.estados && mainFinal.estados.t0 === "x");
}

// ── CONTROL: sin el fix, la copia rancia SÍ persiste (el test lo detecta) ─────────
{
  const { db, fetch } = crearFakeSupabase(seed());
  const d = clone(db.leer("main").value);
  await correrMigracion(fetch, d, { aplicarFix: false });
  const mainFinal = db.leer("main").value;
  check("ESEC-CONTROL", "sin el delete, `main.usuarios` (copia rancia) queda reescrito — regresión detectable",
    ("usuarios" in mainFinal),
    `keys=${Object.keys(mainFinal).join(",")}`);
}

console.log(`\n${pass} OK · ${fail} FALLA`);
if (fail) { console.log(`\nCasos en rojo: ${fallos.join(", ")}`); process.exitCode = 1; }
else console.log(`\n✅ TODOS VERDE — E-SEC osiris cleanMain: SoT intacta, copia rancia no reescrita.`);
