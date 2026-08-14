/* eslint-disable */
// Tests de dominio proc_* F7.1 (node). Ejecutar: node src/proceso/core/procesoF7Domain.test.mjs
import { formatearCorrelativo, compactarTemporada, evaluarQC, badgeDe, traducirError, validarFiltros, calcularNeto, validarPesos, packout, resumenConciliacion, accionesOrden, faltaParaCerrar, ordenTerminal, despachoTerminal, puedeConfirmarDespacho, accionesDespacho, totalKg, montoServicio, especificidadTarifa, vigenciaTarifa, baseEditable, accionesBase, servicioAgregableABase, totalesPorMoneda, filtrosActivos } from "./procesoF7Domain.js";

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

// Conciliación / packout (F7.3)
eq(packout(7800, 9800), 0.7959, "packout 7800/9800");
eq(resumenConciliacion({ entrada: 9800, comercial: 7800, descarte: 1700, merma: 300, tolerancia: 49 }).diff, 0, "conciliación cuadra diff 0");
ok(resumenConciliacion({ entrada: 9800, comercial: 7800, descarte: 1700, merma: 300, tolerancia: 49 }).cuadra, "cuadra dentro de tolerancia");
ok(!resumenConciliacion({ entrada: 9800, comercial: 7800, descarte: 1500, merma: 300, tolerancia: 49 }).cuadra, "descuadra 200 > tol 49");
eq(accionesOrden("en_proceso")[0].a, "pendiente_conciliacion", "acción de en_proceso");
ok(accionesOrden("cerrado").length === 0, "orden cerrada sin acciones");
ok(ordenTerminal("cerrado"), "cerrado es terminal");
ok(/por conciliar/i.test(faltaParaCerrar({ estado: "pendiente_conciliacion", entrada: 9800, comercial: 7800, descarte: 1500, merma: 300, tolerancia: 49 })), "falta: no cuadra");
ok(faltaParaCerrar({ estado: "pendiente_conciliacion", entrada: 9800, comercial: 7800, descarte: 1700, merma: 300, tolerancia: 49 }) === null, "nada falta cuando cuadra");

// Despacho (F7.5)
ok(despachoTerminal("despachado"), "despachado terminal");
ok(despachoTerminal("cancelado"), "cancelado terminal");
ok(!despachoTerminal("listo"), "listo no terminal");
ok(puedeConfirmarDespacho("listo"), "listo puede confirmar");
ok(!puedeConfirmarDespacho("borrador"), "borrador no puede confirmar");
eq(accionesDespacho("borrador")[0], "preparando", "borrador -> preparando");
ok(accionesDespacho("despachado").length === 0, "despachado sin transiciones simples");
eq(totalKg([{ estado: "confirmada", kg: 300 }, { estado: "reversada", kg: 200 }, { estado: "confirmada", kg: 200 }]), 500, "totalKg confirmadas");

// F7.7 Tarifario / Servicios / Base de cobro
eq(montoServicio(9800, 0.30), 2940, "9.800 kg × 0,30 = 2.940 (cantidad×tarifa)");
eq(montoServicio(9800, 0.3005), 2944.9, "redondeo a 2 decimales");
ok(montoServicio(null, 0.3) == null, "sin cantidad -> null (no $0)");
ok(montoServicio(100, null) == null, "sin tarifa -> null (no $0)");
eq(especificidadTarifa({}), "general", "tarifa general");
eq(especificidadTarifa({ cliente_vinculo_id: "c1", especie_codigo: "CHE" }), "cliente + especie", "específica cliente+especie");
eq(vigenciaTarifa({ vigencia_desde: "2026-01-01", vigencia_hasta: "2026-12-31" }, "2026-08-14"), "vigente", "vigente hoy");
eq(vigenciaTarifa({ vigencia_desde: "2027-01-01" }, "2026-08-14"), "futura", "vigencia futura");
eq(vigenciaTarifa({ vigencia_desde: "2025-01-01", vigencia_hasta: "2025-12-31" }, "2026-08-14"), "vencida", "vencida");
eq(vigenciaTarifa({ estado: "anulada", vigencia_desde: "2026-01-01" }, "2026-08-14"), "anulada", "estado no-vigente manda");
ok(baseEditable("borrador") && baseEditable("en_revision"), "base borrador/en_revision editable");
ok(!baseEditable("aprobada"), "base aprobada NO editable");
eq(accionesBase("borrador")[0].a, "aprobar", "base borrador -> aprobar");
ok(accionesBase("aprobada")[0].a === "enviada_a_facturacion", "aprobada -> enviar a facturación");
ok(accionesBase("cerrada").length === 0, "cerrada sin acciones");
ok(servicioAgregableABase("valorizado") && !servicioAgregableABase("pendiente_tarifa"), "solo valorizado se agrega a base");
const tm = totalesPorMoneda([{ subtotal: 2940, moneda: "USD" }, { subtotal: 100000, moneda: "CLP" }, { subtotal: 60, moneda: "USD" }]);
eq(tm.length, 2, "dos monedas no se mezclan");
eq(tm.find((x) => x.moneda === "USD").total, 3000, "USD suma 3.000");
eq(tm.find((x) => x.moneda === "CLP").total, 100000, "CLP separado");

// F7.8 Certificación de filtros — chips activos / acumulación / reset (helper puro)
{
  const F = (v1, v2, b) => filtrosActivos([{ key: "a", valor: v1 }, { key: "b", valor: v2 }], b);
  eq(F("", "", "").conteo, 0, "sin filtros -> 0 chips");
  eq(F("x", "", "").activos.length, 1, "un filtro activo -> 1 chip");
  eq(F("x", "y", "").activos.length, 2, "dos filtros -> 2 chips (acumulativo, no reemplazo)");
  eq(F("x", "y", "texto").conteo, 3, "dos filtros + búsqueda -> 3 activos");
  ok(!F("", "", "").hay, "nada activo -> reset oculto");
  ok(F("", "", "t").hay, "solo búsqueda -> hay activo");
  eq(F("todos", "", "").activos.length, 0, "'todos' no cuenta como filtro");
  ok(filtrosActivos(null, "").conteo === 0, "robusto ante filtros null");
}

// Filtros
ok(!validarFiltros({}).ok, "sin empresa -> inválido");
ok(validarFiltros({ empresa: "e1", fecha: "2026-12-05" }).ok, "con empresa+fecha -> válido");

console.log(`\nproc_* F7.1 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
