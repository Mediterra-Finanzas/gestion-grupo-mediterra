/* ─────────────────────────────────────────────────────────────────────────
   RESOLUCIÓN DE VALORES MANUALES ANTIGUOS SIN CATEGORÍA — en el navegador.

   Siembra en el store aislado dos overrides con la clave vieja (solo etiqueta)
   sobre un concepto que existe en dos categorías de Allpa Farms, con DOS meses
   distintos, y comprueba:
     · que el aviso los liste con empresa, concepto, candidatas, mes y monto;
     · que el criterio provisional se declare como no confirmado;
     · que cada mes pueda asignarse a una categoría distinta;
     · que quede el registro de la resolución (clave original, valor, categoría,
       usuario y fecha) y que la clave antigua se retire recién después;
     · que el Excel lleve el aviso mientras la ambigüedad exista;
     · que todo sobreviva a una recarga.

   Producción no se toca: Supabase está interceptado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';
import { recalcular } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'ambig'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const iMay = MESES.indexOf('May-26'), iJun = MESES.indexOf('Jun-26');

// ── store con DOS overrides antiguos ambiguos ──
const store = nuevoStore();
const fin = leerFila(store, 'finanzas');
fin.finanzas_real = { 'Allpa Farms': { _proyOverrides: { 'Electricidad': { [iMay]: 33333, [iJun]: 44444 } } } };
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

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allpa Farms');
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);

const texto = async () => (await page.locator('body').innerText());
let t = await texto();
check('el aviso aparece', /valor\(es\) manual\(es\) antiguo\(s\) sin categoría asignada/i.test(t));
check('nombra la empresa', t.includes('Allpa Farms'));
check('nombra el concepto', t.includes('Electricidad'));
check('lista las categorías candidatas', /candidatas:.*Egresos Operacionales.*Costos Fijos/.test(t.replace(/\n/g, ' ')));
check('muestra los dos meses con su monto', t.includes('May-26') && t.includes('Jun-26') && t.includes('$33,333') && t.includes('$44,444'));
check('declara el criterio provisional como NO confirmado', /provisional/i.test(t) && /sin confirmar/i.test(t));
await page.screenshot({ path: `${OUT}/ambig/01-aviso.png`, fullPage: true });

// ── el Excel debe traer el aviso mientras haya ambigüedad ──
{
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.getByRole('button', { name: /📥 Excel/ }).first().click(),
  ]);
  const arch = path.join(OUT, 'ambig', 'con-aviso.xlsx');
  await dl.saveAs(arch);
  const rec = recalcular(arch, path.join(OUT, 'ambig'));
  const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
  const textos = Object.keys(ws).map(k => ws[k]?.v).filter(v => typeof v === 'string');
  check('el Excel avisa la imputación provisional', textos.some(x => /provisionalmente/i.test(x)),
        textos.filter(x => /provisional/i.test(x)).length + ' celdas');
  const enFila3 = Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).map(k => ws[k].v);
  check('la grilla no se movió (meses en la fila 3)', enFila3.includes('May-26'));
}

// ── resolver: May-26 a una categoría y Jun-26 a la OTRA ──
const botonesDe = async (mes) => {
  const filas = await page.locator('table').all();
  for (const tab of filas) {
    for (const fila of await tab.locator('tr').all()) {
      const celdas = await fila.locator('td').allInnerTexts();
      if (celdas[0]?.trim() === mes && celdas.length >= 3) return fila.locator('button');
    }
  }
  return null;
};
{
  const b1 = await botonesDe('May-26');
  check('May-26 ofrece las dos categorías', b1 && (await b1.count()) === 2, b1 ? `${await b1.count()} botones` : 'no encontrado');
  await b1.nth(1).click();                       // Costos Fijos (la NO provisional)
  await page.waitForTimeout(2500);
}
{
  const b2 = await botonesDe('Jun-26');
  check('Jun-26 sigue pendiente tras resolver May-26', !!b2);
  await b2.nth(0).click();                       // Egresos Operacionales
  await page.waitForTimeout(2500);
}
t = await texto();
check('el aviso desaparece cuando no queda nada ambiguo', !/sin categoría asignada/i.test(t));
await page.screenshot({ path: `${OUT}/ambig/02-resueltos.png`, fullPage: true });

// ── lo guardado: claves nuevas + trazabilidad, sin la clave antigua ──
const guardado = leerFila(store, 'finanzas')?.finanzas_real?.['Allpa Farms'] || {};
const ov = guardado._proyOverrides || {};
const res = guardado._resolucionesOverride || [];
fs.writeFileSync(path.join(OUT, 'ambig', 'guardado.json'), JSON.stringify({ ov, res }, null, 1));
check('May-26 quedó en Costos Fijos', ov['egr_fijo::Electricidad']?.[iMay] === 33333, JSON.stringify(ov['egr_fijo::Electricidad']));
check('Jun-26 quedó en Egresos Operacionales', ov['egr_var::Electricidad']?.[iJun] === 44444, JSON.stringify(ov['egr_var::Electricidad']));
check('la clave antigua ya no tiene esos meses', !ov['Electricidad'], JSON.stringify(ov['Electricidad'] || null));
check('hay dos resoluciones registradas', res.length === 2, `${res.length}`);
if (res.length) {
  const r0 = res[0];
  check('la resolución guarda clave original, categoría, monto, usuario y fecha',
        r0.claveOriginal === 'Electricidad' && !!r0.categoriaElegida && !!r0.usuario && !!r0.ts && r0.valor != null,
        JSON.stringify({ o: r0.claveOriginal, c: r0.categoriaElegida, u: r0.usuario, v: r0.valor }));
  check('guarda las categorías candidatas', Array.isArray(r0.categoriasCandidatas) && r0.categoriasCandidatas.length === 2);
}

// ── recarga: todo sigue en su lugar ──
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allpa Farms');
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1500);
t = await texto();
check('tras recargar no reaparece el aviso', !/sin categoría asignada/i.test(t));
{
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.getByRole('button', { name: /📥 Excel/ }).first().click(),
  ]);
  const arch = path.join(OUT, 'ambig', 'sin-aviso.xlsx');
  await dl.saveAs(arch);
  const rec = recalcular(arch, path.join(OUT, 'ambig'));
  const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
  const textos = Object.keys(ws).map(k => ws[k]?.v).filter(v => typeof v === 'string');
  check('resuelto: el Excel ya no avisa', !textos.some(x => /provisionalmente/i.test(x)));
  const colMay = Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === 'May-26').replace(/\d+$/, '');
  const filas = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === 'Electricidad').map(k => Number(k.slice(1)));
  const vals = filas.map(f => ws[`${colMay}${f}`]?.v);
  check('el Excel recalculado lleva el valor en la línea elegida', vals.includes(33333), vals.join(' / '));
}
await page.screenshot({ path: `${OUT}/ambig/03-tras-recarga.png`, fullPage: true });

await browser.close();
console.log(`peticiones escapadas a producción: ${escapadas.length}`);
console.log(fallos === 0 ? '\nOK: ambigüedad avisada, resuelta por mes y trazada' : `\n${fallos} FALLA(S)`);
process.exit(fallos || escapadas.length ? 1 : 0);
