/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIÓN CON ANTICIPOS EN EL FLUJO Y EN EL EXCEL — Allegria Foods
//
// Lo que se comprueba:
//   1. Sin programas, el flujo es idéntico al de siempre.
//   2. Una cuota vigente sustituye estimación por el monto declarado;
//      en borrador no consume nada, pero su cobro descuenta igual.
//   3. Lo realizado no se reproyecta y descuenta una sola vez.
//   4. Los dos lados son independientes.
//   5. La liquidación definitiva reemplaza la base.
//   6. El Excel lleva los mismos números que el árbol de la app, mes a mes,
//      y la hoja Parametros trae el desglose por contraparte.
//
// DATOS SINTÉTICOS.
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

// venta presupuesto = 500.000 kg × 3 = 1.500.000
// precio neto productor = 3×0,9 − 0,4 − 1,0 = 1,3 → costo 650.000
const PARAMS_BASE = () => ({ "2026-2027": { cerezas: {
  kg: 500000, fob_usd_kg: 3, desc_exp_pct: 10, mat_usd_kg: 0.4, srv_usd_kg: 1.0,
  anticipos_cliente: [{ id: "e1", mes: "Nov-26", usd_kg: 0.20,          // acordado 100.000
                        realizaciones: [{ id: "r1", fecha: "2026-08-10", usd: 20000 }] }],
  mes_liquidacion: "Mar-27",
  anticipos_productor: [{ id: "ep", mes: "Nov-26", usd_kg: 0.10 }],     // acordado 50.000
  mes_saldo_productor: "Mar-27",
  dist_mat: [], dist_srv: [], programas: [],
} } });

const con = (patch) => {
  const p = PARAMS_BASE();
  Object.assign(p["2026-2027"].cerezas, patch);
  return p;
};
const cuota = (o) => ({ id: "c1", mes: "Oct-26", modalidad: "monto", monto: 40000,
                        estado: "vigente", realizaciones: [], sustituye: [], ...o });
const programa = (o) => ({ id: "pA", lado: "cliente", contraparte: "Cliente Sintético A",
                           kilos: 200000, cuotas: [cuota()], ...o });

const ing = (params) => calcAllegria(params).ing.cerezas;
const cost = (params) => calcAllegria(params).cost.cerezas;
const suma = (arr) => arr.reduce((a, b) => a + b, 0);

// ═══ 1. Sin programas, todo igual ══════════════════════════════════
test('sin programas: pendiente en su mes y liquidación con el resto', () => {
  const v = ing(PARAMS_BASE());
  expect(Math.round(v[iMes("Nov-26")])).toBe(80000);          // 100.000 − 20.000 cobrados
  expect(Math.round(v[iMes("Mar-27")])).toBe(1400000);        // 1.500.000 − 20.000 − 80.000
  expect(Math.round(suma(v))).toBe(1480000);                  // base − realizado
});

test('un programa sin cuotas vigentes no cambia nada', () => {
  const base = ing(PARAMS_BASE());
  const borrador = ing(con({ programas: [programa({ cuotas: [cuota({ estado: "borrador" })] })] }));
  expect(borrador).toEqual(base);
});

// ═══ 2. Sustitución parcial ════════════════════════════════════════
test('una cuota vigente sustituye estimación solo por el monto declarado', () => {
  const v = ing(con({ programas: [programa({ cuotas: [
    cuota({ monto: 40000, mes: "Oct-26", sustituye: [{ estimacionId: "e1", usd: 30000 }] }) ]})] }));
  expect(Math.round(v[iMes("Oct-26")])).toBe(40000);          // la cuota
  expect(Math.round(v[iMes("Nov-26")])).toBe(50000);          // 100.000 − 20.000 − 30.000
  expect(Math.round(v[iMes("Mar-27")])).toBe(1390000);        // 1.500.000 − 20.000 − 90.000
  expect(Math.round(suma(v))).toBe(1480000);                  // el total del lado no cambió
});

