/* Verificación de los archivos de Reportes de Créditos contra las tablas de pantalla
   (tablasReporte). La usan scripts/creditos/ejemplos-reporte.mjs y el e2e de navegador. */
import { execFileSync } from 'child_process';

const valorExcel = (v) => (v && typeof v === 'object' && 'result' in v ? v.result : v instanceof Date ? v.toISOString().slice(0, 10) : v);

// Cada tabla se busca por su fila de encabezado y se compara celda a celda.
export function compararTabla(ws, tabla) {
  let fCab = 0;
  ws.eachRow((r, i) => { if (!fCab && tabla.columnas.every((c, j) => r.getCell(j + 1).value === c.t)) fCab = i; });
  if (!fCab) return 'sin encabezado';
  if (!tabla.filas.length) return /Sin resultados/.test(String(ws.getCell(fCab + 1, 1).value)) ? null : 'vacío no rotulado';
  for (let i = 0; i < tabla.filas.length; i++) {
    const f = tabla.filas[i];
    for (let j = 0; j < tabla.columnas.length; j++) {
      const col = tabla.columnas[j], esp = f.celdas[col.k], v = valorExcel(ws.getCell(fCab + 1 + i, j + 1).value);
      if (typeof esp === 'number') { if (typeof v !== 'number' || Math.abs(v - esp) > 1e-6) return `fila ${i + 1} «${col.t}»: Excel ${v} ≠ ${esp}`; }
      else if (typeof esp === 'string' && (col.tipo === 'monto' || col.tipo === 'usd')) { if (v !== esp) return `fila ${i + 1} «${col.t}»: ${v} ≠ ${esp}`; }
      else if (esp === null && col.tipo === 'usd') { if (v !== 'sin TC') return `fila ${i + 1} «${col.t}»: ${v} ≠ sin TC`; }
      else if (col.tipo === 'texto' && esp != null && String(v) !== String(esp)) return `fila ${i + 1} «${col.t}»: ${v} ≠ ${esp}`;
      else if (col.tipo === 'fecha' && esp && v !== esp) return `fila ${i + 1} «${col.t}»: ${v} ≠ ${esp}`;
    }
  }
  return null;
}

// Devuelve la lista de diferencias (vacía = Excel idéntico a la pantalla).
export function compararLibro(rb, T) {
  return [compararTabla(rb.getWorksheet('Resumen'), T.resumen), compararTabla(rb.getWorksheet('Créditos'), T.creditos),
    compararTabla(rb.getWorksheet('Cuotas y pagos'), T.cuotas), compararTabla(rb.getWorksheet('Cuotas y pagos'), T.pagos)].filter(Boolean);
}

// Comprueba el PDF con pdftotext (poppler). Devuelve [[nombre, ok, detalle], ...].
export function verificarPDF(fp, rep, T) {
  const out = [];
  // Texto del PDF (pdftotext, poppler): cada cuota y cada pago exactamente una vez.
  const paginas = execFileSync('pdftotext', ['-layout', fp, '-'], { encoding: 'utf8' }).split('\f').filter(x => x.trim());
  const txt = paginas.join('\n');
  const veces = (id) => (txt.match(new RegExp(`(^|\\s)${id.replace(/[.*+?^${}()|[\]\\@~]/g, '\\$&')}(?=\\s|$)`, 'gm')) || []).length;
  // Un ID de cuota aparece una vez en «Cuotas» y una vez más por cada pago listado que la referencia.
  const esperadas = (q) => 1 + rep.pagos.filter(p => p.cuotaId === q.cuotaId).length;
  const malCuotas = rep.cuotas.filter(q => veces(q.cuotaId) !== esperadas(q)).map(q => `${q.cuotaId}×${veces(q.cuotaId)}≠${esperadas(q)}`);
  const malPagos = rep.pagos.filter(p => veces(p.pagoId) !== 1).map(p => `${p.pagoId}×${veces(p.pagoId)}`);
  out.push([`PDF: cada cuota y cada pago una sola vez (+ referencias pago→cuota) (${rep.cuotas.length} cuotas, ${rep.pagos.length} pagos)`, !malCuotas.length && !malPagos.length, [...malCuotas, ...malPagos].join(' ')]);
  out.push([`PDF: título y corte en todas las páginas (${paginas.length})`, paginas.every(pg => pg.includes(T.titulo) && pg.includes(rep.corte.split('-').reverse().join('-')))]);
  // Encabezado de tabla repetido: toda página que continúa una tabla empieza con su fila de títulos.
  // Texto en orden de lectura (sin -layout): los títulos de columna en dos líneas no se mezclan con las filas.
  const crudas = execFileSync('pdftotext', [fp, '-'], { encoding: 'utf8' }).split('\f').filter(x => x.trim()).map(x => x.replace(/\s+/g, ' '));
  const sinCab = crudas.slice(1).filter(pg => !(pg.includes('Moneda') && /Perímetro|Empresa \(deudora\)|ID cuota|ID pago/.test(pg))).length;
  out.push([`PDF: encabezado de columnas repetido en cada página`, sinCab === 0]);
  if (rep.creditos.some(c => !c.tc)) out.push([`PDF: créditos sin TC identificados y total INCOMPLETO`, /SIN TC/.test(txt) && /INCOMPLETO/.test(txt)]);
  if (!rep.creditos.length) out.push([`PDF: resultado vacío rotulado`, (txt.match(/Sin resultados para los filtros elegidos/g) || []).length === 4]);
  return out;
}

// Tamaño natural de PNG / JPEG (sin librerías).
export function dimImagen(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}
