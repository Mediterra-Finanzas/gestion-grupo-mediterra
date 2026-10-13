/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Créditos (app real, Supabase falso aislado).

   1. Alta de un crédito "con calendario" (400.000 al 8% Act/360, capital
      trimestral) y lectura de la vista previa.
   2. Pago parcial de la 1ª cuota (interés 8.000 + capital 40.000): queda
      pendiente 60.000 y el crédito "con vencidos".
   3. Un guardado que el servidor rechaza NO deja el pago registrado.
   4. Flujo Empresas → Osiris: "Pago Préstamos - Total" de la pantalla =
      cálculo de src/creditos.js sobre lo que quedó guardado (mes a mes).
   5. Análisis CFO y Simular prepago: se muestran; aplicar un prepago total
      deja el crédito cerrado y fuera del flujo.

   Uso: CI=true npx react-scripts build; (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
        OUT_DIR=/tmp/e2e-creditos node scripts/e2e/creditos.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num, inputTras, selectTras, ponerNumero, cerrarAvisos } from './lib.mjs';
import { flujoCreditosEmpresa, estadoCredito, hoyISO } from '../../src/creditos.js';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (nombre, cond, extra = '') => { console.log(`${cond ? '✓' : '✗ FALLA'}  ${nombre}${extra ? '  — ' + extra : ''}`); if (!cond) fallos++; };
const foto = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false });

const store = nuevoStore();
// Valores manuales ANTIGUOS en Pago Préstamos de Osiris: Oct-26 (idx 6) y Nov-26 (idx 7)
store.finanzas.value.finanzas_real = { Osiris: { _proyOverrides: { 'egr_nop::Pago Préstamos - Total': { '6': 12345, '7': 5555 } } } };
const { browser, page } = await abrirApp(store);
const errores = [];
page.on('pageerror', e => errores.push(String(e)));
let respuestaPrompt = 'prueba e2e';
page.on('dialog', d => (d.type() === 'prompt' ? d.accept(respuestaPrompt) : d.accept()).catch(() => {}));

await login(page);
await entrarFinanzas(page);
await subTab(page, /💳 Créditos/);
await foto(page, '01-creditos');
check('Pestañas nuevas visibles', await page.getByRole('button', { name: /Análisis CFO/ }).count() > 0 && await page.getByRole('button', { name: /Simular prepago/ }).count() > 0);
check('Ya no aparece la cifra fija "Deuda Total Q1-2026"', await page.getByText('Deuda Total Q1-2026').count() === 0);

// ── 0. Conciliar valores manuales antiguos ───────────────────────────────
await subTab(page, /Conciliación/);
const txt0 = await page.locator('body').innerText();
check('Conciliación muestra los 2 valores manuales pendientes (12,345 y 5,555)', txt0.includes('$12,345') && txt0.includes('$5,555') && /2 mes\(es\) pendiente/.test(txt0));
const filaOct = page.locator('tr', { hasText: 'Oct-26' }).filter({ hasText: 'Pago Préstamos' }).first();
await filaOct.getByRole('button', { name: 'Usar Créditos' }).click();
await page.waitForTimeout(1500);
respuestaPrompt = 'Cuota Banco X aún no registrada en Créditos';
const filaNov = page.locator('tr', { hasText: 'Nov-26' }).filter({ hasText: 'Pago Préstamos' }).first();
await filaNov.getByRole('button', { name: 'Mantener manual' }).click();
await page.waitForTimeout(1500);
respuestaPrompt = 'prueba e2e';
const real0 = leerFila(store, 'finanzas').finanzas_real.Osiris;
check('Usar Créditos: se retira el manual de Oct-26 y queda el registro', real0._proyOverrides['egr_nop::Pago Préstamos - Total']['6'] === undefined
  && real0._resolucionesCreditos.some(r => r.idx === 6 && r.decision === 'creditos' && r.valorManual === 12345));
check('Mantener: el manual de Nov-26 sigue, con motivo registrado', real0._proyOverrides['egr_nop::Pago Préstamos - Total']['7'] === 5555
  && real0._resolucionesCreditos.some(r => r.idx === 7 && r.decision === 'mantener' && /no registrada/.test(r.nota)));
await page.getByRole('button', { name: /💳 Créditos/ }).last().click();   // sub-pestaña (la primera es la del módulo)
await page.waitForTimeout(800);

