/* ═══════════════════════════════════════════════════════════════════════
   PRUEBA E2E EN NAVEGADOR REAL — Allegria Foods, anticipos con realizaciones.

   La app es el build de la rama claude/vigilant-cray-uf21ws servido en local.
   Supabase está interceptado por un store en memoria (fake.mjs): la base de
   PRODUCCIÓN no se toca. Cada fase carga datos por la UI, lee los números que
   la pantalla muestra, descarga los Excel con los botones de la app, los
   RECALCULA con LibreOffice (sin valores cacheados) y compara mes por mes.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { nuevoStore, volcarStore, SALDO_INI } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab,
         ponerNumero, selectTras, panel, num } from './lib.mjs';
import { recalcular, leerHojaFlujo } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
const DESCARGAS = path.join(OUT, 'descargas');
fs.mkdirSync(DESCARGAS, { recursive: true });

// Mapeo fila-de-pantalla → fila-del-Excel
const MAPA = [
  ['+ INGRESOS OPERACIONALES',      '· Ingresos Operacionales'],
  ['+ INGRESOS NO OPERACIONALES',   '· Ingresos No Operacionales'],
  ['− EGRESOS OPERACIONALES',       '· Egresos Operacionales (variables)'],
  ['− COSTOS FIJOS',                '· Costos Fijos / SG&A'],
  ['− EGRESOS NO OPERACIONALES',    '· Egresos No Operacionales'],
  ['− IMPUESTOS',                   '· Impuestos'],
  ['FLUJO NETO',                    '(=) Flujo neto'],
  ['SALDO ACUM.',                   '(=) Saldo final caja'],
];

async function irAParametros(page) {
  await subTab(page, /Parámetros/);
  await page.getByRole('button', { name: 'Temporada 2026-2027' }).click();
  await page.waitForTimeout(700);
}

const comparaciones = [];   // filas de la tabla final
let fallos = 0;

function anota(caso, concepto, mes, app, excel, nota = '') {
  const dif = (app == null || excel == null) ? null : Math.round((excel - app) * 100) / 100;
  const ok = app == null && excel == null ? true : (dif !== null && Math.abs(dif) < 0.51);
  if (!ok) fallos++;
  comparaciones.push({ caso, concepto, mes, app, excel, dif, ok, nota });
  return ok;
}

// ── lectura de la tabla de la pantalla ────────────────────────────────
async function leerPantalla(page) {
  const tabla = page.locator('table').first();
  const filas = await tabla.locator('tr').all();
  const encabezados = (await filas[1].locator('th,td').allInnerTexts()).map(t => t.trim());
  const out = {};
  for (const fila of filas.slice(2)) {
    const celdas = await fila.locator('th,td').allInnerTexts();
    if (!celdas.length) continue;
    const etiqueta = celdas[0].replace(/\n/g, ' ').replace(/▶|▼|✏️ edita.*/g, '').trim();
    if (!etiqueta) continue;
    const porMes = {};
    encabezados.forEach((h, i) => {
      if (!/^[A-Z][a-z]{2}-\d{2}$/.test(h)) return;
      const bruto = (celdas[i] || '').split('\n')[0].trim();
      porMes[h] = bruto === '—' || bruto === '' ? null : num(bruto);
    });
    out[etiqueta] = porMes;
  }
  return out;
}

function buscaFila(pantalla, claveParcial) {
  const k = Object.keys(pantalla).find(x => x.toUpperCase().includes(claveParcial.toUpperCase()));
  return k ? pantalla[k] : null;
}

// ── descarga desde el botón de la app ─────────────────────────────────
async function descargar(page, boton, destino) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    boton.click(),
  ]);
  const ruta = path.join(DESCARGAS, destino);
  await dl.saveAs(ruta);
  return ruta;
}

