/* ─────────────────────────────────────────────────────────────────────────
   CUADRE DE LA VISTA SEMANAL — verificación en el navegador.

   Siembra en Mediterra (Supabase falso, aislado) una mezcla de:
     · override semanal (objeto _semN) y override mensual antiguo (número);
     · subLines mensuales (van a la última semana) y semanales;
     · una línea agregada con valor mensual y con valor semanal;
     · créditos bullet, de cuotas mensuales y de socio (cuotas en su semana).
   Abre Flujo Empresas › Mediterra › Semanal y comprueba, para cada mes desde
   el mes en curso y en TODAS las filas leídas:
     1. Σ semanas = columna Σ del mes                (líneas, subtotales, neto)
     2. Σ (signo × subtotal) = Flujo Neto            (por semana y por mes)
     3. Σ líneas de la categoría = subtotal          (por semana)
     4. saldo anterior + Flujo Neto = saldo final    (semana a semana, cruzando meses)
   Sale con código 1 si algo no cuadra.

   Uso:  APP_URL=http://127.0.0.1:4173 OUT_DIR=/tmp/e2e node scripts/e2e/semanal-cuadre.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, num } from './lib.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = []; for (let i = 0; i < 63; i++) { const m = (3 + i) % 12, y = 26 + Math.floor((3 + i) / 12); MESES.push(`${MN[m]}-${y}`); }
const hoy = new Date();
const MES_HOY = `${MN[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}`;
const iHoy = MESES.indexOf(MES_HOY);
const iM = (k) => iHoy + k; // mes en curso + k
const SALDO = 500000;

// ── Datos mixtos ──────────────────────────────────────────────────────────
const store = nuevoStore();
const fin = store.finanzas.value;
fin.finanzas_real = { Mediterra: { _proyOverrides: {
  'ing_op::Fee Administración': { [iM(0)]: { _sem0: 10000, _sem2: 25000 } },   // semanas mandan
  'egr_fijo::Gastos Varios': { [iM(1)]: 12345 },                                 // mensual antiguo → última semana
} } };
fin.sub_lines = { Mediterra: { 'Pago Préstamos - Total': [
  { label: 'Comisión estructuración', vals: { [iM(1)]: 7000 } },                 // mensual → última semana
  { label: 'Gastos notariales', vals: { [`${iM(2)}_1`]: 3000 } },               // semanal
] } };
fin.added_lines = { Mediterra: { egr_var: [
  { label: 'Gasto prueba E2E', vals: { [iM(1)]: 4000, [`${iM(2)}_2`]: 1500 } },  // mensual → S1 · semanal
] } };
const f = (k, d) => { const x = new Date(hoy.getFullYear(), hoy.getMonth() + k, d); return x.toISOString().slice(0, 10); };
fin.creditos_data = [
  { n: 1, empresa: 'Mediterra', acreedor: 'Banco A', tipo_inst: 'Banco', monto: 120000, f_venc: f(1, 28), tipo_cr: 'Bullet', tasa: '', cuota: 120000, pagado: false },
  { n: 2, empresa: 'Mediterra', acreedor: 'Banco B', tipo_inst: 'Banco', monto: 111000, f_inicio: f(-1, 15), f_venc: f(5, 15), tipo_cr: 'Cuotas Mensuales', tasa: '', cuota: 18500, pagado: false },
  { n: 3, empresa: 'Mediterra', acreedor: 'Socio', tipo_inst: 'Privado', tipo_credito: 'socio', monto: 300000, tasa_efectiva_anual: 8,
    fecha_desembolso: f(0, 1), cuotas_socio: [{ fecha_vencimiento: f(2, 10), modo: 'interes' }, { fecha_vencimiento: f(4, 20), modo: 'amortizacion', amortizacion: 150000 }], pagado: false },
];
store.finanzas_bancos.value.saldos = { 'Mediterra||BICE||usd': { monto: SALDO, fecha: f(0, 5), moneda: 'usd' } };

// ── Navegador ─────────────────────────────────────────────────────────────
const { browser, page } = await abrirApp(store);
page.on('dialog', d => d.accept().catch(() => {}));
await login(page);
await entrarFinanzas(page);
await irAFlujoEmpresas(page);
await elegirEmpresa(page, 'Mediterra');
await page.getByRole('button', { name: '📊 Semanal', exact: true }).click();
await page.waitForTimeout(1200);
const tabla = page.locator('table', { hasText: 'SALDO ACUM' }).first();

// Desplegar todas las categorías (cada clic re-renderiza: se busca de nuevo)
for (let v = 0; v < 12; v++) {
  let abrio = false;
  for (const fila of await tabla.locator('tr').all()) {
    const c = fila.locator('td,th').first();
    if (/\(\d+ líneas?\)/.test((await c.innerText().catch(() => '')))) {   // plegada
      await c.click();
      await page.waitForTimeout(400); abrio = true; break;
    }
  }
  if (!abrio) break;
}

async function leer() {
  const filas = await tabla.locator('tr').all();
  const cab = (await filas[2].locator('th,td').allInnerTexts()).map(t => t.trim());
  // columnas: S## de un mes, luego "Σ Mes"
  const cols = []; let pend = [];
  cab.forEach((h, i) => {
    if (/^S\d{2}$/.test(h)) pend.push(i);
    const m = /^Σ (\w{3}-\d{2})$/.exec(h);
    if (m) { cols.push({ mes: m[1], semanas: pend, total: i }); pend = []; }
  });
  const out = []; let signoCat = 0, enCat = false;
  for (const fila of filas.slice(3)) {
    const celdas = await fila.locator('th,td').allInnerTexts();
    const etq = (celdas[0] || '').replace(/\n/g, ' ').trim();
    if (!etq) continue;
    const valor = (i) => { const b = (celdas[i] || '').split('\n').pop().trim(); return b === '—' || b === '' ? null : num(b); };
    // Estructura desplegada: "▶ ± CATEGORÍA" · líneas · "+ agregar concepto" · "Σ Categoría"
    let tipo = 'otra', signo = 0;
    const cab = /^▶\s*([+−])\s*[A-ZÁÉÍÓÚÑ /&]+$/.exec(etq);
    if (cab) { signoCat = cab[1] === '+' ? 1 : -1; enCat = true; tipo = 'cabecera'; }
    else if (/^Σ /.test(etq) && enCat) { tipo = 'categoria'; signo = signoCat; enCat = false; }
    else if (/FLUJO NETO/.test(etq)) tipo = 'neto';
    else if (/SALDO ACUM/.test(etq)) tipo = 'saldo';
    else if (enCat && !/agregar concepto/.test(etq)) tipo = 'linea';
    out.push({ etq, tipo, signo, valor });
  }
  return { cols, filas: out };
}

const { cols, filas } = await leer();
await page.screenshot({ path: path.join(OUT, 'semanal-mediterra.png'), fullPage: false });
let ok = 0, fallos = 0; const detalle = [];
// Cada celda en pantalla está redondeada a US$1: una suma de n celdas puede
// diferir hasta n×0,5 del total redondeado. tol = n° de celdas sumadas.
const check = (nombre, a, b, tol = 1) => {
  const bien = Math.abs((a || 0) - (b || 0)) <= 0.5 * (tol + 1) + 1e-9;
  bien ? ok++ : (fallos++, detalle.push(`✗ ${nombre}: ${a} ≠ ${b}`));
};
const neto = filas.find(r => r.tipo === 'neto'), saldo = filas.find(r => r.tipo === 'saldo');
const cats = filas.filter(r => r.tipo === 'categoria');
const desde = cols.filter(c => MESES.indexOf(c.mes) >= iHoy).slice(0, 4);   // mes en curso + 3

// bloques: filas de línea que cuelgan de cada categoría
const bloques = []; let pend = [];
filas.forEach(r => { if (r.tipo === 'cabecera') pend = []; else if (r.tipo === 'linea') pend.push(r); else if (r.tipo === 'categoria') bloques.push({ cat: r, lineas: pend }); });

let saldoPrev = null;
desde.forEach((c, k) => {
  // 1. Σ semanas = Σ mes, en todas las filas numéricas
  filas.filter(r => ['linea', 'categoria', 'neto'].includes(r.tipo)).forEach(r => {
    check(`Σ semanas = mes · ${r.etq.slice(0, 40)} · ${c.mes}`, c.semanas.reduce((a, i) => a + (r.valor(i) || 0), 0), r.valor(c.total) || 0, c.semanas.length);
  });
  // 2 y 3 por semana y por mes
  [...c.semanas, c.total].forEach(i => {
    const sum = cats.reduce((a, r) => a + r.signo * (r.valor(i) || 0), 0);
    check(`ingresos − egresos = neto · ${c.mes} col ${i}`, sum, neto.valor(i) || 0, cats.length);
    bloques.forEach(b => check(`Σ líneas = subtotal · ${b.cat.etq.slice(0, 30)} · ${c.mes} col ${i}`,
      b.lineas.reduce((a, r) => a + (r.valor(i) || 0), 0), b.cat.valor(i) || 0, b.lineas.length));
  });
  // 4. saldo semana a semana
  c.semanas.forEach((i, w) => {
    const ini = (k === 0 && w === 0) ? SALDO : saldoPrev;
    check(`saldo inicial + neto = saldo final · ${c.mes} S${w + 1}`, ini + (neto.valor(i) || 0), saldo.valor(i), 2);
    saldoPrev = saldo.valor(i);
  });
  check(`saldo de la última semana = saldo Σ ${c.mes}`, saldoPrev, saldo.valor(c.total));
});

// Ejemplo legible: Préstamos y Flujo Neto del mes siguiente
const prest = filas.find(r => /Pago Préstamos/.test(r.etq));
const m1 = desde[1];
const ej = {
  mes: m1.mes,
  prestamos_semanas: m1.semanas.map(i => prest?.valor(i) || 0), prestamos_mes: prest?.valor(m1.total) || 0,
  neto_semanas: m1.semanas.map(i => neto.valor(i) || 0), neto_mes: neto.valor(m1.total) || 0,
  saldo_semanas: m1.semanas.map(i => saldo.valor(i)), saldo_mes: saldo.valor(m1.total),
};
fs.writeFileSync(path.join(OUT, 'semanal-cuadre.json'), JSON.stringify({ app: process.env.APP_URL, ok, fallos, detalle, ejemplo: ej }, null, 2));
console.log(`Comprobaciones: ${ok} cuadran, ${fallos} no cuadran`);
detalle.slice(0, 12).forEach(d => console.log('  ' + d));
console.log('Ejemplo', JSON.stringify(ej));
await browser.close();
process.exit(fallos ? 1 : 0);
