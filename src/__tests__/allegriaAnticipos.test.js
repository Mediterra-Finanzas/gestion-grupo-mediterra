/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// Allegria Foods — anticipos con realizaciones: cuadre pantalla ↔
// consolidado ↔ Excel.
//
// Verifica los dos ejemplos obligatorios (US$540.000 por cobrar y
// US$352.000 por pagar), el cierre parcial, el sobre-anticipo, los datos
// antiguos sin realizaciones y que el libro Excel lleve las fórmulas
// correctas. El recálculo REAL del Excel (no sus valores cacheados) lo
// hace scripts/verif-excel-recalc.mjs con LibreOffice, a partir del
// archivo y del JSON de referencia que deja este test.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx-js-style';
import { calcAllegria, buildAllegria, buildEmpresasConOverrides } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa, exportarFlujoConsolidado } from '../flujoExportExcel.js';

const OUT_DIR = process.env.ANTICIPOS_OUT_DIR || path.join(os.tmpdir(), 'anticipos-verif');

// ── Horizonte (mismo que el módulo: Apr-26 → Jun-31) ─────────────
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const iM = (lbl) => MESES.indexOf(lbl);
const suma = (arr) => arr.reduce((a,b)=>a+(Number(b)||0),0);
const rea = (usd, fecha="2026-08-10") => ({ id:`r_${usd}_${fecha}`, fecha, usd });

// Cerezas: venta 1.000.000 kg × US$0,60 = US$600.000
//          costo neto = (0,60 − 0,178) × 1.000.000 = US$422.000
function paramsCerezas({ antCli = [], antProd = [], kg = 1000000 } = {}) {
  return {
    "2026-2027": {
      cerezas: {
        kg, fob_usd_kg:0.6, desc_exp_pct:0, mat_usd_kg:0.178, srv_usd_kg:0,
        anticipos_cliente: antCli,  mes_liquidacion:"Mar-27",
        anticipos_productor: antProd, mes_saldo_productor:"Mar-27",
        dist_mat:[], dist_srv:[],
      },
    },
  };
}

describe('calcAllegria — anticipos con realizaciones', () => {

  test('EJEMPLO OBLIGATORIO clientes: venta 600.000, anticipo 100.000, cobrado 60.000 → 40.000 + 500.000', () => {
    const p = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(60000)] }] });
    const { ing } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(40000, 2);   // solo el pendiente
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(500000, 2);  // liquidación
    expect(suma(ing.cerezas)).toBeCloseTo(540000, 2);          // flujo futuro total
  });

  test('EJEMPLO OBLIGATORIO productores: costo 422.000, anticipo 100.000, pagado 70.000 → 30.000 + 322.000', () => {
    const p = paramsCerezas({ antProd:[{ id:"b1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(70000)] }] });
    const { cost } = calcAllegria(p);
    expect(cost.cerezas[iM("Oct-26")]).toBeCloseTo(30000, 2);
    expect(cost.cerezas[iM("Mar-27")]).toBeCloseTo(322000, 2);
    expect(suma(cost.cerezas)).toBeCloseTo(352000, 2);
  });

  test('anticipo totalmente realizado: nada en su mes, liquidación intacta', () => {
    const p = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(100000)] }] });
    const { ing } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(0, 2);
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(500000, 2);
  });

  test('cierre parcial: 30.000 cobrados y no habrá más → 0 pendiente y liquidación 570.000', () => {
    const p = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, cerrado:true, realizaciones:[rea(30000)] }] });
    const { ing } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(0, 2);
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(570000, 2);
    expect(suma(ing.cerezas)).toBeCloseTo(570000, 2);
  });

  test('sobre-anticipo: la liquidación no se vuelve negativa (el excedente se informa en pantalla)', () => {
    const p = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.70, realizaciones:[rea(400000)] }] });
    const { ing } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(300000, 2);  // pendiente 700.000 − 400.000
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(0, 2);
  });

  test('cambiar kilos NO altera lo realizado (solo el acordado y el pendiente)', () => {
    const ant = { id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(60000)] };
    const p = paramsCerezas({ antCli:[ant], kg:800000 });      // kilos −20%
    const { ing } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(20000, 2);   // 80.000 − 60.000
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(400000, 2);  // 480.000 − 80.000
    expect(ant.realizaciones[0].usd).toBe(60000);              // intacto
  });

  test('COMPATIBILIDAD: datos antiguos sin realizaciones → mismos números que antes', () => {
    const p = paramsCerezas({
      antCli:[{ mes:"Oct-26", usd_kg:0.10 }, { mes:"Nov-26", usd_kg:0.05 }],
      antProd:[{ mes:"Oct-26", usd_kg:0.10 }],
    });
    const { ing, cost } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(100000, 2);
    expect(ing.cerezas[iM("Nov-26")]).toBeCloseTo(50000, 2);
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(450000, 2);
    expect(suma(ing.cerezas)).toBeCloseTo(600000, 2);          // venta completa
    expect(cost.cerezas[iM("Oct-26")]).toBeCloseTo(100000, 2);
    expect(cost.cerezas[iM("Mar-27")]).toBeCloseTo(322000, 2);
  });

  test('realizaciones anuladas no cuentan (y quedan en el registro)', () => {
    const p = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[
      { id:"r1", fecha:"2026-08-10", usd:60000 },
      { id:"r2", fecha:"2026-08-11", usd:25000, anulada:true, motivoAnulacion:"duplicada" },
    ]}]});
    const { ing } = calcAllegria(p);
    expect(ing.cerezas[iM("Oct-26")]).toBeCloseTo(40000, 2);
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(500000, 2);
  });

  test('anticipo sin mes: no se proyecta y se cobra en la liquidación (no se pierde caja)', () => {
    const p = paramsCerezas({ antCli:[{ id:"a1", mes:"", usd_kg:0.10, realizaciones:[rea(25000)] }] });
    const { ing } = calcAllegria(p);
    expect(suma(ing.cerezas)).toBeCloseTo(575000, 2);          // 600.000 − 25.000 ya cobrados
    expect(ing.cerezas[iM("Mar-27")]).toBeCloseTo(575000, 2);
  });
});

