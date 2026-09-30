/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// CRÉDITOS → FLUJO DE CAJA (una sola fuente de verdad)
//
// Lo que se verifica acá, con la app real (buildEmpresas + la misma
// inyección que usa FinanzasModule) y el Excel exportado:
//   · la línea "Pago Préstamos - Total" = pendiente de Créditos, por mes;
//   · Σ semanas = mes (la celda, el subtotal y el flujo neto semanal leen lo mismo);
//   · un valor manual antiguo sobre esa línea ya no la reemplaza;
//   · el Excel muestra lo mismo que la pantalla.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx-js-style';
import { buildEmpresas, buildEmpresasConOverrides, aplicarCreditosAEmpresas, claveLinea } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';
import { registrarPago } from '../creditos.js';

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const iM = (l) => MESES.indexOf(l);
const OUT_DIR = process.env.CRED_OUT_DIR || path.join(os.tmpdir(), 'creditos-flujo');

// 400.000 al 8% Act/360, capital 100.000 trimestral (caso 2 de src/creditos.test.mjs)
const c2 = { uid:'c2', n:900, tipo_credito:'contrato', empresa:'Osiris', acreedor:'Banco B', moneda:'USD',
  monto:400000, fecha_desembolso:'2026-01-10', primer_venc:'2026-04-10', vencimiento_final:'2027-01-10',
  periodicidad:3, modalidad:'lineal', tasa_tipo:'fija', tasa_anual:8, base:'act360' };
// Q1 (108.000) pagada en parte: interés 8.000 + capital 40.000 → quedan 60.000
const c2p = registrarPago(c2, { vencKey:'c2@2026-04-10', fecha:'2026-04-10', interes:8000, capital:40000 }, 'test');
// Registro antiguo: un vencimiento el día 1 (antes en Chile caía en el mes anterior)
const legacy = { uid:'L1', n:36, empresa:'Osiris', acreedor:'Privado', tipo_inst:'Privado', monto:550000, f_venc:'2027-01-01', tipo_cr:'Inversión', tasa:'12.6%', cuota:550000, pagado:false };

let empresas;
beforeAll(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(2026, 4, 20, 15, 0, 0));   // 20-may-2026, hora local
  empresas = aplicarCreditosAEmpresas(buildEmpresas({}, { cobros: [] }), [c2p, legacy]);
});
afterAll(() => jest.useRealTimers());

const linea = (emps, emp, label) => emps[emp].sections.find(s => s.cat === 'egr_nop').lines.find(l => l.label === label);

describe('Pago Préstamos desde Créditos', () => {
  test('mes a mes = pendiente de Créditos (con arrastre del impago)', () => {
    const l = linea(empresas, 'Osiris', 'Pago Préstamos - Total');
    expect(l._fuenteCreditos).toBe(true);
    expect(l.proy[iM('Apr-26')]).toBe(0);                            // ya no queda en el mes pasado
    expect(l.proy[iM('May-26')]).toBeCloseTo(60000, 2);              // 108.000 − 48.000 arrastrado a hoy
    expect(l.proy[iM('Jul-26')]).toBeCloseTo(106066.67, 2);          // 100.000 + 300.000×8%×91/360
    expect(l.proy[iM('Oct-26')]).toBeCloseTo(104088.89, 2);          // 100.000 + 200.000×8%×92/360
    expect(l.proy[iM('Jan-27')]).toBeCloseTo(102044.44 + 550000, 2); // Q4 + registro antiguo del 01-01-2027
    expect(l.proy[iM('Dec-26')]).toBe(0);
  });

  test('Σ semanas = mes en todos los meses', () => {
    const l = linea(empresas, 'Osiris', 'Pago Préstamos - Total');
    l.proy.forEach((v, i) => {
      const sem = l._semProy[i];
      const s = sem ? sem.reduce((a, x) => a + x, 0) : 0;
      expect(s).toBeCloseTo(v, 6);
    });
  });

  test('un valor manual antiguo sobre Pago Préstamos ya no reemplaza a Créditos', () => {
    const realData = { Osiris: { _proyOverrides: { [claveLinea('egr_nop', 'Pago Préstamos - Total')]: { [iM('Jul-26')]: 1 } } } };
    const cons = buildEmpresasConOverrides(empresas, realData, {}, {});
    expect(linea(cons, 'Osiris', 'Pago Préstamos - Total').proy[iM('Jul-26')]).toBeCloseTo(106066.67, 2);
  });

  test('el Excel muestra lo mismo que la pantalla', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const cons = buildEmpresasConOverrides(empresas, {}, {}, {});
    const file = path.join(OUT_DIR, 'osiris-creditos.xlsx');
    exportarFlujoEmpresa({ emp: cons['Osiris'], empName: 'Osiris', saldoIni: 0, fileName: file });
    const wb = XLSX.readFile(file, { cellFormula: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const col = (mes) => Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === mes).replace(/\d+$/, '');
    const fila = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === 'Pago Préstamos - Total').map(k => k.slice(1))[0];
    expect(fila).toBeDefined();
    const l = linea(cons, 'Osiris', 'Pago Préstamos - Total');
    ['May-26', 'Jul-26', 'Oct-26', 'Jan-27'].forEach(m => {
      expect(Number(ws[`${col(m)}${fila}`].v)).toBeCloseTo(l.proy[iM(m)], 2);
    });
  });

  test('empresas sin créditos quedan en cero (no se cuela nada de otra empresa)', () => {
    const l = linea(empresas, 'Frisku Foods', 'Pago Préstamos - Total');
    expect(l.proy.every(v => v === 0)).toBe(true);
  });
});
