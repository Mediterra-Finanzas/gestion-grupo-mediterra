/* ─────────────────────────────────────────────────────────────────────────
   MUESTRA EJECUTIVA (rama de diseño). Chromium emulado, Supabase falso, datos
   FICTICIOS, diálogos de la app (modo nativo apagado). Build congelado:
   APP_URL=http://127.0.0.1:4204 OUT_DIR=/tmp/muestra node scripts/e2e/muestra-ejecutiva.mjs

   Recorre en computador (1440), laptop (1280), tablet (834 táctil) y teléfono
   (390 táctil): inicio del CFO, bandeja de pendientes, inicio de quien solo rinde,
   Flujo Empresas con encabezado común, rendición (documentos + circuito) y nómina
   (circuito + devolver). Comprueba sin desborde, sin errores, sin diálogos del
   navegador, permisos (quien solo rinde no ve decisiones ni módulos) y que
   «Requiere tu decisión» cuenta solo lo ejecutable por el perfil.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/muestra';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { computador: [1440, 900, false], laptop: [1280, 800, false], tablet: [834, 1112, true], telefono: [390, 844, true] };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function sesion([w, h, tactil], email) {
  const st = Object.assign(storeDiseno(), { __dialogosApp: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, deviceScaleFactor: 1, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; page.on('dialog', d => { nativos.push(d.type() + ': ' + d.message().slice(0, 50)); d.dismiss().catch(() => {}); });
  await page.goto(process.env.APP_URL);
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { ctx, page, errores, nativos, st };
}
const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
async function foto(p, nombre) { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/${nombre}.png` }); }
async function abrirFinanzas(p, tab) {
  if (await p.getByTestId('nav-modulo-finanzas').count()) await p.getByTestId('nav-modulo-finanzas').click();
  else { await p.getByTestId('nav-mas').click(); await p.getByTestId('mas-modulo-finanzas').click(); }
  await p.waitForTimeout(3500);
  if (tab) { await p.locator('main').getByRole('button', { name: tab, exact: true }).first().click(); await p.waitForTimeout(1500); }
}

for (const [tam, cfg] of Object.entries(TAM)) {
  // ── CFO ──
  const s = await sesion(cfg, 'ahuerta@grupomediterra.cl');
  const p = s.page;
  check(`${tam} · CFO inicio: «Requiere tu decisión» visible`, await p.getByTestId('decisiones').count() === 1);
  const nom = await p.getByTestId('cifra-nominas-aprobar').innerText().catch(() => '');
  check(`${tam} · CFO: 1 nómina por aprobar (la con V°B°; la preparada no cuenta)`, /^\D*1\b/.test(nom.replace(/\s+/g, ' ').replace(/Finanzas · Nóminas/, '')), nom.replace(/\s+/g, ' '));
  const rend = await p.getByTestId('cifra-rend-aprobar').innerText().catch(() => '');
  // Regla vigente (meTocaAprobar): la #3 está en SU nivel de la cadena y la #6 no tiene cadena (la aprueba admin/CFO).
  check(`${tam} · CFO: 2 rendiciones le toca aprobar (regla vigente)`, /\b2\b/.test(rend), rend.replace(/\s+/g, ' '));
  check(`${tam} · CFO inicio sin desborde`, (await desborde(p)) <= 1);
  await foto(p, `${tam}-cfo-inicio`);
  if (tam === 'telefono') {
    await p.getByTestId('nav-pendientes').click(); await p.waitForTimeout(800);
    check('teléfono · bandeja de pendientes: decisiones + seguimiento', await p.getByTestId('decisiones').count() === 1 && await p.getByTestId('pend-nominas').count() === 1);
    await foto(p, `${tam}-cfo-pendientes`);
    await p.getByTestId('nav-inicio').click(); await p.waitForTimeout(500);
  }
  // Flujo Empresas
  await abrirFinanzas(p, null);
  await p.locator('main').getByRole('button', { name: /Flujo Empresas/ }).first().click(); await p.waitForTimeout(1500);
  await p.locator('main').getByRole('button', { name: /Allegria Foods/ }).first().click(); await p.waitForTimeout(2000);
  const cab = await p.getByTestId('encabezado-finanzas').innerText().catch(() => '');
  check(`${tam} · Flujo: encabezado común con empresa, moneda y horizonte`, /Empresa/i.test(cab) && /USD/.test(cab) && /63 meses/.test(cab), cab.replace(/\s+/g, ' ').slice(0, 120));
  check(`${tam} · Flujo sin desborde`, (await desborde(p)) <= 1);
  await foto(p, `${tam}-flujo`);
  // Nómina con V°B° (semana 40)
  await p.locator('main').getByRole('button', { name: /Nóminas/ }).first().click(); await p.waitForTimeout(1500);
  const sel = p.locator('main select').filter({ has: p.locator('option[value="40"]') });
  if (await sel.count()) { await sel.first().selectOption('40'); await p.waitForTimeout(800); }
  const fila = p.locator('tr', { hasText: 'Osiris' }).filter({ hasText: /V°B°|Revisi/i });
  if (await fila.count()) await fila.first().getByRole('button', { name: /Editar|Ver/ }).first().click();
  else await p.locator('main').getByText(/N°\s*2|#2/).first().click().catch(() => {});
  await p.waitForTimeout(2000);
  const circ = p.getByTestId('circuito-nomina');
  check(`${tam} · Nómina: circuito con «Aprobación CFO» en curso`, (await circ.count()) === 1 && (await circ.locator('[aria-current="step"]').innerText()).includes('Aprobación CFO'));
  check(`${tam} · Nómina sin desborde`, (await desborde(p)) <= 1);
  await foto(p, `${tam}-nomina`);
  // Rendición por aprobar (documentos + circuito)
  await p.locator('main').getByRole('button', { name: /Rendiciones/ }).first().click(); await p.waitForTimeout(1500);
  await p.locator('main').getByRole('button', { name: /Por Aprobar/ }).first().click(); await p.waitForTimeout(1000);
  await p.locator('main').getByText('Rendición de ejemplo 3', { exact: true }).first().click(); await p.waitForTimeout(1200);
  const cr = p.getByTestId('circuito-rendicion');
  check(`${tam} · Rendición: circuito con aprobación 2 en curso y respaldos completos`, (await cr.count()) === 1
    && (await cr.locator('[aria-current="step"]').innerText()).includes('Aprobación 2')
    && (await p.getByTestId('respaldos-resumen').innerText()).includes('3 de 3'));
  check(`${tam} · Rendición sin desborde`, (await desborde(p)) <= 1);
  await foto(p, `${tam}-rendicion-aprobar`);
  check(`${tam} · CFO: sin errores ni diálogos del navegador`, !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await s.ctx.close();

  // ── Quien solo rinde ──
  const o = await sesion(cfg, 'operario.planta@ejemplo.cl');
  check(`${tam} · Solo rinde: inicio simple, sin decisiones ni módulos`, await o.page.getByTestId('inicio-rendiciones').count() === 1
    && await o.page.getByTestId('decisiones').count() === 0 && await o.page.getByTestId('grilla-modulos').count() === 0);
  check(`${tam} · Solo rinde sin desborde`, (await desborde(o.page)) <= 1);
  await foto(o.page, `${tam}-solo-rinde-inicio`);
  await o.page.getByTestId('rend-estado-0').click(); await o.page.waitForTimeout(2500);
  await o.page.locator('main').getByText('Rendición de ejemplo 1', { exact: true }).first().click(); await o.page.waitForTimeout(1200);
  const rr = o.page.getByTestId('respaldos-resumen');
  check(`${tam} · Solo rinde: borrador avisa el respaldo que falta`, (await rr.count()) === 1 && (await rr.innerText()).includes('2 de 3'));
  check(`${tam} · Solo rinde: formulario sin desborde`, (await desborde(o.page)) <= 1);
  await foto(o.page, `${tam}-solo-rinde-formulario`);
  check(`${tam} · Solo rinde: sin errores ni diálogos del navegador`, !o.errores.length && !o.nativos.length, [...o.errores, ...o.nativos].join(' | '));
  await o.ctx.close();
}
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