// ── 1. Alta ────────────────────────────────────────────────────────────
await page.getByRole('button', { name: /\+ Nuevo Crédito/ }).click();
await page.waitForTimeout(500);
await selectTras(page, 'Empresa deudora').selectOption('Osiris');
await inputTras(page, 'Acreedor').fill('Banco E2E');
await selectTras(page, 'Tipo de crédito').selectOption('Capital de trabajo');
await ponerNumero(page, 'Capital original (USD)', '400000');
await inputTras(page, 'Fecha de desembolso').fill('2026-01-10');
await selectTras(page, 'Modalidad de pago').selectOption('lineal');
await inputTras(page, 'Vencimiento final').fill('2027-01-10');
await selectTras(page, 'Periodicidad').selectOption('3');
await inputTras(page, 'Primer vencimiento').fill('2026-04-10');
await ponerNumero(page, 'Tasa anual nominal (%)', '8');
await selectTras(page, 'Base de cálculo de intereses').selectOption('act360');
await selectTras(page, 'Prepago: comisión / penalidad').selectOption('meses_interes');
await ponerNumero(page, 'N° de meses', '1');
await page.waitForTimeout(300);
await foto(page, '02-alta-vista-previa');
const previa = await page.locator('table').filter({ hasText: 'Saldo capital' }).last().innerText();
check('Vista previa: intereses 8,000.00 / 6,066.67 / 4,088.89 / 2,044.44',
  ['8,000.00', '6,066.67', '4,088.89', '2,044.44'].every(x => previa.includes(x)));
await page.getByRole('button', { name: /💾 Guardar/ }).click();
await page.waitForTimeout(1500);
let cred = (leerFila(store, 'finanzas').creditos_data || []).find(c => c.acreedor === 'Banco E2E');
check('Crédito guardado en el servidor como contrato con uid', !!cred && cred.tipo_credito === 'contrato' && !!cred.uid);
const nDefault = (leerFila(store, 'finanzas').creditos_data || []).length;
check('Los créditos existentes se guardan con uid único', new Set(leerFila(store, 'finanzas').creditos_data.map(c => c.uid)).size === nDefault);

// ── 2. Pago parcial ──────────────────────────────────────────────────────
const fila = page.locator('tr', { hasText: 'Banco E2E' }).first();
await fila.getByRole('button', { name: /Pagos/ }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /💵 Pagar/ }).first().click();
await page.waitForTimeout(300);
await inputTras(page, 'Fecha efectiva').fill('2026-04-10');
await ponerNumero(page, 'Capital', '40000');
await ponerNumero(page, 'Intereses', '8000');
// 3. primero con el servidor rechazando: no debe quedar registrado
store.__fallarEscrituras = true;
await page.getByRole('button', { name: /💾 Registrar pago/ }).click();
await page.waitForTimeout(1500);
cred = leerFila(store, 'finanzas').creditos_data.find(c => c.acreedor === 'Banco E2E');
check('Servidor rechaza → el pago NO queda en el servidor', !(cred.pagos || []).length);
check('…y el formulario de pago sigue abierto (no se dio por registrado)', await page.getByRole('button', { name: /💾 Registrar pago/ }).count() === 1);
store.__fallarEscrituras = false;
await page.getByRole('button', { name: /💾 Registrar pago/ }).click();
await page.waitForTimeout(1500);
await foto(page, '03-pago-parcial');
cred = leerFila(store, 'finanzas').creditos_data.find(c => c.acreedor === 'Banco E2E');
const est = estadoCredito(cred, hoyISO());
check('Pago guardado: capital 40.000 + interés 8.000', (cred.pagos || []).filter(p => !p.anulado).length === 1 && cred.pagos[0].capital === 40000 && cred.pagos[0].interes === 8000);
// Alta hoy con desembolso pasado: la cuota 10-jul (antes del alta, sin pago) queda POR CONCILIAR.
// Capital: 400.000 − 40.000 pagado = 360.000 = 260.000 confirmado + 100.000 por conciliar.
check('Saldo capital confirmado 260.000 + por conciliar 100.000 = 360.000', Math.abs(est.saldoCapital - 260000) < 0.01 && Math.abs(est.porConciliarCapital - 100000) < 0.01,
  `${est.saldoCapital} + ${est.porConciliarCapital}`);
const detalle = await page.locator('table').filter({ hasText: 'Pendiente' }).first().innerText();
check('Detalle muestra 60,000.00 pendiente y "Vencida"', detalle.includes('60,000.00') && /Vencida/.test(detalle));
await page.getByRole('button', { name: '×' }).first().click();
await page.waitForTimeout(400);

