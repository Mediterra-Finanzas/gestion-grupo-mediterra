/* ─────────────────────────────────────────────────────────────────────────
   HUB DE OSIRIS: antes / después con el sistema común. Chromium emulado,
   Supabase falso, datos FICTICIOS.

     APP_URL=http://127.0.0.1:4242 ANTES_URL=http://127.0.0.1:4240 OUT_DIR=/tmp/hub \
       node scripts/e2e/osiris-hub.mjs

   Por tamaño (computador 1440, tablet 834 táctil, teléfono 390 táctil):
   - capturas antes y después (pantalla visible y página completa) y alto del hub;
   - los 7 accesos, cada uno un botón con nombre, con sus contadores de siempre;
   - cuántos accesos se ven enteros en la primera pantalla;
   - foco visible con teclado; sin controles de arrastre;
   - abrir un acceso lleva a su sub-módulo;
   - «Ordenar accesos» cambia y guarda el orden (quién puede ordenar se prueba aparte);
   - logo de Osiris presente y sin deformar; sin desborde; sin errores ni diálogos nativos.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/hub'; fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0; const filas = [];
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { computador: [1440, 900, false], tablet: [834, 1112, true], telefono: [390, 844, true] };
const TITULOS = ['Ingresos Osiris', 'Contratos Exportadores-Productores', 'Contratos Obtentores', 'Contratos Viveros', 'Operación Técnica', 'Reportes / BI', 'Seguimiento Tareas'];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function sesion(url, [w, h, tactil], email = 'ahuerta@grupomediterra.cl') {
  const st = storeDiseno(); st.__dialogosApp = true;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, isMobile: tactil, deviceScaleFactor: 1, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; p.on('dialog', d => { nativos.push(d.type()); d.dismiss().catch(() => {}); });
  await p.goto(url);
  await p.locator('input[type=email]').fill(email); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  if (await p.getByTestId('nav-modulo-osiris').count()) await p.getByTestId('nav-modulo-osiris').click();
  else { await p.getByTestId('nav-mas').click(); await p.getByTestId('mas-modulo-osiris').click(); }
  await p.waitForTimeout(2500);
  return { ctx, p, st, errores, nativos };
}
// Accesos enteros dentro de la primera pantalla (por el texto del título).
// Dónde termina el bloque de accesos (borde inferior del último acceso), en px de página.
const finAccesos = (p) => p.evaluate((titulos) => {
  let max = 0;
  for (const t of titulos) {
    const el = [...document.querySelectorAll('div,button,span')].find(e => e.textContent.trim() === t && e.children.length === 0);
    const card = el && (el.closest('button') || el.closest('[draggable]') || el.parentElement);
    if (card) max = Math.max(max, card.getBoundingClientRect().bottom + scrollY);
  }
  return Math.round(max);
}, TITULOS);
const visiblesEnPantalla = (p) => p.evaluate((titulos) => {
  const alto = innerHeight; let n = 0;
  for (const t of titulos) {
    const el = [...document.querySelectorAll('div,button,span')].find(e => e.textContent.trim() === t && e.children.length === 0);
    const card = el && (el.closest('button') || el.closest('[draggable]') || el.parentElement);
    if (card) { const r = card.getBoundingClientRect(); if (r.top >= 0 && r.bottom <= alto) n++; }
  }
  return n;
}, TITULOS);

for (const [tam, dim] of Object.entries(TAM)) {
  // ── Antes ──
  const a = await sesion(process.env.ANTES_URL, dim);
  await a.p.screenshot({ path: `${OUT}/${tam}-antes.png` });
  await a.p.screenshot({ path: `${OUT}/${tam}-antes-completa.png`, fullPage: true });
  const altoAntes = await finAccesos(a.p);
  const visAntes = await visiblesEnPantalla(a.p);
  await a.ctx.close();
  // ── Después ──
  const s = await sesion(process.env.APP_URL, dim);
  const p = s.p, hub = p.getByTestId('hub-osiris');
  await p.screenshot({ path: `${OUT}/${tam}-despues.png` });
  await p.screenshot({ path: `${OUT}/${tam}-despues-completa.png`, fullPage: true });
  const altoDesp = await finAccesos(p);
  const visDesp = await visiblesEnPantalla(p);
  filas.push({ tam, altoAntes, altoDesp, visAntes, visDesp });
  const botones = hub.locator('button.mdt-acceso');
  const nombres = await botones.evaluateAll(bs => bs.map(b => b.querySelector('.mdt-acceso__titulo')?.textContent));
  check(`${tam} · los 7 accesos, en el orden guardado`, JSON.stringify(nombres) === JSON.stringify(TITULOS), nombres.join(' | '));
  check(`${tam} · toda la tarjeta es un botón`, await botones.count() === 7);
  const txt = await hub.innerText();
  check(`${tam} · contadores de siempre (contratos y viveros)`, /\d+ contratos/.test(txt) && /\d+ viveros/.test(txt));
  check(`${tam} · más accesos a la vista que antes`, visDesp >= visAntes && visDesp >= (tam === 'telefono' ? 6 : 7), `antes ${visAntes} de 7 · después ${visDesp} de 7`);
  check(`${tam} · los accesos terminan más arriba que antes`, altoDesp < altoAntes, `${altoAntes} → ${altoDesp} px`);
  check(`${tam} · sin controles de arrastre`, await p.locator('[draggable="true"]').count() === 0 && !(await p.content()).includes('⋮⋮'));
  const lg = await p.locator('main img[src="/osiris-logo.jpg"]').evaluateAll(is => is.map(i => ({ ok: i.naturalWidth > 0 && Math.abs(i.getBoundingClientRect().width / i.getBoundingClientRect().height - i.naturalWidth / i.naturalHeight) < 0.03 })));
  check(`${tam} · logo de Osiris en encabezado y hub, sin deformar`, lg.length >= 2 && lg.every(x => x.ok));
  check(`${tam} · sin desborde horizontal`, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0);
  const altos = await botones.evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
  check(`${tam} · accesos compactos y táctiles`, Math.max(...altos) <= (tam === 'telefono' ? 80 : tam === 'tablet' ? 112 : 104) && Math.min(...altos) >= 44, altos.join(','));
  // Foco con teclado
  await botones.first().focus(); await p.keyboard.press('Tab');
  const foco = await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { cls: e.className, outline: cs.outlineStyle, w: cs.outlineWidth }; });
  check(`${tam} · foco visible al recorrer con teclado`, /mdt-acceso/.test(foco.cls) && foco.outline !== 'none' && foco.w !== '0px', JSON.stringify(foco));
  if (tam === 'telefono') { await p.keyboard.press('Shift+Tab'); }
  // Abrir un acceso
  await hub.getByTestId('hub-osiris-contratos').click(); await p.waitForTimeout(1000);
  check(`${tam} · abrir un acceso lleva a su sub-módulo`, /Contratos Exp-Prod/.test(await p.getByTestId('encabezado-osiris').innerText()));
  await p.getByTestId('encabezado-osiris').getByRole('button', { name: '🏠 Osiris Hub' }).click(); await p.waitForTimeout(800);
  // Ordenar (admin)
  if (tam === 'computador') {
    const esc0 = (s.st.__escrituras || []).filter(e => e.id === 'osiris').length;
    await p.getByTestId('hub-osiris-ordenar').click();
    await p.getByRole('button', { name: 'Bajar Ingresos Osiris' }).click(); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${tam}-ordenar.png` });
    await p.getByTestId('hub-osiris-ordenar').click(); await p.waitForTimeout(2500);
    const orden = await hub.locator('.mdt-acceso__titulo').allInnerTexts();
    const guardado = (() => { const v = s.st.osiris.value; const o = typeof v === 'string' ? JSON.parse(v) : v; return o.hubCardsOrder; })();
    check(`${tam} · «Ordenar accesos» cambia el orden y lo guarda (sin arrastrar)`, orden[0] === 'Contratos Exportadores-Productores' && orden[1] === 'Ingresos Osiris'
      && Array.isArray(guardado) && guardado[0] === 'contratos' && (s.st.__escrituras || []).filter(e => e.id === 'osiris').length > esc0, (guardado || []).join(','));
  }
  check(`${tam} · sin errores ni diálogos nativos`, !s.errores.length && !s.nativos.length, [...s.errores, ...s.nativos].join(' | '));
  await s.ctx.close();
}
// Perfil consulta: ve los mismos accesos. Quién puede ORDENAR es autorización y se prueba aparte
// (rama claude/osiris-permiso-orden, scripts/e2e/osiris-permiso-orden.mjs).
{
  const s = await sesion(process.env.APP_URL, TAM.computador, 'socia.consulta@ejemplo.cl');
  await s.p.screenshot({ path: `${OUT}/consulta.png` });
  check('consulta · ve los mismos 7 accesos', await s.p.locator('[data-testid="hub-osiris"] button.mdt-acceso').count() === 7);
  await s.ctx.close();
}
await browser.close();
console.log('\nFin del bloque de accesos (px desde arriba) y accesos enteros en la primera pantalla:');
filas.forEach(f => console.log(`  ${f.tam.padEnd(10)} fin ${f.altoAntes} → ${f.altoDesp} px · accesos a la vista ${f.visAntes} → ${f.visDesp} de 7`));
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
