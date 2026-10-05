/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// INTEGRACIÓN · posiciones, saldos a favor, compatibilidad y reloj
//
// Comprueba contra el flujo real de la app (calcAllegria / buildEmpresas) y
// contra el Excel exportado. DATOS SINTÉTICOS.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx-js-style';
import { calcAllegria, buildEmpresas } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';
import { MESES, mIdx, mesActual, mesIdxActual, generarMeses } from '../horizonte.js';
import { registrarDecisionSinFecha, MODELO_VERSION } from '../programas.js';

const OUT_DIR = process.env.ANTICIPOS_OUT_DIR || path.join(os.tmpdir(), 'integracion-saldos');
const iMes = (m) => MESES.indexOf(m);
const suma = (arr) => arr.reduce((a, b) => a + b, 0);

// ═══ 1. Horizonte de los datos vs mes de corte ═════════════════════
describe('horizonte y corte', () => {
  test('el horizonte de los datos no se mueve con el tiempo', () => {
    expect(MESES[0]).toBe('Apr-26');
    expect(MESES[MESES.length - 1]).toBe('Jun-31');
    expect(MESES.length).toBe(63);
    // Un índice guardado sigue apuntando al mismo mes: es lo que da sentido a
    // los overrides, cuotas y sublíneas ya grabadas.
    expect(MESES[6]).toBe('Oct-26');
    expect(mIdx('Oct-26')).toBe(6);
    expect(generarMeses().map(x => x.label)).toEqual(MESES);
  });

  test.each([
    [new Date(2026, 3, 1),  'Apr-26', 0],
    [new Date(2026, 9, 15), 'Oct-26', 6],
    [new Date(2026, 10, 1), 'Nov-26', 7],   // cambio de mes
    [new Date(2027, 0, 5),  'Jan-27', 9],   // cambio de año
    [new Date(2031, 5, 30), 'Jun-31', 62],  // último mes del horizonte
  ])('el corte sigue al reloj: %s', (hoy, etiqueta, idx) => {
    expect(mesActual(hoy)).toBe(etiqueta);
    expect(mesIdxActual(hoy)).toBe(idx);
  });

  test('una fecha fuera del horizonte no inventa un corte', () => {
    expect(mesIdxActual(new Date(2025, 0, 1))).toBe(-1);
    expect(mesIdxActual(new Date(2032, 0, 1))).toBe(-1);
  });
});

// ═══ Parámetros sintéticos ═════════════════════════════════════════
// venta 500.000 kg × US$1 = 500.000 · retorno productor = 500.000
const MES_A = 'Nov-26', MES_B = 'Dec-26', MES_LIQ = 'Mar-27';
const base = (over = {}) => ({ "2026-2027": { cerezas: {
  kg: 500000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], mes_liquidacion: MES_LIQ,
  anticipos_productor: [], mes_saldo_productor: MES_LIQ,
  dist_mat: [], dist_srv: [], programas: [], ...over,
} } });
const ing = (p) => calcAllegria(p).ing.cerezas;
const cost = (p) => calcAllegria(p).cost.cerezas;
const recup = (p) => calcAllegria(p).recup.cerezas;
const devol = (p) => calcAllegria(p).devol.cerezas;

const prog = (o) => ({ id: 'p1', lado: 'cliente', contraparte: 'A', kilos: 500000,
  mes_liquidacion: MES_A, cuotas: [], ...o });

