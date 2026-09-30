/* eslint-disable */
// Tests del modelo de créditos — ejecutar: node src/creditos.test.mjs
// Cada caso deja escrito el cálculo aritmético esperado.
import {
  sumarMeses, fraccionAnio, calendarioContrato, vencimientosCredito, aplicarPagos, estadoCredito,
  registrarPago, anularPago, flujoCreditosEmpresa, simularPrepago, aplicarPrepago, asegurarUids,
  servicioDeudaPorMes, saldoCapitalAl, analisisCartera, datosFaltantesContrato,
  confirmarImpaga, anularConciliacion, porConciliarCartera, registrarPagoIdempotente, pagoPorOrigen,
} from './creditos.js';

let fallos = 0;
const aprox = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
function check(nombre, cond, extra = '') {
  console.log(`${cond ? '✓' : '✗ FALLA'}  ${nombre}${extra ? '  — ' + extra : ''}`);
  if (!cond) fallos++;
}
const suma = (arr, k) => arr.reduce((s, x) => s + (k ? x[k] : x), 0);

// Horizonte del flujo como en FinanzasModule: Apr-26 = índice 0, 63 meses.
const ubicar = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const idx = (y - 2026) * 12 + (m - 4);
  return { idx: idx >= 0 && idx < 63 ? idx : -1, semIdx: Math.min(3, Math.floor((d - 1) / 7)) };
};
const iM = (y, m) => (y - 2026) * 12 + (m - 4);

// ── Fechas ────────────────────────────────────────────────────────
check('31-ene + 1 mes = 28-feb (no se desborda)', sumarMeses('2027-01-31', 1) === '2027-02-28');
check('30/360: 15-ene → 15-feb = 30/360', aprox(fraccionAnio('30360', '2026-01-15', '2026-02-15'), 30 / 360, 1e-9));
check('Act/360: 10-ene → 10-abr = 90 días', aprox(fraccionAnio('act360', '2026-01-10', '2026-04-10'), 90 / 360, 1e-9));

// ═══ CASO 1 — Amortización mensual (cuota fija) ════════════════════
// 120.000 al 12% anual, 30/360, 12 cuotas mensuales.
// r = 12%/12 = 1% · cuota = 120.000 × 0,01 / (1 − 1,01^−12) = 10.661,85
// Cuota 1: interés = 120.000 × 12% × 30/360 = 1.200,00 ; capital = 10.661,85 − 1.200 = 9.461,85
const c1 = { uid: 'c1', n: 1, tipo_credito: 'contrato', empresa: 'Frisku Foods', acreedor: 'Banco A', moneda: 'USD',
  monto: 120000, fecha_desembolso: '2026-01-15', primer_venc: '2026-02-15', vencimiento_final: '2027-01-15',
  periodicidad: 1, modalidad: 'frances', tasa_tipo: 'fija', tasa_anual: 12, base: '30360' };
const k1 = calendarioContrato(c1).filas;
check('C1: 12 cuotas', k1.length === 12, `${k1.length}`);
check('C1: cuota 1 = 1.200,00 interés + 9.461,85 capital', aprox(k1[0].interes, 1200) && aprox(k1[0].capital, 9461.85), `${k1[0].interes} + ${k1[0].capital}`);
check('C1: todas las cuotas ≈ 10.661,85', k1.every(f => aprox(f.capital + f.interes, 10661.85, 0.02)), k1.map(f => (f.capital + f.interes).toFixed(2)).join(' '));
check('C1: Σ capital = 120.000,00 exacto', aprox(suma(k1, 'capital'), 120000, 0.001), suma(k1, 'capital').toFixed(2));
check('C1: saldo final = 0', aprox(k1[11].saldoFinal, 0, 0.02));
check('C1: Σ intereses = 12 × 10.661,855 − 120.000 = 7.942,26', aprox(suma(k1, 'interes'), 7942.26, 0.05), suma(k1, 'interes').toFixed(2));

