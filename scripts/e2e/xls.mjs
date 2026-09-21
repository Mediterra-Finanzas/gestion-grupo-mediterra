/* Recálculo REAL de un .xlsx: se borran los valores cacheados de toda celda con
   fórmula y se abre con LibreOffice Calc, que los vuelve a calcular. Lo que se
   lee después solo puede venir de evaluar las fórmulas. */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire('/home/user/gestion-grupo-mediterra/package.json');
const XLSXns = require('xlsx-js-style');
const XLSX = XLSXns.utils ? XLSXns : (XLSXns.default || XLSXns);

export function recalcular(archivo, dirTrabajo) {
  const wb = XLSX.readFile(archivo, { cellFormula: true });
  let n = 0;
  wb.SheetNames.forEach(nm => {
    const ws = wb.Sheets[nm];
    Object.keys(ws).forEach(a => {
      if (a[0] === '!') return;
      if (ws[a] && ws[a].f) { delete ws[a].v; delete ws[a].w; n++; }
    });
  });
  const base = path.basename(archivo, '.xlsx');
  const sinCache = path.join(dirTrabajo, `${base}__sincache.xlsx`);
  XLSX.writeFile(wb, sinCache, { bookType: 'xlsx' });
  const outDir = path.join(dirTrabajo, `${base}__recalc`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync('soffice', ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_e2e',
    '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', outDir, sinCache],
    { stdio: 'pipe', timeout: 300000 });
  const salida = path.join(outDir, path.basename(sinCache));
  if (!fs.existsSync(salida)) throw new Error(`LibreOffice no recalculó ${archivo}`);
  return { wb: XLSX.readFile(salida, { cellFormula: true }), formulasBorradas: n, archivo: salida };
}

// Lee una hoja de flujo → { concepto: { mes: valor } } usando la fila 3 (meses).
export function leerHojaFlujo(ws) {
  const filaMeses = 3;
  const cols = {};
  Object.keys(ws).forEach(a => {
    const m = /^([A-Z]+)(\d+)$/.exec(a);
    if (!m || Number(m[2]) !== filaMeses) return;
    const v = ws[a]?.v;
    if (typeof v === 'string' && /^[A-Z][a-z]{2}-\d{2}$/.test(v)) cols[v] = m[1];
  });
  const filas = {};
  Object.keys(ws).forEach(a => {
    const m = /^A(\d+)$/.exec(a);
    if (!m) return;
    const etiqueta = ws[a]?.v;
    if (typeof etiqueta !== 'string' || !etiqueta.trim()) return;
    const out = {};
    Object.entries(cols).forEach(([mes, col]) => {
      const c = ws[`${col}${m[1]}`];
      // celda ausente o vacía = SIN VALOR (no 0): así "—" en pantalla y celda
      // vacía en Excel se comparan como lo que son.
      out[mes] = (c && typeof c.v === 'number') ? c.v : undefined;
    });
    filas[etiqueta.trim()] = out;
  });
  return { filas, meses: Object.keys(cols) };
}
