/* ─────────────────────────────────────────────────────────────────────────
   AVISOS DE CRÉDITOS EN EL EXCEL (D2) — en el navegador.

   La pantalla del flujo avisa los créditos que NO entran (sin tipo de cambio)
   y las cuotas vencidas por conciliar; hasta c9c5792 el Excel no lo decía.
   Con un crédito sintético en CLP sin TC y uno en USD con una cuota vencida
   sin pago, comprueba que el aviso esté en pantalla, en el Excel de la empresa
   y en el consolidado.

   Producción no se toca: Supabase está interceptado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'avisos-cred'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

const EMP = 'Allegria Foods';
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.creditos_data = [
  { uid: 'S1', n: 901, empresa: EMP, acreedor: 'Banco Sintético CLP', moneda: 'CLP', monto: 50000000,
    f_venc: '2027-03-15', cuota: 50000000, tipo_cr: 'Capital de Trabajo', pagado: false },
  { uid: 'V1', n: 902, empresa: EMP, acreedor: 'Banco Sintético USD', moneda: 'USD', monto: 70000,
    f_venc: '2026-05-15', cuota: 70000, tipo_cr: 'Capital de Trabajo', pagado: false },
];
store.finanzas.value = fin;

const { browser, page } = await abrirApp(store);
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});
page.on('dialog', d => d.accept().catch(() => {}));

const textosHoja = (arch, dir) => {
  const rec = recalcular(arch, dir);
  return rec.wb.SheetNames.flatMap(nm => Object.values(rec.wb.Sheets[nm]).filter(c => c && typeof c.v === 'string').map(c => c.v));
};
const descargar = async (boton, nombre) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), boton.click()]);
  const arch = path.join(OUT, 'avisos-cred', nombre);
  await dl.saveAs(arch);
  return arch;
};
const tieneSinTC = (ts) => ts.some(t => /sin tipo de cambio/i.test(t) && t.includes('Banco Sintético CLP'));
const tienePorConciliar = (ts) => ts.some(t => /por conciliar/i.test(t) && t.includes('Banco Sintético USD'));

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, EMP);
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);

const pantalla = await page.locator('body').innerText();
check('pantalla: crédito sin TC avisado', /sin tipo de cambio/i.test(pantalla) && pantalla.includes('Banco Sintético CLP'));
check('pantalla: cuota por conciliar avisada', /por conciliar/i.test(pantalla) && pantalla.includes('Banco Sintético USD'));

{
  const arch = await descargar(page.getByRole('button', { name: /📥 Excel/ }).first(), 'empresa.xlsx');
  const ts = textosHoja(arch, path.join(OUT, 'avisos-cred'));
  check('Excel de la empresa: crédito sin TC avisado', tieneSinTC(ts));
  check('Excel de la empresa: cuota por conciliar avisada', tienePorConciliar(ts));
}

{
  await page.getByRole('button', { name: /🏛 Consolidado/ }).first().click();
  await page.waitForTimeout(2500);
  const arch = await descargar(page.getByRole('button', { name: /📥 Excel \(flujo completo\)/ }).first(), 'consolidado.xlsx');
  const ts = textosHoja(arch, path.join(OUT, 'avisos-cred'));
  check('Excel consolidado: crédito sin TC avisado', tieneSinTC(ts));
  check('Excel consolidado: cuota por conciliar avisada', tienePorConciliar(ts));
}

check('0 peticiones escapadas a producción', escapadas.length === 0, escapadas.slice(0, 3).join(' · '));
await browser.close();
console.log(fallos ? `\n✗ ${fallos} falla(s)` : '\n✓ todo OK');
process.exit(fallos ? 1 : 0);
