/* ─────────────────────────────────────────────────────────────────────────
   ALLPA FARMS CHILE · anticipos por variedad con cobros parciales.

   Comprueba en la app real, contra un Supabase aislado:
     1. que el cobro parcial se registre y se GUARDE;
     2. que la pantalla muestre acordado / cobrado / pendiente y el cuadre;
     3. que el FLUJO proyecte solo el pendiente y la liquidación descuente
        lo realizado;
     4. que el Excel descargado con los botones de la app, RECALCULADO de
        verdad con LibreOffice, traiga los mismos importes;
     5. que todo sobreviva a una recarga.

   Producción no se toca: Supabase está interceptado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'allpa'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

// ── store con una variedad de Allpa: 100.000 kg × US$5, liquida en Mar-27 ──
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.params_af = { '2026-2027': {
  variedades: [{ nombre:'Santina', usd_kg:5, kg_mes:{ 'Nov-26': 100000 }, mes_liq:'Mar-27', anticipos:[] }],
  cosecha: { usd_kg:0, semanas_pago:[] },
  transporte: { costo_persona:0, personas:0, meses_pago:[] } } };
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
page.on('pageerror', e => { console.log('  [pageerror]', String(e).slice(0, 160)); fallos++; });

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allpa Farms');
await subTab(page, /Parámetros/);
await page.waitForTimeout(1200);

// temporada + variedad
const btnTemp = page.getByRole('button', { name: /2026-2027/ }).first();
if (await btnTemp.count()) { await btnTemp.click(); await page.waitForTimeout(600); }
await page.getByRole('button', { name: /Santina/ }).first().click();
const texto = async () => await page.locator('body').innerText();
await page.getByText('Anticipos cliente').first().waitFor({ timeout: 15000 }).catch(()=>{});
check('se abre la variedad', /anticipos cliente/i.test(await texto()));

// ── 1 · agregar anticipo US$1/kg en Oct-26 y registrar un cobro de 60.000 ──
await page.getByRole('button', { name: /\+ Agregar anticipo/ }).first().click();
await page.waitForTimeout(500);
const panelAnt = page.locator('xpath=//div[normalize-space(text())="Anticipos cliente"]/parent::div');
await panelAnt.locator('select').first().selectOption('Oct-26');
await page.waitForTimeout(300);
const campoTasa = panelAnt.locator('input[inputmode=decimal]').first();
await campoTasa.click(); await page.waitForTimeout(80);
await campoTasa.fill('1');
await campoTasa.evaluate(e => e.blur());
await page.waitForTimeout(800);
check('acordado = kg × US$/kg', /Acordado\s*\$100,000/.test(await texto()), (await texto()).match(/Acordado[^\n]*/)?.[0]);

await page.getByRole('button', { name: /Registrar cobro/ }).first().click();
await page.waitForTimeout(400);
await panelAnt.locator('input[type=date]').fill('2026-10-05');
await panelAnt.locator('input[placeholder="US$"]').fill('60000');
await panelAnt.locator('input[placeholder="nota / referencia"]').fill('QA cobro parcial Allpa');
await page.getByRole('button', { name: 'Guardar' }).first().click();
await page.waitForTimeout(1500);

const t1 = await texto();
check('cobrado 60.000',    /Cobrado\s*\$60,000/.test(t1),  t1.match(/Cobrado[^\n]*/)?.[0]);
check('pendiente 40.000',  /Pendiente\s*\$40,000/.test(t1), t1.match(/Pendiente[^\n]*/)?.[0]);
check('queda por cobrar 440.000', /Queda por cobrar:\s*\$440,000/.test(t1), t1.match(/Queda por cobrar[^\n]*/)?.[0]);
check('liquidación 400.000', /Liquidación \(Mar-27\):\s*\$400,000/.test(t1), t1.match(/Liquidación \(Mar-27\)[^\n]*/)?.[0]);
await page.screenshot({ path: `${OUT}/allpa/01-parametros.png`, fullPage: true });

// ── 2 · guardado real en el store ──
const guardado = leerFila(store, 'finanzas')?.params_af?.['2026-2027']?.variedades?.[0];
const ant = guardado?.anticipos?.[0];
check('el anticipo quedó guardado', !!ant && ant.usd_kg === 1 && ant.mes === 'Oct-26');
check('la realización quedó guardada con fecha, monto, nota y usuario',
      !!ant?.realizaciones?.[0] && ant.realizaciones[0].usd === 60000 &&
      ant.realizaciones[0].fecha === '2026-10-05' && !!ant.realizaciones[0].usuario,
      JSON.stringify(ant?.realizaciones?.[0]));

