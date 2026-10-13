/* ─────────────────────────────────────────────────────────────────────────
   CEREZAS SIN KILOS/FOB Y CIRUELAS CON DATOS FALTANTES — pantalla y Excel
   (individual y consolidado), en el navegador. DATOS SINTÉTICOS.

   Cerezas 2026-2027 sin kilos ni FOB, con un programa de cliente (cuota
   vigente de 80.000 en Nov-26): la app y el Excel recalculado proyectan la
   cuota, y el aviso dice qué falta y qué no se proyecta. Ciruelas 2027-2028
   como hoy en producción (850.000 kg, FOB 4,5, sin meses ni costos): efecto 0
   y aviso de faltantes.

   Producción no se toca: Supabase está interceptado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
const DIR = path.join(OUT, 'frutas-sin-volumen');
fs.mkdirSync(DIR, { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

const EMP = 'Allegria Foods';
const vacia = (kg, fob, desc) => ({ kg, fob_usd_kg: fob, desc_exp_pct: desc, mat_usd_kg: 0, srv_usd_kg: 0,
  mes_liquidacion: '', mes_saldo_productor: '', anticipos_cliente: [], anticipos_productor: [],
  dist_mat: [], dist_srv: [], programas: [], saldos_favor: [] });
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.allegria_params = {
  '2026-2027': {
    cerezas: { ...vacia(0, 0, 8), programas: [{ id: 'pc1', lado: 'cliente', contraparte: 'Cliente Sintético', kilos: 0, v: 2,
      cuotas: [{ id: 'cc1', mes: 'Nov-26', modalidad: 'monto', monto: 80000, estado: 'vigente', v: 2, realizaciones: [], sustituye: [] }] }] },
    ciruelas: vacia(0, 0, 8),
  },
  '2027-2028': { cerezas: vacia(0, 0, 8), ciruelas: vacia(850000, 4.5, 6) },
};
store.finanzas.value = fin;

const { browser, page } = await abrirApp(store);
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
const descargar = async (boton, nombre) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), boton.click()]);
  const arch = path.join(DIR, nombre); await dl.saveAs(arch); return arch;
};

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, EMP);

console.log('\n=== Parámetros: avisos en pantalla ===');
await subTab(page, /Parámetros/);
for (const [temp, fruta, testid, re] of [
  ['Temporada 2026-2027', /Cerezas$/, 'aviso-cerezas-sin-volumen', /Cerezas 2026-2027: faltan kilos y FOB US\$\/kg\. Se proyectan: programas por contraparte, saldos a favor\./],
  ['Temporada 2027-2028', /Ciruelas$/, 'diagnostico-ciruelas', /Ciruelas 2027-2028: faltan materiales US\$\/kg · servicios de packing US\$\/kg · mes de liquidación del cliente · mes de saldo al productor/],
]) {
  const b = page.getByRole('button', { name: temp });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(900); }
  const f = page.getByRole('button', { name: fruta });
  if (await f.count()) { await f.first().click(); await page.waitForTimeout(900); }
  const t = (await page.locator(`[data-testid="${testid}"]`).allInnerTexts()).join(' | ');
  check(`${temp}: ${testid}`, re.test(t), t.slice(0, 220));
}

console.log('\n=== Excel de la empresa (recalculado) ===');
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);
{
  const arch = await descargar(page.getByRole('button', { name: /📥 Excel/ }).first(), 'empresa.xlsx');
  const rec = recalcular(arch, DIR);
  const ws = rec.wb.Sheets[EMP];
  const refs = Object.keys(ws).filter(k => k[0] !== '!');
  const col = (m) => refs.find(k => ws[k].v === m && /^[A-Z]+3$/.test(k))?.replace(/\d+$/, '');
  const fila = (et) => refs.find(k => /^A\d+$/.test(k) && String(ws[k].v).trim() === et)?.slice(1);
  const v = (et, m) => Number(ws[`${col(m)}${fila(et)}`]?.v ?? 0);
  check('Excel: Anticipo Cerezas Nov-26 = 80.000 (antes 0)', v('Anticipo Cerezas', 'Nov-26') === 80000, `${v('Anticipo Cerezas', 'Nov-26')}`);
  const sumaFila = (et) => fila(et) ? refs.filter(k => k.endsWith(fila(et)) && /^[B-Z][A-Z]?\d+$/.test(k) && typeof ws[k].v === 'number').reduce((a, k) => a + ws[k].v, 0) : 0;
  check('Excel: ciruelas sin efecto (costo, materiales y servicios en 0)',
    ['Costo Fruta Ciruelas', 'Materiales Ciruelas', 'Servicios de Packing Ciruelas'].every(et => Math.abs(sumaFila(et)) < 0.01));
  const ts = rec.wb.SheetNames.flatMap(nm => Object.values(rec.wb.Sheets[nm]).filter(c => c && typeof c.v === 'string').map(c => c.v));
  check('Excel: aviso de cerezas sin volumen', ts.some(t => t.includes('Cerezas 2026-2027: faltan kilos y FOB')));
  check('Excel: aviso de faltantes de ciruelas', ts.some(t => t.includes('Ciruelas 2027-2028: faltan')));
}

console.log('\n=== Excel consolidado ===');
{
  await page.getByRole('button', { name: /🏛 Consolidado/ }).first().click();
  await page.waitForTimeout(2500);
  const arch = await descargar(page.getByRole('button', { name: /📥 Excel \(flujo completo\)/ }).first(), 'consolidado.xlsx');
  const rec = recalcular(arch, DIR);
  const ts = rec.wb.SheetNames.flatMap(nm => Object.values(rec.wb.Sheets[nm]).filter(c => c && typeof c.v === 'string').map(c => c.v));
  check('consolidado: aviso de cerezas sin volumen', ts.some(t => t.includes('Cerezas 2026-2027: faltan kilos y FOB')));
  check('consolidado: aviso de faltantes de ciruelas', ts.some(t => t.includes('Ciruelas 2027-2028: faltan')));
}

check('sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
check('0 peticiones escapadas a producción', escapadas.length === 0);
await browser.close();
console.log(fallos ? `\n✗ ${fallos} falla(s)` : '\n✓ todo OK');
process.exit(fallos ? 1 : 0);
