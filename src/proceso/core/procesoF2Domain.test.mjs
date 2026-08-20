/* eslint-disable */
// Tests de dominio proc_* F2 (node). Ejecutar: node src/proceso/core/procesoF2Domain.test.mjs
import {
  onHandTotal, saldoPorUbicacion, pctDerivado, conciliacionOrden,
  transicionOrdenValida, ordenEsEditable, validarQcValor, consumoLineageConsistente,
} from "./procesoF2Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${b}, obtenido ${a})`);

// ── Traslado interno NO cambia el stock físico total (DF2-5) ─────────────────
const U_A = "aaaa", U_B = "bbbb";
const movs = [
  { naturaleza: "entrada", cantidad: 10000, ubicacion_destino_id: U_A },       // recepción en A
  { naturaleza: "transferencia", cantidad: 2000, ubicacion_origen_id: U_A, ubicacion_destino_id: U_B }, // A→B
];
eq(onHandTotal(movs), 10000, "traslado NO cambia total (sigue 10000)");
const porUbic = saldoPorUbicacion(movs);
eq(porUbic[U_A], 8000, "ubicación A = 10000 − 2000 = 8000");
eq(porUbic[U_B], 2000, "ubicación B = 2000");
eq(porUbic[U_A] + porUbic[U_B], 10000, "suma por ubicación = total físico (sin doble conteo)");

// consumo (salida) reduce total y ubicación
const movs2 = movs.concat([{ naturaleza: "salida", cantidad: 3000, ubicacion_origen_id: U_B }]);
eq(onHandTotal(movs2), 7000, "consumo 3000 → total 7000");
eq(saldoPorUbicacion(movs2)[U_B], -1000 + 0, "B = 2000 − 3000 = -1000 (consumió más de lo ubicado en B; el guard RPC lo evita en runtime)");

// ── pct derivado ─────────────────────────────────────────────────────────────
eq(pctDerivado(3000, 10000), 0.3, "pct = 3000/10000 = 0.3");
eq(pctDerivado(5, 0), null, "pct con inicial 0 = null");

// ── Conciliación de masa (descarte y merma separados) ───────────────────────
const c = conciliacionOrden(9800, { resultado: 7800, descarte: 1700, merma: 300 }, 0.5);
ok(c.ok, "orden concilia: 7800+1700+300 = 9800");
eq(c.diff, 0, "diff = 0");
const c2 = conciliacionOrden(9800, { resultado: 7800, descarte: 1700, merma: 200 }, 0.5);
ok(!c2.ok, "faltan 100 kg (> tol 49) → descuadre");
const c3 = conciliacionOrden(9800, { resultado: 7800, descarte: 1960, merma: 20 }, 0.5); // dentro de tol (49)
ok(c3.ok, "dentro de tolerancia (diff 20 ≤ 49) → concilia");

// ── Máquina de estados de la orden ──────────────────────────────────────────
ok(transicionOrdenValida("borrador", "en_proceso"), "borrador→en_proceso ok");
ok(transicionOrdenValida("en_proceso", "pendiente_conciliacion"), "en_proceso→pendiente ok");
ok(transicionOrdenValida("pendiente_conciliacion", "conciliado"), "pendiente→conciliado ok");
ok(transicionOrdenValida("conciliado", "cerrado"), "conciliado→cerrado ok");
ok(!transicionOrdenValida("en_proceso", "cerrado"), "en_proceso→cerrado RECHAZA (no salta conciliación)");
ok(!transicionOrdenValida("borrador", "conciliado"), "borrador→conciliado RECHAZA");
ok(!transicionOrdenValida("cerrado", "en_proceso"), "cerrado→* RECHAZA (orden cerrada no editable)");
ok(!ordenEsEditable("cerrado"), "orden cerrada NO editable");
ok(ordenEsEditable("en_proceso"), "orden en_proceso editable");

// ── QC configurable (validación de tipo/rango; no depósito sin estructura) ──
const pFirmeza = { codigo: "firmeza", tipo_dato: "numero", rango_min: 200, rango_max: 400, obligatorio: true };
ok(validarQcValor(pFirmeza, 300).ok, "firmeza 300 dentro de rango");
ok(!validarQcValor(pFirmeza, 500).ok, "firmeza 500 > máximo → rechaza");
ok(!validarQcValor(pFirmeza, null).ok, "firmeza obligatoria sin valor → rechaza");
ok(!validarQcValor(pFirmeza, "abc").ok, "firmeza no-número → rechaza");
ok(validarQcValor({ codigo: "obs", tipo_dato: "texto", obligatorio: false }, "").ok, "texto opcional vacío ok");

// ── Lineage de consumo exige movimiento de ledger ───────────────────────────
ok(consumoLineageConsistente({ movimiento_id: "m1", kg: 100 }).ok, "consumo con movimiento ok");
ok(!consumoLineageConsistente({ kg: 100 }).ok, "lineage sin movimiento → PROHIBIDO");

console.log(`\nproc_* F2 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
