/* eslint-disable */
// Test de la data del PDF (node). Ejecutar: node src/proceso/ui/procesoPdf.test.mjs
// Verifica: el PDF nace del SNAPSHOT (no CURRENT), folio/version presentes,
// totales correctos, packout del snapshot.
import { buildResultadoPdfData } from "./procesoPdf.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

// snapshot congelado (números duros) — como lo emite proc_fn_generar_version
const snapshot = {
  resumen: { kg_procesados: 9800, kg_comerciales: 7800, kg_descarte: 1700, kg_merma: 300, packout: 0.7959 },
  detalle: [{ categoria: "id-exp", calibre: "id-j", color: "id-mah", kg: 7800 }],
  adicional: { observaciones: "obs congelada" },
};
const meta = {
  folio: "RP-2627-000001", version: 1, temporada: "2026/2027", emitido_at: "2026-08-14T10:30:00Z",
  identificacion: { cliente: "Copefrut", productor: "El Parrón", especie: "CHE" },
  detalleLabeled: [{ categoria: "Exportable", calibre: "J", color: "Mahogany", formato: "CHE-5KG", cajas: 1560, kg: 7800 }],
  responsable: "Comercial",
};

const p = buildResultadoPdfData(snapshot, meta);
ok(p != null && p.cabecera && p.resumen, "genera estructura no vacía");
eq(p.cabecera.folio, "RP-2627-000001", "folio presente");
eq(p.cabecera.version, "v1", "version presente");
// números vienen del SNAPSHOT
eq(p.resumen.kg_procesados, 9800, "kg_procesados del snapshot");
eq(p.resumen.kg_comerciales, 7800, "kg_comerciales del snapshot");
eq(p.resumen.packout_pct, 79.6, "packout% del snapshot (79.6)");
eq(p.resumen.descarte_pct, 17.3, "descarte % derivado (1700/9800)");
eq(p.detalle[0].pct, 79.6, "detalle % derivado");
eq(p.detalle[0].categoria, "Exportable", "detalle usa etiqueta resuelta");
eq(p.observaciones, "obs congelada", "observaciones del snapshot");

// NO depende de CURRENT: sin detalleLabeled, el detalle queda vacío pero el resumen (snapshot) intacto
const p2 = buildResultadoPdfData(snapshot, { folio: "RP-X", version: 2 });
eq(p2.resumen.kg_comerciales, 7800, "resumen sigue del snapshot aunque falte labeling");
eq(p2.detalle.length, 0, "sin labels -> detalle vacío (no inventa desde CURRENT)");

console.log(`\nproc_* F7.6 PDF data tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