// ═══ CASO 2 — Cuotas trimestrales (capital constante) ══════════════
// 400.000 al 8% Act/360, 4 cuotas trimestrales de capital 100.000.
//   Q1 10-ene→10-abr 90 d: 400.000 × 8% × 90/360 = 8.000,00
//   Q2 10-abr→10-jul 91 d: 300.000 × 8% × 91/360 = 6.066,67
//   Q3 10-jul→10-oct 92 d: 200.000 × 8% × 92/360 = 4.088,89
//   Q4 10-oct→10-ene 92 d: 100.000 × 8% × 92/360 = 2.044,44
const c2 = { uid: 'c2', n: 2, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco B', moneda: 'USD',
  monto: 400000, fecha_desembolso: '2026-01-10', primer_venc: '2026-04-10', vencimiento_final: '2027-01-10',
  periodicidad: 3, modalidad: 'lineal', tasa_tipo: 'fija', tasa_anual: 8, base: 'act360',
  prepago_comision_tipo: 'meses_interes', prepago_comision_valor: 1,
  control_desde: '2026-01-10' };   // controlado en la app desde el desembolso
const k2 = calendarioContrato(c2).filas;
check('C2: 4 cuotas trimestrales', k2.map(f => f.fecha).join(',') === '2026-04-10,2026-07-10,2026-10-10,2027-01-10');
check('C2: capital 100.000 cada una', k2.every(f => aprox(f.capital, 100000)));
check('C2: intereses 8.000,00 / 6.066,67 / 4.088,89 / 2.044,44',
  aprox(k2[0].interes, 8000) && aprox(k2[1].interes, 6066.67) && aprox(k2[2].interes, 4088.89) && aprox(k2[3].interes, 2044.44),
  k2.map(f => f.interes).join(' / '));

// ═══ CASO 3 — Bullet: intereses semestrales, capital al vencimiento ═
// 500.000 al 9% Act/365.
//   01-mar-26→01-sep-26 184 d: 500.000 × 9% × 184/365 = 22.684,93
//   01-sep-26→01-mar-27 181 d: 500.000 × 9% × 181/365 = 22.315,07
//   01-mar-27→01-sep-27 184 d: 22.684,93 + capital 500.000
const c3 = { uid: 'c3', n: 3, tipo_credito: 'contrato', empresa: 'Mediterra', acreedor: 'Banco C', moneda: 'USD',
  monto: 500000, fecha_desembolso: '2026-03-01', primer_venc: '2026-09-01', vencimiento_final: '2027-09-01',
  periodicidad: 6, modalidad: 'bullet_int', tasa_tipo: 'fija', tasa_anual: 9, base: 'act365' };
const k3 = calendarioContrato(c3).filas;
check('C3: 3 vencimientos semestrales', k3.length === 3);
check('C3: intereses 22.684,93 / 22.315,07 / 22.684,93', aprox(k3[0].interes, 22684.93) && aprox(k3[1].interes, 22315.07) && aprox(k3[2].interes, 22684.93),
  k3.map(f => f.interes).join(' / '));
check('C3: capital 0 / 0 / 500.000', k3[0].capital === 0 && k3[1].capital === 0 && aprox(k3[2].capital, 500000));

// ═══ CASO 4 — Capital + intereses al vencimiento ═══════════════════
// 200.000 al 10% Act/360, 30-jun-26 → 27-dic-26 = 180 días.
// interés = 200.000 × 10% × 180/360 = 10.000 ; total = 210.000
const c4 = { uid: 'c4', n: 4, tipo_credito: 'contrato', empresa: 'Allegria Foods', acreedor: 'Banco D', moneda: 'USD',
  monto: 200000, fecha_desembolso: '2026-06-30', vencimiento_final: '2026-12-27', modalidad: 'bullet_total',
  tasa_tipo: 'fija', tasa_anual: 10, base: 'act360' };
const k4 = calendarioContrato(c4).filas;
check('C4: un vencimiento 27-dic-26 de 200.000 + 10.000', k4.length === 1 && k4[0].fecha === '2026-12-27' && aprox(k4[0].capital, 200000) && aprox(k4[0].interes, 10000));