// ── comparación de un caso ────────────────────────────────────────────
async function compararCaso(page, caso, { consolidado = false } = {}) {
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(800);
  // expandir todas las temporadas para tener todos los meses visibles
  for (const t of ['T2027', 'T2028', 'T2029', 'T2030']) {
    const b = page.getByRole('button', { name: new RegExp(`▸ ${t}`) });
    if (await b.count()) { await b.first().click(); await page.waitForTimeout(250); }
  }
  await page.waitForTimeout(500);
  const pantalla = await leerPantalla(page);
  fs.writeFileSync(`${OUT}/pantalla-${caso}.json`, JSON.stringify(pantalla, null, 2));
  await page.screenshot({ path: `${OUT}/${caso}-flujo.png`, fullPage: true });

  // Excel individual (botón de la app)
  const btnExcel = page.getByRole('button', { name: /📥 Excel/ }).first();
  const arch = await descargar(page, btnExcel, `${caso}-allegria.xlsx`);
  const { wb, formulasBorradas } = recalcular(arch, DESCARGAS);
  const hoja = leerHojaFlujo(wb.Sheets['Allegria Foods']);
  console.log(`  [${caso}] Excel individual recalculado (${formulasBorradas} fórmulas sin caché)`);

  const meses = Object.keys(hoja.filas['(=) Flujo neto'] || {});
  MAPA.forEach(([claveApp, claveXls]) => {
    const filaApp = buscaFila(pantalla, claveApp);
    const filaXls = hoja.filas[claveXls];
    if (!filaApp) return;
    meses.forEach(mes => {
      const a = filaApp[mes];
      let x = filaXls ? filaXls[mes] : undefined;
      const vacioXls = (x === '' || x === undefined || x === null);
      const esSaldo = claveApp === 'SALDO ACUM.';
      // Filas de saldo: la pantalla pone "—" y el Excel deja la celda vacía en
      // los meses históricos → ambos "sin valor" es coincidencia, no diferencia.
      if (esSaldo) {
        if (a == null && vacioXls) return;                       // los dos vacíos
        anota(caso, claveApp, mes, a, vacioXls ? null : x);
        return;
      }
      anota(caso, claveApp, mes, a == null ? 0 : a, vacioXls ? 0 : x);
    });
  });

  // saldo inicial: la pantalla lo muestra en la fila "Saldo Banco" del mes en curso
  const filaBanco = buscaFila(pantalla, 'SALDO BANCO');
  const saldoIniXls = hoja.filas['Saldo inicial caja'] || {};
  const MES_HOY = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`;
  anota(caso, 'Saldo inicial (mes en curso)', MES_HOY, filaBanco ? filaBanco[MES_HOY] : null,
        typeof saldoIniXls[MES_HOY] === 'number' ? saldoIniXls[MES_HOY] : null);
  // meses previos: ni pantalla ni Excel acumulan
  ['Apr-26', 'Jul-26'].forEach(m => {
    const xv = saldoIniXls[m];
    const vacio = (xv === '' || xv == null || xv === undefined);
    anota(caso, 'Saldo inicial (mes histórico, sin arrastre)', m, null, vacio ? null : xv,
          vacio ? 'vacío en pantalla y en Excel' : 'debe quedar vacío');
  });

  let resultadoCons = null;
  if (consolidado) {
    await page.getByRole('button', { name: /🏛 Consolidado/ }).first().click();
    await page.waitForTimeout(2500);
    const btnCons = page.getByRole('button', { name: /Excel/ }).first();
    const archC = await descargar(page, btnCons, `${caso}-consolidado.xlsx`);
    const rec = recalcular(archC, DESCARGAS);
    const hojaC = leerHojaFlujo(rec.wb.Sheets['Allegria Foods']);
    console.log(`  [${caso}] Excel consolidado recalculado (${rec.formulasBorradas} fórmulas sin caché)`);
    MAPA.forEach(([claveApp, claveXls]) => {
      const filaApp = buscaFila(pantalla, claveApp);
      const filaXls = hojaC.filas[claveXls];
      if (!filaApp || !filaXls) return;
      meses.forEach(mes => {
        const a = filaApp[mes];
        let x = filaXls[mes];
        const vacioXls = (x === '' || x === undefined || x === null);
        if (claveApp === 'SALDO ACUM.') {
          if (a == null && vacioXls) return;
          anota(`${caso} · consolidado`, claveApp, mes, a, vacioXls ? null : x);
          return;
        }
        anota(`${caso} · consolidado`, claveApp, mes, a == null ? 0 : a, vacioXls ? 0 : x);
      });
    });
    resultadoCons = archC;
    await page.getByRole('button', { name: /🍒 Allegria Foods/ }).first().click();
    await page.waitForTimeout(1500);
  }
  return { pantalla, hoja, arch, resultadoCons };
}

// ═══════════════════════════════════════════════════════════════════════
const store = nuevoStore();
const { browser, page } = await abrirApp(store);
page.on('dialog', async d => {
  const t = d.type();
  if (t === 'prompt') await d.accept('QA: cobro cargado dos veces');
  else if (t === 'confirm') await d.accept();
  else await d.accept();
});

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');

// ───────────────── FASE 1 · caso base ─────────────────
console.log('\n=== FASE 1 · caso base (600.000 / 100.000 / 60.000 · 422.000 / 100.000 / 70.000) ===');
await subTab(page, /Parámetros/);
await page.getByRole('button', { name: 'Temporada 2026-2027' }).click();
await page.waitForTimeout(500);
await ponerNumero(page, 'KG a exportar', 1000000);
await ponerNumero(page, 'FOB US$/kg', 0.6);
await ponerNumero(page, 'Desc. exportadora', 0);
await ponerNumero(page, 'Materiales US$/kg', 0.178);
await ponerNumero(page, 'Servicios US$/kg', 0);

const pCli = panel(page, '📥 Cobros al cliente');
await pCli.getByRole('button', { name: '+ Agregar anticipo' }).click();
await page.waitForTimeout(300);
await pCli.locator('select').first().selectOption('Oct-26');
await pCli.locator('input[type=number]').first().fill('0.1');
await pCli.locator('input[type=number]').first().dispatchEvent('change');
await pCli.getByRole('button', { name: /Registrar cobro/ }).first().click();
await page.waitForTimeout(300);
await pCli.locator('input[type=date]').fill('2026-08-10');
await pCli.locator('input[placeholder="US$"]').fill('60000');
await pCli.locator('input[placeholder="nota / referencia"]').fill('QA cobro parcial');
await pCli.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(500);
await selectTras(page, 'Mes liquidación final').selectOption('Mar-27');

const pProd = panel(page, '📤 Pagos al productor');
await pProd.getByRole('button', { name: '+ Agregar anticipo' }).click();
await page.waitForTimeout(300);
await pProd.locator('select').first().selectOption('Oct-26');
await pProd.locator('input[type=number]').first().fill('0.1');
await pProd.locator('input[type=number]').first().dispatchEvent('change');
await pProd.getByRole('button', { name: /Registrar pago/ }).first().click();
await page.waitForTimeout(300);
await pProd.locator('input[type=date]').fill('2026-08-12');
await pProd.locator('input[placeholder="US$"]').fill('70000');
await pProd.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(500);
await selectTras(page, 'Mes saldo productor').selectOption('Mar-27');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/fase1-parametros.png`, fullPage: true });