test('en borrador no consume estimación, pero su cobro descuenta igual', () => {
  const v = ing(con({ programas: [programa({ cuotas: [
    cuota({ monto: 40000, estado: "borrador", sustituye: [{ estimacionId: "e1", usd: 30000 }],
            realizaciones: [{ id: "r9", fecha: "2026-09-01", usd: 5000 }] }) ]})] }));
  expect(Math.round(v[iMes("Oct-26")])).toBe(0);              // la cuota no proyecta
  expect(Math.round(v[iMes("Nov-26")])).toBe(80000);          // la estimación sigue entera
  expect(Math.round(v[iMes("Mar-27")])).toBe(1395000);        // 1.500.000 − 25.000 − 80.000
  expect(Math.round(suma(v))).toBe(1475000);                  // base − 25.000 realizados
});

// ═══ 3. Lo realizado no se reproyecta ══════════════════════════════
test('cobrar un pendiente lo saca del flujo sin mover la liquidación', () => {
  const sinCobro = ing(con({ programas: [programa({ cuotas: [cuota({ monto: 40000 })] })] }));
  const conCobro = ing(con({ programas: [programa({ cuotas: [cuota({ monto: 40000,
    realizaciones: [{ id: "r9", fecha: "2026-10-05", usd: 15000 }] })] })] }));
  expect(Math.round(sinCobro[iMes("Oct-26")])).toBe(40000);
  expect(Math.round(conCobro[iMes("Oct-26")])).toBe(25000);
  expect(Math.round(conCobro[iMes("Mar-27")])).toBe(Math.round(sinCobro[iMes("Mar-27")]));
  expect(Math.round(suma(sinCobro) - suma(conCobro))).toBe(15000);
});

// ═══ 4. Lados independientes ═══════════════════════════════════════
test('el programa de cliente no toca el costo del productor', () => {
  const base = cost(PARAMS_BASE());
  const conProg = cost(con({ programas: [programa()] }));
  expect(conProg).toEqual(base);
  expect(Math.round(base[iMes("Nov-26")])).toBe(50000);
  expect(Math.round(base[iMes("Mar-27")])).toBe(600000);      // 650.000 − 50.000
});

test('un programa de productor solo cambia el costo', () => {
  const params = con({ programas: [programa({ id: "pP", lado: "productor",
    contraparte: "Productor Sintético", cuotas: [
      cuota({ id: "cp", mes: "Dec-26", monto: 30000, sustituye: [{ estimacionId: "ep", usd: 30000 }] }) ]})] });
  const c = cost(params);
  expect(Math.round(c[iMes("Nov-26")])).toBe(20000);          // 50.000 − 30.000 sustituidos
  expect(Math.round(c[iMes("Dec-26")])).toBe(30000);
  expect(Math.round(c[iMes("Mar-27")])).toBe(600000);
  expect(Math.round(suma(c))).toBe(650000);
  expect(ing(params)).toEqual(ing(PARAMS_BASE()));
});

// ═══ 5. Liquidación definitiva ═════════════════════════════════════
test('la definitiva reemplaza la base presupuestada', () => {
  const v = ing(con({ liq_definitiva_cliente: { total: 1600000 } }));
  expect(Math.round(v[iMes("Nov-26")])).toBe(80000);          // los anticipos no cambian
  expect(Math.round(v[iMes("Mar-27")])).toBe(1500000);        // 1.600.000 − 20.000 − 80.000
  expect(Math.round(suma(v))).toBe(1580000);
});