// ═══ CASO 5 — Pago parcial (sobre C2, cuota Q1 = 108.000) ══════════
// Paga el 10-abr: interés 8.000 + capital 40.000 = 48.000 → quedan 60.000 de capital.
const HOY = '2026-05-20';
let c5 = registrarPago(c2, { vencKey: 'c2@2026-04-10', fecha: '2026-04-10', interes: 8000, capital: 40000, nota: 'parcial' }, 'test');
let e5 = estadoCredito(c5, HOY);
const q1 = e5.vencimientos[0];
check('C5: Q1 pendiente = 108.000 − 48.000 = 60.000 (solo capital)', aprox(q1.pendienteTotal, 60000) && aprox(q1.pendiente.capital, 60000) && q1.pendiente.interes === 0);
check('C5: Q1 queda vencida (parcial) al 20-may', q1.estado === 'vencida' && q1.parcial === true);
check('C5: saldo capital = 400.000 − 40.000 = 360.000', aprox(e5.saldoCapital, 360000), `${e5.saldoCapital}`);
// Un pago SOLO de intereses no baja el capital
const c5b = registrarPago(c2, { vencKey: 'c2@2026-04-10', fecha: '2026-04-10', interes: 8000 }, 'test');
check('C5: pagar solo intereses NO reduce el saldo de capital (sigue 400.000)', aprox(estadoCredito(c5b, HOY).saldoCapital, 400000));
// Flujo: los 60.000 impagos NO desaparecen: se arrastran al mes/semana en curso (May-26, semana 3 → idx 2 por día 20)
const fl5 = flujoCreditosEmpresa('Osiris', [c5], { hoy: HOY, ubicar });
check('C5: flujo May-26 = 60.000 arrastrado', aprox(fl5.prestamos.total[iM(2026, 5)], 60000) && fl5.arrastrados.length === 1);
check('C5: flujo Apr-26 = 0 (ya no se proyecta en el mes pasado)', fl5.prestamos.total[iM(2026, 4)] === 0);
check('C5: flujo Jul-26 = Q2 completa 106.066,67', aprox(fl5.prestamos.total[iM(2026, 7)], 106066.67));
check('C5: capital/interés separados en Jul-26 = 100.000 / 6.066,67',
  aprox(fl5.prestamos.capital[iM(2026, 7)], 100000) && aprox(fl5.prestamos.interes[iM(2026, 7)], 6066.67));
check('C5: Σ semanas = mes (May-26)', aprox(suma(fl5.prestamos.sem[iM(2026, 5)]), fl5.prestamos.total[iM(2026, 5)]));
// Completa el pago → deja de aparecer
const c5c = registrarPago(c5, { vencKey: 'c2@2026-04-10', fecha: '2026-05-20', capital: 60000 }, 'test');
const fl5c = flujoCreditosEmpresa('Osiris', [c5c], { hoy: HOY, ubicar });
check('C5: completado el pago, May-26 = 0 y Q1 pagada', fl5c.prestamos.total[iM(2026, 5)] === 0 && estadoCredito(c5c, HOY).vencimientos[0].estado === 'pagada');
// Anular un pago lo devuelve al flujo, con motivo y sin borrarlo
const idP = c5c.pagos[1].id;
const c5d = anularPago(c5c, idP, 'monto mal digitado', 'test');
check('C5: anulado el pago, vuelven los 60.000 y el pago queda en el historial', aprox(flujoCreditosEmpresa('Osiris', [c5d], { hoy: HOY, ubicar }).prestamos.total[iM(2026, 5)], 60000)
  && c5d.pagos.length === 2 && c5d.pagos[1].anulado === true);
let err = ''; try { anularPago(c5c, idP, '', 'test'); } catch (e) { err = e.message; }
check('C5: anular sin motivo se rechaza', /motivo/.test(err));

