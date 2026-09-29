/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// ANTICIPOS DE ALLPA FARMS CHILE (por variedad) CON COBROS PARCIALES
//
// Mismo modelo que Allegria Foods (src/anticipos.js): se proyecta solo el
// pendiente, y lo ya cobrado sigue descontándose de la liquidación.
// Cambiar kilos o la tarifa no puede mover lo históricamente cobrado.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx-js-style';
import { calcAllpa, buildEmpresas } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';
import { pendientesVencidos } from '../anticipos.js';

const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES=(()=>{const o=[];let y=2026,m=3;while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`);m++;if(m>11){m=0;y++;}}return o;})();
const iM = l => MESES.indexOf(l);

// Temporada 2026-2027, una variedad: 100.000 kg × US$5 = US$500.000
const params = (anticipos, kg = 100000) => ({
  '2026-2027': { variedades:[{ nombre:'Santina', usd_kg:5,
      kg_mes:{ 'Nov-26': kg }, mes_liq:'Mar-27', anticipos }],
    cosecha:{usd_kg:0,semanas_pago:[]}, transporte:{costo_persona:0,personas:0,meses_pago:[]} } });

describe('proyección: solo el pendiente', () => {
  test('sin realizaciones se comporta igual que antes (retrocompatible)', () => {
    const { ingArr } = calcAllpa(params([{ mes:'Oct-26', usd_kg:1 }]));
    expect(ingArr[iM('Oct-26')]).toBe(100000);          // anticipo completo
    expect(ingArr[iM('Mar-27')]).toBe(400000);          // liquidación
  });

  test('con un cobro parcial se proyecta solo el pendiente y la liquidación no cambia', () => {
    const { ingArr } = calcAllpa(params([{ id:'a1', mes:'Oct-26', usd_kg:1,
      realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:60000 }] }]));
    expect(ingArr[iM('Oct-26')]).toBe(40000);           // 100.000 − 60.000 cobrados
    expect(ingArr[iM('Mar-27')]).toBe(400000);          // 500.000 − (60.000 + 40.000)
    // cuadre: 60.000 realizados + 440.000 futuros = 500.000
    expect(60000 + ingArr[iM('Oct-26')] + ingArr[iM('Mar-27')]).toBe(500000);
  });

  test('cerrado: el pendiente deja de proyectarse y pasa a la liquidación', () => {
    const { ingArr } = calcAllpa(params([{ id:'a1', mes:'Oct-26', usd_kg:1, cerrado:true,
      realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:60000 }] }]));
    expect(ingArr[iM('Oct-26')]).toBe(0);
    expect(ingArr[iM('Mar-27')]).toBe(440000);          // 500.000 − 60.000
    expect(60000 + ingArr[iM('Mar-27')]).toBe(500000);
  });

  test('anticipo sin mes: no se proyecta, pero lo cobrado SIGUE descontando', () => {
    const { ingArr } = calcAllpa(params([{ id:'a1', mes:'', usd_kg:1,
      realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:60000 }] }]));
    expect(ingArr[iM('Mar-27')]).toBe(440000);          // 500.000 − 60.000 realizados
    expect(60000 + ingArr[iM('Mar-27')]).toBe(500000);
  });

  test('una realización anulada no descuenta', () => {
    const { ingArr } = calcAllpa(params([{ id:'a1', mes:'Oct-26', usd_kg:1,
      realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:60000, anulada:true, motivoAnulacion:'error de carga' }] }]));
    expect(ingArr[iM('Oct-26')]).toBe(100000);
    expect(ingArr[iM('Mar-27')]).toBe(400000);
  });
});

describe('cambiar kilos no mueve lo ya cobrado', () => {
  const anticipo = [{ id:'a1', mes:'Oct-26', usd_kg:1,
    realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:60000 }] }];
  test('kilos 100.000 → 80.000: el realizado sigue en 60.000 y el pendiente baja', () => {
    const { ingArr } = calcAllpa(params(anticipo, 80000));
    // acordado 80.000, realizado 60.000 → pendiente 20.000
    expect(ingArr[iM('Oct-26')]).toBe(20000);
    // venta 400.000 − (60.000 + 20.000) = 320.000
    expect(ingArr[iM('Mar-27')]).toBe(320000);
    expect(60000 + 20000 + 320000).toBe(400000);
  });
  test('kilos a la baja hasta que lo cobrado supera lo acordado', () => {
    const { ingArr } = calcAllpa(params(anticipo, 50000));   // acordado 50.000 < cobrado 60.000
    expect(ingArr[iM('Oct-26')]).toBe(0);                    // pendiente 0, nunca negativo
    expect(ingArr[iM('Mar-27')]).toBe(190000);               // 250.000 − 60.000
    expect(60000 + 190000).toBe(250000);
  });
});

describe('sobre-anticipo', () => {
  test('cobrado por sobre la venta: liquidación 0, sin compensación automática', () => {
    const { ingArr } = calcAllpa(params([{ id:'a1', mes:'Oct-26', usd_kg:1,
      realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:550000 }] }]));
    expect(ingArr[iM('Oct-26')]).toBe(0);
    expect(ingArr[iM('Mar-27')]).toBe(0);
  });
});

describe('pendientes vencidos', () => {
  test('lista los que quedan antes del corte, sin moverlos', () => {
    const anticipos = [
      { id:'a1', mes:'May-26', usd_kg:1, realizaciones:[{ id:'r1', usd:20000 }] }, // vencido
      { id:'a2', mes:'Dec-26', usd_kg:1 },                                          // futuro
      { id:'a3', mes:'Jun-26', usd_kg:1, cerrado:true },                            // cerrado
    ];
    const corte = iM('Sep-26');
    const r = pendientesVencidos(anticipos, 100000, a => { const i = iM(a.mes); return i>=0 && i<corte; });
    expect(r.total).toBe(80000);
    expect(r.detalle).toEqual([{ id:'a1', mes:'May-26', pendiente:80000 }]);
    // el dato NO se modificó
    expect(anticipos[0].mes).toBe('May-26');
  });
});

describe('hoja Parametros de Allpa: el flujo lee el pendiente, no el acordado', () => {
  const anticipos = [{ id:'a1', mes:'Oct-26', usd_kg:1,
    realizaciones:[{ id:'r1', fecha:'2026-10-05', usd:60000 }] }];

  function hoja(p) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allpa-'));
    const file = path.join(dir, 'allpa.xlsx');
    const emp = buildEmpresas({}, { cobros: [] })['Allpa Farms'];
    exportarFlujoEmpresa({ emp, empName:'Allpa Farms', saldoIni:0, fileName:file, params:{ paramsAF:p } });
    const wb = XLSX.readFile(file, { cellFormula: true });
    const ws = wb.Sheets['Parametros'];
    fs.rmSync(dir, { recursive:true, force:true });
    return ws;
  }
  // Valores de la columna de movimiento (la que el flujo lee por SUMIF),
  // emparejados con el mes de su fila.
  function movimientos(ws) {
    const out = {};
    Object.keys(ws).filter(k => /^I\d+$/.test(k)).forEach(k => {
      const fila = k.slice(1);
      const mes = ws[k]?.v, monto = ws[`J${fila}`]?.v;
      if (typeof mes === 'string' && mes && typeof monto === 'number') out[mes] = (out[mes]||0) + monto;
    });
    return out;
  }

  test('el movimiento del mes del anticipo es el PENDIENTE', () => {
    const mov = movimientos(hoja(params(anticipos)));
    expect(mov['Oct-26']).toBe(40000);        // no 100.000
  });

  test('la liquidación descuenta realizado + pendiente', () => {
    const mov = movimientos(hoja(params(anticipos)));
    expect(mov['Mar-27']).toBe(400000);
  });

  test('el Excel coincide con el cálculo de la pantalla, mes a mes', () => {
    const p = params(anticipos);
    const { ingArr } = calcAllpa(p);
    const mov = movimientos(hoja(p));
    MESES.forEach((m, i) => {
      if (ingArr[i] !== 0 || mov[m] !== undefined) {
        expect([m, mov[m] || 0]).toEqual([m, ingArr[i]]);
      }
    });
  });

  test('el realizado va como constante: no es una fórmula', () => {
    const ws = hoja(params(anticipos));
    const filaAnt = Object.keys(ws).filter(k => /^B\d+$/.test(k) && /↳ Anticipo/.test(String(ws[k].v)))[0];
    const n = filaAnt.slice(1);
    expect(ws[`F${n}`].v).toBe(60000);
    expect(ws[`F${n}`].f).toBeUndefined();     // constante, nunca fórmula
    expect(ws[`E${n}`].f).toBeTruthy();        // acordado sí es fórmula
    expect(ws[`G${n}`].f).toMatch(/MAX\(0/);  // pendiente también
  });
});
