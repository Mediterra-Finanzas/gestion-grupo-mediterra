/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROGRAMAS COMERCIALES EN EL FLUJO Y EN EL EXCEL — Allegria Foods
//
// Lo que se comprueba:
//   1. Registrar un programa NO cambia la proyección. Solo activarlo.
//   2. Con un lado activo, ese lado se calcula con sus programas y el
//      presupuesto que no quedó en ningún programa sigue proyectándose.
//   3. El total del lado nunca pasa del presupuesto.
//   4. Los dos lados son independientes.
//   5. El Excel lleva los mismos números que el árbol de la app, mes a mes.
//
// DATOS SINTÉTICOS: ni los kilos, ni los precios, ni las contrapartes
// corresponden a acuerdos reales.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx-js-style';
import { calcAllegria, buildEmpresas } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';

const OUT_DIR = process.env.ANTICIPOS_OUT_DIR || path.join(os.tmpdir(), 'programas-export');
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const iMes = (m) => MESES.indexOf(m);

// ── Parámetros sintéticos ─────────────────────────────────────────
// venta presupuesto = 500.000 kg × 3 = 1.500.000
// precio neto productor = 3×(1−10%) − 0,4 − 1,0 = 1,3 → costo = 650.000
const SIN_PROGRAMAS = () => ({ "2026-2027": { cerezas: {
  kg: 500000, fob_usd_kg: 3, desc_exp_pct: 10, mat_usd_kg: 0.4, srv_usd_kg: 1.0,
  anticipos_cliente: [{ id: "a1", mes: "Oct-26", usd_kg: 0.10,
                        realizaciones: [{ id: "r1", fecha: "2026-08-10", usd: 20000 }] }],
  mes_liquidacion: "Mar-27",
  anticipos_productor: [{ id: "b1", mes: "Oct-26", usd_kg: 0.10 }],
  mes_saldo_productor: "Mar-27",
  dist_mat: [], dist_srv: [], programas: [],
} } });

const PROGRAMA_CLIENTE = (activo) => ({
  id: "pg1", lado: "cliente", contraparte: "Cliente Sintético A",
  kilos: 200000, precio_modo: "usd_kg", precio_usd_kg: 3.2,     // total 640.000
  mes_liquidacion: "Mar-27", activo,
  anticipos: [{ id: "pa1", modalidad: "usd_kg", usd_kg: 0.5, mes: "Nov-26",   // acordado 100.000
                fecha_prevista: "2026-11-15", cerrado: false,
                realizaciones: [{ id: "pr1", fecha: "2026-08-01", usd: 40000 }] }],
  antecedentes: [],
});

const conProgramas = (programas) => {
  const p = SIN_PROGRAMAS();
  p["2026-2027"].cerezas.programas = programas;
  return p;
};

const ingCerezas = (params) => calcAllegria(params).ing.cerezas;
const costCerezas = (params) => calcAllegria(params).cost.cerezas;
const suma = (arr) => arr.reduce((a, b) => a + b, 0);

// ═══ 1. Registrar no es activar ════════════════════════════════════
test('un programa registrado pero no activo deja el flujo exactamente igual', () => {
  const base = ingCerezas(SIN_PROGRAMAS());
  const conRegistrado = ingCerezas(conProgramas([PROGRAMA_CLIENTE(false)]));
  expect(conRegistrado).toEqual(base);
});

test('la estimación de la fruta proyecta 480.000: 30.000 pendiente + 450.000 liquidación', () => {
  const ing = ingCerezas(SIN_PROGRAMAS());
  expect(Math.round(ing[iMes("Oct-26")])).toBe(30000);        // 50.000 acordado − 20.000 cobrado
  expect(Math.round(ing[iMes("Mar-27")])).toBe(1450000);      // 1.500.000 − 50.000 descontados
  expect(Math.round(suma(ing))).toBe(1480000);                // = presupuesto − lo ya cobrado
});

// ═══ 2 y 3. Activar reemplaza la estimación, con el presupuesto de techo ═══
test('con el programa activo manda el programa y el presupuesto sin programa se mantiene', () => {
  const ing = ingCerezas(conProgramas([PROGRAMA_CLIENTE(true)]));
  expect(Math.round(ing[iMes("Oct-26")])).toBe(0);            // la estimación dejó de regir
  expect(Math.round(ing[iMes("Nov-26")])).toBe(60000);        // 100.000 acordado − 40.000 cobrado
  // 540.000 liquidación del programa + 860.000 de presupuesto sin programa
  expect(Math.round(ing[iMes("Mar-27")])).toBe(1400000);
  expect(Math.round(suma(ing))).toBe(1460000);                // presupuesto 1.500.000 − 40.000 cobrados
});

test('el total proyectado del lado nunca pasa del presupuesto', () => {
  const dos = [PROGRAMA_CLIENTE(true), {
    ...PROGRAMA_CLIENTE(true), id: "pg2", contraparte: "Cliente Sintético B",
    kilos: 100000, precio_usd_kg: 3, anticipos: [],
  }];
  const ing = ingCerezas(conProgramas(dos));
  expect(Math.round(suma(ing))).toBe(1460000);                // sigue siendo presupuesto − cobrado
});

// ═══ 4. Los dos lados son independientes ═══════════════════════════
test('activar programas de cliente no toca el costo del productor', () => {
  const baseCost = costCerezas(SIN_PROGRAMAS());
  const conProg  = costCerezas(conProgramas([PROGRAMA_CLIENTE(true)]));
  expect(conProg).toEqual(baseCost);
  expect(Math.round(baseCost[iMes("Oct-26")])).toBe(50000);   // 0,10 × 500.000, sin pagos registrados
  expect(Math.round(baseCost[iMes("Mar-27")])).toBe(600000);  // 650.000 − 50.000
});

