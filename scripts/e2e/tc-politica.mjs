/* ─────────────────────────────────────────────────────────────────────────
   POLÍTICA DE TC maestro_tc_v1 — navegador, Supabase falso, datos ficticios.

   1. Saldos Bancos muestra el TC que se aplicará (maestro_tc a la fecha del saldo,
      ≤ 5 días hábiles) con par, fecha y fuente; PEN solo manual.
   2. Guardar un saldo CLP lo estampa con usd, tc, par, fecha, fuente y política.
      Los demás saldos (históricos) NO se reescriben.
   3. Los históricos se ven como "TC histórico"; el EUR con usd 0 sigue sin paridad.
   4. Dashboard, Flujo, Reporte y Excel usan la MISMA cifra.
   5. Si maestro_tc no se puede leer, el saldo nuevo queda sin paridad (nunca 0).
   Uso:  APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/tc node scripts/e2e/tc-politica.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { juegoDeDatos } from './datos-comparacion.mjs';
import { leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

async function sesion(store, { tcCae = false } = {}) {
  const { browser, ctx, page } = await abrirApp(store, { ctxOpts: { timezoneId: 'America/Santiago' } });
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.route(/\/api\/send-email|emailjs/, r => r.fulfill({ status: 200, body: '{}' }));
  if (tcCae) await ctx.route(/calendario_data\?id=eq\.maestro_tc/, r => r.fulfill({ status: 503, body: 'caido' }));
  page.on('dialog', d => d.accept().catch(() => {}));
  await login(page); await entrarFinanzas(page);
  return { browser, page };
}
async function cargarSaldo(page, emp, banco, mon, monto, fecha) {
  await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(1500);
  await page.locator('input[type=date]').first().fill(fecha); await page.waitForTimeout(300);
  const fila = page.locator(`#saldos-emp-${emp.replace(/\s/g, '-')} tr`).filter({ hasText: banco }).filter({ hasText: mon });
  const inp = fila.locator('input').first();
  await inp.click(); await inp.fill(String(monto)); await inp.press('Tab'); await page.waitForTimeout(500);
  return fila;
}

// ── 1-4 ──
const store = juegoDeDatos();
const historicosAntes = JSON.stringify(Object.fromEntries(Object.entries(leerFila(store, 'finanzas_bancos').saldos).filter(([k]) => k !== 'Allegria Foods||BICE||clp')));
let { browser, page } = await sesion(store);
await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(1500);
await page.locator('input[type=date]').first().fill('2026-09-15'); await page.waitForTimeout(400);
let txt = await page.locator('body').innerText();
check('tile CLP: TC 925,4 USD-CLP del 2026-09-15 · mindicador', /925,4[\s\S]{0,80}USD-CLP del 2026-09-15 · mindicador/.test(txt));
check('tile EUR: 1,085 EUR-USD · frankfurter', /1,085[\s\S]{0,80}EUR-USD del 2026-09-15 · frankfurter/.test(txt));
check('tile PEN: 3,75 USD-PEN del 2026-09-14 · manual (1 d.h. antes)', /3,75[\s\S]{0,80}USD-PEN del 2026-09-14 · manual · 1 d\.h\. antes/.test(txt));
check('histórico rotulado "TC histórico"', /TC histórico \(fuente y fecha no registradas\)/.test(txt));
await page.locator('input[type=date]').first().fill('2026-10-01'); await page.waitForTimeout(400);
txt = await page.locator('body').innerText();
check('al 2026-10-01 el EUR-USD del 09-15 está fuera de 5 días hábiles → sin cotización', /sin cotización[\s\S]{0,120}EUR-USD más reciente del 2026-09-15 \(12 días hábiles antes; máximo 5\)/.test(txt));

const fila = await cargarSaldo(page, 'Allegria Foods', 'BICE', 'CLP', 96000000, '2026-09-15');   // antes 95.000.000 guardado sin TC
check('vista previa antes de guardar: "al guardar: TC 925,4 USD-CLP al 2026-09-15"', /al guardar: TC 925,4 USD-CLP al 2026-09-15 · mindicador/.test(await fila.innerText()));
await page.getByRole('button', { name: /Guardar cambios/ }).click(); await page.waitForTimeout(2500);
const sb = leerFila(store, 'finanzas_bancos').saldos;
const nuevo = sb['Allegria Foods||BICE||clp'];
check('guardado con política: usd 103.738,92 (96.000.000 / 925,40), par, fecha y fuente', nuevo?.tcPolitica === 'maestro_tc_v1' && nuevo.usd === 103738.92 && nuevo.tcPar === 'USD-CLP' && nuevo.tcFecha === '2026-09-15' && nuevo.tcFuente === 'mindicador', JSON.stringify(nuevo));
{ const antes = JSON.parse(historicosAntes); const dif = Object.keys({ ...antes, ...sb }).filter(k => k !== 'Allegria Foods||BICE||clp' && JSON.stringify(antes[k]) !== JSON.stringify(sb[k]));
  check('los saldos históricos NO se reescribieron (pasar por un campo sin escribir no lo marca)', dif.length === 0, dif.map(k => `${k}: ${JSON.stringify(antes[k])} → ${JSON.stringify(sb[k])}`).join(' | ')); }

await page.getByRole('button', { name: /Dashboard/ }).first().click(); await page.waitForTimeout(1500);
txt = await page.locator('body').innerText();
// 17.433 + 103.738,92 + 52.083,33 = 173.255,25 ; EUR Mediterra sin paridad
check('Dashboard bancos Chile = 17.433 + 103.738,92 + 52.083,33 = 173.255 (INCOMPLETO por el EUR)', /SALDO BANCOS CHILE[^\n]*INCOMPLETO\n\$173,255/i.test(txt), (txt.match(/SALDO BANCOS CHILE[^\n]*\n[^\n]*/i) || [''])[0]);
await irAFlujoEmpresas(page); await elegirEmpresa(page, 'Allegria Foods');
const det = page.locator('[data-detalle="saldo-bancos"]').first();
await det.locator('summary').click(); await page.waitForTimeout(300);
const tdet = await det.innerText();
check('Flujo: detalle del saldo inicial = 17.433 + 103.738,92 = US$ 121.172 con TC, par, fecha y fuente', /US\$ 121\.172/.test(tdet) && /TC 925,4 USD-CLP al 2026-09-15 · mindicador/.test(tdet), tdet.replace(/\n/g, ' ').slice(0, 200));
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
const xlsx = path.join(OUT, 'allegria-foods.xlsx'); await dl.saveAs(xlsx);
const xml = execFileSync('unzip', ['-p', xlsx, 'xl/*'], { maxBuffer: 1 << 28 }).toString();
check('Excel: nota con la conversión (TC, par, fecha, fuente)', /BICE CLP 96\.000\.000 al 2026-09-15 → US\$ 103\.738,92 · TC 925,4 USD-CLP al 2026-09-15 · mindicador/.test(xml));
await page.getByRole('button', { name: /📅 Reporte Semanal/ }).first().click(); await page.waitForTimeout(3000);
txt = await page.locator('body').innerText();
// Reporte aplica % de participación: 121.171,92 × 100% + 52.083,33 × 80% = 162.838,58
check('Reporte: saldo grupo = 121.171,92 + 52.083,33 × 80% = 162.839 (sin TC fijo 950)', /SALDO BANCOS GRUPO[^\n]*\nUSD 162\.839/i.test(txt), (txt.match(/SALDO BANCOS GRUPO[^\n]*\n[^\n]*/i) || [''])[0]);
await page.screenshot({ path: path.join(OUT, 'reporte.png') });
await browser.close();

// ── 5. maestro_tc no disponible ──
const store2 = juegoDeDatos();
({ browser, page } = await sesion(store2, { tcCae: true }));
await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(1500);
check('aviso: maestro_tc no se pudo leer', /No se pudo leer maestro_tc/.test(await page.locator('body').innerText()));
await cargarSaldo(page, 'Allegria Foods', 'BICE', 'CLP', 96000000, '2026-09-15');
await page.getByRole('button', { name: /Guardar cambios/ }).click(); await page.waitForTimeout(2500);
const r2 = leerFila(store2, 'finanzas_bancos').saldos['Allegria Foods||BICE||clp'];
check('sin maestro_tc: se guarda usd null + motivo (no 0 ni TC fijo)', r2?.usd === null && r2?.tcEstado === 'sin_tc' && /maestro_tc no disponible/.test(r2?.tcMotivo || ''), JSON.stringify(r2));
await browser.close();

console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);
