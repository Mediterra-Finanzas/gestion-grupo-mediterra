/* eslint-disable */
// DATOS FICTICIOS para las pruebas, la vista previa y los archivos de ejemplo de
// Reportes de Créditos. Ningún registro es real. Corte de referencia: 13-10-2026.
import { vencimientosCredito } from './creditos.js';

export const CORTE_PRUEBA = '2026-10-13';

// Maestros → Tipo de cambio (ficticio). Hay un dato POSTERIOR al corte que no debe usarse.
export const TC_PRUEBA = {
  'USD-CLP': [{ fecha: '2026-10-06', valor: 948, fuente: 'mindicador' }, { fecha: '2026-10-10', valor: 955, fuente: 'manual' },
              { fecha: '2026-10-20', valor: 990, fuente: 'mindicador' }],
  'UF-CLP': [{ fecha: '2026-10-09', valor: 40131.84, fuente: 'mindicador' }],
};

const pagarHasta = (c, hasta) => ({ ...c, pagos: vencimientosCredito(c).filter(v => v.fecha <= hasta).map((v, i) => ({
  id: `p-${c.uid}-${i}`, vencKey: v.key, fecha: v.fecha, capital: v.capital, interes: v.interes, cargos: v.cargos, sinDesglose: 0,
  tipo: 'pago', nota: 'Pago ficticio', usuario: 'prueba', ts: `${v.fecha}T12:00:00Z` })) });

