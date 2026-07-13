/* eslint-disable */
// Tests del motor de overlay — ejecutar: node src/escenarioOverlay.test.mjs
import { computeOverlay, applyOverlay, deepEqual, overlayVacio } from "./escenarioOverlay.js";

let fallos = 0;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
  if (!cond) fallos++;
}
const J = (x) => JSON.stringify(x);

// ── (1) Idénticos → overlay vacío, merge devuelve el base ──────────
{
  const base = { a: 1, b: { c: 2 }, arr: [1, 2] };
  const actual = { a: 1, b: { c: 2 }, arr: [1, 2] };
  const ov = computeOverlay(base, actual);
  check("(1) idénticos → overlay null/vacío", overlayVacio(ov), `ov=${J(ov)}`);
  check("(1) merge(base, ov) === base", deepEqual(applyOverlay(base, ov), base));
}

// ── (2) Round-trip general: merge(base, diff(base,actual)) === actual
{
  const base = { x: 1, y: { p: 10, q: 20 }, z: [1, 2, 3], w: "hola" };
  const actual = { x: 1, y: { p: 99, q: 20 }, z: [1, 2, 3], w: "chao", nuevo: 5 };
  const ov = computeOverlay(base, actual);
  check("(2) round-trip merge(base,diff)===actual", deepEqual(applyOverlay(base, ov), actual), `ov=${J(ov)}`);
  // El overlay solo captura lo cambiado: y.p, w, nuevo (no y.q, no x, no z)
  check("(2) overlay disperso (no incluye ramas iguales)",
    ov.x === undefined && ov.z === undefined && ov.y.q === undefined);
}

// ── (3) HERENCIA VIVA: un cambio en el BASE fluye al escenario ──────
//    salvo la rama que el escenario tocó.
{
  const baseV1 = { osiris: { royaltyIQ: 100 }, allegria: { kg: 1000 }, tasa: 5 };
  // El escenario cambió SOLO allegria.kg = 2000.
  const escenarioEstado = { osiris: { royaltyIQ: 100 }, allegria: { kg: 2000 }, tasa: 5 };
  const overlay = computeOverlay(baseV1, escenarioEstado);
  // Ahora el usuario edita el BASE: osiris.royaltyIQ 100→300 y tasa 5→7.
  const baseV2 = { osiris: { royaltyIQ: 300 }, allegria: { kg: 1000 }, tasa: 7 };
  const escFinal = applyOverlay(baseV2, overlay);
  check("(3a) el escenario HEREDA el cambio del base (royaltyIQ=300)", escFinal.osiris.royaltyIQ === 300, `=${escFinal.osiris.royaltyIQ}`);
  check("(3b) el escenario HEREDA el cambio del base (tasa=7)", escFinal.tasa === 7, `=${escFinal.tasa}`);
  check("(3c) el escenario CONSERVA su override (kg=2000)", escFinal.allegria.kg === 2000, `=${escFinal.allegria.kg}`);
}

// ── (4) Arrays atómicos: agregar/quitar línea ─────────────────────
{
  const base = { added: { Osiris: { ing_op: [{ label: "L1", vals: {} }] } } };
  // Escenario agrega una línea L2.
  const esc = { added: { Osiris: { ing_op: [{ label: "L1", vals: {} }, { label: "L2", vals: {} }] } } };
  const ov = computeOverlay(base, esc);
  const merged = applyOverlay(base, ov);
  check("(4a) array del escenario (2 líneas) manda", merged.added.Osiris.ing_op.length === 2);
  // El array es atómico: si el base agrega L0, el escenario NO lo hereda (documentado).
  const base2 = { added: { Osiris: { ing_op: [{ label: "L0", vals: {} }, { label: "L1", vals: {} }] } } };
  const merged2 = applyOverlay(base2, ov);
  check("(4b) array tocado por el escenario NO hereda cambios del base (atómico)",
    merged2.added.Osiris.ing_op.length === 2 && merged2.added.Osiris.ing_op[0].label === "L1");
}

// ── (5) Baja de clave (borrar) ────────────────────────────────────
{
  const base = { a: 1, b: 2, c: 3 };
  const esc = { a: 1, c: 3 };           // el escenario borró 'b'
  const ov = computeOverlay(base, esc);
  const merged = applyOverlay(base, ov);
  check("(5) baja de clave: 'b' no está en el merge", !("b" in merged) && merged.a === 1 && merged.c === 3, `ov=${J(ov)}`);
}

// ── (6) Cambio de tipo (objeto → número) ──────────────────────────
{
  const base = { v: { detalle: 1 } };
  const esc = { v: 42 };
  const ov = computeOverlay(base, esc);
  const merged = applyOverlay(base, ov);
  check("(6) cambio de tipo objeto→número", merged.v === 42);
}

// ── (7) _proyOverrides anidado (caso real del flujo) ──────────────
{
  const base = { finanzas_real: { Osiris: { _proyOverrides: { "Royalty IQ": { "15": 700 } } } } };
  // Escenario cambia solo el mes 15 de Royalty IQ.
  const esc = { finanzas_real: { Osiris: { _proyOverrides: { "Royalty IQ": { "15": 999 } } } } };
  const ov = computeOverlay(base, esc);
  // Base agrega un override en OTRA línea/mes.
  const base2 = { finanzas_real: { Osiris: { _proyOverrides: { "Royalty IQ": { "15": 700 }, "Fee Vivero": { "20": 50 } } } } };
  const merged = applyOverlay(base2, ov);
  check("(7a) escenario conserva su override (mes15=999)", merged.finanzas_real.Osiris._proyOverrides["Royalty IQ"]["15"] === 999);
  check("(7b) escenario hereda el override nuevo del base (Fee Vivero mes20=50)",
    merged.finanzas_real.Osiris._proyOverrides["Fee Vivero"] && merged.finanzas_real.Osiris._proyOverrides["Fee Vivero"]["20"] === 50);
}

// ── (8) No muta el base ───────────────────────────────────────────
{
  const base = { a: { b: 1 } };
  const snapshot = J(base);
  const ov = computeOverlay(base, { a: { b: 2 } });
  applyOverlay(base, ov);
  check("(8) applyOverlay no muta el base", J(base) === snapshot);
}

console.log("");
if (fallos === 0) console.log("TODOS LOS TESTS PASARON ✓");
else console.log(`✗ ${fallos} TEST(S) FALLARON`);
process.exit(fallos === 0 ? 0 : 1);
