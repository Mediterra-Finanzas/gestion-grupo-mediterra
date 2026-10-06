// Uso: npm i --no-save playwright && node prototipo/rediseno-2026-10/pruebas/interaccion.mjs [carpeta-capturas]
// (en la nube: PLAYWRIGHT_BROWSERS_PATH ya apunta a Chromium)
import { chromium } from '../../../node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
import fs from 'fs';
// Chromium preinstalado (entorno de la nube) o el de Playwright en otro equipo.
const exe = process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const OUT = process.argv[2] || '.', PAGINA = 'file://' + fileURLToPath(new URL('../index.html', import.meta.url));
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const errs = []; let ok = 0, fallos = 0; const chk = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(`${w}: ${e}`)); p.on('console', m => { if (m.type() === 'error') errs.push(`${w}: ${m.text()}`); });
  await p.goto(PAGINA + '#/finanzas/flujo/af'); await p.waitForTimeout(300);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  chk(`${w}px: sin desborde horizontal de página`, ov <= 0, `${ov}px`);
  const fs = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('td.cell')).fontSize));
  chk(`${w}px: cifras de la tabla ≥ 13px`, fs >= 13, `${fs}px`);
  const ctx = await p.locator('.ctxbar').innerText();
  chk(`${w}px: barra de contexto con empresa, moneda, escenario y período`, /Allegria Foods/.test(ctx) && /US\$/.test(ctx) && /(Escenario|Base)/.test(ctx) && /(Período|Temp)/.test(ctx), ctx.replace(/\n/g," ").slice(0,90));
  // filas fijas: desplazar la tabla hasta arriba; Flujo neto y Saldo deben seguir visibles dentro del contenedor
  const vis = await p.evaluate(() => { const wrap = document.getElementById('ftWrap'); wrap.scrollTop = 0; const r = wrap.getBoundingClientRect(); const n = document.querySelector('tr.neto td.c0').getBoundingClientRect(); const sd = document.querySelector('tr.saldo td.c0').getBoundingClientRect(); return { n: n.bottom <= r.bottom + 1 && n.top >= r.top, s: sd.bottom <= r.bottom + 1 && sd.top >= r.top }; });
  chk(`${w}px: Flujo neto y Saldo acumulado visibles con la tabla al inicio`, vis.n && vis.s, JSON.stringify(vis));
  // al hacer scroll de la página, la barra de contexto queda fija
  await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(100);
  const top = await p.evaluate(() => document.querySelector('.ctxbar').getBoundingClientRect().top);
  chk(`${w}px: la barra de contexto queda fija al desplazar la página`, top >= 0 && top < 140, `top=${Math.round(top)}`);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${OUT}/flujo-af-${w}.png` });
  await p.close();
}
// teclado (1440)
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', e => errs.push(`kb: ${e}`));
await p.goto(PAGINA + '#/finanzas/flujo/af'); await p.waitForTimeout(300);
await p.keyboard.press('Tab');
chk('Tab: primer foco = "Saltar a la tabla"', await p.evaluate(() => document.activeElement.id) === 'skipLink');
await p.keyboard.press('Enter'); await p.waitForTimeout(150);
chk('Saltar a la tabla lleva el foco a una celda', await p.evaluate(() => document.activeElement.matches('td.cell')));
await p.keyboard.press('PageDown');
const l1 = await p.evaluate(() => document.activeElement.getAttribute('aria-label'));
chk('AvPág baja 10 filas', !!l1, l1);
await p.keyboard.press('Enter'); await p.waitForTimeout(150);
chk('Enter abre el detalle', await p.evaluate(() => document.getElementById('drawer').dataset.open) === 'true');
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
chk('Esc cierra y devuelve el foco a la misma celda', await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === l1);
await p.keyboard.press(']'); await p.waitForTimeout(250);
chk('"]" pasa a la empresa siguiente', await p.evaluate(() => location.hash) === '#/finanzas/flujo/as');
await p.keyboard.press('s'); await p.waitForTimeout(250);
chk('"s" cambia a vista semanal', (await p.locator('thead th.wk').count()) > 20);
await p.keyboard.press('m'); await p.waitForTimeout(250);
await p.locator('th.mes').nth(4).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
chk('Enter sobre un mes abre sus semanas', (await p.locator('thead th.wk').count()) === 4);
await p.keyboard.press('?'); await p.waitForTimeout(100);
chk('"?" abre la ayuda de atajos', await p.evaluate(() => document.getElementById('help').dataset.open) === 'true');
await p.keyboard.press('Escape');
await p.keyboard.press('/');
chk('"/" va a Buscar línea', await p.evaluate(() => document.activeElement.id) === 'q');
await p.keyboard.type('m'); await p.waitForTimeout(300);
chk('escribir "m" en el buscador no cambia la vista', (await p.locator('thead th.wk').count()) === 4);
console.log(`\n${ok} correctas, ${fallos} fallas · errores de consola: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
await b.close();
