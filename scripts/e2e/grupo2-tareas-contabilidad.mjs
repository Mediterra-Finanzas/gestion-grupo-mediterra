/* ─────────────────────────────────────────────────────────────────────────
   GRUPO 2 · Tareas y Contabilidad con el sistema compartido.
   Chromium emulado, Supabase falso, datos FICTICIOS, perfil CFO (ve todo).
   Correr contra un build CONGELADO:
   APP_URL=http://127.0.0.1:4203 OUT_DIR=/tmp/g2 node scripts/e2e/grupo2-tareas-contabilidad.mjs
   Mismas mediciones que el grupo 1 por pantalla y tamaño (computador 1440, tablet 834
   táctil, teléfono 390 táctil). Contabilidad usa tablas propias (no calendario_data):
   aquí se responden con datos ficticios (CONTAB) y se registra todo intento de escritura.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/g2';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0; const filas = [];
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { computador: [1440, 900, false], tablet: [834, 1112, true], telefono: [390, 844, true] };

// Datos ficticios de Contabilidad (tablas propias del módulo).
const E1 = 'emp-1', E2 = 'emp-2';
const CONTAB = {
  empresas: [
    { id: E1, codigo: 'MED', nombre: 'Mediterra Holding', razon_social: 'Mediterra Holding SpA (ficticia)', rut: '76.000.001-1', activa: true },
    { id: E2, codigo: 'ALF', nombre: 'Allegria Foods', razon_social: 'Allegria Foods SpA (ficticia)', rut: '76.000.002-K', activa: true },
  ],
  contab_plan_cuentas: [
    ['1', 'ACTIVO', 'A', 1], ['1.1', 'ACTIVO CORRIENTE', 'A', 2], ['1.1.01', 'Caja y bancos', 'A', 3], ['1.1.02', 'Deudores por venta', 'A', 3],
    ['2', 'PASIVO', 'P', 1], ['2.1.01', 'Proveedores', 'P', 3], ['3.1.01', 'Capital pagado', 'C', 3],
    ['4.1.01', 'Ingresos por servicios', 'I', 3], ['5.1.01', 'Remuneraciones', 'E', 3], ['5.1.02', 'Honorarios', 'E', 3],
  ].map(([codigo, nombre, tipo, nivel], i) => ({ id: `cta-${i}`, empresa_id: E1, codigo, nombre, tipo, nivel, imputable: nivel === 3, aplica_trib: true, aplica_ifrs: true, activa: true })),
  periodos: Array.from({ length: 12 }, (_, i) => ({ id: `per-${i + 1}`, empresa_id: E1, anio: 2026, mes: i + 1, estado: i < 8 ? 'cerrado' : 'abierto' })),
  tipos_documento: [{ id: 'td-33', codigo: '33', nombre: 'Factura electrónica', activo: true }, { id: 'td-61', codigo: '61', nombre: 'Nota de crédito electrónica', activo: true }],
  centros_costo: [{ id: 'cc-1', empresa_id: E1, codigo: 'ADM', nombre: 'Administración', activo: true }, { id: 'cc-2', empresa_id: E1, codigo: 'OPE', nombre: 'Operaciones', activo: true }],
  contab_auxiliares: [{ id: 'aux-1', rut: '77.111.222-3', nombre: 'Proveedor ficticio Uno', tipo: 'proveedor', activo: true }, { id: 'aux-2', rut: '78.333.444-5', nombre: 'Cliente ficticio Dos', tipo: 'cliente', activo: true }],
};

const RUTAS_TAREAS = [
  ['tareas-diarias', ['📋 Diarias']], ['tareas-semanales', ['📅 Semanales']], ['tareas-quincenales', ['🗓 Quincenales']],
  ['tareas-mensuales', ['📆 Mensuales']], ['tareas-puntuales', ['📌 Puntuales']], ['tareas-anuales', ['🗃 Anuales']], ['tareas-config', ['⚙️ Config']],
];
const RUTAS_CONTAB = [
  ['contab-empresas', ['Empresas']], ['contab-plan', ['Plan de Cuentas']], ['contab-diario', ['Libro Diario']],
  ['contab-sii', ['Centralización SII']], ['contab-auxiliares', ['Auxiliares']], ['contab-cc', ['Centros de Costo']],
  ['contab-tipos', ['Tipos de Documento']], ['contab-periodos', ['Períodos']], ['contab-mapeo', ['Homologación']],
  ['contab-informes', ['Informes y Analítica']],
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
async function sesion([w, h, tactil], { contab = CONTAB, falla = null } = {}) {
  const st = Object.assign(storeDiseno(), { __dialogosApp: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, deviceScaleFactor: 1, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  const escriturasContab = [];
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => {
    const req = r.request(); const tabla = new URL(req.url()).pathname.split('/').pop();
    if (req.method() !== 'GET') { escriturasContab.push(`${req.method()} ${tabla}`); return r.abort(); }
    if (falla && falla.test(tabla)) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"servicio no disponible (simulado)"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(contab[tabla] || []) });
  });
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; page.on('dialog', d => { nativos.push(d.type() + ': ' + d.message().slice(0, 50)); d.dismiss().catch(() => {}); });
  await page.goto(process.env.APP_URL);
  await page.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { ctx, page, errores, nativos, st, escriturasContab };
}
async function abrir(p, modulo) {
  if (await p.getByTestId(`nav-modulo-${modulo}`).count()) await p.getByTestId(`nav-modulo-${modulo}`).click();
  else { await p.getByTestId('nav-mas').click(); await p.getByTestId(`mas-modulo-${modulo}`).click(); }
  await p.waitForTimeout(3000);
}
async function pulsar(p, nombre) {
  const b = p.locator('main').getByRole('button', typeof nombre === 'string' ? { name: nombre, exact: true } : { name: nombre });
  if (!(await b.count())) return false;
  await b.first().scrollIntoViewIfNeeded().catch(() => {});
  await b.first().click(); await p.waitForTimeout(1200); return true;
}

// ── 1. Recorrido de pantallas ──
for (const [tam, cfg] of Object.entries(TAM)) {
  const s = await sesion(cfg);
  for (const [modulo, rutas] of [['tareas', RUTAS_TAREAS], ['contabilidad', RUTAS_CONTAB]]) {
    await abrir(s.page, modulo);
    for (const [nombre, pasos] of rutas) {
      let llego = true;
      for (const paso of pasos) if (!(await pulsar(s.page, paso))) { llego = false; break; }
      if (!llego) { filas.push({ tam, nombre, ausente: true }); continue; }
      await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.waitForTimeout(250);
      const m = await s.page.evaluate(medir, cfg[2]);
      await s.page.screenshot({ path: `${OUT}/${tam}-${nombre}.png` });
      filas.push({ tam, nombre, ...m });
    }
  }
  check(`${tam}: sin errores de página`, s.errores.length === 0, s.errores.slice(0, 2).join(' | '));
  check(`${tam}: ningún diálogo del navegador en el recorrido`, s.nativos.length === 0, s.nativos.join(' | '));
  check(`${tam}: recorrer no escribe en Contabilidad`, s.escriturasContab.length === 0, s.escriturasContab.join(' | '));
  await s.ctx.close();
}
for (const f of filas) {
  if (f.ausente) { check(`${f.tam} · ${f.nombre}: pantalla alcanzable`, false, 'no se encontró el botón'); continue; }
  check(`${f.tam} · ${f.nombre}: sin desborde ni cifras recortadas`, f.desborde <= 1 && !f.recort.length, `desborde ${f.desborde} · ${f.recort.slice(0, 3).join(' | ')}`);
  if (f.tam === 'telefono') check(`${f.tam} · ${f.nombre}: nada fijo del módulo bajo la barra inferior`, !f.fijos.length, f.fijos.join(' | '));
  if (f.tam !== 'computador') check(`${f.tam} · ${f.nombre}: pestañas y botones del sistema de 44 px`, !f.sistemaBajos.length, f.sistemaBajos.join(' | '));
}

// ── 2. Estados: lectura fallida de Contabilidad (no debe parecer «sin registros») ──
{
  const s = await sesion(TAM.computador, { falla: /^(empresas|contab_plan_cuentas)$/ });
  await abrir(s.page, 'contabilidad');
  const t1 = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ');
  check('Contabilidad · empresas sin leer: muestra error con reintento, no «Sin registros»', /No se pudo|Error/i.test(t1) && /Reintentar/.test(t1) && !/Sin registros/.test(t1), t1.slice(0, 160));
  await s.page.screenshot({ path: `${OUT}/contab-error-empresas.png` });
  check('Contabilidad · lectura fallida: no escribe nada', s.escriturasContab.length === 0, s.escriturasContab.join(' | '));
  await s.ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/medicion.json`, JSON.stringify(filas, null, 1));
console.log('\nPantalla | controles táctiles < 44 px | pares a < 8 px');
for (const f of filas.filter(f => !f.ausente && f.tam !== 'computador')) console.log(`${f.tam} · ${f.nombre} | ${f.bajos}/${f.ctrls} | ${f.juntos}`);
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