// ── 4. Flujo Empresas: pantalla = modelo sobre lo guardado ──────────────
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Osiris');
await page.waitForTimeout(800);
// Expandir "Egresos No Operacionales" para ver la línea
await page.locator('tr', { hasText: 'EGRESOS NO' }).first().locator('td,th').first().click();
await page.waitForTimeout(600);
await foto(page, '04-flujo-osiris');
const tabla = page.locator('table').first();
const filas = await tabla.locator('tr').all();
const heads = (await filas[1].locator('th,td').allInnerTexts()).map(t => t.trim());
let pantalla = null;
for (const f of filas) {
  const c = await f.locator('th,td').allInnerTexts();
  if (c[0] && c[0].includes('Pago Préstamos - Total')) { pantalla = {}; heads.forEach((h, i) => { if (/^[A-Z][a-z]{2}-\d{2}$/.test(h)) pantalla[h] = num((c[i] || '').split('\n')[0]); }); break; }
}
check('Fila "Pago Préstamos - Total" encontrada', !!pantalla);
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ubicarMes = (iso) => { const [y, m] = iso.split('-').map(Number); const idx = (y - 2026) * 12 + (m - 4); return { idx: idx >= 0 && idx < 63 ? idx : -1, semIdx: 0 }; };
const todos = leerFila(store, 'finanzas').creditos_data;
const modelo = flujoCreditosEmpresa('Osiris', todos, { hoy: hoyISO(), ubicar: ubicarMes }).prestamos.total;
let difs = 0, comparados = 0;
Object.entries(pantalla || {}).forEach(([mes, v]) => {
  const [mn, yy] = mes.split('-'); const idx = (2000 + Number(yy) - 2026) * 12 + (MN.indexOf(mn) - 3);
  if (idx < 0 || idx >= 63) return;
  if (mes === 'Nov-26') { check('Nov-26 usa el valor manual mantenido (5,555)', v === 5555, `${v}`); return; }
  comparados++;
  if (Math.abs((v || 0) - Math.round(modelo[idx])) > 1) { difs++; console.log(`   ${mes}: pantalla ${v} · modelo ${modelo[idx].toFixed(2)}`); }
});
check(`Pantalla = modelo en ${comparados} meses visibles`, comparados > 0 && difs === 0);
const hoyMes = `${MN[new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`;
check(`Los 60.000 impagos + vencidos antiguos están en el mes en curso (${hoyMes})`, (pantalla?.[hoyMes] || 0) >= 60000, `${pantalla?.[hoyMes]}`);
check('Aviso de vencidas confirmadas visible en el flujo', await page.getByText(/vencida\(s\) impaga\(s\) confirmada\(s\)/).count() > 0);
check('Aviso de cuotas por conciliar (fuera del flujo) visible', await page.getByText(/histórica\(s\) por conciliar/).count() > 0);

// ── 5. Análisis y prepago ────────────────────────────────────────────────
await subTab(page, /💳 Créditos/);
await subTab(page, /Conciliación/);
await foto(page, '05a-conciliacion');
const txtConc = await page.locator('body').innerText();
check('Conciliación lista la cuota 10/07/2026 de Banco E2E', txtConc.includes('Banco E2E') && txtConc.includes('10/07/2026'));
await subTab(page, /Análisis CFO/);
await foto(page, '05-analisis');
check('Análisis: servicio de deuda y exposición a tasas', await page.getByText(/Servicio de deuda por mes/).count() > 0 && await page.getByText(/Exposición a tasas/).count() > 0);
await subTab(page, /Simular prepago/);
const opt = await page.locator('select').first().locator('option', { hasText: 'Banco E2E' }).getAttribute('value');
await page.locator('select').first().selectOption(opt);
await inputTras(page, 'Fecha del prepago').fill('2026-10-20');
await page.waitForTimeout(600);
await foto(page, '06-prepago');
const txt = await page.locator('body').innerText();
// saldo futuro (después del 20-oct): Q4 100.000 ; devengado 100.000 × 8% × 10/360 (10-oct→20-oct) = 222,22
// comisión 1 mes: 100.000 × 8%/12 = 666,67 ; vencidos impagos a regularizar: Q1 60.000 + Q2 106.066,67 + Q3 104.088,89
check('Prepago: devengado 222.22 y comisión 666.67 en pantalla', txt.includes('222.22') && txt.includes('666.67'));
await page.getByRole('button', { name: /Aplicar prepago/ }).click();
await page.waitForTimeout(1500);
cred = leerFila(store, 'finanzas').creditos_data.find(c => c.acreedor === 'Banco E2E');
check('Prepago aplicado: registro de pago tipo prepago y evento de capital', (cred.pagos || []).some(p => p.tipo === 'prepago') && (cred.prepagos || []).length === 1);
const mod2 = flujoCreditosEmpresa('Osiris', [cred], { hoy: hoyISO(), ubicar: ubicarMes }).prestamos.total;
check('Tras el prepago, Jan-27 del crédito queda en 0 (sin duplicar)', mod2[iMes('Jan-27')] === 0);
function iMes(l) { const [mn, yy] = l.split('-'); return (2000 + Number(yy) - 2026) * 12 + (MN.indexOf(mn) - 3); }

check('Sin errores de JavaScript en la página', errores.length === 0, errores.slice(0, 3).join(' | '));
fs.writeFileSync(path.join(OUT, 'store-final.json'), JSON.stringify(leerFila(store, 'finanzas').creditos_data.filter(c => c.acreedor === 'Banco E2E'), null, 2));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nE2E Créditos OK');
process.exit(fallos ? 1 : 0);