test('un programa de productor activo solo cambia el costo', () => {
  const prog = {
    id: "pp1", lado: "productor", contraparte: "Productor Sintético Sur",
    kilos: 300000, precio_modo: "usd_kg", precio_usd_kg: 1.2,   // costo del programa 360.000
    mes_liquidacion: "Mar-27", activo: true, antecedentes: [],
    anticipos: [{ id: "pb1", modalidad: "monto", monto: 90000, mes: "Dec-26", realizaciones: [] }],
  };
  const params = conProgramas([prog]);
  const cost = costCerezas(params);
  expect(Math.round(cost[iMes("Oct-26")])).toBe(0);
  expect(Math.round(cost[iMes("Dec-26")])).toBe(90000);
  // 270.000 saldo del programa + 290.000 de presupuesto sin programa
  expect(Math.round(cost[iMes("Mar-27")])).toBe(560000);
  expect(Math.round(suma(cost))).toBe(650000);
  // y el ingreso sigue con su estimación
  expect(ingCerezas(params)).toEqual(ingCerezas(SIN_PROGRAMAS()));
});

// ═══ 5. El Excel lleva lo mismo que la app ═════════════════════════
describe('Excel con programas activos', () => {
  const CAT_XLS = {
    ing_op: '· Ingresos Operacionales', ing_nop: '· Ingresos No Operacionales',
    egr_var: '· Egresos Operacionales (variables)', egr_fijo: '· Costos Fijos / SG&A',
    egr_nop: '· Egresos No Operacionales', imp: '· Impuestos',
  };
  function leerHoja(ws) {
    const cols = {};
    Object.keys(ws).forEach(a => {
      const m = /^([A-Z]+)3$/.exec(a); if (!m) return;
      const v = ws[a]?.v;
      if (typeof v === 'string' && /^[A-Z][a-z]{2}-\d{2}$/.test(v)) cols[v] = m[1];
    });
    const filas = {};
    Object.keys(ws).forEach(a => {
      const m = /^A(\d+)$/.exec(a); if (!m) return;
      const et = ws[a]?.v;
      if (typeof et !== 'string' || !et.trim()) return;
      const o = {};
      Object.entries(cols).forEach(([mes, col]) => {
        const c = ws[`${col}${m[1]}`];
        o[mes] = (c && typeof c.v === 'number') ? c.v : undefined;
      });
      filas[et.trim()] = o;
    });
    return filas;
  }

  beforeAll(() => fs.mkdirSync(OUT_DIR, { recursive: true }));

  test('la hoja de flujo cuadra con el árbol de la app, mes a mes', () => {
    const paramsAllegria = conProgramas([PROGRAMA_CLIENTE(true)]);
    const PARAMS = { paramsAllegria, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(paramsAllegria, PARAMS.allegraComisionArandanos);
    const emp = empresas['Allegria Foods'];
    const file = path.join(OUT_DIR, 'programas-allegria.xlsx');
    exportarFlujoEmpresa({ emp, empName: 'Allegria Foods', saldoIni: 10000, fileName: file, params: PARAMS });
    const wb = XLSX.readFile(file, { cellFormula: true });
    const hoja = wb.SheetNames.find(n => n !== 'Parametros');
    const filas = leerHoja(wb.Sheets[hoja]);

    Object.entries(CAT_XLS).forEach(([cat, etiqueta]) => {
      const sec = (emp.sections || []).find(s => s.cat === cat);
      const app = MESES.map((_, i) => (sec ? sec.lines.reduce((a, l) => a + (Number(l.proy[i]) || 0), 0) : 0));
      const fila = filas[etiqueta];
      if (!fila) { expect(app.every(v => v === 0)).toBe(true); return; }
      MESES.forEach((mes, i) => {
        const xls = fila[mes] === undefined ? 0 : fila[mes];
        expect(`${mes}:${Math.round(xls)}`).toBe(`${mes}:${Math.round(app[i])}`);
      });
    });
  });

  test('la hoja Parametros trae el desglose por contraparte y no la estimación', () => {
    const paramsAllegria = conProgramas([PROGRAMA_CLIENTE(true)]);
    const PARAMS = { paramsAllegria, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(paramsAllegria, PARAMS.allegraComisionArandanos);
    const file = path.join(OUT_DIR, 'programas-allegria-params.xlsx');
    exportarFlujoEmpresa({ emp: empresas['Allegria Foods'], empName: 'Allegria Foods',
                           saldoIni: 0, fileName: file, params: PARAMS });
    const wb = XLSX.readFile(file, { cellFormula: true });
    const ws = wb.Sheets['Parametros'];
    const textos = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))
      .map(k => ws[k]?.v).filter(v => typeof v === 'string');
    expect(textos.some(t => t.includes('Cliente Sintético A'))).toBe(true);
    expect(textos.some(t => t.includes('Presupuesto sin programa'))).toBe(true);
    // El lado productor sigue con su estimación, así que su liquidación sigue estando
    expect(textos.some(t => t.includes('Saldo productor'))).toBe(true);

    // El realizado (columna F) va como constante, nunca como fórmula: es histórico.
    const celdasRealizado = Object.keys(ws).filter(k => /^F\d+$/.test(k))
      .map(k => ws[k]).filter(c => c && c.v === 40000);
    expect(celdasRealizado.length).toBeGreaterThan(0);
    celdasRealizado.forEach(c => expect(c.f).toBeUndefined());
  });
});