const txt1 = await page.locator('body').innerText();
const porCobrar = /Queda por cobrar: ([^\s]+)/.exec(txt1)?.[1];
const porPagar = /Queda por pagar: ([^\s]+)/.exec(txt1)?.[1];
console.log('  pantalla · queda por cobrar:', porCobrar, '· queda por pagar:', porPagar);
anota('base · panel Parámetros', 'Queda por cobrar', '—', 540000, num(porCobrar), 'resumen del panel');
anota('base · panel Parámetros', 'Queda por pagar', '—', 352000, num(porPagar), 'resumen del panel');

const r1 = await compararCaso(page, 'fase1-base', { consolidado: true });
const ing1 = buscaFila(r1.pantalla, '+ INGRESOS OPERACIONALES');
const egr1 = buscaFila(r1.pantalla, '− EGRESOS OPERACIONALES');
console.log('  pantalla · ingresos Oct-26:', ing1['Oct-26'], 'Mar-27:', ing1['Mar-27']);
console.log('  pantalla · egresos  Oct-26:', egr1['Oct-26'], 'Mar-27:', egr1['Mar-27']);
anota('base · pantalla', 'Anticipo pendiente cliente', 'Oct-26', 40000, ing1['Oct-26'], 'esperado 40.000');
anota('base · pantalla', 'Liquidación cliente', 'Mar-27', 500000, ing1['Mar-27'], 'esperado 500.000');
anota('base · pantalla', 'Anticipo pendiente productor', 'Oct-26', 30000, egr1['Oct-26'], 'esperado 30.000');
anota('base · pantalla', 'Saldo productor', 'Mar-27', 322000, egr1['Mar-27'], 'esperado 322.000');
['Aug-26', 'Sep-26'].forEach(m => {
  anota('base · pantalla', 'Lo realizado NO reaparece (ingresos)', m, 0, ing1[m] || 0);
  anota('base · pantalla', 'Lo realizado NO reaparece (egresos)', m, 0, egr1[m] || 0);
});

