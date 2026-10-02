/* ─────────────────────────────────────────────────────────────────────────
   ALLEGRIA FOODS · liquidación con estimaciones, programas y cobros reales.

   Comprueba en la app real, contra un Supabase aislado:
     1. la estimación sola proyecta su pendiente y liquida el resto;
     2. una cuota vigente sustituye estimación SOLO por el monto declarado;
     3. registrar un cobro pregunta si estaba incluido en el acuerdo y lo
        saca del flujo futuro sin mover la liquidación;
     4. el Excel descargado con el botón de la app, RECALCULADO de verdad
        con LibreOffice, trae los mismos importes en los tres meses;
     5. todo sobrevive a una recarga.

   DATOS SINTÉTICOS. Producción no se toca: Supabase está interceptado.

   Uso:
     CI=true npx react-scripts build
     (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/e2e-programas node scripts/e2e/programas-allegria.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'programas'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

// ── Store sintético ───────────────────────────────────────────────
// venta presupuesto 500.000 kg × US$3 = 1.500.000
// estimación cliente: 0,20 US$/kg → 100.000 en Nov-26, con 20.000 ya cobrados
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.allegria_params = { '2026-2027': { cerezas: {
  kg: 500000, fob_usd_kg: 3, desc_exp_pct: 10, mat_usd_kg: 0.4, srv_usd_kg: 1.0,
  anticipos_cliente: [{ id: 'e1', mes: 'Nov-26', usd_kg: 0.20,
                        realizaciones: [{ id: 'r1', fecha: '2026-08-10', usd: 20000 }] }],
  mes_liquidacion: 'Mar-27',
  anticipos_productor: [{ id: 'ep', mes: 'Nov-26', usd_kg: 0.10, realizaciones: [] }],
  mes_saldo_productor: 'Mar-27',
  dist_mat: [], dist_srv: [], programas: [],
} } };
store.finanzas.value = fin;

const { browser, page } = await abrirApp(store);
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});
// Las confirmaciones se aceptan: en el registro del cobro, aceptar = "estaba
// incluido en el total acordado".
page.on('dialog', d => d.accept().catch(() => {}));
page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 180)); fallos++; });

const texto = async () => await page.locator('body').innerText();
const esperar = (ms) => page.waitForTimeout(ms);

async function irAParametros() {
  await subTab(page, /Parámetros/);
  const t = page.getByRole('button', { name: 'Temporada 2026-2027' });
  if (await t.count()) { await t.first().click(); await esperar(700); }
}
async function desplegarTodo() {
  for (let v = 0; v < 12; v++) {
    let abrio = false;
    for (const fila of await page.locator('table').first().locator('tr').all()) {
      const c = fila.locator('th,td').first();
      const t = (await c.innerText().catch(() => '')).replace(/\n/g, ' ');
      if (/▶.*\(\d+\s*líneas?\)/.test(t)) { await c.click(); await esperar(400); abrio = true; break; }
    }
    if (!abrio) break;
  }
  await esperar(600);
}
const MESES = ['Oct-26', 'Nov-26', 'Mar-27'];
async function leerLinea(etiqueta) {
  await subTab(page, /Flujo de Caja/);
  await esperar(1200);
  await desplegarTodo();
  const tabla = page.locator('table').first();
  const encab = (await tabla.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(s => s.trim());
  let fila = null;
  for (const f of await tabla.locator('tr').all()) {
    const et = (await f.locator('th,td').first().innerText().catch(() => '')).replace(/\n/g, ' ').trim();
    if (et.includes(etiqueta)) { fila = f; break; }
  }
  if (!fila) throw new Error(`No encontré la fila «${etiqueta}»`);
  const out = {};
  for (const m of MESES) {
    const c = encab.indexOf(m);
    out[m] = c < 0 ? null : num((await fila.locator('th,td').nth(c).innerText()).split('\n')[0].trim());
  }
  return out;
}

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');

// ── 0 · estimación sola ───────────────────────────────────────────
console.log('\n=== 0 · estimación sola ===');
const base = await leerLinea('Anticipo Cerezas');
console.log('  pantalla →', JSON.stringify(base));
check('Nov-26 proyecta el pendiente de la estimación (80.000)', base['Nov-26'] === 80000, String(base['Nov-26']));
check('Mar-27 liquida 1.400.000', base['Mar-27'] === 1400000, String(base['Mar-27']));
const costoBase = await leerLinea('Costo Fruta Exportación');

await irAParametros();
await esperar(800);
const t0 = await texto();
check('el panel muestra el saldo total por cobrar (1.480.000)', /Saldo total por cobrar\s*\$1,480,000/.test(t0),
      (t0.match(/Saldo total por cobrar[^\n]*/) || [])[0]);