// ═══ CASO 6 — Prepagos sobre C2 (Q1 pagada completa el 10-abr) ═════
const c6 = registrarPago(c2, { vencKey: 'c2@2026-04-10', fecha: '2026-04-10', capital: 100000, interes: 8000 }, 'test');
// 6a) Parcial 100.000 el 25-may, reduce plazo. Comisión contractual 1 mes de interés.
//   devengado  = 100.000 × 8% × 45/360 (10-abr→25-may)      = 1.000,00
//   comisión   = 100.000 × 8% / 12                         =   666,67
//   desembolso = 100.000 + 1.000 + 666,67                  = 101.666,67
//   intereses futuros originales = 6.066,67 + 4.088,89 + 2.044,44 = 12.200,00
//   escenario (saldo 200.000, capital 100.000 por cuota):
//     Q2 200.000 × 8% × 91/360 = 4.044,44 ; Q3 100.000 × 8% × 92/360 = 2.044,44 → 6.088,89
//   evitados = 12.200 − 6.088,89 − 1.000 = 5.111,11 ; ahorro neto = 5.111,11 − 666,67 = 4.444,44
const s6 = simularPrepago(c6, { fecha: '2026-05-25', capital: 100000, modo: 'plazo' }, HOY);
check('C6a: devengado 1.000,00', aprox(s6.devengado, 1000), `${s6.devengado}`);
check('C6a: comisión 666,67', aprox(s6.comision, 666.67), `${s6.comision}`);
check('C6a: desembolso 101.666,67', aprox(s6.desembolso, 101666.67), `${s6.desembolso}`);
check('C6a: intereses futuros 12.200,00 → 6.088,89', aprox(s6.interesesFuturosOriginal, 12200) && aprox(s6.interesesFuturosEscenario, 6088.89));
check('C6a: evitados 5.111,11 · ahorro neto 4.444,44', aprox(s6.interesesEvitados, 5111.11) && aprox(s6.ahorroNeto, 4444.44), `${s6.interesesEvitados} · ${s6.ahorroNeto}`);
check('C6a: exacto y aplicable, sin hipótesis', s6.exacto && s6.aplicable && s6.hipotesis.length === 0 && s6.faltantes.length === 0);
check('C6a: la simulación NO modifica el crédito', !c6.prepagos && c6.pagos.length === 1);
// Aplicar: el calendario se recalcula y el flujo no duplica
const c6ap = aplicarPrepago(c6, s6, 'test');
const e6 = estadoCredito(c6ap, HOY);
check('C6a aplicado: quedan 2 cuotas (jul y oct)', e6.vencimientos.filter(v => v.pendienteTotal > 0).map(v => v.fecha).join(',') === '2026-07-10,2026-10-10');
check('C6a aplicado: saldo capital 200.000', aprox(e6.saldoCapital, 200000));
check('C6a aplicado: Q1 sigue pagada (la clave por fecha no cambia)', e6.vencimientos[0].estado === 'pagada');
const fl6 = flujoCreditosEmpresa('Osiris', [c6ap], { hoy: HOY, ubicar });
check('C6a aplicado: flujo Jul-26 104.044,44 · Oct-26 102.044,44 · Jan-27 0',
  aprox(fl6.prestamos.total[iM(2026, 7)], 104044.44) && aprox(fl6.prestamos.total[iM(2026, 10)], 102044.44) && fl6.prestamos.total[iM(2027, 1)] === 0);
check('C6a aplicado: capital pagado total 200.000 (Q1 100.000 + prepago 100.000)', aprox(e6.pagadoCapital, 200000));
// Anular el prepago revierte el calendario
const c6rev = anularPago(c6ap, c6ap.pagos[1].id, 'prueba de reverso', 'test');
check('C6a reverso: vuelven 3 cuotas y saldo 300.000', aprox(estadoCredito(c6rev, HOY).saldoCapital, 300000));
// 6b) Parcial, reduce cuota: capital 66.666,67 × 3
//   Q2 200.000 × 8% × 91/360 = 4.044,44 ; Q3 133.333,33 × 8% × 92/360 = 2.725,93 ; Q4 66.666,67 × 8% × 92/360 = 1.362,96
//   escenario 8.133,33 → evitados 12.200 − 8.133,33 − 1.000 = 3.066,67
const s6b = simularPrepago(c6, { fecha: '2026-05-25', capital: 100000, modo: 'cuota' }, HOY);
check('C6b: reduce cuota → escenario 8.133,33, evitados 3.066,67', aprox(s6b.interesesFuturosEscenario, 8133.33, 0.02) && aprox(s6b.interesesEvitados, 3066.67, 0.02),
  `${s6b.interesesFuturosEscenario} · ${s6b.interesesEvitados}`);
// 6c) Total el 25-may
//   devengado = 300.000 × 8% × 45/360 = 3.000 ; comisión = 300.000 × 8%/12 = 2.000
//   desembolso = 305.000 ; evitados = 12.200 − 0 − 3.000 = 9.200 ; ahorro neto = 7.200
const s6c = simularPrepago(c6, { fecha: '2026-05-25', total: true, modo: 'plazo' }, HOY);
check('C6c: total → capital 300.000, devengado 3.000, comisión 2.000, desembolso 305.000',
  aprox(s6c.capital, 300000) && aprox(s6c.devengado, 3000) && aprox(s6c.comision, 2000) && aprox(s6c.desembolso, 305000));
