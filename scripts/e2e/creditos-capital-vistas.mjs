/* ─────────────────────────────────────────────────────────────────────────
   E2E — Créditos: capital «No determinable», agregados parciales y formato chileno.
   App real, Supabase falso, datos FICTICIOS (src/reporteCreditos.datosPrueba.js + un
   crédito Z cerrado para el cero real). Solo las vistas y exportaciones afectadas.

     CI=true npx react-scripts build; (cd build && python3 -m http.server 4280 --bind 127.0.0.1 &)
     APP_URL=http://127.0.0.1:4280 OUT_DIR=/tmp/cap node scripts/e2e/creditos-capital-vistas.mjs

   Casos: cero real (crédito Z cerrado; empresas saldadas a futuro), capital desconocido
   (acreedor Privado Particular: todo sin desglose o por conciliar) y cartera mixta (Osiris,
   Mediterra, total del grupo). Vistas: Créditos (KPI, deuda por empresa, saldo por cierre),
   detalle del crédito, Análisis CFO (KPI, por moneda, concentración), Conciliación con el
   acreedor, Saldo por Mes (pantalla + Excel). Formato: ningún número en formato en-US.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, nuevoStore, PIN, EMAIL } from './fake.mjs';
import { CREDITOS_PRUEBA, TC_PRUEBA, CREDITO_CERRADO_PRUEBA } from '../../src/reporteCreditos.datosPrueba.js';

const require = createRequire('/home/user/gestion-grupo-mediterra/package.json');
const XLSXns = require('xlsx-js-style'); const XLSX = XLSXns.utils ? XLSXns : (XLSXns.default || XLSXns);
const BASE = process.env.APP_URL || 'http://127.0.0.1:4280';
const OUT = process.env.OUT_DIR || '/tmp/cap'; fs.mkdirSync(OUT, { recursive: true });
const ND = 'No determinable: sin desglose';
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
// Formato en-US visible: «1,234.56», «$1,234» (sin US$ delante).
const EN_US = /\b\d{1,3}(,\d{3})+\.\d{2}\b|(^|[^S])\$\d/m;

// Z: cerrado de verdad (todas sus cuotas pagadas con registro) → capital 0 calculado y confirmado.
const Z = CREDITO_CERRADO_PRUEBA;
// Y: registro antiguo SIN desglose en Frisku (USD). Con D (PEN sin TC) deja a Frisku con capital
// desconocido a nivel de empresa: así se prueba también el Excel de Saldo por Mes.
const Y = { uid: 'Y', n: 51, empresa: 'Frisku Foods', acreedor: 'Privado Frisku Demo', tipo_inst: 'Privado', monto: 10000, cuota: 10000,
  f_venc: '2027-03-31', tipo_cr: 'Inversión', pagado: false, control_desde: '' };
const st = nuevoStore();
st.finanzas.value.creditos_data = JSON.parse(JSON.stringify([...CREDITOS_PRUEBA, Z, Y]));
st.maestro_tc = { updated_at: new Date(Date.now() - 30000).toISOString(), value: TC_PRUEBA };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1050 }, acceptDownloads: true, timezoneId: 'America/Santiago' });
await instalarFake(ctx, st);
await ctx.route(/vercel\.app|open\.er-api\.com|mindicador\.cl|frankfurter\.app|emailjs/, r => r.abort());
await ctx.routeWebSocket(/realtime\/v1\/websocket/, () => {});
const p = await ctx.newPage();
const errores = []; p.on('pageerror', e => errores.push(String(e).slice(0, 200)));
p.on('dialog', d => d.dismiss().catch(() => {}));
await p.goto(BASE);
await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PIN); await p.keyboard.press('Enter');
await p.waitForTimeout(2500);
const cerrar = async () => { for (const t of ['Entendido', 'Aceptar']) { const b = p.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); } };
await cerrar();
await p.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await p.waitForTimeout(3000); await cerrar();
await p.getByRole('button', { name: /💳 Créditos/ }).first().click(); await p.waitForTimeout(1500);
const est = (id) => p.getByTestId(id).first().getAttribute('data-estado-capital');
const txt = (id) => p.getByTestId(id).first().innerText();
const sinEnUS = async (nombre, loc) => { const t = await loc.innerText(); const m = t.match(EN_US); check(`${nombre} · sin números en formato en-US`, !m, m ? `«${m[0]}»` : ''); };

// ── 1. Créditos ──
await p.screenshot({ path: `${OUT}/01-creditos.png`, fullPage: true });
const kpi = await txt('cap-creditos-kpi');
check('Créditos · KPI del grupo (mixto): capital conocido «parcial» + sin desglose, por conciliar y sin TC aparte', await est('cap-creditos-kpi') === 'parcial'
  && /US\$ [\d.]+ \(parcial\)/.test(kpi) && /sin desglose US\$ 569\.178 · no sumado/.test(kpi) && /por conciliar US\$ 43\.828 · no sumado/.test(kpi) && /sin TC PEN 300\.000,00 · no sumado/.test(kpi), kpi.replace(/\s+/g, ' '));
check('Créditos · deuda por empresa: Osiris mixto (parcial)', await est('cap-deuda-Osiris') === 'parcial');
check('Créditos · deuda por empresa: Allegria Service determinado, sin «parcial»', await est('cap-deuda-Allegria Service') === 'determinado' && !/parcial/.test(await txt('cap-deuda-Allegria Service')));
check('Créditos · deuda por empresa: Frisku (capital desconocido) → «No determinable», con sin desglose y sin TC aparte', await est('cap-deuda-Frisku Foods') === 'no_determinable'
  && (await txt('cap-deuda-Frisku Foods')).includes(ND) && /sin TC PEN 300\.000,00/.test(await txt('cap-deuda-Frisku Foods')) && /sin desglose US\$ 10\.000/.test(await txt('cap-deuda-Frisku Foods')));
const tablaCierre = p.locator('table').filter({ hasText: 'TOTAL GRUPO' }).first();
const filaServ = await tablaCierre.locator('tr', { hasText: 'Allegria Service' }).first().innerText();
check('Créditos · saldo por cierre: cero real a futuro sigue como «✓ Saldado»', /✓ Saldado/.test(filaServ), filaServ.replace(/\s+/g, ' ').slice(0, 160));
const filaFr = await tablaCierre.locator('tr', { hasText: 'Frisku Foods' }).first().innerText();
check('Créditos · saldo por cierre: Frisku en Jun-27 NO dice «Saldado» (queda PEN 300.000 sin TC, vence 01-07-2027)', /sin TC PEN 300\.000,00/.test(filaFr.split('\t')[2] || filaFr) && (filaFr.match(/✓ Saldado/g) || []).length === 5, filaFr.replace(/\s+/g, ' ').slice(0, 220));
const filaMed = await tablaCierre.locator('tr', { hasText: 'Mediterra' }).first().innerText();
check('Créditos · saldo por cierre: Mediterra hoy parcial con sin desglose aparte', /\(parcial\)/.test(filaMed) && /sin desglose US\$ 550\.000 · no sumado/.test(filaMed), filaMed.replace(/\s+/g, ' ').slice(0, 200));
await sinEnUS('Créditos', p.locator('body'));
// Detalle: capital desconocido (B3) y cero real (Z)
await p.locator('select').filter({ hasText: 'Vigentes' }).first().selectOption('Todos').catch(() => {}); await p.waitForTimeout(500);
const abrir = async (acreedor, monto) => { await p.locator('tr', { hasText: acreedor }).filter({ hasText: monto }).first().getByRole('button', { name: /📅/ }).click(); await p.waitForTimeout(800); };
const cerrarModal = async () => { await p.getByRole('button', { name: '×', exact: true }).first().click(); await p.waitForTimeout(400); };
await abrir('Privado Particular', 'US$ 550.000,00');   // B3: todo sin desglose
const detB3 = await txt('cap-detalle');
await p.screenshot({ path: `${OUT}/02-detalle-no-determinable.png` });
check('Detalle · crédito sin desglose (B3): «No determinable: sin desglose» en vez de 0', await est('cap-detalle') === 'no_determinable' && detB3.includes(ND) && /sin desglose US\$ 550\.000,00 · no sumado/.test(detB3), detB3.replace(/\s+/g, ' '));
await cerrarModal();
await abrir('Privado Particular', 'US$ 34.650,00');    // B4: todo por conciliar → 0 confirmado, rotulado
const detB4 = await txt('cap-detalle');
check('Detalle · crédito por conciliar (B4): 0 confirmado rotulado «parcial» + por conciliar aparte', await est('cap-detalle') === 'parcial' && /por conciliar US\$ 34\.650,00 · no sumado/.test(detB4), detB4.replace(/\s+/g, ' '));
await cerrarModal();
await abrir('Banco Cerrado Demo', 'US$ 50.000,00');
const detZ = await txt('cap-detalle');
check('Detalle · crédito cerrado: cero real «US$ 0,00», sin rótulos', await est('cap-detalle') === 'determinado' && detZ.trim() === 'US$ 0,00', detZ);
await cerrarModal();

// ── 2. Análisis CFO ──
await p.getByRole('button', { name: /Análisis CFO/ }).click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/03-analisis.png`, fullPage: true });
check('Análisis · KPI mixto: parcial y los tres importes aparte', await est('cap-analisis-kpi') === 'parcial' && /sin TC PEN 300\.000,00/.test(await txt('cap-analisis-kpi')));
check('Análisis · total de concentración: parcial, con por conciliar y sin TC listados aparte', await est('cap-analisis-total') === 'parcial');
await p.getByRole('button', { name: 'Acreedor', exact: true }).click(); await p.waitForTimeout(400);
const tablaConc = p.locator('table').filter({ hasText: 'Saldo capital identificado' }).first();
const filaPriv = await tablaConc.locator('tr', { hasText: 'Privado Particular' }).first().innerText();
check('Análisis · por acreedor: Privado Particular (capital desconocido) → «No determinable»', filaPriv.includes(ND), filaPriv.replace(/\s+/g, ' '));
const filaBD = await tablaConc.locator('tr', { hasText: 'Banco Bullet Demo' }).first().innerText();
check('Análisis · por acreedor: Banco Bullet Demo determinado (número, sin «parcial»)', /US\$ 250\.000/.test(filaBD) && !/parcial/.test(filaBD));
const tMon = await p.locator('table').filter({ hasText: 'TC usado' }).first().innerText();
check('Análisis · por moneda: UF con rótulo chileno y PEN sin TC aparte', /0,023796567 UF por 1 US\$/.test(tMon) && /sin TC PEN 300\.000,00/.test(tMon));
await sinEnUS('Análisis CFO', p.locator('body'));

// ── 3. Conciliación con el acreedor ──
await p.getByRole('button', { name: /Conciliación/ }).first().click(); await p.waitForTimeout(1200);
const tAcr = p.locator('table').filter({ hasText: 'Capital informado' }).first();
if (await tAcr.count()) {
  const f = await tAcr.locator('tr', { hasText: 'Privado Particular' }).first().innerText();
  check('Conciliación · capital app de Privado Particular «No determinable»', f.includes(ND), f.replace(/\s+/g, ' ').slice(0, 200));
  const fz = await tAcr.locator('tr', { hasText: 'Banco Cerrado Demo' }).first().innerText().catch(() => '');
  if (fz) check('Conciliación · crédito cerrado: capital app 0 real', /US\$ 0,00/.test(fz) && !fz.includes(ND));
}
await p.screenshot({ path: `${OUT}/04-conciliacion.png`, fullPage: true });
await sinEnUS('Conciliación', p.locator('body'));

// ── 4. Saldo por Mes (pantalla + Excel) ──
await p.getByRole('button', { name: /Saldo por Mes/ }).click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/05-saldo-por-mes.png`, fullPage: true });
const tSpm = p.locator('table').filter({ hasText: 'Total capital' }).first();
const filaHoy = await tSpm.locator('tbody tr').first().innerText();
check('Saldo por Mes · fila Hoy: Mediterra parcial, total parcial', /\(parcial\)/.test(filaHoy), filaHoy.replace(/\s+/g, ' ').slice(0, 220));
const filasTxt = await tSpm.locator('tbody tr').allInnerTexts();
check('Saldo por Mes · cero real visible como «US$ 0 K» (no «—»)', filasTxt.some(t => /US\$ 0 K/.test(t)));
await sinEnUS('Saldo por Mes', p.locator('body'));
const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Exportar a Excel/ }).click()]);
const fx = path.join(OUT, d.suggestedFilename()); await d.saveAs(fx);
const aoa = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(fx)).Sheets['Saldo por Mes'], { header: 1 });
const head = aoa[1], hoy = aoa[2];
const iPriv = head.indexOf('Mediterra · capital'), iTot = head.indexOf('Total capital identificado'), iFr = head.indexOf('Frisku Foods · capital');
check('Saldo por Mes · Excel: capital desconocido de Frisku escrito como «No determinable: sin desglose», no 0', hoy[iFr] === ND && hoy[iFr + 1] === 10000, `${hoy[iFr]} · sin clasificar ${hoy[iFr + 1]}`);
check('Saldo por Mes · pantalla: Frisku hoy «No determinable»', filaHoy.includes(ND));
check('Saldo por Mes · Excel: valores numéricos (no texto con formato) y capital conocido de Mediterra como número', typeof hoy[iPriv] === 'number' && typeof hoy[iTot] === 'number', `${hoy[iPriv]} · ${hoy[iTot]}`);
// cero real en el Excel: alguna empresa saldada a futuro queda 0 numérico
check('Saldo por Mes · Excel: un cero real se escribe 0 (número)', aoa.slice(2).some(r => r.some((v, j) => j > 0 && v === 0)));
check('sin errores de página', !errores.length, errores.join(' | '));
await browser.close();
console.log(`\n${ok} correctas, ${fallos} fallas · Chromium emulado · Supabase falso · datos ficticios · ${OUT}`);
process.exit(fallos ? 1 : 0);
