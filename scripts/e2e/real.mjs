/* ─────────────────────────────────────────────────────────────────────────
   VERIFICACIÓN CON DATOS REALES — copia aislada, solo lectura.

     node scripts/e2e/real.mjs /ruta/snapshot.json      (o el JSON del botón
                                                         "💾 Respaldo")

   El snapshot se carga en el store en memoria (fake.mjs). La app trabaja
   contra ESA COPIA: cualquier autosave queda en memoria y muere con el
   proceso. La base de producción no se toca (lo verifica el contador de
   peticiones escapadas, que debe quedar en 0).

   No registra realizaciones ni edita nada: solo abre Parámetros y el Flujo de
   Allegria Foods, descarga los dos Excel con los botones de la app, los
   recalcula de verdad con LibreOffice y compara mes a mes.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, instalarFake } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular, leerHojaFlujo } from './xls.mjs';
import { leerSnapshot, SnapshotInvalido } from './cargarSnapshot.mjs';

const OUT = process.env.OUT_DIR || '.';
const DESCARGAS = path.join(OUT, 'descargas-real');
fs.mkdirSync(DESCARGAS, { recursive: true });
const ruta = process.argv[2];
if (!ruta || !fs.existsSync(ruta)) {
  console.error('Falta el snapshot. Genéralo con scripts/e2e/snapshot.mjs (solo lectura)\n' +
                'o usa el JSON que descarga el botón "💾 Respaldo" de la app.');
  process.exit(2);
}

// ── store aislado con los datos reales ───────────────────────────────
// El lector acepta el snapshot reducido y también el JSON crudo del botón
// "💾 Respaldo"; se detiene si la estructura no es la esperada y avisa qué
// falta, en vez de seguir con una fila vacía.
let leido;
try {
  leido = leerSnapshot(JSON.parse(fs.readFileSync(ruta, 'utf8')));
} catch (e) {
  if (e instanceof SnapshotInvalido) { console.error(`✗ ${e.message}`); process.exit(2); }
  console.error(`✗ No se pudo leer el archivo: ${e.message}`); process.exit(2);
}
leido.avisos.forEach(a => console.log(`  aviso: ${a}`));
const store = nuevoStore();
const ts = new Date(Date.now() - 60000).toISOString();
Object.entries(leido.filas).forEach(([id, f]) => {
  store[id] = { value: f.value, updated_at: f.updated_at || ts };
});
console.log(`Filas cargadas en la copia aislada: ${Object.keys(leido.filas).join(', ')}`);
const val = (id) => {
  const v = store[id]?.value;
  return typeof v === 'string' ? JSON.parse(v) : v;
};

// ── radiografía de los datos reales de Allegria ──────────────────────
const fin = val('finanzas') || {};
const params = fin.allegria_params || {};
const overrides = (fin.finanzas_real || {})['Allegria Foods']?._proyOverrides || {};
const saldos = (val('finanzas_bancos') || {}).saldos || {};

const informe = { temporadas: [], overrides: {}, cuentasAllegria: [] };
Object.keys(params).sort().forEach(sk => {
  ['cerezas', 'ciruelas'].forEach(fruta => {
    const p = params[sk]?.[fruta];
    if (!p) return;
    const kg = Number(p.kg) || 0, fob = Number(p.fob_usd_kg) || 0;
    if (!kg && !fob) return;
    const resumen = (lista) => (lista || []).map(a => ({
      mes: a.mes, usd_kg: Number(a.usd_kg) || 0,
      acordado: (Number(a.usd_kg) || 0) * kg,
      realizaciones: (a.realizaciones || []).length,
      realizado: (a.realizaciones || []).filter(r => r && !r.anulada).reduce((s, r) => s + (Number(r.usd) || 0), 0),
      cerrado: !!a.cerrado,
      legacy: a.realizaciones === undefined,
    }));
    informe.temporadas.push({
      temporada: sk, fruta, kg, fob,
      venta: kg * fob,
      mes_liquidacion: p.mes_liquidacion, mes_saldo_productor: p.mes_saldo_productor,
      anticipos_cliente: resumen(p.anticipos_cliente),
      anticipos_productor: resumen(p.anticipos_productor),
    });
  });
});
Object.entries(overrides).forEach(([linea, meses]) => {
  informe.overrides[linea] = Object.keys(meses || {}).length;
});
Object.entries(saldos).forEach(([k, rec]) => {
  const partes = k.split('||');
  if (partes[0] !== 'Allegria Foods') return;
  informe.cuentasAllegria.push({ banco: partes[1], moneda: partes[2] || rec.moneda, fecha: rec.fecha, monto: rec.monto });
});
fs.writeFileSync(path.join(OUT, 'informe-datos-reales.json'), JSON.stringify(informe, null, 2));

console.log('═══ DATOS REALES DE ALLEGRIA FOODS (solo lectura) ═══');
informe.temporadas.forEach(t => {
  console.log(`\n${t.temporada} · ${t.fruta}: ${t.kg.toLocaleString()} kg × $${t.fob} = $${Math.round(t.venta).toLocaleString()}`);
  console.log(`  liquidación: ${t.mes_liquidacion || '—'} · saldo productor: ${t.mes_saldo_productor || '—'}`);
  const pinta = (etq, arr) => arr.forEach(a => console.log(
    `  ${etq} ${a.mes || '(sin mes)'} $${a.usd_kg}/kg → acordado $${Math.round(a.acordado).toLocaleString()}` +
    ` · realizado $${Math.round(a.realizado).toLocaleString()}` +
    `${a.cerrado ? ' · CERRADO' : ''}${a.legacy ? ' · antiguo (sin realizaciones)' : ''}`));
  pinta('cliente  ', t.anticipos_cliente);
  pinta('productor', t.anticipos_productor);
});
console.log('\nOverrides manuales por línea:', Object.keys(informe.overrides).length ? informe.overrides : 'ninguno');
console.log('Cuentas bancarias de Allegria:');
informe.cuentasAllegria.forEach(c => console.log(`  ${c.banco} (${c.moneda}) · ${c.fecha} · ${c.monto}`));
const fechas = informe.cuentasAllegria.map(c => c.fecha).filter(Boolean).sort();
if (fechas.length > 1 && fechas[0] !== fechas[fechas.length - 1]) {
  console.log(`  ⚠ fechas distintas (${fechas[0]} … ${fechas[fechas.length - 1]}): la conciliación de un cobro`);
  console.log('    entre esas dos fechas NO es comprobable y la pantalla debe decirlo.');
}

// ── la app, contra la copia ──────────────────────────────────────────
const comparaciones = [];
function anota(caso, concepto, mes, app, excel, nota = '') {
  const dif = (app == null || excel == null) ? null : Math.round((excel - app) * 100) / 100;
  const ok = (app == null && excel == null) ? true : (dif !== null && Math.abs(dif) < 0.51);
  comparaciones.push({ caso, concepto, mes, app, excel, dif, ok, nota });
}
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

const escapadas = [];
const { browser, page } = await abrirApp(store);
page.on('requestfinished', async r => {
  if (!r.url().includes('bywovqayuzodbzwsriet.supabase.co')) return;
  const resp = await r.response().catch(() => null);
  const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
  if (via !== '*') escapadas.push(`${r.method()} ${r.url().slice(0, 80)}`);
});
page.on('dialog', d => d.dismiss().catch(() => {}));

await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Allegria Foods');

// Parámetros: captura por temporada con datos
await subTab(page, /Parámetros/);
for (const t of [...new Set(informe.temporadas.map(x => x.temporada))]) {
  const b = page.getByRole('button', { name: `Temporada ${t}` });
  if (!(await b.count())) continue;
  await b.click(); await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/real-parametros-${t}.png`, fullPage: true });
  const txt = await page.locator('body').innerText();
  console.log(`\n[${t}] pantalla → ${/Queda por cobrar:[^\n]*/.exec(txt)?.[0] || 'sin resumen de cobros'}`);
  console.log(`[${t}] pantalla → ${/Queda por pagar:[^\n]*/.exec(txt)?.[0] || 'sin resumen de pagos'}`);
  const aviso = /Conciliación con Saldos Bancos[^\n]*/.exec(txt);
  if (aviso) console.log(`[${t}] aviso → ${aviso[0].slice(0, 200)}`);
  const ovAviso = /El flujo está usando valores manuales[^\n]*/.exec(txt);
  if (ovAviso) console.log(`[${t}] aviso → ${ovAviso[0].slice(0, 200)}`);
}

// Flujo + Excel individual
await subTab(page, /Flujo de Caja/);
await page.waitForTimeout(1200);
for (const t of ['T2027', 'T2028', 'T2029', 'T2030']) {
  const b = page.getByRole('button', { name: new RegExp(`▸ ${t}`) });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(250); }
}
await page.waitForTimeout(600);

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
const pantalla = await leerPantalla();
fs.writeFileSync(`${OUT}/real-pantalla.json`, JSON.stringify(pantalla, null, 2));
await page.screenshot({ path: `${OUT}/real-flujo.png`, fullPage: true });

async function descargar(boton, destino) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), boton.click()]);
  const ruta = path.join(DESCARGAS, destino);
  await dl.saveAs(ruta);
  return ruta;
}
function comparar(caso, hoja) {
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
  const banco = buscaFila(pantalla, 'SALDO BANCO');
  const ini = hoja.filas['Saldo inicial caja'] || {};
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hoy = `${MN[new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`;
  anota(caso, 'Saldo inicial (mes en curso)', hoy, banco ? banco[hoy] : null,
        typeof ini[hoy] === 'number' ? ini[hoy] : null);
  Object.keys(ini).forEach(m => {
    if (m === hoy) return;
    const antes = Object.keys(ini).indexOf(m) < Object.keys(ini).indexOf(hoy);
    if (!antes) return;
    const v = ini[m];
    anota(caso, 'Saldo inicial (mes histórico, sin arrastre)', m, null,
          (v === '' || v == null) ? null : v, 'no debe acumularse sobre el saldo actual');
  });
}

const fIndiv = await descargar(page.getByRole('button', { name: /📥 Excel/ }).first(), 'real-allegria.xlsx');
const recI = recalcular(fIndiv, DESCARGAS);
console.log(`\nExcel individual recalculado (${recI.formulasBorradas} fórmulas sin caché)`);
comparar('real · individual', leerHojaFlujo(recI.wb.Sheets['Allegria Foods']));

await page.getByRole('button', { name: /🏛 Consolidado/ }).first().click();
await page.waitForTimeout(3000);
const fCons = await descargar(page.getByRole('button', { name: /Excel/ }).first(), 'real-consolidado.xlsx');
const recC = recalcular(fCons, DESCARGAS);
console.log(`Excel consolidado recalculado (${recC.formulasBorradas} fórmulas sin caché)`);
comparar('real · consolidado', leerHojaFlujo(recC.wb.Sheets['Allegria Foods']));

fs.writeFileSync(`${OUT}/comparaciones-real.json`, JSON.stringify(comparaciones, null, 2));
await browser.close();

const malas = comparaciones.filter(c => !c.ok);
console.log(`\n═══ ${comparaciones.length} celdas comparadas · ${malas.length} diferencias ═══`);
malas.slice(0, 40).forEach(c => console.log(`${c.caso} | ${c.concepto} | ${c.mes} | app ${c.app} | excel ${c.excel} | dif ${c.dif}`));
console.log(`peticiones escapadas a producción: ${escapadas.length}`);
escapadas.forEach(e => console.log('  ⚠', e));
process.exit(malas.length || escapadas.length ? 1 : 0);
