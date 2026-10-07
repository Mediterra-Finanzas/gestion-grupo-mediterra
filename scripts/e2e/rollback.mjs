/* ─────────────────────────────────────────────────────────────────────────
   ROLLBACK: ¿la versión ANTERIOR interpreta bien lo que escribe la NUEVA?

   Mismo Supabase falso (en memoria) para las dos versiones:
     1. NUEVA: guarda un saldo CLP con la política maestro_tc_v1 (usd + metadatos de
        TC), un saldo sin paridad (usd null + tcEstado) y genera el PDF del Reporte
        (entrada de historial).
     2. ANTERIOR (build de main): abre esos datos. Sin errores de página; Dashboard y
        Saldos Bancos con las mismas cifras en US$; el historial se lista; al navegar
        no borra los metadatos de TC.
     3. NUEVA otra vez: lee lo que dejó la anterior (ida y vuelta).
   Uso:  APP_NUEVA=http://127.0.0.1:4192 APP_ANTERIOR=http://127.0.0.1:4193 OUT_DIR=/tmp/rb \
         E2E_JSPDF_DIR=/ruta/vendor-pdf node scripts/e2e/rollback.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { juegoDeDatos } from './datos-comparacion.mjs';
import { leerFila, instalarFake, PIN, EMAIL } from './fake.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

async function abrir(url, store, { entrar = true } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1150 }, acceptDownloads: true, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, store);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.route(/\/api\/send-email|emailjs/, r => r.fulfill({ status: 200, body: '{}' }));
  if (process.env.E2E_JSPDF_DIR) {
    const D = process.env.E2E_JSPDF_DIR;
    await ctx.route(/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js/, r => r.fulfill({ path: path.join(D, 'jspdf/package/dist/jspdf.umd.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jspdf-autotable\/3\.8\.2\/jspdf\.plugin\.autotable\.min\.js/, r => r.fulfill({ path: path.join(D, 'autotable/package/dist/jspdf.plugin.autotable.min.js'), contentType: 'application/javascript' }));
  }
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 200)));
  const dialogos = [];
  page.on('dialog', d => { dialogos.push(`${d.type()}: ${d.message().slice(0, 80)}`); (d.type() === 'prompt' ? d.accept('RESTAURAR') : d.accept()).catch(() => {}); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(EMAIL); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  if (entrar) { await page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await page.waitForTimeout(3500); }
  return { browser, page, errores, dialogos };
}
const tab = async (page, re) => { await page.getByRole('button', { name: re }).first().click(); await page.waitForTimeout(1800); };
const texto = (page) => page.locator('body').innerText();

const store = juegoDeDatos();
const K = 'Allegria Foods||BICE||clp';

// ── 1. NUEVA escribe ──
store.maestro_tc.value['USD-PEN'] = [];   // para que el PEN quede SIN PARIDAD (se confirma el diálogo)
let s;
s = await abrir(process.env.APP_NUEVA, store);
await tab(s.page, /Saldos Bancos/);
await s.page.locator('input[type=date]').first().fill('2026-09-15');
const f1 = s.page.locator('#saldos-emp-Allegria-Foods tr').filter({ hasText: 'BICE' }).filter({ hasText: 'CLP' });
await f1.locator('input').first().click(); await f1.locator('input').first().fill('96000000'); await f1.locator('input').first().press('Tab');
const f2 = s.page.locator('#saldos-emp-Allpa-Farms-Perú tr').filter({ hasText: 'Scotiabank Perú' }).filter({ hasText: 'PEN' });
await f2.locator('input').first().click(); await f2.locator('input').first().fill('400000'); await f2.locator('input').first().press('Tab');
await s.page.getByRole('button', { name: /Guardar cambios/ }).click(); await s.page.waitForTimeout(2500);
const nuevo = leerFila(store, 'finanzas_bancos').saldos[K];
const sinTC = leerFila(store, 'finanzas_bancos').saldos['Allpa Farms Perú||Scotiabank Perú||pen'];
check('NUEVA: saldo con política y metadatos de TC', nuevo?.tcPolitica === 'maestro_tc_v1' && nuevo.usd === 103738.92);
check('NUEVA: saldo sin paridad (usd null + tcEstado)', sinTC?.usd === null && sinTC?.tcEstado === 'sin_tc', JSON.stringify(sinTC));
if (process.env.E2E_JSPDF_DIR) {
  await tab(s.page, /📅 Reporte Semanal/); await s.page.waitForTimeout(1500);
  const [dl] = await Promise.all([s.page.waitForEvent('download', { timeout: 120000 }), s.page.getByRole('button', { name: /Generar PDF/ }).first().click()]);
  await dl.saveAs(path.join(OUT, 'reporte-nueva.pdf')); await s.page.waitForTimeout(2000);
}
check('NUEVA: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();
const antesAnterior = JSON.stringify(leerFila(store, 'finanzas_bancos'));
const histN = (leerFila(store, 'finanzas')?.historial_reportes || leerFila(store, 'reporte_historial') || []).length;

// ── 2. ANTERIOR lee ──
s = await abrir(process.env.APP_ANTERIOR, store);
await tab(s.page, /Dashboard/);
let t = await texto(s.page);
// La versión anterior lee rec.usd: 17.433 + 103.738,92 + 52.083,33 (+0 del PEN sin paridad) = 173.255
check('ANTERIOR: Dashboard bancos Chile = 173.255 (lee el US$ guardado por la nueva)', /SALDO BANCOS? CHILE[^\n]*\n\$173,255/i.test(t), (t.match(/SALDO BANCOS? CHILE[^\n]*\n[^\n]*/i) || [''])[0].replace(/\n/g, ' '));
check('ANTERIOR: Allpa Perú = 101.333 (el PEN sin paridad suma 0, como antes)', /(ALLPA PERÚ \(100%\)|SALDO BANCO PERÚ)[^\n]*\n\$101,333/i.test(t), (t.match(/(ALLPA|BANCO) PERÚ[^\n]*\n[^\n]*/i) || [''])[0].replace(/\n/g, ' '));
await tab(s.page, /Saldos Bancos/);
t = await texto(s.page);
check('ANTERIOR: Saldos Bancos abre y muestra el saldo CLP', /95|96\.000\.000/.test(t) && /BICE/.test(t));
await tab(s.page, /Flujo Empresas/);
await tab(s.page, /📅 Reporte Semanal/);
check('ANTERIOR: Reporte Semanal abre', /Reporte Semanal de Flujo de Caja/.test(await texto(s.page)));
check('ANTERIOR: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.page.waitForTimeout(3000);
await s.browser.close();
const despuesAnterior = leerFila(store, 'finanzas_bancos');
check('ANTERIOR: al navegar no borró ni reescribió los saldos (metadatos de TC intactos)', JSON.stringify(despuesAnterior) === antesAnterior);

// ── 2b. Respaldo de la NUEVA restaurado con la ANTERIOR: debe RECHAZARSE ──
s = await abrir(process.env.APP_NUEVA, store, { entrar: false });
const [dlR] = await Promise.all([s.page.waitForEvent('download'), s.page.getByRole('button', { name: /💾 Respaldo/ }).click()]);
const archivoR = path.join(OUT, 'respaldo-nueva.json'); await dlR.saveAs(archivoR);
await s.browser.close();
// La foto se toma DESPUÉS de entrar: el login de la versión anterior escribe por su cuenta
// (audit_log, reescritura de usuarios/main). Lo que se mide es solo el intento de restaurar.
// audit_log se excluye: registrar el intento rechazado no es restaurar.
const foto = () => Object.fromEntries(Object.entries(store).filter(([k]) => k !== 'audit_log').map(([k, v]) => [k, JSON.stringify(v.value)]));
s = await abrir(process.env.APP_ANTERIOR, store, { entrar: false });
await s.page.waitForTimeout(2000);
const filasAntes = foto();
const [fc] = await Promise.all([s.page.waitForEvent('filechooser'), s.page.getByRole('button', { name: /📤 Restaurar/ }).click()]);
await fc.setFiles(archivoR); await s.page.waitForTimeout(2500);
check('ANTERIOR rechaza el respaldo nuevo (saneado): "Archivo inválido"', s.dialogos.some(d => /Archivo inválido/.test(d)), s.dialogos.join(' | '));
const filasDespues = foto();
const cambiadas = [...new Set([...Object.keys(filasAntes), ...Object.keys(filasDespues)])].filter(k => filasAntes[k] !== filasDespues[k]);
check('ANTERIOR no escribió ninguna fila al intentar restaurar', cambiadas.length === 0, cambiadas.join(', '));
await s.browser.close();

// ── 3. NUEVA otra vez ──
s = await abrir(process.env.APP_NUEVA, store);
await tab(s.page, /Dashboard/);
check('NUEVA tras volver: Dashboard 173.255 INCOMPLETO', /SALDO BANCOS CHILE[^\n]*INCOMPLETO\n\$173,255/i.test(await texto(s.page)));
check('NUEVA tras volver: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);
