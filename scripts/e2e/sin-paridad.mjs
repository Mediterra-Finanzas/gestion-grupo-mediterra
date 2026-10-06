/* ─────────────────────────────────────────────────────────────────────────
   CUENTAS SIN PARIDAD — navegador, Supabase falso.

   Siembra dos cuentas no-USD sin conversión guardada (CLP con usd null, EUR con
   usd 0) y comprueba que:
   · cada pantalla que consume el saldo lo marca INCOMPLETO y nombra la cuenta
     (Dashboard, Flujo Empresas, Consolidado, Saldos Bancos, Reporte Semanal);
   · el Excel individual lleva la nota;
   · las CIFRAS no cambian (se guardan en cifras.json para comparar con un build
     anterior: no se cambió la política de TC).
   Uso:  APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/sp node scripts/e2e/sin-paridad.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { nuevoStore, FECHA_SALDO } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

const store = nuevoStore();
const saldos = store.finanzas_bancos.value.saldos;
saldos['Allegria Foods||BICE||clp'] = { monto: 95000000, fecha: FECHA_SALDO, moneda: 'clp', usd: null };
saldos['Mediterra||Santander||eur'] = { monto: 50000, fecha: FECHA_SALDO, moneda: 'eur', usd: 0 };

const { browser, ctx, page } = await abrirApp(store);
await ctx.route(/open\.er-api\.com/, r => r.abort());   // sin red: Saldos Bancos usa el US$ guardado
await ctx.route(/\/api\/send-email|emailjs/, r => r.fulfill({ status: 200, body: '{}' }));
page.on('dialog', d => d.accept().catch(() => {}));
await login(page);
await entrarFinanzas(page);
const cifras = {};
const kpi = async (re) => { const t = await page.locator('body').innerText(); const m = t.split('\n').map(x => x.trim()); const i = m.findIndex(x => re.test(x)); return i >= 0 ? m[i + 1] : null; };
const kpiLabel = async (re) => { const t = await page.locator('body').innerText(); return t.split('\n').map(x => x.trim()).find(x => re.test(x)) || ''; };

// Dashboard
await page.getByRole('button', { name: /Dashboard/ }).first().click(); await page.waitForTimeout(1200);
let txt = await page.locator('body').innerText();
check('Dashboard: KPI bancos Chile marcado INCOMPLETO', /saldo bancos chile.*incompleto/i.test(txt));
check('Dashboard: saldo inicial consolidado marcado INCOMPLETO', /saldo inicial consolidado.*incompleto/i.test(txt));
check('Dashboard: aviso nombra BICE CLP y Santander EUR', /BICE · CLP 95\.000\.000/.test(txt) && /Santander · EUR 50\.000/.test(txt));
cifras.dashChile = await kpi(/saldo bancos chile/i); cifras.dashIni = await kpi(/saldo inicial consolidado/i);
await page.screenshot({ path: path.join(OUT, 'dashboard.png') });

// Flujo Empresas: Allegria Foods
await irAFlujoEmpresas(page); await elegirEmpresa(page, 'Allegria Foods');
txt = await page.locator('body').innerText();
check('Flujo Allegria Foods: aviso de saldo inicial incompleto', /saldo inicial de allegria foods incompleto/i.test(txt) && /BICE · CLP 95\.000\.000/.test(txt));
await page.screenshot({ path: path.join(OUT, 'flujo-allegria.png') });
// Excel individual con la nota
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
const xlsx = path.join(OUT, 'allegria.xlsx'); await dl.saveAs(xlsx);
const ss = execFileSync('unzip', ['-p', xlsx, 'xl/*'], { maxBuffer: 1 << 28 }).toString();   // sharedStrings o inlineStr
check('Excel Allegria Foods: nota "Saldo bancario INCOMPLETO" con la cuenta', /Saldo bancario INCOMPLETO/.test(ss) && /BICE CLP 95\.000\.000/.test(ss));
// Una empresa sin cuentas sin paridad no lleva aviso
await elegirEmpresa(page, 'Osiris');
check('Flujo Osiris: sin aviso (no tiene cuentas sin paridad)', (await page.locator('[data-aviso="sin-paridad"]').count()) === 0);

// Consolidado
await page.getByRole('button', { name: /Consolidado/ }).first().click(); await page.waitForTimeout(1500);
txt = await page.locator('body').innerText();
check('Consolidado: saldo inicial marcado INCOMPLETO + aviso', /saldo inicial consolidado.*incompleto/i.test(txt) && /Santander · EUR 50\.000/.test(txt));
cifras.consIni = await kpi(/saldo inicial consolidado/i);

// Saldos Bancos
await page.getByRole('button', { name: /Saldos Bancos/ }).first().click(); await page.waitForTimeout(2000);
txt = await page.locator('body').innerText();
check('Saldos Bancos: total consolidado marcado INCOMPLETO', /INCOMPLETO: 2 cuentas sin paridad/.test(txt), (txt.match(/INCOMPLETO[^\n]*/) || [''])[0]);
check('Saldos Bancos: empresa marcada incompleta', /incompleto: 1 cuenta sin paridad/.test(txt));
check('Saldos Bancos: celda "⚠ sin paridad" en la cuenta', /⚠ sin paridad/.test(txt));
cifras.saldosConsolidado = (txt.match(/Saldo Consolidado[\s\S]*?\$([\d.,]+) USD/i) || [])[1] || null;
await page.screenshot({ path: path.join(OUT, 'saldos-bancos.png'), fullPage: true });

// Reporte Semanal: EUR omitida
await page.getByRole('button', { name: /📅 Reporte Semanal/ }).first().click(); await page.waitForTimeout(2500);
txt = await page.locator('body').innerText();
check('Reporte Semanal: saldo del grupo INCOMPLETO y EUR nombrada', /saldo bancos grupo · incompleto/i.test(txt) && /Santander EUR 50\.000/.test(txt));
cifras.reporteSaldo = await kpi(/saldo bancos grupo/i);

fs.writeFileSync(path.join(OUT, 'cifras.json'), JSON.stringify(cifras, null, 2));
console.log('cifras', JSON.stringify(cifras));
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);
