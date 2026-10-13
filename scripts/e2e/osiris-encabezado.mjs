/* ─────────────────────────────────────────────────────────────────────────
   OSIRIS con el sistema común (rama de diseño). Chromium emulado, Supabase
   falso, datos FICTICIOS, perfil CFO.

     APP_URL=http://127.0.0.1:4240 OUT_DIR=/tmp/osi node scripts/e2e/osiris-encabezado.mjs

   Por tamaño (computador 1440, teléfono 390 táctil):
   1. Hub: encabezado común, logo de Osiris sin deformar, tarjetas del hub y el
      logo grande centrado se conservan.
   2. Cada sub-app (Ingresos, Contratos Exp-Prod, Obtentores, Viveros,
      Operación Técnica, Reportes, Tareas): mismo encabezado con su título,
      «🏠 Osiris Hub» vuelve al hub; Ingresos muestra «Por cobrar».
   3. «← Mediterra» y «Salir» siguen en computador; en teléfono los oculta la
      barra (mdt-dup-nav), igual que en Finanzas/Tareas/Contabilidad.
   4. «Agregar país» (Maestro de Clientes) abre el diálogo de la app, no
      window.prompt; cancelar no cambia nada.
   5. Navegar no escribe la fila osiris; sin errores ni diálogos nativos.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import { instalarFake, PIN } from './fake.mjs';
import { storeDiseno } from '../vista-previa/semilla-diseno.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '/tmp/osi';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const TAM = { computador: [1440, 900, false], telefono: [390, 844, true] };
const SUBAPPS = [
  ['Ingresos Osiris', 'Ingresos Osiris'], ['Contratos Exportadores-Productores', 'Contratos Exp-Prod'], ['Contratos Obtentores', 'Contratos Obtentores'],
  ['Contratos Viveros', 'Contratos Viveros'], ['Operación Técnica', 'Operación Técnica'], ['Reportes / BI', 'Reportes / BI'], ['Seguimiento Tareas', 'Seguimiento Tareas'],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

for (const [tam, [w, h, tactil]] of Object.entries(TAM)) {
  const st = storeDiseno(); st.__dialogosApp = true;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, isMobile: tactil, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  const nativos = []; p.on('dialog', d => { nativos.push(d.type() + ': ' + d.message().slice(0, 60)); d.dismiss().catch(() => {}); });
  await p.goto(process.env.APP_URL);
  await p.locator('input[type=email]').fill('ahuerta@grupomediterra.cl'); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  if (await p.getByTestId('nav-modulo-osiris').count()) await p.getByTestId('nav-modulo-osiris').click();
  else { await p.getByTestId('nav-mas').click(); await p.getByTestId('mas-modulo-osiris').click(); }
  await p.waitForTimeout(3000);
  const escAntes = (st.__escrituras || []).filter(e => e.id === 'osiris').length;
  const cab = p.getByTestId('encabezado-osiris');
  const desborde = () => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const logo = () => cab.locator('img.mdt-cabmod__logo').evaluate(i => ({ nw: i.naturalWidth, nh: i.naturalHeight, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height }));

  // 1. Hub
  check(`${tam} · hub: encabezado común`, await cab.count() === 1 && /Osiris Plant Management/.test(await cab.locator('h1').innerText()));
  const lg = await logo();
  check(`${tam} · hub: logo de Osiris cargado y sin deformar`, lg.nw > 0 && Math.abs(lg.w / lg.h - lg.nw / lg.nh) < 0.02, JSON.stringify(lg));
  check(`${tam} · hub: se conservan el logo grande y las tarjetas`, await p.locator('main img[src="/osiris-logo.jpg"]').count() >= 2 && await p.getByText('Ingresos Osiris', { exact: true }).count() >= 1);
  check(`${tam} · hub: sin desborde horizontal`, await desborde() <= 0, `${await desborde()} px`);
  const visibles = async (n) => (await cab.getByRole('button', { name: n }).filter({ visible: true }).count()) > 0;
  if (tam === 'computador') check(`${tam} · «← Mediterra» y «Salir» visibles`, await visibles('← Mediterra') && await visibles('Salir'));
  else check(`${tam} · «← Mediterra» y «Salir» los cubre la barra (mdt-dup-nav ocultos)`, !(await visibles('← Mediterra')) && !(await visibles('Salir')));
  await p.screenshot({ path: `${OUT}/${tam}-hub.png` });

  // 2. Sub-apps
  for (const [tarjeta, titulo] of SUBAPPS) {
    await p.getByText(tarjeta, { exact: true }).first().click(); await p.waitForTimeout(1200);
    const t = (await cab.locator('h1').innerText().catch(() => '')).trim();
    check(`${tam} · ${titulo}: encabezado con su título`, t === titulo, t);
    if (titulo === 'Ingresos Osiris') {
      const ctxTxt = await cab.locator('.mdt-cabmod__contexto').innerText().catch(() => '');
      check(`${tam} · Ingresos: «Por cobrar» en el contexto`, /Por cobrar/i.test(ctxTxt) && /\d/.test(ctxTxt), ctxTxt.replace(/\n/g, ' '));
      check(`${tam} · Ingresos: sin desborde`, await desborde() <= 0, `${await desborde()} px`);
      await p.screenshot({ path: `${OUT}/${tam}-ingresos.png` });
      // 4. Agregar país → diálogo de la app
      const sum = p.getByText('👥 Maestro de Clientes');
      if (await sum.count()) {
        await sum.first().click(); await p.getByRole('button', { name: '+ Nuevo cliente' }).first().click(); await p.waitForTimeout(400);
        const sel = p.locator('select', { has: p.locator('option[value="__nuevo__"]') }).first();
        await sel.selectOption('__nuevo__'); await p.waitForTimeout(500);
        const dlg = p.getByTestId('dialogo-app');
        check(`${tam} · «Agregar país» abre el diálogo de la app`, await dlg.count() === 1 && /Agregar país/.test(await dlg.innerText()));
        await p.keyboard.press('Escape'); await p.waitForTimeout(400);
        check(`${tam} · cancelar cierra el diálogo sin cambiar el país`, await dlg.count() === 0 && (await sel.inputValue()) !== '__nuevo__', await sel.inputValue());
        await p.getByRole('button', { name: '✕' }).first().click().catch(() => {});
      } else check(`${tam} · Maestro de Clientes disponible en Ingresos`, false);
    }
    await cab.getByRole('button', { name: '🏠 Osiris Hub' }).click(); await p.waitForTimeout(800);
    check(`${tam} · ${titulo}: «🏠 Osiris Hub» vuelve al hub`, /Osiris Plant Management/.test(await cab.locator('h1').innerText()));
  }

  // 5. Efectos
  const escDesp = (st.__escrituras || []).filter(e => e.id === 'osiris').length;
  check(`${tam} · navegar no escribe la fila osiris`, escDesp === escAntes, `${escDesp - escAntes} escrituras`);
  check(`${tam} · sin errores de página`, !errores.length, errores.join(' | '));
  check(`${tam} · sin diálogos nativos del navegador`, !nativos.length, nativos.join(' | '));

  // 3. «← Mediterra» sale del módulo (solo en computador, donde está visible)
  if (tam === 'computador') {
    await cab.getByRole('button', { name: '← Mediterra' }).click(); await p.waitForTimeout(1200);
    check(`${tam} · «← Mediterra» sale de Osiris`, await p.getByTestId('encabezado-osiris').count() === 0);
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · datos ficticios · capturas en ${OUT}`);
process.exit(fallos ? 1 : 0);
