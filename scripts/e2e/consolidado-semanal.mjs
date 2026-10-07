/* ─────────────────────────────────────────────────────────────────────────
   CONSOLIDADO SEMANAL = FLUJO EMPRESAS — navegador, Supabase falso.

   Con datos mixtos en Mediterra (overrides semanales y mensuales, subLines,
   línea agregada, créditos bullet/cuotas/socio, incluido cambio de año):
     1. Consolidado › Semana: Σ semanas = Consolidado › Mes (categorías y neto),
        ingresos − egresos = neto por semana, y el saldo encadena semana a semana
        (saldo anterior + neto = saldo) y cierra en el saldo del mes.
     2. Consolidado › Por Empresa › Semana (Mediterra) = Flujo Empresas › Semanal.
     3. Resumen Semanal (Mediterra, una semana) = Flujo Empresas › Semanal.
   Uso:  APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/cs node scripts/e2e/consolidado-semanal.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, num } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = []; for (let i = 0; i < 63; i++) { const m = (3 + i) % 12, y = 26 + Math.floor((3 + i) / 12); MESES.push(`${MN[m]}-${y}`); }
const hoy = new Date(); const iHoy = MESES.indexOf(`${MN[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}`);
const iM = k => iHoy + k;
const f = (k, d) => new Date(hoy.getFullYear(), hoy.getMonth() + k, d).toISOString().slice(0, 10);

const store = nuevoStore(); const fin = store.finanzas.value;
fin.finanzas_real = { Mediterra: { _proyOverrides: {
  'ing_op::Fee Administración': { [iM(0)]: { _sem0: 10000, _sem2: 25000 } },
  'egr_fijo::Gastos Varios': { [iM(1)]: 12345 } } } };
fin.sub_lines = { Mediterra: { 'Pago Préstamos - Total': [{ label: 'Comisión', vals: { [iM(1)]: 7000 } }, { label: 'Notaría', vals: { [`${iM(2)}_1`]: 3000 } }] } };
fin.added_lines = { Mediterra: { egr_var: [{ label: 'Gasto prueba E2E', vals: { [iM(1)]: 4000, [`${iM(2)}_2`]: 1500 } }] } };
fin.creditos_data = [
  { n: 1, empresa: 'Mediterra', acreedor: 'Banco A', monto: 120000, f_venc: f(1, 28), tipo_cr: 'Bullet', cuota: 120000, pagado: false },
  { n: 2, empresa: 'Mediterra', acreedor: 'Banco B', monto: 111000, f_inicio: f(-1, 15), f_venc: f(5, 15), tipo_cr: 'Cuotas Mensuales', cuota: 18500, pagado: false },
  { n: 3, empresa: 'Mediterra', acreedor: 'Socio', tipo_credito: 'socio', monto: 300000, tasa_efectiva_anual: 8, fecha_desembolso: f(0, 1),
    cuotas_socio: [{ fecha_vencimiento: f(2, 10), modo: 'interes' }, { fecha_vencimiento: f(4, 20), modo: 'amortizacion', amortizacion: 300000 }], pagado: false },
  { n: 4, empresa: 'Mediterra', acreedor: 'Fin de año', monto: 50000, f_venc: '2026-12-31', tipo_cr: 'Bullet', cuota: 50000, pagado: false },
  { n: 5, empresa: 'Allegria Service', acreedor: 'Banco C', monto: 80000, f_venc: '2027-01-04', tipo_cr: 'Bullet', cuota: 80000, pagado: false },
];
store.finanzas_bancos.value.saldos = { 'Mediterra||BICE||usd': { monto: 500000, fecha: f(0, 5), moneda: 'usd' } };

const { browser, page } = await abrirApp(store);
page.on('dialog', d => d.accept().catch(() => {}));
await login(page); await entrarFinanzas(page); await irAFlujoEmpresas(page);
let ok = 0, fallos = 0; const det = [];
const check = (n, a, b, tol = 1) => { const bien = (a == null && b == null) || Math.abs((a || 0) - (b || 0)) <= 0.5 * (tol + 1) + 1e-9; bien ? ok++ : (fallos++, det.push(`✗ ${n}: ${a} ≠ ${b}`)); };

// Lee una tabla cuyas columnas son semanas (fila 0) agrupadas por mes (fila 1) o meses.
async function leerTabla(texto, modo) {
  const t = page.locator('table', { hasText: texto }).first();
  const filas = await t.locator('tr').all();
  const cab0 = (await filas[0].locator('th,td').allInnerTexts()).map(x => x.trim().replace(/^▾\s*/, ''));
  const cols = [];   // {mes, w}
  if (modo === 'semana') {
    let k = 0; cab0.forEach((h, i) => { if (/^S\d{2}$/.test(h)) { cols.push({ i, mes: MESES[Math.floor(k / 4)], w: k % 4 }); k++; } });
  } else cab0.forEach((h, i) => { if (/^\w{3}-\d{2}$/.test(h)) cols.push({ i, mes: h }); });
  const out = [];
  for (const fila of filas.slice(1)) {
    const c = await fila.locator('th,td').allInnerTexts();
    const etq = (c[0] || '').replace(/\n/g, ' ').trim();
    const val = (i) => { const b = (c[i] || '').split('\n').pop().trim(); return b === '—' || b === '' ? null : num(b); };
    out.push({ etq, val });
  }
  return { cols, filas: out };
}
const fila = (tab, re) => tab.filas.find(r => re.test(r.etq));

