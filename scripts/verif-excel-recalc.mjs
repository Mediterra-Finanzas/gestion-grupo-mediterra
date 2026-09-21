/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// VERIFICACIÓN DE RECÁLCULO REAL DEL EXCEL (no de sus valores cacheados)
//
//   node scripts/verif-excel-recalc.mjs
//
// Qué hace, en orden:
//   1. Toma el libro que generó el test de Jest (src/__tests__/allegriaAnticipos)
//      con los anticipos y sus realizaciones.
//   2. BORRA todos los valores cacheados de las celdas con fórmula. Sin
//      caché, cualquier número que aparezca después solo puede venir de
//      evaluar la fórmula.
//   3. Abre el libro con LibreOffice headless, que lo recalcula y lo
//      vuelve a escribir.
//   4. Compara lo recalculado contra los números de pantalla (esperado.json).
//   5. Repite el ciclo EDITANDO los kilos en la hoja Parametros, para
//      comprobar que al cambiar un parámetro el Excel recalcula el
//      acordado, el pendiente y la liquidación, y que el realizado
//      (histórico) NO se mueve.
//
// Requiere: LibreOffice (soffice) en el PATH.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import * as XLSXns from 'xlsx-js-style';
const XLSX = XLSXns.utils ? XLSXns : (XLSXns.default || XLSXns);

const DIR = process.env.ANTICIPOS_OUT_DIR || path.join(os.tmpdir(), 'anticipos-verif');
const SRC = path.join(DIR, 'allegria_individual.xlsx');
const ESP = path.join(DIR, 'esperado.json');

let fallos = 0;
const aprox = (a, b, tol = 0.5) => Math.abs((Number(a)||0) - (Number(b)||0)) <= tol;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
  if (!cond) fallos++;
}

if (!fs.existsSync(SRC) || !fs.existsSync(ESP)) {
  console.error(`No encuentro ${SRC}. Corre primero:\n  CI=true npx react-scripts test --testPathPattern allegriaAnticipos --watchAll=false`);
  process.exit(2);
}
const esperado = JSON.parse(fs.readFileSync(ESP, 'utf8'));

// ── utilidades de hoja ────────────────────────────────────────────
const colDeFila = (ws, fila, valor) => {
  const k = Object.keys(ws).filter(k => new RegExp(`^[A-Z]+${fila}$`).test(k)).find(k => ws[k]?.v === valor);
  return k ? k.replace(/\d+$/, '') : null;
};
const filaDeConcepto = (ws, texto) => {
  const k = Object.keys(ws).filter(k => /^A\d+$/.test(k)).find(k => ws[k]?.v === texto);
  return k ? Number(k.slice(1)) : null;
};

// Quita el valor cacheado de toda celda con fórmula: obliga a recalcular.
function sinCache(wb) {
  let n = 0;
  wb.SheetNames.forEach(nm => {
    const ws = wb.Sheets[nm];
    Object.keys(ws).forEach(addr => {
      if (addr[0] === '!') return;
      const c = ws[addr];
      if (c && c.f) { delete c.v; delete c.w; n++; }
    });
  });
  return n;
}

// Recalcula con LibreOffice y devuelve el workbook resultante.
function recalcular(wb, tag) {
  const inFile = path.join(DIR, `${tag}_sincache.xlsx`);
  XLSX.writeFile(wb, inFile, { bookType:'xlsx' });
  const outDir = path.join(DIR, `${tag}_out`);
  fs.rmSync(outDir, { recursive:true, force:true });
  fs.mkdirSync(outDir, { recursive:true });
  execFileSync('soffice', [
    '--headless', '--norestore', '--convert-to', 'xlsx:Calc MS Excel 2007 XML',
    '--outdir', outDir, inFile,
  ], { stdio:'pipe', timeout:180000, env:{ ...process.env, HOME:DIR } });
  const outFile = path.join(outDir, path.basename(inFile));
  if (!fs.existsSync(outFile)) throw new Error(`LibreOffice no generó ${outFile}`);
  return XLSX.readFile(outFile, { cellFormula:true });
}

