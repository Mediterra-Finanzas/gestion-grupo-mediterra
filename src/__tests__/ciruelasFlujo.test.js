/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// CIRUELAS → FLUJO DE ALLEGRIA FOODS (oct-2026)
//
// Antes solo el INGRESO de ciruelas tenía línea en el flujo: el costo de
// fruta, los materiales y los servicios se calculaban y no llegaban a
// ninguna parte, así que activar el ingreso sobrestimaba la caja.
// Acá se fija, con DATOS SINTÉTICOS y parámetros PROPIOS de ciruelas
// (distintos de los de cerezas):
//   · las cuatro líneas del flujo = calcAllegria, mes a mes;
//   · cerezas no cambia por cargar ciruelas;
//   · el diagnóstico dice qué falta y avisa ingreso sin egresos;
//   · (RECALC=1) el Excel recalculado en LibreOffice = la app.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import * as XLSX from 'xlsx-js-style';
import { calcAllegria, buildEmpresas, diagnosticoCiruelas, avisosCiruelas } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';
import { MESES, mesIdxActual } from '../horizonte.js';
import { MODELO_VERSION } from '../programas.js';

const corte = mesIdxActual();
const M = (k) => MESES[corte + k];
const SK = '2026-2027';

const cerezas = {
  kg: 1000000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], mes_liquidacion: M(5), anticipos_productor: [], mes_saldo_productor: M(5),
  dist_mat: [], dist_srv: [], programas: [],
};
// Parámetros propios de ciruelas (ninguno coincide con cerezas).
const ciruelasCompleta = {
  kg: 200000, fob_usd_kg: 2.2, desc_exp_pct: 6, mat_usd_kg: 0.3, srv_usd_kg: 0.25,
  anticipos_cliente: [{ id: 'ec1', mes: M(2), usd_kg: 0.5, v: MODELO_VERSION, realizaciones: [] }],
  mes_liquidacion: M(6),
  anticipos_productor: [{ id: 'ep1', mes: M(3), usd_kg: 0.4, v: MODELO_VERSION, realizaciones: [] }],
  mes_saldo_productor: M(7),
  dist_mat: [{ mes: M(1), pct: 60 }, { mes: M(2), pct: 40 }],
  dist_srv: [{ mes: M(3), pct: 100 }],
  programas: [],
};
const params = (cir) => ({ [SK]: { cerezas, ciruelas: cir } });
const linea = (emp, label) => emp.sections.flatMap(s => s.lines).find(l => l.label === label);

describe('ciruelas: líneas del flujo', () => {
  const p = params(ciruelasCompleta);
  const r = calcAllegria(p);
  const emp = buildEmpresas(p, { cobros: [] })['Allegria Foods'];

  test('las cuatro líneas existen y son = calcAllegria', () => {
    expect(linea(emp, 'Liquidación Ciruelas').proy).toEqual(r.ing.ciruelas);
    expect(linea(emp, 'Costo Fruta Ciruelas').proy).toEqual(r.cost.ciruelas);
    expect(linea(emp, 'Materiales Ciruelas').proy).toEqual(r.mat.ciruelas);
    expect(linea(emp, 'Servicios de Packing Ciruelas').proy).toEqual(r.srv.ciruelas);
  });

  test('cuadre aritmético con los parámetros propios', () => {
    const suma = (a) => a.reduce((x, v) => x + v, 0);
    // ingreso = 200.000 × 2,2 = 440.000 (anticipo 100.000 en M2 + liquidación 340.000 en M6)
    expect(Math.round(suma(r.ing.ciruelas))).toBe(440000);
    expect(Math.round(r.ing.ciruelas[corte + 2])).toBe(100000);
    // costo neto = 200.000 × (2,2 × 0,94 − 0,30 − 0,25) = 200.000 × 1,518 = 303.600
    expect(Math.round(suma(r.cost.ciruelas))).toBe(303600);
    expect(Math.round(r.cost.ciruelas[corte + 3])).toBe(80000);    // anticipo 0,4 × 200.000
    expect(Math.round(r.cost.ciruelas[corte + 7])).toBe(223600);   // saldo productor
    // materiales 60.000 (36.000 + 24.000) · servicios 50.000
    expect(Math.round(r.mat.ciruelas[corte + 1])).toBe(36000);
    expect(Math.round(r.mat.ciruelas[corte + 2])).toBe(24000);
    expect(Math.round(r.srv.ciruelas[corte + 3])).toBe(50000);
  });

  test('cargar ciruelas no cambia cerezas', () => {
    const solo = calcAllegria({ [SK]: { cerezas } });
    ['ing', 'cost', 'mat', 'srv'].forEach(k => expect(r[k].cerezas).toEqual(solo[k].cerezas));
  });

  test('diagnóstico: completo, sin avisos de ingreso sin egreso', () => {
    const dg = diagnosticoCiruelas(ciruelasCompleta, SK);
    expect(dg.faltantes).toEqual([]);
    expect(dg.ingresoSinEgreso).toBe(false);
    expect(avisosCiruelas(p)).toEqual([]);
  });
});

