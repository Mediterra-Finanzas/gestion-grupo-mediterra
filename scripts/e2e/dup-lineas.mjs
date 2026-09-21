/* ─────────────────────────────────────────────────────────────────────────
   ETIQUETAS REPETIDAS — verificación en el navegador.

   Allpa Farms tiene el mismo concepto en dos categorías ("Electricidad" está
   en Egresos Operacionales y en Costos Fijos). Esta prueba:
     1. lee el valor que cada una de las dos filas muestra en pantalla;
     2. escribe un override DISTINTO en cada una y comprueba que ninguna
        contagia a la otra;
     3. descarga el Excel, lo recalcula con LibreOffice y comprueba que cada
        fila del archivo lleva el valor de SU línea.

   Supabase queda interceptado por el store en memoria: producción no se toca.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
const EMPRESA = process.env.EMPRESA || 'Allpa Farms';
const ETIQUETA = process.env.ETIQUETA || 'Electricidad';
const MES = process.env.MES || 'May-26';
fs.mkdirSync(path.join(OUT, 'dup'), { recursive: true });

let fallos = 0;
const check = (n, cond, extra = '') => { console.log(`${cond ? '✓' : '✗ FALLA'}  ${n}${extra ? '  — ' + extra : ''}`); if (!cond) fallos++; };

const store = nuevoStore();
const escapadas = [];
const { browser, page } = await abrirApp(store);
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 80));
});
page.on('dialog', d => d.accept().catch(() => {}));

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, EMPRESA);
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);

// Desplegar TODAS las categorías. Cada clic reconstruye la tabla, así que se
// vuelve a buscar desde cero hasta que no quede ninguna plegada.
for (let vuelta = 0; vuelta < 10; vuelta++) {
  let abrio = false;
  const filas = await page.locator('table').first().locator('tr').all();
  for (const fila of filas) {
    const c = fila.locator('th,td').first();
    const t = (await c.innerText().catch(() => '')).replace(/\n/g, ' ');
    if (/▶.*\(\d+\s*líneas?\)/.test(t)) { await c.click(); await page.waitForTimeout(500); abrio = true; break; }
  }
  if (!abrio) break;
}
await page.waitForTimeout(800);

const tabla = page.locator('table').first();
const encab = (await tabla.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(t => t.trim());
const col = encab.indexOf(MES);
check(`columna ${MES} encontrada`, col > 0, `col=${col}`);

// filas con la etiqueta repetida
const filasDup = [];
for (const fila of await tabla.locator('tr').all()) {
  const et = (await fila.locator('th,td').first().innerText().catch(() => '')).replace(/\n/g, ' ').trim();
  if (et === ETIQUETA) filasDup.push(fila);
}
check(`"${ETIQUETA}" aparece en dos categorías`, filasDup.length === 2, `${filasDup.length} filas`);
if (filasDup.length !== 2) { await browser.close(); process.exit(1); }

const leer = async (f) => num((await f.locator('th,td').nth(col).innerText()).split('\n')[0].trim());
const antes = [await leer(filasDup[0]), await leer(filasDup[1])];
console.log(`  pantalla ${MES}: fila 1 = ${antes[0]} · fila 2 = ${antes[1]}`);
check('las dos filas muestran valores propios (no el mismo)', antes[0] !== antes[1], `${antes[0]} vs ${antes[1]}`);
await page.screenshot({ path: `${OUT}/dup/01-pantalla.png`, fullPage: true });

// ── editar cada una con un valor distinto ──
const NUEVOS = [11111, 22222];
for (let i = 0; i < 2; i++) {
  const celda = filasDup[i].locator('th,td').nth(col);
  const span = celda.locator('span').first();
  await span.click();
  await page.waitForTimeout(350);
  const inp = page.locator('table input[type=text]').first();
  await inp.fill(String(NUEVOS[i]));
  await inp.press('Enter');
  await page.waitForTimeout(1000);
}
const despues = [await leer(filasDup[0]), await leer(filasDup[1])];
console.log(`  tras editar: fila 1 = ${despues[0]} · fila 2 = ${despues[1]}`);
check('cada fila conserva SU valor manual', despues[0] === NUEVOS[0] && despues[1] === NUEVOS[1],
      `${despues[0]} / ${despues[1]}`);
await page.screenshot({ path: `${OUT}/dup/02-editadas.png`, fullPage: true });

// ── el Excel debe reflejar lo mismo ──
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.getByRole('button', { name: /📥 Excel/ }).first().click(),
]);
const arch = path.join(OUT, 'dup', 'empresa.xlsx');
await dl.saveAs(arch);
const rec = recalcular(arch, path.join(OUT, 'dup'));
const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
const colX = Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === MES).replace(/\d+$/, '');
const filasX = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === ETIQUETA).map(k => Number(k.slice(1)));
const valsX = filasX.map(f => ws[`${colX}${f}`]?.v).sort((a, b) => a - b);
console.log(`  Excel recalculado (${rec.formulasBorradas} fórmulas sin caché): ${valsX.join(' / ')}`);
check('el Excel trae las dos filas con sus valores propios',
      valsX.length === 2 && valsX[0] === NUEVOS[0] && valsX[1] === NUEVOS[1], valsX.join(' / '));

await browser.close();
console.log(`peticiones escapadas a producción: ${escapadas.length}`);
console.log(fallos === 0 ? '\nOK: las líneas homónimas son independientes en pantalla y en Excel' : `\n${fallos} FALLA(S)`);
process.exit(fallos || escapadas.length ? 1 : 0);
