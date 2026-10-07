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
  // Sin red a cdnjs: E2E_JSPDF_DIR apunta a una copia local de jspdf 2.5.1 y autotable 3.8.2
  // (las mismas versiones que pide la app) solo para esta prueba.
  if (process.env.E2E_JSPDF_DIR) {
    const D = process.env.E2E_JSPDF_DIR;
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js/, r => r.fulfill({ path: path.join(D, 'jspdf/package/dist/jspdf.umd.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf-autotable\/3\.8\.2\/jspdf\.plugin\.autotable\.min\.js/, r => r.fulfill({ path: path.join(D, 'autotable/package/dist/jspdf.plugin.autotable.min.js'), contentType: 'application/javascript' }));
  }
  const RE_TC = /calendario_data\?id=eq\.maestro_tc/;
  if (tcCae) await ctx.route(RE_TC, r => r.fulfill({ status: 503, body: 'caido' }));
  page.on('dialog', d => d.accept().catch(() => {}));
  await login(page); await entrarFinanzas(page);
  return { browser, ctx, page, RE_TC };
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
check('tile PEN: 3,75 USD-PEN del 2026-09-14 · manual · antigüedad 1 día hábil (1 corrido)', /3,75[\s\S]{0,80}USD-PEN del 2026-09-14 · manual · 1 día hábil \(1 corrido\) antes del saldo/.test(txt));
check('regla visible: día hábil = lunes a viernes, feriados no se descuentan', /día hábil = lunes a viernes, los feriados no se descuentan/.test(txt));
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
// PDF del Reporte: trazabilidad de la conversión (nuevo con TC/fecha/fuente; histórico rotulado)
const [dlPdf] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /Generar PDF/ }).first().click()]);
const pdf = path.join(OUT, 'reporte.pdf'); await dlPdf.saveAs(pdf);
const pdfTxt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString().replace(/\s+/g, ' ');
check('PDF: saldo nuevo con TC, par, fecha y fuente', /TC 925,4 USD-CLP al 2026-09-15 · mindicador/.test(pdfTxt));
check('PDF: saldo histórico rotulado "TC histórico"', /TC histórico/.test(pdfTxt));
check('PDF: separa compromisos con fecha y mensual sin desglose', /con fecha .* mensual sin desglose/.test(pdfTxt));

// Cotización manual corregida DESPUÉS de confirmar el saldo: el saldo no cambia, se avisa
store.maestro_tc.value['USD-CLP'] = [{ fecha: '2026-09-15', valor: 930, fuente: 'manual' }, ...store.maestro_tc.value['USD-CLP'].filter(x => x.fecha !== '2026-09-15')];
store.maestro_tc.updated_at = new Date().toISOString();
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
await entrarFinanzas(page).catch(() => {});
await page.getByRole('button', { name: /Dashboard/ }).first().click(); await page.waitForTimeout(1500);
check('cotización modificada: el Dashboard conserva 173.255 (no se recalcula en silencio)', /SALDO BANCOS CHILE[^\n]*\n\$173,255/i.test(await page.locator('body').innerText()));
await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(2000);
const avisoMod = await page.locator('[data-aviso="tc-modificada"]').allInnerTexts();
check('Saldos Bancos avisa: maestro_tc cambió (930 hoy, conserva 925,4)', avisoMod.some(t => /maestro_tc cambió: hoy TC 930 USD-CLP al 2026-09-15 \(manual\).*conserva TC 925,4/.test(t)), avisoMod.join(' | '));
check('el registro guardado sigue con TC 925,4', leerFila(store, 'finanzas_bancos').saldos['Allegria Foods||BICE||clp'].tc === 925.4);
await browser.close();

// ── 5. maestro_tc no se puede LEER (falla de carga ≠ falta de cotización) ──
const store2 = juegoDeDatos();
const antes2 = JSON.stringify(leerFila(store2, 'finanzas_bancos').saldos['Allegria Foods||BICE||clp']);
let ctx2; ({ browser, ctx: ctx2, page } = await sesion(store2, { tcCae: true }));
await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(1500);
check('aviso: falla de carga, no falta de cotización', /falla de carga/.test(await page.locator('body').innerText()));
await cargarSaldo(page, 'Allegria Foods', 'BICE', 'CLP', 96000000, '2026-09-15');
await page.getByRole('button', { name: /Guardar cambios/ }).click(); await page.waitForTimeout(2000);
check('con maestro_tc caído NO se guarda la cuenta CLP: el saldo confirmado queda igual', JSON.stringify(leerFila(store2, 'finanzas_bancos').saldos['Allegria Foods||BICE||clp']) === antes2);
check('aviso: no se guardó y ofrece reintentar', /No se guardaron 1 cuenta/.test(await page.locator('[data-aviso="tc-carga"]').innerText()));
await ctx2.unroute(/calendario_data\?id=eq\.maestro_tc/);
await page.getByRole('button', { name: /Reintentar carga de maestro_tc/ }).click(); await page.waitForTimeout(1500);
check('tras reintentar desaparece el aviso de carga', (await page.locator('[data-aviso="tc-carga"]').count()) === 0);
await page.getByRole('button', { name: /Guardar cambios/ }).click(); await page.waitForTimeout(2500);
const r2 = leerFila(store2, 'finanzas_bancos').saldos['Allegria Foods||BICE||clp'];
check('tras reintentar se guarda con la política (usd 103.738,92)', r2?.usd === 103738.92 && r2?.tcPolitica === 'maestro_tc_v1', JSON.stringify(r2));
await browser.close();

// ── 6. sin cotización REAL (dato ausente): pide confirmación antes de dejarla sin paridad ──
const store3 = juegoDeDatos();
store3.maestro_tc.value['USD-PEN'] = [];
const antes3 = JSON.stringify(leerFila(store3, 'finanzas_bancos').saldos['Allpa Farms Perú||Scotiabank Perú||pen'] ?? null);
({ browser, page } = await sesion(store3));
page.removeAllListeners('dialog'); let dialogos = 0;
page.on('dialog', d => { dialogos++; d.dismiss().catch(() => {}); });   // el usuario CANCELA
await cargarSaldo(page, 'Allpa Farms Perú', 'Scotiabank Perú', 'PEN', 400000, '2026-09-15');
await page.getByRole('button', { name: /Guardar cambios/ }).click(); await page.waitForTimeout(2000);
check('sin cotización: pide confirmación y, si se cancela, no guarda', dialogos === 1 && JSON.stringify(leerFila(store3, 'finanzas_bancos').saldos['Allpa Farms Perú||Scotiabank Perú||pen'] ?? null) === antes3);
await browser.close();

console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);