// ═══ 2. Posiciones individuales: sin compensar contrapartes ════════
describe('posiciones individuales en el flujo', () => {
  const dos = (lado) => base({ programas: [
    prog({ id: 'pA', lado, contraparte: 'A', presupuesto_asignado: 100000, importe_definitivo: 100000,
      mes_liquidacion: MES_A, cuotas: [
        { id: 'ca', mes: MES_A, modalidad: 'monto', monto: 120000, estado: 'vigente',
          realizaciones: [{ id: 'ra', fecha: '2026-08-01', usd: 120000 }] }] }),
    prog({ id: 'pB', lado, contraparte: 'B', presupuesto_asignado: 100000, importe_definitivo: 100000,
      mes_liquidacion: MES_B, cuotas: [] }),
  ]});

  test.each([['cliente'], ['productor']])('%s: el flujo muestra 100.000 de B, no 80.000 netos', (lado) => {
    const serie = lado === 'cliente' ? ing(dos(lado)) : cost(dos(lado));
    expect(Math.round(serie[iMes(MES_B)])).toBe(100000);     // B, en su mes
    expect(Math.round(serie[iMes(MES_A)])).toBe(0);          // A ya cobró de más
    // el bloque residual (300.000 de presupuesto no asignado) liquida aparte
    expect(Math.round(serie[iMes(MES_LIQ)])).toBe(300000);
    expect(Math.round(suma(serie))).toBe(400000);
  });

  test('pasar una operación del bloque a individual no duplica sus movimientos', () => {
    const enBloque = base({ programas: [prog({ cuotas: [
      { id: 'c1', mes: MES_A, modalidad: 'monto', monto: 100000, estado: 'vigente',
        realizaciones: [{ id: 'r1', fecha: '2026-08-01', usd: 40000 }] }] })] });
    const individual = base({ programas: [prog({ presupuesto_asignado: 150000, cuotas: [
      { id: 'c1', mes: MES_A, modalidad: 'monto', monto: 100000, estado: 'vigente',
        realizaciones: [{ id: 'r1', fecha: '2026-08-01', usd: 40000 }] }] })] });
    // El realizado se cuenta una sola vez en los dos casos: el total del lado
    // baja exactamente en lo ya cobrado.
    expect(Math.round(suma(ing(enBloque)))).toBe(500000 - 40000);
    expect(Math.round(suma(ing(individual)))).toBe(500000 - 40000);
    // y el pendiente de la cuota sigue siendo uno solo
    expect(Math.round(ing(enBloque)[iMes(MES_A)])).toBe(60000);
    expect(Math.round(ing(individual)[iMes(MES_A)])).toBe(60000 + 50000);  // + liq. propia de la operación
  });
});

// ═══ 3. Saldos a favor ═════════════════════════════════════════════
describe('saldos a favor en el flujo', () => {
  const conSaldo = (aplicaciones, lado = 'productor') => base({ saldos_favor: [{
    id: 's1', lado, contraparte: 'P', usd: 40000, estado: 'reconocido', aplicaciones }] });

  test('programar no extingue el saldo y proyecta solo lo pendiente', () => {
    const p = conSaldo([
      { id: 'a1', tipo: 'recuperacion', usd: 20000, mes: MES_A, estado: 'programada' },
      { id: 'a2', tipo: 'recuperacion', usd: 20000, mes: MES_B, estado: 'programada' },
    ]);
    const r = recup(p);
    expect(Math.round(r[iMes(MES_A)])).toBe(20000);
    expect(Math.round(r[iMes(MES_B)])).toBe(20000);
    expect(Math.round(suma(r))).toBe(40000);
  });

  test('una recuperación ejecutada deja de proyectarse', () => {
    const p = conSaldo([
      { id: 'a1', tipo: 'recuperacion', usd: 20000, mes: MES_A, estado: 'ejecutada', fechaEjecucion: '2026-11-10' },
      { id: 'a2', tipo: 'recuperacion', usd: 20000, mes: MES_B, estado: 'programada' },
    ]);
    const r = recup(p);
    expect(Math.round(r[iMes(MES_A)])).toBe(0);      // ya es caja
    expect(Math.round(r[iMes(MES_B)])).toBe(20000);
    expect(Math.round(suma(r))).toBe(20000);
  });

  test('la devolución al cliente es salida y no toca la recuperación', () => {
    const p = conSaldo([{ id: 'a1', tipo: 'devolucion', usd: 50000, mes: MES_A, estado: 'programada' }], 'cliente');
    expect(Math.round(devol(p)[iMes(MES_A)])).toBe(50000);
    expect(Math.round(suma(recup(p)))).toBe(0);
  });

  test('una compensación reservada no mueve nada', () => {
    const p = conSaldo([{ id: 'a1', tipo: 'compensacion', usd: 40000, estado: 'reservada',
      destino: { programaId: 'pA' } }]);
    expect(Math.round(suma(recup(p)))).toBe(0);
    expect(Math.round(suma(devol(p)))).toBe(0);
  });

  test('una compensación aplicada reduce el destino una sola vez', () => {
    const sinComp = base({ programas: [prog({ id: 'pA', lado: 'productor', contraparte: 'P',
      presupuesto_asignado: 100000, importe_definitivo: 100000, mes_liquidacion: MES_A, cuotas: [] })] });
    const conComp = base({
      programas: [prog({ id: 'pA', lado: 'productor', contraparte: 'P',
        presupuesto_asignado: 100000, importe_definitivo: 100000, mes_liquidacion: MES_A, cuotas: [] })],
      saldos_favor: [{ id: 's1', lado: 'productor', contraparte: 'P', usd: 40000, estado: 'reconocido',
        aplicaciones: [{ id: 'a1', tipo: 'compensacion', usd: 40000, estado: 'aplicada',
          destino: { programaId: 'pA' } }] }],
    });
    expect(Math.round(cost(sinComp)[iMes(MES_A)])).toBe(100000);
    expect(Math.round(cost(conComp)[iMes(MES_A)])).toBe(60000);   // 100.000 − 40.000
    expect(Math.round(suma(recup(conComp)))).toBe(0);             // sin ingreso ficticio
    // y no se descuenta otra vez en ninguna otra parte
    expect(Math.round(suma(cost(conComp)))).toBe(Math.round(suma(cost(sinComp))) - 40000);
  });

  test('anular una programación la saca del flujo sin tocar lo ejecutado', () => {
    const p = conSaldo([
      { id: 'a1', tipo: 'recuperacion', usd: 20000, mes: MES_A, estado: 'ejecutada', fechaEjecucion: '2026-11-10' },
      { id: 'a2', tipo: 'recuperacion', usd: 20000, mes: MES_B, estado: 'anulada', anulada: true, motivoAnulacion: 'x' },
    ]);
    expect(Math.round(suma(recup(p)))).toBe(0);
  });

  test('los saldos a favor no tocan el dinero histórico ni los saldos bancarios', () => {
    const sin = base({});
    const con = base({ saldos_favor: [{ id: 's1', lado: 'productor', contraparte: 'P', usd: 40000,
      estado: 'reconocido', aplicaciones: [{ id: 'a1', tipo: 'recuperacion', usd: 20000, mes: MES_A, estado: 'programada' }] }] });
    const empSin = buildEmpresas(sin, { cobros: [] })['Allegria Foods'];
    const empCon = buildEmpresas(con, { cobros: [] })['Allegria Foods'];
    expect(empCon.saldo_ini).toBe(empSin.saldo_ini);              // Saldos Bancos intacto
    const linea = (emp, lbl) => (emp.sections.flatMap(s => s.lines).find(l => l.label === lbl) || {}).proy;
    expect(linea(empCon, 'Anticipo Cerezas')).toEqual(linea(empSin, 'Anticipo Cerezas'));
    expect(Math.round(suma(linea(empCon, 'Recuperación de anticipos a productores')))).toBe(20000);
  });
});

