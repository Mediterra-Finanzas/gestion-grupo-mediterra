/* eslint-disable */
// Tests de dominio proc_* F7.1 (node). Ejecutar: node src/proceso/core/procesoF7Domain.test.mjs
import { formatearCorrelativo, compactarTemporada, evaluarQC, badgeDe, traducirError, validarFiltros, calcularNeto, validarPesos } from "./procesoF7Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

// Correlativos (espejo del SQL)
eq(compactarTemporada("2026/2027"), "2627", "compacta 2026/2027 -> 2627");
eq(compactarTemporada("2526"), "2526", "compacta 2526 -> 2526");
eq(formatearCorrelativo("REC", "2026/2027", 1), "REC-2627-000001", "formato correlativo #1");
eq(formatearCorrelativo("PAL", "2026/2027", 42), "PAL-2627-000042", "formato correlativo #42");

// QC por severidad (espejo de proc_fn_registrar_qc)
const P = [
  { codigo: "firmeza", tipo_dato: "numero", rango_min: 60, rango_max: 90, severidad: "bloqueante", obligatorio: true },
  { codigo: "brix", tipo_dato: "numero", rango_min: 18, rango_max: 24, severidad: "advertencia", obligatorio: false },
  { codigo: "defectos", tipo_dato: "numero", rango_min: 0, rango_max: 5, severidad: "informativo", obligatorio: false },
];
eq(evaluarQC(P, { firmeza: "70", brix: "20", defectos: "2" }).resultado, "aprobado", "QC todo en rango -> aprobado");
eq(evaluarQC(P, { firmeza: "70", brix: "20", defectos: "12" }).resultado, "aprobado", "QC informativo fuera -> aprobado");
eq(evaluarQC(P, { firmeza: "70", brix: "30", defectos: "2" }).resultado, "condicional", "QC advertencia fuera -> condicional");
eq(evaluarQC(P, { firmeza: "40", brix: "20", defectos: "2" }).resultado, "rechazado", "QC bloqueante fuera -> rechazado");
ok(evaluarQC(P, { firmeza: "40" }).bloquea === true, "QC bloqueante -> bloquea true");
eq(evaluarQC(P, { brix: "20" }).resultado, "rechazado", "QC obligatorio faltante (bloqueante) -> rechazado");

// Estado -> badge
eq(badgeDe("en_proceso").tono, "primary", "en_proceso -> primary");
eq(badgeDe("pendiente_tarifa").tono, "warning", "pendiente_tarifa -> warning");
eq(badgeDe("bloqueado").tono, "danger", "bloqueado -> danger");
eq(badgeDe("desconocido").label, "desconocido", "estado desconocido -> passthrough");

// Traductor de errores
ok(/1450.*kg/i.test(traducirError("consumo 2000 excede disponible 1450.000 del lote abc")), "traduce stock lote");
ok(/no cuadra|tolerancia/i.test(traducirError("orden O1 no concilia: |diff|=150 > tolerancia=10")), "traduce conciliación");
ok(/permiso/i.test(traducirError("permission denied for table proc_lote")), "traduce permiso");
eq(traducirError(""), "Ocurrió un error inesperado.", "error vacío -> fallback");

// Pesos (kg_neto = bruto - tara)
eq(calcularNeto(10200, 200), 10000, "neto = 10200-200 = 10000");
ok(validarPesos({ bruto: 10200, tara: 200 }).ok, "pesos válidos");
eq(validarPesos({ bruto: 10200, tara: 200 }).neto, 10000, "validarPesos.neto");
ok(!validarPesos({ bruto: 100, tara: 200 }).ok, "neto negativo -> inválido");
ok(!validarPesos({ bruto: -5, tara: 0 }).ok, "bruto negativo -> inválido");

// Traductor QC gate
ok(/no puede consumirse|QC/i.test(traducirError("Lote no elegible para proceso: QC rechazado")), "traduce gate QC");

// Filtros
ok(!validarFiltros({}).ok, "sin empresa -> inválido");
ok(validarFiltros({ empresa: "e1", fecha: "2026-12-05" }).ok, "con empresa+fecha -> válido");

console.log(`\nproc_* F7.1 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