// ───────────────── FASE 2 · guardar y recargar ─────────────────
console.log('\n=== FASE 2 · recargar la app (persistencia) ===');
await page.waitForTimeout(2500);           // dejar que termine el auto-save
volcarStore(store, `${OUT}/store-antes-reload.json`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await entrarFinanzas(page).catch(() => {});
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');
await irAParametros(page);
await page.screenshot({ path: `${OUT}/fase2-parametros-tras-recarga.png`, fullPage: true });
const txt2 = await page.locator('body').innerText();
console.log('  tras recarga · cobrado:', /ya cobrados: ([^\s]+)/.exec(txt2)?.[1],
            '· pagado:', /ya pagados: ([^\s]+)/.exec(txt2)?.[1]);
anota('recarga', 'Realizado cliente conservado', '—', 60000, num(/ya cobrados: ([^\s]+)/.exec(txt2)?.[1]));
anota('recarga', 'Realizado productor conservado', '—', 70000, num(/ya pagados: ([^\s]+)/.exec(txt2)?.[1]));
anota('recarga', 'Queda por cobrar', '—', 540000, num(/Queda por cobrar: ([^\s]+)/.exec(txt2)?.[1]));
anota('recarga', 'Queda por pagar', '—', 352000, num(/Queda por pagar: ([^\s]+)/.exec(txt2)?.[1]));
const r2 = await compararCaso(page, 'fase2-recarga');

// ───────────────── FASE 3 · anticipo cerrado parcialmente realizado ─────────────────
console.log('\n=== FASE 3 · anticipo cerrado con 20.000 cobrados ===');
await irAParametros(page);
const pCli3 = panel(page, '📥 Cobros al cliente');
await pCli3.getByRole('button', { name: '+ Agregar anticipo' }).click();
await page.waitForTimeout(400);
const filasCli = pCli3.locator('select');
await filasCli.nth(1).selectOption('Nov-26');
await pCli3.locator('input[type=number]').nth(1).fill('0.05');
await pCli3.locator('input[type=number]').nth(1).dispatchEvent('change');
await pCli3.getByRole('button', { name: /Registrar cobro/ }).nth(1).click();
await page.waitForTimeout(300);
await pCli3.locator('input[type=date]').fill('2026-08-20');
await pCli3.locator('input[placeholder="US$"]').fill('20000');
await pCli3.getByRole('button', { name: 'Guardar' }).click();
await page.waitForTimeout(500);
await pCli3.locator('input[type=checkbox]').nth(1).check();   // cerrado
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/fase3-parametros.png`, fullPage: true });
const txt3 = await page.locator('body').innerText();
anota('cierre parcial', 'Queda por cobrar', '—', 520000, num(/Queda por cobrar: ([^\s]+)/.exec(txt3)?.[1]));
const r3 = await compararCaso(page, 'fase3-cerrado');
const ing3 = buscaFila(r3.pantalla, '+ INGRESOS OPERACIONALES');
anota('cierre parcial · pantalla', 'Anticipo cerrado no proyecta', 'Nov-26', 0, ing3['Nov-26'] || 0);
anota('cierre parcial · pantalla', 'Liquidación', 'Mar-27', 480000, ing3['Mar-27']);

// ───────────────── FASE 4 · cambio de kilos ─────────────────
console.log('\n=== FASE 4 · kilos 1.000.000 → 800.000 ===');
await irAParametros(page);
await ponerNumero(page, 'KG a exportar', 800000);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/fase4-parametros.png`, fullPage: true });
const txt4 = await page.locator('body').innerText();
console.log('  cobrado tras cambiar kilos:', /ya cobrados: ([^\s]+)/.exec(txt4)?.[1]);
// tras la fase 3 hay dos anticipos cliente: 60.000 + 20.000 ya cobrados
anota('cambio de kilos', 'Realizado cliente intacto (60.000 + 20.000)', '—', 80000, num(/ya cobrados: ([^\s]+)/.exec(txt4)?.[1]));
anota('cambio de kilos', 'Realizado productor intacto', '—', 70000, num(/ya pagados: ([^\s]+)/.exec(txt4)?.[1]));
anota('cambio de kilos', 'Queda por cobrar', '—', 400000, num(/Queda por cobrar: ([^\s]+)/.exec(txt4)?.[1]));
anota('cambio de kilos', 'Queda por pagar', '—', 267600, num(/Queda por pagar: ([^\s]+)/.exec(txt4)?.[1]));
const r4 = await compararCaso(page, 'fase4-kilos');

