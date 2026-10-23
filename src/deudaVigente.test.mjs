/* eslint-disable */
// Deuda vigente al corte con renovaciones — UNA fuente para todas las vistas.
// Ejecutar: node src/deudaVigente.test.mjs
// Criterios del CFO (23-10-2026):
//  · una renovación efectiva reemplaza solo el capital que refinancia, sin duplicarlo; los
//    intereses pendientes siguen como deuda salvo pago o capitalización registrados;
//  · pago y nuevo no da por pagado todo lo anterior: refinancia hasta su monto y conserva el
//    saldo no cubierto; no se inventan movimientos de caja;
//  · una antigua sin modalidad queda señalada; sin fecha suficiente no se da por efectiva;
//  · informe, indicadores de Créditos, Análisis CFO, Saldo por Mes y conciliación leen lo mismo;
//    Saldo por Mes aplica la regla a la fecha de cada cierre.
import { informeDeuda } from './informeDeuda.js';
import { estadoCreditoAlCorte, analisisCartera, saldosAlCorte, posicionAlCorte, movimientosCapitalAlCorte, saldoCapitalAl } from './creditos.js';

let fallos = 0;
function check(nombre, cond, extra = '') { console.log(`${cond ? '✓' : '✗ FALLA'}  ${nombre}${extra ? '  — ' + extra : ''}`); if (!cond) fallos++; }
const r2 = (x) => Math.round(x * 100) / 100;
const cq = (pares) => pares.map(([tipo, mes, anio]) => ({ tipo, mes, anio }));

// Crédito base: 1.000.000 de capital + 45.000 de interés, vence 27-12-2026.
const rb = { uid: 'rv', empresa: 'Osiris', acreedor: 'BCI', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 1000000, f_inicio: '2026-06-27', f_venc: '2026-12-27',
  cuota: 1045000, control_desde: '2026-06-27', renovable: true, desglose: { capital: 1000000, interes: 45000, cargos: 0 } };