// ── 3 · el flujo proyecta solo el pendiente ──
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);
// Las categorías vienen plegadas: cada clic reconstruye la tabla, así que se
// vuelve a buscar desde cero hasta que no quede ninguna cerrada.
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
await desplegarTodo();
const tabla = page.locator('table').first();
const encab = (await tabla.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(s => s.trim());
const colOct = encab.indexOf('Oct-26'), colMar = encab.indexOf('Mar-27');
check('columnas Oct-26 y Mar-27 encontradas', colOct > 0 && colMar > 0, `${colOct} / ${colMar}`);
let filaIng = null;
for (const fila of await tabla.locator('tr').all()) {
  const et = (await fila.locator('th,td').first().innerText().catch(()=> '')).replace(/\n/g,' ').trim();
  if (/Ingreso Exportación Cerezas/.test(et)) { filaIng = fila; break; }
}
if (!filaIng) {
  const etiquetas = [];
  for (const fila of await tabla.locator('tr').all()) {
    etiquetas.push((await fila.locator('th,td').first().innerText().catch(()=> '')).replace(/\n/g,' ').trim());
  }
  console.log('  etiquetas de la tabla:', etiquetas.filter(Boolean).slice(0, 40).join(' | '));
}
check('fila «Ingreso Exportación Cerezas» encontrada', !!filaIng);
if (!filaIng) { await browser.close(); process.exit(1); }
const leer = async (f, c) => num((await f.locator('th,td').nth(c).innerText()).split('\n')[0].trim());
const pantOct = await leer(filaIng, colOct), pantMar = await leer(filaIng, colMar);
console.log(`  pantalla → Oct-26 ${pantOct} · Mar-27 ${pantMar}`);
check('Oct-26 proyecta solo el pendiente (40.000)', pantOct === 40000, String(pantOct));
check('Mar-27 liquida 400.000',                      pantMar === 400000, String(pantMar));
check('cuadre 60.000 realizados + 440.000 futuros', 60000 + pantOct + pantMar === 500000);
await page.screenshot({ path: `${OUT}/allpa/02-flujo.png`, fullPage: true });

// ── 4 · Excel descargado por la app y RECALCULADO ──
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.getByRole('button', { name: /📥 Excel/ }).first().click(),
]);
const arch = path.join(OUT, 'allpa', 'allpa.xlsx');
await dl.saveAs(arch);
const rec = recalcular(arch, path.join(OUT, 'allpa'));
const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
const colDe = (mes) => Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === mes)?.replace(/\d+$/, '');
const filaDe = (et) => Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === et).map(k => Number(k.slice(1)))[0];
const fIng = filaDe('Ingreso Exportación Cerezas');
const xlOct = ws[`${colDe('Oct-26')}${fIng}`]?.v, xlMar = ws[`${colDe('Mar-27')}${fIng}`]?.v;
console.log(`  Excel recalculado (${rec.formulasBorradas} fórmulas sin caché) → Oct-26 ${xlOct} · Mar-27 ${xlMar}`);
check('Excel Oct-26 = pantalla', Math.round(xlOct) === pantOct, `${xlOct} vs ${pantOct}`);
check('Excel Mar-27 = pantalla', Math.round(xlMar) === pantMar, `${xlMar} vs ${pantMar}`);

// ── 5 · recarga ──
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allpa Farms');
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);
await desplegarTodo();
const tabla2 = page.locator('table').first();
const encab2 = (await tabla2.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(s => s.trim());
let filaIng2 = null;
for (const fila of await tabla2.locator('tr').all()) {
  const et = (await fila.locator('th,td').first().innerText().catch(()=> '')).replace(/\n/g,' ').trim();
  if (/Ingreso Exportación Cerezas/.test(et)) { filaIng2 = fila; break; }
}
const rOct = await leer(filaIng2, encab2.indexOf('Oct-26')), rMar = await leer(filaIng2, encab2.indexOf('Mar-27'));
check('tras recargar, el flujo es idéntico', rOct === pantOct && rMar === pantMar, `${rOct} / ${rMar}`);
await page.screenshot({ path: `${OUT}/allpa/03-recarga.png`, fullPage: true });

await browser.close();
console.log(`peticiones escapadas a producción: ${escapadas.length}`);
console.log(fallos === 0 ? '\nOK: Allpa Chile proyecta el pendiente y el Excel lo refleja' : `\n${fallos} FALLA(S)`);
process.exit(fallos || escapadas.length ? 1 : 0);