check('C6c: evitados 9.200 · ahorro neto 7.200', aprox(s6c.interesesEvitados, 9200) && aprox(s6c.ahorroNeto, 7200));
check('C6c detalle: devengo desde 10-abr-26 (último pago de intereses) hasta 25-may-26 = 45 días', s6c.desde === '2026-04-10' && s6c.diasDevengados === 45);
check('C6c detalle: saldo capital antes del prepago 300.000 (3 cuotas de 100.000)', aprox(s6c.saldoCapital, 300000));
check('C6c detalle: calendario original posterior = 10-jul, 10-oct, 10-ene-27; escenario vacío',
  s6c.original.map(v => v.fecha).join(',') === '2026-07-10,2026-10-10,2027-01-10' && s6c.escenario.length === 0);
const c6cap = aplicarPrepago(c6, s6c, 'test');
const e6c = estadoCredito(c6cap, HOY);
check('C6c aplicado: crédito cerrado, sin nada en el flujo', e6c.estado === 'cerrado' && suma(flujoCreditosEmpresa('Osiris', [c6cap], { hoy: HOY, ubicar }).prestamos.total) === 0);

// Faltan condiciones → estimación explícita, no se inventa
const c7 = { ...c2, uid: 'c7', prepago_comision_tipo: '', prepago_comision_valor: '' };
const s7 = simularPrepago(c7, { fecha: '2026-05-25', capital: 50000, modo: 'plazo' }, HOY);
check('Sin condición de prepago → faltante declarado, sin ahorro neto ni aplicación', s7.faltantes.some(f => /prepago/.test(f)) && s7.ahorroNeto === null && !s7.aplicable);
const c8 = { ...c2, uid: 'c8', tasa_anual: '' };
check('Contrato sin tasa → no genera calendario y lo dice', calendarioContrato(c8).filas.length === 0 && datosFaltantesContrato(c8).includes('tasa de interés'));

// ═══ Compatibilidad con registros legacy ═══════════════════════════
const legacy = [
  { n: 30, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, f_venc: '2026-10-31', tipo_cr: 'Cuotas Mensuales', tasa: '', cuota: 9178, pagado: false },
  { n: 30, empresa: 'Allpa Farms', acreedor: 'Banco de Chile', tipo_inst: 'Banco', monto: 216751, f_venc: '2029-06-26', tipo_cr: 'Crédito Hipotecario', tasa: '7.7%', cuota: 216751, pagado: false },
  { n: 36, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 550000, f_venc: '2027-01-01', tipo_cr: 'Inversión', tasa: '12.6%', cuota: 550000, pagado: false },
  { n: 31, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, f_venc: '2026-11-30', tipo_cr: 'Cuotas Mensuales', tasa: '', cuota: 9178, pagado: true },
];
const { lista: conUid } = asegurarUids(legacy);
check('uids únicos aunque los n se repitan (30 dos veces)', new Set(conUid.map(c => c.uid)).size === 4);
const flL = flujoCreditosEmpresa('Mediterra', conUid, { hoy: HOY, ubicar });
check('Legacy: 550.000 del 01-01-2027 cae en Jan-27 (antes, en Chile, caía en Dec-26)', flL.prestamos.total[iM(2027, 1)] === 550000 && flL.prestamos.total[iM(2026, 12)] === 0);
check('Legacy: sin desglose → va a "sin desglose", no se inventa capital/interés', flL.prestamos.sinDesglose[iM(2027, 1)] === 550000 && flL.prestamos.capital[iM(2027, 1)] === 0);
const flO = flujoCreditosEmpresa('Osiris', conUid, { hoy: HOY, ubicar });
check('Legacy: pagado:true no se proyecta; pendiente sí', flO.prestamos.total[iM(2026, 10)] === 9178 && flO.prestamos.total[iM(2026, 11)] === 0);
const conDesg = { ...conUid[2], desglose: { capital: 500000, interes: 50000, cargos: '' } };
const eD = estadoCredito(conDesg, HOY);
check('Legacy con desglose: capital 500.000 + interés 50.000 = cuota 550.000', eD.saldoCapital === 500000 && eD.interesPend === 50000 && eD.sinDesglosePend === 0);
// Pago sin desglose sobre fila legacy → se imputa y la cuota queda pagada
const legPag = registrarPago(conUid[0], { vencKey: vencimientosCredito(conUid[0])[0].key, fecha: '2026-10-31', sinDesglose: 9178 }, 'test');
check('Legacy: pago total registrado → cuota pagada, fuera del flujo', estadoCredito(legPag, HOY).estado === 'cerrado');
// Moneda sin TC: no se mezcla con USD, se informa
const clp = { uid: 'clp', tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco CLP', moneda: 'CLP', monto: 95000000, fecha_desembolso: '2026-01-10',
  vencimiento_final: '2026-12-10', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 6, base: 'act360' };
