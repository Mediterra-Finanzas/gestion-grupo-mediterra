/* ─────────────────────────────────────────────────────────────────────────
   RESOLUCIÓN DE AMBIGUOS — los dos casos de borde.

   A. CONFLICTO: la línea destino YA tiene un valor manual propio.
      Debe mostrarse el conflicto con ambos montos y no sobrescribir sin
      decisión. Se prueban las dos salidas: cancelar (no se toca nada) y
      aceptar (reemplaza, y queda registrado qué valor se reemplazó).

   B. FALLO DE GUARDADO: el servidor rechaza la escritura.
      La clave antigua NO debe perderse ni quedar marcada como resuelta, no
      debe aparecer la clave nueva, y el aviso debe seguir pendiente.

   Producción no se toca: Supabase está interceptado.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(path.join(OUT, 'bordes'), { recursive: true });
let fallos = 0;
const check = (n, c, e = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fallos++; };

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const iMay = MESES.indexOf('May-26');

function storeCon(overrides) {
  const st = nuevoStore();
  const fin = leerFila(st, 'finanzas');
  fin.finanzas_real = { 'Allpa Farms': { _proyOverrides: overrides } };
  st.finanzas.value = fin;
  return st;
}
async function abrirEnFlujo(store, dialogos) {
  const { browser, page } = await abrirApp(store);
  page.on('dialog', async d => { dialogos.push(d.message()); await (dialogos.respuesta === false ? d.dismiss() : d.accept()); });
  await login(page);
  await entrarFinanzas(page);
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, 'Allpa Farms');
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1500);
  return { browser, page };
}
async function botonesMes(page, mes) {
  for (const tab of await page.locator('table').all()) {
    for (const fila of await tab.locator('tr').all()) {
      const celdas = await fila.locator('td').allInnerTexts();
      if (celdas[0]?.trim() === mes && celdas.length >= 3) return fila.locator('button');
    }
  }
  return null;
}
const datos = (store) => leerFila(store, 'finanzas')?.finanzas_real?.['Allpa Farms'] || {};

// ═══ A1 · CONFLICTO, se cancela ═══════════════════════════════════════
console.log('\n═══ A1 · conflicto con un override nuevo existente — se CANCELA ═══');
{
  const store = storeCon({ 'Electricidad': { [iMay]: 33333 }, 'egr_fijo::Electricidad': { [iMay]: 999 } });
  const dialogos = []; dialogos.respuesta = false;           // se cancela el primer confirm
  const { browser, page } = await abrirEnFlujo(store, dialogos);
  const b = await botonesMes(page, 'May-26');
  check('el mes ambiguo se ofrece igual', !!b && (await b.count()) === 2);
  await b.nth(1).click();                                     // asignar a Costos Fijos (ocupada)
  await page.waitForTimeout(1500);
  const msg = dialogos.join(' | ');
  check('avisa el CONFLICTO antes de tocar nada', /CONFLICTO/.test(msg), msg.slice(0, 120));
  check('muestra el valor propio y el antiguo', /\$999/.test(msg) && /\$33,333/.test(msg), msg.slice(0, 160));
  const d = datos(store);
  check('cancelar no cambia el valor propio', d._proyOverrides?.['egr_fijo::Electricidad']?.[iMay] === 999);
  check('cancelar conserva la clave antigua', d._proyOverrides?.['Electricidad']?.[iMay] === 33333);
  check('cancelar no registra resolución', !(d._resolucionesOverride || []).length);
  await page.screenshot({ path: `${OUT}/bordes/a1-conflicto-cancelado.png`, fullPage: true });
  await browser.close();
}

// ═══ A2 · CONFLICTO, se acepta ════════════════════════════════════════
console.log('\n═══ A2 · conflicto — se ACEPTA el reemplazo ═══');
{
  const store = storeCon({ 'Electricidad': { [iMay]: 33333 }, 'egr_fijo::Electricidad': { [iMay]: 999 } });
  const dialogos = [];
  const { browser, page } = await abrirEnFlujo(store, dialogos);
  const b = await botonesMes(page, 'May-26');
  await b.nth(1).click();
  await page.waitForTimeout(3000);
  const d = datos(store);
  const res = (d._resolucionesOverride || [])[0];
  check('el valor pasa a ser el antiguo', d._proyOverrides?.['egr_fijo::Electricidad']?.[iMay] === 33333,
        JSON.stringify(d._proyOverrides?.['egr_fijo::Electricidad']));
  check('la clave antigua se retira', !d._proyOverrides?.['Electricidad']);
  check('queda registrado que reemplazó un valor propio', !!res && res.reemplazaValorPropio === true);
  check('el registro guarda el valor reemplazado', !!res && res.valorReemplazado === 999, JSON.stringify(res?.valorReemplazado));
  check('el registro trae usuario y fecha', !!res?.usuario && !!res?.ts, `${res?.usuario} · ${res?.ts}`);
  await page.screenshot({ path: `${OUT}/bordes/a2-conflicto-aceptado.png`, fullPage: true });
  await browser.close();
}

// ═══ B · FALLO DE GUARDADO ════════════════════════════════════════════
console.log('\n═══ B · el servidor rechaza la escritura al resolver ═══');
{
  const store = storeCon({ 'Electricidad': { [iMay]: 33333 } });
  const dialogos = [];
  const { browser, page } = await abrirEnFlujo(store, dialogos);
  const antes = JSON.stringify(datos(store)._proyOverrides);
  store.__fallarEscrituras = true;                            // a partir de acá, todo write falla
  const b = await botonesMes(page, 'May-26');
  await b.nth(0).click();
  await page.waitForTimeout(4000);
  const d = datos(store);
  check('la clave antigua NO se pierde', d._proyOverrides?.['Electricidad']?.[iMay] === 33333, JSON.stringify(d._proyOverrides));
  check('no aparece la clave nueva', !d._proyOverrides?.['egr_var::Electricidad']);
  check('no queda registrada como resuelta', !(d._resolucionesOverride || []).length);
  check('nada cambió en el guardado', JSON.stringify(d._proyOverrides) === antes, `${antes} → ${JSON.stringify(d._proyOverrides)}`);
  check('se avisa que no se guardó', dialogos.some(m => /no se pudo guardar/i.test(m)), dialogos.join(' | ').slice(0, 120));
  const t = await page.locator('body').innerText();
  check('el mes sigue pendiente en el aviso', /sin categoría asignada/i.test(t) && t.includes('May-26'));
  await page.screenshot({ path: `${OUT}/bordes/b-fallo-guardado.png`, fullPage: true });

  // y al recuperar el servidor, la resolución sí se completa
  store.__fallarEscrituras = false;
  const b2 = await botonesMes(page, 'May-26');
  check('el mes sigue ofreciéndose para resolver', !!b2);
  await b2.nth(0).click();
  await page.waitForTimeout(3000);
  const d2 = datos(store);
  check('con el servidor sano, la resolución se completa', d2._proyOverrides?.['egr_var::Electricidad']?.[iMay] === 33333);
  check('y recién ahí se retira la clave antigua', !d2._proyOverrides?.['Electricidad']);
  await browser.close();
}

console.log(fallos === 0 ? '\nOK: conflicto avisado y fallo de guardado sin pérdida' : `\n${fallos} FALLA(S)`);
process.exit(fallos ? 1 : 0);