// ── Flujo Empresas › Mediterra › Semanal (referencia) ──
await elegirEmpresa(page, 'Mediterra');
await page.getByRole('button', { name: '📊 Semanal', exact: true }).click(); await page.waitForTimeout(1200);
const tFE = page.locator('table', { hasText: 'SALDO ACUM' }).first();
const fFE = await tFE.locator('tr').all();
const cabFE = (await fFE[2].locator('th,td').allInnerTexts()).map(x => x.trim());
const colsFE = []; let kk = 0; cabFE.forEach((h, i) => { if (/^S\d{2}$/.test(h)) { colsFE.push({ i, mes: MESES[Math.floor(kk / 4)], w: kk % 4 }); kk++; } });
let netoFE = null;
for (const fr of fFE) { const c = await fr.locator('th,td').allInnerTexts(); if (/FLUJO NETO/.test(c[0] || '')) netoFE = c; }
const vFE = (mes, w) => { const col = colsFE.find(c => c.mes === mes && c.w === w); const b = (netoFE[col.i] || '').split('\n').pop().trim(); return b === '—' ? 0 : num(b); };

// ── Consolidado ──
await page.getByRole('button', { name: /Consolidado/ }).first().click(); await page.waitForTimeout(1500);
await page.getByRole('button', { name: /📅 Mes/ }).first().click(); await page.waitForTimeout(1000);
const mes = await leerTabla('FLUJO NETO CONSOLIDADO', 'mes');
await page.getByRole('button', { name: /📊 Semana/ }).first().click(); await page.waitForTimeout(1500);
const sem = await leerTabla('FLUJO NETO CONSOLIDADO', 'semana');
await page.screenshot({ path: path.join(OUT, 'consolidado-semana.png') });
const textoKPI = (await page.locator('body').innerText()).replace(/\n/g, ' ');
const saldoIni = num((/Saldo inicial consolidado · \w{3}-\d{2}\s*(-?\$[\d,]+)/i.exec(textoKPI) || [])[1]);
if (saldoIni == null || isNaN(saldoIni)) { det.push('no se pudo leer el saldo inicial consolidado'); fallos++; }

const cats = sem.filas.filter(r => /^▶\s*[+−]/.test(r.etq)).map(r => ({ r, signo: /^▶\s*\+/.test(r.etq) ? 1 : -1, re: new RegExp(r.etq.replace(/^▶\s*[+−]\s*/, '').split(' ')[0]) }));
const netoS = fila(sem, /FLUJO NETO CONSOLIDADO/), saldoS = fila(sem, /SALDO ACUMULADO CONSOLIDADO/);
const netoM = fila(mes, /FLUJO NETO CONSOLIDADO/), saldoM = fila(mes, /SALDO ACUMULADO CONSOLIDADO/);
let prev = null;
for (let k = 0; k < 4; k++) {
  const m = MESES[iM(k)]; const cm = mes.cols.find(c => c.mes === m); const cw = sem.cols.filter(c => c.mes === m);
  if (!cm || cw.length !== 4) { det.push(`sin columnas para ${m}`); fallos++; continue; }
  cats.forEach(({ r, re }) => { const rm = mes.filas.find(x => x.etq === r.etq); check(`Σ semanas = mes · ${r.etq.slice(0, 30)} · ${m}`, cw.reduce((a, c) => a + (r.val(c.i) || 0), 0), rm.val(cm.i) || 0, 4); });
  check(`Σ semanas = mes · flujo neto · ${m}`, cw.reduce((a, c) => a + (netoS.val(c.i) || 0), 0), netoM.val(cm.i) || 0, 4);
  cw.forEach(c => {
    check(`ingresos − egresos = neto · ${m} S${c.w + 1}`, cats.reduce((a, x) => a + x.signo * (x.r.val(c.i) || 0), 0), netoS.val(c.i) || 0, cats.length);
    const ini = (k === 0 && c.w === 0) ? saldoIni : prev;
    check(`saldo anterior + neto = saldo · ${m} S${c.w + 1}`, ini + (netoS.val(c.i) || 0), saldoS.val(c.i), 2);
    prev = saldoS.val(c.i);
  });
  check(`saldo de la última semana = saldo del mes · ${m}`, prev, saldoM.val(cm.i));
}