const C2 = cq([['Solo Interés', 'Jun', 2027], ['Capital+Interés', 'Dic', 2029]]);
const ant = (x = {}) => ({ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 9, cuotas: C2, ...x });
const ext = (key, monto = 1000000, cuotas = C2, x = {}) => ({ monto, tasa_anual: 9, modalidad: 'extension', confirmada: true, intereses: 'pagados', venc_origen_key: key, cuotas, ...x });
const pyn = (x = {}) => ({ monto: 1200000, tasa_anual: 9, modalidad: 'pago_y_nuevo', confirmada: true, mes_ingreso: 'Dic', anio_ingreso: 2026, cuotas: C2, ...x });
const doce = { uid: 'dz', tipo_credito: 'contrato', modalidad: 'manual', empresa: 'Mediterra', acreedor: 'Naranjo', moneda: 'USD', monto: 1200000, fecha_desembolso: '2026-12-01',
  tasa_anual: 12, base: 'act360', control_desde: '2026-12-01', renovable: true,
  calendario_manual: Array.from({ length: 12 }, (_, i) => ({ fecha: `2027-${String(i + 1).padStart(2, '0')}-15`, capital: 100000, interes: 10000, cargos: 0 })),
  pagos: [{ id: 'e', vencKey: 'dz@2027-01-15', fecha: '2027-01-15', capital: 100000, interes: 10000 }, { id: 'f', vencKey: 'dz@2027-02-15', fecha: '2027-02-15', capital: 100000, interes: 10000 }],
  renovaciones: [pyn({ monto: 900000, mes_ingreso: 'Mar', anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Mar', 2029]]) })] };

// Cada caso: crédito, corte y capital vigente esperado (con su cálculo).
const CASOS = [
  ['Antigua, antes de regir', { ...rb, renovaciones: [ant()] }, '2026-10-22', 1000000, 'solo el crédito vigente; la renovación (1.000.000) es proyección'],
  ['Antigua, después de regir (31-12)', { ...rb, renovaciones: [ant()] }, '2027-01-15', 1000000, 'la renovación reemplaza el 1.000.000 anterior'],
  ['Extensión, antes', { ...rb, renovaciones: [ext('rv@2026-12-27')] }, '2026-10-22', 1000000, 'el capital extendido es el mismo'],
  ['Extensión, después', { ...rb, renovaciones: [ext('rv@2026-12-27')] }, '2027-01-15', 1000000, 'idem'],
  ['Parcial 600.000, antes', { ...rb, renovaciones: [ext('rv@2026-12-27', 600000, C2, { modalidad: 'parcial' })] }, '2026-10-22', 1000000, '400.000 remanente + 600.000 renovado'],
  ['Parcial 600.000, después sin pagar el remanente', { ...rb, renovaciones: [ext('rv@2026-12-27', 600000, C2, { modalidad: 'parcial' })] }, '2027-01-15', 1000000, '400.000 vencido + 600.000 renovado'],
  ['Parcial 600.000, remanente pagado', { ...rb, pagos: [{ id: 'pp', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 400000, interes: 45000 }], renovaciones: [ext('rv@2026-12-27', 600000, C2, { modalidad: 'parcial' })] }, '2027-01-15', 600000, '1.000.000 − 400.000 pagados'],
  ['Encadenadas (ext → ext), entre ambas', { ...rb, renovaciones: [ext('rv@2026-12-27', 1000000, cq([['Capital+Interés', 'Dic', 2027]])), ext('rv@R0@0', 1000000, cq([['Capital+Interés', 'Dic', 2029]]))] }, '2027-03-31', 1000000, 'la 2ª es proyección de intereses'],
  ['Encadenadas (antigua → antigua), entre ambas', { ...rb, renovaciones: [ant({ cuotas: cq([['Capital+Interés', 'Dic', 2027]]) }), ant({ anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Dic', 2029]]) })] }, '2027-03-31', 1000000, 'cada una reemplaza a la anterior'],
  ['Encadenadas (antigua → antigua), después de ambas', { ...rb, renovaciones: [ant({ cuotas: cq([['Capital+Interés', 'Dic', 2027]]) }), ant({ anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Dic', 2029]]) })] }, '2028-01-15', 1000000, 'nunca 2.000.000 ni 3.000.000'],
  ['Pago y nuevo 1.200.000, antes', { ...rb, renovaciones: [pyn()] }, '2026-10-22', 1000000, 'nuevo desembolso aún no rige'],
  ['Pago y nuevo 1.200.000, después', { ...rb, renovaciones: [pyn()] }, '2027-01-15', 1200000, 'el nuevo (1.200.000) cubre el 1.000.000 anterior'],
  ['Pago y nuevo con desembolso el 10-12, corte 05-12', { ...rb, renovaciones: [pyn({ recibido: { fecha: '2026-12-10' } })] }, '2026-12-05', 1000000, 'cuenta desde la fecha efectiva'],
  ['Pago y nuevo con desembolso el 10-12, corte 15-12', { ...rb, renovaciones: [pyn({ recibido: { fecha: '2026-12-10' } })] }, '2026-12-15', 1200000, 'ya rige: reemplaza el 1.000.000'],
  ['Pago y nuevo sin fecha de desembolso, corte 15-12', { ...rb, renovaciones: [pyn()] }, '2026-12-15', 1000000, 'dentro del mes de ingreso no se supone el día: aún no rige'],
  ['Pago y nuevo 900.000 sobre 1.000.000 pendiente', doce, '2027-04-15', 1000000, '900.000 nuevo + 100.000 no cubierto'],
  ['Pago y nuevo 900.000, antes del ingreso', doce, '2027-02-20', 1000000, 'mar-dic pendientes; el nuevo es proyección'],
  ['Pago registrado del vencimiento + pago y nuevo', { ...rb, pagos: [{ id: 'pg', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1000000, interes: 45000 }], renovaciones: [pyn()] }, '2027-01-15', 1200000, 'el pago ya bajó el anterior: solo el nuevo, sin duplicar'],
  ['Antigua sin mes de ingreso (por revisar), antes', { ...rb, renovaciones: [ant({ mes_ingreso: '', anio_ingreso: '' })] }, '2026-10-22', 1000000, 'no se da por efectiva'],
  ['Antigua sin mes de ingreso (por revisar), después del vencimiento', { ...rb, renovaciones: [ant({ mes_ingreso: '', anio_ingreso: '' })] }, '2027-01-15', 1000000, 'el anterior sigue como deuda (vencida)'],
];

// ── 1) Mismo capital en las cinco vistas ──
for (const [nom, c, corte, esperado, porque] of CASOS) {
  const inf = informeDeuda([c], corte).filas[0];
  const ev = estadoCreditoAlCorte(c, corte);
  const an = analisisCartera([c], corte).porEmpresa[c.empresa];
  const sm = saldosAlCorte([c], corte, corte).total;
  const po = posicionAlCorte([c], corte);
  const vals = [inf ? inf.capital : 0, ev.saldoCapital, an ? an.saldoCapital : 0, sm.capital, po.capital];
  check(`${nom} (${corte}): capital ${esperado} en informe, KPI, Análisis, Saldo por Mes y conciliación — ${porque}`,
    vals.every(v => Math.abs(v - esperado) < 0.01), vals.join(' / '));
  check(`${nom}: mismo vencimiento vigente en informe y KPI`, !inf || inf.vencimientoFinal === ev.vencimientoFinal, `${inf && inf.vencimientoFinal} / ${ev.vencimientoFinal}`);
  check(`${nom}: mismo total pendiente en informe y KPI`, !inf || Math.abs(inf.totalIdentificado - ev.pendienteTotal) < 0.02, `${inf && inf.totalIdentificado} / ${ev.pendienteTotal}`);
  const anP = analisisCartera([c], corte).proyeccionRenovaciones;
  check(`${nom}: misma proyección de capital en informe, KPI, Análisis y Saldo por Mes`, [ev.proyeccion.capital, sm.proyeccion, anP].every(x => Math.abs((inf ? inf.proyeccion.capital : 0) - x) < 0.01), `${inf && inf.proyeccion.capital} / ${ev.proyeccion.capital} / ${anP} / ${sm.proyeccion}`);
  const mv = movimientosCapitalAlCorte([c], corte);
  check(`${nom}: la conciliación explica el capital movimiento a movimiento`, mv.cuadra, `${mv.calculado} vs ${mv.capitalApp}`);
}

// ── 2) Vencimiento: una renovación futura no lo adelanta ──
const vA = estadoCreditoAlCorte({ ...rb, renovaciones: [ant()] }, '2026-10-22');
check('Renovación futura: vencimiento vigente 27-12-2026; la renovación aparte hasta 2029', vA.vencimientoFinal === '2026-12-27' && vA.vencimientoRenovacion.startsWith('2029'), `${vA.vencimientoFinal} / ${vA.vencimientoRenovacion}`);

// ── 3) Intereses: no se duplican y los pendientes siguen ──
const iA = informeDeuda([{ ...rb, renovaciones: [ant()] }], '2027-01-15').filas[0];
const qOld = iA.cuotas.find(q => q.key === 'rv@2026-12-27');
check('Antigua vigente sin pago registrado: el capital anterior se refinancia y su interés (45.000) sigue como deuda vencida', qOld.pendiente === 45000 && qOld.estado === 'vencida', `${qOld.pendiente} ${qOld.estado}`);
const iD = informeDeuda([doce], '2027-04-15').filas[0];
// Interés del crédito anterior que queda: mar (vencido, 10.000) + abr (devengado al 31-03: 10.000 × 16/31) + dic (no cubierto, 10.000).
const intAnterior = iD.cuotas.filter(q => q.key.startsWith('dz@2027')).reduce((a, q) => a + q.pendiente, 0) - 100000;
check('Pago y nuevo sobre 12 cuotas: del crédito anterior quedan solo 10.000 + 5.161,29 + 10.000 de interés (no el interés futuro del capital refinanciado)', Math.abs(intAnterior - (10000 + 5161.29 + 10000)) < 0.01, String(r2(intAnterior)));
check('Pago y nuevo que no cubre todo: aviso con el capital que sigue (100.000)', iD.avisos.some(a => /quedan 100000/.test(a)));

// ── 4) Pagos: registrar un pago no se duplica con la renovación ──
const cPg = { ...rb, pagos: [{ id: 'pg', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1000000, interes: 45000 }], renovaciones: [pyn()] };
const ePg = estadoCreditoAlCorte(cPg, '2027-01-15');
check('Pago efectivo registrado + pago y nuevo: el vencimiento anterior queda pagado (no «renovado») y no hay aviso de no cubierto', ePg.vencimientos.find(v => v.key === 'rv@2026-12-27').estado === 'pagada' && !ePg.avisosVigencia.some(a => /no cubre/.test(a)));
check('Pago y nuevo no registra pagos ni mueve caja', (cPg.pagos || []).length === 1 && ePg.pagadoCapital === 1000000);

// ── 5) Antigua sin modalidad: señalada; sin fecha suficiente no rige ──
const eSM = estadoCreditoAlCorte({ ...rb, renovaciones: [ant({ mes_ingreso: '', anio_ingreso: '' })] }, '2027-01-15');
check('Antigua sin mes: queda por revisar (aparte) y con aviso', eSM.porRevisar.capital === 1000000 && eSM.proyeccion.total === 0 && eSM.avisosVigencia.some(a => /sin modalidad ni mes de ingreso: por revisar/.test(a)), JSON.stringify(eSM.porRevisar));
check('Antigua sin mes: el vencimiento anterior sigue vencido (no se da por renovado)', eSM.vencidoTotal === 1045000 && eSM.estado === 'con_vencidos', `${eSM.vencidoTotal} ${eSM.estado}`);
const eCM = estadoCreditoAlCorte({ ...rb, renovaciones: [ant()] }, '2027-01-15');
check('Antigua con mes de ingreso: rige al fin de ese mes pero queda señalada para revisión', eCM.avisosVigencia.some(a => /sin modalidad: por revisar\. Se considera vigente desde el 31-12-2026/.test(a)), eCM.avisosVigencia.join(' | '));
const ePs = estadoCreditoAlCorte({ ...rb, renovaciones: [pyn()] }, '2027-01-15');
check('Pago y nuevo sin fecha de desembolso: se avisa que rige desde el fin del mes de ingreso', ePs.avisosVigencia.some(a => /sin fecha de desembolso registrada: se considera vigente desde el 31-12-2026/.test(a)));

// ── 6) Saldo por Mes: la regla a la fecha de CADA cierre ──
const hoy = '2026-10-22';
const cA = { ...rb, renovaciones: [ant()] };
const sNov = saldosAlCorte([cA], '2026-11-30', hoy).total, sDic = saldosAlCorte([cA], '2026-12-31', hoy).total;
check('Saldo por Mes, cierre nov-26: 1.000.000 (el vencimiento de dic) y la renovación (1.000.000) aparte; nunca 2.000.000', sNov.capital === 1000000 && sNov.proyeccion === 1000000, JSON.stringify(sNov));
check('Saldo por Mes, cierre dic-26: 1.000.000 de la renovación ya vigente; nada aparte', sDic.capital === 1000000 && sDic.proyeccion === 0, JSON.stringify(sDic));
check('saldoCapitalAl (misma regla): nov-26 = 1.000.000', saldoCapitalAl([cA], '2026-11-30', hoy).capital === 1000000);
const hoy2 = '2027-02-20';
const sFeb = saldosAlCorte([doce], '2027-02-28', hoy2).total, sMar = saldosAlCorte([doce], '2027-03-31', hoy2).total;
check('Saldo por Mes con pago y nuevo, cierre feb-27: mar-dic (1.000.000) y el nuevo (900.000) aparte', sFeb.capital === 1000000 && sFeb.proyeccion === 900000, JSON.stringify(sFeb));
// Visto el 20-02, la cuota de mar-27 se supone pagada al cierre de marzo (igual que el flujo), así
// que no hay capital no cubierto: 900.000 refinancian abr-dic. Si la cuota de marzo no se paga, el
// KPI de ese día la mostrará (ver el caso 'Pago y nuevo 900.000 sobre 1.000.000 pendiente').
check('Saldo por Mes con pago y nuevo, cierre mar-27 (visto el 20-02): 900.000 nuevo (la cuota de marzo se supone pagada); no se cuenta dos veces', sMar.capital === 900000 && sMar.proyeccion === 0, JSON.stringify(sMar));
const sMeses = ['2027-04-30', '2027-06-30', '2027-11-30', '2027-12-31'].map(k => saldosAlCorte([doce], k, hoy2).total.capital);
check('Saldo por Mes con pago y nuevo, abr-dic 27: 900.000 en cada cierre (sin la cuota duplicada)', sMeses.every(x => x === 900000), sMeses.join(' / '));

// ── 7) Hallazgos de la revisión independiente ──
// Pago registrado con fecha futura: a hoy cuenta (como el flujo); sin renovaciones, igual que antes.
const fut = { uid: 'fu', empresa: 'Osiris', acreedor: 'X', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 120000, f_inicio: '2026-06-01', f_venc: '2026-12-15', cuota: 125000, control_desde: '2026-06-01',
  desglose: { capital: 120000, interes: 5000, cargos: 0 }, pagos: [{ id: 'pf', vencKey: 'fu@2026-12-15', fecha: '2026-11-05', capital: 5000 }] };
check('Pago fechado en el futuro: KPI, Análisis y Saldo por Mes (hoy y nov-26) lo descuentan (115.000)',
  estadoCreditoAlCorte(fut, '2026-10-23').saldoCapital === 115000 && analisisCartera([fut], '2026-10-23').porEmpresa.Osiris.saldoCapital === 115000
  && saldosAlCorte([fut], '2026-10-23', '2026-10-23').total.capital === 115000 && saldosAlCorte([fut], '2026-11-30', '2026-10-23').total.capital === 115000);
// Dos pago y nuevo: el aviso de no cubierto se retira si la segunda lo cubre.
const dosP = { ...rb, renovaciones: [pyn({ monto: 600000 }), pyn({ monto: 1200000, mes_ingreso: 'Jun', anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Dic', 2029]]) })] };
const eDos = estadoCreditoAlCorte(dosP, '2027-07-15');
check('Dos pago y nuevo: 1.200.000 vigente y sin aviso de «no cubre» (la 2ª cubrió los 400.000)', eDos.saldoCapital === 1200000 && !eDos.avisosVigencia.some(a => /no cubre/.test(a)), `${eDos.saldoCapital} | ${eDos.avisosVigencia.join(' | ')}`);
check('Dos pago y nuevo, entre ambas: 600.000 + 400.000 no cubierto, con aviso', estadoCreditoAlCorte(dosP, '2027-01-15').saldoCapital === 1000000 && estadoCreditoAlCorte(dosP, '2027-01-15').avisosVigencia.some(a => /quedan 400000/.test(a)));
// Dos pago y nuevo que no cubren todo: UN aviso con el capital anterior que sigue (200.000), no 200.000 + 800.000.
const dosB = { ...rb, renovaciones: [pyn({ monto: 600000 }), pyn({ monto: 200000, mes_ingreso: 'Feb', anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Dic', 2028]]) })] };
const eB = estadoCreditoAlCorte(dosB, '2027-03-15'), avB = eB.avisosVigencia.filter(a => /no cubre/.test(a));
check('Dos pago y nuevo (600.000 y 200.000) sobre 1.000.000: saldo 1.000.000 y un solo aviso «quedan 200000»', eB.saldoCapital === 1000000 && avB.length === 1 && /quedan 200000 /.test(avB[0]), `${eB.saldoCapital} | ${avB.join(' | ')}`);
// UF: el capital reemplazado = capital de las cuotas de la renovación (redondeado), sin diferencia.
const uf = { ...rb, uid: 'uf', moneda: 'UF', monto: 10000, cuota: 10450, desglose: { capital: 10000, interes: 450, cargos: 0 }, renovaciones: [pyn({ monto: 7000.1234 })] };
const eUF = estadoCreditoAlCorte(uf, '2027-01-15');
check('UF: pago y nuevo de 7.000,1234 sobre 10.000 → 10.000 exacto (sin diferencia de redondeo)', Math.abs(eUF.saldoCapital - 10000) < 0.00005, String(eUF.saldoCapital));

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
