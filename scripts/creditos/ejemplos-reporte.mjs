/* ─────────────────────────────────────────────────────────────────────────
   Archivos de EJEMPLO de Reportes de Créditos + verificación de cuadre.
   Datos FICTICIOS (src/reporteCreditos.datosPrueba.js), corte 13-10-2026.

     LIBS=<carpeta con exceljs/, jspdf/, autotable/> OUT_DIR=/tmp/rep \
       node scripts/creditos/ejemplos-reporte.mjs

   LIBS apunta a copias LOCALES de las mismas versiones que la app carga desde cdnjs
   (exceljs 4.4.0, jspdf 2.5.1, jspdf-autotable 3.8.2). No son dependencias del proyecto.
   Genera Excel y PDF (consolidado y por empresa), los vuelve a LEER y compara cada cifra
   con construirReporte (que a su vez se prueba contra creditos.js en jest):
     · Excel: cada celda numérica de las tres hojas = la tabla de pantalla, fila a fila;
     · PDF: texto extraído → cada ID de cuota y de pago aparece exactamente una vez;
       encabezado de tabla repetido en cada página con tabla; logo con su proporción.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { construirReporte, tablasReporte, LOGO_EMPRESA, LOGO_GRUPO } from '../../src/reporteCreditos.js';
import { libroExcel, documentoPDF, nombreArchivo, encajar } from '../../src/reporteCreditosExport.js';
import { CREDITOS_PRUEBA, CORTE_PRUEBA, TC_PRUEBA } from '../../src/reporteCreditos.datosPrueba.js';
import { compararLibro, verificarPDF, dimImagen } from './verificar-archivos.mjs';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIBS = process.env.LIBS; if (!LIBS) { console.error('Falta LIBS'); process.exit(2); }
const OUT = process.env.OUT_DIR || '/tmp/rep'; fs.mkdirSync(OUT, { recursive: true });
const ExcelJS = require(path.join(LIBS, 'exceljs/package/dist/exceljs.min.js'));
const { jsPDF } = require(path.join(LIBS, 'jspdf/package/dist/jspdf.umd.min.js'));
const at = await import(path.join(LIBS, 'autotable/package/dist/jspdf.plugin.autotable.mjs'));
at.applyPlugin(jsPDF);

let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

function logo(src) {
  const buf = fs.readFileSync(path.join(RAIZ, 'public', src));
  const ext = /\.jpe?g$/i.test(src) ? 'jpeg' : 'png';
  return { base64: buf.toString('base64'), dataUrl: `data:image/${ext};base64,${buf.toString('base64')}`, ext, ...dimImagen(buf) };
}

const GENERADO = '13-10-2026 (ejemplo)';
const casos = [
  { alcance: 'consolidado', filtros: {}, nombre: 'consolidado' },
  { alcance: 'consolidado', filtros: { desde: '2026-10-01', hasta: '2026-12-31', estadosCuota: ['vencida', 'parcial', 'pendiente', 'por_conciliar'] }, nombre: 'consolidado-oct-dic' },
  { alcance: 'empresa', empresa: 'Osiris', filtros: { empresas: ['Osiris'] }, nombre: 'osiris' },
  { alcance: 'empresa', empresa: 'Allegria Service', filtros: { empresas: ['Allegria Service'] }, nombre: 'allegria-service' },
  { alcance: 'empresa', empresa: 'Frisku Foods', filtros: { empresas: ['Frisku Foods'] }, nombre: 'frisku-sin-tc' },
  { alcance: 'consolidado', filtros: { acreedores: ['Acreedor inexistente'] }, nombre: 'vacio' },
];

for (const k of casos) {
  const rep = construirReporte(CREDITOS_PRUEBA, k.filtros, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA });
  const T = tablasReporte(rep, { alcance: k.alcance, empresa: k.empresa });
  const lg = logo(T.logo);
  // ── Excel ──
  const wb = libroExcel(T, { ExcelJS, logo: lg, generado: GENERADO });
  const fx = path.join(OUT, nombreArchivo(T, CORTE_PRUEBA, 'xlsx').replace('.xlsx', `__${k.nombre}.xlsx`));
  fs.writeFileSync(fx, Buffer.from(await wb.xlsx.writeBuffer()));
  const rb = new ExcelJS.Workbook(); await rb.xlsx.load(fs.readFileSync(fx));
  check(`${k.nombre} · Excel con hojas Resumen, Créditos, Cuotas y pagos`, rb.worksheets.map(w => w.name).join('|') === 'Resumen|Créditos|Cuotas y pagos');
  const errs = compararLibro(rb, T);
  check(`${k.nombre} · Excel = pantalla, celda a celda (resumen, créditos, cuotas, pagos)`, !errs.length, errs.join(' · ') || `${T.creditos.filas.length + T.cuotas.filas.length + T.pagos.filas.length + T.resumen.filas.length} filas`);
  const txtEnc = rb.getWorksheet('Resumen').getColumn(3).values.join('\n');
  check(`${k.nombre} · Excel: encabezado de filtros y corte`, T.encabezado.every(([, v]) => txtEnc.includes(v)));
  const img = rb.getWorksheet('Resumen').getImages()[0];
  const d = encajar(lg.w, lg.h, 170, 52);
  check(`${k.nombre} · Excel: logo ${T.logo} con su proporción`, !!img && Math.abs((img.range.ext.width / img.range.ext.height) - lg.w / lg.h) < 0.03, `${lg.w}×${lg.h} → ${Math.round(d.w)}×${Math.round(d.h)} px`);
  // ── PDF ──
  const doc = documentoPDF(T, { JsPDF: jsPDF, logo: lg, generado: GENERADO });
  const fp = path.join(OUT, nombreArchivo(T, CORTE_PRUEBA, 'pdf').replace('.pdf', `__${k.nombre}.pdf`));
  fs.writeFileSync(fp, Buffer.from(doc.output('arraybuffer')));
  verificarPDF(fp, rep, T).forEach(([n, c, x]) => check(`${k.nombre} · ${n}`, c, x));
}
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios · archivos en ${OUT}`);
process.exit(fallos ? 1 : 0);
