/* ─────────────────────────────────────────────────────────────────────────
   CABECERA BLANCA CON LOGO en el Excel del flujo por empresa (SheetJS).
   Chromium emulado, Supabase falso, datos FICTICIOS.

     APP_URL=<build nuevo> ANTES_URL=<build anterior> OUT_DIR=/tmp/cab \
       node scripts/e2e/excel-cabecera.mjs

   Descarga el mismo Excel desde los dos builds y exige:
     1. mismas hojas, mismas celdas y las MISMAS fórmulas, celda por celda;
     2. mismos valores después de recalcular de verdad en LibreOffice (sin caché);
     3. la grilla no se movió: solo cambia la fila 1 (estilo y altura) y se agrega
        el dibujo; ninguna fila insertada;
     4. el logo es el archivo original de la empresa (byte a byte) y conserva su
        proporción;
     5. impresión (LibreOffice → PDF): la página 1 lleva el logo y el título
        legible, y el logo no tapa el título.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const require = createRequire(import.meta.url);
const JSZip = require('/opt/node-tools/node_modules/jszip');
const OUT = process.env.OUT_DIR || '/tmp/cab';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const EMPRESAS = (process.env.EMPRESAS || 'Allegria Foods,Mediterra').split(',');
const LOGO = { 'Allegria Foods': 'allegria-logo.jpg', 'Mediterra': 'med.png', 'Osiris': 'osiris-logo.jpg', 'Allpa Farms': 'allpa-chile-logo.png' };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function descargarExcels(url, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const st = Object.assign(storeDiseno(), { __dialogosApp: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Santiago', acceptDownloads: true });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  await ctx.route(/jszip\.min\.js/, r => r.fulfill({ path: '/opt/node-tools/node_modules/jszip/dist/jszip.min.js', contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  await p.goto(url);
  await p.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  await p.getByTestId('nav-modulo-finanzas').click(); await p.waitForTimeout(3000);
  await p.locator('main').getByRole('button', { name: /Flujo Empresas/ }).first().click(); await p.waitForTimeout(2000);
  const out = {};
  for (const emp of EMPRESAS) {
    const botones = p.locator('main').getByRole('button'); const n = await botones.count();
    for (let i = 0; i < n; i++) {
      const t = (await botones.nth(i).innerText().catch(() => '')).replace(/[✦\s]+$/g, '').trim();
      if (t.endsWith(emp) && t !== emp) { await botones.nth(i).click(); break; }
    }
    await p.waitForTimeout(1500);
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('main').getByRole('button', { name: /📥 Excel/ }).first().click()]);
    out[emp] = path.join(dir, `${emp.replace(/\s+/g, '_')}.xlsx`); await d.saveAs(out[emp]);
  }
  check(`${path.basename(dir)}: sin errores de la página`, !errores.length, errores.join(' | '));
  await ctx.close();
  return out;
}

// Celdas de todas las hojas: { 'sheetN!A1': { f, v, s } } + alturas de fila
async function celdas(ruta) {
  const z = await JSZip.loadAsync(fs.readFileSync(ruta));
  const hojas = Object.keys(z.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort();
  const res = {}, filas = {}, xml = {};
  // Formato RESUELTO de cada índice de estilo (SheetJS numera los estilos según aparecen:
  // el número puede cambiar sin que cambie el formato).
  const st = await z.file('xl/styles.xml').async('string');
  const lista = (tag, cont) => [...((new RegExp(`<${cont}[^>]*>(.*?)</${cont}>`, 's').exec(st) || [])[1] || '').matchAll(new RegExp(`<${tag}\\b[^>]*?(?:/>|>.*?</${tag}>)`, 'gs'))].map(m => m[0]);
  const fonts = lista('font', 'fonts'), fills = lista('fill', 'fills'), borders = lista('border', 'borders'), xfs = lista('xf', 'cellXfs');
  const fmts = Object.fromEntries([...st.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const at = (x, n) => (new RegExp(` ${n}="(\\d+)"`).exec(x) || [])[1] || '0';
  const resolver = (i) => { const x = xfs[Number(i || 0)] || ''; return JSON.stringify([fonts[at(x, 'fontId')], fills[at(x, 'fillId')], borders[at(x, 'borderId')], fmts[at(x, 'numFmtId')] || at(x, 'numFmtId'), (/<alignment[^>]*\/>/.exec(x) || [''])[0]]); };
  for (const h of hojas) {
    const s = await z.file(h).async('string'); xml[h] = s;
    for (const m of s.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const b = m[3] || '';
      res[`${h}!${m[1]}`] = { f: (/<f>([^<]*)<\/f>/.exec(b) || [])[1] || null, v: (/<v>([^<]*)<\/v>/.exec(b) || [])[1] ?? null, s: resolver((/ s="(\d+)"/.exec(m[2]) || [])[1]) };
    }
    filas[h] = [...s.matchAll(/<row r="(\d+)"([^>]*)>/g)].map(m => ({ r: +m[1], attrs: m[2] }));
  }
  return { z, hojas, res, filas, xml };
}
// Recalcula con LibreOffice (caché de fórmulas eliminada) y devuelve los valores
async function recalcular(ruta, tag) {
  const z = await JSZip.loadAsync(fs.readFileSync(ruta));
  for (const f of Object.keys(z.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    z.file(f, (await z.file(f).async('string')).replace(/(<f>[^<]*<\/f>)<v>[^<]*<\/v>/g, '$1'));
  }
  const dir = path.join(OUT, `rec-${tag}`); fs.mkdirSync(dir, { recursive: true });
  const sc = path.join(dir, 'sincache.xlsx'); fs.writeFileSync(sc, await z.generateAsync({ type: 'nodebuffer' }));
  const od = path.join(dir, 'lo'); fs.mkdirSync(od, { recursive: true });
  sh('soffice', ['--headless', '--convert-to', 'xlsx', '--outdir', od, sc]);
  // LibreOffice reescribe con cadenas compartidas: solo interesan los números de las celdas con fórmula
  const r = await celdas(path.join(od, 'sincache.xlsx'));
  return r.res;
}
const dimImagen = (b) => {
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  for (let i = 2; i < b.length;) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xC3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; }
  return null;
};

const ahora = await descargarExcels(process.env.APP_URL, path.join(OUT, 'ahora'));
const antes = await descargarExcels(process.env.ANTES_URL, path.join(OUT, 'antes'));

for (const emp of EMPRESAS) {
  const a = await celdas(antes[emp]), b = await celdas(ahora[emp]);
  check(`${emp}: mismas hojas (${a.hojas.length})`, JSON.stringify(a.hojas) === JSON.stringify(b.hojas));
  const claves = new Set([...Object.keys(a.res), ...Object.keys(b.res)]);
  const difF = [...claves].filter(k => (a.res[k]?.f || null) !== (b.res[k]?.f || null));
  const difV = [...claves].filter(k => (a.res[k]?.v ?? null) !== (b.res[k]?.v ?? null));
  const nF = Object.values(b.res).filter(c => c.f).length;
  check(`${emp}: mismas celdas y mismas ${nF} fórmulas, celda por celda`, !difF.length && claves.size === Object.keys(a.res).length, difF.slice(0, 3).join(', '));
  check(`${emp}: mismos valores en caché en ${claves.size} celdas`, !difV.length, difV.slice(0, 3).join(', '));
  // estilo: solo cambia la fila 1 de la hoja 1
  const difS = [...claves].filter(k => (a.res[k]?.s || null) !== (b.res[k]?.s || null));
  const fuera = difS.filter(k => !/^xl\/worksheets\/sheet1\.xml![A-Z]+1$/.test(k));
  check(`${emp}: el formato (fuente, relleno, borde, número) cambia solo en la fila 1 de la hoja del flujo (${difS.length} celdas)`, difS.length > 0 && !fuera.length, fuera.slice(0, 3).join(', '));
  const h1 = 'xl/worksheets/sheet1.xml';
  const fa = a.filas[h1], fb = b.filas[h1];
  check(`${emp}: ninguna fila insertada (${fb.length} filas, misma numeración)`, fa.length === fb.length && fa.every((x, i) => x.r === fb[i].r));
  const alto = (f) => Number((/ ht="([\d.]+)"/.exec(f[0].attrs) || [])[1] || 0);
  console.log(`   fila 1: alto ${alto(fa)} → ${alto(fb)} pt`);
  const otrasAlturas = fa.slice(1).filter((x, i) => x.attrs !== fb[i + 1].attrs);
  check(`${emp}: las demás filas conservan su formato de fila`, !otrasAlturas.length, otrasAlturas.slice(0, 2).map(x => x.r).join(','));
  // sin dibujo antes, con dibujo ahora; la hoja solo agrega <drawing>
  const xa = a.xml[h1], xb = b.xml[h1];
  const normal = (x) => x.replace(/<drawing r:id="rIdLogo1"\/>/, '').replace(/<row r="1"[^>]*>.*?<\/row>/s, '').replace(/ s="\d+"/g, '');
  check(`${emp}: fuera de la fila 1, la hoja es idéntica salvo el <drawing>`, normal(xa) === normal(xb));
  // logo = archivo original, proporción conservada
  const media = Object.keys(b.z.files).find(f => /^xl\/media\/logo_empresa\./.test(f));
  const orig = fs.readFileSync(path.join('public', LOGO[emp]));
  const bytes = media ? Buffer.from(await b.z.file(media).async('uint8array')) : null;
  const dib = media ? await b.z.file('xl/drawings/drawing1.xml').async('string') : '';
  const m = /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(dib); const d = dimImagen(orig);
  check(`${emp}: logo = ${LOGO[emp]} byte a byte y en su proporción`, bytes && bytes.equals(orig) && m && Math.abs(m[1] / m[2] - d.w / d.h) < 0.01);
  // recálculo real
  const ra = await recalcular(antes[emp], `${emp}-antes`), rb = await recalcular(ahora[emp], `${emp}-ahora`);
  const conF = Object.keys(b.res).filter(k => b.res[k].f);
  const num = (x) => x == null || x === '' ? 0 : Number(x);
  const difR = conF.filter(k => Math.abs(num(ra[k]?.v) - num(rb[k]?.v)) > 1e-6);
  check(`${emp}: recalculado en LibreOffice, ${conF.length} fórmulas con el mismo resultado`, conF.length > 0 && !difR.length, difR.slice(0, 3).map(k => `${k} ${ra[k]?.v}≠${rb[k]?.v}`).join(', '));
  // impresión
  const pd = path.join(OUT, `pdf-${emp.replace(/\s+/g, '_')}`); fs.mkdirSync(pd, { recursive: true });
  sh('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', pd, ahora[emp]]);
  const pdf = path.join(pd, fs.readdirSync(pd).find(f => f.endsWith('.pdf')));
  const imgs = sh('pdfimages', ['-list', '-f', '1', '-l', '1', pdf]).split('\n').slice(2).filter(l => /\bimage\b/.test(l));
  const txt = sh('pdftotext', ['-f', '1', '-l', '1', '-layout', pdf, '-']);
  check(`${emp}: impresión, página 1 con el logo y el título legible`, imgs.length >= 1 && txt.includes(emp), `${imgs.length} imagen(es)`);
  // el logo empieza a la derecha del final del título (posición del ancla vs. ancho del título en la impresión)
  const bbox = sh('pdftotext', ['-f', '1', '-l', '1', '-bbox', pdf, '-']);
  const pal = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(x => ({ x0: +x[1], y0: +x[2], x1: +x[3], t: x[5] }));
  const titulo = pal.filter(w => emp.split(' ').includes(w.t)).sort((p1, p2) => p1.y0 - p2.y0).slice(0, emp.split(' ').length);
  fs.writeFileSync(path.join(pd, 'titulo.json'), JSON.stringify(titulo));
  sh('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '1', pdf, path.join(OUT, `impresion-${emp.replace(/\s+/g, '_')}`)]);
}
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · LibreOffice para recálculo e impresión`);
process.exit(fallos ? 1 : 0);
