/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Créditos → 📥 Reportes (app real, Supabase falso aislado,
   datos FICTICIOS de src/reporteCreditos.datosPrueba.js, corte 13-10-2026).

     CI=true npx react-scripts build; (cd build && python3 -m http.server 4280 --bind 127.0.0.1 &)
     APP_URL=http://127.0.0.1:4280 LIBS=<exceljs/jspdf locales> OUT_DIR=/tmp/e2e-rep \
       node scripts/e2e/creditos-reportes.mjs

   Comprueba, en pantalla y en los archivos DESCARGADOS desde la app:
   - consolidado por defecto (6 sociedades; JV aparte), cifras = construirReporte = creditos.js;
   - filtros combinados (empresa + estado de cuota + rango), rango invertido, resultado vacío;
   - Excel descargado = pantalla celda a celda; PDF con cada cuota y pago una sola vez;
   - por empresa con su logo (Excel: proporción natural);
   - permisos: un usuario restringido a Osiris solo ve y descarga Osiris; uno sin acceso a
     Créditos no ve la pestaña; abrir Reportes y descargar no escribe en la base.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN } from './fake.mjs';
import { construirReporte, tablasReporte, formatoCelda } from '../../src/reporteCreditos.js';
import { CREDITOS_PRUEBA, CORTE_PRUEBA, TC_PRUEBA } from '../../src/reporteCreditos.datosPrueba.js';
import { compararLibro, verificarPDF, dimImagen } from '../creditos/verificar-archivos.mjs';

const require = createRequire(import.meta.url);
const BASE = process.env.APP_URL || 'http://127.0.0.1:4280';
const OUT = process.env.OUT_DIR || '/tmp/e2e-rep'; fs.mkdirSync(OUT, { recursive: true });
const ExcelJS = require(path.join(process.env.LIBS, 'exceljs/package/dist/exceljs.min.js'));
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