check('y la liquidación final proyectada', /Liquidación final proyectada \(Mar-27\)\s*\$1,400,000/.test(t0));

// ── 1 · cargar un cliente con una cuota que sustituye 30.000 ──────
console.log('\n=== 1 · cliente con cuota vigente que sustituye 30.000 ===');
const colCli = page.locator('xpath=//span[normalize-space(text())="Clientes"]/ancestor::div[2]').first();
await colCli.getByRole('button', { name: /\+ Agregar cliente/ }).first().click();
await esperar(700);
const tarjeta = colCli.locator('xpath=.//input[@placeholder="cliente"]/ancestor::div[2]').first();
await colCli.locator('input[placeholder="cliente"]').first().fill('Cliente Sintético A');
await esperar(400);

const ponerCampo = async (etiqueta, valor) => {
  const el = page.locator(`xpath=//div[normalize-space(text())="${etiqueta}"]/following::input[1]`).first();
  await el.click(); await esperar(80);
  await el.fill(String(valor));
  await el.evaluate(e => e.blur());
  await esperar(300);
};
await ponerCampo('Kilos del programa', 200000);

await tarjeta.getByRole('button', { name: /\+ Agregar cuota al calendario/ }).first().click();
await esperar(600);
const filaCuota = tarjeta.locator('xpath=.//input[@type="date"]/ancestor::div[2]').first();
await filaCuota.locator('input[type=date]').first().fill('2026-10-15');
await filaCuota.locator('select').nth(0).selectOption('Oct-26');          // mes de flujo
await esperar(200);
await filaCuota.locator('select').nth(1).selectOption('monto');           // modalidad
await esperar(300);
const campoMonto = filaCuota.locator('input[inputmode=decimal]').first();
await campoMonto.click(); await esperar(80);
await campoMonto.fill('40000'); await campoMonto.evaluate(e => e.blur());
await esperar(400);
await filaCuota.locator('select').nth(2).selectOption('vigente');          // estado
await esperar(600);

// monto que sustituye de la estimación
const campoSust = filaCuota.locator('input[inputmode=decimal]').nth(1);
await campoSust.click(); await esperar(80);
await campoSust.fill('30000'); await campoSust.evaluate(e => e.blur());
await esperar(900);

const t1 = await texto();
check('la cuota muestra su total acordado', /Total acordado\s*\$40,000/.test(t1),
      (t1.match(/Total acordado[^\n]*/g) || []).join(' | '));
check('y la estimación queda con 50.000 disponibles', /disponible\s*\$50,000/.test(t1),
      (t1.match(/disponible[^\n]*/g) || []).join(' | '));
await page.screenshot({ path: `${OUT}/programas/01-cuota-vigente.png`, fullPage: true });

const conCuota = await leerLinea('Anticipo Cerezas');
console.log('  pantalla →', JSON.stringify(conCuota));
check('Oct-26 proyecta la cuota (40.000)', conCuota['Oct-26'] === 40000, String(conCuota['Oct-26']));
check('Nov-26 baja a 50.000: solo se sustituyó lo declarado', conCuota['Nov-26'] === 50000, String(conCuota['Nov-26']));
check('Mar-27 liquida 1.390.000', conCuota['Mar-27'] === 1390000, String(conCuota['Mar-27']));
check('el total del lado no cambió', 20000 + conCuota['Oct-26'] + conCuota['Nov-26'] + conCuota['Mar-27'] === 1500000);

// ── 2 · registrar un cobro sobre la cuota (incluido en el acuerdo) ─
console.log('\n=== 2 · cobro de 15.000 incluido en el total acordado ===');
await irAParametros();
await esperar(700);
// Ojo: la columna de estimación tiene un botón con el mismo nombre; hay que
// pinchar el de la tarjeta del programa.
const colCli2 = page.locator('xpath=//span[normalize-space(text())="Clientes"]/ancestor::div[2]').first();
await colCli2.getByRole('button', { name: /\+ Registrar cobro recibido/ }).first().click();
await esperar(500);
const campoRef = page.locator('input[placeholder="referencia / cartola"]').first();
await campoRef.waitFor({ timeout: 15000 });
const formCobro = campoRef.locator('xpath=ancestor::div[1]');
await formCobro.locator('input[type=date]').first().fill('2026-10-05');
await formCobro.locator('input[placeholder="US$"]').first().fill('15000');
await campoRef.fill('QA cobro parcial');
await formCobro.getByRole('button', { name: 'Guardar' }).first().click();
await esperar(1400);