const flC = flujoCreditosEmpresa('Osiris', [clp], { hoy: HOY, ubicar });
check('CLP sin TC → fuera del flujo USD y reportado', suma(flC.prestamos.total) === 0 && flC.sinTC.length === 1);
const flC2 = flujoCreditosEmpresa('Osiris', [{ ...clp, tc_flujo: 950 }], { hoy: HOY, ubicar });
// interés 95.000.000 × 6% × 334/360 = 5.288.333 ; total 100.288.333 CLP / 950 = 105.566,67 USD
check('CLP con TC 950 → 100.288.333 CLP = 105.566,67 USD en Dec-26', aprox(flC2.prestamos.total[iM(2026, 12)], 105566.67, 0.02), `${flC2.prestamos.total[iM(2026, 12)].toFixed(2)}`);

// ═══ Cuadre: flujo = servicio de deuda = calendario ════════════════
const cartera = [c1, c2, c3, c4].map(c => ({ ...c }));
const HOY2 = '2026-01-01';
let totFlujo = 0; ['Frisku Foods', 'Osiris', 'Mediterra', 'Allegria Foods'].forEach(e => { totFlujo += suma(flujoCreditosEmpresa(e, cartera, { hoy: HOY2, ubicar }).prestamos.total); });
const serv = servicioDeudaPorMes(cartera, HOY2);
const totServ = Object.values(serv).reduce((s, x) => s + x.total, 0);
const totCal = [k1, k2, k3, k4].reduce((s, k) => s + k.reduce((a, f) => a + f.capital + f.interes + f.cargos, 0), 0);
// Los vencimientos anteriores a Apr-26 (C1 feb/mar) están antes del horizonte del flujo
const antes = k1.filter(f => f.fecha < '2026-04-01').reduce((a, f) => a + f.capital + f.interes, 0);
check('Cuadre: Σ calendarios = Σ servicio de deuda', aprox(totServ, totCal, 0.05), `${totServ.toFixed(2)} vs ${totCal.toFixed(2)}`);
check('Cuadre: Σ flujo = Σ calendarios − vencimientos antes del horizonte', aprox(totFlujo, totCal - antes, 0.05), `${totFlujo.toFixed(2)} vs ${(totCal - antes).toFixed(2)}`);
const sc = saldoCapitalAl(cartera, '2026-12-31', HOY2);
// C1: capital de feb-27? no: C1 termina 15-01-27 → 1 cuota ; C2: Q4 100.000 ; C3: 500.000 ; C4: 0
check('Saldo capital al 31-12-26 = C1 cuota ene-27 + 100.000 + 500.000', aprox(sc.capital, k1[11].capital + 100000 + 500000, 0.02), `${sc.capital}`);
const an = analisisCartera(cartera, HOY2);
check('Análisis: saldo por empresa suma el total', aprox(Object.values(an.porEmpresa).reduce((s, x) => s + x.saldoCapital, 0), 120000 + 400000 + 500000 + 200000, 0.05));

// ═══ Conciliación de cuotas históricas (registros antiguos) ═════════
// Registro antiguo con cuota vencida el 30-abr-26 y sin pago registrado:
// no se sabe si se pagó → por conciliar, fuera de la deuda confirmada y del flujo.
const vieja = { uid: 'V1', n: 30, empresa: 'Osiris', acreedor: 'Banco Security', monto: 9178, cuota: 9178, f_venc: '2026-04-30', tipo_cr: 'Cuotas Mensuales', pagado: false };
const eV = estadoCredito(vieja, HOY);
check('Antiguo vencido sin pago → "por conciliar", no "vencida"', eV.vencimientos[0].estado === 'por_conciliar' && eV.vencidoTotal === 0 && eV.porConciliarTotal === 9178);
check('Por conciliar NO suma a la deuda confirmada ni al flujo', eV.pendienteTotal === 0 && suma(flujoCreditosEmpresa('Osiris', [vieja], { hoy: HOY, ubicar }).prestamos.total) === 0);
check('…y se informa con su impacto potencial', flujoCreditosEmpresa('Osiris', [vieja], { hoy: HOY, ubicar }).porConciliar[0].usd === 9178);
check('Servicio de deuda: por conciliar en columna aparte, fuera del total', servicioDeudaPorMes([vieja], HOY)['2026-05'].porConciliar === 9178 && servicioDeudaPorMes([vieja], HOY)['2026-05'].total === 0);
let errC = ''; try { confirmarImpaga(vieja, vencimientosCredito(vieja)[0].key, '', 'test'); } catch (e) { errC = e.message; }
check('Confirmar impaga exige respaldo', /respaldo/.test(errC));
const viejaConf = confirmarImpaga(vieja, vencimientosCredito(vieja)[0].key, 'Certificado de deuda Banco Security 15-05-26', 'test');
const flConf = flujoCreditosEmpresa('Osiris', [viejaConf], { hoy: HOY, ubicar });
check('Confirmada impaga → vencida, se arrastra a May-26 conservando su fecha 30-04-26',
  flConf.prestamos.total[iM(2026, 5)] === 9178 && flConf.arrastrados[0].fecha === '2026-04-30' && estadoCredito(viejaConf, HOY).vencimientos[0].estado === 'vencida');