// ═══ 4. Compatibilidad de registros antiguos ═══════════════════════
describe('registros antiguos sin fecha', () => {
  const viejo = base({ anticipos_cliente: [
    { id: 'e1', mes: '', usd_kg: 0.1, realizaciones: [] },         // sin marca de versión
    { id: 'e2', mes: MES_A, usd_kg: 0.1, realizaciones: [] },
  ]});

  test('antes de decidir, el flujo es el de siempre, mes a mes', () => {
    const v = ing(viejo);
    expect(Math.round(v[iMes(MES_A)])).toBe(50000);
    // el sin fecha queda dentro de la liquidación: 500.000 − 50.000
    expect(Math.round(v[iMes(MES_LIQ)])).toBe(450000);
    expect(Math.round(suma(v))).toBe(500000);
  });

  test('al decidir "sigue acordado" la liquidación baja y aparece sin calendarizar', () => {
    const p = JSON.parse(JSON.stringify(viejo));
    p["2026-2027"].cerezas.decisiones_sin_fecha =
      registrarDecisionSinFecha({}, 'e1', 'acordado_sin_fecha', { usuario: 'qa' });
    const v = ing(p);
    expect(Math.round(v[iMes(MES_A)])).toBe(50000);                // no se mueve
    expect(Math.round(v[iMes(MES_LIQ)])).toBe(400000);             // 50.000 menos
    expect(Math.round(suma(v))).toBe(450000);                      // sale del horizonte
  });

  test('al decidir "trasladar" queda igual que antes', () => {
    const p = JSON.parse(JSON.stringify(viejo));
    p["2026-2027"].cerezas.decisiones_sin_fecha =
      registrarDecisionSinFecha({}, 'e1', 'trasladar_liquidacion', { usuario: 'qa' });
    expect(ing(p)).toEqual(ing(viejo));
  });

  test('un anticipo nuevo sin fecha se distingue del antiguo', () => {
    const p = base({ anticipos_cliente: [
      { id: 'n1', mes: '', usd_kg: 0.1, realizaciones: [], v: MODELO_VERSION },
    ]});
    const v = ing(p);
    // reservado: no se proyecta y sale de la liquidación
    expect(Math.round(v[iMes(MES_LIQ)])).toBe(450000);
    expect(Math.round(suma(v))).toBe(450000);
  });

  test('la decisión sobrevive a guardar y recargar', () => {
    const p = JSON.parse(JSON.stringify(viejo));
    p["2026-2027"].cerezas.decisiones_sin_fecha =
      registrarDecisionSinFecha({}, 'e1', 'acordado_sin_fecha', { usuario: 'qa' });
    const recargado = JSON.parse(JSON.stringify(p));      // ida y vuelta por Supabase
    expect(ing(recargado)).toEqual(ing(p));
    expect(recargado["2026-2027"].cerezas.decisiones_sin_fecha.e1.usuario).toBe('qa');
    expect(recargado["2026-2027"].cerezas.decisiones_sin_fecha.e1.ts).toBeTruthy();
  });
});

