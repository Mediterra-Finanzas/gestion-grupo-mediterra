/* ─────────────────────────────────────────────────────────────────────────
   COMPARACIÓN ANTES / DESPUÉS con UN MISMO juego de datos (Supabase falso).

   No afirma nada: captura las cifras visibles para comparar dos builds.
   El navegador corre con la hora de Chile (como en producción).
   Uso:  APP_URL=http://127.0.0.1:4188 OUT_DIR=/tmp/antes node scripts/e2e/comparacion.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { juegoDeDatos } from './datos-comparacion.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, num } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });

const store = juegoDeDatos();
const { browser, ctx, page } = await abrirApp(store, { ctxOpts: { timezoneId: 'America/Santiago' } });
await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
await ctx.route(/\/api\/send-email|emailjs/, r => r.fulfill({ status: 200, body: '{}' }));
page.on('dialog', d => d.accept().catch(() => {}));
await login(page);
await entrarFinanzas(page);

const dinero = /^-?(USD\s*)?-?\$?\s?-?[\d.,]+( USD)?$/;
async function kpis() {
  const l = (await page.locator('body').innerText()).split('\n').map(x => x.trim()).filter(Boolean);
  const out = {};
  for (let i = 0; i < l.length - 1; i++) if (dinero.test(l[i + 1]) && !dinero.test(l[i]) && l[i].length < 120) out[l[i]] = l[i + 1];
  return out;
}
const r = {};
await page.getByRole('button', { name: /Dashboard/ }).first().click(); await page.waitForTimeout(1500);
r.dashboard = await kpis();

await irAFlujoEmpresas(page); await elegirEmpresa(page, 'Mediterra');
{
  const tabla = page.locator('table').first();
  const filas = await tabla.locator('tr').all();
  const enc = (await filas[1].locator('th,td').allInnerTexts()).map(t => t.trim());
  const meses = ['Jun-26', 'Nov-26', 'Dec-26', 'Jan-27', 'Feb-27', 'May-27', 'Jun-27'];
  r.flujoMediterra = {};
  for (const f of filas.slice(2)) {
    const c = await f.locator('th,td').allInnerTexts();
    const et = (c[0] || '').replace(/\n/g, ' ').replace(/▶|▼|✏️ edita.*/g, '').trim();
    if (!/Pago Préstamos - Total|FLUJO NETO|SALDO ACUM/.test(et)) continue;
    r.flujoMediterra[et] = Object.fromEntries(meses.map(m => { const b = (c[enc.indexOf(m)] || '').split('\n')[0].trim(); return [m, b === '—' || !b ? null : num(b)]; }));
  }
}
await page.getByRole('button', { name: /Consolidado/ }).first().click(); await page.waitForTimeout(1500);
r.consolidado = await kpis();
await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(2000);
{ const t = await page.locator('body').innerText(); r.saldosBancos = { consolidado: (t.match(/Saldo Consolidado[\s\S]*?\$([\d.,]+) USD/i) || [])[1] || null, grupo: (t.match(/Total Grupo[\s\S]*?\$([\d.,]+) USD/i) || [])[1] || null }; }
await page.getByRole('button', { name: /Créditos/ }).first().click(); await page.waitForTimeout(1500);
r.creditos = await kpis();
await page.getByRole('button', { name: /📅 Reporte Semanal/ }).first().click(); await page.waitForTimeout(3000);
r.reporte = await kpis();
fs.writeFileSync(path.join(OUT, 'cifras.json'), JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));
await browser.close();
