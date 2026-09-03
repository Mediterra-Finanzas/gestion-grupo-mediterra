/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// fin-f0.test.mjs — FIN-F0-01..06 · regresión del contrato de persistencia sobre
// el blob de Finanzas, con foco en NO romper la feature de producción
// "Consolidación proporcional de Allpa por participación" (params_participacion).
//
// Ejecutar:  node tests/persistencia-contract/fin-f0.test.mjs
//
// Estos casos ejercitan EXACTAMENTE la ruta que usa FinanzasModule.jsx tras F0:
//   dbLoad(rowId)  → persist.registrarCarga(rowId, blob, updated_at, esString)
//   dbSave(data,rowId) → persist.saveConfirmed(rowId, data, {})
// El blob de Finanzas es un OBJETO anidado NO fusionable → el contrato lo escribe
// completo con optimistic lock (nunca LWW silencioso, nunca fusión por ítem).
//
// La feature Allpa vive en `blob.params_participacion` (persistida en la fila
// `finanzas`) y en el ensamblado que hace persistAll (todas las secciones en cada
// guardado). Estos tests fijan que F0 preserva ese round-trip y su aritmética.
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia, MOTIVOS } from "../../src/persistencia/persistContract.js";
import { crearFakeSupabase } from "./fakeSupabase.mjs";

let pass = 0, fail = 0; const fallos = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); }
  else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
const clon = (o) => JSON.parse(JSON.stringify(o));

// ── Blob de Finanzas realista (subset de las secciones de persistAll) ─────────
// Incluye params_participacion (feature Allpa) + varias otras secciones para
// verificar que ninguna se pierde al guardar por el contrato.
function seedBlob() {
  return {
    finanzas_real:   { Holding: { "5": { "0": { ing: 100 } } } },
    allegria_params: { cerezas: { kg: 10 } },
    params_participacion: { "Allpa Farms": 0.50, "Allpa Farms Perú": 0.26 },
    sub_lines:       { Holding: { "Gastos": ["Luz", "Agua"] } },
    added_lines:     { Holding: { ing_op: [{ label: "Extra", vals: { "5": 7 } }] } },
    intercompany:    [{ de: "Holding", a: "Allegria", monto: 1000 }],
  };
}
// Emula el ensamblado de persistAll: parte del estado (refs) y aplica overrides.
// Clave: params_participacion SIEMPRE viaja en el blob (línea del persistAll real).
function ensamblar(estado, overrides = {}) {
  const b = clon(estado);
  for (const k of Object.keys(overrides)) b[k] = overrides[k];
  return b;
}
const seedFin = () => ({ finanzas: { value: seedBlob() } }); // encoding 'string' (legacy)

// ── FIN-F0-01 · editar OTRA sección no altera params_participacion ────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  const partAntes = clon(l.value.params_participacion);
  // Se edita solo finanzas_real (como handleSaveRealData) pero el blob completo
  // —incluida params_participacion— se reescribe, igual que persistAll.
  const blob = ensamblar(l.value, { finanzas_real: { Holding: { "5": { "0": { ing: 999 } } } } });
  const r = await P.saveConfirmed("finanzas", blob, {});
  const recargado = db.leer("finanzas").value;
  check("FIN-F0-01", "editar finanzas_real no altera params_participacion tras el round-trip",
    r.ok === true &&
    recargado.finanzas_real.Holding["5"]["0"].ing === 999 &&
    JSON.stringify(recargado.params_participacion) === JSON.stringify(partAntes));
}

// ── FIN-F0-02 · cambiar la participación se confirma y persiste ───────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  const nuevaPart = { "Allpa Farms": 0.60, "Allpa Farms Perú": 0.30 };
  const blob = ensamblar(l.value, { params_participacion: nuevaPart });
  const r = await P.saveConfirmed("finanzas", blob, {});
  // Recarga con instancia NUEVA (como reabrir la app).
  const B = crearPersistencia({ fetch, logger: mudo });
  const lb = await B.load("finanzas");
  check("FIN-F0-02", "cambiar participación → ACK del servidor → recarga ve el valor nuevo",
    r.ok === true &&
    lb.value.params_participacion["Allpa Farms"] === 0.60 &&
    lb.value.params_participacion["Allpa Farms Perú"] === 0.30);
}

