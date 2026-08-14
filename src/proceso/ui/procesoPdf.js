/* eslint-disable */
// src/proceso/ui/procesoPdf.js — PDF del Resultado de Proceso de Allegria Service.
// NEUTRAL (sin logo/branding Frisku). El PDF es representación del SNAPSHOT de la
// versión (proc_informe_version.snapshot), NUNCA de CURRENT. jsPDF se carga
// dinámicamente por CDN (mismo patrón operativo existente; sin dependencia npm).

// ── Datos del PDF (FUNCIÓN PURA, testeable): solo snapshot + meta resuelto ────
// snapshot = proc_informe_version.snapshot (resumen con números congelados).
// meta = { folio, version, temporada, emitido_at, responsable, identificacion:{...},
//          detalleLabeled:[{categoria,calibre,color,formato,cajas,kg}] }
export function buildResultadoPdfData(snapshot, meta = {}) {
  const r = (snapshot && snapshot.resumen) || {};
  const kgp = Number(r.kg_procesados) || 0;
  const kgc = Number(r.kg_comerciales) || 0;
  const packout = r.packout != null ? Number(r.packout) : (kgp > 0 ? Math.round((kgc / kgp) * 10000) / 10000 : null);
  const pct = (kg) => (kgp > 0 ? Math.round((Number(kg) / kgp) * 1000) / 10 : null);
  const detalle = (meta.detalleLabeled || []).map((d) => ({
    categoria: d.categoria || "—", calibre: d.calibre || "—", color: d.color || "—",
    formato: d.formato || "—", cajas: d.cajas ?? "", kg: Number(d.kg) || 0, pct: pct(d.kg),
  }));
  return {
    cabecera: { emisor: "Allegria Service", titulo: "Resultado de Proceso", folio: meta.folio || "—", version: meta.version != null ? `v${meta.version}` : "—", temporada: meta.temporada || "—" },
    identificacion: meta.identificacion || {},
    resumen: {
      kg_procesados: kgp, kg_comerciales: kgc,
      kg_descarte: Number(r.kg_descarte) || 0, kg_merma: Number(r.kg_merma) || 0,
      packout, packout_pct: packout != null ? Math.round(packout * 1000) / 10 : null,
      descarte_pct: pct(r.kg_descarte), merma_pct: pct(r.kg_merma),
    },
    detalle,
    observaciones: (snapshot && (snapshot.adicional && snapshot.adicional.observaciones)) || meta.observaciones || "",
    pie: { version: meta.version != null ? `v${meta.version}` : "—", emitido_at: meta.emitido_at || null, responsable: meta.responsable || "—" },
  };
}

// ── Carga dinámica de jsPDF + autotable (CDN; sin dependencia npm) ───────────
let _jspdf = null;
function _load(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function loadJsPDF() {
  if (_jspdf) return _jspdf;
  if (!window.jspdf) await _load("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable))
    await _load("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  _jspdf = window.jspdf.jsPDF; return _jspdf;
}

const fmt = (n) => `${Number(n || 0).toLocaleString("es-CL")}`;

// ── Render del PDF desde los datos (browser). Devuelve blob. ────────────────
export async function generarResultadoPdf(pdfData) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const NAVY = [30, 39, 97]; const M = 40; let y = 46;
  // Cabecera
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(pdfData.cabecera.emisor, M, 30);
  doc.setFontSize(13); doc.text(pdfData.cabecera.titulo, M, 50);
  doc.setFontSize(10); doc.text(`${pdfData.cabecera.folio}  ·  ${pdfData.cabecera.version}  ·  Temporada ${pdfData.cabecera.temporada}`, doc.internal.pageSize.getWidth() - M, 50, { align: "right" });
  y = 92; doc.setTextColor(30, 39, 51);
  // Identificación
  const idn = pdfData.identificacion; const idRows = Object.keys(idn).filter((k) => idn[k]).map((k) => [k.replace(/_/g, " "), String(idn[k])]);
  if (idRows.length) { doc.autoTable({ startY: y, theme: "plain", styles: { fontSize: 9 }, body: idRows, columnStyles: { 0: { fontStyle: "bold", textColor: [91, 107, 127], cellWidth: 120 } } }); y = doc.lastAutoTable.finalY + 12; }
  // Resumen (KPI packout)
  const rs = pdfData.resumen;
  doc.autoTable({ startY: y, theme: "grid", headStyles: { fillColor: NAVY, fontSize: 9 }, styles: { fontSize: 9 },
    head: [["Kg procesados", "Kg comerciales", "Packout", "Descarte", "Merma"]],
    body: [[fmt(rs.kg_procesados), fmt(rs.kg_comerciales), rs.packout_pct != null ? `${rs.packout_pct}%` : "—", `${fmt(rs.kg_descarte)} (${rs.descarte_pct ?? 0}%)`, `${fmt(rs.kg_merma)} (${rs.merma_pct ?? 0}%)`]] });
  y = doc.lastAutoTable.finalY + 14;
  // Detalle por dimensión
  if (pdfData.detalle.length) {
    doc.autoTable({ startY: y, theme: "striped", headStyles: { fillColor: NAVY, fontSize: 9 }, styles: { fontSize: 9 },
      head: [["Categoría", "Calibre", "Color", "Formato", "Cajas", "Kg", "%"]],
      body: pdfData.detalle.map((d) => [d.categoria, d.calibre, d.color, d.formato, d.cajas, fmt(d.kg), d.pct != null ? `${d.pct}%` : "—"]) });
    y = doc.lastAutoTable.finalY + 14;
  }
  // Observaciones
  if (pdfData.observaciones) { doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("Observaciones", M, y); doc.setFont("helvetica", "normal"); y += 12; doc.text(doc.splitTextToSize(String(pdfData.observaciones), doc.internal.pageSize.getWidth() - 2 * M), M, y); }
  // Pie
  const pie = pdfData.pie; const py = doc.internal.pageSize.getHeight() - 24;
  doc.setFontSize(8); doc.setTextColor(138, 151, 168);
  doc.text(`${pie.version}  ·  emitido ${pie.emitido_at ? new Date(pie.emitido_at).toLocaleString("es-CL") : "—"}  ·  ${pie.responsable}`, M, py);
  return doc.output("blob");
}

export function descargarBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
