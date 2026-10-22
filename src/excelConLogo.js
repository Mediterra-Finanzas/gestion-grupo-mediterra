// Excel con el logo de Grupo Mediterra para los informes de Créditos.
// Recibe las MISMAS hojas que antes iban a xlsx-js-style ({ nombre, aoa, cols, niveles }) y
// solo cambia la presentación: logo arriba a la izquierda, título, encabezados destacados,
// formato de miles y página horizontal ajustada al ancho para imprimir. No toca los datos.
// ExcelJS se carga desde cdnjs, igual que en el módulo Frisku (sin dependencia npm nueva).
// Si no se puede cargar, se descarga igual con xlsx-js-style, sin logo, y se avisa.
import * as XLSX from 'xlsx-js-style';

export const LOGO_MEDITERRA = '/med.png';   // 269 × 152 px
let _exceljsP = null;
export function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_exceljsP) return _exceljsP;
  _exceljsP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    // Si el CDN no responde en 15 s, se descarga sin logo (con aviso) en vez de quedar esperando.
    const t = setTimeout(() => { _exceljsP = null; reject(new Error('timeout')); }, 15000);
    s.onload = () => { clearTimeout(t); resolve(window.ExcelJS); }; s.onerror = (e) => { clearTimeout(t); _exceljsP = null; reject(e); };
    document.body.appendChild(s);
  });
  return _exceljsP;
}
async function logoBase64() {
  const r = await fetch(LOGO_MEDITERRA);
  if (!r.ok) throw new Error('logo HTTP ' + r.status);
  const b = await r.blob();
  return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
}
const FILAS_LOGO = 3;   // filas reservadas arriba para el logo
const AZUL = 'FF1F2955';

// hojas: [{ nombre, aoa, cols?, niveles?, encabezados? (filas de encabezado), totales? (filas en negrita),
//           colsEnteras? (columnas de conteo, sin decimales), filasMonto? (filas donde esas columnas son montos),
//           filasUF? (filas con montos en UF: 4 decimales), ancha? (muchas columnas: impresión en varias páginas) }]
export async function descargarExcelConLogo(nombreArchivo, hojas) {
  let ExcelJS;
  try { ExcelJS = await cargarExcelJS(); } catch (e) { ExcelJS = null; }
  if (!ExcelJS) {
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => { const ws = XLSX.utils.aoa_to_sheet(h.aoa); if (h.cols) ws['!cols'] = h.cols; if (h.niveles) ws['!rows'] = h.niveles.map(l => (l ? { level: l } : {})); XLSX.utils.book_append_sheet(wb, ws, h.nombre); });
    XLSX.writeFile(wb, nombreArchivo);
    alert('No se pudo cargar el generador de Excel con logo: el archivo se descargó sin el logo.');
    return { conLogo: false };
  }
  let b64 = null; try { b64 = await logoBase64(); } catch (e) { b64 = null; }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Grupo Mediterra';
  const imgId = b64 ? wb.addImage({ base64: b64, extension: 'png' }) : null;
  hojas.forEach(h => {
    const ws = wb.addWorksheet(h.nombre, { views: [{ showGridLines: false }],
      // Hojas normales: una página de ancho. Hojas anchas (muchas columnas): escala legible y
      // encabezado repetido en cada página, en vez de achicar todo a una sola hoja.
      pageSetup: h.ancha
        ? { orientation: 'landscape', paperSize: 9, scale: 55, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } }
        : { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
      properties: { outlineProperties: { summaryBelow: false } } });
    ws.headerFooter.oddFooter = '&L&8Grupo Mediterra&R&8Página &P de &N';
    if (h.ancha && h.encabezados && h.encabezados.length) { const f = h.encabezados[0] + 1 + FILAS_LOGO; ws.pageSetup.printTitlesRow = `${f}:${f}`; }
    if (h.cols) ws.columns = h.cols.map(c => ({ width: (c && c.wch) || 12 }));
    // Logo con su proporción (269 × 152): 88 × 50 px.
    if (imgId !== null) ws.addImage(imgId, { tl: { col: 0.1, row: 0.15 }, ext: { width: 88, height: 50 } });
    ws.getRow(1).height = 20; ws.getRow(2).height = 20; ws.getRow(3).height = 8;
    const enc = new Set(h.encabezados || []), tot = new Set(h.totales || []), enteras = new Set(h.colsEnteras || []), dec4 = new Set(h.filasUF || []), montos = new Set(h.filasMonto || []);
    h.aoa.forEach((fila, i) => {
      const r = ws.getRow(i + 1 + FILAS_LOGO);
      (fila || []).forEach((v, j) => {
        const c = r.getCell(j + 1);
        c.value = v === undefined ? null : v;
        if (typeof v === 'number') c.numFmt = enteras.has(j) && !montos.has(i) ? '#,##0' : (dec4.has(i) ? '#,##0.0000' : '#,##0.00');
      });
      if (h.niveles && h.niveles[i]) r.outlineLevel = h.niveles[i];
      if (i === 0) r.getCell(1).font = { bold: true, size: 13, color: { argb: AZUL } };
      if (enc.has(i)) (fila || []).forEach((_, j) => { const c = r.getCell(j + 1);
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; c.alignment = { wrapText: true, vertical: 'middle' }; });
      if (tot.has(i)) (fila || []).forEach((_, j) => { const c = r.getCell(j + 1); c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EAF4' } }; });
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return { conLogo: imgId !== null };
}
