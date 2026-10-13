/* ─────────────────────────────────────────────────────────────────────────
   AJUSTES DE LA MUESTRA (rama de diseño). Chromium emulado, Supabase falso,
   datos FICTICIOS, sin red (jsPDF / autotable / JSZip desde copias locales).

     APP_URL=http://127.0.0.1:4205 ANTES_URL=http://127.0.0.1:4206 \
     VENDOR_DIR=<dir con jspdf/ y autotable/> JSZIP=<ruta jszip.min.js> \
     OUT_DIR=/tmp/ajustes node scripts/e2e/ajustes-muestra.mjs

   1. Logos en las 4 exportaciones (PDF de Osiris, Excel de Osiris, Reporte
      Semanal PDF, PDF de PO de Frisku): descarga los archivos reales de la app y
      mide el logo DENTRO del archivo (PDF: resolución horizontal = vertical en
      pdfimages; Excel: cx/cy del dibujo = proporción del JPEG). Con ANTES_URL
      (build anterior) compara también páginas y texto: deben ser iguales.
   2. GIF de prueba del Maestro de Especies: completo (object-fit contain, sin
      recorte ni deformación) y animado (dos capturas distintas).
   3. Barra del detalle de Nóminas: mismas acciones por permiso (CFO / quien
      solo ve) y sin desborde en computador y teléfono.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const require = createRequire(import.meta.url);
const OUT = process.env.OUT_DIR || '/tmp/ajustes';
const VENDOR = process.env.VENDOR_DIR;
const JSZIP = process.env.JSZIP || '/opt/node-tools/node_modules/jszip/dist/jszip.min.js';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
// SECCIONES=exportaciones,especies,nominas (por defecto todas) · EXPORTS=semanal,osiris,po (por defecto todas)
const SECC = (process.env.SECCIONES || 'exportaciones,especies,nominas,franja').split(',');
const EXP = (process.env.EXPORTS || 'osiris,semanal,po,nomina,consolidado,auditoria').split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

// Datos ficticios para el PDF de PO (Frisku): un cliente y una nota de cobro.
function storeConPO() {
  const st = storeDiseno();
  st.frisku_clientes = { updated_at: new Date().toISOString(), value: [{ id: 'cli1', nombre: 'Importador Ficticio Ltd', razonSocial: 'Importador Ficticio Ltd', pais: 'País de ejemplo', activo: true }] };
  st.frisku_po = { updated_at: new Date().toISOString(), value: [{ id: 'po1', numero: 'PO-0001', clienteId: 'cli1', fecha: '2026-10-01', moneda: 'USD', estado: 'emitida',
    totalComisionUSD: 1500, lineas: [{ id: 'l1', exporter: 'Exportadora Ficticia', vessel: 'Nave de ejemplo', container: 'CONT0000001', commodity: 'Cherries', comision: 1500 }] }] };
  return st;
}

async function sesion(url, [w, h, tactil], email, st = storeConPO(), antes = null) {
  st.__dialogosApp = true;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, deviceScaleFactor: 1, timezoneId: 'America/Santiago', acceptDownloads: true });
  await instalarFake(ctx, st);
  if (antes) await antes(ctx);   // rutas que deben regir desde la PRIMERA lectura
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  // Librerías de exportación desde copias locales (las mismas versiones que pide la app).
  const js = (p) => (r) => r.fulfill({ path: p, contentType: 'application/javascript' });
  if (VENDOR) {
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js/, js(path.join(VENDOR, 'jspdf/package/dist/jspdf.umd.min.js')));
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf-autotable\/3\.8\.2\/jspdf\.plugin\.autotable\.min\.js/, js(path.join(VENDOR, 'autotable/package/dist/jspdf.plugin.autotable.min.js')));
  }
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js/, js(JSZIP));
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; page.on('dialog', d => { nativos.push(d.type() + ': ' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
  await page.goto(url);
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { ctx, page, errores, nativos, st };
}
const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
async function irModulo(p, id) {
  if (await p.getByTestId(`nav-modulo-${id}`).count()) await p.getByTestId(`nav-modulo-${id}`).click();
  else { await p.getByTestId('nav-mas').click(); await p.getByTestId(`mas-modulo-${id}`).click(); }
  await p.waitForTimeout(3000);
}
async function descargar(p, accion, destino) {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), accion()]);
  await d.saveAs(destino); return destino;
}

// ── 1. Exportaciones ──────────────────────────────────────────────────
async function exportar(url, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const s = await sesion(url, [1440, 900, false], 'ahuerta@grupomediterra.cl');
  const p = s.page, out = {};
  // Osiris → Reportes / BI → Ingresos → «Detalle por concepto»
  if (EXP.includes('osiris')) {
  await irModulo(p, 'osiris');
  await p.locator('main').getByText('Reportes / BI', { exact: true }).first().click(); await p.waitForTimeout(1500);
  const card = p.locator('div', { has: p.getByText('Detalle por concepto', { exact: true }) }).filter({ has: p.getByRole('button', { name: '📄 PDF' }) }).last();
  out.osirisPdf = await descargar(p, () => card.getByRole('button', { name: '📄 PDF' }).click(), `${dir}/osiris.pdf`);
  out.osirisXlsx = await descargar(p, () => card.getByRole('button', { name: '📥 Excel' }).click(), `${dir}/osiris.xlsx`);
  }
  if (EXP.includes('semanal')) {
  // Finanzas → Reporte Semanal → Generar PDF
  await irModulo(p, 'finanzas');
  await p.locator('main').getByRole('button', { name: /Reporte Semanal/ }).first().click(); await p.waitForTimeout(2500);
  out.semanalPdf = await descargar(p, () => p.getByRole('button', { name: /Generar PDF/ }).click(), `${dir}/reporte-semanal.pdf`);
  }
  if (EXP.includes('consolidado')) {
    await irModulo(p, 'finanzas');
    await p.locator('main').getByRole('button', { name: /Flujo Empresas/ }).first().click(); await p.waitForTimeout(2000);
    await p.locator('main').getByRole('button', { name: /Waterfall/ }).first().click(); await p.waitForTimeout(1500);
    out.consolidadoXlsx = await descargar(p, () => p.locator('main').getByRole('button', { name: '📥 Exportar Excel' }).last().click(), `${dir}/flujo-consolidado.xlsx`);
  }
  if (EXP.includes('nomina')) {
    await irModulo(p, 'finanzas');
    await p.locator('main').getByRole('button', { name: /Nóminas/ }).first().click(); await p.waitForTimeout(1500);
    const sel = p.locator('main select').filter({ has: p.locator('option[value="40"]') });
    if (await sel.count()) { await sel.first().selectOption('40'); await p.waitForTimeout(800); }
    await p.locator('tr', { hasText: 'Osiris' }).filter({ hasText: /V°B°|Revisi/i }).first().getByRole('button', { name: /Editar|Ver/ }).first().click(); await p.waitForTimeout(2000);
    out.nominaXlsx = await descargar(p, () => p.getByTestId('barra-nomina').getByRole('button', { name: 'Exportar Excel' }).click(), `${dir}/nomina-osiris.xlsx`);
  }
  if (EXP.includes('auditoria')) {
    // Finanzas → Auditoría (eventos FICTICIOS de la semilla) → Exportar Excel (N)
    await irModulo(p, 'finanzas');
    await p.locator('main').getByRole('button', { name: /🔍 Auditoría/ }).first().click(); await p.waitForTimeout(2500);
    const btn = p.getByRole('button', { name: /Exportar Excel \(\d+\)/ });
    out.auditoriaN = Number(/\((\d+)\)/.exec(await btn.innerText())[1]);
    out.auditoriaHabilitado = await btn.isEnabled();
    out.auditoriaXlsx = await descargar(p, () => btn.click(), `${dir}/auditoria.xlsx`);
  }
  if (EXP.includes('po')) {
  // Frisku → Liquidaciones → PO → Ver → PDF
  await irModulo(p, 'frisku');
  await p.locator('main').getByRole('button', { name: /Liquidaciones/ }).first().click(); await p.waitForTimeout(1200);
  await p.locator('main').getByRole('button', { name: /^PO|PO\b/ }).first().click(); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: '👁 Ver' }).first().click(); await p.waitForTimeout(800);
  out.poPdf = await descargar(p, () => p.getByRole('button', { name: '📄 PDF' }).first().click(), `${dir}/po-frisku.pdf`);
  }
  check(`exportaciones (${dir.split('/').pop()}): sin errores ni diálogos del navegador`, !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await s.ctx.close();
  return out;
}

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
const paginas = (f) => Number(/Pages:\s+(\d+)/.exec(sh('pdfinfo', [f]))[1]);
// Texto sin disposición ni espacios: el título de Osiris se corre a la derecha del logo a propósito.
const texto = (f) => sh('pdftotext', [f, '-']).replace(/\d{1,2}:\d{2}(:\d{2})?/g, 'HH:MM').replace(/\s+/g, ' ').trim();
// Imágenes de color del PDF (sin las máscaras de transparencia) con su resolución horizontal y vertical.
function imagenes(f) {
  return sh('pdfimages', ['-list', f]).split('\n').slice(2).map(l => l.trim().split(/\s+/)).filter(c => c.length > 13 && c[2] === 'image')
    .map(c => ({ pag: +c[0], ancho: +c[3], alto: +c[4], xppi: +c[12], yppi: +c[13] }));
}
async function dibujoExcel(f) {
  const JSZip = require(JSZIP.replace(/dist\/jszip\.min\.js$/, ''));
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const dr = Object.keys(z.files).find(n => /xl\/drawings\/drawing\d+\.xml$/.test(n));
  const xml = dr ? await z.file(dr).async('string') : '';
  const m = /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(xml);
  const hojas = Object.keys(z.files).filter(n => /xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(n)).sort();
  const contenido = (await Promise.all(hojas.map(n => z.file(n).async('string')))).join('\n');
  const media = Object.keys(z.files).find(n => /xl\/media\/./.test(n) && !z.files[n].dir);
  return { cx: m ? +m[1] : 0, cy: m ? +m[2] : 0, contenido, media: media ? await z.file(media).async('uint8array') : null };
}

if (SECC.includes('exportaciones')) {
const ahora = await exportar(process.env.APP_URL, `${OUT}/exportaciones-ahora`);
const antes = process.env.ANTES_URL ? await exportar(process.env.ANTES_URL, `${OUT}/exportaciones-antes`) : null;

const { tamanoJpeg } = await import('../../src/diseno/logoExport.js');
// Palabras del PDF por página con su caja (pt). Encabezado = franja superior a 22 mm; pie = últimos 14 mm.
const MMPT = 72 / 25.4;
function palabrasPDF(f) {
  const x = sh('pdftotext', ['-bbox', f, '-']);
  const res = []; let pag = 0, alto = 0;
  for (const l of x.split('\n')) {
    const pg = /<page width="[\d.]+" height="([\d.]+)"/.exec(l); if (pg) { pag++; alto = +pg[1]; continue; }
    const m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/.exec(l);
    if (m) res.push({ pag, alto, y0: +m[2], y1: +m[4], t: m[5] });
  }
  return res;
}
// Se quita el encabezado solo donde lo hay (en el PDF anterior las páginas de continuación no
// lo tenían y sus primeras filas estaban a 14 mm: esas filas SÍ son contenido).
function contenidoSinMarcos(f) {
  const ws = palabrasPDF(f);
  const conEnc = new Set(ws.filter(w => w.y1 <= 21 * MMPT && w.t === 'Reporte').map(w => w.pag));
  return ws.filter(w => !(conEnc.has(w.pag) && w.y1 <= 21 * MMPT) && w.y1 <= w.alto - 14 * MMPT)
    .map(w => w.t.replace(/\d{1,2}:\d{2}(:\d{2})?/, 'HH:MM'));
}
function difBolsa(a, b) {
  const c = new Map(); a.forEach(t => c.set(t, (c.get(t) || 0) + 1)); b.forEach(t => c.set(t, (c.get(t) || 0) - 1));
  return [...c].filter(([, n]) => n).map(([t, n]) => `${t} ${n > 0 ? 'falta ' + n : 'sobra ' + -n}`);
}
const PROP = { osirisPdf: 2127 / 774, semanalPdf: 269 / 152, poPdf: 153 / 93 };
const PDFS = ['osirisPdf', 'semanalPdf', 'poPdf'].filter(k => ahora[k]);
for (const k of PDFS) {
  const imgs = imagenes(ahora[k]);
  const logos = imgs.filter(i => Math.abs(i.ancho / i.alto - PROP[k]) < 0.02);
  const sinDeformar = logos.length > 0 && logos.every(i => Math.abs(i.xppi - i.yppi) <= Math.max(1, 0.01 * i.yppi));
  check(`${k}: logo en su proporción (resolución x = y en todas sus apariciones)`, sinDeformar, logos.map(i => `p${i.pag} ${i.xppi}×${i.yppi} ppi`).join(', '));
  if (antes) {
    const a = imagenes(antes[k]).filter(i => Math.abs(i.ancho / i.alto - PROP[k]) < 0.02);
    console.log(`   antes: ${a.map(i => `p${i.pag} ${i.xppi}×${i.yppi} ppi (deformación ${((i.xppi / i.yppi - 1) * 100).toFixed(0)} %)`).join(', ')}`);
    if (k === 'semanalPdf') {
      // Las páginas de continuación ahora llevan encabezado y la tabla retoma en 28 mm (antes 14):
      // la paginación puede cambiar. Se informa y se exige el MISMO contenido, palabra por palabra,
      // sin contar encabezados ni pies de página (ni una fila omitida ni duplicada).
      console.log(`   semanalPdf: páginas ${paginas(antes[k])} → ${paginas(ahora[k])}`);
      const ca = contenidoSinMarcos(antes[k]), cb = contenidoSinMarcos(ahora[k]);
      // Única diferencia admitida: la fila de rótulos de columna que autoTable REPITE al empezar
      // una página nueva (no es una fila de datos). Debe sobrar completa, las 4 palabras igual.
      const ROTULO = ['Semana(s)', 'Concepto', 'Monto', 'USD'];
      const sobra = (t) => cb.filter(x => x === t).length - ca.filter(x => x === t).length;
      const nRot = sobra('Semana(s)');
      const dif = difBolsa(ca.concat(...Array(Math.max(0, nRot)).fill(ROTULO)), cb);
      console.log(`   semanalPdf: rótulos de columna repetidos por cambio de página: ${nRot}`);
      check(`semanalPdf: mismas filas de datos que antes (${cb.length} palabras sin encabezados ni pies; ninguna omitida ni duplicada)`,
        ca.length > 0 && nRot >= 0 && ROTULO.every(t => sobra(t) === nRot) && !dif.length, dif.slice(0, 8).join(' · '));
    } else {
    check(`${k}: mismas páginas que antes`, paginas(ahora[k]) === paginas(antes[k]), `${paginas(antes[k])} → ${paginas(ahora[k])}`);
    check(`${k}: mismo texto que antes (cifras incluidas)`, texto(ahora[k]) === texto(antes[k]));
    }
  }
}
if (ahora.osirisXlsx) {
const xa = await dibujoExcel(ahora.osirisXlsx);
const tj = xa.media ? tamanoJpeg(xa.media) : null;
check('osirisXlsx: logo en su proporción (cx/cy = proporción del JPEG)', tj && Math.abs(xa.cx / xa.cy - tj.ancho / tj.alto) < 0.01,
  `${xa.cx}/${xa.cy} = ${(xa.cx / xa.cy).toFixed(3)} · JPEG ${tj && (tj.ancho / tj.alto).toFixed(3)}`);
if (antes) {
  const xb = await dibujoExcel(antes.osirisXlsx);
  console.log(`   antes: ${xb.cx}/${xb.cy} = ${(xb.cx / xb.cy).toFixed(3)}`);
  check('osirisXlsx: mismas hojas y celdas que antes', xa.contenido === xb.contenido && xa.contenido.length > 0);
}
}
// Reporte Semanal: el título de la portada no toca la línea de la cabecera y el logo
// de las páginas siguientes no llega al texto (x = 32 mm).
if (ahora.semanalPdf) {
  const MM = 72 / 25.4;
  const bbox = sh('pdftotext', ['-bbox', '-f', '1', '-l', '1', ahora.semanalPdf, '-']);
  const palabras = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(m => ({ x: +m[1], y0: +m[2], y1: +m[4], t: m[5] }));
  const resumen = palabras.find(w => w.t === 'Resumen' && Math.abs(w.x - 12 * MM) < 2);
  const lineaAbajo = (34 + 0.75) * MM;   // línea teal de 1,5 mm centrada en 34 mm
  check('semanalPdf: «Resumen Ejecutivo» queda bajo la línea de la cabecera', resumen && resumen.y0 > lineaAbajo,
    resumen ? `título desde ${(resumen.y0 / MM).toFixed(1)} mm · línea hasta ${(lineaAbajo / MM).toFixed(2)} mm` : 'título no encontrado');
  // Línea de la portada dibujada en 34 mm (operador «l» del contenido de la página 1).
  const imgs = imagenes(ahora.semanalPdf).filter(i => Math.abs(i.ancho / i.alto - PROP.semanalPdf) < 0.02);
  const anchoMM = (i) => i.ancho / i.xppi * 25.4;
  const sec = imgs.filter(i => i.pag > 1);
  check('semanalPdf: logo de las páginas 2 a 13 con aire antes del texto (12 + ancho ≤ 31 mm)', sec.length > 0 && sec.every(i => 12 + anchoMM(i) <= 31),
    `ancho ${sec.length ? anchoMM(sec[0]).toFixed(1) : '?'} mm`);
  const portada = imgs.find(i => i.pag === 1);
  check('semanalPdf: logo de la portada con aire antes del texto (12 + ancho ≤ 49 mm)', portada && 12 + anchoMM(portada) <= 49, portada && `ancho ${anchoMM(portada).toFixed(1)} mm`);
}
// Logo de la empresa que corresponde (13-10).
{
  const { tamanoImagen } = await import('../../src/diseno/logoExport.js');
  const dimPub = (f) => tamanoImagen(new Uint8Array(fs.readFileSync(path.join('public', f))));
  const LOGO = { 'Mediterra Holding': 'med.png', 'Allegria Foods': 'allegria-logo.jpg', 'Allegria Service': 'allegria-service-logo.png',
    'Frisku Foods': 'frisku.png', 'Osiris Plant Management': 'osiris-logo.jpg', 'Integrity Farms': 'integrity-logo.png',
    'Allpa Farms Chile': 'allpa-chile-logo.png', 'Allpa Farms Perú': 'allpa-peru-logo.png' };
  if (ahora.semanalPdf) {
    const n = paginas(ahora.semanalPdf); const imgs = imagenes(ahora.semanalPdf); const med = dimPub('med.png');
    const res = [];
    for (let pg = 1; pg <= n; pg++) {
      const t = sh('pdftotext', ['-f', String(pg), '-l', String(pg), ahora.semanalPdf, '-']);
      const m = /^\s*\d+\.\s+(.+?)\s*$/m.exec(t.split('\n').slice(0, 12).join('\n'));
      const emp = m && LOGO[m[1].trim()] ? m[1].trim() : null;
      const esperado = emp ? dimPub(LOGO[emp]) : med;
      const del = imgs.filter(i => i.pag === pg);
      res.push({ pg, emp: emp || '(grupo)', ok: del.some(i => i.ancho === esperado.ancho && i.alto === esperado.alto) });
    }
    const porEmpresa = res.filter(r => r.emp !== '(grupo)');
    check('semanalPdf: cada página de empresa lleva el logo de ESA empresa', porEmpresa.length >= 6 && porEmpresa.every(r => r.ok),
      porEmpresa.map(r => `p${r.pg} ${r.emp} ${r.ok ? '✓' : '✗'}`).join(' · '));
    // Toda página lleva encabezado y logo, también las que agrega la tabla al continuar (13-10).
    const sinEncabezado = res.filter(r => !imgs.some(i => i.pag === r.pg)).map(r => r.pg);
    check('semanalPdf: TODAS las páginas llevan logo (también las de continuación de tabla)', !sinEncabezado.length, `sin logo: ${sinEncabezado.join(', ') || 'ninguna'}`);
    check('semanalPdf: las páginas del grupo llevan el logo de Mediterra', res.filter(r => r.emp === '(grupo)').every(r => r.ok));
    // Sin superposición: en cada página interior el texto está o dentro del encabezado (hasta 21 mm)
    // o bajo su línea (desde 22,4 mm); y el encabezado dice «Reporte Semanal de Flujo de Caja».
    const pw = palabrasPDF(ahora.semanalPdf).filter(w => w.pag > 1);
    const cruzan = pw.filter(w => w.y1 > 21 * MMPT && w.y0 < 22.4 * MMPT);
    const pags = [...new Set(pw.map(w => w.pag))];
    const sinTitulo = pags.filter(pg => !pw.filter(w => w.pag === pg && w.y1 <= 21 * MMPT).map(w => w.t).join(' ').includes('Reporte Semanal de Flujo de Caja'));
    check('semanalPdf: ninguna página interior tiene texto montado sobre la línea del encabezado', !cruzan.length, cruzan.slice(0, 5).map(w => `p${w.pag} «${w.t}» ${(w.y0 / MMPT).toFixed(1)} mm`).join(' · '));
    check('semanalPdf: todas las páginas interiores llevan el título del encabezado', !sinTitulo.length, `sin título: ${sinTitulo.join(', ') || 'ninguna'}`);
    // Un TOTAL no queda solo en una página: tras el encabezado de página, la primera línea no es
    // la fila de rótulos repetida seguida directamente de una fila TOTAL.
    const aislados = [];
    for (let pg = 2; pg <= paginas(ahora.semanalPdf); pg++) {
      const lin = sh('pdftotext', ['-layout', '-f', String(pg), '-l', String(pg), ahora.semanalPdf, '-']).split('\n').map(l => l.trim()).filter(Boolean)
        .filter(l => !/Reporte Semanal de Flujo de Caja|^Gestión Grupo Mediterra|^Semana \d+|Generado por Gestión/.test(l) && !/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo),/.test(l));
      if (/^(Semana\(s\)|Sem\.)\s/.test(lin[0] || '') && /^TOTAL/.test(lin[1] || '')) aislados.push(`p${pg} «${lin[1].slice(0, 40)}»`);
    }
    check('semanalPdf: ninguna fila TOTAL queda sola en una página, separada de sus filas', !aislados.length, aislados.join(' · ') || 'ninguna');
    // Y ningún título de sección queda al pie de una página sin su tabla.
    const huerfanos = [];
    for (let pg = 1; pg <= paginas(ahora.semanalPdf); pg++) {
      const lin = sh('pdftotext', ['-layout', '-f', String(pg), '-l', String(pg), ahora.semanalPdf, '-']).split('\n').map(l => l.trim()).filter(Boolean).filter(l => !/Generado por Gestión/.test(l));
      if (/Próximas 8 Semanas|Consolidado —/.test(lin[lin.length - 1] || '')) huerfanos.push(`p${pg} «${lin[lin.length - 1].slice(0, 45)}»`);
    }
    check('semanalPdf: ningún título de sección queda solo al pie de una página', !huerfanos.length, huerfanos.join(' · ') || 'ninguno');
    check('semanalPdf: logos de empresa sin deformar (resolución x = y)', imgs.filter(i => i.xppi && i.yppi).every(i => Math.abs(i.xppi - i.yppi) <= Math.max(1, 0.01 * i.yppi)));
  }
  if (ahora.auditoriaXlsx) {
    // Filas exportadas = las que indica el botón; los textos ficticios llegan intactos (incluidos & < > ").
    const JSZip = require(JSZIP.replace(/dist\/jszip\.min\.js$/, ''));
    const z = await JSZip.loadAsync(fs.readFileSync(ahora.auditoriaXlsx));
    const hoja = await z.file('xl/worksheets/sheet1.xml').async('string');
    const filas = [...hoja.matchAll(/<row r="(\d+)"/g)].map(m => Number(m[1])).filter(r => r >= 5);
    const des = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const textos = [...hoja.matchAll(/<t>([^<]*)<\/t>/g)].map(m => des(m[1]));
    check('auditoriaXlsx: botón habilitado con eventos ficticios', ahora.auditoriaHabilitado && ahora.auditoriaN >= 9, `N=${ahora.auditoriaN}`);
    check(`auditoriaXlsx: ${ahora.auditoriaN} eventos en pantalla = ${filas.length} filas en el Excel`, filas.length === ahora.auditoriaN);
    const esperados = ['Tasa & plazo del crédito F1 <ficticio>', '"9,0%"', 'Aprobó nómina NOMA (1.ª firma)', 'Devolvió rendición R-003: falta boleta', 'Cambió permiso de Lucía Ejemplo'];
    check('auditoriaXlsx: textos con & < > " y acentos llegan intactos', esperados.every(t => textos.includes(t)), esperados.filter(t => !textos.includes(t)).join(' · '));
  }
  for (const [k, archivo, nombre] of [['nominaXlsx', 'osiris-logo.jpg', 'nómina Osiris'], ['consolidadoXlsx', 'med.png', 'consolidado del grupo'], ['auditoriaXlsx', 'med.png', 'registro de auditoría del grupo']]) {
    if (!ahora[k]) continue;
    const JSZip = require(JSZIP.replace(/dist\/jszip\.min\.js$/, ''));
    const z = await JSZip.loadAsync(fs.readFileSync(ahora[k]));
    const media = Object.keys(z.files).find(f => /^xl\/media\/logo_empresa\./.test(f));
    const iguales = media && Buffer.from(await z.file(media).async('uint8array')).equals(fs.readFileSync(path.join('public', archivo)));
    const dib = media ? await z.file('xl/drawings/drawing1.xml').async('string') : '';
    const m = /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(dib); const d = dimPub(archivo);
    check(`${k}: lleva el logo de ${nombre} (${archivo}), sin deformar`, iguales && m && Math.abs(m[1] / m[2] - d.ancho / d.alto) < 0.01, media || 'sin logo');
    // Se abre en LibreOffice y la imagen aparece en el resultado
    const dirPdf = path.join(OUT, `lo-${k}`); fs.mkdirSync(dirPdf, { recursive: true });
    try { sh('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dirPdf, ahora[k]]); } catch (e) {}
    const pdf = fs.readdirSync(dirPdf).find(f => f.endsWith('.pdf'));
    check(`${k}: LibreOffice lo abre y muestra el logo`, !!pdf && imagenes(path.join(dirPdf, pdf)).length >= 1, pdf || 'no se convirtió');
    if (pdf) sh('pdftoppm', ['-png', '-r', '60', '-f', '1', '-l', '1', path.join(dirPdf, pdf), `${OUT}/vista-${k}`]);
  }
}
// Renderiza la primera página de cada PDF para revisarla a ojo.
for (const k of PDFS) sh('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', '2', ahora[k], `${OUT}/vista-${k}`]);

}

// ── 2. GIF del Maestro de Especies ────────────────────────────────────
if (SECC.includes('especies')) for (const [tam, cfg] of Object.entries({ computador: [1440, 900, false], telefono: [390, 844, true] })) {
  const s = await sesion(process.env.APP_URL, cfg, 'ahuerta@grupomediterra.cl', storeDiseno());
  const p = s.page;
  const osirisAntes = JSON.stringify(s.st.osiris);
  await irModulo(p, 'osiris');
  await p.locator('main').getByText('Contratos Obtentores', { exact: true }).first().click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /Especies/ }).first().click(); await p.waitForTimeout(1000);
  const caja = p.getByTestId('especie-imagen').first();
  const m = await caja.locator('img').evaluate(i => ({ nw: i.naturalWidth, nh: i.naturalHeight, fit: getComputedStyle(i).objectFit, w: i.clientWidth, h: i.clientHeight, ok: i.complete }));
  check(`${tam} · GIF cargado desde el maestro (96×48, no cuadrado)`, m.ok && m.nw === 96 && m.nh === 48, JSON.stringify(m));
  // contain: escala = min(caja/ancho, caja/alto) → se ve entero, con su proporción.
  const esc = Math.min(m.w / m.nw, m.h / m.nh);
  check(`${tam} · GIF completo y sin deformar (object-fit: contain → ${(m.nw * esc).toFixed(0)}×${(m.nh * esc).toFixed(0)} px en caja ${m.w}×${m.h})`, m.fit === 'contain');
  // Al centro de la pantalla: en teléfono, al borde inferior lo tapa la barra de navegación fija.
  await caja.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
  const f1 = await caja.screenshot(); await p.waitForTimeout(450); const f2 = await caja.screenshot(); await p.waitForTimeout(450); const f3 = await caja.screenshot();
  check(`${tam} · GIF animado (las capturas cambian con el tiempo)`, !f1.equals(f2) || !f2.equals(f3));
  fs.writeFileSync(`${OUT}/${tam}-gif-cuadro-a.png`, f1); fs.writeFileSync(`${OUT}/${tam}-gif-cuadro-b.png`, f2);
  await p.locator('tr', { hasText: 'Cerezo' }).getByRole('button', { name: '✏️' }).click(); await p.waitForTimeout(600);
  const vp = await p.getByTestId('especie-vista-previa').locator('img').evaluate(i => getComputedStyle(i).objectFit);
  check(`${tam} · vista previa del formulario también completa (contain)`, vp === 'contain');
  await p.waitForTimeout(2500);
  check(`${tam} · ver el maestro y abrir el formulario no escribe la fila osiris`, JSON.stringify(s.st.osiris) === osirisAntes);
  check(`${tam} · Maestro de Especies sin desborde`, (await desborde(p)) <= 1);
  await p.getByText('Maestro de Especies').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/${tam}-maestro-especies.png` });
  check(`${tam} · especies: sin errores ni diálogos del navegador`, !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await s.ctx.close();
}

// ── 3. Barra del detalle de Nóminas ───────────────────────────────────
async function abrirNOMR(p) {
  await irModulo(p, 'finanzas');
  await p.locator('main').getByRole('button', { name: /Nóminas/ }).first().click(); await p.waitForTimeout(1500);
  const sel = p.locator('main select').filter({ has: p.locator('option[value="40"]') });
  if (await sel.count()) { await sel.first().selectOption('40'); await p.waitForTimeout(800); }
  const fila = p.locator('tr', { hasText: 'Osiris' }).filter({ hasText: /V°B°|Revisi/i });
  await fila.first().getByRole('button', { name: /Editar|Ver/ }).first().click(); await p.waitForTimeout(2000);
  return p.getByTestId('barra-nomina');
}
const nombres = async (b) => (await b.getByRole('button').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
const DOCS = ['Exportar Excel', 'Imprimir', 'Auditoría', 'Expediente PDF', 'Expediente ZIP'];
const escrituras = (st, id) => (st.__escrituras || []).filter(e => e.id === id).length;
if (SECC.includes('nominas')) for (const [tam, cfg] of Object.entries({ computador: [1440, 900, false], telefono: [390, 844, true] })) {
  const tel = tam === 'telefono';
  const s = await sesion(process.env.APP_URL, cfg, 'ahuerta@grupomediterra.cl', storeDiseno());
  const p = s.page;
  const b = await abrirNOMR(p);
  const n = await nombres(b);
  const tieneCircuito = n.some(x => /Aprobar \(CFO\)/.test(x)) && n.some(x => /Devolver/.test(x));
  if (!tel) {
    check('computador · CFO: barra con aprobar, devolver, nueva nómina, vista y documentos (sin cambios)',
      ['← Volver', ...DOCS, 'Editar', '+ Nueva Nómina'].every(x => n.includes(x)) && tieneCircuito, n.join(' | '));
  } else {
    // A la vista: volver, aprobar, devolver y «Más». Nada más.
    check('teléfono · CFO: a la vista solo Volver, Aprobar, Devolver y «Opciones de nómina»', tieneCircuito && n.includes('← Volver')
      && n.some(x => /^Opciones de nómina/.test(x)) && !DOCS.some(x => n.includes(x)) && !n.includes('+ Nueva Nómina'), n.join(' | '));
    const alto = (await b.boundingBox()).height;
    check('teléfono · barra compacta (≤ 160 px; antes 271)', alto <= 160, `alto ${alto.toFixed(0)} px`);
    const mas = p.getByTestId('nomina-mas-boton');
    check('teléfono · el botón se llama «Opciones de nómina» (distinto del «Más» de la navegación)', /^Opciones de nómina/.test((await mas.innerText()).trim()) && (await mas.getAttribute('aria-label')) === 'Opciones de nómina');
    check('teléfono · «Opciones de nómina» cerrado anuncia aria-expanded=false', (await mas.getAttribute('aria-expanded')) === 'false');
    await mas.click(); await p.waitForTimeout(300);
    const panel = p.getByTestId('nomina-mas');
    const np = await nombres(panel);
    check('teléfono · «Más» abierto: nueva nómina, vista y documentos', (await mas.getAttribute('aria-expanded')) === 'true'
      && ['+ Nueva Nómina', 'Editar', ...DOCS].every(x => np.includes(x)), np.join(' | '));
    check('teléfono · «Más» incluye el selector de nómina hermana y la semana', (await panel.locator('select[aria-label="Cambiar de nómina"]').count()) === 1 && /Semana 40/.test(await panel.innerText()));
    check('teléfono · al abrir, el foco pasa al panel', await p.evaluate(() => !!document.activeElement?.closest('[data-testid="nomina-mas"]')));
    check('teléfono · panel sin desborde', (await desborde(p)) <= 1);
    await p.screenshot({ path: `${OUT}/telefono-nomina-mas-abierto.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    check('teléfono · Escape cierra y devuelve el foco a «Más»', (await panel.count()) === 0
      && (await mas.getAttribute('aria-expanded')) === 'false' && await mas.evaluate(e => e === document.activeElement));
    // Una acción del panel sigue siendo la misma: Auditoría abre su vista y cierra el panel.
    await mas.click(); await p.waitForTimeout(200);
    await p.getByTestId('nomina-mas').getByRole('button', { name: 'Auditoría' }).click(); await p.waitForTimeout(600);
    check('teléfono · elegir «Auditoría» en «Más» abre la auditoría y cierra el panel', (await p.getByTestId('nomina-mas').count()) === 0
      && (await p.getByText(/Auditor[ií]a/).count()) > 1);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const cerrarAud = p.getByRole('button', { name: /Cerrar|✕|×/ }); if (await cerrarAud.count()) await cerrarAud.first().click().catch(() => {});
    await p.waitForTimeout(300);
    // Confirmación: «Devolver» abre el diálogo de la app; cancelar no escribe ni cambia el estado.
    const nomina = () => (leerFila(s.st, 'nominas_osiris')?.nominas || []).find(x => x.id === 'NOMR');
    const esc0 = escrituras(s.st, 'nominas_osiris');
    await b.getByRole('button', { name: /Devolver/ }).click(); await p.waitForTimeout(400);
    const abierto = await p.getByTestId('dialogo-app').count();
    await p.getByTestId('dialogo-app').getByRole('button', { name: 'Cancelar', exact: true }).click(); await p.waitForTimeout(1200);
    check('teléfono · «Devolver» pide motivo en el diálogo de la app; cancelar no escribe ni cambia el estado',
      abierto === 1 && escrituras(s.st, 'nominas_osiris') === esc0 && nomina()?.estado === 'aprobada1', `diálogo ${abierto} · escrituras ${escrituras(s.st, 'nominas_osiris') - esc0}`);
    await b.screenshot({ path: `${OUT}/telefono-barra-nomina-cfo.png` });
  }
  await p.screenshot({ path: `${OUT}/${tam}-nomina-cfo.png` });
  check(`${tam} · CFO nómina: sin errores ni diálogos del navegador`, !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await s.ctx.close();
  // Michelle: Nóminas en «ver» → no aprueba, no devuelve, no crea; ve el aviso de espera.
  const m = await sesion(process.env.APP_URL, cfg, 'mgarcia@grupomediterra.cl', storeDiseno());
  const bm = await abrirNOMR(m.page);
  let nm = await nombres(bm);
  if (tel) {
    check('teléfono · Nóminas en «ver»: a la vista solo Volver y «Opciones de nómina»', !nm.some(x => /Aprobar|Devolver/.test(x)) && nm.length === 2, nm.join(' | '));
    await m.page.getByTestId('nomina-mas-boton').click(); await m.page.waitForTimeout(300);
    nm = await nombres(m.page.getByTestId('nomina-mas'));
  }
  check(`${tam} · Nóminas en «ver»: sin aprobar, devolver ni nueva nómina${tel ? ' (tampoco en «Más»)' : ''}`,
    !nm.some(x => /Aprobar|Devolver|Nueva Nómina/.test(x)) && DOCS.every(x => nm.includes(x)), nm.join(' | '));
  check(`${tam} · Nóminas en «ver»: muestra a quién se espera`, /Esperando aprobación del CFO/.test(await bm.innerText()));
  await m.page.screenshot({ path: `${OUT}/${tam}-nomina-solo-ver${tel ? '-mas' : ''}.png` });
  await m.ctx.close();
}

// ── 4. Franja ejecutiva del inicio ───────────────────────────────────
if (SECC.includes('franja')) {
  const { cajaEjecutiva, deudaEjecutiva } = await import('../../src/diseno/resumenEjecutivo.js');
  const PER = ['Mediterra', 'Allegria Foods', 'Allegria Service', 'Frisku Foods', 'Osiris', 'Integrity Farms'];
  const FUERA = ['Allpa Farms', 'Allpa Farms Perú', 'Frisku Foods Perú'];
  const usdTxt = (x) => `US$ ${Math.round(x).toLocaleString('es-CL')}`;
  const cifra = async (p, id) => (await p.getByTestId(id).locator('[data-cifra]').innerText()).replace(/\s+/g, ' ').trim();
  for (const [tam, cfg] of Object.entries({ computador: [1440, 900, false], telefono: [390, 844, true] })) {
    const st = storeDiseno();
    const v = (f) => (typeof f.value === 'string' ? JSON.parse(f.value) : f.value);
    const hoyISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const caja = cajaEjecutiva(v(st.finanzas_bancos).saldos, PER, { ahora: new Date() });
    const deuda = deudaEjecutiva(v(st.finanzas).creditos_data, v(st.maestro_tc), PER, FUERA, { corte: hoyISO });
    const s = await sesion(process.env.APP_URL, cfg, 'ahuerta@grupomediterra.cl', st);
    const p = s.page;
    const fr = p.getByTestId('franja-ejecutiva');
    check(`${tam} · CFO: franja visible con moneda y perímetro`, (await fr.count()) === 1
      && /US\$ · 6 sociedades consolidadas/.test(await p.getByTestId('franja-contexto').innerText())
      && /fuera del perímetro, sin sumar: Allpa Farms, Allpa Farms Perú, Frisku Foods Perú/.test(await p.getByTestId('franja-contexto').innerText()));
    check(`${tam} · caja = la de saldoBancoEmpresaUSD (${usdTxt(caja.total)})`, (await cifra(p, 'ejec-caja')) === usdTxt(caja.total), await cifra(p, 'ejec-caja'));
    check(`${tam} · caja INCOMPLETA y nombra la cuenta sin TC`, (await p.getByTestId('ejec-caja-incompleto').count()) === 1
      && /Frisku Foods · Banco Ficticio D EUR/.test(await p.getByTestId('ejec-caja-sintc').innerText()));
    check(`${tam} · caja: fechas de los saldos a la vista`, /con fecha \d{2}-\d{2}-\d{4}/.test(await p.getByTestId('ejec-caja-corte').innerText()));
    check(`${tam} · deuda = la de analisisCartera valorizada (${usdTxt(deuda.capital)})`, (await cifra(p, 'ejec-deuda')) === usdTxt(deuda.capital), await cifra(p, 'ejec-deuda'));
    const txtDeuda = await p.getByTestId('ejec-deuda').innerText();
    // La cuota vencida sin pago registrado queda POR CONCILIAR en el modelo vigente (no se da por impaga sin confirmar).
    const pc = p.getByTestId('ejec-deuda-porconciliar');
    check(`${tam} · por conciliar: cifra propia junto a la deuda, rotulada NO incluido, y no sumada al capital`,
      (await pc.count()) === 1 && /POR CONCILIAR · NO INCLUIDO/i.test(await pc.innerText())
      && (await pc.locator('[data-cifra-aparte]').innerText()) === usdTxt(400000) && deuda.porConciliar === 400000
      && (await cifra(p, 'ejec-deuda')) === usdTxt(deuda.capital) && deuda.capital === 1200000, (await pc.innerText()).replace(/\s+/g, ' '));
    check(`${tam} · deuda: corte de hoy, TC de Maestros y fuera del perímetro a la vista`,
      txtDeuda.includes(`Al ${hoyISO.split('-').reverse().join('-')}`) && /TC de Maestros/.test(txtDeuda) && /\(confirmado\)/.test(txtDeuda)
      && txtDeuda.includes(`Fuera del perímetro, no suma: ${usdTxt(300000)} (Allpa Farms)`), txtDeuda.replace(/\s+/g, ' ').slice(0, 220));
    check(`${tam} · deuda completa (el crédito en CLP tiene TC): sin INCOMPLETO`, (await p.getByTestId('ejec-deuda-incompleto').count()) === 0 && !deuda.incompleto);
    check(`${tam} · sin mínimo proyectado ni cifra fija del Dashboard`, !/[Mm]ínimo|8\.355\.763/.test(await fr.innerText()));
    check(`${tam} · franja sin desborde`, (await desborde(p)) <= 1);
    check(`${tam} · hora de lectura a la vista en caja y deuda`, /Cifras leídas a las \d{2}:\d{2}/.test(await p.getByTestId('ejec-caja-leido').innerText())
      && /Cifras leídas a las \d{2}:\d{2}/.test(await p.getByTestId('ejec-deuda-leido').innerText()));
    await fr.screenshot({ path: `${OUT}/${tam}-franja-ejecutiva.png` });
    await p.screenshot({ path: `${OUT}/${tam}-inicio-cfo-franja.png` });
    if (tam === 'computador') {
      await p.getByTestId('ejec-deuda').getByRole('button', { name: 'Créditos ›' }).click(); await p.waitForTimeout(3500);
      check('computador · «Créditos ›» abre Finanzas en Créditos', /Créditos/.test(await p.locator('main').innerText()) && (await p.getByTestId('franja-ejecutiva').count()) === 0);
    }
    check(`${tam} · franja: sin errores ni diálogos del navegador`, !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
    await s.ctx.close();
  }
  // Caché por sesión: volver al inicio no vuelve a leer la fila `finanzas`; «Actualizar» sí.
  {
    const st = storeDiseno();
    const s = await sesion(process.env.APP_URL, [1440, 900, false], 'ahuerta@grupomediterra.cl', st);
    const p = s.page;
    const gets = []; p.on('request', r => { const m = /id=eq\.([^&]+)/.exec(r.url()); if (m && r.method() === 'GET') gets.push(decodeURIComponent(m[1])); });
    const n = (id) => gets.filter(x => x === id).length;
    const base = { fin: n('finanzas') };
    for (let k = 0; k < 2; k++) {   // ida y vuelta a un módulo que NO es Finanzas
      await irModulo(p, 'tareas'); await p.getByTestId('nav-inicio').click(); await p.waitForTimeout(1500);
    }
    check('caché: dos regresos al inicio no vuelven a pedir la fila finanzas (ni bancos ni TC)', n('finanzas') === base.fin && n('finanzas_bancos') === 0 && n('maestro_tc') === 0,
      `GET finanzas extra: ${n('finanzas') - base.fin}`);
    const antes = await p.getByTestId('ejec-caja-leido').innerText();
    await p.waitForTimeout(61000);   // para que la hora de la lectura nueva sea distinta
    await p.getByTestId('franja-actualizar').click(); await p.waitForTimeout(2000);
    check('«Actualizar» vuelve a leer finanzas, bancos y TC una vez cada una', n('finanzas') === base.fin + 1 && n('finanzas_bancos') === 1 && n('maestro_tc') === 1,
      `finanzas +${n('finanzas') - base.fin} · bancos ${n('finanzas_bancos')} · tc ${n('maestro_tc')}`);
    const despues = await p.getByTestId('ejec-caja-leido').innerText();
    check('«Actualizar» cambia la hora de lectura', despues !== antes, `${antes} → ${despues}`);
    // Doble clic: una sola lectura (el botón se deshabilita y la caché deduplica)
    const f0 = n('finanzas');
    await p.getByTestId('franja-actualizar').dblclick(); await p.waitForTimeout(2000);
    check('doble clic en «Actualizar»: una sola lectura', n('finanzas') === f0 + 1, `+${n('finanzas') - f0}`);
    // Una actualización que falla conserva las cifras anteriores y lo dice
    const cajaAntes = await cifra(p, 'ejec-caja');
    await s.ctx.route(/id=eq\.finanzas_bancos/, r => r.request().method() === 'GET' ? r.fulfill({ status: 503, body: '{}' }) : r.fallback());
    await p.getByTestId('franja-actualizar').click(); await p.waitForTimeout(2000);
    check('actualización fallida: se conservan las cifras anteriores, con su hora, y se avisa', (await cifra(p, 'ejec-caja')) === cajaAntes
      && /No se pudo actualizar a las \d{2}:\d{2}: se muestran las cifras de las \d{2}:\d{2}/.test(await p.getByTestId('ejec-caja-desactualizado').innerText()));
    await p.getByTestId('franja-ejecutiva').screenshot({ path: `${OUT}/franja-actualizacion-fallida.png` });
    check('caché: sin errores ni diálogos del navegador', !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
    await s.ctx.close();
  }
  // Permisos: Carol (Dashboard sin acceso) no ve la franja; la socia (consulta, ve Dashboard/Bancos/Créditos) sí.
  for (const [email, ve, quien] of [['cmachuca@grupomediterra.cl', false, 'Analista (Dashboard sin acceso)'], ['socia.consulta@ejemplo.cl', true, 'Socia consulta (ve Dashboard, Bancos y Créditos)']]) {
    const s = await sesion(process.env.APP_URL, [1440, 900, false], email, storeDiseno());
    check(`${quien}: ${ve ? 've' : 'no ve'} la franja`, (await s.page.getByTestId('franja-ejecutiva').count()) === (ve ? 1 : 0));
    await s.ctx.close();
  }
  // Error de lectura: bancos no se leen → caja «no disponible» con Reintentar; la deuda sigue.
  {
    const st = storeDiseno();
    // La PRIMERA lectura de bancos falla (sin datos anteriores en la sesión).
    const s = await sesion(process.env.APP_URL, [1440, 900, false], 'ahuerta@grupomediterra.cl', st,
      (ctx) => ctx.route(/id=eq\.finanzas_bancos/, r => r.request().method() === 'GET' ? r.fulfill({ status: 503, body: '{}' }) : r.fallback()));
    await s.page.waitForTimeout(1500);
    check('error: caja «no disponible» con Reintentar (nunca cero); deuda con su cifra', (await s.page.getByTestId('ejec-caja-error').count()) === 1
      && (await s.page.getByTestId('ejec-caja').locator('[data-cifra]').count()) === 0 && (await s.page.getByTestId('ejec-deuda').locator('[data-cifra]').count()) === 1);
    await s.page.getByTestId('franja-ejecutiva').screenshot({ path: `${OUT}/franja-error-caja.png` });
    await s.ctx.close();
  }
  // Sin tipo de cambio: maestro_tc vacío → el crédito en CLP no suma, se nombra y la deuda dice INCOMPLETO.
  {
    const st = storeDiseno(); st.maestro_tc = { updated_at: new Date().toISOString(), value: {} };
    const s = await sesion(process.env.APP_URL, [1440, 900, false], 'ahuerta@grupomediterra.cl', st);
    check('sin TC: deuda INCOMPLETA y nombra el crédito en CLP', (await s.page.getByTestId('ejec-deuda-incompleto').count()) === 1
      && /Osiris · Banco ficticio F3 CLP/.test(await s.page.getByTestId('ejec-deuda-sintc').innerText()));
    await s.page.getByTestId('franja-ejecutiva').screenshot({ path: `${OUT}/franja-sin-tc.png` });
    await s.ctx.close();
  }
  // Sin créditos guardados: no se muestra la lista por defecto del código como deuda.
  {
    const st = storeDiseno(); const f = (typeof st.finanzas.value === 'string' ? JSON.parse(st.finanzas.value) : st.finanzas.value); f.creditos_data = [];
    st.finanzas.value = typeof st.finanzas.value === 'string' ? JSON.stringify(f) : f;
    const s = await sesion(process.env.APP_URL, [1440, 900, false], 'ahuerta@grupomediterra.cl', st);
    check('sin créditos guardados: lo dice y no muestra cifra', (await s.page.getByTestId('ejec-deuda-sindatos').count()) === 1
      && (await s.page.getByTestId('ejec-deuda').locator('[data-cifra]').count()) === 0);
    await s.ctx.close();
  }
}

await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · archivos y capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