// ═══ 5. Excel ══════════════════════════════════════════════════════
describe('Excel con posiciones y saldos', () => {
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
  const exportar = (paramsAllegria, nombre) => {
    const PARAMS = { paramsAllegria, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(paramsAllegria, PARAMS.allegraComisionArandanos);
    const file = path.join(OUT_DIR, nombre);
    exportarFlujoEmpresa({ emp: empresas['Allegria Foods'], empName: 'Allegria Foods',
                           saldoIni: 10000, fileName: file, params: PARAMS });
    return { wb: XLSX.readFile(file, { cellFormula: true }), emp: empresas['Allegria Foods'] };
  };
  beforeAll(() => fs.mkdirSync(OUT_DIR, { recursive: true }));

  const conTodo = base({
    programas: [prog({ id: 'pA', contraparte: 'Cliente A', presupuesto_asignado: 200000,
      importe_definitivo: 180000, mes_liquidacion: MES_A, cuotas: [
        { id: 'c1', mes: MES_A, modalidad: 'monto', monto: 50000, estado: 'vigente',
          realizaciones: [{ id: 'r1', fecha: '2026-09-01', usd: 20000 }] }] })],
    saldos_favor: [
      { id: 's1', lado: 'productor', contraparte: 'P', usd: 40000, estado: 'reconocido', aplicaciones: [
        { id: 'a1', tipo: 'recuperacion', usd: 20000, mes: MES_A, estado: 'programada' },
        { id: 'a2', tipo: 'recuperacion', usd: 20000, mes: MES_B, estado: 'ejecutada', fechaEjecucion: '2026-12-10' }] },
      { id: 's2', lado: 'cliente', contraparte: 'Cliente A', usd: 15000, estado: 'reconocido', aplicaciones: [
        { id: 'a3', tipo: 'devolucion', usd: 15000, mes: MES_B, estado: 'programada' }] },
    ],
  });

  test('el Excel cuadra con el árbol de la app, mes a mes', () => {
    const { wb, emp } = exportar(conTodo, 'integracion.xlsx');
    const filas = leerHoja(wb.Sheets[wb.SheetNames.find(n => n !== 'Parametros')]);
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

  test('contra los valores esperados del ejemplo, no solo contra sí mismo', () => {
    const { emp } = exportar(conTodo, 'integracion2.xlsx');
    const linea = (lbl) => (emp.sections.flatMap(s => s.lines).find(l => l.label === lbl) || {}).proy;
    // Cliente A: base definitiva 180.000 − 20.000 cobrados − 30.000 de cuota
    // pendiente = 130.000 de liquidación, en el mismo mes que su cuota.
    expect(Math.round(linea('Anticipo Cerezas')[iMes(MES_A)])).toBe(30000 + 130000);
    // bloque: 500.000 − 200.000 asignados = 300.000 en el mes de liquidación
    expect(Math.round(linea('Anticipo Cerezas')[iMes(MES_LIQ)])).toBe(300000);
    // recuperación: solo la programada
    expect(Math.round(linea('Recuperación de anticipos a productores')[iMes(MES_A)])).toBe(20000);
    expect(Math.round(suma(linea('Recuperación de anticipos a productores')))).toBe(20000);
    // devolución: salida en su mes
    expect(Math.round(linea('Devolución de anticipos a clientes')[iMes(MES_B)])).toBe(15000);
  });

  test('la hoja Parametros trae la sección de saldos a favor', () => {
    const { wb } = exportar(conTodo, 'integracion3.xlsx');
    const ws = wb.Sheets['Parametros'];
    const textos = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))
      .map(k => ws[k]?.v).filter(v => typeof v === 'string');
    expect(textos.some(t => t.includes('SALDOS A FAVOR'))).toBe(true);
    expect(textos.some(t => t.includes('Recuperación · programada'))).toBe(true);
    expect(textos.some(t => t.includes('Recuperación · ejecutada'))).toBe(true);
    expect(textos.some(t => t.includes('ya es caja'))).toBe(true);
  });
});

// ═══ 6. Usuario de solo lectura ════════════════════════════════════
// Un usuario sin permiso de edición no puede registrar, reconocer,
// programar, ejecutar, compensar, anular ni decidir compatibilidad.
describe('solo lectura', () => {
  const React = require('react');
  const { render, screen } = require('@testing-library/react');
  require('@testing-library/jest-dom');
  const { ParamsFruta } = require('../FinanzasModule.jsx');

  const params = {
    "2026-2027": { cerezas: {
      kg: 500000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
      anticipos_cliente: [{ id: 'e1', mes: '', usd_kg: 0.1, realizaciones: [] }],   // antiguo sin fecha
      mes_liquidacion: MES_LIQ,
      anticipos_productor: [], mes_saldo_productor: MES_LIQ, dist_mat: [], dist_srv: [],
      programas: [{ id: 'p1', lado: 'productor', contraparte: 'P', kilos: 100000,
        presupuesto_asignado: 100000, importe_definitivo: 50000, mes_liquidacion: MES_A,
        antecedentes: [{ id: 'an1', usd: 255000, referencia: 'informado', estado: 'pendiente' }],
        cuotas: [{ id: 'c1', mes: MES_A, modalidad: 'monto', monto: 60000, estado: 'vigente',
          realizaciones: [{ id: 'r1', fecha: '2026-08-01', usd: 60000 }] }] }],
      saldos_favor: [{ id: 's1', lado: 'productor', contraparte: 'P', usd: 10000, estado: 'reconocido',
        origen: { tipo: 'liquidacion_individual', programaId: 'p1', base: 50000, realizado: 60000, excedenteReal: 10000 },
        aplicaciones: [{ id: 'a1', tipo: 'recuperacion', usd: 5000, mes: MES_A, estado: 'programada' }] }],
    } },
  };
  const pintar = (readOnly) => render(
    React.createElement(ParamsFruta, { seasonKey: "2026-2027", fruta: "cerezas",
      params, setParams: () => {}, readOnly }));

  const BOTONES = [
    /\+ Agregar cliente/, /\+ Agregar productor/, /\+ Reconocer saldo/,
    /Recuperar del productor/, /Compensar/, /registrar movimiento/, /aplazar/, /anular/,
    /sigue acordado sin fecha/, /trasladar a liquidación/,
    /\+ Registrar pago sin operación identificada/, /\+ Cargar liquidación definitiva/,
    /\+ Registrar monto informado sin fecha/, /completar con su fecha/, /Archivar/,
  ];

  test('con permiso de edición los controles están', () => {
    pintar(false);
    BOTONES.forEach(re => expect(screen.queryAllByRole('button', { name: re }).length).toBeGreaterThan(0));
  });

  test('en solo lectura no hay ningún control de acción', () => {
    pintar(true);
    BOTONES.forEach(re => expect(screen.queryAllByRole('button', { name: re }).length).toBe(0));
  });

  test('en solo lectura las cifras sí se ven', () => {
    pintar(true);
    expect(document.body.textContent).toMatch(/Saldo económico pendiente/);
    expect(document.body.textContent).toMatch(/reconocido \$10,000/);
    expect(document.body.textContent).toMatch(/Excedente real/);
  });
});

// ═══ 7. La hoja Parametros arma las posiciones, no un solo bloque ══
describe('hoja Parametros con posiciones', () => {
  test('cada operación individual trae su propia liquidación y su variación', () => {
    const p = base({ programas: [prog({ id: 'pA', contraparte: 'Cliente A',
      presupuesto_asignado: 200000, importe_definitivo: 180000, mes_liquidacion: MES_A, cuotas: [] })] });
    const PARAMS = { paramsAllegria: p, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(p, PARAMS.allegraComisionArandanos);
    const file = path.join(OUT_DIR, 'posiciones.xlsx');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    exportarFlujoEmpresa({ emp: empresas['Allegria Foods'], empName: 'Allegria Foods',
                           saldoIni: 0, fileName: file, params: PARAMS });
    const ws = XLSX.readFile(file, { cellFormula: true }).Sheets['Parametros'];
    const textos = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))
      .map(k => ws[k]?.v).filter(v => typeof v === 'string');
    expect(textos.some(t => t.includes('Liquidación · Cliente A'))).toBe(true);
    expect(textos.some(t => t.includes('bloque presupuestario'))).toBe(true);
    expect(textos.some(t => t.includes('Variación vs presupuesto asignado'))).toBe(true);
    // La base del bloque descuenta el presupuesto retirado, por fórmula viva.
    const formulas = Object.keys(ws).map(k => ws[k]?.f).filter(Boolean);
    expect(formulas.some(f => /-200000/.test(f))).toBe(true);
  });
});