// Lee una línea del flujo (por concepto) → { mes: valor }
function leerLinea(ws, concepto) {
  const fila = filaDeConcepto(ws, concepto);
  if (fila == null) return null;
  const out = {};
  Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).forEach(k => {
    const mes = ws[k]?.v;
    if (typeof mes !== 'string' || !/^[A-Z][a-z]{2}-\d{2}$/.test(mes)) return;
    const col = k.replace(/\d+$/, '');
    out[mes] = Number(ws[`${col}${fila}`]?.v) || 0;
  });
  return out;
}

console.log(`\n═══ CICLO 1 — recálculo del libro tal como se exporta ═══`);
const wb1 = XLSX.readFile(SRC, { cellFormula:true });
const borradas1 = sinCache(wb1);
check(`se borraron los valores cacheados (${borradas1} celdas con fórmula)`, borradas1 > 50, `${borradas1}`);
const rec1 = recalcular(wb1, 'ciclo1');
const flujo1 = rec1.Sheets['Allegria Foods'];
const par1   = rec1.Sheets['Parametros'];
check('LibreOffice devolvió las dos hojas', !!flujo1 && !!par1);

// 1a. La línea de ingreso: solo pendiente + liquidación
const ing1 = leerLinea(flujo1, 'Anticipo Cerezas');
const cost1 = leerLinea(flujo1, 'Costo Fruta Exportación');
esperado.anticipoCerezas.forEach(({ mes, v }) => {
  check(`[recalc] Anticipo Cerezas ${mes} = ${Math.round(v).toLocaleString('en-US')}`, aprox(ing1?.[mes], v), `Excel=${ing1?.[mes]}`);
});
esperado.costoFruta.forEach(({ mes, v }) => {
  check(`[recalc] Costo Fruta ${mes} = ${Math.round(v).toLocaleString('en-US')}`, aprox(cost1?.[mes], v), `Excel=${cost1?.[mes]}`);
});
const totIng1 = Object.values(ing1||{}).reduce((a,b)=>a+b,0);
const totCost1 = Object.values(cost1||{}).reduce((a,b)=>a+b,0);
check(`[recalc] total Anticipo Cerezas = pantalla (${Math.round(esperado.totalAnticipoCerezas).toLocaleString('en-US')})`, aprox(totIng1, esperado.totalAnticipoCerezas), `Excel=${totIng1}`);
check(`[recalc] total Costo Fruta = pantalla (${Math.round(esperado.totalCostoFruta).toLocaleString('en-US')})`, aprox(totCost1, esperado.totalCostoFruta), `Excel=${totCost1}`);

// 1b. Los meses históricos no vuelven a acumularse sobre el saldo bancario
{
  const fila = filaDeConcepto(flujo1, 'Saldo inicial caja');
  const colAbr = colDeFila(flujo1, 3, 'Apr-26');
  const colHoy = colDeFila(flujo1, 3, esperado.mesActual);
  const vAbr = flujo1[`${colAbr}${fila}`]?.v;
  const vHoy = flujo1[`${colHoy}${fila}`]?.v;
  check(`[recalc] saldo inicial en Apr-26 vacío (histórico)`, vAbr === '' || vAbr == null, `="${vAbr}"`);
  check(`[recalc] saldo inicial en ${esperado.mesActual} = saldo banco ${esperado.saldoIni}`, aprox(vHoy, esperado.saldoIni), `=${vHoy}`);
}

