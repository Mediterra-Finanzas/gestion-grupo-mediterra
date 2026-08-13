/* eslint-disable */
// Tests de dominio proc_* F6 (node). Ejecutar: node src/proceso/core/procesoF6Domain.test.mjs
import { round2, calcularSubtotal, resolverTarifa, claveIdempotencia, transicionBaseValida, baseEditable, validarManual } from "./procesoF6Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${b}, obtenido ${a})`);

// Subtotal proceso: 9800 kg × 0.30 = 2940
eq(calcularSubtotal(9800, 0.30), 2940, "9800 × 0.30 = 2940 (kg PROCESADOS)");
eq(round2(2940.005), 2940.01, "redondeo monetario a 2 decimales");

// Resolución de tarifa por vigencia (punto 4)
const T = [
  { id: "gen", tipo_servicio_id: "proceso", estado: "vigente", vigencia_desde: "2026-01-01", vigencia_hasta: null, cliente_vinculo_id: null, temporada_codigo: null, especie_codigo: null, tarifa: 0.25, prioridad: 0 },
  { id: "A",   tipo_servicio_id: "proceso", estado: "vigente", vigencia_desde: "2026-12-01", vigencia_hasta: "2026-12-15", cliente_vinculo_id: "cli", temporada_codigo: null, especie_codigo: null, tarifa: 0.30, prioridad: 0 },
  { id: "B",   tipo_servicio_id: "proceso", estado: "vigente", vigencia_desde: "2026-12-16", vigencia_hasta: null, cliente_vinculo_id: "cli", temporada_codigo: null, especie_codigo: null, tarifa: 0.35, prioridad: 0 },
];
eq(resolverTarifa(T, { cliente: "cli", tipoServicio: "proceso", fecha: "2026-12-10" })?.id, "A", "10-dic → tarifa A (0.30), no B ni general");
eq(resolverTarifa(T, { cliente: "cli", tipoServicio: "proceso", fecha: "2026-12-20" })?.id, "B", "20-dic → tarifa B (0.35)");
eq(resolverTarifa(T, { cliente: "otro", tipoServicio: "proceso", fecha: "2026-12-10" })?.id, "gen", "cliente sin tarifa específica → general");
ok(resolverTarifa(T, { cliente: "cli", tipoServicio: "proceso", fecha: "2025-06-01" }) == null, "fecha antes de toda vigencia → null (pendiente_tarifa)");

// Especificidad: especie-específica gana sobre general
const T2 = [
  { id: "gen", tipo_servicio_id: "s", estado: "vigente", vigencia_desde: "2026-01-01", cliente_vinculo_id: "cli", temporada_codigo: null, especie_codigo: null, tarifa: 0.30, prioridad: 0 },
  { id: "esp", tipo_servicio_id: "s", estado: "vigente", vigencia_desde: "2026-01-01", cliente_vinculo_id: "cli", temporada_codigo: null, especie_codigo: "CHE", tarifa: 0.40, prioridad: 0 },
];
eq(resolverTarifa(T2, { cliente: "cli", especie: "CHE", tipoServicio: "s", fecha: "2026-06-01" })?.id, "esp", "especie-específica gana");

// Idempotencia
eq(claveIdempotencia("orden", "O1", "proceso"), "orden:O1:srv:proceso", "clave idempotencia");

// Estados de base
ok(transicionBaseValida("borrador", "aprobada"), "borrador→aprobada ok");
ok(transicionBaseValida("aprobada", "enviada_a_facturacion"), "aprobada→enviada ok");
ok(!transicionBaseValida("aprobada", "borrador"), "aprobada→borrador RECHAZA (inmutable)");
ok(!transicionBaseValida("cerrada", "aprobada"), "cerrada terminal");
ok(baseEditable("borrador"), "borrador editable");
ok(!baseEditable("aprobada"), "aprobada NO editable");

// Manual exige motivo/autorización
ok(!validarManual({}).ok, "manual sin motivo/autorización → rechaza");
ok(validarManual({ motivo: "x", autorizadoPor: "u" }).ok, "manual con motivo+autorización ok");

console.log(`\nproc_* F6 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