describe('ciruelas: datos faltantes', () => {
  test('solo kilos y FOB (como hoy): lista lo que falta, no proyecta nada', () => {
    const cir = { kg: 850000, fob_usd_kg: 4.5, desc_exp_pct: 8, mat_usd_kg: 0, srv_usd_kg: 0,
      anticipos_cliente: [], mes_liquidacion: '', anticipos_productor: [], mes_saldo_productor: '',
      dist_mat: [], dist_srv: [], programas: [] };
    const dg = diagnosticoCiruelas(cir, SK);
    expect(dg.faltantes).toEqual(expect.arrayContaining(['materiales US$/kg', 'servicios de packing US$/kg',
      'mes de liquidación del cliente', 'mes de saldo al productor']));
    expect(dg.ingreso).toBe(0);
    expect(dg.ingresoSinEgreso).toBe(false);
    expect(avisosCiruelas(params(cir)).some(a => a.includes('faltan'))).toBe(true);
  });

  test('ingreso activado sin egresos: aviso de caja sobrestimada', () => {
    const cir = { ...ciruelasCompleta, anticipos_productor: [], mes_saldo_productor: '', mat_usd_kg: 0, srv_usd_kg: 0, dist_mat: [], dist_srv: [] };
    const dg = diagnosticoCiruelas(cir, SK);
    expect(dg.ingresoSinEgreso).toBe(true);
    expect(dg.egresosEnCero).toEqual(['costo de fruta', 'materiales', 'servicios de packing']);
    const av = avisosCiruelas(params(cir));
    expect(av.some(a => /sobrestimada/.test(a) && /440,000|440\.000/.test(a))).toBe(true);
  });

  test('calendario de materiales que no suma 100%', () => {
    const cir = { ...ciruelasCompleta, dist_mat: [{ mes: M(1), pct: 60 }] };
    expect(diagnosticoCiruelas(cir, SK).faltantes.some(f => f.includes('suma 60%'))).toBe(true);
  });
});

// ── Excel recalculado (requiere soffice) ──
const correr = process.env.RECALC === '1' ? describe : describe.skip;
correr('ciruelas: Excel recalculado = app', () => {
  const OUT = path.join(os.tmpdir(), 'ciruelas-recalc');
  test('cuatro líneas de ciruelas y las de cerezas, mes a mes', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const p = params(ciruelasCompleta);
    const PARAMS = { paramsAllegria: p, allegraComisionArandanos: { cobros: [] } };
    const emp = buildEmpresas(p, PARAMS.allegraComisionArandanos)['Allegria Foods'];
    const file = path.join(OUT, 'cir.xlsx');
    exportarFlujoEmpresa({ emp, empName: 'Allegria Foods', saldoIni: 0, fileName: file, params: PARAMS });
    const wb0 = XLSX.readFile(file, { cellFormula: true });
    const conFormula = new Set();
    wb0.SheetNames.forEach(nm => Object.keys(wb0.Sheets[nm]).forEach(a => {
      const c = wb0.Sheets[nm][a];
      if (a[0] !== '!' && c && c.f) { conFormula.add(`${nm}!${a}`); delete c.v; delete c.w; }
    }));
    const sc = path.join(OUT, 'cir__sc.xlsx'); XLSX.writeFile(wb0, sc, { bookType: 'xlsx' });
    const rcDir = path.join(OUT, 'rc'); fs.rmSync(rcDir, { recursive: true, force: true }); fs.mkdirSync(rcDir);
    execFileSync('soffice', ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_cir',
      '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', rcDir, sc], { stdio: 'pipe', timeout: 300000 });
    const wb = XLSX.readFile(path.join(rcDir, 'cir__sc.xlsx'));
    const nombre = wb.SheetNames.find(n => n !== 'Parametros' && n !== 'Servicio deuda');
    const ws = wb.Sheets[nombre];
    const col = {};
    Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).forEach(k => { col[ws[k].v] = k.replace(/\d+$/, ''); });
    const serie = (et) => {
      const fila = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === et).map(k => Number(k.slice(1)))[0];
      expect(fila).toBeTruthy();
      expect(conFormula.has(`${nombre}!${col[MESES[0]]}${fila}`)).toBe(true);
      return MESES.map(m => Number(ws[`${col[m]}${fila}`]?.v ?? 0));
    };
    const r = calcAllegria(p);
    [['Liquidación Ciruelas', r.ing.ciruelas], ['Costo Fruta Ciruelas', r.cost.ciruelas],
     ['Materiales Ciruelas', r.mat.ciruelas], ['Servicios de Packing Ciruelas', r.srv.ciruelas],
     ['Anticipo Cerezas', r.ing.cerezas], ['Costo Fruta Exportación', r.cost.cerezas]].forEach(([et, app]) => {
      const x = serie(et);
      MESES.forEach((m, i) => expect(`${et} ${m}=${Math.round(x[i])}`).toBe(`${et} ${m}=${Math.round(app[i])}`));
    });
    const errores = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k) && ws[k]?.t === 'e');
    expect(errores).toEqual([]);
  });
});