const SIN = 'sin_acceso';
const finSin = { dashboard: SIN, flujo: SIN, bancos: SIN, creditos: SIN, nominas: SIN, reporte: SIN, params: SIN, auditoria: SIN, eeff: SIN };
const USUARIOS = [
  { nombre: 'Angelo Huerta', email: 'ahuerta@grupomediterra.cl', rol: 'admin', esCFO: true, modulos: ['tareas', 'finanzas'] },
  { nombre: 'Gerente Osiris', email: 'gerente.osiris@ejemplo.cl', rol: 'editor', modulos: ['finanzas'], empresas_permitidas: ['Osiris'],
    tab_permisos: { finanzas: { ...finSin, creditos: 'ver' } } },
  { nombre: 'Analista Bancos', email: 'analista.bancos@ejemplo.cl', rol: 'editor', modulos: ['finanzas'],
    tab_permisos: { finanzas: { ...finSin, bancos: 'ver' } } },
];
function store() {
  const st = nuevoStore();
  const cred = st.pins.value['Angelo Huerta_h'];
  USUARIOS.forEach(u => { st.pins.value[`${u.nombre}_h`] = cred; });
  st.usuarios = { updated_at: new Date(Date.now() - 40000).toISOString(), value: USUARIOS };
  st.finanzas.value.creditos_data = JSON.parse(JSON.stringify(CREDITOS_PRUEBA));
  st.maestro_tc = { updated_at: new Date(Date.now() - 30000).toISOString(), value: TC_PRUEBA };
  return st;
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
async function sesion(email) {
  const st = store();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  // Librerías de exportación: las MISMAS versiones que la app pide a cdnjs, servidas desde copias locales.
  const local = { 'exceljs/4.4.0/exceljs.min.js': 'exceljs/package/dist/exceljs.min.js', 'jspdf/2.5.1/jspdf.umd.min.js': 'jspdf/package/dist/jspdf.umd.min.js',
    'jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js': 'autotable/package/dist/jspdf.plugin.autotable.min.js' };
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\//, r => { const k = Object.keys(local).find(x => r.request().url().endsWith(x));
    return k ? r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(process.env.LIBS, local[k])) }) : r.abort(); });
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 200)));
  p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto(BASE);
  await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  const fin = p.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ });
  if (await fin.count()) await fin.first().click(); else { await p.getByTestId('nav-mas').click().catch(() => {}); await p.getByTestId('mas-modulo-finanzas').click(); }
  await p.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { ctx, p, st, errores };
}
const abrirReportes = async (p) => {
  await p.getByRole('button', { name: /💳 Créditos/ }).first().click(); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: '📥 Reportes' }).click(); await p.waitForTimeout(600);
  await p.getByTestId('rep-corte').fill(CORTE_PRUEBA); await p.waitForTimeout(300);
};
const chip = (p, grupo, texto) => p.getByTestId(grupo).getByRole('button', { name: texto, exact: true }).click();
// Lo que muestra la tabla en pantalla vs. las filas del modelo con el mismo formato.
async function tablaPantalla(p, k) { await p.getByTestId(`rep-ver-${k}`).click(); await p.waitForTimeout(200);
  return p.getByTestId(`rep-tabla-${k}`).locator('tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent))); }
const esperado = (tabla) => tabla.filas.map(f => tabla.columnas.map(c => formatoCelda(f.celdas[c.k], c, f.moneda)));
async function cuadraPantalla(p, T, nombre) {
  for (const k of ['resumen', 'creditos', 'cuotas', 'pagos']) {
    const pant = await tablaPantalla(p, k), esp = esperado(T[k]);
    const igual = T[k].filas.length ? JSON.stringify(pant) === JSON.stringify(esp) : pant.length === 1 && /Sin resultados/.test(pant[0][0]);
    check(`${nombre} · pantalla «${k}» = modelo (${T[k].filas.length} filas)`, igual, igual ? '' : `1.ª diferencia: ${JSON.stringify(pant.find((r, i) => JSON.stringify(r) !== JSON.stringify(esp[i]))).slice(0, 160)}`);
  }
}
async function descargar(p, testid, nombre) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.getByTestId(testid).click()]);
  const f = path.join(OUT, `${nombre}__${d.suggestedFilename()}`); await d.saveAs(f); return { f, sugerido: d.suggestedFilename() };
}
async function verificarDescargas(p, rep, T, nombre) {
  const x = await descargar(p, 'rep-excel', nombre);
  const rb = new ExcelJS.Workbook(); await rb.xlsx.load(fs.readFileSync(x.f));
  const errs = compararLibro(rb, T);
  check(`${nombre} · Excel descargado (${x.sugerido}) = pantalla celda a celda`, !errs.length, errs.join(' · '));
  const enc = rb.getWorksheet('Resumen').getColumn(3).values.join('\n');
  check(`${nombre} · Excel: mismos filtros que la pantalla`, T.encabezado.every(([, v]) => enc.includes(v)));
  const img = rb.getWorksheet('Resumen').getImages()[0], dim = dimImagen(fs.readFileSync(path.join(RAIZ, 'public', T.logo)));
  check(`${nombre} · Excel: logo ${T.logo} sin deformar`, !!img && Math.abs(img.range.ext.width / img.range.ext.height - dim.w / dim.h) < 0.03);
  const y = await descargar(p, 'rep-pdf', nombre);
  verificarPDF(y.f, rep, T).forEach(([n, c, d]) => check(`${nombre} · ${n}`, c, d));
  check(`${nombre} · estado «Descarga lista»`, /Descarga lista\.$/.test(await p.getByTestId('rep-estado').innerText()));
}