const viejaRev = anularConciliacion(viejaConf, viejaConf.conciliaciones[0].id, 'era otro crédito', 'test');
check('Anular la confirmación la devuelve a por conciliar y queda en el historial',
  estadoCredito(viejaRev, HOY).vencimientos[0].estado === 'por_conciliar' && viejaRev.conciliaciones[0].anulado === true);
const viejaPag = registrarPago(vieja, { vencKey: vencimientosCredito(vieja)[0].key, fecha: '2026-04-30', sinDesglose: 9178, nota: 'cartola abril' }, 'test');
check('Registrar el pago (conciliada como pagada) la cierra', estadoCredito(viejaPag, HOY).estado === 'cerrado');
check('porConciliarCartera lista la cuota con su USD', porConciliarCartera([vieja, c2], HOY).length === 1);
// Crédito nuevo (control desde el alta): una cuota posterior al alta sin pago es vencida confirmada
const nuevoCtrl = { ...vieja, uid: 'V2', control_desde: '2026-04-01' };
check('Crédito controlado desde antes del vencimiento → vencida confirmada', estadoCredito(nuevoCtrl, HOY).vencimientos[0].estado === 'vencida');

// ═══ Pago desde nómina: idempotente ════════════════════════════════
const orig = { tipo: 'nomina', clave: 'nomina:N1:item7', nominaId: 'N1', itemId: 'item7' };
const r1 = registrarPagoIdempotente(c2, { vencKey: 'c2@2026-04-10', fecha: '2026-04-10', capital: 50000, interes: 8000, origen: orig }, 'test');
const r2b = registrarPagoIdempotente(r1.credito, { vencKey: 'c2@2026-04-10', fecha: '2026-04-10', capital: 50000, interes: 8000, origen: orig }, 'test');
check('Nómina: reintentar el mismo pago NO lo duplica', r2b.duplicado === true && r2b.pagoId === r1.pagoId && r2b.credito.pagos.length === 1);
check('Nómina: pago parcial deja pendiente 50.000 de capital', aprox(estadoCredito(r1.credito, HOY).vencimientos[0].pendienteTotal, 50000));
const r1anul = anularPago(r1.credito, r1.pagoId, 'línea de nómina revertida', 'test');
check('Nómina: anulado el pago se puede volver a registrar (nuevo id, historial conserva el anulado)',
  pagoPorOrigen(r1anul, orig.clave) === null && registrarPagoIdempotente(r1anul, { vencKey: 'c2@2026-04-10', fecha: '2026-04-12', capital: 50000, interes: 8000, origen: orig }, 'test').credito.pagos.length === 2);

// ═══ Tasa variable: el interés se marca como proyección ════════════
const cv = { ...c2, uid: 'cv', tasa_tipo: 'variable', tasa_ref_nombre: 'SOFR 3M', tasa_ref_hipotesis: 5, margen: 3, tasa_anual: '' };
const kv = calendarioContrato(cv).filas;
check('Variable SOFR 5% (hipótesis) + 3% = 8% → mismos intereses que C2', aprox(kv[1].interes, 6066.67));
check('Variable: vencimientos marcados tasaVariable y servicio de deuda separa el interés proyectado',
  vencimientosCredito(cv).every(v => v.tasaVariable) && aprox(servicioDeudaPorMes([cv], HOY)['2026-07'].interesVariable, 6066.67));

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
