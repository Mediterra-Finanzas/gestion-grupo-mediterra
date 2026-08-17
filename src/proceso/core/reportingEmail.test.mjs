/* eslint-disable */
// Tests del armado del email del Informe Diario (node). Cifras SIEMPRE del snapshot.
import { construirEmailInformeDiario, totalesInformeDiario, filasInformeDiario } from "./reportingEmail.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

const snap = {
  fecha: "2026-08-16", timezone: "America/Santiago", planta_id: null, alcance: "general",
  total_kg_recibido: 12000, total_kg_procesado: 8000,
  clientes: [
    { cliente_vinculo_id: "aaaa", cliente_nombre: "Copefrut S.A.", kg_recibido: 10000, kg_procesado: 8000, cantidad_recepciones: 2, cantidad_ordenes: 1 },
    { cliente_vinculo_id: "bbbb", cliente_nombre: "Cliente B", kg_recibido: 2000, kg_procesado: 0, cantidad_recepciones: 1, cantidad_ordenes: 0 },
  ],
};
const ej = { asunto: "Allegria Service · Informe Diario de Operación · 16-08-2026", fecha_operacional: "2026-08-16", snapshot: snap };

// totales / filas desde snapshot
const tot = totalesInformeDiario(snap);
ok(tot.kg_recibido === 12000, "total recibido desde snapshot");
ok(tot.kg_procesado === 8000, "total procesado desde snapshot");
ok(tot.cantidad_clientes === 2, "2 clientes");
const filas = filasInformeDiario(snap);
ok(filas.length === 2, "2 filas");
ok(filas[0].cliente === "Copefrut S.A.", "fila cliente nombre");

// email: asunto, cifras formateadas es-CL, nombres visibles, sin UUID
const out = construirEmailInformeDiario(ej, { plantaNombre: "Rancagua" });
ok(out.asunto.includes("16-08-2026"), "asunto con fecha");
ok(out.html.includes("Copefrut S.A."), "html incluye cliente");
ok(out.html.includes("12.000"), "kg recibidos formateado miles es-CL (12.000)");
ok(out.html.includes("8.000"), "kg procesados formateado (8.000)");
ok(!out.html.includes("aaaa") && !out.html.includes("bbbb"), "E15: ningún UUID visible en el email");
ok(out.texto.includes("Copefrut"), "texto plano incluye cliente");

// alertas opcionales (E11-E14 conceptual: la alerta viaja como texto humano)
const outA = construirEmailInformeDiario(ej, { alertas: ["1 recepción sin conciliar", "2 clientes con contrato bloqueante"] });
ok(outA.html.includes("sin conciliar"), "alertas incluidas cuando se pasan");
const outNo = construirEmailInformeDiario(ej, {});
ok(!outNo.html.includes("Alertas operacionales"), "sin alertas no muestra bloque");

// sin movimiento: empty state legible, totales 0
const vacio = construirEmailInformeDiario({ fecha_operacional: "2026-08-16", snapshot: { fecha: "2026-08-16", clientes: [], total_kg_recibido: 0, total_kg_procesado: 0 } }, {});
ok(vacio.html.includes("Sin movimiento"), "empty state sin movimiento");
ok(vacio.totales.kg_recibido === 0, "totales 0 sin movimiento");

// escape HTML defensivo
const evil = construirEmailInformeDiario({ snapshot: { clientes: [{ cliente_nombre: "<script>x</script>", kg_recibido: 1, kg_procesado: 0 }] } }, {});
ok(!evil.html.includes("<script>"), "escapa HTML del nombre");

console.log(`\nreportingEmail tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