// ── CICLO 2 — editar kilos en la hoja Parametros ─────────────────
// 1.000.000 → 800.000 kg. Debe recalcular acordado, pendiente y liquidación;
// el realizado (histórico) tiene que quedarse igual.
console.log(`\n═══ CICLO 2 — se editan los kilos en Parametros (1.000.000 → 800.000) ═══`);
const wb2 = XLSX.readFile(SRC, { cellFormula:true });
const par2 = wb2.Sheets['Parametros'];
let celdaKg = null;
Object.keys(par2).forEach(a => { if (/^C\d+$/.test(a) && par2[a]?.t === 'n' && par2[a].v === 1000000 && !par2[a].f) celdaKg = a; });
check('encontré la celda de kilos en Parametros', !!celdaKg, `celda=${celdaKg}`);
par2[celdaKg].v = 800000;
sinCache(wb2);
const rec2 = recalcular(wb2, 'ciclo2');
const flujo2 = rec2.Sheets['Allegria Foods'];
const par2r  = rec2.Sheets['Parametros'];
const ing2 = leerLinea(flujo2, 'Anticipo Cerezas');
const cost2 = leerLinea(flujo2, 'Costo Fruta Exportación');

// Esperados con 800.000 kg (anticipos: a1 0,10 US$/kg con 60.000 cobrados;
// a2 0,05 US$/kg CERRADO con 20.000 cobrados; productor 0,10 con 70.000 pagados):
//   venta 480.000 · a1: acordado 80.000, pendiente 20.000 · a2: cerrado → 0
//   descuento liq = (60.000+20.000) + (20.000+0) = 100.000 → liq 380.000
//   costo neto 337.600 · b1: acordado 80.000, pendiente 10.000
//   descuento = 70.000+10.000 = 80.000 → saldo productor 257.600
check('[recalc·editado] Anticipo Cerezas Oct-26 = 20.000 (pendiente recalculado)', aprox(ing2?.['Oct-26'], 20000), `=${ing2?.['Oct-26']}`);
check('[recalc·editado] Anticipo Cerezas Nov-26 = 0 (anticipo cerrado)',           aprox(ing2?.['Nov-26'], 0),     `=${ing2?.['Nov-26']}`);
check('[recalc·editado] Liquidación Mar-27 = 380.000',                             aprox(ing2?.['Mar-27'], 380000),`=${ing2?.['Mar-27']}`);
check('[recalc·editado] Costo Fruta Oct-26 = 10.000',                              aprox(cost2?.['Oct-26'], 10000), `=${cost2?.['Oct-26']}`);
check('[recalc·editado] Saldo productor Mar-27 = 257.600',                         aprox(cost2?.['Mar-27'], 257600),`=${cost2?.['Mar-27']}`);

// El realizado sigue siendo el mismo monto histórico
{
  const realizados = Object.keys(par2r).filter(a => /^F\d+$/.test(a) && par2r[a]?.t === 'n' && !par2r[a].f).map(a => par2r[a].v);
  const tiene = (x) => realizados.some(v => aprox(v, x));
  check('[recalc·editado] realizado 60.000 intacto', tiene(60000), `F=${realizados.join(', ')}`);
  check('[recalc·editado] realizado 20.000 intacto', tiene(20000));
  check('[recalc·editado] realizado 70.000 intacto', tiene(70000));
}

// Identidad de caja: con 800.000 kg el flujo total sigue siendo venta − cobrado
{
  const totIng2 = Object.values(ing2||{}).reduce((a,b)=>a+b,0);
  check('[recalc·editado] total por cobrar = 480.000 − 80.000 ya cobrados = 400.000', aprox(totIng2, 400000), `=${totIng2}`);
  const totCost2 = Object.values(cost2||{}).reduce((a,b)=>a+b,0);
  check('[recalc·editado] total por pagar = 337.600 − 70.000 ya pagados = 267.600', aprox(totCost2, 267600), `=${totCost2}`);
}

console.log(fallos === 0 ? "\nRECÁLCULO REAL VERIFICADO ✓" : `\n${fallos} VERIFICACIÓN(ES) FALLARON ✗`);
process.exit(fallos === 0 ? 0 : 1);
