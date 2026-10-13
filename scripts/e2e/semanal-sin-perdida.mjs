/* ─────────────────────────────────────────────────────────────────────────
   VISTA SEMANAL DEL FLUJO — entrar y salir de una celda no borra el mes (D1).

   Defecto (c9c5792): en la vista semanal, hacer clic en una semana vacía («—»)
   y salir guardaba 0 en esa semana, y como el mes suma solo las semanas
   guardadas, el mes completo quedaba en 0 aunque tuviera valor. Sin aviso.

   Con datos sintéticos (store aislado), comprueba en la app real:
     1. clic en una semana vacía y salir → 0 escrituras y el mes intacto;
     2. escribir 1.000 en esa semana → el mes = calculado + 1.000 (antes 1.000),
        lo guardado son las dos semanas;
     3. recarga → igual;
     4. Excel recalculado → la misma cifra que la pantalla.

   Producción no se toca: Supabase está interceptado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'semanal'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

const EMP = 'Allegria Foods', LINEA = 'Arriendo Oficina', MES = 'Oct-26', SEM = 'S42', IDX = 6;

const store = nuevoStore();
const { browser, page } = await abrirApp(store);
const escapadas = [];
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(r.url().slice(0, 70));
});
page.on('dialog', d => d.accept().catch(() => {}));

const abrirFlujo = async () => {
  await entrarFinanzas(page).catch(() => {});   // tras recargar, la app vuelve al módulo abierto
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, EMP);
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /📊 Semanal/ }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText(/costos fijos/i).first().click();   // expandir la sección
  await page.waitForTimeout(800);
};

// Celda de la fila `etiqueta` bajo la columna cuyo encabezado es `col`
// (se ubica por posición horizontal, no por índice: hay encabezados agrupados).
const celda = async (etiqueta, col) => page.evaluateHandle(([etiqueta, col]) => {
  const tablas = [...document.querySelectorAll('table')];
  for (const t of tablas) {
    const th = [...t.querySelectorAll('thead th')].find(x => x.innerText.trim() === col);
    if (!th) continue;
    const fila = [...t.querySelectorAll('tbody tr')].find(tr => tr.cells[0] && tr.cells[0].innerText.trim().split('\n')[0].trim() === etiqueta);
    if (!fila) continue;
    const r = th.getBoundingClientRect(); const cx = r.left + r.width / 2;
    return [...fila.cells].find(td => { const q = td.getBoundingClientRect(); return q.left <= cx && cx <= q.right; }) || null;
  }
  return null;
}, [etiqueta, col]);
// Primera línea de la celda: la Σ puede traer debajo «sin fecha …».
const textoCelda = async (etiqueta, col) => { const h = await celda(etiqueta, col); return h.asElement() ? (await h.asElement().innerText()).trim().split('\n')[0] : null; };
const ovGuardado = () => {
  const fr = leerFila(store, 'finanzas')?.finanzas_real?.[EMP]?._proyOverrides || {};
  const k = Object.keys(fr).find(x => x === LINEA || x.endsWith('::' + LINEA));
  return k ? { clave: k, val: fr[k]?.[IDX] } : null;
};
const escriturasFinanzas = () => (store.__escrituras || []).filter(e => e.id === 'finanzas').length;

await login(page);
await abrirFlujo();

const base = num(await textoCelda(LINEA, `Σ ${MES}`));
check(`la línea tiene valor calculado en ${MES}`, base > 0, `Σ ${MES} = ${base}`);
check(`la semana ${SEM} está vacía`, (await textoCelda(LINEA, SEM)) === '—', await textoCelda(LINEA, SEM));
await page.screenshot({ path: `${OUT}/semanal/01-inicio.png`, fullPage: false });

console.log('\n=== 1 · clic en la semana vacía y salir sin escribir ===');
{
  const antes = escriturasFinanzas();
  const h = (await celda(LINEA, SEM)).asElement();
  await (await h.$('span')).click();
  await page.waitForTimeout(300);
  check('se abrió el campo de edición', !!(await h.$('input')));
  await page.mouse.click(5, 5);          // salir (blur)
  await page.waitForTimeout(3500);       // más que el debounce del guardado
  check('0 escrituras en finanzas', escriturasFinanzas() === antes, `${escriturasFinanzas() - antes}`);
  check('sin valor manual guardado', ovGuardado() === null, JSON.stringify(ovGuardado()));
  check(`el mes sigue en ${base}`, num(await textoCelda(LINEA, `Σ ${MES}`)) === base, await textoCelda(LINEA, `Σ ${MES}`));
}

console.log('\n=== 2 · escribir 1.000 en esa semana ===');
{
  const h = (await celda(LINEA, SEM)).asElement();
  await (await h.$('span')).click();
  await page.waitForTimeout(300);
  await (await h.$('input')).fill('1000');
  await (await h.$('input')).press('Enter');
  await page.waitForTimeout(3500);
  const ov = ovGuardado();
  check('lo guardado: 1.000 en S42 y el resto del mes sigue sin fecha',
        ov && ov.val && ov.val._sem2 === 1000 && ov.val._sinFecha === base - 1000 && Object.keys(ov.val).length === 2, JSON.stringify(ov));
  check('con la clave de su categoría', ov && ov.clave.includes('::'), ov && ov.clave);
  check(`el mes sigue en ${base}: distribuir mueve, no suma`, num(await textoCelda(LINEA, `Σ ${MES}`)) === base, await textoCelda(LINEA, `Σ ${MES}`));
  await page.screenshot({ path: `${OUT}/semanal/02-editada.png`, fullPage: false });
}

console.log('\n=== 3 · recarga ===');
const guardado = JSON.stringify(ovGuardado());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await abrirFlujo();
check('el dato guardado no cambió', JSON.stringify(ovGuardado()) === guardado);
check(`tras recargar el mes = ${base}`, num(await textoCelda(LINEA, `Σ ${MES}`)) === base, await textoCelda(LINEA, `Σ ${MES}`));

console.log('\n=== 4 · Excel recalculado ===');
{
  await page.getByRole('button', { name: /📅 Mensual/ }).first().click();
  await page.waitForTimeout(800);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.getByRole('button', { name: /📥 Excel/ }).first().click(),
  ]);
  const arch = path.join(OUT, 'semanal', 'flujo.xlsx');
  await dl.saveAs(arch);
  const rec = recalcular(arch, path.join(OUT, 'semanal'));
  const ws = rec.wb.Sheets[EMP] || rec.wb.Sheets[rec.wb.SheetNames[0]];
  const refs = Object.keys(ws).filter(k => k[0] !== '!');
  const colMes = refs.find(k => ws[k].v === MES && /^[A-Z]+\d+$/.test(k))?.replace(/\d+$/, '');
  const filaLinea = refs.find(k => /^A\d+$/.test(k) && String(ws[k].v).trim() === LINEA)?.slice(1);
  const v = colMes && filaLinea ? ws[`${colMes}${filaLinea}`]?.v : undefined;
  check(`Excel ${LINEA} ${MES} = ${base}`, Math.abs((v || 0) - base) < 0.01, `${v}`);
}

check('0 peticiones escapadas a producción', escapadas.length === 0, escapadas.slice(0, 3).join(' · '));
await browser.close();
console.log(fallos ? `\n✗ ${fallos} falla(s)` : '\n✓ todo OK');
process.exit(fallos ? 1 : 0);
