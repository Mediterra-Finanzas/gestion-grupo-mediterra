/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// REPORTES DE CRÉDITOS — Excel (ExcelJS) y PDF (jsPDF + autoTable). oct-2026
//
// Ambos archivos se arman desde las MISMAS tablas que la pantalla (tablasReporte):
// mismas filas, mismos subtotales, mismo encabezado de filtros. Aquí no se calcula
// nada; solo se da formato.
// Librerías: las que la app ya carga desde cdnjs (ExcelJS 4.4.0 en Frisku; jsPDF 2.5.1
// + autoTable 3.8.2 en el Reporte Semanal). Sin dependencias npm nuevas. Se inyectan,
// así las pruebas y los archivos de ejemplo usan exactamente el mismo código.
// Logos: se dibujan con su proporción natural dentro de una caja (nunca se estiran).
// ═══════════════════════════════════════════════════════════════════
import { formatoCelda } from './reporteCreditos.js';

const TEAL = [15, 118, 110], TEAL_VL = [204, 251, 241], GRIS = [102, 102, 102], OSC = [51, 51, 51];
const FILL_SUB = [240, 244, 248], FILL_TOT = [226, 232, 240], FILL_SEC = [204, 251, 241];
const hex = (rgb) => rgb.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

// Caja de logo: ancho×alto máximos → tamaño con la proporción natural.
export function encajar(w, h, maxW, maxH) {
  if (!(w > 0 && h > 0)) return { w: maxW, h: maxH };
  const k = Math.min(maxW / w, maxH / h);
  return { w: w * k, h: h * k };
}

export const nombreArchivo = (T, corte, ext) => {
  const base = T.alcance === 'empresa' ? `Creditos_${T.empresa}` : 'Creditos_Consolidado';
  return `${base}_corte_${corte}.${ext}`.replace(/\s+/g, '_').normalize('NFD').replace(/[̀-ͯ]/g, '');
};

// ── Carga de librerías (navegador) ───────────────────────────────────
let _excelP = null, _pdfP = null;
const script = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
export function cargarExcelJS() {
  if (typeof window !== 'undefined' && window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return _excelP || (_excelP = script('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js').then(() => window.ExcelJS).catch(e => { _excelP = null; throw e; }));
}
export function cargarJsPDF() {
  if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve(window.jspdf.jsPDF);
  return _pdfP || (_pdfP = script('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(() => (window.jspdf.jsPDF.API.autoTable ? null : script('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')))
    .then(() => window.jspdf.jsPDF).catch(e => { _pdfP = null; throw e; }));
}
// Logo → { dataUrl, base64, ext, w, h } con su tamaño NATURAL (para no deformarlo).
export async function cargarLogo(src) {
  const r = await fetch(src); if (!r.ok) throw new Error(`logo ${src}: HTTP ${r.status}`);
  const blob = await r.blob();
  const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  const dim = await new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 0, h: 0 }); i.src = dataUrl; });
  const ext = /jpe?g/i.test(blob.type) || /\.jpe?g$/i.test(src) ? 'jpeg' : 'png';
  return { dataUrl, base64: dataUrl.split(',')[1], ext, ...dim };
}
export function descargarBlob(blob, nombre) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ── Excel ────────────────────────────────────────────────────────────
const fmtNum = (col, moneda) => (col.tipo === 'entero' ? '0' : col.tipo === 'usd' ? '#,##0.00' : moneda === 'CLP' ? '#,##0' : moneda === 'UF' ? '#,##0.0000' : '#,##0.00');
const anchoCol = (col) => (col.tipo === 'texto' ? (/(empresa|acreedor)/i.test(col.k) ? 24 : /Id$/.test(col.k) ? 18 : /tcTxt|estadoTxt|corteTxt|perimetro/.test(col.k) ? 22 : 12) : col.tipo === 'fecha' ? 11 : col.tipo === 'entero' ? 8 : 16);