// ═══ 7. Antecedentes: montos informados sin fecha ══════════════════
describe('antecedentes informados sin fecha', () => {
  // Seis pagos informados por el productor, sin fecha ni respaldo.
  const MONTOS = [255000, 89890, 17110, 119000, 119000, 79000];
  const conAntecedentes = base({ programas: [prog({
    id: 'pDA', lado: 'productor', contraparte: 'Don Alberto', kilos: 200000, cuotas: [],
    antecedentes: MONTOS.map((usd, k) => ({ id: `a${k}`, usd, referencia: `informado ${k + 1}`, estado: 'pendiente' })),
  })] });

  test('no cambian ni un mes del flujo', () => {
    const sin = cost(base({ programas: [prog({ id: 'pDA', lado: 'productor', contraparte: 'Don Alberto', cuotas: [] })] }));
    const con = cost(conAntecedentes);
    expect(con.map(x => Math.round(x))).toEqual(sin.map(x => Math.round(x)));
    // y la liquidación completa sigue viva: nada se dio por pagado
    expect(Math.round(con[iMes(MES_LIQ)])).toBe(500000);
    expect(Math.round(suma(con))).toBe(500000);
  });

  test('el Excel los muestra como informativos y no los descuenta', () => {
    const PARAMS = { paramsAllegria: conAntecedentes, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(conAntecedentes, PARAMS.allegraComisionArandanos);
    const file = path.join(OUT_DIR, 'antecedentes.xlsx');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    exportarFlujoEmpresa({ emp: empresas['Allegria Foods'], empName: 'Allegria Foods',
                           saldoIni: 0, fileName: file, params: PARAMS });
    const ws = XLSX.readFile(file, { cellFormula: true }).Sheets['Parametros'];
    const claves = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k));
    const textos = claves.map(k => ws[k]?.v).filter(v => typeof v === 'string');
    expect(textos.filter(t => t.includes('Informado sin fecha verificada')).length).toBe(6);
    expect(textos.some(t => t.includes('no descuenta · no conciliado'))).toBe(true);
    // Los montos informados están como constante, nunca dentro de una fórmula
    // de descuento de la liquidación.
    const formulas = claves.map(k => ws[k]?.f).filter(Boolean);
    expect(formulas.some(f => /255000|89890|17110/.test(f))).toBe(false);
  });

  test('con su fecha real, imputado a una cuota, recién descuenta', () => {
    const conFecha = base({ programas: [prog({
      id: 'pDA', lado: 'productor', contraparte: 'Don Alberto', kilos: 200000,
      mes_liquidacion: MES_LIQ,
      cuotas: [{ id: 'cDA', mes: MES_A, modalidad: 'monto', monto: 255000, estado: 'vigente',
        realizaciones: [{ id: 'rDA', fecha: '2026-07-05', usd: 255000,
          origen: { tipo: 'antecedente', id: 'a0' } }] }],
      antecedentes: [{ id: 'a0', usd: 255000, estado: 'convertido', fecha: '2026-07-05',
        convertidoEn: { tipo: 'cuota', id: 'cDA', realizacionId: 'rDA' } }],
    })] });
    const serie = cost(conFecha);
    expect(Math.round(serie[iMes(MES_A)])).toBe(0);                   // ya pagado, no se proyecta
    expect(Math.round(serie[iMes(MES_LIQ)])).toBe(500000 - 255000);   // y descuenta una sola vez
    expect(Math.round(suma(serie))).toBe(500000 - 255000);
  });
});
