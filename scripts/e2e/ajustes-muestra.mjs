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
const SECC = (process.env.SECCIONES || 'exportaciones,especies,nominas').split(',');
const EXP = (process.env.EXPORTS || 'osiris,semanal,po').split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

// Datos ficticios para el PDF de PO (Frisku): un cliente y una nota de cobro.
function storeConPO() {
  const st = storeDiseno();
  st.frisku_clientes = { updated_at: new Date().toISOString(), value: [{ id: 'cli1', nombre: 'Importador Ficticio Ltd', razonSocial: 'Importador Ficticio Ltd', pais: 'País de ejemplo', activo: true }] };
  st.frisku_po = { updated_at: new Date().toISOString(), value: [{ id: 'po1', numero: 'PO-0001', clienteId: 'cli1', fecha: '2026-10-01', moneda: 'USD', estado: 'emitida',
    totalComisionUSD: 1500, lineas: [{ id: 'l1', exporter: 'Exportadora Ficticia', vessel: 'Nave de ejemplo', container: 'CONT0000001', commodity: 'Cherries', comision: 1500 }] }] };
  return st;
}

async function sesion(url, [w, h, tactil], email, st = storeConPO()) {
  st.__dialogosApp = true;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, deviceScaleFactor: 1, timezoneId: 'America/Santiago', acceptDownloads: true });
  await instalarFake(ctx, st);
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
    check(`${k}: mismas páginas que antes`, paginas(ahora[k]) === paginas(antes[k]), `${paginas(antes[k])} → ${paginas(ahora[k])}`);
    check(`${k}: mismo texto que antes (cifras incluidas)`, texto(ahora[k]) === texto(antes[k]));
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
    check('teléfono · CFO: a la vista solo Volver, Aprobar, Devolver y «Más»', tieneCircuito && n.includes('← Volver')
      && n.some(x => /^Más/.test(x)) && !DOCS.some(x => n.includes(x)) && !n.includes('+ Nueva Nómina'), n.join(' | '));
    const alto = (await b.boundingBox()).height;
    check('teléfono · barra compacta (≤ 160 px; antes 271)', alto <= 160, `alto ${alto.toFixed(0)} px`);
    const mas = p.getByTestId('nomina-mas-boton');
    check('teléfono · «Más» cerrado anuncia aria-expanded=false', (await mas.getAttribute('aria-expanded')) === 'false');
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
    check('teléfono · Nóminas en «ver»: a la vista solo Volver y «Más»', !nm.some(x => /Aprobar|Devolver/.test(x)) && nm.length === 2, nm.join(' | '));
    await m.page.getByTestId('nomina-mas-boton').click(); await m.page.waitForTimeout(300);
    nm = await nombres(m.page.getByTestId('nomina-mas'));
  }
  check(`${tam} · Nóminas en «ver»: sin aprobar, devolver ni nueva nómina${tel ? ' (tampoco en «Más»)' : ''}`,
    !nm.some(x => /Aprobar|Devolver|Nueva Nómina/.test(x)) && DOCS.every(x => nm.includes(x)), nm.join(' | '));
  check(`${tam} · Nóminas en «ver»: muestra a quién se espera`, /Esperando aprobación del CFO/.test(await bm.innerText()));
  await m.page.screenshot({ path: `${OUT}/${tam}-nomina-solo-ver${tel ? '-mas' : ''}.png` });
  await m.ctx.close();
}

await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · archivos y capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
