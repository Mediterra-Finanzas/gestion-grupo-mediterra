/* ─────────────────────────────────────────────────────────────────────────
   Prueba el MECANISMO de descarga de UF en la vista previa local:
   Frisku Foods → Maestros + TC → Tipo de Cambio → "Actualizar hoy".

   La respuesta de mindicador.cl se SIMULA aquí con su formato exacto (desde
   este entorno no hay salida a internet). Lo que se prueba es el camino:
   la app pide /api/uf/<dd-mm-aaaa> a mindicador, guarda el par UF-CLP con
   fuente "mindicador" SOLO en el Supabase simulado del navegador, y Créditos
   lo usa y lo muestra con valor, fecha y fuente. El VALOR real queda
   pendiente de la prueba en vivo en el equipo de Angelo.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { cerrarAvisos, subTab } from './lib.mjs';

const URL0 = process.env.VP_URL || 'http://127.0.0.1:4180';
const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };

const hoy = new Date(); const dd = String(hoy.getDate()).padStart(2, '0'), mm = String(hoy.getMonth() + 1).padStart(2, '0'), yyyy = hoy.getFullYear();
const ISO = `${yyyy}-${mm}-${dd}`;
const VALOR = 40123.45;   // valor de PRUEBA (no es la UF real)
const pedidas = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
let aProduccion = 0;
await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', r => { aProduccion++; return r.abort(); });
await ctx.route('**mindicador.cl/**', r => {
  const u = r.request().url(); pedidas.push(u);
  const ind = /\/api\/([a-z]+)\//.exec(u)[1];
  const valor = { uf: VALOR, dolar: 955.5, euro: 1110.2 }[ind] || 1;
  return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ version: '1.7.0', autor: 'mindicador.cl', codigo: ind, nombre: ind, unidad_medida: 'Pesos', serie: [{ fecha: `${ISO}T03:00:00.000Z`, valor }] }) });
});
await ctx.route('**frankfurter.app/**', r => r.abort());
const page = await ctx.newPage();
const errores = []; page.on('pageerror', e => errores.push(String(e)));
page.on('dialog', d => d.accept().catch(() => {}));

await page.goto(URL0 + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.__VP_REINICIAR && 0);
const email = page.locator('input[type=email]');
await email.or(page.getByText('Frisku Foods').first()).first().waitFor({ timeout: 30000 });
if (await email.count()) { await email.fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill('482913'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); }
await cerrarAvisos(page);
const salir = page.getByRole('button', { name: /^Mediterra/ });   // miga de pan: volver al hub si la app recordó un módulo
if (!(await page.getByText('Frisku Foods').count())) { await salir.first().click().catch(() => {}); await page.waitForTimeout(1500); }
await page.getByText('Frisku Foods').first().click(); await page.waitForTimeout(3000); await cerrarAvisos(page);
await page.getByRole('button', { name: /Maestros/ }).first().click(); await page.waitForTimeout(1500);
await page.getByRole('button', { name: /Tipo de Cambio/ }).first().click(); await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Actualizar hoy/ }).first().click(); await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(OUT, 'uf01-maestros.png') });
check('La app pidió la UF de hoy a mindicador (/api/uf/dd-mm-aaaa)', pedidas.some(u => u.includes(`/api/uf/${dd}-${mm}-${yyyy}`)), pedidas.filter(u => /uf/.test(u)).join(' '));
const tc = await page.evaluate(() => { const v = window.__VP_STORE.maestro_tc.value; return typeof v === 'string' ? JSON.parse(v) : v; });
const e = (tc['UF-CLP'] || []).find(x => x.fecha === ISO);
check(`UF-CLP del ${ISO} guardada en el Supabase SIMULADO con fuente "mindicador"`, !!e && e.valor === VALOR && e.fuente === 'mindicador', JSON.stringify(e));
check('El valor manual de la semilla no se sobrescribe (USD-CLP manual conservado)', (tc['USD-CLP'] || []).some(x => x.fuente === 'manual' && x.valor === 955));
// Créditos: el panel de contraste muestra la UF nueva con fecha y fuente
await page.getByRole('button', { name: /←\s*Mediterra/ }).first().click(); await page.waitForTimeout(1500);   // botón "← Mediterra" del módulo Frisku
await page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await page.waitForTimeout(3500); await cerrarAvisos(page);
await subTab(page, /💳 Créditos/); await subTab(page, /Conciliación/); await page.waitForTimeout(1200);
const panel = await page.locator('table').filter({ hasText: 'UF (CLP)' }).first().innerText();
const [y, m, d] = ISO.split('-');
check('Panel "UF utilizada": la UF descargada aparece con su fecha y fuente mindicador', panel.includes('40,123.45') && panel.includes(`${d}/${m}/${y}`) && /mindicador/.test(panel), panel.replace(/\s+/g, ' ').slice(0, 200));
check('Sigue visible "pendiente de prueba en vivo"', /pendiente de prueba en vivo/i.test(await page.locator('body').innerText()));
await page.screenshot({ path: path.join(OUT, 'uf02-contraste.png') });
check('0 llamadas a producción', aProduccion === 0);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nMecanismo UF OK (valor de prueba; la verificación en vivo sigue pendiente)');
process.exit(fallos ? 1 : 0);