// ── 1. Administrador: consolidado por defecto ─────────────────────────
{
  const s = await sesion('ahuerta@grupomediterra.cl'), p = s.p;
  await abrirReportes(p);
  const esc0 = (s.st.__escrituras || []).length;
  await p.screenshot({ path: `${OUT}/01-consolidado.png`, fullPage: true });
  const rep = construirReporte(CREDITOS_PRUEBA, { empresas: [], acreedores: [], estadosCredito: [], estadosCuota: [], tiposPago: [], desde: '', hasta: '' }, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA });
  const T = tablasReporte(rep, { alcance: 'consolidado' });
  const enc = await p.getByTestId('rep-encabezado').innerText();
  check('consolidado · encabezado: corte, rango y empresa deudora', T.encabezado.every(([k, v]) => enc.includes(`${k}: ${v}`)), enc.split('\n')[2]);
  check('consolidado · aviso de crédito sin TC y total INCOMPLETO', /crédito D \(N° 4\)/.test(enc) && /INCOMPLETO/.test(await p.getByTestId('rep-tabla-resumen').innerText()));
  check('consolidado · JV aparte, «no se suma al consolidado»', /Total JV en USD · no se suma al consolidado/.test(await p.getByTestId('rep-tabla-resumen').innerText()));
  await cuadraPantalla(p, T, 'consolidado');
  await verificarDescargas(p, rep, T, 'consolidado');
  // ── 2. Filtros combinados ──
  await p.getByTestId('rep-ver-cuotas').click();
  await chip(p, 'rep-f-empresas', 'Osiris'); await chip(p, 'rep-f-estado-cuota', 'Vencida'); await chip(p, 'rep-f-estado-cuota', 'Por conciliar');
  await p.getByTestId('rep-hasta').fill('2026-12-31'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/02-filtros-combinados.png`, fullPage: true });
  const fC = { empresas: ['Osiris'], acreedores: [], estadosCredito: [], estadosCuota: ['vencida', 'por_conciliar'], tiposPago: [], desde: '', hasta: '2026-12-31' };
  const repC = construirReporte(CREDITOS_PRUEBA, fC, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA }), TC = tablasReporte(repC, { alcance: 'consolidado' });
  check('combinados · cuotas = A@2026-10-10 (vencida) y B1@2026-07-31 (por conciliar)', repC.cuotas.map(q => q.cuotaId).join(',') === 'A@2026-10-10,B1@2026-07-31');
  await cuadraPantalla(p, TC, 'combinados');
  await verificarDescargas(p, repC, TC, 'combinados');
  // ── 3. Rango invertido: error, sin descarga ──
  await p.getByTestId('rep-desde').fill('2027-01-31'); await p.waitForTimeout(300);
  check('rango invertido · error visible y botones deshabilitados', /invertido/.test(await p.getByTestId('rep-errores').innerText())
    && await p.getByTestId('rep-excel').isDisabled() && await p.getByTestId('rep-pdf').isDisabled());
  await p.getByTestId('rep-desde').fill(''); await p.getByTestId('rep-hasta').fill('');
  // ── 4. Resultado vacío (estado «Cerrado»: ningún crédito ficticio lo está) ──
  await p.getByTestId('rep-f-empresas').getByRole('button', { name: 'quitar' }).click();
  await p.getByTestId('rep-f-estado-cuota').getByRole('button', { name: 'quitar' }).click();
  await chip(p, 'rep-f-estado-credito', 'Cerrado'); await p.waitForTimeout(300);
  const fV = { empresas: [], acreedores: [], estadosCredito: ['cerrado'], estadosCuota: [], tiposPago: [], desde: '', hasta: '' };
  const repV = construirReporte(CREDITOS_PRUEBA, fV, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA }), TV = tablasReporte(repV, { alcance: 'consolidado' });
  check('vacío · el modelo no devuelve filas', repV.creditos.length === 0 && repV.cuotas.length === 0);
  await cuadraPantalla(p, TV, 'vacío');
  await verificarDescargas(p, repV, TV, 'vacio');
  await p.getByTestId('rep-f-estado-credito').getByRole('button', { name: 'quitar' }).click();
  // ── 5. Por empresa: Allegria Service (CLP + renovación con pago parcial) ──
  await p.getByTestId('rep-alcance').selectOption('empresa'); await p.getByTestId('rep-empresa').selectOption('Allegria Service'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/03-por-empresa.png`, fullPage: true });
  const fE = { empresas: ['Allegria Service'], acreedores: [], estadosCredito: [], estadosCuota: [], tiposPago: [], desde: '', hasta: '' };
  const repE = construirReporte(CREDITOS_PRUEBA, fE, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA }), TE = tablasReporte(repE, { alcance: 'empresa', empresa: 'Allegria Service' });
  check('por empresa · renovación con pago parcial en la cuota R@R0@0', /R@R0@0[\s\S]*Renovación 1[\s\S]*Pago parcial/.test(await (async () => { await p.getByTestId('rep-ver-cuotas').click(); return p.getByTestId('rep-tabla-cuotas').innerText(); })()));
  await cuadraPantalla(p, TE, 'por empresa');
  await verificarDescargas(p, repE, TE, 'allegria-service');
  // Leer y descargar no escribe en la base
  check('administrador · abrir Reportes, filtrar y descargar no escribió en la base', (s.st.__escrituras || []).length === esc0, `${(s.st.__escrituras || []).length - esc0} escrituras`);
  check('administrador · sin errores de página', !s.errores.length, s.errores.join(' | '));
  await s.ctx.close();
}
// ── 6. Usuario restringido a Osiris (Créditos en «ver») ───────────────
{
  const s = await sesion('gerente.osiris@ejemplo.cl'), p = s.p;
  await abrirReportes(p);
  await p.screenshot({ path: `${OUT}/04-restringido-osiris.png`, fullPage: true });
  const empresasChips = await p.getByTestId('rep-f-empresas').getByRole('button').allInnerTexts();
  check('restringido · el filtro de empresa ofrece solo Osiris', JSON.stringify(empresasChips.filter(t => t !== 'quitar')) === '["Osiris"]', empresasChips.join(','));
  const visibles = CREDITOS_PRUEBA.filter(c => c.empresa === 'Osiris');
  const rep = construirReporte(visibles, { empresas: [], acreedores: [], estadosCredito: [], estadosCuota: [], tiposPago: [], desde: '', hasta: '' }, { corte: CORTE_PRUEBA, tcData: TC_PRUEBA, empresasPermitidas: ['Osiris'] });
  const T = tablasReporte(rep, { alcance: 'consolidado' });
  await cuadraPantalla(p, T, 'restringido');
  await verificarDescargas(p, rep, T, 'restringido');
  const x = fs.readdirSync(OUT).find(f => f.startsWith('restringido__') && f.endsWith('.xlsx'));
  const rb = new ExcelJS.Workbook(); await rb.xlsx.load(fs.readFileSync(path.join(OUT, x)));
  const textoLibro = rb.worksheets.map(ws => { const v = []; ws.eachRow(r => r.eachCell(c => v.push(String(c.value)))); return v.join(' '); }).join(' ');
  check('restringido · el Excel descargado no contiene otras empresas', !/Mediterra\b(?! —)|Allegria|Frisku|Integrity|Allpa/.test(textoLibro.replace(/Grupo Mediterra/g, '')), '');
  await s.ctx.close();
}
// ── 7. Sin acceso a Créditos ─────────────────────────────────────────
{
  const s = await sesion('analista.bancos@ejemplo.cl'), p = s.p;
  const entro = await p.getByRole('button', { name: /Saldos Bancos/ }).count() > 0;   // la sesión sí abrió Finanzas
  check('sin acceso · entra a Finanzas (Saldos Bancos) pero no ve Créditos ni Reportes', entro && await p.getByRole('button', { name: /💳 Créditos/ }).count() === 0 && await p.getByTestId('creditos-reportes').count() === 0);
  await s.ctx.close();
}
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · Supabase falso · datos ficticios · ${OUT}`);
process.exit(fallos ? 1 : 0);