// ───────────────── FASE 5 · anular una realización ─────────────────
console.log('\n=== FASE 5 · anular el cobro de 60.000 ===');
await irAParametros(page);
const pCli5 = panel(page, '📥 Cobros al cliente');
await pCli5.getByRole('button', { name: 'anular' }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/fase5-parametros.png`, fullPage: true });
const txt5 = await page.locator('body').innerText();
console.log('  cobrado tras anular:', /ya cobrados: ([^\s]+)/.exec(txt5)?.[1]);
// se anula el cobro de 60.000; queda el de 20.000 del anticipo cerrado
anota('anulación', 'Realizado cliente baja de 80.000 a 20.000', '—', 20000, num(/ya cobrados: ([^\s]+)/.exec(txt5)?.[1]));
anota('anulación', 'Queda por cobrar', '—', 460000, num(/Queda por cobrar: ([^\s]+)/.exec(txt5)?.[1]));
anota('anulación', 'Historial conserva el anulado', '—', 1,
      /cobros? anulados?/.test(txt5) || /anulado/.test(txt5) ? 1 : 0, 'texto "anulado" visible');
const r5 = await compararCaso(page, 'fase5-anulacion');

try {
  // ───────────────── FASE 6 · override manual ─────────────────
  console.log('\n=== FASE 6 · override manual sobre la línea de anticipos ===');
  await subTab(page, /Flujo de Caja/);
  await page.waitForTimeout(1200);
  // abrir la categoría de ingresos operacionales para ver sus líneas
  {
    const t0 = page.locator('table').first();
    for (const fila of await t0.locator('tr').all()) {
      const c = fila.locator('th,td').first();
      const txt = (await c.innerText().catch(() => '')).replace(/\n/g, ' ');
      if (/INGRESOS OPERACIONALES/.test(txt)) { await c.click(); break; }
    }
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/fase6-lineas.png`, fullPage: true });
  const tabla6 = page.locator('table').first();
  const encab6 = (await tabla6.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(t => t.trim());
  const colMay = encab6.indexOf('May-26');
  let filaAnticipo = null;
  for (const fila of await tabla6.locator('tr').all()) {
    const c0 = (await fila.locator('th,td').first().innerText().catch(() => '')).trim();
    if (c0.includes('Anticipo Cerezas')) { filaAnticipo = fila; break; }
  }
  console.log('  fila Anticipo Cerezas:', !!filaAnticipo, '· columna May-26:', colMay);
  if (filaAnticipo && colMay > 0) {
    const celda = filaAnticipo.locator('th,td').nth(colMay);
    // el disparador del editor es el <span> de la celda, no el <td>
    const disparador = (await celda.locator('span').count()) ? celda.locator('span').first() : celda;
    await disparador.click();
    await page.waitForTimeout(500);
    const inp = page.locator('table input[type=text]').first();
    if (await inp.count()) {
      await inp.fill('12345');
      await inp.press('Enter');
      await page.waitForTimeout(1500);
      const valCelda = (await celda.innerText()).trim();
      console.log('  override May-26 aplicado · celda muestra:', valCelda);
      anota('override manual', 'La celda de la app muestra el valor manual', 'May-26', 12345, num(valCelda));
    } else {
      console.log('  ⚠ no se pudo abrir el editor de la celda May-26');
      anota('override manual', 'editor de celda', 'May-26', 1, 0, 'no se abrió el editor');
    }
  } else {
    console.log('  ⚠ no se encontró la fila Anticipo Cerezas o la columna May-26');
    anota('override manual', 'localizar celda', 'May-26', 1, 0, 'fila/columna no encontrada');
  }
  await page.screenshot({ path: `${OUT}/fase6-override.png`, fullPage: true });
  // volver a plegar la categoría para leer los totales por categoría
  {
    const t0 = page.locator('table').first();
    for (const fila of await t0.locator('tr').all()) {
      const c = fila.locator('th,td').first();
      const txt = (await c.innerText().catch(() => '')).replace(/\n/g, ' ');
      if (/INGRESOS OPERACIONALES/.test(txt)) { await c.click(); break; }
    }
    await page.waitForTimeout(800);
  }
  const r6 = await compararCaso(page, 'fase6-override', { consolidado: true });
  const ing6 = buscaFila(r6.pantalla, '+ INGRESOS OPERACIONALES');
  const xlsIng6 = r6.hoja.filas['· Ingresos Operacionales'];
  console.log('  May-26 · pantalla:', ing6['May-26'], '· Excel recalculado:', xlsIng6?.['May-26']);
  anota('override manual', 'Ingresos con override', 'May-26', ing6['May-26'], xlsIng6?.['May-26'], 'el Excel debe respetar el valor manual');


} catch (e) {
  console.log('  ✗ FASE 6 falló:', String(e).slice(0, 300));
  anota('override manual', 'ejecución de la fase', '—', 1, 0, String(e).slice(0, 120));
}

// ───────────────── cierre ─────────────────
volcarStore(store, `${OUT}/store-final.json`);
fs.writeFileSync(`${OUT}/comparaciones.json`, JSON.stringify(comparaciones, null, 2));
await browser.close();

// tabla resumen
const malas = comparaciones.filter(c => !c.ok);
console.log(`\n═══ RESULTADO: ${comparaciones.length} comparaciones · ${malas.length} diferencias ═══`);
if (malas.length) {
  console.log('caso | concepto | mes | app | excel | dif');
  malas.slice(0, 40).forEach(c => console.log(`${c.caso} | ${c.concepto} | ${c.mes} | ${c.app} | ${c.excel} | ${c.dif}`));
}
process.exit(malas.length ? 1 : 0);