describe('cuadre pantalla ↔ consolidado', () => {
  const p = paramsCerezas({
    antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(60000)] }],
    antProd:[{ id:"b1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(70000)] }],
  });

  test('las líneas del flujo llevan exactamente lo calculado', () => {
    const emp = buildAllegria(p, { cobros:[] });
    const ingLine  = emp.sections.find(s=>s.cat==='ing_op').lines.find(l=>l.label==='Anticipo Cerezas');
    const costLine = emp.sections.find(s=>s.cat==='egr_var').lines.find(l=>l.label==='Costo Fruta Exportación');
    expect(suma(ingLine.proy)).toBeCloseTo(540000, 2);
    expect(suma(costLine.proy)).toBeCloseTo(352000, 2);
  });

  test('el consolidado usa el mismo árbol (sin overrides, números idénticos)', () => {
    const emp = buildAllegria(p, { cobros:[] });
    const cons = buildEmpresasConOverrides({ "Allegria Foods": emp }, {}, {}, {});
    const l = cons["Allegria Foods"].sections.find(s=>s.cat==='ing_op').lines.find(l=>l.label==='Anticipo Cerezas');
    expect(suma(l.proy)).toBeCloseTo(540000, 2);
  });

  test('un override manual manda sobre el cálculo (y se conserva)', () => {
    const emp = buildAllegria(p, { cobros:[] });
    const realData = { "Allegria Foods": { _proyOverrides: { "Anticipo Cerezas": { [iM("Oct-26")]: 12345 } } } };
    const cons = buildEmpresasConOverrides({ "Allegria Foods": emp }, realData, {}, {});
    const l = cons["Allegria Foods"].sections.find(s=>s.cat==='ing_op').lines.find(l=>l.label==='Anticipo Cerezas');
    expect(l.proy[iM("Oct-26")]).toBe(12345);
    expect(l.proy[iM("Mar-27")]).toBeCloseTo(500000, 2);   // el resto sigue calculado
  });
});

