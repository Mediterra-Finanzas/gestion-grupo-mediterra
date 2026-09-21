/* ─────────────────────────────────────────────────────────────────────────
   REGRESIÓN EN NAVEGADOR — exportación de TODAS las empresas.

   Los dos cambios de esta rama que no son exclusivos de los anticipos
   (saldo inicial en el mes en curso y override manual respetado) afectan a
   cualquier empresa. Acá se verifican dentro de la app real, que es donde
   algunas empresas —Allpa Farms Perú, por ejemplo— arman sus líneas.

   Por cada empresa: lee la tabla del flujo, descarga el Excel con el botón de
   la app, lo recalcula con LibreOffice (sin valores cacheados) y compara mes a
   mes. Después escribe un override manual en una celda calculada y repite,
   para comprobar que el archivo respeta el valor de la pantalla.

   Supabase queda interceptado por el store en memoria: producción no se toca.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular, leerHojaFlujo } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
const DESCARGAS = path.join(OUT, 'descargas-empresas');
fs.mkdirSync(DESCARGAS, { recursive: true });

const EMPRESAS = process.env.EMPRESAS
  ? process.env.EMPRESAS.split(',')
  : ['Allegria Foods', 'Allegria Service', 'Integrity Farms', 'Allpa Farms', 'Allpa Farms Perú', 'Osiris', 'Mediterra', 'Frisku Foods'];

const MAPA = [
  ['+ INGRESOS OPERACIONALES', '· Ingresos Operacionales'],
  ['+ INGRESOS NO OPERACIONALES', '· Ingresos No Operacionales'],
  ['− EGRESOS OPERACIONALES', '· Egresos Operacionales (variables)'],
  ['− COSTOS FIJOS', '· Costos Fijos / SG&A'],
  ['− EGRESOS NO OPERACIONALES', '· Egresos No Operacionales'],
  ['− IMPUESTOS', '· Impuestos'],
  ['FLUJO NETO', '(=) Flujo neto'],
  ['SALDO ACUM.', '(=) Saldo final caja'],
];
const comparaciones = [];
function anota(caso, concepto, mes, app, excel, nota = '') {
  const dif = (app == null || excel == null) ? null : Math.round((excel - app) * 100) / 100;
  const ok = (app == null && excel == null) ? true : (dif !== null && Math.abs(dif) < 0.51);
  comparaciones.push({ caso, concepto, mes, app, excel, dif, ok, nota });
}

const store = nuevoStore();
const escapadas = [];
const { browser, page } = await abrirApp(store);
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(`${r.method()} ${r.url().slice(0, 80)}`);
});
page.on('dialog', d => d.accept().catch(() => {}));

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);

async function leerPantalla() {
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
      porMes[h] = (bruto === '—' || bruto === '') ? null : num(bruto);
    });
    out[etiqueta] = porMes;
  }
  return out;
}
const buscaFila = (p, k) => { const x = Object.keys(p).find(y => y.toUpperCase().includes(k.toUpperCase())); return x ? p[x] : null; };

async function descargar(destino) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.getByRole('button', { name: /📥 Excel/ }).first().click(),
  ]);
  const ruta = path.join(DESCARGAS, destino);
  await dl.saveAs(ruta);
  return ruta;
}
function comparar(caso, pantalla, hoja) {
  const meses = Object.keys(hoja.filas['(=) Flujo neto'] || {});
  MAPA.forEach(([ca, cx]) => {
    const fa = buscaFila(pantalla, ca), fx = hoja.filas[cx];
    if (!fa) return;
    meses.forEach(mes => {
      const a = fa[mes];
      const x = fx ? fx[mes] : undefined;
      const vacio = (x === '' || x === undefined || x === null);
      if (ca === 'SALDO ACUM.') {
        if (a == null && vacio) return;
        anota(caso, ca, mes, a, vacio ? null : x);
        return;
      }
      anota(caso, ca, mes, a == null ? 0 : a, vacio ? 0 : x);
    });
  });
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hoy = `${MN[new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`;
  const banco = buscaFila(pantalla, 'SALDO BANCO');
  const ini = hoja.filas['Saldo inicial caja'] || {};
  const bancoHoy = banco ? banco[hoy] : null;
  if (bancoHoy != null) {
    anota(caso, 'Saldo inicial (mes en curso)', hoy, bancoHoy,
          typeof ini[hoy] === 'number' ? ini[hoy] : null);
  } else {
    // sin saldo bancario cargado: app y Excel arrancan del saldo estático de la
    // empresa. Se comprueba que el arranque exista y caiga en el mes en curso.
    anota(caso, 'Saldo inicial presente en el mes en curso', hoy, 1,
          typeof ini[hoy] === 'number' ? 1 : 0, 'sin saldo bancario cargado');
  }
  ['Apr-26', 'Jun-26'].forEach(m => {
    const v = ini[m];
    anota(caso, 'Saldo inicial (mes histórico)', m, null,
          (v === '' || v == null) ? null : v, 'no debe acumularse sobre el saldo actual');
  });
}

for (const empresa of EMPRESAS) {
  console.log(`\n═══ ${empresa} ═══`);
  try {
    await elegirEmpresa(page, empresa);
    await subTab(page, /Flujo de Caja/);
    await page.waitForTimeout(1200);
    for (const t of ['T2027', 'T2028', 'T2029', 'T2030']) {
      const b = page.getByRole('button', { name: new RegExp(`▸ ${t}`) });
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(200); }
    }
    await page.waitForTimeout(500);

    const pantalla = await leerPantalla();
    const slug = empresa.replace(/[^\w]+/g, '_');
    const arch = await descargar(`${slug}.xlsx`);
    const rec = recalcular(arch, DESCARGAS);
    const hojaNombre = rec.wb.SheetNames.find(n => n !== 'Parametros');
    comparar(`${empresa} · base`, pantalla, leerHojaFlujo(rec.wb.Sheets[hojaNombre]));
    console.log(`  base: Excel recalculado (${rec.formulasBorradas} fórmulas sin caché)`);

    // ── override manual sobre una línea calculada ──
    // Solo se puede editar una línea con fórmula en los meses de la primera
    // temporada del horizonte (regla de la app), así que se usa May-26.
    const tabla = page.locator('table').first();
    const encab = (await tabla.locator('tr').nth(1).locator('th,td').allInnerTexts()).map(t => t.trim());
    const colMay = encab.indexOf('May-26');
    // desplegar la primera categoría con líneas
    let abierta = null;
    for (const fila of await tabla.locator('tr').all()) {
      const c = fila.locator('th,td').first();
      const txt = (await c.innerText().catch(() => '')).replace(/\n/g, ' ');
      if (/INGRESOS OPERACIONALES|EGRESOS OPERACIONALES/.test(txt) && /\(\d+\s*líneas?\)/.test(txt)) {
        await c.click(); abierta = txt.trim(); break;
      }
    }
    await page.waitForTimeout(900);
    // primera celda editable de May-26 con valor
    let aplicado = null;
    for (const fila of await page.locator('table').first().locator('tr').all()) {
      const celdas = fila.locator('th,td');
      const etiqueta = (await celdas.first().innerText().catch(() => '')).trim();
      if (!etiqueta || /INGRESOS|EGRESOS|FLUJO|SALDO|COSTOS|IMPUESTOS|Línea/i.test(etiqueta)) continue;
      const celda = celdas.nth(colMay);
      if (!(await celda.count())) continue;
      const span = celda.locator('span').first();
      if (!(await span.count())) continue;
      await span.click();
      await page.waitForTimeout(350);
      const inp = page.locator('table input[type=text]').first();
      if (!(await inp.count())) continue;
      await inp.fill('54321');
      await inp.press('Enter');
      await page.waitForTimeout(1200);
      const val = num((await celda.innerText()).trim());
      if (val === 54321) { aplicado = etiqueta; break; }
    }
    if (!aplicado) { console.log('  ⚠ no se pudo aplicar override (sin celda editable en May-26)'); }
    else {
      console.log(`  override en «${aplicado}» May-26 = 54.321`);
      // Releer el flujo desde cero: al cambiar de pestaña y volver, la tabla
      // vuelve con las categorías plegadas y sus totales visibles.
      await subTab(page, /Parámetros/);
      await page.waitForTimeout(700);
      await subTab(page, /Flujo de Caja/);
      await page.waitForTimeout(1200);
      for (const t of ['T2027', 'T2028', 'T2029', 'T2030']) {
        const b = page.getByRole('button', { name: new RegExp(`▸ ${t}`) });
        if (await b.count()) { await b.first().click(); await page.waitForTimeout(200); }
      }
      await page.waitForTimeout(500);
      const pantalla2 = await leerPantalla();
      const arch2 = await descargar(`${slug}-override.xlsx`);
      const rec2 = recalcular(arch2, DESCARGAS);
      const hoja2 = rec2.wb.SheetNames.find(n => n !== 'Parametros');
      comparar(`${empresa} · override`, pantalla2, leerHojaFlujo(rec2.wb.Sheets[hoja2]));
      console.log(`  override: Excel recalculado (${rec2.formulasBorradas} fórmulas sin caché)`);
    }
    // ── guardado + recarga: el override debe sobrevivir ──
    if (aplicado) {
      await page.waitForTimeout(2500);                 // que termine el auto-save
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await entrarFinanzas(page).catch(() => {});
      await irAFlujoEmpresas(page);
      await elegirEmpresa(page, empresa);
      await subTab(page, /Flujo de Caja/);
      await page.waitForTimeout(1500);
      for (const t of ['T2027', 'T2028', 'T2029', 'T2030']) {
        const b = page.getByRole('button', { name: new RegExp(`▸ ${t}`) });
        if (await b.count()) { await b.first().click(); await page.waitForTimeout(200); }
      }
      await page.waitForTimeout(500);
      const pantalla3 = await leerPantalla();
      const arch3 = await descargar(`${slug}-recarga.xlsx`);
      const rec3 = recalcular(arch3, DESCARGAS);
      const hoja3 = rec3.wb.SheetNames.find(n => n !== 'Parametros');
      comparar(`${empresa} · recarga`, pantalla3, leerHojaFlujo(rec3.wb.Sheets[hoja3]));
      // La prueba real de la recarga: la pantalla tiene que quedar IGUAL que
      // antes de recargar, celda por celda. (Buscar el monto del override en
      // la fila de categoría no sirve: esa fila suma varias líneas, así que el
      // total no coincide con el valor escrito — daba falsos negativos.)
      let iguales = 0, distintas = 0;
      Object.keys(pantalla2).forEach(fila => {
        if (!pantalla3[fila]) { distintas++; return; }
        Object.entries(pantalla2[fila]).forEach(([mes, v]) => {
          const w = pantalla3[fila][mes];
          if ((v == null ? null : v) === (w == null ? null : w)) iguales++;
          else { distintas++; anota(`${empresa} · recarga`, `cambió tras recargar: ${fila}`, mes, v, w); }
        });
      });
      anota(`${empresa} · recarga`, 'la pantalla queda idéntica tras recargar', '—', 0, distintas,
            `${iguales} celdas iguales`);
      console.log(`  recarga: ${distintas === 0 ? 'pantalla idéntica' : distintas + ' CELDAS DISTINTAS'} ` +
                  `(${iguales} comparadas) · Excel recalculado (${rec3.formulasBorradas} fórmulas)`);
    }
    await page.screenshot({ path: `${OUT}/emp-${slug}.png`, fullPage: false });
  } catch (e) {
    console.log(`  ✗ ${empresa}: ${String(e).slice(0, 160)}`);
    anota(empresa, 'ejecución', '—', 1, 0, String(e).slice(0, 120));
  }
}

fs.writeFileSync(`${OUT}/comparaciones-empresas.json`, JSON.stringify(comparaciones, null, 2));
await browser.close();
const malas = comparaciones.filter(c => !c.ok);
console.log(`\n═══ ${comparaciones.length} celdas comparadas · ${malas.length} diferencias ═══`);
malas.slice(0, 40).forEach(c => console.log(`${c.caso} | ${c.concepto} | ${c.mes} | app ${c.app} | excel ${c.excel} | dif ${c.dif}`));
console.log(`peticiones escapadas a producción: ${escapadas.length}`);
process.exit(malas.length || escapadas.length ? 1 : 0);
