/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// ESCENARIO "incluyendo cuotas por conciliar" vs valores manuales
//
// Regla (ronda 4): un valor manual en Pago Préstamos del mes en curso NO
// excluye automáticamente las cuotas por conciliar. Solo se excluyen las
// cuotas vinculadas explícitamente (cobertura con nota). Sin cobertura
// definida → se suman, se marcan como posible superposición y el escenario
// queda PROVISIONAL.
//
// Datos (20-may-2026, control desde 01-may-2026, sin pagos registrados):
//   Banco B 400.000 lineal trimestral 8% Act/360 → cuota 10-abr = 100.000 + 8.000 = 108.000
//   Banco C 200.000 lineal trimestral 8% Act/360 → cuota 10-abr =  50.000 + 4.000 =  54.000
//   (interés 10-ene→10-abr = 90 días)
// ═══════════════════════════════════════════════════════════════════
import { buildEmpresas, aplicarCreditosAEmpresas, escenarioPorConciliar, claveLinea } from '../FinanzasModule.jsx';

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const base = { tipo_credito:'contrato', empresa:'Osiris', moneda:'USD', fecha_desembolso:'2026-01-10', primer_venc:'2026-04-10',
  vencimiento_final:'2027-01-10', periodicidad:3, modalidad:'lineal', tasa_tipo:'fija', tasa_anual:8, base:'act360', control_desde:'2026-05-01' };
const cB = { ...base, uid:'cB', n:901, acreedor:'Banco B', monto:400000 };
const cC = { ...base, uid:'cC', n:902, acreedor:'Banco C', monto:200000 };

let empresas, idx;
beforeAll(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(2026, 4, 20, 15, 0, 0));
  empresas = aplicarCreditosAEmpresas(buildEmpresas({}, { cobros: [] }), [cB, cC]);
  idx = MESES.indexOf('May-26');
});
afterAll(() => jest.useRealTimers());

const rd = (cob) => ({ _proyOverrides: { [claveLinea('egr_nop', 'Pago Préstamos - Total')]: { [idx]: 150000 } },
  ...(cob ? { _coberturasManual: [cob] } : {}) });

describe('Escenario por conciliar con valores manuales', () => {
  test('Sin valor manual: suma ambas cuotas (108.000 + 54.000 = 162.000), escenario completo', () => {
    const e = escenarioPorConciliar('Osiris', empresas.Osiris, [cB, cC], {});
    expect(e.incluidas.length).toBe(2);
    expect(e.impacto).toBeCloseTo(162000, 2);
    expect(e.provisional).toBe(false);
  });

  test('Valor manual SIN cobertura definida: no excluye nada, marca superposición 162.000 y queda provisional', () => {
    const e = escenarioPorConciliar('Osiris', empresas.Osiris, [cB, cC], rd(null));
    expect(e.excluidas.length).toBe(0);
    expect(e.impacto).toBeCloseTo(162000, 2);
    expect(e.pendientesCobertura.length).toBe(2);
    expect(e.superposicionUSD).toBeCloseTo(162000, 2);
    expect(e.provisional).toBe(true);
  });

  test('Cobertura explícita solo de Banco B: excluye 108.000, suma 54.000 de Banco C, sin superposición', () => {
    const cob = { id:'k1', linea:'Pago Préstamos - Total', idx, vencKeys:['cB@2026-04-10'], nota:'cartola mayo: pago Banco B', usuario:'test' };
    const e = escenarioPorConciliar('Osiris', empresas.Osiris, [cB, cC], rd(cob));
    expect(e.excluidas.map(v => v.key)).toEqual(['cB@2026-04-10']);
    expect(e.excluidoUSD).toBeCloseTo(108000, 2);
    expect(e.impacto).toBeCloseTo(54000, 2);
    expect(e.pendientesCobertura.length).toBe(0);
    expect(e.provisional).toBe(false);
  });

  test('Cobertura anulada vuelve a quedar pendiente', () => {
    const cob = { id:'k1', linea:'Pago Préstamos - Total', idx, vencKeys:['cB@2026-04-10'], nota:'x', usuario:'test', anulado:true };
    const e = escenarioPorConciliar('Osiris', empresas.Osiris, [cB, cC], rd(cob));
    expect(e.excluidas.length).toBe(0);
    expect(e.pendientesCobertura.length).toBe(2);
    expect(e.provisional).toBe(true);
  });
});