function encabezadoHoja(wb, ws, T, logo, titulo, nCols) {
  ws.views = [{ showGridLines: false }];
  let fila = 1;
  if (logo && logo.base64) {
    const id = wb.addImage({ base64: logo.base64, extension: logo.ext });
    const d = encajar(logo.w, logo.h, 170, 52);                 // px, proporción natural
    ws.addImage(id, { tl: { col: 0.15, row: 0.2 }, ext: { width: Math.round(d.w), height: Math.round(d.h) }, editAs: 'oneCell' });
  }
  ws.getRow(1).height = 22; ws.getRow(2).height = 18; ws.getRow(3).height = 6;
  const t = ws.getCell(1, 3); t.value = T.titulo; t.font = { bold: true, size: 14, color: { argb: 'FF' + hex(TEAL) } };
  const s = ws.getCell(2, 3); s.value = titulo; s.font = { size: 10, color: { argb: 'FF' + hex(GRIS) } };
  fila = 4;
  for (let c = 1; c <= nCols; c++) ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: 'FF' + hex(TEAL) } } };
  T.encabezado.forEach(([k, v]) => {
    ws.getCell(fila, 1).value = k; ws.getCell(fila, 1).font = { bold: true, size: 9, color: { argb: 'FF' + hex(OSC) } };
    ws.getCell(fila, 3).value = v; ws.getCell(fila, 3).font = { size: 9 }; fila++;
  });
  if (T.tcUsados.length) {
    ws.getCell(fila, 1).value = 'Tipos de cambio usados'; ws.getCell(fila, 1).font = { bold: true, size: 9 };
    ws.getCell(fila, 3).value = T.tcUsados.map(x => `${x.moneda}: ${x.tc} por US$ · ${x.fecha} · ${x.fuente} · ${x.par}`).join('  |  ');
    ws.getCell(fila, 3).font = { size: 9 }; fila++;
  }
  T.avisos.forEach(a => { const c = ws.getCell(fila, 1); c.value = '⚠ ' + a; c.font = { size: 9, color: { argb: 'FF9A3412' } }; fila++; });
  return fila + 1;
}
function tablaHoja(ws, tabla, fila0, { autoFiltro = false } = {}) {
  let fila = fila0;
  const cab = ws.getRow(fila);
  tabla.columnas.forEach((col, i) => {
    const c = cab.getCell(i + 1); c.value = col.t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex(TEAL) } };
  });
  cab.height = 30;
  const filaCab = fila; fila++;
  if (!tabla.filas.length) { ws.getCell(fila, 1).value = 'Sin resultados para los filtros elegidos.'; ws.getCell(fila, 1).font = { italic: true, size: 9 }; return { fin: fila + 1, filaCab }; }
  tabla.filas.forEach(f => {
    const r = ws.getRow(fila);
    tabla.columnas.forEach((col, i) => {
      const c = r.getCell(i + 1); let v = f.celdas[col.k];
      if (col.tipo === 'fecha' && v) { const [y, m, d] = v.split('-').map(Number); v = new Date(Date.UTC(y, m - 1, d)); c.numFmt = 'dd-mm-yyyy'; }
      else if (col.tipo === 'monto' || col.tipo === 'usd' || col.tipo === 'entero') {
        if (v === null && col.tipo === 'usd') v = 'sin TC';
        else if (typeof v === 'number') c.numFmt = fmtNum(col, f.moneda);
      }
      c.value = v === undefined ? null : v;
      c.font = { size: 9, bold: f.tipo !== 'dato' };
      if (f.tipo !== 'dato') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex(f.tipo === 'total' ? FILL_TOT : f.tipo === 'seccion' ? FILL_SEC : FILL_SUB) } };
      if (f.tipo === 'total') c.border = { top: { style: 'thin', color: { argb: 'FF' + hex(TEAL) } } };
    });
    fila++;
  });
  if (autoFiltro) ws.autoFilter = { from: { row: filaCab, column: 1 }, to: { row: fila - 1, column: tabla.columnas.length } };
  return { fin: fila + 1, filaCab };
}
// T = tablasReporte(...). Devuelve el Workbook de ExcelJS (writeBuffer lo serializa).
export function libroExcel(T, { ExcelJS, logo = null, generado = '' }) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Grupo Mediterra — Finanzas'; wb.created = new Date();
  const hojas = [
    ['Resumen', [T.resumen], 'Resumen por empresa y moneda (moneda original + USD al corte)'],
    ['Créditos', [T.creditos], 'Detalle de créditos'],
    ['Cuotas y pagos', [T.cuotas, T.pagos], 'Detalle de cuotas (por vencimiento) y pagos registrados (por fecha efectiva)'],
  ];
  hojas.forEach(([nombre, tablas, sub]) => {
    const nCols = Math.max(...tablas.map(t => t.columnas.length));
    const ws = wb.addWorksheet(nombre, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    tablas[0].columnas.forEach((col, i) => { ws.getColumn(i + 1).width = anchoCol(col); });
    if (tablas[1]) tablas[1].columnas.forEach((col, i) => { ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width || 0, anchoCol(col)); });
    let fila = encabezadoHoja(wb, ws, T, logo, `${sub}${generado ? ' · generado ' + generado : ''}`, nCols);
    let primeraCab = null;
    tablas.forEach((t, i) => {
      if (tablas.length > 1) { const c = ws.getCell(fila, 1); c.value = t.titulo; c.font = { bold: true, size: 11, color: { argb: 'FF' + hex(TEAL) } }; fila++; }
      const r = tablaHoja(ws, t, fila, { autoFiltro: tablas.length === 1 });
      if (primeraCab === null) primeraCab = r.filaCab;
      fila = r.fin;
    });
    ws.views = [{ state: 'frozen', ySplit: tablas.length === 1 ? primeraCab : 0, showGridLines: false }];
    ws.pageSetup.printTitlesRow = tablas.length === 1 ? `${primeraCab}:${primeraCab}` : undefined;
    ws.headerFooter.oddFooter = '&L' + T.titulo + '&RPágina &P de &N';
  });
  return wb;
}