describe('Excel — fórmulas y saldo inicial', () => {
  const params = paramsCerezas({
    antCli:[
      { id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(60000)] },              // parcial
      { id:"a2", mes:"Nov-26", usd_kg:0.05, cerrado:true, realizaciones:[rea(20000)] },// cerrado parcial
    ],
    antProd:[{ id:"b1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(70000)] }],
  });
  const emp = buildAllegria(params, { cobros:[] });
  const SALDO_INI = 17433;
  let wb, hoja, par;

  beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive:true });
    const file = path.join(OUT_DIR, 'allegria_individual.xlsx');
    exportarFlujoEmpresa({ emp, empName:'Allegria Foods', saldoIni:SALDO_INI, fileName:file,
      params:{ paramsAllegria:params, allegraComisionArandanos:{ cobros:[] } } });
    wb = XLSX.readFile(file, { cellFormula:true });
    hoja = wb.Sheets['Allegria Foods'];
    par  = wb.Sheets['Parametros'];
    // referencia para el verificador de recálculo real (LibreOffice)
    const ing  = emp.sections.find(s=>s.cat==='ing_op').lines.find(l=>l.label==='Anticipo Cerezas');
    const cost = emp.sections.find(s=>s.cat==='egr_var').lines.find(l=>l.label==='Costo Fruta Exportación');
    fs.writeFileSync(path.join(OUT_DIR, 'esperado.json'), JSON.stringify({
      saldoIni: SALDO_INI,
      mesActual: `${MN[new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`,
      anticipoCerezas: MESES.map((m,i)=>({ mes:m, v:ing.proy[i] })).filter(x=>x.v),
      costoFruta:      MESES.map((m,i)=>({ mes:m, v:cost.proy[i] })).filter(x=>x.v),
      totalAnticipoCerezas: suma(ing.proy),
      totalCostoFruta: suma(cost.proy),
    }, null, 2));
  });

  test('el libro trae hoja Parametros y hoja de flujo', () => {
    expect(hoja).toBeTruthy(); expect(par).toBeTruthy();
  });

  test('el realizado va como CONSTANTE (no fórmula): cambiar kilos no lo mueve', () => {
    const celdas = Object.keys(par).filter(k=>/^F\d+$/.test(k)).map(k=>par[k]);
    const realizados = celdas.filter(c=>c && c.t==='n' && [60000,20000,70000].includes(c.v));
    expect(realizados.length).toBe(3);
    realizados.forEach(c => expect(c.f).toBeUndefined());   // sin fórmula → histórico fijo
  });

  test('el pendiente es fórmula con el caso "cerrado" incluido', () => {
    const pend = Object.keys(par).filter(k=>/^G\d+$/.test(k) && par[k].f && par[k].f.includes('Cerrado'));
    expect(pend.length).toBe(3);                            // 2 cliente + 1 productor
    pend.forEach(k => expect(par[k].f).toMatch(/IF\(\$?C\d+="Cerrado",0,MAX\(0,\$?E\d+-\$?F\d+\)\)/));
    // el anticipo cerrado tiene pendiente 0 en el valor cacheado
    const cerrado = pend.map(k=>par[k]).filter(c=>c.v===0);
    expect(cerrado.length).toBeGreaterThanOrEqual(1);
  });

  test('la liquidación descuenta realizado + pendiente proyectable', () => {
    const liq = Object.keys(par).filter(k=>/^F\d+$/.test(k) && par[k].f && par[k].f.includes('IF('));
    expect(liq.length).toBeGreaterThanOrEqual(2);           // cliente y productor
    liq.forEach(k => expect(par[k].f).toMatch(/\(F\d+\+IF\(I\d+="",0,G\d+\)\)|\(F\d+\+IF\(K\d+="",0,G\d+\)\)/));
  });

  test('valores cacheados de la hoja Parametros = números de pantalla', () => {
    // Liquidación cliente: 600.000 − (60.000 + 40.000 + 20.000 + 0) = 480.000
    const liqCli = Object.keys(par).map(k=>par[k]).filter(c=>c && c.f && /^MAX\(0,E\d+-F\d+\)$/.test(c.f));
    const vals = liqCli.map(c=>c.v).sort((a,b)=>a-b);
    expect(vals).toEqual(expect.arrayContaining([322000, 480000]));
  });

  test('el flujo arranca el saldo en el MES EN CURSO (no en Apr-26)', () => {
    // fila "Saldo inicial caja"
    const filaSaldo = Object.keys(hoja).filter(k=>/^A\d+$/.test(k) && hoja[k].v==='Saldo inicial caja')[0];
    const fila = Number(filaSaldo.slice(1));
    const filaMeses = Object.keys(hoja).filter(k=>/^[A-Z]+3$/.test(k));
    const colDe = (lbl) => { const k = filaMeses.find(k=>hoja[k].v===lbl); return k ? k.replace(/\d+$/,'') : null; };
    const mesActual = `${MN[new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`;
    const colHoy = colDe(mesActual), colAbr = colDe('Apr-26');
    expect(colAbr).toBeTruthy(); expect(colHoy).toBeTruthy();
    expect(hoja[`${colAbr}${fila}`].v).toBe('');             // mes histórico: sin arrastre
    expect(hoja[`${colHoy}${fila}`].v).toBeCloseTo(SALDO_INI, 2);
  });
});