// ═══ 6. Excel ══════════════════════════════════════════════════════
describe('Excel', () => {
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

  test.each([
    ['sin programas', PARAMS_BASE()],
    ['con sustitución parcial', con({ programas: [programa({ cuotas: [
      cuota({ sustituye: [{ estimacionId: "e1", usd: 30000 }] }) ]})] })],
    ['con cuota en borrador y cobro', con({ programas: [programa({ cuotas: [
      cuota({ estado: "borrador", sustituye: [{ estimacionId: "e1", usd: 30000 }],
              realizaciones: [{ id: "r9", fecha: "2026-09-01", usd: 5000 }] }) ]})] })],
    ['con varios programas', con({ programas: [
      programa(),
      programa({ id: "pB", contraparte: "Cliente Sintético B", cuotas: [
        cuota({ id: "cb", mes: "Dec-26", monto: 25000, sustituye: [{ estimacionId: "e1", usd: 25000 }] }) ]}),
    ] })],
    ['con liquidación definitiva', con({ liq_definitiva_cliente: { total: 1600000 } })],
    ['con programa archivado', con({ programas: [programa({ archivado: true, motivoArchivo: "anulado" })] })],
    ['con operación fuera de presupuesto', con({ programas: [programa({ fueraPresupuesto: true,
      cuotas: [cuota({ realizaciones: [{ id: "rx", fecha: "2026-09-01", usd: 7000 }] })] })] })],
    ['caso A · cobro incluido en el acuerdo', con({ programas: [programa({ cuotas: [
      cuota({ realizaciones: [{ id: "ra", fecha: "2026-10-05", usd: 12000 }] }) ]})] })],
    ['caso B · cobro adicional al acuerdo', con({ programas: [programa({ cuotas: [
      cuota({ extra_acordado: 12000, realizaciones: [{ id: "rb", fecha: "2026-10-05", usd: 12000 }] }) ]})] })],
  ])('%s: el Excel cuadra con el árbol de la app, mes a mes', (nombre, paramsAllegria) => {
    const { wb, emp } = exportar(paramsAllegria, `prog-${nombre.replace(/\W+/g, '_')}.xlsx`);
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

  test('la hoja Parametros trae estimación, contraparte y liquidación', () => {
    const { wb } = exportar(con({ programas: [programa({ cuotas: [
      cuota({ sustituye: [{ estimacionId: "e1", usd: 30000 }],
              realizaciones: [{ id: "r9", fecha: "2026-10-05", usd: 15000 }] }) ]})] }), 'prog-parametros.xlsx');
    const ws = wb.Sheets['Parametros'];
    const textos = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))
      .map(k => ws[k]?.v).filter(v => typeof v === 'string');
    expect(textos.some(t => t.includes('Cliente Sintético A'))).toBe(true);
    expect(textos.some(t => t.includes('Estimación'))).toBe(true);
    expect(textos.some(t => t.includes('Liquidación'))).toBe(true);
    expect(textos.some(t => t.includes('Saldo productor'))).toBe(true);

    // El realizado (columna F) va como constante: es histórico.
    const celdas = Object.keys(ws).filter(k => /^F\d+$/.test(k)).map(k => ws[k])
      .filter(c => c && (c.v === 15000 || c.v === 20000));
    expect(celdas.length).toBeGreaterThanOrEqual(2);
    celdas.forEach(c => expect(c.f).toBeUndefined());

    // Lo sustituido va en su propia columna, también como constante.
    const sust = Object.keys(ws).filter(k => /^H\d+$/.test(k)).map(k => ws[k]).filter(c => c && c.v === 30000);
    expect(sust.length).toBe(1);
    expect(sust[0].f).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// ANTICIPOS ADICIONALES — base 500.000 · realizados 100.000 · futuros 50.000
//
// A. 20.000 de una cuota existente  → pendientes 30.000 · liquidación 350.000
// B. 20.000 realmente adicionales   → pendientes 50.000 · liquidación 330.000
// En los dos, realizados 120.000 y total por cobrar 380.000.
// ═══════════════════════════════════════════════════════════════════
describe('anticipos adicionales · cliente y productor', () => {
  // kg 500.000 × FOB 1 = 500.000 de venta. Sin desc/mat/srv, el retorno al
  // productor también es 500.000, así que los dos lados se leen igual.
  const CUOTA = (over) => ({ id: "c1", mes: "Nov-26", modalidad: "monto", monto: 150000,
    estado: "vigente", sustituye: [], realizaciones: [{ id: "r1", fecha: "2026-08-01", usd: 100000 }], ...over });
  const paramsCon = (lado, cuotaOver) => ({ "2026-2027": { cerezas: {
    kg: 500000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
    anticipos_cliente: [], mes_liquidacion: "Mar-27",
    anticipos_productor: [], mes_saldo_productor: "Mar-27",
    dist_mat: [], dist_srv: [],
    programas: [{ id: "p1", lado, contraparte: `Contraparte ${lado}`, kilos: 500000,
                  cuotas: [CUOTA(cuotaOver)] }],
  } } });
  const serie = (lado, params) => (lado === "cliente" ? ing(params) : cost(params));

  test.each([["cliente"], ["productor"]])('%s · punto de partida', (lado) => {
    const v = serie(lado, paramsCon(lado));
    expect(Math.round(v[iMes("Nov-26")])).toBe(50000);          // pendientes futuros
    expect(Math.round(v[iMes("Mar-27")])).toBe(350000);         // liquidación
    expect(Math.round(suma(v))).toBe(400000);                   // saldo total
  });

  test.each([["cliente"], ["productor"]])('%s · A: 20.000 de una cuota existente', (lado) => {
    // "incluido": el total acordado no cambia (150.000) y el pendiente baja.
    const v = serie(lado, paramsCon(lado, { realizaciones: [
      { id: "r1", fecha: "2026-08-01", usd: 100000 },
      { id: "r2", fecha: "2026-11-05", usd: 20000 }] }));
    expect(Math.round(v[iMes("Nov-26")])).toBe(30000);          // pendientes
    expect(Math.round(v[iMes("Mar-27")])).toBe(350000);         // liquidación
    expect(Math.round(suma(v))).toBe(380000);                   // total por cobrar/pagar
  });

  test.each([["cliente"], ["productor"]])('%s · B: 20.000 realmente adicionales', (lado) => {
    // "adicional": el acuerdo sube a 170.000 y el pendiente se conserva.
    const v = serie(lado, paramsCon(lado, { extra_acordado: 20000, realizaciones: [
      { id: "r1", fecha: "2026-08-01", usd: 100000 },
      { id: "r2", fecha: "2026-11-05", usd: 20000 }] }));
    expect(Math.round(v[iMes("Nov-26")])).toBe(50000);          // pendientes intactos
    expect(Math.round(v[iMes("Mar-27")])).toBe(330000);         // liquidación baja
    expect(Math.round(suma(v))).toBe(380000);                   // mismo total
  });

  test('cambiar los kilos no mueve el histórico recibido', () => {
    const conKilos = (kilos) => ({ "2026-2027": { cerezas: {
      kg: 500000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
      anticipos_cliente: [], mes_liquidacion: "Mar-27",
      anticipos_productor: [], mes_saldo_productor: "Mar-27", dist_mat: [], dist_srv: [],
      programas: [{ id: "p1", lado: "cliente", contraparte: "X", kilos, cuotas: [
        { id: "c1", mes: "Nov-26", modalidad: "usd_kg", usd_kg: 0.3, estado: "vigente",
          realizaciones: [{ id: "r1", fecha: "2026-08-01", usd: 120000 }] }]}],
    } } });
    const a = ing(conKilos(500000));        // acordado 150.000 − 120.000 = 30.000
    const b = ing(conKilos(400000));        // acordado 120.000 − 120.000 = 0
    expect(Math.round(a[iMes("Nov-26")])).toBe(30000);
    expect(Math.round(b[iMes("Nov-26")])).toBe(0);
    // El realizado es el mismo en los dos: la liquidación solo cambia por el
    // pendiente, nunca porque se haya movido la plata ya recibida.
    expect(Math.round(a[iMes("Mar-27")])).toBe(350000);
    expect(Math.round(b[iMes("Mar-27")])).toBe(380000);
    expect(Math.round(suma(a))).toBe(380000);
    expect(Math.round(suma(b))).toBe(380000);
  });
});
