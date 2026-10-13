/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Créditos: fecha estimada de pago (app real, Supabase
   falso aislado, DATOS SINTÉTICOS).

   Un registro antiguo (sin control_desde) con una cuota pendiente de
   200.000 que vence en dos días:
     1. el detalle muestra «Control en la app desde 13/10/2026 (… por regla …)»;
     2. «📅 Fecha estimada» con fecha y motivo → se guarda en el servidor con
        historial; el vencimiento contractual no cambia;
     3. el flujo de Allegria Foods proyecta la cuota en el mes ESTIMADO y avisa
        las dos fechas;
     4. recarga → igual;
     5. Excel recalculado: «Pago Préstamos - Total» en el mes estimado, hoja
        «Servicio deuda» con control 0 y el aviso con las dos fechas;
     6. «Quitar estimada» con motivo → vuelve al mes contractual; la
        estimación queda anulada en el historial, no borrada.

   Uso: (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
        OUT_DIR=/tmp/e2e-fe node scripts/e2e/creditos-fecha-estimada.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';
import { hoyISO, sumarMeses } from '../../src/creditos.js';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mesDe = (iso) => `${MN[Number(iso.slice(5, 7)) - 1]}-${iso.slice(2, 4)}`;
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const hoy = hoyISO();
const d = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) + 2));
const VENCE = d.toISOString().slice(0, 10);
const ESTIMADA = `${sumarMeses(hoy.slice(0, 8) + '01', 2).slice(0, 8)}20`;
const MES_VENCE = mesDe(VENCE), MES_EST = mesDe(ESTIMADA);

const store = nuevoStore();
store.finanzas.value.creditos_data = [{ uid: 'cr-sint-1', n: 901, empresa: 'Allegria Foods', acreedor: 'Banco Sintético',
  tipo_inst: 'Banco', monto: 200000, f_venc: VENCE, tipo_cr: 'Bullet', tasa: '8.3%', cuota: 200000, pagado: false }];
const cred = () => leerFila(store, 'finanzas').creditos_data.find(c => c.uid === 'cr-sint-1');

const { browser, page } = await abrirApp(store);
const errores = [];
page.on('pageerror', e => errores.push(String(e)));
const respuestas = [];
page.on('dialog', dl => (dl.type() === 'prompt' ? dl.accept(respuestas.shift() ?? '') : dl.accept()).catch(() => {}));
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});

const abrirDetalle = async () => {
  await subTab(page, /💳 Créditos/);
  await page.waitForTimeout(800);
  await page.locator('tr', { hasText: 'Banco Sintético' }).first().getByRole('button', { name: /Pagos/ }).click();
  await page.waitForTimeout(700);
};
const celdaFlujo = async (etiqueta, mes) => page.evaluate(([etiqueta, mes]) => {
  for (const t of document.querySelectorAll('table')) {
    const th = [...t.querySelectorAll('thead th')].find(x => x.innerText.trim() === mes);
    if (!th) continue;
    const fila = [...t.querySelectorAll('tbody tr')].find(tr => tr.cells[0] && tr.cells[0].innerText.split('\n').map(x => x.trim()).includes(etiqueta));
    if (!fila) continue;
    const r = th.getBoundingClientRect(); const cx = r.left + r.width / 2;
    const td = [...fila.cells].find(c => { const q = c.getBoundingClientRect(); return q.left <= cx && cx <= q.right; });
    return td ? td.innerText.trim() : null;
  }
  return null;
}, [etiqueta, mes]);
const verFlujo = async () => {
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, 'Allegria Foods');
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1200);
  await page.getByText(/egresos no operacionales/i).first().click().catch(() => {});
  await page.waitForTimeout(600);
};

await login(page);
await entrarFinanzas(page);

