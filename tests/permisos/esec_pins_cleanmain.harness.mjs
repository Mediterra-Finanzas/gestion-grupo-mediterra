/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// esec_pins_cleanmain.harness.mjs — E-SEC hardening PINs (PROD-INCIDENT-01)
//
// Análogo a esec_osiris_cleanmain.harness.mjs pero para PINs. La migración de
// osirisData reescribe la fila `main` con `cleanMain`. Sin el fix, `cleanMain`
// conserva la copia rancia y anon-legible de PINs bajo la clave `pinsPersonalizados`
// (contiene los hashes `_h`, `_hist`, `_tel`, `_temp`). El fix agrega
// `delete cleanMain.pinsPersonalizados` para que esa copia deje de reescribirse.
//
// OJO CON EL NOMBRE DEL CAMPO: la fila DEDICADA (SoT) tiene id="pins", pero la copia
// rancia DENTRO de `main` vive bajo la clave `pinsPersonalizados` (ver App.jsx
// ~2269/2277: `d.pinsPersonalizados`). Por eso el delete es sobre `pinsPersonalizados`,
// NO sobre `pins` (que sería un no-op). Es el mismo patrón que `usuarios`: se borra el
// nombre REAL del campo en main.
//
// Se replica el bloque REAL de App.jsx (mismo POST a la fila `osiris` +
// persist.saveConfirmed("main", cleanMain, {})) contra persistContract + fakeSupabase.
//
// Invariantes probados:
//   (a) tras la migración, la fila dedicada `pins` (SoT) queda INTACTA
//       (mismo value y misma versión) — no se toca;
//   (b) la copia rancia `pinsPersonalizados` YA NO se escribe en `main`;
//   (c) osirisData sí se migró (fila `osiris`) y se quitó de `main`;
//   (d) el resto de `main` (estados) se conserva;
//   (e) CONTROL: sin el `delete cleanMain.pinsPersonalizados`, la copia rancia SÍ
//       persiste en `main` (demuestra que el test detecta la regresión).
//
// SEGURIDAD DEL TEST: usa credenciales SINTÉTICAS (hashes ficticios "HASH-..."),
// nunca un hash/salt/PIN real, y NUNCA imprime el contenido de un `_h`.
//
// Ejecutar:  node tests/permisos/esec_pins_cleanmain.harness.mjs
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia } from "../../src/persistencia/persistContract.js";
import { crearFakeSupabase } from "../persistencia-contract/fakeSupabase.mjs";

const ID_PINS = "pins";

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

// PINs personalizados SINTÉTICOS (hashes ficticios, sin PII ni credenciales reales).
function pinsSinteticos() {
  return {
    "Angelo_h": JSON.stringify({ v: 1, iter: 1, salt: "SALT-A", hash: "HASH-A" }),
    "Carol_h":  JSON.stringify({ v: 1, iter: 1, salt: "SALT-C", hash: "HASH-C" }),
    "Pablo_hist": JSON.stringify([]),
    "Michelle_tel": "56900000000",
  };
}

// Replica EXACTA del bloque App.jsx ~2287-2305. `aplicarFix` conmuta el delete nuevo.
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
  delete cleanMain.usuarios;                    // fix E-SEC previo (usuarios)
  if (aplicarFix) delete cleanMain.pinsPersonalizados; // ← el fix E-SEC de ESTE harness
  const rSave = await persist.saveConfirmed("main", cleanMain, {});
  // --- fin bloque replicado ---
  return { rSave };
}

// Semilla común: main con osirisData + copia rancia de pinsPersonalizados + usuarios +
// estados; y la fila dedicada `pins` (SoT) con su propio contenido sintético. Ambas
// string-encoded (legacy).
function seed() {
  return {
    main: { value: {
      osirisData: { contratos: [{ id: 1 }] },
      usuarios: [{ nombre: "Angelo", rol: "admin" }],
      pinsPersonalizados: pinsSinteticos(),
      estados: { t0: "x" },
    } },
    [ID_PINS]: { value: pinsSinteticos() },
  };
}

// ── FIX aplicado ────────────────────────────────────────────────────────────────
{
  const { db, fetch } = crearFakeSupabase(seed());
  const d = clone(db.leer("main").value);
  const pinsVersionAntes = db.leer(ID_PINS).updated_at;
  const pinsValorAntes   = clone(db.leer(ID_PINS).value);

  const { rSave } = await correrMigracion(fetch, d, { aplicarFix: true });

  const mainFinal = db.leer("main").value;
  const pinsFinal = db.leer(ID_PINS);
  const osirisFinal = db.leer("osiris");

  check("ESEC-PINS-1a", "fila dedicada `pins` (SoT) INTACTA: misma versión y mismo valor",
    pinsFinal.updated_at === pinsVersionAntes &&
    JSON.stringify(pinsFinal.value) === JSON.stringify(pinsValorAntes),
    `verAntes=${pinsVersionAntes} verDespues=${pinsFinal.updated_at}`);

  check("ESEC-PINS-1b", "la copia rancia `pinsPersonalizados` YA NO se escribe en `main`",
    rSave.ok === true && !("pinsPersonalizados" in mainFinal),
    `rSave.ok=${rSave.ok} keys=${Object.keys(mainFinal).join(",")}`);

  check("ESEC-PINS-1c", "osirisData migrado a fila `osiris` y removido de `main`",
    osirisFinal && osirisFinal.value && !("osirisData" in mainFinal),
    `osiris=${!!osirisFinal} mainKeys=${Object.keys(mainFinal).join(",")}`);

  check("ESEC-PINS-1d", "el resto de `main` (estados) se conserva",
    mainFinal.estados && mainFinal.estados.t0 === "x");
}

// ── CONTROL: sin el fix, la copia rancia SÍ persiste (el test lo detecta) ─────────
{
  const { db, fetch } = crearFakeSupabase(seed());
  const d = clone(db.leer("main").value);
  await correrMigracion(fetch, d, { aplicarFix: false });
  const mainFinal = db.leer("main").value;
  check("ESEC-PINS-CONTROL", "sin el delete, `main.pinsPersonalizados` (copia rancia) queda reescrito — regresión detectable",
    ("pinsPersonalizados" in mainFinal),
    `keys=${Object.keys(mainFinal).join(",")}`);
}

console.log(`\n${pass} OK · ${fail} FALLA`);
if (fail) { console.log(`\nCasos en rojo: ${fallos.join(", ")}`); process.exitCode = 1; }
else console.log(`\n✅ TODOS VERDE — E-SEC pins cleanMain: SoT (fila 'pins') intacta, copia rancia 'pinsPersonalizados' no reescrita.`);