export const CREDITOS_PRUEBA = [
  // Contrato lineal trimestral: Q1 pagada, Q2 con pago, Q3 (10-10) VENCIDA al corte con un pago
  // PARCIAL hasta el corte y el resto pagado DESPUÉS del corte (no reduce el saldo al corte).
  { uid: 'A', n: 1, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 400000, fecha_desembolso: '2026-01-10', primer_venc: '2026-04-10', vencimiento_final: '2027-01-10', periodicidad: 3, modalidad: 'lineal',
    tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-01-10', prepago_comision_tipo: 'ninguna',
    pagos: [
      { id: 'pA1', vencKey: 'A@2026-04-10', fecha: '2026-04-10', capital: 100000, interes: 8000, cargos: 0, sinDesglose: 0, tipo: 'pago', usuario: 'prueba', ts: '2026-04-10T12:00:00Z' },
      { id: 'pA2', vencKey: 'A@2026-07-10', fecha: '2026-07-10', capital: 100000, interes: 6066.67, cargos: 0, sinDesglose: 0, tipo: 'pago', usuario: 'prueba', ts: '2026-07-10T12:00:00Z' },
      { id: 'pA3', vencKey: 'A@2026-10-10', fecha: '2026-10-11', capital: 0, interes: 0, cargos: 0, sinDesglose: 30000, tipo: 'pago', nota: 'abono parcial', usuario: 'prueba', ts: '2026-10-11T12:00:00Z' },
      { id: 'pA4', vencKey: 'A@2026-10-10', fecha: '2026-10-20', capital: 0, interes: 0, cargos: 0, sinDesglose: 74088.89, tipo: 'pago', nota: 'resto, después del corte', usuario: 'prueba', ts: '2026-10-20T12:00:00Z' },
      { id: 'pA0', vencKey: 'A@2026-04-10', fecha: '2026-04-11', capital: 5, interes: 0, cargos: 0, sinDesglose: 0, tipo: 'pago', anulado: true, motivoAnulacion: 'duplicado', usuario: 'prueba', ts: '2026-04-11T12:00:00Z' },
    ] },
  { uid: 'G', n: 7, tipo_credito: 'contrato', empresa: 'Allegria Foods', acreedor: 'Banco Bullet Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 250000, fecha_desembolso: '2026-04-15', vencimiento_final: '2027-04-15', periodicidad: 6, modalidad: 'bullet_int',
    tasa_tipo: 'fija', tasa_anual: 6, base: 'act365', control_desde: '2026-04-15', prepago_comision_tipo: 'ninguna' },
  pagarHasta({ uid: 'H', n: 8, tipo_credito: 'contrato', empresa: 'Integrity Farms', acreedor: 'Banco Prepago Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 300000, fecha_desembolso: '2026-03-01', primer_venc: '2026-04-01', vencimiento_final: '2027-02-01', periodicidad: 1, modalidad: 'frances',
    tasa_tipo: 'fija', tasa_anual: 7.2, base: 'act360', control_desde: '2026-03-01', prepago_comision_tipo: 'ninguna' }, '2026-10-01'),
  pagarHasta({ uid: 'F', n: 6, tipo_credito: 'contrato', empresa: 'Mediterra', acreedor: 'Banco UF Demo', moneda: 'UF', tipo_cr: 'Inversión',
    monto: 1000, fecha_desembolso: '2026-04-09', primer_venc: '2026-10-09', vencimiento_final: '2027-04-09', periodicidad: 6, modalidad: 'lineal',
    tasa_tipo: 'fija', tasa_anual: 3.5, base: 'act360', control_desde: '2026-04-09', prepago_comision_tipo: 'ninguna', }, '2026-10-09'),
  // Registros antiguos (sin control_desde): vencidos antes de la regla y sin pago → POR CONCILIAR.
  { uid: 'B1', n: 30, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, cuota: 9178, f_venc: '2026-07-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  { uid: 'B2', n: 31, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, cuota: 9178, f_venc: '2026-12-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  { uid: 'B3', n: 36, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 550000, cuota: 550000, f_venc: '2027-01-01', tipo_cr: 'Inversión', tasa: '12.6%', pagado: false },
  { uid: 'B4', n: 35, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 34650, cuota: 34650, f_venc: '2026-09-01', tipo_cr: 'Inversión', tasa: '12.6%', pagado: false },
  // Otras monedas: CLP con TC de Maestros; PEN SIN TC; EUR con TC declarado en el crédito.
  { uid: 'C', n: 3, tipo_credito: 'contrato', empresa: 'Allegria Service', acreedor: 'Banco CLP Demo', moneda: 'CLP', tipo_cr: 'Capital de trabajo',
    monto: 95000000, fecha_desembolso: '2026-06-01', vencimiento_final: '2026-12-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 6, base: 'act360', control_desde: '2026-06-01' },
  { uid: 'D', n: 4, tipo_credito: 'contrato', empresa: 'Frisku Foods', acreedor: 'Banco Perú Demo', moneda: 'PEN', tipo_cr: 'Capital de trabajo',
    monto: 300000, fecha_desembolso: '2026-07-01', vencimiento_final: '2027-07-01', modalidad: 'bullet_int', periodicidad: 6, tasa_tipo: 'variable',
    tasa_ref_nombre: 'TAMN', tasa_ref_hipotesis: 9, margen: 2, base: 'act360', control_desde: '2026-07-01' },
  { uid: 'E', n: 5, tipo_credito: 'contrato', empresa: 'Allegria Foods', acreedor: 'Banco EUR Demo', moneda: 'EUR', tipo_cr: 'Capital de trabajo',
    monto: 100000, fecha_desembolso: '2026-08-01', vencimiento_final: '2027-02-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 5, base: 'act360',
    control_desde: '2026-08-01', tc_flujo: 0.85, tc_flujo_fecha: '2026-09-01' },
  // RENOVACIÓN: el original (30-09) pagado con registro; la renovación con un abono parcial a su 1.ª cuota.
  { uid: 'R', n: 12, empresa: 'Allegria Service', acreedor: 'Banco Renueva Demo', tipo_inst: 'Banco', moneda: 'USD', monto: 200000, cuota: 200000,
    f_venc: '2026-09-30', tipo_cr: 'Bullet', tasa: '8.3%', pagado: false, control_desde: '2026-01-01', renovable: true, tasa_anual: 8.3,
    renovaciones: [{ monto: 200000, mes_ingreso: 'Sep', anio_ingreso: 2026,
      cuotas: [{ tipo: 'Solo Interés', mes: 'Dic', anio: 2026 }, { tipo: 'Capital+Interés', mes: 'Mar', anio: 2027 }] }],
    pagos: [
      { id: 'pR0', vencKey: 'R@2026-09-30', fecha: '2026-09-30', capital: 0, interes: 0, cargos: 0, sinDesglose: 200000, tipo: 'pago', nota: 'pagado con la renovación', usuario: 'prueba', ts: '2026-09-30T12:00:00Z' },
      { id: 'pR1', vencKey: 'R@R0@0', fecha: '2026-10-05', capital: 0, interes: 1000, cargos: 0, sinDesglose: 0, tipo: 'pago', nota: 'abono parcial de interés', usuario: 'prueba', ts: '2026-10-05T12:00:00Z' },
    ] },
  // JV (método de participación): se muestran aparte, nunca se suman al consolidado.
  { uid: 'J1', n: 40, tipo_credito: 'contrato', empresa: 'Allpa Farms', acreedor: 'Banco JV Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 500000, fecha_desembolso: '2026-05-01', vencimiento_final: '2027-05-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 7, base: 'act360', control_desde: '2026-05-01' },
  { uid: 'J2', n: 41, tipo_credito: 'contrato', empresa: 'Allpa Farms Perú', acreedor: 'Banco JV Perú Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 120000, fecha_desembolso: '2026-06-15', vencimiento_final: '2026-12-15', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-06-15' },
  // ANULADO: no aparece salvo que se pida el estado «Anulado».
  { uid: 'X', n: 99, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 10000, fecha_desembolso: '2026-02-01', vencimiento_final: '2026-08-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 8, base: 'act360',
    control_desde: '2026-02-01', anulado: true, motivoAnulacion: 'mal ingresado' },
];