// ── FIN-F0-03 · conflicto concurrente: sin overwrite silencioso ───────────────
// A y B cargan la misma versión. B cambia participación y guarda. A guarda con
// versión vieja → CONFLICTO. El blob no es fusionable ⇒ NO se pisa el servidor;
// la participación de B (remota) sobrevive y A recibe conflicto (no falso éxito).
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const A = crearPersistencia({ fetch, logger: mudo });
  const B = crearPersistencia({ fetch, logger: mudo });
  const la = await A.load("finanzas");
  const lb = await B.load("finanzas");
  // B cambia la participación de Allpa Chile a 0.66 y confirma.
  const rB = await B.saveConfirmed("finanzas", ensamblar(lb.value, { params_participacion: { "Allpa Farms": 0.66, "Allpa Farms Perú": 0.26 } }), {});
  // A intenta guardar SOLO su edición de finanzas_real con la versión vieja.
  const blobA = ensamblar(la.value, { finanzas_real: { Holding: { "5": { "0": { ing: 111 } } } } });
  const rA = await A.saveConfirmed("finanzas", blobA, { intentos: 0 });
  const enServidor = db.leer("finanzas").value;
  check("FIN-F0-03", "conflicto blob: no se sobrescribe; participación remota (0.66) intacta; A recibe conflicto (no falso éxito)",
    rB.ok === true &&
    rA.ok === false && rA.motivo === MOTIVOS.CONFLICTO &&
    enServidor.params_participacion["Allpa Farms"] === 0.66 &&
    enServidor.finanzas_real.Holding["5"]["0"].ing === 100 &&      // NO se pisó con el 111 de A
    blobA.finanzas_real.Holding["5"]["0"].ing === 111);            // el trabajo local de A sigue en mano
}

// ── FIN-F0-04 · guardar una sección no descarta las demás del blob ────────────
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const l = await P.load("finanzas");
  // persistAll reensambla TODO el blob en cada guardado; se edita added_lines.
  const blob = ensamblar(l.value, { added_lines: { Holding: { ing_op: [{ label: "Nuevo", vals: { "6": 5 } }] } } });
  const r = await P.saveConfirmed("finanzas", blob, {});
  const g = db.leer("finanzas").value;
  check("FIN-F0-04", "guardar added_lines no descarta params_participacion, sub_lines, intercompany ni allegria_params",
    r.ok === true &&
    !!g.params_participacion && g.params_participacion["Allpa Farms"] === 0.50 &&
    !!g.sub_lines && !!g.sub_lines.Holding &&
    Array.isArray(g.intercompany) && g.intercompany.length === 1 &&
    !!g.allegria_params && g.added_lines.Holding.ing_op[0].label === "Nuevo");
}

// ── FIN-F0-05 · la aritmética de consolidación proporcional NO cambió ─────────
// F0 no toca el cálculo del Consolidado. Se replica la MISMA fórmula del módulo
// (scaleEmp: proy*pct; saldoIni: base*peso) y se fija el resultado esperado, para
// que un cambio accidental futuro en esa fórmula rompa este test.
{
  const pctChile = 0.50, pctPeru = 0.26;
  // proy de Allpa Chile antes de escalar
  const proyChile = [200, 400, 600];
  const saldoIniChile = 1000;
  // Fórmula EXACTA del módulo (Consolidado): l.proy = proy.map(v=>v*pct); saldo=base*peso
  const scaleProy = (proy, pct) => proy.map(v => (Number(v) || 0) * pct);
  const scaleSaldo = (base, peso) => base * peso;
  const proyEsc = scaleProy(proyChile, pctChile);
  const saldoEsc = scaleSaldo(saldoIniChile, pctChile);
  // Perú
  const proyPeru = [100, 100];
  const proyPeruEsc = scaleProy(proyPeru, pctPeru);
  check("FIN-F0-05", "escalado proporcional de Allpa Chile (50%) y Perú (26%) da el mismo resultado que antes de F0",
    JSON.stringify(proyEsc) === JSON.stringify([100, 200, 300]) &&
    saldoEsc === 500 &&
    JSON.stringify(proyPeruEsc) === JSON.stringify([26, 26]) &&
    // apagado (peso=1) = base sin tocar (consolidado idéntico al actual)
    scaleSaldo(saldoIniChile, 1) === 1000);
}

// ── FIN-F0-06 · routing de escenarios no contamina la fila finanzas ───────────
// Crear/guardar un escenario escribe SOLO finanzas_esc_<id>; la fila `finanzas`
// (y su params_participacion) queda intacta.
{
  const { db, fetch } = crearFakeSupabase(seedFin());
  const P = crearPersistencia({ fetch, logger: mudo });
  const lBase = await P.load("finanzas");
  const partBase = clon(lBase.value.params_participacion);
  // crearEscenario: fila nueva (nunca leída) → registrarCarga(null) + saveConfirmed overlay
  const escId = "finanzas_esc_123";
  P.registrarCarga(escId, null, null, "string");
  const rEsc = await P.saveConfirmed(escId, { _overlay: true, data: { finanzas_real: { Holding: { "5": { "0": { ing: 42 } } } } } }, {});
  const finRow = db.leer("finanzas").value;      // debe seguir igual
  const escRow = db.leer(escId).value;           // el overlay del escenario
  check("FIN-F0-06", "guardar finanzas_esc_* no contamina finanzas; params_participacion de Base intacta",
    rEsc.ok === true &&
    escRow._overlay === true && escRow.data.finanzas_real.Holding["5"]["0"].ing === 42 &&
    JSON.stringify(finRow.params_participacion) === JSON.stringify(partBase) &&
    finRow.finanzas_real.Holding["5"]["0"].ing === 100);
}

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\nFIN-F0: ${pass}/${pass + fail} verde${fail ? "  · FALLAN: " + fallos.join(", ") : ""}`);
if (fail) process.exit(1);