console.log(`\n=== 1 · detalle (vence ${VENCE}, estimada ${ESTIMADA}) ===`);
await abrirDetalle();
let t = await page.locator('body').innerText();
check('el detalle declara el control por regla desde 13/10/2026', /Control en la app desde:\s*13\/10\/2026 \(registro anterior: por regla/.test(t));

console.log('\n=== 2 · fecha estimada ===');
respuestas.push(ESTIMADA, 'Banco informa prórroga (prueba)');
await page.getByRole('button', { name: /📅 Fecha estimada/ }).first().click();
await page.waitForTimeout(2500);
let c = cred();
const fe = (c.fechas_estimadas || []).filter(x => !x.anulada);
check('guardada en el servidor con fecha, motivo y usuario', fe.length === 1 && fe[0].fecha === ESTIMADA && /prórroga/.test(fe[0].motivo) && !!fe[0].usuario, JSON.stringify(fe));
check('el vencimiento contractual no cambió', c.f_venc === VENCE && c.cuota === 200000);
check('queda en el historial del crédito', (c.historial || []).some(h => h.accion === 'fecha estimada' && h.detalle.includes(ESTIMADA) && h.detalle.includes(VENCE)));
t = await page.locator('body').innerText();
check('la tabla muestra el pago estimado', t.includes(`pago estimado ${ddmm(ESTIMADA)}`));
await page.keyboard.press('Escape').catch(() => {});
await page.locator('button', { hasText: '×' }).first().click().catch(() => {});
await page.waitForTimeout(500);

console.log('\n=== 3 · flujo ===');
await verFlujo();
const vEst = num(await celdaFlujo('Pago Préstamos - Total', MES_EST));
const vVen = MES_VENCE === MES_EST ? null : num(await celdaFlujo('Pago Préstamos - Total', MES_VENCE));
check(`Pago Préstamos ${MES_EST} = 200.000`, vEst === 200000, `${vEst}`);
if (vVen !== null) check(`Pago Préstamos ${MES_VENCE} (contractual) = 0`, vVen === 0, `${vVen}`);
t = await page.locator('body').innerText();
check('el flujo avisa las dos fechas', t.includes('proyectada(s) en su fecha estimada de pago') && t.includes(`vence ${ddmm(VENCE)}`) && t.includes(`estimada ${ddmm(ESTIMADA)}`));

console.log('\n=== 4 · recarga ===');
const guardado = JSON.stringify(cred());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await entrarFinanzas(page).catch(() => {});
await verFlujo();
check('el dato guardado no cambió al recargar', JSON.stringify(cred()) === guardado);
check(`tras recargar ${MES_EST} = 200.000`, num(await celdaFlujo('Pago Préstamos - Total', MES_EST)) === 200000);

console.log('\n=== 5 · Excel recalculado ===');
{
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }),
    page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
  const arch = path.join(OUT, 'fe.xlsx'); await dl.saveAs(arch);
  const rec = recalcular(arch, OUT);
  const ws = rec.wb.Sheets['Allegria Foods'];
  const refs = Object.keys(ws).filter(k => k[0] !== '!');
  const col = (m) => refs.find(k => ws[k].v === m && /^[A-Z]+3$/.test(k))?.replace(/\d+$/, '');
  const fila = refs.find(k => /^A\d+$/.test(k) && String(ws[k].v).trim() === 'Pago Préstamos - Total')?.slice(1);
  check(`Excel Pago Préstamos ${MES_EST} = 200.000`, ws[`${col(MES_EST)}${fila}`]?.v === 200000, `${ws[`${col(MES_EST)}${fila}`]?.v}`);
  const sd = rec.wb.Sheets['Servicio deuda'];
  const filaCtl = Object.keys(sd).find(k => /^A\d+$/.test(k) && /^Control/.test(String(sd[k].v)))?.slice(1);
  const ctl = Object.keys(sd).filter(k => new RegExp(`^[B-Z][A-Z]?${filaCtl}$`).test(k)).map(k => Number(sd[k].v) || 0);
  check('Servicio deuda: control 0 en todos los meses', ctl.length > 0 && ctl.every(x => Math.abs(x) < 0.01), `${ctl.length} celdas`);
  const textos = refs.map(k => ws[k].v).filter(v => typeof v === 'string');
  check('el Excel avisa las dos fechas', textos.some(x => x.includes('FECHA ESTIMADA') && x.includes(ddmm(VENCE)) && x.includes(ddmm(ESTIMADA))));
}

console.log('\n=== 6 · quitar la fecha estimada ===');
await abrirDetalle();
respuestas.push('Se paga al vencimiento (prueba)');
await page.getByRole('button', { name: /Quitar estimada/ }).first().click();
await page.waitForTimeout(2500);
c = cred();
check('la estimación queda ANULADA con motivo, no borrada', (c.fechas_estimadas || []).length === 1 && c.fechas_estimadas[0].anulada === true && /vencimiento/.test(c.fechas_estimadas[0].motivoAnulacion));
await page.locator('button', { hasText: '×' }).first().click().catch(() => {});
await verFlujo();
check(`vuelve al mes contractual: ${MES_VENCE} = 200.000`, num(await celdaFlujo('Pago Préstamos - Total', MES_VENCE)) === 200000);

check('sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
check('0 peticiones escapadas a producción', escapadas.length === 0);
await browser.close();
console.log(fallos ? `\n✗ ${fallos} falla(s)` : '\n✓ todo OK');
process.exit(fallos ? 1 : 0);
