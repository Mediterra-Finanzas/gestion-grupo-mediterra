/* ─────────────────────────────────────────────────────────────────────────
   GRUPO 1 · Finanzas y Rendiciones con el sistema compartido.
   Chromium emulado, Supabase falso, datos FICTICIOS, perfil CFO (ve todo).
   Correr contra un build CONGELADO (copia del build que no se toca durante la
   prueba): APP_URL=http://127.0.0.1:4201 OUT_DIR=/tmp/g1 node scripts/e2e/grupo1-finanzas.mjs
   Opcional MAIN_URL (build de main sin cambios) para comparar la impresión del flujo.

   Por pantalla y tamaño (computador 1440, tablet 834 táctil, teléfono 390 táctil):
   captura + sin desborde, sin cifras recortadas, nada fijo bajo la barra inferior,
   rótulos de gráficos ≥ 11 px renderizados, y en táctil el alto y la separación
   de los controles (se informa; se exige en barras de pestañas y botones del sistema).
   DD12: celdas del flujo ≥ 11 px en computador, opción «Letra grande» (13 px), mismos
   valores con ambas, impresión igual que antes, y los 63 meses alcanzables.
   Aprobación: «Devolver con comentarios» de una nómina con el diálogo de la app.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/g1';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0; const filas = [];
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { computador: [1440, 900, false], tablet: [834, 1112, true], telefono: [390, 844, true] };

// Ruta: nombre → pasos (botones por nombre exacto dentro de <main>, en orden).
const RUTAS = [
  ['dashboard', ['📊 Dashboard']],
  ['flujo-consolidado', ['📈 Flujo Empresas', '🏛 Consolidado']],
  ['flujo-porempresa', ['📈 Flujo Empresas', '🏛 Consolidado', '📋 Por Empresa']],
  ['flujo-matriz', ['📈 Flujo Empresas', '🏛 Consolidado', '📊 Matriz Mensual']],
  ['flujo-waterfall', ['📈 Flujo Empresas', '🏛 Consolidado', '📉 Waterfall']],
  ['flujo-semanal', ['📈 Flujo Empresas', '🏛 Consolidado', '📅 Resumen Semanal']],
  ['flujo-empresa', ['📈 Flujo Empresas', /Allegria Foods/]],
  ['flujo-parametros', ['📈 Flujo Empresas', /Allegria Foods/, '⚡ Parámetros']],
  ['bancos', ['🏦 Saldos Bancos']],
  ['creditos', ['💳 Créditos']],
  ['creditos-conciliacion', ['💳 Créditos', '🔎 Conciliación']],
  ['creditos-analisis', ['💳 Créditos', '📊 Análisis CFO']],
  ['creditos-prepago', ['💳 Créditos', '🧮 Simular prepago']],
  ['creditos-saldomes', ['💳 Créditos', '📅 Saldo por Mes']],
  ['nominas', ['📋 Nóminas']],
  ['reporte', ['📅 Reporte Semanal']],
  ['reporte-umbrales', ['📅 Reporte Semanal', '⚙️ Umbrales']],
  ['auditoria', ['🔍 Auditoría']],
  ['eeff', ['📑 EEFF']],
  ['eeff-consolidado', ['📑 EEFF', 'Consolidado']],
  ['eeff-analisis', ['📑 EEFF', 'Análisis']],
  ['rendiciones', ['🧾 Rendiciones']],
  ['rendiciones-aprobar', ['🧾 Rendiciones', /Por Aprobar/]],
  ['rendiciones-pagos', ['🧾 Rendiciones', /Pagos/]],
  ['rendiciones-reportes', ['🧾 Rendiciones', /Reportes/]],
  ['rendiciones-maestros', ['🧾 Rendiciones', /Maestros/]],
];

const medir = (tactil) => {
  const W = innerWidth;
  const nav = document.querySelector('[data-testid="nav-inferior"]');
  const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
  const fuera = (e) => e.closest('[data-testid^="nav-"],[data-testid="panel-mas"],#vp-barra,#vp-etiqueta');
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
  const t = (e) => (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const todos = [...document.querySelectorAll('main *')].filter(e => !fuera(e));
  const conTexto = todos.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && vis(e));
  const recort = conTexto.filter(e => {
    const sobra = e.scrollWidth > e.clientWidth + 1; const r = e.getBoundingClientRect();
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX; if (/auto|scroll/.test(o)) return false;
      if (/hidden|clip/.test(o)) { const ra = a.getBoundingClientRect(); return r.right > ra.right + 1 || sobra; }
    }
    return false;
  }).filter(e => /\d/.test(e.innerText || '')).map(t);
  const fijos = [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position === 'fixed' && !fuera(e) && vis(e) && !e.closest('[data-testid="dialogo-app"]'))
    .filter(e => { const r = e.getBoundingClientRect(); return nav && r.bottom > navTop + 1 && r.top < innerHeight && Number(getComputedStyle(e).zIndex || 0) < 100; }).map(t);
  const svgTxt = [...document.querySelectorAll('main svg text')].filter(vis).map(e => e.getBoundingClientRect().height);
  const ctrls = todos.filter(e => /^(BUTTON|SELECT|INPUT)$/.test(e.tagName) && !['checkbox', 'radio', 'hidden', 'file'].includes(e.type) && vis(e));
  const bajos = ctrls.filter(e => e.getBoundingClientRect().height < 43.5);
  const delSistema = ctrls.filter(e => e.closest('.mdt-pestanas') || e.classList.contains('mdt-boton'));
  let juntos = 0;
  if (tactil) { const rs = ctrls.slice(0, 400).map(e => e.getBoundingClientRect());
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j]; const dx = Math.max(b.left - a.right, a.left - b.right), dy = Math.max(b.top - a.bottom, a.top - b.bottom);
      if (dx < 7.5 && dy < 7.5 && !(dx < 0 && dy < 0)) juntos++; } }
  return { desborde: document.documentElement.scrollWidth - W, recort, fijos,
    svgMin: svgTxt.length ? Math.min(...svgTxt) : null, ctrls: ctrls.length, bajos: bajos.length,
    sistemaBajos: delSistema.filter(e => e.getBoundingClientRect().height < 43.5).map(t).slice(0, 5), juntos };
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
async function sesion([w, h, tactil], url = process.env.APP_URL, st = Object.assign(storeDiseno(), { __dialogosApp: true })) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, deviceScaleFactor: 1, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; page.on('dialog', d => { nativos.push(d.type() + ': ' + d.message().slice(0, 50)); d.dismiss().catch(() => {}); });
  await page.goto(url);
  await page.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { ctx, page, errores, nativos, st };
}
async function abrirFinanzas(p, tam) {
  if (await p.getByTestId('nav-modulo-finanzas').count()) await p.getByTestId('nav-modulo-finanzas').click();
  else { await p.getByTestId('nav-mas').click(); await p.getByTestId('mas-modulo-finanzas').click(); }
  await p.waitForTimeout(4000);
}
async function pulsar(p, nombre) {
  const b = p.locator('main').getByRole('button', typeof nombre === 'string' ? { name: nombre, exact: true } : { name: nombre });
  if (!(await b.count())) return false;
  await b.first().scrollIntoViewIfNeeded().catch(() => {});
  await b.first().click(); await p.waitForTimeout(1500); return true;
}

// ── 1. Recorrido de pantallas ──
for (const [tam, cfg] of Object.entries(TAM)) {
  const s = await sesion(cfg);
  await abrirFinanzas(s.page, tam);
  for (const [nombre, pasos] of RUTAS) {
    let llego = true;
    for (const paso of pasos) if (!(await pulsar(s.page, paso))) { llego = false; break; }
    if (!llego) { filas.push({ tam, nombre, ausente: true }); continue; }
    await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.waitForTimeout(250);
    const m = await s.page.evaluate(medir, cfg[2]);
    await s.page.screenshot({ path: `${OUT}/${tam}-${nombre}.png` });
    filas.push({ tam, nombre, ...m });
  }
  check(`${tam}: sin errores de página`, s.errores.length === 0, s.errores.slice(0, 2).join(' | '));
  check(`${tam}: ningún diálogo del navegador en el recorrido`, s.nativos.length === 0, s.nativos.join(' | '));
  await s.ctx.close();
}
for (const f of filas) {
  if (f.ausente) { check(`${f.tam} · ${f.nombre}: pantalla alcanzable`, false, 'no se encontró el botón'); continue; }
  check(`${f.tam} · ${f.nombre}: sin desborde ni cifras recortadas`, f.desborde <= 1 && !f.recort.length, `desborde ${f.desborde} · ${f.recort.slice(0, 3).join(' | ')}`);
  if (f.tam === 'telefono') check(`${f.tam} · ${f.nombre}: nada fijo del módulo bajo la barra inferior`, !f.fijos.length, f.fijos.join(' | '));
  if (f.svgMin != null) check(`${f.tam} · ${f.nombre}: rótulos de gráficos ≥ 11 px`, f.svgMin >= 12.5, `${f.svgMin.toFixed(1)} px de caja`);
  if (f.tam !== 'computador') check(`${f.tam} · ${f.nombre}: pestañas y botones del sistema de 44 px`, !f.sistemaBajos.length, f.sistemaBajos.join(' | '));
}

// ── 2. DD12 (computador) ──
// Medición de una tabla: tamaño de TODO texto renderizado (no solo td/th), meses, valores.
const MEDIR_TABLA = (sel) => {
  const t = document.querySelector(sel);
  const textos = [...t.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0);
  const tam = textos.map(e => parseFloat(getComputedStyle(e).fontSize));
  const meses = [...t.querySelectorAll('thead th')].map(e => e.innerText.trim()).filter(x => /^[A-Z][a-z]{2}-\d\d$/.test(x));
  const valores = [...t.querySelectorAll('td, th')].map(e => e.innerText.trim()).join('|');
  return { min: Math.min(...tam), menores: tam.filter(x => x < 11).length, meses: meses.length, primero: meses[0], ultimo: meses[meses.length - 1], valores };
};
// Tamaños impresos de cada celda del cuerpo, en orden (para comparar con main celda a celda).
const IMPRESO = (sel) => [...document.querySelectorAll(sel + ' tbody td')].map(e => getComputedStyle(e).fontSize).join(',');
// Abre todas las temporadas plegadas (encabezado de temporada con un solo mes visible).
async function abrirTemporadas(p, sel) {
  for (let i = 0; i < 12; i++) {
    const n = await p.evaluate((sel) => { const fila = document.querySelector(sel + ' thead tr'); const th = [...fila.querySelectorAll('th')].slice(1).find(e => e.colSpan === 1 && e.onclick !== undefined && /▶|▸|\+/.test(e.innerText)); if (th) { th.click(); return 1; } return 0; }, sel);
    if (!n) break; await p.waitForTimeout(300);
  }
}
const TF = 'table.mdt-tabla-flujo';
let impresoMain = null, impresoMainCons = null, mesesMain = null;
if (process.env.MAIN_URL) {
  const m = await sesion(TAM.computador, process.env.MAIN_URL, storeDiseno());
  await m.page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await m.page.waitForTimeout(4000);
  await m.page.getByRole('button', { name: '📈 Flujo Empresas', exact: true }).first().click(); await m.page.waitForTimeout(1500);
  await m.page.getByRole('button', { name: /Allegria Foods/ }).first().click(); await m.page.waitForTimeout(2000);
  // En main la tabla de Flujo Empresas es la única con temporadas en esa pantalla.
  const selM = 'table';
  mesesMain = await m.page.evaluate(() => [...document.querySelector('table').querySelectorAll('thead th')].filter(e => /^[A-Z][a-z]{2}-\d\d$/.test(e.innerText.trim())).length);
  await m.page.emulateMedia({ media: 'print' });
  impresoMain = await m.page.evaluate(IMPRESO, selM);
  await m.page.emulateMedia({ media: 'screen' });
  await m.page.getByRole('button', { name: '🏛 Consolidado', exact: true }).first().click(); await m.page.waitForTimeout(2500);
  await m.page.emulateMedia({ media: 'print' });
  impresoMainCons = await m.page.evaluate(IMPRESO, '#flujo-table-consolidado');
  await m.ctx.close();
}
{
  const s = await sesion(TAM.computador);
  await abrirFinanzas(s.page, 'computador');
  await pulsar(s.page, '📈 Flujo Empresas'); await pulsar(s.page, /Allegria Foods/);
  const a = await s.page.evaluate(MEDIR_TABLA, TF);
  check('DD12 · computador: todo el texto de la tabla del flujo en 11 px o más', a.menores === 0 && a.min >= 11, `mín ${a.min} · bajo 11: ${a.menores}`);
  if (mesesMain != null) check('DD12 · al abrir, la tabla muestra los mismos meses que main (temporadas plegadas igual)', a.meses === mesesMain, `${a.meses} vs main ${mesesMain}`);
  await s.page.emulateMedia({ media: 'print' });
  const impN = await s.page.evaluate(IMPRESO, TF);
  await s.page.emulateMedia({ media: 'screen' });
  if (impresoMain != null) check('DD12 · impresión: cada celda con el mismo tamaño que en main', impN === impresoMain, `${impN.split(',').length} celdas · ${[...new Set(impN.split(','))].join('/')} vs main ${[...new Set(impresoMain.split(','))].join('/')}`);
  await abrirTemporadas(s.page, TF);
  const todas = await s.page.evaluate(MEDIR_TABLA, TF);
  check('DD12 · con las temporadas abiertas se ven los 63 meses', todas.meses >= 63, `${todas.meses} meses (${todas.primero} → ${todas.ultimo})`);
  check('DD12 · con los 63 meses, todo el texto sigue en 11 px o más', todas.menores === 0, `mín ${todas.min}`);
  const fin = await s.page.evaluate(() => { const c = document.querySelector('.mdt-tabla-foco'); c.scrollLeft = c.scrollWidth;
    const ths = [...document.querySelectorAll('table.mdt-tabla-flujo thead th')].filter(e => /^[A-Z][a-z]{2}-\d\d$/.test(e.innerText.trim()));
    const u = ths[ths.length - 1].getBoundingClientRect(), r = c.getBoundingClientRect(); return { mes: ths[ths.length - 1].innerText.trim(), visible: u.right <= r.right + 1 && u.left >= r.left };
  });
  check('DD12 · desplazando la tabla se llega al último mes', fin.visible, fin.mes);
  const fija = await s.page.evaluate(() => { const td = document.querySelector('table.mdt-tabla-flujo tbody td'); const c = document.querySelector('.mdt-tabla-foco'); return { pos: getComputedStyle(td).position, izq: Math.round(td.getBoundingClientRect().left - c.getBoundingClientRect().left) }; });
  check('DD12 · la primera columna sigue fija (también desplazada al final)', fija.pos === 'sticky' && fija.izq <= 2, `${fija.pos} · ${fija.izq}px del borde`);
  await s.page.evaluate(() => { document.querySelector('.mdt-tabla-foco').scrollLeft = 0; });
  await s.page.screenshot({ path: `${OUT}/DD12-computador-normal.png` });
  await s.page.getByTestId('flujo-letra').click(); await s.page.waitForTimeout(600);
  const b = await s.page.evaluate(MEDIR_TABLA, TF);
  check('DD12 · «Letra grande» sube las celdas a 13 px o más', b.min >= 13, `mín ${b.min}`);
  check('DD12 · mismos valores con letra normal y grande', todas.valores === b.valores, `${todas.valores.length} vs ${b.valores.length} caracteres`);
  await s.page.screenshot({ path: `${OUT}/DD12-computador-grande.png` });
  await s.page.emulateMedia({ media: 'print' });
  const impG = await s.page.evaluate(IMPRESO, TF);
  await s.page.emulateMedia({ media: 'screen' });
  const impNTodas = impN; // misma cantidad de celdas solo con iguales temporadas: se compara el conjunto de tamaños
  check('DD12 · al imprimir, «Letra grande» no cambia el impreso', [...new Set(impG.split(','))].sort().join('/') === [...new Set(impNTodas.split(','))].sort().join('/'), `${[...new Set(impG.split(','))].join('/')}`);
  // Consolidado (vista sumada y por empresa) con la misma preferencia.
  await pulsar(s.page, '🏛 Consolidado');
  const c1 = await s.page.evaluate(MEDIR_TABLA, '#flujo-table-consolidado');
  check('DD12 · Consolidado sumado: texto en 13 px o más con «Letra grande» (preferencia compartida)', c1.min >= 13, `mín ${c1.min}`);
  await s.page.getByTestId('consolidado-letra').click(); await s.page.waitForTimeout(500);
  const c2 = await s.page.evaluate(MEDIR_TABLA, '#flujo-table-consolidado');
  check('DD12 · Consolidado sumado: todo el texto en 11 px o más', c2.menores === 0 && c2.min >= 11, `mín ${c2.min} · bajo 11: ${c2.menores}`);
  await s.page.emulateMedia({ media: 'print' });
  const impC = await s.page.evaluate(IMPRESO, '#flujo-table-consolidado');
  await s.page.emulateMedia({ media: 'screen' });
  if (impresoMainCons != null) check('DD12 · Consolidado: impresión con el mismo tamaño por celda que main', impC === impresoMainCons, `${[...new Set(impC.split(','))].join('/')} vs main ${[...new Set(impresoMainCons.split(','))].join('/')}`);
  await s.page.screenshot({ path: `${OUT}/DD12-consolidado.png` });
  await pulsar(s.page, '📋 Por Empresa');
  const c3 = await s.page.evaluate(MEDIR_TABLA, 'table.mdt-tabla-flujo');
  check('DD12 · Consolidado por empresa: todo el texto en 11 px o más', c3.menores === 0 && c3.min >= 11, `mín ${c3.min} · bajo 11: ${c3.menores}`);
  await s.page.reload(); await s.page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const bb = s.page.getByRole('button', { name: t }); if (await bb.count()) await bb.first().click().catch(() => {}); }
  check('DD12 · la preferencia queda en este navegador', await s.page.evaluate(() => { try { return localStorage.getItem('mdt-flujo-letra'); } catch (e) { return null; } }) === 'normal');
  await s.ctx.close();
}

// ── 3. Aprobación de nómina con el diálogo de la app (teléfono) ──
{
  const s = await sesion(TAM.telefono);
  await abrirFinanzas(s.page, 'telefono');
  await pulsar(s.page, '📋 Nóminas');
  // La nómina en revisión de la semilla está en la semana 40 (la lista abre en la semana actual).
  const selSem = s.page.locator('main select').filter({ has: s.page.locator('option[value="40"]') });
  if (await selSem.count()) { await selSem.first().selectOption('40'); await s.page.waitForTimeout(800); }
  await s.page.screenshot({ path: `${OUT}/telefono-nominas-s40.png` });
  const fila = s.page.locator('tr', { hasText: 'Osiris' }).filter({ hasText: /V°B°|Revisi/i });
  if (await fila.count()) await fila.first().getByRole('button', { name: /Editar|Ver/ }).first().click();
  else await s.page.locator('main').getByText(/N°\s*2|#2/).first().click().catch(() => {});
  await s.page.waitForTimeout(2000);
  await s.page.screenshot({ path: `${OUT}/telefono-nomina-detalle.png` });
  const dev = s.page.getByRole('button', { name: /Devolver con comentarios/ });
  check('Nómina con V°B° (perfil CFO): ofrece «Devolver con comentarios»', (await dev.count()) > 0);
  if (await dev.count()) {
    await dev.first().click(); await s.page.waitForTimeout(500);
    const dlg = s.page.getByTestId('dialogo-app');
    check('Devolver: abre el diálogo de la app (sin diálogo del navegador)', (await dlg.count()) === 1 && s.nativos.length === 0, s.nativos.join('|'));
    check('Devolver: el motivo es obligatorio (no deja aceptar vacío)', await s.page.getByTestId('dialogo-aceptar').isDisabled());
    await s.page.screenshot({ path: `${OUT}/telefono-nomina-devolver.png` });
    await dlg.locator('textarea').fill('Falta respaldo de la línea 2 (prueba)');
    await s.page.getByTestId('dialogo-aceptar').click(); await s.page.waitForTimeout(2500);
    const n = (leerFila(s.st, 'nominas_osiris')?.nominas || []).find(x => x.id === 'NOMR');
    check('Devolver: la nómina vuelve a «revision» con el motivo registrado', n?.estado === 'revision' && /línea 2/.test(n?.ultimaDevolucion?.motivo || ''), `${n?.estado} · ${n?.ultimaDevolucion?.motivo}`);
  }
  check('Aprobación: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
  await s.ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/medicion.json`, JSON.stringify(filas, null, 1));
console.log('\nPantalla | controles táctiles < 44 px | pares a < 8 px');
for (const f of filas.filter(f => !f.ausente && f.tam !== 'computador')) console.log(`${f.tam} · ${f.nombre} | ${f.bajos}/${f.ctrls} | ${f.juntos}`);
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