// ── PDF ──────────────────────────────────────────────────────────────
// Columnas que van al PDF (el Excel lleva todas). Se omiten solo las que el ancho de
// A4 apaisado no admite; ninguna cifra de saldo, conciliación o TC se omite.
const PDF_OMITIR = { creditos: ['perimetro', 'desembolso', 'nPagos'], cuotas: [], pagos: [] };
export function documentoPDF(T, { JsPDF, logo = null, generado = '' }) {
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), m = 10;
  const ALTO_CAB = 20;
  const cabecera = () => {
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, ALTO_CAB, 'F');
    if (logo && logo.dataUrl) { const d = encajar(logo.w, logo.h, 34, 13); doc.addImage(logo.dataUrl, logo.ext.toUpperCase(), m, 3.5 + (13 - d.h) / 2, d.w, d.h, 'logo-reporte', 'FAST'); }   // alias: una sola copia en el archivo
    doc.setTextColor(...TEAL); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(T.titulo, m + 38, 9);
    doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`${T.encabezado[1][0]}: ${T.encabezado[1][1]}`.slice(0, 160), m + 38, 14);
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.6); doc.line(m, ALTO_CAB - 1, W - m, ALTO_CAB - 1);
  };
  const pie = () => {
    doc.setFontSize(7); doc.setTextColor(...GRIS);
    doc.text(`Grupo Mediterra · Finanzas · Créditos${generado ? ' · generado ' + generado : ''} · datos según la app al corte`, m, H - 5);
  };
  cabecera();
  let y = ALTO_CAB + 3;
  doc.setFontSize(8); doc.setTextColor(...OSC);
  const lineas = [...T.encabezado.map(([k, v]) => `${k}: ${v}`),
    ...(T.tcUsados.length ? ['Tipos de cambio usados: ' + T.tcUsados.map(x => `${x.moneda} ${x.tc} por US$ (${x.fecha}, ${x.fuente})`).join(' · ')] : [])];
  lineas.forEach(l => { doc.splitTextToSize(l, W - 2 * m).forEach(t => { doc.text(t, m, y); y += 3.6; }); });
  if (T.avisos.length) { doc.setTextColor(154, 52, 18); T.avisos.forEach(a => doc.splitTextToSize('⚠ ' + a, W - 2 * m).forEach(t => { doc.text(t.replace('⚠', '!'), m, y); y += 3.6; })); }
  y += 2;
  const seccion = (tabla, clave) => {
    const cols = tabla.columnas.filter(c => !(PDF_OMITIR[clave] || []).includes(c.k));
    if (y > H - 30) { doc.addPage(); y = ALTO_CAB + 4; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TEAL); doc.text(tabla.titulo, m, y); y += 2;
    const body = tabla.filas.length ? tabla.filas.map(f => cols.map(c => formatoCelda(f.celdas[c.k], c, f.moneda)))
      : [[{ content: 'Sin resultados para los filtros elegidos.', colSpan: cols.length, styles: { fontStyle: 'italic' } }]];
    doc.autoTable({
      startY: y, head: [cols.map(c => c.t)], body, showHead: 'everyPage', theme: 'grid',
      margin: { top: ALTO_CAB + 3, left: m, right: m, bottom: 10 },
      styles: { fontSize: clave === 'resumen' ? 6.6 : 5.8, cellPadding: 0.9, overflow: 'linebreak', textColor: OSC, lineColor: [220, 226, 232], lineWidth: 0.1 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: ['monto', 'usd', 'entero'].includes(c.tipo) ? 'right' : 'left' }])),
      didParseCell: (d) => {
        if (d.section !== 'body' || !tabla.filas.length) return;
        const f = tabla.filas[d.row.index]; if (!f || f.tipo === 'dato') return;
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = f.tipo === 'total' ? FILL_TOT : f.tipo === 'seccion' ? FILL_SEC : FILL_SUB;
      },
      rowPageBreak: 'avoid',                                   // una fila no se parte entre páginas
      didDrawPage: () => { cabecera(); pie(); },
    });
    y = doc.lastAutoTable.finalY + 6;
  };
  seccion(T.resumen, 'resumen');
  seccion(T.creditos, 'creditos');
  seccion(T.cuotas, 'cuotas');
  seccion(T.pagos, 'pagos');
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...GRIS); doc.text(`Página ${i} de ${n}`, W - m, H - 5, { align: 'right' }); }
  return doc;
}