// ── Por Empresa › Semana: Mediterra = Flujo Empresas ──
await page.getByRole('button', { name: /📋 Por Empresa/ }).first().click(); await page.waitForTimeout(1500);
const tPE = page.locator('table', { hasText: 'FLUJO NETO CONSOLIDADO' }).first();
const cabPE = (await (await tPE.locator('tr').all())[0].locator('th,td').allInnerTexts()).map(x => x.trim().replace(/^▾\s*/, ''));
const colsPE = []; let kp = 0; cabPE.forEach((h, i) => { if (/^S\d{2}$/.test(h)) { colsPE.push({ i, mes: MESES[Math.floor(kp / 4)], w: kp % 4 }); kp++; } });
let enMed = false, netoMed = null;
for (const fr of await tPE.locator('tr').all()) {
  const c = await fr.locator('th,td').allInnerTexts(); const e = (c[0] || '').replace(/\n/g, ' ');
  if (/Mediterra/.test(e) && !/Saldo|Flujo/.test(e)) enMed = true;
  else if (enMed && /^Flujo Neto/.test(e.trim())) { netoMed = c; break; }
}
for (let k = 0; k < 4; k++) for (let w = 0; w < 4; w++) {
  const m = MESES[iM(k)]; const c = colsPE.find(x => x.mes === m && x.w === w);
  const b = (netoMed?.[c.i] || '').split('\n').pop().trim();
  check(`Por Empresa (Mediterra) = Flujo Empresas · ${m} S${w + 1}`, b === '—' ? 0 : num(b), vFE(m, w));
}

// ── Resumen Semanal: Mediterra, última semana del mes siguiente ──
await page.getByRole('button', { name: /📅 Resumen Semanal/ }).first().click(); await page.waitForTimeout(1200);
const mSig = MESES[iM(1)];
const opcion = await page.locator('select option').evaluateAll((os, m) => { const o = os.filter(x => x.textContent.endsWith(m)); return o.length ? o[o.length - 1].value : null; }, mSig);
await page.locator('select').first().selectOption(opcion); await page.waitForTimeout(800);
const tRS = page.locator('table', { hasText: mSig }).first();
const cabRS = (await (await tRS.locator('tr').all())[0].locator('th,td').allInnerTexts()).map(x => x.trim());
const iMed = cabRS.findIndex(h => /Mediterra$/.test(h));
let rsNeto = null;
for (const fr of await tRS.locator('tr').all()) { const c = await fr.locator('th,td').allInnerTexts(); if (/flujo neto/i.test(c[0] || '')) rsNeto = c; }
const vRS = (rsNeto?.[iMed] || '').trim();
// El Resumen Semanal formatea en es-CL (punto de miles)
check(`Resumen Semanal (Mediterra, ${mSig} S4) = Flujo Empresas`, vRS === '—' ? 0 : num(vRS.replace(/\./g, '')), vFE(mSig, 3));

// ── Reporte Semanal: abre con el motor de Flujo Empresas, sin errores ──
const logsReporte = [], erroresPagina = [];
page.on('console', m => { const t = m.text(); if (t.startsWith('[Reporte][')) logsReporte.push(t); });
page.on('pageerror', e => erroresPagina.push(String(e)));
await page.getByRole('button', { name: /📅 Reporte Semanal/ }).first().click(); await page.waitForTimeout(2500);
const txtRep = await page.locator('body').innerText();
check('Reporte Semanal abre sin error de módulo', !/Ocurrió un error en/i.test(txtRep) && erroresPagina.length === 0 ? 1 : 0, 1);
check('Reporte Semanal muestra "Compromisos 8 Sem."', /compromisos 8 sem\./i.test(txtRep) ? 1 : 0, 1);
check('Reporte Semanal calcula movimientos por empresa', logsReporte.length > 0 ? 1 : 0, 1);
check('Reporte: KPI separa "con fecha" de "mensual sin desglose"', /con fecha USD [\d.]+ · mensual sin desglose USD [\d.]+/.test(txtRep) ? 1 : 0, 1);
await page.screenshot({ path: path.join(OUT, 'reporte-semanal.png') });

fs.writeFileSync(path.join(OUT, 'consolidado-semanal.json'), JSON.stringify({ ok, fallos, det }, null, 2));
console.log(`Comprobaciones: ${ok} cuadran, ${fallos} no cuadran`); det.slice(0, 15).forEach(d => console.log('  ' + d));
await browser.close();
process.exit(fallos ? 1 : 0);
