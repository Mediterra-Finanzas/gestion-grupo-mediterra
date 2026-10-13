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
import { calcAllegria, buildEmpresas, diagnosticoCiruelas, avisosCiruelas, avisosCerezas, avisoFrutaSinVolumen } from '../FinanzasModule.jsx';
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

  test('costo de fruta en 0 porque el productor YA está pagado: no es «ingreso sin egreso»', () => {
    const base = ciruelasCompleta.kg * Math.max(0, 2.2 * 0.94 - 0.3 - 0.25);   // 303.600
    const cir = { ...ciruelasCompleta,
      anticipos_productor: [{ id: 'ep1', mes: M(3), usd_kg: 0.4, v: MODELO_VERSION, cerrado: true,
        realizaciones: [{ id: 'rp1', fecha: '2026-09-01', usd: base }] }] };
    const r = calcAllegria(params(cir));
    expect(r.cost.ciruelas.reduce((a, v) => a + v, 0)).toBe(0);
    const dg = diagnosticoCiruelas(cir, SK);
    expect(dg.egresosEnCero).not.toContain('costo de fruta');
    expect(dg.ingresoSinEgreso).toBe(false);
  });

  // El aviso de fruta sin volumen dice lo que el motor hace (hallazgo de la
  // revisión de 2f881a0: afirmaba que nada de eso se proyectaba).
  test('aviso sin volumen: kilos sin FOB proyectan la estimación US$/kg; con definitiva se proyecta la liquidación', () => {
    const prog = [{ id: 'pc', lado: 'cliente', contraparte: 'C', kilos: 0, v: MODELO_VERSION,
      cuotas: [{ id: 'q', mes: M(1), modalidad: 'monto', monto: 80000, estado: 'vigente', v: MODELO_VERSION, realizaciones: [], sustituye: [] }] }];
    const kgSinFob = { kg: 100000, fob_usd_kg: 0, anticipos_cliente: [{ id: 'e', mes: M(3), usd_kg: 0.5, v: MODELO_VERSION, realizaciones: [] }],
      anticipos_productor: [], dist_mat: [], dist_srv: [], programas: prog, mes_liquidacion: '', mes_saldo_productor: '' };
    const r1 = calcAllegria({ [SK]: { cerezas: kgSinFob } });
    expect(r1.ing.cerezas[corte + 3]).toBe(50000);
    const a1 = avisoFrutaSinVolumen(kgSinFob, 'Cerezas', SK);
    expect(a1).toMatch(/faltan FOB US\$\/kg\. Se proyectan: programas por contraparte, saldos a favor, estimaciones por US\$\/kg \(sobre los kilos cargados\)/);
    expect(a1).not.toMatch(/NO se proyectan:[^.]*estimaciones/);
    const conDef = { ...kgSinFob, kg: 0, anticipos_cliente: [], mes_liquidacion: M(4), liq_definitiva_cliente: { total: 250000 } };
    const r2 = calcAllegria({ [SK]: { cerezas: conDef } });
    expect(r2.ing.cerezas[corte + 4]).toBe(170000);
    const a2 = avisoFrutaSinVolumen(conDef, 'Cerezas', SK);
    expect(a2).toMatch(/Se proyectan: [^.]*liquidación definitiva del cliente/);
    expect(a2).toMatch(/NO se proyectan: materiales, servicios, estimaciones por US\$\/kg, saldo del productor/);
    // definitiva SIN mes: la app no la proyecta y el aviso lo dice (revisión de ee4c403)
    const sinMes = { ...conDef, mes_liquidacion: '' };
    expect(calcAllegria({ [SK]: { cerezas: sinMes } }).ing.cerezas.reduce((x, v) => x + v, 0)).toBe(80000);
    const a3 = avisoFrutaSinVolumen(sinMes, 'Cerezas', SK);
    expect(a3).toMatch(/NO se proyectan: [^.]*liquidación definitiva del cliente \(falta el mes de liquidación\)/);
    expect(a3).not.toMatch(/Se proyectan: [^.]*liquidación definitiva del cliente/);
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

  // Cerezas sin kilos ni FOB (mismo defecto que ciruelas): un programa de
  // cliente con una cuota vigente y otra ya cobrada (histórica), y un programa
  // de productor con una cuota vigente. El Excel debe proyectar lo mismo que
  // la app y el archivo debe decir qué falta.
  test('cerezas sin kilos ni FOB, con programas: Excel = app y aviso de faltantes', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const cer = { kg: 0, fob_usd_kg: 0, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
      anticipos_cliente: [], mes_liquidacion: '', anticipos_productor: [], mes_saldo_productor: '',
      dist_mat: [], dist_srv: [],
      programas: [
        { id: 'pc1', lado: 'cliente', contraparte: 'Cliente Sintético', kilos: 0, v: MODELO_VERSION,
          cuotas: [
            { id: 'cc1', mes: M(1), modalidad: 'monto', monto: 80000, estado: 'vigente', v: MODELO_VERSION, realizaciones: [], sustituye: [] },
            { id: 'cc0', mes: M(0), modalidad: 'monto', monto: 30000, estado: 'vigente', v: MODELO_VERSION, sustituye: [],
              realizaciones: [{ id: 'rc0', fecha: '2026-09-15', usd: 30000 }] }] },
        { id: 'pp1', lado: 'productor', contraparte: 'Productor Sintético', kilos: 0, v: MODELO_VERSION,
          cuotas: [{ id: 'cp1', mes: M(2), modalidad: 'monto', monto: 45000, estado: 'vigente', v: MODELO_VERSION, realizaciones: [], sustituye: [] }] }] };
    const p = { [SK]: { cerezas: cer, ciruelas: ciruelasCompleta } };
    const r = calcAllegria(p);
    expect(r.ing.cerezas[corte + 1]).toBe(80000);
    expect(r.cost.cerezas[corte + 2]).toBe(45000);
    expect(r.ing.cerezas.reduce((a, v) => a + v, 0)).toBe(80000);   // lo ya cobrado no se vuelve a proyectar
    const av = avisosCerezas(p);
    expect(av.length).toBe(1);
    expect(av[0]).toMatch(/Cerezas 2026-2027: faltan kilos y FOB US\$\/kg\. Se proyectan: programas por contraparte, saldos a favor\. NO se proyectan: materiales, servicios, estimaciones por US\$\/kg/);
    const PARAMS = { paramsAllegria: p, allegraComisionArandanos: { cobros: [] } };
    const emp = buildEmpresas(p, PARAMS.allegraComisionArandanos)['Allegria Foods'];
    const file = path.join(OUT, 'cer0.xlsx');
    exportarFlujoEmpresa({ emp, empName: 'Allegria Foods', saldoIni: 0, fileName: file, params: PARAMS, avisos: av });
    const wb0 = XLSX.readFile(file, { cellFormula: true });
    wb0.SheetNames.forEach(nm => Object.keys(wb0.Sheets[nm]).forEach(a => {
      const c = wb0.Sheets[nm][a]; if (a[0] !== '!' && c && c.f) { delete c.v; delete c.w; }
    }));
    const sc = path.join(OUT, 'cer0__sc.xlsx'); XLSX.writeFile(wb0, sc, { bookType: 'xlsx' });
    const rcDir = path.join(OUT, 'rcc0'); fs.rmSync(rcDir, { recursive: true, force: true }); fs.mkdirSync(rcDir);
    execFileSync('soffice', ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_cir',
      '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', rcDir, sc], { stdio: 'pipe', timeout: 300000 });
    const wb = XLSX.readFile(path.join(rcDir, 'cer0__sc.xlsx'));
    const ws = wb.Sheets[wb.SheetNames.find(n => n !== 'Parametros' && n !== 'Servicio deuda')];
    const col = {};
    Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).forEach(k => { col[ws[k].v] = k.replace(/\d+$/, ''); });
    let vistas = 0;
    [['Anticipo Cerezas', r.ing.cerezas], ['Costo Fruta Exportación', r.cost.cerezas],
     ['Liquidación Ciruelas', r.ing.ciruelas], ['Costo Fruta Ciruelas', r.cost.ciruelas]].forEach(([et, app]) => {
      const fila = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === et).map(k => Number(k.slice(1)))[0];
      if (!fila) { expect(`${et} ${app.reduce((a, v) => a + Math.abs(v), 0)}`).toBe(`${et} 0`); return; }
      vistas++;
      MESES.forEach((m, i) => expect(`${et} ${m}=${Math.round(Number(ws[`${col[m]}${fila}`]?.v ?? 0))}`).toBe(`${et} ${m}=${Math.round(app[i])}`));
    });
    expect(vistas).toBe(4);
    const textos = Object.values(ws).filter(c => c && c.t === 's').map(c => String(c.v));
    expect(textos.some(t => t.includes('Cerezas 2026-2027: faltan kilos y FOB'))).toBe(true);
  });

  // Hallazgo de la revisión de 55bc762: sin kilos/FOB, la app proyectaba la
  // cuota vigente del productor y el Excel la omitía (0).
  test('sin kilos ni FOB, con una cuota vigente del productor: Excel = app', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const cir = { kg: 0, fob_usd_kg: 0, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
      anticipos_cliente: [], mes_liquidacion: '', anticipos_productor: [], mes_saldo_productor: '',
      dist_mat: [], dist_srv: [],
      programas: [{ id: 'pp1', lado: 'productor', contraparte: 'Productor Sintético', kilos: 0, v: MODELO_VERSION,
        cuotas: [{ id: 'cq1', mes: M(2), modalidad: 'monto', monto: 50000, estado: 'vigente', v: MODELO_VERSION,
          realizaciones: [], sustituye: [] }] }] };
    const p = params(cir);
    const r = calcAllegria(p);
    expect(r.cost.ciruelas[corte + 2]).toBe(50000);
    let vioCosto = false;
    const PARAMS = { paramsAllegria: p, allegraComisionArandanos: { cobros: [] } };
    const emp = buildEmpresas(p, PARAMS.allegraComisionArandanos)['Allegria Foods'];
    const file = path.join(OUT, 'cir0.xlsx');
    exportarFlujoEmpresa({ emp, empName: 'Allegria Foods', saldoIni: 0, fileName: file, params: PARAMS });
    const wb0 = XLSX.readFile(file, { cellFormula: true });
    wb0.SheetNames.forEach(nm => Object.keys(wb0.Sheets[nm]).forEach(a => {
      const c = wb0.Sheets[nm][a]; if (a[0] !== '!' && c && c.f) { delete c.v; delete c.w; }
    }));
    const sc = path.join(OUT, 'cir0__sc.xlsx'); XLSX.writeFile(wb0, sc, { bookType: 'xlsx' });
    const rcDir = path.join(OUT, 'rc0'); fs.rmSync(rcDir, { recursive: true, force: true }); fs.mkdirSync(rcDir);
    execFileSync('soffice', ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_cir',
      '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', rcDir, sc], { stdio: 'pipe', timeout: 300000 });
    const wb = XLSX.readFile(path.join(rcDir, 'cir0__sc.xlsx'));
    const ws = wb.Sheets[wb.SheetNames.find(n => n !== 'Parametros' && n !== 'Servicio deuda')];
    const col = {};
    Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).forEach(k => { col[ws[k].v] = k.replace(/\d+$/, ''); });
    [['Costo Fruta Ciruelas', r.cost.ciruelas], ['Liquidación Ciruelas', r.ing.ciruelas],
     ['Materiales Ciruelas', r.mat.ciruelas], ['Servicios de Packing Ciruelas', r.srv.ciruelas]].forEach(([et, app]) => {
      const fila = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === et).map(k => Number(k.slice(1)))[0];
      // una línea en cero en todo el horizonte no se exporta: entonces la app también es 0
      if (!fila) { expect(`${et} ${app.reduce((a, v) => a + Math.abs(v), 0)}`).toBe(`${et} 0`); return; }
      if (et === 'Costo Fruta Ciruelas') vioCosto = true;
      MESES.forEach((m, i) => expect(`${et} ${m}=${Math.round(Number(ws[`${col[m]}${fila}`]?.v ?? 0))}`).toBe(`${et} ${m}=${Math.round(app[i])}`));
    });
    expect(vioCosto).toBe(true);
  });
});