const t2 = await texto();
check('la cuota queda con 15.000 imputados', /Imputado\s*\$15,000/.test(t2),
      (t2.match(/Imputado[^\n]*/g) || []).join(' | '));
check('y el acuerdo no cambió: sigue en 40.000', /Total acordado\s*\$40,000/.test(t2));
await page.screenshot({ path: `${OUT}/programas/02-cobro.png`, fullPage: true });

const conCobro = await leerLinea('Anticipo Cerezas');
console.log('  pantalla →', JSON.stringify(conCobro));
check('Oct-26 baja a 25.000: lo cobrado no se reproyecta', conCobro['Oct-26'] === 25000, String(conCobro['Oct-26']));
check('la liquidación NO se movió', conCobro['Mar-27'] === 1390000, String(conCobro['Mar-27']));
check('Nov-26 intacto', conCobro['Nov-26'] === 50000);

// ── 3 · el lado productor no se movió ─────────────────────────────
const costoFinal = await leerLinea('Costo Fruta Exportación');
check('el lado productor quedó igual', JSON.stringify(costoFinal) === JSON.stringify(costoBase),
      `${JSON.stringify(costoFinal)} vs ${JSON.stringify(costoBase)}`);

// ── 4 · Excel recalculado de verdad ───────────────────────────────
console.log('\n=== 4 · Excel recalculado con LibreOffice ===');
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.getByRole('button', { name: /📥 Excel/ }).first().click(),
]);
const arch = path.join(OUT, 'programas', 'allegria-programas.xlsx');
await dl.saveAs(arch);
const rec = recalcular(arch, path.join(OUT, 'programas'));
const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
const colDe = (mes) => Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === mes)?.replace(/\d+$/, '');
const filaDe = (et) => Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === et).map(k => Number(k.slice(1)))[0];
const fIng = filaDe('Anticipo Cerezas');
console.log(`  (${rec.formulasBorradas} fórmulas sin caché, recalculadas de verdad)`);
MESES.forEach(m => {
  const v = ws[`${colDe(m)}${fIng}`]?.v;
  check(`Excel ${m} = pantalla (${conCobro[m]})`, Math.round(v || 0) === conCobro[m], `${v} vs ${conCobro[m]}`);
});
const wsP = rec.wb.Sheets['Parametros'];
const textosP = Object.keys(wsP).filter(k => /^[A-Z]+\d+$/.test(k)).map(k => wsP[k]?.v).filter(v => typeof v === 'string');
check('la hoja Parametros nombra la contraparte', textosP.some(t => t.includes('Cliente Sintético A')));
check('y separa la estimación', textosP.some(t => t.includes('Estimación')));

// ── 5 · recarga ───────────────────────────────────────────────────
console.log('\n=== 5 · recarga ===');
await esperar(2500);
const guardado = leerFila(store, 'finanzas')?.allegria_params?.['2026-2027']?.cerezas?.programas?.[0];
check('el programa quedó guardado', !!guardado && guardado.contraparte === 'Cliente Sintético A' &&
      Number(guardado.kilos) === 200000, JSON.stringify(guardado?.contraparte));
const cuotaG = guardado?.cuotas?.[0];
check('con su cuota vigente, su sustitución y su cobro',
      cuotaG?.estado === 'vigente' && Number(cuotaG?.sustituye?.[0]?.usd) === 30000 &&
      Number(cuotaG?.realizaciones?.[0]?.usd) === 15000,
      JSON.stringify({ estado: cuotaG?.estado, sust: cuotaG?.sustituye, reas: cuotaG?.realizaciones?.length }));

await page.reload({ waitUntil: 'domcontentloaded' });
await esperar(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
const tras = await leerLinea('Anticipo Cerezas');
check('tras recargar, el flujo es idéntico', JSON.stringify(tras) === JSON.stringify(conCobro),
      `${JSON.stringify(tras)} vs ${JSON.stringify(conCobro)}`);
await page.screenshot({ path: `${OUT}/programas/03-recarga.png`, fullPage: true });

await browser.close();
console.log(`\npeticiones escapadas a producción: ${escapadas.length}`);
console.log(fallos === 0
  ? 'OK: estimación, sustitución parcial y cobro real cuadran en pantalla y en el Excel'
  : `${fallos} FALLA(S)`);
process.exit(fallos || escapadas.length ? 1 : 0);
