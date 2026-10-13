/* ─────────────────────────────────────────────────────────────────────────
   VISTA SEMANAL — fechas solo cuando existen (oct-2026). App real, Supabase
   falso aislado, DATOS SINTÉTICOS, RELOJ FIJO: 14-10-2026 (semana S42, la
   3ª de octubre en la app; S40 y S41 ya pasaron).

   Escenarios:
     A. Importe mensual sin semanas (Arriendo Oficina calculado, Seguros
        Exportación manual mensual): sin fecha → no está en ninguna semana,
        sí en el cierre del mes (Σ); fila «sin fecha» y aviso de incompletitud.
     B. Semana explícita ya pasada (Arriendo Camionetas en S40): NO se da por
        pagada → se suma en la semana en curso (fila «atrasado»).
     C. Crédito con pago parcial y cuota vencida en semana pasada: el
        pendiente (no lo pagado) entra en la semana en curso.
     D. Distribución estimada a fin de mes: Seguros 106.000 → S43; el mes no
        cambia, lo sin fecha baja en ese monto, el saldo de S43 lo incluye.
     E. Distribución parcial: Arriendo Oficina 1.000 → S43; 1.700 siguen sin
        fecha; el mes no cambia.
     F. Guardado y recarga.
     G. Cuadre: saldo S43 + sin fecha = Σ Oct = saldo mensual Oct = Excel.
     H. Cambiar el total en la vista mensual conserva la semana fechada (marca
        «est.») y deja la diferencia sin fecha.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila, SALDO_INI } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };
const cerca = (a, b) => a != null && b != null && Math.abs(a - b) < 0.5;

const EMP = 'Allegria Foods', OCT = 6;
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.finanzas_real = { [EMP]: { _proyOverrides: {
  'egr_var::Seguros Exportación': { [OCT]: 106000 },              // mensual manual: sin fecha
  'egr_fijo::Arriendo Camionetas': { [OCT]: { _sem0: 2600 } },     // fechado en S40 (ya pasó)
} } };
fin.creditos_data = [
  // vence en S41 (ya pasó), pagado en parte: queda 30.000 pendiente y vencido
  { uid: 'cr-e2e-1', n: 991, empresa: EMP, acreedor: 'Banco Semana', tipo_inst: 'Banco', monto: 50000,
    f_venc: '2026-10-06', cuota: 50000, tipo_cr: 'Bullet', pagado: false, control_desde: '2026-10-01',
    pagos: [{ id: 'pg1', vencKey: 'cr-e2e-1@2026-10-06', fecha: '2026-10-06', sinDesglose: 20000, capital: 0, interes: 0, cargos: 0, tipo: 'pago', usuario: 'qa', ts: '2026-10-06T12:00:00Z' }] },
  // vence en S43
  { uid: 'cr-e2e-2', n: 992, empresa: EMP, acreedor: 'Banco Futuro', tipo_inst: 'Banco', monto: 10000,
    f_venc: '2026-10-21', cuota: 10000, tipo_cr: 'Bullet', pagado: false, control_desde: '2026-10-01' },
];
store.finanzas.value = fin;

const { browser, ctx, page } = await abrirApp(store);
await ctx.clock.install({ time: new Date('2026-10-14T12:00:00-03:00') });
const errores = [];
page.on('pageerror', e => errores.push(String(e)));
page.on('dialog', d => d.accept().catch(() => {}));
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});

const celda = async (etiqueta, col) => page.evaluate(([etiqueta, col]) => {
  for (const t of document.querySelectorAll('table')) {
    const th = [...t.querySelectorAll('thead th')].find(x => x.innerText.trim() === col);
    if (!th) continue;
    const fila = [...t.querySelectorAll('tbody tr')].find(tr => tr.cells[0] && tr.cells[0].innerText.split('\n').map(x => x.trim()).includes(etiqueta));
    if (!fila) continue;
    const r = th.getBoundingClientRect(); const cx = r.left + r.width / 2;
    const td = [...fila.cells].find(c => { const q = c.getBoundingClientRect(); return q.left <= cx && cx <= q.right; });
    return td ? td.innerText.trim() : null;
  }
  return null;
}, [etiqueta, col]);
const v = async (et, col) => num((await celda(et, col) || '').split('\n')[0]);
const sinFechaLinea = async (et) => { const t = await celda(et, 'Σ Oct-26'); const m = /sin fecha\s*([-\d$,.()]+)/.exec(t || ''); return m ? num(m[1]) : 0; };
const ov = (clave) => leerFila(store, 'finanzas').finanzas_real?.[EMP]?._proyOverrides?.[clave]?.[OCT];

const abrirFlujo = async (vista) => {
  await entrarFinanzas(page).catch(() => {});
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, EMP);
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: vista === 'semanal' ? /📊 Semanal/ : /📅 Mensual/ }).first().click();
  await page.waitForTimeout(1000);
  for (const re of [/^.*egresos operacionales/i, /costos fijos/i, /egresos no operacionales/i]) {
    await page.getByText(re).first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
};
const escribir = async (et, col, valor) => {
  const h = (await page.evaluateHandle(([etiqueta, col]) => {
    for (const t of document.querySelectorAll('table')) {
      const th = [...t.querySelectorAll('thead th')].find(x => x.innerText.trim() === col);
      if (!th) continue;
      const fila = [...t.querySelectorAll('tbody tr')].find(tr => tr.cells[0] && tr.cells[0].innerText.split('\n').map(x => x.trim()).includes(etiqueta));
      if (!fila) continue;
      const r = th.getBoundingClientRect(); const cx = r.left + r.width / 2;
      return [...fila.cells].find(c => { const q = c.getBoundingClientRect(); return q.left <= cx && cx <= q.right; }) || null;
    }
    return null;
  }, [et, col])).asElement();
  await (await h.$('span')).click();
  await page.waitForTimeout(200);
  await (await h.$('input')).fill(String(valor));
  await (await h.$('input')).press('Enter');
  await page.waitForTimeout(3500);
};

await login(page);
await abrirFlujo('semanal');
await page.screenshot({ path: path.join(OUT, '01-semanal.png'), fullPage: false });

console.log('\n=== A · mensual sin semanas: sin fecha ===');
check('Seguros: ninguna semana muestra el mensual', (await v('Seguros Exportación', 'S43')) === 0 && (await v('Seguros Exportación', 'S40')) === 0);
check('Seguros: Σ Oct = 106.000 con «sin fecha 106.000»', (await v('Seguros Exportación', 'Σ Oct-26')) === 106000 && (await sinFechaLinea('Seguros Exportación')) === 106000);
const arrOfi = await v('Arriendo Oficina', 'Σ Oct-26');
check('Arriendo Oficina (calculado): Σ con todo sin fecha', arrOfi > 0 && (await sinFechaLinea('Arriendo Oficina')) === arrOfi, `${arrOfi}`);
const t0 = await page.locator('body').innerText();
check('aviso de saldo semanal incompleto por fechas', /Saldo semanal incompleto por fechas\.\s*Oct-26:/.test(t0) && /Meses siguientes con importes sin fecha/.test(t0));

console.log('\n=== B · semana pasada: atrasado, no pagado ===');
check('fila «atrasado» en S42 = −2.600 (Arriendo Camionetas fechado en S40)', cerca(await v('· atrasado (semanas anteriores, pendiente)', 'S42'), -2600), await celda('· atrasado (semanas anteriores, pendiente)', 'S42'));

console.log('\n=== C · crédito con pago parcial ===');
check('Pago Préstamos S42 = 30.000 (pendiente del vencido, no lo pagado)', (await v('Pago Préstamos - Total', 'S42')) === 30000, await celda('Pago Préstamos - Total', 'S42'));
check('Pago Préstamos S43 = 10.000', (await v('Pago Préstamos - Total', 'S43')) === 10000);

console.log('\n=== G0 · cuadre inicial ===');
const cuadre = async (etq) => {
  const s43 = await v('SALDO ACUM.', 'S43'), sigma = await v('SALDO ACUM.', 'Σ Oct-26');
  const sf = await v('· sin fecha en el mes (neto)', 'Σ Oct-26');
  check(`${etq}: saldo S43 + sin fecha = Σ Oct`, cerca(s43 + sf, sigma), `${s43} + ${sf} vs ${sigma}`);
  const fnS = ['S40', 'S41', 'S42', 'S43'];
  let fechado = 0; for (const c of fnS) fechado += await v('FLUJO NETO', c);
  const fnMes = await v('FLUJO NETO', 'Σ Oct-26');
  check(`${etq}: flujo neto Σ semanas + sin fecha = flujo neto del mes`, cerca(fechado + sf, fnMes), `${fechado} + ${sf} vs ${fnMes}`);
  check(`${etq}: saldo S42 = saldo inicial + atrasado + flujo S42`, cerca(await v('SALDO ACUM.', 'S42'), SALDO_INI + (await v('· atrasado (semanas anteriores, pendiente)', 'S42')) + (await v('FLUJO NETO', 'S42'))));
  return { s43, sigma, sf };
};
const c0 = await cuadre('inicial');

console.log('\n=== D · Seguros a fin de mes (S43) ===');
await escribir('Seguros Exportación', 'S43', 106000);
check('guardado: {_sem3:106000}, sin sin-fecha', JSON.stringify(ov('egr_var::Seguros Exportación')) === JSON.stringify({ _sem3: 106000 }), JSON.stringify(ov('egr_var::Seguros Exportación')));
check('el mes sigue en 106.000', (await v('Seguros Exportación', 'Σ Oct-26')) === 106000 && (await sinFechaLinea('Seguros Exportación')) === 0);
const c1 = await cuadre('tras Seguros');
check('Σ Oct no cambió', cerca(c1.sigma, c0.sigma), `${c0.sigma} → ${c1.sigma}`);
check('S43 baja 106.000 y lo sin fecha sube 106.000', cerca(c1.s43, c0.s43 - 106000) && cerca(c1.sf, c0.sf + 106000));

console.log('\n=== E · distribución parcial ===');
await escribir('Arriendo Oficina', 'S43', 1000);
const oOfi = ov('egr_fijo::Arriendo Oficina');
check('guardado: 1.000 en S43 y el resto sin fecha', oOfi && oOfi._sem3 === 1000 && cerca(oOfi._sinFecha, arrOfi - 1000), JSON.stringify(oOfi));
check('el mes no cambia', (await v('Arriendo Oficina', 'Σ Oct-26')) === arrOfi && cerca(await sinFechaLinea('Arriendo Oficina'), arrOfi - 1000));
const c2 = await cuadre('tras parcial');
check('Σ Oct no cambió', cerca(c2.sigma, c0.sigma));

console.log('\n=== F · recarga ===');
const antes = JSON.stringify(leerFila(store, 'finanzas').finanzas_real);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await abrirFlujo('semanal');
check('el dato guardado no cambió', JSON.stringify(leerFila(store, 'finanzas').finanzas_real) === antes);
const c3 = await cuadre('tras recarga');
check('mismos saldos tras recargar', cerca(c3.s43, c2.s43) && cerca(c3.sigma, c2.sigma));

console.log('\n=== G · mensual y Excel ===');
await abrirFlujo('mensual');
const mensualOct = await v('SALDO ACUM.', 'Oct-26');
check('saldo mensual Oct = Σ Oct semanal', cerca(mensualOct, c3.sigma), `${mensualOct} vs ${c3.sigma}`);
{
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }),
    page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
  const arch = path.join(OUT, 'semanal-fechas.xlsx'); await dl.saveAs(arch);
  const rec = recalcular(arch, OUT);
  const ws = rec.wb.Sheets[EMP];
  const refs = Object.keys(ws).filter(k => k[0] !== '!');
  const col = refs.find(k => ws[k].v === 'Oct-26' && /^[A-Z]+3$/.test(k)).replace(/\d+$/, '');
  const fila = (et) => refs.find(k => /^A\d+$/.test(k) && String(ws[k].v).trim() === et)?.slice(1);
  const x = (et) => ws[`${col}${fila(et)}`]?.v;
  check('Excel Seguros Oct = 106.000', x('Seguros Exportación') === 106000, `${x('Seguros Exportación')}`);
  check('Excel Arriendo Oficina Oct = mensual', cerca(x('Arriendo Oficina'), arrOfi));
  check('Excel saldo final Oct = pantalla', cerca(x('(=) Saldo final caja'), mensualOct), `${x('(=) Saldo final caja')} vs ${mensualOct}`);
}

console.log('\n=== H · total del mes (vista mensual) conserva la semana fechada ===');
// las secciones se pliegan/despliegan con un clic: asegurar que la fila esté visible
if ((await celda('Seguros Exportación', 'Oct-26')) == null) { await page.getByText(/^.*egresos operacionales/i).first().click(); await page.waitForTimeout(400); }
await escribir('Seguros Exportación', 'Oct-26', 120000);
check('guardado: S43 se conserva y 14.000 quedan sin fecha', JSON.stringify(ov('egr_var::Seguros Exportación')) === JSON.stringify({ _sem3: 106000, _sinFecha: 14000 }), JSON.stringify(ov('egr_var::Seguros Exportación')));
await abrirFlujo('semanal');
if ((await celda('Seguros Exportación', 'S43')) == null) { await page.getByText(/^.*egresos operacionales/i).first().click(); await page.waitForTimeout(400); }
check('S43 sigue con 106.000 y marca «est.» (fecha estimada)', (await v('Seguros Exportación', 'S43')) === 106000 && /est\./.test(await celda('Seguros Exportación', 'S43') || ''));
check('Σ = 120.000 con «sin fecha 14.000»', (await v('Seguros Exportación', 'Σ Oct-26')) === 120000 && (await sinFechaLinea('Seguros Exportación')) === 14000);
const c4 = await cuadre('tras total mensual');
check('Σ Oct baja exactamente 14.000', cerca(c4.sigma, c3.sigma - 14000), `${c3.sigma} → ${c4.sigma}`);

check('sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
check('0 peticiones escapadas a producción', escapadas.length === 0);
await browser.close();
console.log(fallos ? `\n✗ ${fallos} falla(s)` : '\n✓ todo OK');
process.exit(fallos ? 1 : 0);