// Efecto de conectar ciruelas sobre los datos ENTREGADOS (solo lectura):
// FINANZAS_JSON=<archivo con el `value` de la fila finanzas>. Escribe, por
// temporada y mes, las tres líneas de egreso nuevas (las que antes no llegaban
// al flujo) y el ingreso de ciruelas, que no cambia. Separado a propósito de
// la vista semanal, que no cambia ningún total mensual.
const archivoFin = process.env.FINANZAS_JSON;
(archivoFin ? describe : describe.skip)('ciruelas: efecto sobre los datos entregados', () => {
  test('egresos nuevos de ciruelas por mes', () => {
    let v = JSON.parse(fs.readFileSync(archivoFin, 'utf8'));
    if (typeof v === 'string') v = JSON.parse(v);
    if (Array.isArray(v)) v = v[0]?.value ?? v[0];
    if (typeof v === 'string') v = JSON.parse(v);
    const p = v.allegria_params || {};
    const r = calcAllegria(p);
    const filas = [['mes', 'liquidacion_ciruelas (sin cambio)', 'costo_fruta_ciruelas (nuevo)', 'materiales_ciruelas (nuevo)', 'servicios_ciruelas (nuevo)', 'efecto_neto_flujo']];
    let tot = 0;
    MESES.forEach((m, i) => {
      const nuevo = r.cost.ciruelas[i] + r.mat.ciruelas[i] + r.srv.ciruelas[i];
      if (!nuevo && !r.ing.ciruelas[i]) return;
      tot += nuevo;
      filas.push([m, r.ing.ciruelas[i], r.cost.ciruelas[i], r.mat.ciruelas[i], r.srv.ciruelas[i], -nuevo].map(x => typeof x === 'number' ? Math.round(x * 100) / 100 : x));
    });
    const av = [...avisosCerezas(p), ...avisosCiruelas(p)];
    const out = process.env.OUT_DIR || path.join(os.tmpdir(), 'efecto-ciruelas');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'efecto-ciruelas.csv'), filas.map(f => f.join(';')).join('\n') + `\nTOTAL;;;;;${-Math.round(tot * 100) / 100}\n\nAVISOS\n${av.join('\n')}\n`);
    console.log(`efecto neto de ciruelas en el flujo: ${-Math.round(tot)} → ${path.join(out, 'efecto-ciruelas.csv')}`);
    expect(Number.isFinite(tot)).toBe(true);
  });
});

