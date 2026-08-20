/* eslint-disable */
// Tests de dominio proc_* F5 (node). Ejecutar: node src/proceso/core/procesoF5Domain.test.mjs
import { consolidar, transicionVersionValida, versionDatosEditables, envioValido, puedeMarcarEnviado } from "./procesoF5Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${b}, obtenido ${a})`);

// Consolidación PONDERADA (no promedio de %) — caso obligatorio del CFO
const c = consolidar([
  { kgProcesado: 1000, kgComercial: 900 },   // packout individual 90%
  { kgProcesado: 9000, kgComercial: 6300 },  // packout individual 70%
]);
eq(c.kgProcesados, 10000, "Σ kg procesados = 10000");
eq(c.kgComerciales, 7200, "Σ kg comerciales = 900 + 6300 = 7200");
eq(c.packout, 0.72, "packout consolidado = 7200/10000 = 0.72 (NO 0.80 promedio)");

// descarte/merma % también desde absolutos
const c2 = consolidar([{ kgProcesado: 9800, kgComercial: 7800, kgDescarte: 1700, kgMerma: 300 }]);
eq(c2.packout, Math.round((7800/9800)*10000)/10000, "packout = 7800/9800");
eq(c2.descartePct, Math.round((1700/9800)*10000)/10000, "descarte% = 1700/9800");
eq(c2.mermaPct, Math.round((300/9800)*10000)/10000, "merma% = 300/9800");

// Máquina de estados de versión
ok(transicionVersionValida("generada", "emitida"), "generada→emitida ok");
ok(transicionVersionValida("emitida", "reemplazada"), "emitida→reemplazada (nueva versión) ok");
ok(!transicionVersionValida("emitida", "generada"), "emitida→generada RECHAZA (inmutable)");
ok(!transicionVersionValida("reemplazada", "emitida"), "reemplazada→emitida RECHAZA");
ok(!transicionVersionValida("borrador", "emitida"), "borrador→emitida RECHAZA (pasa por generada)");
ok(versionDatosEditables("generada"), "datos editables en 'generada'");
ok(!versionDatosEditables("emitida"), "datos NO editables en 'emitida'");
ok(!versionDatosEditables("reemplazada"), "datos NO editables en 'reemplazada'");

// Envíos
ok(envioValido("pendiente") && envioValido("enviado") && envioValido("error"), "estados de envío válidos");
ok(!puedeMarcarEnviado("emitida", false).ok, "no marcar 'enviado' sin evidencia (solo generar PDF)");
ok(puedeMarcarEnviado("emitida", true).ok, "marcar 'enviado' con evidencia ok");
ok(!puedeMarcarEnviado("generada", true).ok, "no enviar versión no emitida");

console.log(`\nproc_* F5 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
