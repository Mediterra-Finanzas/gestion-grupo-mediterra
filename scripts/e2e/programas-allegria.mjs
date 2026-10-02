/* ─────────────────────────────────────────────────────────────────────────
   ALLEGRIA FOODS · programas comerciales por contraparte.

   Comprueba en la app real, contra un Supabase aislado:
     1. que un programa REGISTRADO no cambie ninguna proyección;
     2. que al ACTIVARLO el lado deje de usar la estimación de la temporada
        y pase a proyectar el calendario del programa + el presupuesto que
        no quedó en ningún programa;
     3. que el otro lado no se mueva (las asignaciones son independientes);
     4. que el Excel descargado con el botón de la app, RECALCULADO de
        verdad con LibreOffice, traiga los mismos importes;
     5. que todo sobreviva a una recarga.

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
// precio neto productor = 3×0,9 − 0,4 − 1,0 = 1,3 → costo 650.000
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.allegria_params = { '2026-2027': { cerezas: {
  kg: 500000, fob_usd_kg: 3, desc_exp_pct: 10, mat_usd_kg: 0.4, srv_usd_kg: 1.0,
  anticipos_cliente: [{ id: 'a1', mes: 'Oct-26', usd_kg: 0.10,
                        realizaciones: [{ id: 'r1', fecha: '2026-08-10', usd: 20000 }] }],
  mes_liquidacion: 'Mar-27',
  anticipos_productor: [{ id: 'b1', mes: 'Oct-26', usd_kg: 0.10, realizaciones: [] }],
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
page.on('dialog', d => d.accept().catch(() => {}));
page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 180)); fallos++; });

const texto = async () => await page.locator('body').innerText();

async function irAParametros() {
  await subTab(page, /Parámetros/);
  const t = page.getByRole('button', { name: 'Temporada 2026-2027' });
  if (await t.count()) { await t.first().click(); await page.waitForTimeout(700); }
}

// ── Lectura del flujo ─────────────────────────────────────────────
async function desplegarTodo() {
  for (let v = 0; v < 12; v++) {
    let abrio = false;
    for (const fila of await page.locator('table').first().locator('tr').all()) {
      const c = fila.locator('th,td').first();
      const t = (await c.innerText().catch(() => '')).replace(/\n/g, ' ');
      if (/▶.*\(\d+\s*líneas?\)/.test(t)) { await c.click(); await page.waitForTimeout(400); abrio = true; break; }
    }
    if (!abrio) break;
  }
  await page.waitForTimeout(600);
}
async function leerLinea(etiqueta, meses) {
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1200);
  await desplegarTodo();
  const tabla = page.locator('table').first();
  const encab = (await tabla.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(s => s.trim());
  let fila = null;
  for (const f of await tabla.locator('tr').all()) {
    const et = (await f.locator('th,td').first().innerText().catch(() => '')).replace(/\n/g, ' ').trim();
    if (et.includes(etiqueta)) { fila = f; break; }
  }
  if (!fila) throw new Error(`No encontré la fila «${etiqueta}» en el flujo`);
  const out = {};
  for (const m of meses) {
    const c = encab.indexOf(m);
    out[m] = c < 0 ? null : num((await fila.locator('th,td').nth(c).innerText()).split('\n')[0].trim());
  }
  return out;
}

const MESES = ['Oct-26', 'Nov-26', 'Mar-27'];

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');

// ── 0 · línea base: la estimación de la temporada ─────────────────
console.log('\n=== 0 · estimación de la temporada (sin programas) ===');
const base = await leerLinea('Anticipo Cerezas', MESES);
console.log('  pantalla →', JSON.stringify(base));
check('Oct-26 proyecta el pendiente estimado (30.000)', base['Oct-26'] === 30000, String(base['Oct-26']));
check('Mar-27 liquida 1.450.000', base['Mar-27'] === 1450000, String(base['Mar-27']));
const costoBase = await leerLinea('Costo Fruta Exportación', MESES);
console.log('  costo →', JSON.stringify(costoBase));

// ── 1 · cargar un programa de cliente (registrado, sin activar) ────
console.log('\n=== 1 · programa registrado: no cambia nada ===');
await irAParametros();
await page.waitForTimeout(600);
const colCli = page.locator('xpath=//span[contains(text(),"Programas de venta")]/ancestor::div[2]');
await colCli.getByRole('button', { name: /\+ Agregar programa/ }).first().click();
await page.waitForTimeout(600);

const tarjeta = colCli.locator('xpath=.//input[@placeholder="cliente"]/ancestor::div[2]').first();
await colCli.locator('input[placeholder="cliente"]').first().fill('Cliente Sintético A');
await page.waitForTimeout(300);
// desplegar la tarjeta
await tarjeta.getByRole('button', { name: '▸' }).first().click();
await page.waitForTimeout(500);

const ponerCampo = async (etiqueta, valor) => {
  const el = page.locator(`xpath=//div[normalize-space(text())="${etiqueta}"]/following::input[1]`).first();
  await el.click(); await page.waitForTimeout(80);
  await el.fill(String(valor));
  await el.evaluate(e => e.blur());
  await page.waitForTimeout(250);
};
await ponerCampo('Kilos del programa', 200000);
await ponerCampo('US$/kg de venta', 3.2);
await page.locator('xpath=//div[normalize-space(text())="Mes liquidación"]/following::select[1]')
  .first().selectOption('Mar-27');
await page.waitForTimeout(400);

await tarjeta.getByRole('button', { name: /\+ Agregar anticipo al calendario/ }).first().click();
await page.waitForTimeout(500);
const filaAnt = tarjeta.locator('xpath=.//input[@type="date"]/ancestor::div[2]').first();
await filaAnt.locator('input[type=date]').first().fill('2026-11-15');
await filaAnt.locator('select').first().selectOption('Nov-26');          // mes de flujo
await page.waitForTimeout(200);
await filaAnt.locator('select').nth(1).selectOption('usd_kg');           // modalidad
await page.waitForTimeout(300);
const tasa = filaAnt.locator('input[inputmode=decimal]').first();
await tasa.click(); await page.waitForTimeout(80);
await tasa.fill('0.5'); await tasa.evaluate(e => e.blur());
await page.waitForTimeout(600);

await tarjeta.getByRole('button', { name: /Registrar cobro recibido/ }).first().click();
await page.waitForTimeout(400);
await tarjeta.locator('input[type=date]').nth(1).fill('2026-08-01');
await tarjeta.locator('input[placeholder="US$"]').first().fill('40000');
await tarjeta.locator('input[placeholder="referencia / cartola"]').first().fill('QA programa');
await tarjeta.getByRole('button', { name: 'Guardar' }).first().click();
await page.waitForTimeout(1200);

const t1 = await texto();
check('acordado del anticipo = 0,5 × 200.000 kg del programa', /Acordado\s*\$100,000/.test(t1),
      (t1.match(/Acordado\s*\$[\d,]+/g) || []).join(' | '));
check('cobrado 40.000 · pendiente 60.000', /Cobrado\s*\$40,000/.test(t1) && /Pendiente\s*\$60,000/.test(t1));
check('venta del programa 640.000 (no el presupuesto)', /\$640,000/.test(t1));
check('liquidación del programa 540.000', /\$540,000/.test(t1));
check('la pantalla avisa que el flujo sigue con la estimación',
      /El flujo sigue con la estimación de la fruta/.test(t1));
await page.screenshot({ path: `${OUT}/programas/01-registrado.png`, fullPage: true });

const registrado = await leerLinea('Anticipo Cerezas', MESES);
check('registrar no cambia el flujo', JSON.stringify(registrado) === JSON.stringify(base),
      `${JSON.stringify(registrado)} vs ${JSON.stringify(base)}`);

// ── 2 · activar el programa ───────────────────────────────────────
console.log('\n=== 2 · activar: reemplaza la estimación de ese lado ===');
await irAParametros();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Activar en el cálculo/ }).first().click();
await page.waitForTimeout(1200);
const t2 = await texto();
check('la pantalla dice que el lado calcula con programas',
      /se calcula con 1 programa\(s\) activo\(s\)/.test(t2));
check('avisa que las filas estimadas ya no alimentan el flujo',
      /Estas filas ya no alimentan el flujo/.test(t2));
await page.screenshot({ path: `${OUT}/programas/02-activado.png`, fullPage: true });

const activo = await leerLinea('Anticipo Cerezas', MESES);
console.log('  pantalla →', JSON.stringify(activo));
check('Oct-26 ya no proyecta la estimación', activo['Oct-26'] === 0, String(activo['Oct-26']));
check('Nov-26 proyecta el pendiente del programa (60.000)', activo['Nov-26'] === 60000, String(activo['Nov-26']));
check('Mar-27 = 540.000 liquidación + 860.000 presupuesto sin programa',
      activo['Mar-27'] === 1400000, String(activo['Mar-27']));

// ── 3 · el otro lado no se movió ──────────────────────────────────
const costoDespues = await leerLinea('Costo Fruta Exportación', MESES);
check('el lado productor quedó igual', JSON.stringify(costoDespues) === JSON.stringify(costoBase),
      `${JSON.stringify(costoDespues)} vs ${JSON.stringify(costoBase)}`);

// ── 4 · Excel descargado por la app y RECALCULADO ─────────────────
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
  const esperado = activo[m];
  check(`Excel ${m} = pantalla (${esperado})`, Math.round(v || 0) === esperado, `${v} vs ${esperado}`);
});
// La hoja Parametros trae el desglose por contraparte
const wsP = rec.wb.Sheets['Parametros'];
const textosP = Object.keys(wsP).filter(k => /^[A-Z]+\d+$/.test(k)).map(k => wsP[k]?.v).filter(v => typeof v === 'string');
check('la hoja Parametros nombra la contraparte', textosP.some(t => t.includes('Cliente Sintético A')));
check('y separa el presupuesto sin programa', textosP.some(t => t.includes('Presupuesto sin programa')));

// ── 5 · recarga ───────────────────────────────────────────────────
console.log('\n=== 5 · recarga ===');
await page.waitForTimeout(2500);
const guardado = leerFila(store, 'finanzas')?.allegria_params?.['2026-2027']?.cerezas?.programas?.[0];
check('el programa quedó guardado', !!guardado && guardado.contraparte === 'Cliente Sintético A' &&
      guardado.activo === true && Number(guardado.kilos) === 200000, JSON.stringify(guardado?.contraparte));
check('con su realización', Number(guardado?.anticipos?.[0]?.realizaciones?.[0]?.usd) === 40000);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
const tras = await leerLinea('Anticipo Cerezas', MESES);
check('tras recargar, el flujo es idéntico', JSON.stringify(tras) === JSON.stringify(activo),
      `${JSON.stringify(tras)} vs ${JSON.stringify(activo)}`);
await page.screenshot({ path: `${OUT}/programas/03-recarga.png`, fullPage: true });

await browser.close();
console.log(`\npeticiones escapadas a producción: ${escapadas.length}`);
console.log(fallos === 0
  ? 'OK: los programas reemplazan la estimación solo al activarlos y el Excel lo refleja'
  : `${fallos} FALLA(S)`);
process.exit(fallos || escapadas.length ? 1 : 0);