describe('Excel consolidado', () => {
  test('el consolidado arranca en el mismo mes y referencia ese saldo', () => {
    fs.mkdirSync(OUT_DIR, { recursive:true });
    const params = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(60000)] }] });
    const emp = buildAllegria(params, { cobros:[] });
    const file = path.join(OUT_DIR, 'consolidado.xlsx');
    exportarFlujoConsolidado({
      empresasConOverrides:{ "Allegria Foods": emp },
      empNames:["Allegria Foods"], saldoIniPorEmp:{ "Allegria Foods": 17433 }, fileName:file,
    });
    const wb = XLSX.readFile(file, { cellFormula:true });
    const cons = wb.Sheets['Consolidado'];
    const filaSaldo = Object.keys(cons).filter(k=>/^A\d+$/.test(k) && cons[k].v==='Saldo inicial caja')[0];
    const fila = Number(filaSaldo.slice(1));
    const filaMeses = Object.keys(cons).filter(k=>/^[A-Z]+3$/.test(k));
    const colDe = (lbl) => { const k = filaMeses.find(k=>cons[k].v===lbl); return k ? k.replace(/\d+$/,'') : null; };
    const mesActual = `${MN[new Date().getMonth()]}-${String(new Date().getFullYear()).slice(2)}`;
    expect(cons[`${colDe('Apr-26')}${fila}`].v).toBe('');
    const celdaHoy = cons[`${colDe(mesActual)}${fila}`];
    expect(celdaHoy.v).toBeCloseTo(17433, 2);
    expect(celdaHoy.f).toContain("'Allegria Foods'!");       // referencia viva a la hoja empresa
  });
});

describe('Excel · override manual', () => {
  test('el mes con override manual va como valor fijo, no como fórmula', () => {
    const params = paramsCerezas({ antCli:[{ id:"a1", mes:"Oct-26", usd_kg:0.10, realizaciones:[rea(60000)] }] });
    const emp = buildAllegria(params, { cobros:[] });
    const realData = { "Allegria Foods": { _proyOverrides: { "Anticipo Cerezas": { [iM("May-26")]: 12345 } } } };
    const cons = buildEmpresasConOverrides({ "Allegria Foods": emp }, realData, {}, {});
    const l = cons["Allegria Foods"].sections.find(s=>s.cat==='ing_op').lines.find(x=>x.label==='Anticipo Cerezas');
    expect(l._ovIdx).toContain(iM("May-26"));

    fs.mkdirSync(OUT_DIR, { recursive:true });
    const file = path.join(OUT_DIR, 'override.xlsx');
    exportarFlujoEmpresa({ emp: cons["Allegria Foods"], empName:'Allegria Foods', saldoIni:0, fileName:file,
      params:{ paramsAllegria:params, allegraComisionArandanos:{ cobros:[] } } });
    const wb = XLSX.readFile(file, { cellFormula:true });
    const hoja = wb.Sheets['Allegria Foods'];
    const filaAnt = Object.keys(hoja).filter(k=>/^A\d+$/.test(k) && hoja[k].v==='Anticipo Cerezas')[0];
    const fila = Number(filaAnt.slice(1));
    const filaMeses = Object.keys(hoja).filter(k=>/^[A-Z]+3$/.test(k));
    const colDe = (lbl) => { const k = filaMeses.find(k=>hoja[k].v===lbl); return k ? k.replace(/\d+$/,'') : null; };
    const celdaOv  = hoja[`${colDe('May-26')}${fila}`];
    const celdaNor = hoja[`${colDe('Oct-26')}${fila}`];
    expect(celdaOv.v).toBe(12345);
    expect(celdaOv.f).toBeUndefined();          // valor fijo: el Excel no lo recalcula
    expect(celdaNor.f).toContain('SUMIF');      // el resto sigue vivo por fórmula
    expect(celdaNor.v).toBeCloseTo(40000, 2);
  });
});
