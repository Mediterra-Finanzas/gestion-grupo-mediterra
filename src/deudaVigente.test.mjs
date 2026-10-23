/* eslint-disable */
// Deuda vigente al corte con renovaciones — UNA fuente para todas las vistas.
// Ejecutar: node src/deudaVigente.test.mjs
// Criterios del CFO (23-10-2026):
//  · una renovación rige desde su fecha efectiva CONFIRMADA (extensión: el vencimiento que
//    extiende; pago y nuevo: el desembolso recibido). Sin información suficiente (antigua sin
//    modalidad, o pago y nuevo cuyo mes llegó sin fecha de desembolso) queda POR REVISAR, fuera
//    del saldo vigente y sin reemplazar nada; la deuda anterior sigue pendiente. Nunca se supone
//    una fecha (ni el fin de mes);
//  · una renovación efectiva reemplaza solo el capital que refinancia, sin duplicarlo; los
//    intereses pendientes siguen como deuda; pago y nuevo conserva el saldo no cubierto;
//  · un pago con fecha posterior al corte no reduce el saldo al corte (se informa aparte) y en
//    la proyección cuenta desde su fecha, identificado como programado;
//  · Saldo por Mes separa el saldo REAL al corte del PROYECTADO; lo vencido sin pago confirmado
//    sigue pendiente en la proyección;
//  · flujo: la extensión no mueve caja; el pago y nuevo saca el capital refinanciado de las cuotas
//    del crédito anterior y lo proyecta en su mes, sin inventar pagos efectivos.
import { informeDeuda } from './informeDeuda.js';
import { estadoCreditoAlCorte, analisisCartera, saldosAlCorte, posicionAlCorte, movimientosCapitalAlCorte, saldoCapitalAl,
  servicioDeudaPorMes, flujoCreditosEmpresa, ingresosRenovacionFlujo, movimientosFlujoCredito, simularPrepago, aplicarPrepago,
  excesoPagoCuota, registrarPagoIdempotente } from './creditos.js';

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
const R = (fecha) => ({ recibido: { fecha } });
const doceSin = { uid: 'dz', tipo_credito: 'contrato', modalidad: 'manual', empresa: 'Mediterra', acreedor: 'Naranjo', moneda: 'USD', monto: 1200000, fecha_desembolso: '2026-12-01',
  tasa_anual: 12, base: 'act360', control_desde: '2026-12-01', renovable: true,
  calendario_manual: Array.from({ length: 12 }, (_, i) => ({ fecha: `2027-${String(i + 1).padStart(2, '0')}-15`, capital: 100000, interes: 10000, cargos: 0 })),
  pagos: [{ id: 'e', vencKey: 'dz@2027-01-15', fecha: '2027-01-15', capital: 100000, interes: 10000 }, { id: 'f', vencKey: 'dz@2027-02-15', fecha: '2027-02-15', capital: 100000, interes: 10000 }],
  renovaciones: [pyn({ monto: 900000, mes_ingreso: 'Mar', anio_ingreso: 2027, cuotas: cq([['Capital+Interés', 'Mar', 2029]]) })] };
const doce = { ...doceSin, renovaciones: [{ ...doceSin.renovaciones[0], ...R('2027-03-31') }] };

// Cada caso: crédito, corte y capital vigente esperado (con su cálculo).
const CASOS = [
  ['Antigua (por revisar), antes de su mes', { ...rb, renovaciones: [ant()] }, '2026-10-22', 1000000, 'solo el crédito vigente; la antigua (1.000.000) aparte por revisar'],
  ['Antigua (por revisar), después de su mes', { ...rb, renovaciones: [ant()] }, '2027-01-15', 1000000, 'la deuda anterior sigue (vencida); nada se reemplaza'],
  ['Extensión, antes', { ...rb, renovaciones: [ext('rv@2026-12-27')] }, '2026-10-22', 1000000, 'el capital extendido es el mismo'],
  ['Extensión, después', { ...rb, renovaciones: [ext('rv@2026-12-27')] }, '2027-01-15', 1000000, 'idem'],
  ['Parcial 600.000, antes', { ...rb, renovaciones: [ext('rv@2026-12-27', 600000, C2, { modalidad: 'parcial' })] }, '2026-10-22', 1000000, '400.000 remanente + 600.000 renovado'],
  ['Parcial 600.000, después sin pagar el remanente', { ...rb, renovaciones: [ext('rv@2026-12-27', 600000, C2, { modalidad: 'parcial' })] }, '2027-01-15', 1000000, '400.000 vencido + 600.000 renovado'],
  ['Parcial 600.000, remanente pagado', { ...rb, pagos: [{ id: 'pp', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 400000, interes: 45000 }], renovaciones: [ext('rv@2026-12-27', 600000, C2, { modalidad: 'parcial' })] }, '2027-01-15', 600000, '1.000.000 − 400.000 pagados'],
  ['Encadenadas (ext → ext), entre ambas', { ...rb, renovaciones: [ext('rv@2026-12-27', 1000000, cq([['Capital+Interés', 'Dic', 2027]])), ext('rv@R0@0', 1000000, cq([['Capital+Interés', 'Dic', 2029]]))] }, '2027-03-31', 1000000, 'la 2ª es proyección de intereses'],
  ['Encadenadas (pago y nuevo → pago y nuevo), entre ambos', { ...rb, renovaciones: [pyn({ monto: 1000000, ...R('2026-12-27'), cuotas: cq([['Capital+Interés', 'Dic', 2027]]) }), pyn({ monto: 1000000, anio_ingreso: 2027, ...R('2027-12-28'), cuotas: cq([['Capital+Interés', 'Dic', 2029]]) })] }, '2027-03-31', 1000000, 'cada uno reemplaza al anterior al recibirse'],
  ['Encadenadas (pago y nuevo → pago y nuevo), después de ambos', { ...rb, renovaciones: [pyn({ monto: 1000000, ...R('2026-12-27'), cuotas: cq([['Capital+Interés', 'Dic', 2027]]) }), pyn({ monto: 1000000, anio_ingreso: 2027, ...R('2027-12-28'), cuotas: cq([['Capital+Interés', 'Dic', 2029]]) })] }, '2028-01-15', 1000000, 'nunca 2.000.000 ni 3.000.000'],
  ['Pago y nuevo 1.200.000, antes de su mes', { ...rb, renovaciones: [pyn()] }, '2026-10-22', 1000000, 'nuevo desembolso aún no rige (proyección)'],
  ['Pago y nuevo 1.200.000, desembolso recibido el 27-12', { ...rb, renovaciones: [pyn(R('2026-12-27'))] }, '2027-01-15', 1200000, 'el nuevo (1.200.000) cubre el 1.000.000 anterior'],
  ['Pago y nuevo con desembolso el 10-12, corte 05-12', { ...rb, renovaciones: [pyn(R('2026-12-10'))] }, '2026-12-05', 1000000, 'cuenta desde la fecha efectiva'],
  ['Pago y nuevo con desembolso el 10-12, corte 15-12', { ...rb, renovaciones: [pyn(R('2026-12-10'))] }, '2026-12-15', 1200000, 'ya rige: reemplaza el 1.000.000'],
  ['Pago y nuevo sin fecha de desembolso, corte 15-12 (su mes)', { ...rb, renovaciones: [pyn()] }, '2026-12-15', 1000000, 'por revisar: no se supone el día ni el fin de mes'],
  ['Pago y nuevo sin fecha de desembolso, corte 15-01', { ...rb, renovaciones: [pyn()] }, '2027-01-15', 1000000, 'por revisar: la deuda anterior sigue (vencida)'],
  ['Pago y nuevo 900.000 sobre 1.000.000 pendiente (recibido 31-03)', doce, '2027-04-15', 1000000, '900.000 nuevo + 100.000 no cubierto'],
  ['Pago y nuevo 900.000, antes de su mes', doce, '2027-02-20', 1000000, 'mar-dic pendientes; el nuevo es proyección'],
  ['Pago y nuevo 900.000 sin fecha de desembolso', doceSin, '2027-04-15', 1000000, 'por revisar: mar-dic siguen pendientes'],
  ['Pago registrado del vencimiento + pago y nuevo recibido', { ...rb, pagos: [{ id: 'pg', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1000000, interes: 45000 }], renovaciones: [pyn(R('2026-12-27'))] }, '2027-01-15', 1200000, 'el pago ya bajó el anterior: solo el nuevo, sin duplicar'],
  ['Antigua sin mes de ingreso, antes', { ...rb, renovaciones: [ant({ mes_ingreso: '', anio_ingreso: '' })] }, '2026-10-22', 1000000, 'no se da por efectiva'],
  ['Antigua sin mes de ingreso, después del vencimiento', { ...rb, renovaciones: [ant({ mes_ingreso: '', anio_ingreso: '' })] }, '2027-01-15', 1000000, 'el anterior sigue como deuda (vencida)'],
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
  const anP = analisisCartera([c], corte).proyeccionRenovaciones, anR = analisisCartera([c], corte).renovacionesPorRevisar;
  check(`${nom}: misma proyección y mismo «por revisar» (capital) en informe, KPI, Análisis y Saldo por Mes`,
    [ev.proyeccion.capital, sm.proyeccion, anP].every(x => Math.abs((inf ? inf.proyeccion.capital : 0) - x) < 0.01)
    && [ev.porRevisar.capital, sm.porRevisar, anR].every(x => Math.abs((inf ? inf.porRevisar.capital : 0) - x) < 0.01),
    `${inf && inf.proyeccion.capital}/${ev.proyeccion.capital}/${anP}/${sm.proyeccion} · ${inf && inf.porRevisar.capital}/${ev.porRevisar.capital}/${anR}/${sm.porRevisar}`);
  const mv = movimientosCapitalAlCorte([c], corte);
  check(`${nom}: la conciliación explica el capital movimiento a movimiento`, mv.cuadra, `${mv.calculado} vs ${mv.capitalApp}`);
}

// ── 2) Por revisar: no se supone fecha, no se suma, la deuda anterior sigue ──
const eSM = estadoCreditoAlCorte({ ...rb, renovaciones: [ant({ mes_ingreso: '', anio_ingreso: '' })] }, '2027-01-15');
check('Antigua sin mes: por revisar (aparte) y con aviso', eSM.porRevisar.capital === 1000000 && eSM.proyeccion.total === 0 && eSM.avisosVigencia.some(a => /sin modalidad ni mes de ingreso: por revisar/.test(a)), JSON.stringify(eSM.porRevisar));
check('Antigua sin mes: el vencimiento anterior sigue vencido (no se da por renovado)', eSM.vencidoTotal === 1045000 && eSM.estado === 'con_vencidos', `${eSM.vencidoTotal} ${eSM.estado}`);
const eCM = estadoCreditoAlCorte({ ...rb, renovaciones: [ant()] }, '2027-01-15');
check('Antigua con mes de ingreso: por revisar, sin fecha supuesta; la deuda anterior sigue vencida', eCM.vencidoTotal === 1045000 && eCM.avisosVigencia.some(a => /sin modalidad \(ingreso registrado en 12-2026\): por revisar/.test(a)) && !eCM.avisosVigencia.some(a => /fin del mes/.test(a)), eCM.avisosVigencia.join(' | '));
const ePs = estadoCreditoAlCorte({ ...rb, renovaciones: [pyn()] }, '2027-01-15');
check('Pago y nuevo sin fecha de desembolso: por revisar con aviso; no se usa el fin de mes', ePs.porRevisar.capital === 1200000 && ePs.avisosVigencia.some(a => /sin fecha de desembolso registrada: por revisar/.test(a)) && !ePs.avisosVigencia.some(a => /fin del mes/.test(a)));
const vA = estadoCreditoAlCorte({ ...rb, renovaciones: [pyn()] }, '2026-10-22');
check('Pago y nuevo antes de su mes: vencimiento vigente 27-12-2026; la renovación aparte hasta 2029', vA.vencimientoFinal === '2026-12-27' && vA.vencimientoRenovacion.startsWith('2029'), `${vA.vencimientoFinal} / ${vA.vencimientoRenovacion}`);

// ── 3) Intereses: no se duplican y los pendientes siguen ──
const iA = informeDeuda([{ ...rb, renovaciones: [pyn(R('2026-12-27'))] }], '2027-01-15').filas[0];
const qOld = iA.cuotas.find(q => q.key === 'rv@2026-12-27');
check('Pago y nuevo vigente sin pago registrado: el capital anterior se refinancia y su interés (45.000) sigue como deuda vencida', qOld.pendiente === 45000 && qOld.estado === 'vencida', `${qOld.pendiente} ${qOld.estado}`);
const iD = informeDeuda([doce], '2027-04-15').filas[0];
// Del crédito anterior queda: mar (vencido, 10.000) + abr (devengado al 31-03: 10.000 × 16/31) + dic (no cubierto, 100.000 + 10.000).
const intAnterior = iD.cuotas.filter(q => q.key.startsWith('dz@2027')).reduce((a, q) => a + q.pendiente, 0) - 100000;
check('Pago y nuevo sobre 12 cuotas: del crédito anterior quedan solo 10.000 + 5.161,29 + 10.000 de interés', Math.abs(intAnterior - (10000 + 5161.29 + 10000)) < 0.01, String(r2(intAnterior)));
check('Pago y nuevo que no cubre todo: aviso con el capital que sigue (100.000)', iD.avisos.some(a => /quedan 100000/.test(a)));

// ── 4) Pagos: no se duplican; un pago futuro no reduce el saldo al corte ──
const cPg = { ...rb, pagos: [{ id: 'pg', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1000000, interes: 45000 }], renovaciones: [pyn(R('2026-12-27'))] };
const ePg = estadoCreditoAlCorte(cPg, '2027-01-15');
check('Pago efectivo registrado + pago y nuevo: el vencimiento anterior queda pagado y no hay aviso de no cubierto', ePg.vencimientos.find(v => v.key === 'rv@2026-12-27').estado === 'pagada' && !ePg.avisosVigencia.some(a => /no cubre/.test(a)));
check('Pago y nuevo no registra pagos ni mueve caja', (cPg.pagos || []).length === 1 && ePg.pagadoCapital === 1000000);
const fut = { uid: 'fu', empresa: 'Osiris', acreedor: 'X', tipo_inst: 'Banco', tipo_cr: 'Bullet', moneda: 'USD', monto: 120000, f_inicio: '2026-06-01', f_venc: '2026-12-15', cuota: 125000, control_desde: '2026-06-01',
  desglose: { capital: 120000, interes: 5000, cargos: 0 }, pagos: [{ id: 'pf', vencKey: 'fu@2026-12-15', fecha: '2026-11-05', capital: 5000 }] };
const H = '2026-10-23';
const eF = estadoCreditoAlCorte(fut, H);
check('Pago fechado el 05-11 visto el 23-10: NO reduce el saldo actual (KPI, Análisis, Saldo por Mes «hoy», informe: 120.000)',
  eF.saldoCapital === 120000 && analisisCartera([fut], H).porEmpresa.Osiris.saldoCapital === 120000 && saldosAlCorte([fut], H, H).total.capital === 120000 && informeDeuda([fut], H).filas[0].capital === 120000,
  `${eF.saldoCapital}`);
check('Pago fechado en el futuro: se informa aparte (5.000, 05-11-2026)', eF.pagosFuturos.n === 1 && eF.pagosFuturos.total === 5000 && eF.pagosFuturos.fechas[0] === '2026-11-05' && analisisCartera([fut], H).pagosFuturos === 5000);
const sNovF = saldosAlCorte([fut], '2026-11-30', H).total;
check('Saldo por Mes proyectado nov-26: el pago programado cuenta desde su fecha (115.000) y se identifica', sNovF.capital === 115000 && sNovF.pagosProgramados === 5000, JSON.stringify(sNovF));
const sOctF = saldosAlCorte([fut], '2026-10-31', H).total;
check('Saldo por Mes proyectado oct-26 (antes del pago programado): 120.000', sOctF.capital === 120000 && sOctF.pagosProgramados === 0);

// ── 5) Saldo por Mes: real al corte vs proyectado; lo vencido sin pago no desaparece ──
const cAR = { ...rb, renovaciones: [ant()] };   // antigua por revisar: la deuda anterior vence el 27-12-2026 sin pago
const hoyE = '2027-01-15';
const sH = saldosAlCorte([cAR], hoyE, hoyE), sF = saldosAlCorte([cAR], '2027-02-28', hoyE), sJ = saldosAlCorte([cAR], '2027-06-30', hoyE);
check('Saldo por Mes «hoy» (real): 1.000.000, todo vencido sin pago', !sH.proyectado && sH.total.capital === 1000000 && sH.total.vencidoPendiente === 1000000);
check('Saldo por Mes proyectado feb-27 y jun-27: el vencido sin pago SIGUE (1.000.000), no aparece 0', sF.proyectado && sF.total.capital === 1000000 && sF.total.vencidoPendiente === 1000000 && sJ.total.capital === 1000000, `${sF.total.capital} / ${sJ.total.capital}`);
check('Saldo por Mes: la antigua sigue aparte por revisar (1.000.000) en cada cierre', sF.total.porRevisar === 1000000 && sJ.total.porRevisar === 1000000);
const hoy = '2026-10-22';
const cPF = { ...rb, renovaciones: [pyn()] };   // pago y nuevo previsto para dic-26 (sin fecha aún)
const sNov = saldosAlCorte([cPF], '2026-11-30', hoy).total, sDic = saldosAlCorte([cPF], '2026-12-31', hoy).total;
check('Saldo por Mes proyectado nov-26: 1.000.000 (el vencimiento de dic) y el pago y nuevo (1.200.000) aparte; nunca 2.200.000', sNov.capital === 1000000 && sNov.proyeccion === 1200000, JSON.stringify(sNov));
check('Saldo por Mes proyectado dic-26: 1.200.000 (proyecta el pago y nuevo en su mes; el vencimiento de dic se supone pagado)', sDic.capital === 1200000 && sDic.proyeccion === 0, JSON.stringify(sDic));
check('saldoCapitalAl (misma regla): nov-26 = 1.000.000', saldoCapitalAl([cPF], '2026-11-30', hoy).capital === 1000000);
const hoy2 = '2027-02-20';
const sFeb = saldosAlCorte([doce], '2027-02-28', hoy2).total, sMar = saldosAlCorte([doce], '2027-03-31', hoy2).total;
check('Saldo por Mes con pago y nuevo, cierre feb-27: mar-dic (1.000.000) y el nuevo (900.000) aparte', sFeb.capital === 1000000 && sFeb.proyeccion === 900000, JSON.stringify(sFeb));
check('Saldo por Mes con pago y nuevo, cierre mar-27 (visto el 20-02): 900.000 nuevo (la cuota de marzo se supone pagada); no se cuenta dos veces', sMar.capital === 900000 && sMar.proyeccion === 0, JSON.stringify(sMar));
const sMeses = ['2027-04-30', '2027-06-30', '2027-11-30', '2027-12-31'].map(k => saldosAlCorte([doce], k, hoy2).total.capital);
check('Saldo por Mes con pago y nuevo, abr-dic 27: 900.000 en cada cierre (sin la cuota duplicada)', sMeses.every(x => x === 900000), sMeses.join(' / '));

// ── 6) Flujo: calendario del refinanciamiento ──
const serv = (c, h) => servicioDeudaPorMes([c], h);
const m = (o, k) => o[k] || { capital: 0, interes: 0, total: 0 };
// Extensión: sin desembolso ni pago de capital en el vencimiento extendido.
const cE = { ...rb, renovaciones: [ext('rv@2026-12-27')] };
const sE = serv(cE, hoy);
check('Extensión: en dic-26 solo el interés (45.000), sin pago de capital', m(sE, '2026-12').capital === 0 && m(sE, '2026-12').interes === 45000, JSON.stringify(m(sE, '2026-12')));
check('Extensión: el capital (1.000.000) vence en la cuota de dic-29; sin ingreso de renovación', m(sE, '2029-12').capital === 1000000 && ingresosRenovacionFlujo(cE).length === 0);
// Pago y nuevo previsto en mar-27 (sin fecha aún) sobre 12 cuotas, visto el 20-02: mar se paga
// normalmente; abr-dic (900.000) se pagan con el refinanciamiento EN MARZO, no en sus meses.
const sP = serv(doceSin, hoy2);
check('Pago y nuevo previsto: marzo = cuota de mar (110.000) + capital refinanciado (900.000) + interés del período en curso de abr (10.000)', r2(m(sP, '2027-03').total) === 1020000, JSON.stringify(m(sP, '2027-03')));
check('Pago y nuevo previsto: abr-dic del crédito anterior ya no salen en sus meses', ['04', '05', '06', '07', '08', '09', '10', '11', '12'].every(x => !(m(sP, `2027-${x}`).total > 0.005)), ['04', '12'].map(x => JSON.stringify(m(sP, `2027-${x}`))).join(' '));
check('Pago y nuevo previsto: el nuevo desembolso (900.000) entra en marzo como ingreso de renovación', ingresosRenovacionFlujo(doceSin).some(x => x.fecha.startsWith('2027-03') && x.monto === 900000));
const fP = flujoCreditosEmpresa('Mediterra', [doceSin], { hoy: hoy2 });
check('Pago y nuevo previsto: el pago con el refinanciamiento se identifica como proyección (no es un pago efectivo)', fP.refinanciamientos.some(x => x.tipo === 'pago_refinanciamiento' && x.fecha === '2027-03-01') && (doceSin.pagos || []).length === 2);
// Pago y nuevo ya recibido (31-03), visto el 15-04, SIN pago registrado del crédito anterior: el
// desembolso ya entró a la caja, pero el pago del anterior no consta, así que NO se da por hecho:
// sale pendiente en el mes en curso (900.000, rotulado), junto con el interés vencido de mar (10.000)
// y el devengado de abr al 31-03 (5.161,29). abr-nov ya no salen en sus meses; dic (no cubierto) sigue.
const sV = serv(doce, '2027-04-15');
check('Pago y nuevo recibido sin pago registrado del anterior: abril = 900.000 pendientes + 10.000 + 5.161,29', r2(m(sV, '2027-04').total) === 915161.29, JSON.stringify(m(sV, '2027-04')));
check('Pago y nuevo recibido: may-nov sin cuotas del crédito anterior; dic con 110.000 no cubiertos', ['05', '08', '11'].every(x => !(m(sV, `2027-${x}`).total > 0.005)) && r2(m(sV, '2027-12').total) === 110000);
check('Pago y nuevo recibido: el pago del crédito anterior queda «sin registrar», no se da por hecho', flujoCreditosEmpresa('Mediterra', [doce], { hoy: '2027-04-15' }).refinanciamientos.some(x => x.tipo === 'pago_refinanciamiento_sin_registrar' && x.fechaRefinanciamiento === '2027-03-31'));
// Con el pago del crédito anterior registrado (31-03), no queda nada pendiente de él (no se duplica).
const doceP = { ...doce, pagos: [...doce.pagos, ...['03', '04', '05', '06', '07', '08', '09', '10', '11'].map(mm => ({ id: 'q' + mm, vencKey: `dz@2027-${mm}-15`, fecha: '2027-03-31', capital: 100000 }))] };
const sVP = serv(doceP, '2027-04-15');
check('Pago y nuevo recibido con el pago del anterior registrado: abril sin pago pendiente del anterior', !flujoCreditosEmpresa('Mediterra', [doceP], { hoy: '2027-04-15' }).refinanciamientos.some(x => /pago_refinanciamiento/.test(x.tipo)) && r2(m(sVP, '2027-04').total) < 100000, JSON.stringify(m(sVP, '2027-04')));
// Bullet con pago y nuevo previsto en el mes del vencimiento: el vencimiento se paga en su fecha y el
// desembolso entra ese mes (sin suponer un día para prorratear intereses).
const sB = serv(cPF, hoy);
check('Bullet con pago y nuevo previsto en dic: dic-26 = 1.045.000 del vencimiento; el nuevo crédito vence en sus cuotas', r2(m(sB, '2026-12').total) === 1045000 && m(sB, '2029-12').capital === 1200000);
// Pago y nuevo por revisar (mes pasado sin fecha): el flujo no lo interpreta y lo avisa.
const fR = flujoCreditosEmpresa('Mediterra', [doceSin], { hoy: '2027-04-15' });
check('Pago y nuevo por revisar en el flujo: sin refinanciamiento supuesto y con aviso', !fR.refinanciamientos.length && fR.renovacionesPorRevisar.length === 1);
// Pago programado: sale en SU fecha; no desaparece del flujo.
const sPg = serv(fut, H);
check('Pago programado del 05-11: 5.000 en nov-26 y el resto de la cuota (120.000) en dic-26; total 125.000 (nada se pierde)', r2(m(sPg, '2026-11').total) === 5000 && r2(m(sPg, '2026-12').total) === 120000, `${m(sPg, '2026-11').total} / ${m(sPg, '2026-12').total}`);
check('Pago programado identificado en el flujo', flujoCreditosEmpresa('Osiris', [fut], { hoy: H }).pagosProgramados.some(x => x.fecha === '2026-11-05' && x.usd === 5000));
// Sin renovaciones ni pagos futuros, el calendario del flujo no cambia.
const fBase = movimientosFlujoCredito(rb, hoy);
check('Sin renovaciones ni pagos futuros: el calendario del flujo es el de siempre', fBase.extras.length === 0 && fBase.vencimientos.every(v => !v.refinanciada));

// ── 7) Avisos de saldo no cubierto (pago y nuevo con fecha) ──
const dosP = { ...rb, renovaciones: [pyn({ monto: 600000, ...R('2026-12-27') }), pyn({ monto: 1200000, mes_ingreso: 'Jun', anio_ingreso: 2027, ...R('2027-06-30'), cuotas: cq([['Capital+Interés', 'Dic', 2029]]) })] };
const eDos = estadoCreditoAlCorte(dosP, '2027-07-15');
check('Dos pago y nuevo: 1.200.000 vigente y sin aviso de «no cubre» (el 2º cubrió los 400.000)', eDos.saldoCapital === 1200000 && !eDos.avisosVigencia.some(a => /no cubre/.test(a)), `${eDos.saldoCapital} | ${eDos.avisosVigencia.join(' | ')}`);
check('Dos pago y nuevo, entre ambos: 600.000 + 400.000 no cubierto, con aviso', estadoCreditoAlCorte(dosP, '2027-01-15').saldoCapital === 1000000 && estadoCreditoAlCorte(dosP, '2027-01-15').avisosVigencia.some(a => /quedan 400000/.test(a)));
const dosB = { ...rb, renovaciones: [pyn({ monto: 600000, ...R('2026-12-27') }), pyn({ monto: 200000, mes_ingreso: 'Feb', anio_ingreso: 2027, ...R('2027-02-26'), cuotas: cq([['Capital+Interés', 'Dic', 2028]]) })] };
const eB = estadoCreditoAlCorte(dosB, '2027-03-15'), avB = eB.avisosVigencia.filter(a => /no cubre/.test(a));
check('Dos pago y nuevo (600.000 y 200.000) sobre 1.000.000: saldo 1.000.000 y un solo aviso «quedan 200000»', eB.saldoCapital === 1000000 && avB.length === 1 && /quedan 200000 /.test(avB[0]), `${eB.saldoCapital} | ${avB.join(' | ')}`);
const cAB = { ...rb, renovaciones: [pyn({ monto: 1000000, ...R('2026-12-27') }), pyn({ monto: 600000, mes_ingreso: 'Feb', anio_ingreso: 2027, ...R('2027-02-26'), cuotas: cq([['Capital+Interés', 'Dic', 2028]]) })] };
const eAB = estadoCreditoAlCorte(cAB, '2027-03-15'), avAB = eAB.avisosVigencia.filter(a => /no cubre/.test(a));
check('Pago y nuevo de 600.000 sobre la deuda de otro de 1.000.000: saldo 1.000.000 y aviso «quedan 400000»', eAB.saldoCapital === 1000000 && avAB.length === 1 && /quedan 400000 /.test(avAB[0]), `${eAB.saldoCapital} | ${avAB.join(' | ')}`);
const cC = { ...rb, renovaciones: [pyn({ monto: 1000000, ...R('2026-12-27'), cuotas: cq([['Capital+Interés', 'Jun', 2027], ['Capital+Interés', 'Dic', 2027]]) }), pyn({ monto: 500000, mes_ingreso: 'Feb', anio_ingreso: 2027, ...R('2027-02-26'), cuotas: cq([['Capital+Interés', 'Dic', 2028]]) })] };
const eC = estadoCreditoAlCorte(cC, '2027-03-15'), avC = eC.avisosVigencia.filter(a => /no cubre/.test(a));
check('Pago y nuevo de 500.000 sobre una renovación de 1.000.000 en dos cuotas: saldo 1.000.000 y aviso «quedan 500000»', eC.saldoCapital === 1000000 && avC.length === 1 && /quedan 500000 /.test(avC[0]), `${eC.saldoCapital} | ${avC.join(' | ')}`);
const dosMismoDia = { ...rb, renovaciones: [pyn({ monto: 600000, ...R('2026-12-27') }), pyn({ monto: 600000, ...R('2026-12-27') })] };
check('Dos pago y nuevo el mismo día (600.000 + 600.000): 1.200.000; el 2º no refinancia la deuda que nace ese día', estadoCreditoAlCorte(dosMismoDia, '2027-01-15').saldoCapital === 1200000);
// Sin fecha de inicio del período no se sabe cuánto estaba devengado al refinanciar: se conserva todo.
const sinIni = { ...rb, f_inicio: '', renovaciones: [pyn({ monto: 1000000, ...R('2026-10-15') })] };
const qSI = estadoCreditoAlCorte(sinIni, '2026-10-20').vencimientos.find(v => v.key === 'rv@2026-12-27');
check('Refinanciado sin fecha de inicio del período: el interés (45.000) se conserva completo, no se da por no devengado', qSI.pendiente.capital === 0 && qSI.pendiente.interes === 45000, JSON.stringify(qSI.pendiente));
// ── 8) Prepagos con fecha futura (hallazgos de la revisión) ──
const ubicarT = (iso) => { const [y, mm, d] = iso.split('-').map(Number); const idx = (y - 2026) * 12 + (mm - 4); return { idx: idx >= 0 && idx < 63 ? idx : -1, semIdx: Math.min(3, Math.floor((d - 1) / 7)) }; };
const SUM = (a) => a.reduce((x, y) => x + y, 0);
// Registro por vencimiento: prepago total el 10-12-2026 visto el 23-10. Sus «extinciones» no son caja.
const legM = { uid: 'lm', empresa: 'Allpa Farms', acreedor: 'Banco L', moneda: 'USD', monto: 120000, tipo_cr: 'Cuotas Mensuales', f_inicio: '2026-10-01', f_venc: '2027-10-01', cuota: 11000,
  desglose: { capital: 10000, interes: 1000, cargos: '' }, tasa: 10, base: 'act360', control_desde: '2026-10-01' };
const simL = simularPrepago(legM, { fecha: '2026-12-10', modo: 'plazo', total: true, esTotal: true, comisionTipo: 'ninguna' }, H);
const legP = aplicarPrepago(legM, simL, 'x');
const cajaL = r2(simL.capital + simL.devengado + simL.comision);
const fL = flujoCreditosEmpresa('Allpa Farms', [legP], { hoy: H, ubicar: ubicarT });
check(`Prepago futuro (registro por vencimiento): el flujo saca SU caja (${cajaL}) en dic-26, no las cuotas extinguidas con su interés futuro`,
  fL.pagosProgramados.length === 1 && fL.pagosProgramados[0].prepago && r2(fL.pagosProgramados[0].usd) === cajaL && Math.abs(fL.prestamos.total[8] - (11000 + cajaL)) < 0.01, `dic ${fL.prestamos.total[8]} · ${fL.pagosProgramados.map(x => x.usd).join(',')}`);
check('Prepago futuro: las extinciones no cuentan como pagos futuros', estadoCreditoAlCorte(legP, H).pagosFuturos.n === 1 && estadoCreditoAlCorte(legP, H).pagosFuturos.total === cajaL);
// Contrato: prepago de capital de 100.000 el 01-12-2026, visto el 23-10: no reduce el saldo de hoy.
const c2 = { uid: 'c2', tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco B', moneda: 'USD', monto: 400000, fecha_desembolso: '2026-07-10', primer_venc: '2026-10-10', vencimiento_final: '2027-07-10',
  periodicidad: 3, modalidad: 'lineal', tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-07-10', prepago_comision_tipo: 'ninguna',
  pagos: [{ id: 'q', vencKey: 'c2@2026-10-10', fecha: '2026-10-10', capital: 100000, interes: 8000 }] };
const simC = simularPrepago(c2, { fecha: '2026-12-01', capital: 100000, modo: 'plazo' }, H);
const c2p = aplicarPrepago(c2, simC, 'x');
check('Prepago futuro (contrato): KPI e informe de hoy no lo descuentan (300.000) y lo informan aparte',
  estadoCreditoAlCorte(c2p, H).saldoCapital === 300000 && informeDeuda([c2p], H).filas[0].capital === 300000 && estadoCreditoAlCorte(c2p, H).pagosFuturos.n === 1, String(estadoCreditoAlCorte(c2p, H).saldoCapital));
check('Prepago futuro (contrato): Saldo por Mes nov-26 300.000; dic-26 lo descuenta (200.000) y lo identifica',
  saldosAlCorte([c2p], '2026-11-30', H).total.capital === 300000 && saldosAlCorte([c2p], '2026-12-31', H).total.capital === 200000 && saldosAlCorte([c2p], '2026-12-31', H).total.pagosProgramados === 100000,
  `${saldosAlCorte([c2p], '2026-11-30', H).total.capital} / ${saldosAlCorte([c2p], '2026-12-31', H).total.capital}`);
const fC = flujoCreditosEmpresa('Osiris', [c2p], { hoy: H, ubicar: ubicarT });
const cajaC = r2(simC.capital + simC.devengado + simC.comision);
check(`Prepago futuro (contrato): su caja (${cajaC}) sale el 01-12 en el flujo`, fC.pagosProgramados.some(x => x.prepago && x.fecha === '2026-12-01' && r2(x.usd) === cajaC));
// «Descuenta X de pagos programados» solo cuando el pago cambia el saldo de ESE cierre.
const sNovP = saldosAlCorte([fut], '2026-11-30', H).total, sDicP = saldosAlCorte([fut], '2026-12-31', H).total;
check('Pago programado de una cuota que el cierre ya da por pagada: no se informa como descuento (dic-26: 0)', sNovP.pagosProgramados === 5000 && sDicP.pagosProgramados === 0, `${sNovP.pagosProgramados} / ${sDicP.pagosProgramados}`);
// Pago y nuevo de 600.000 (recibido 20-03) sobre 12 cuotas; ene-mar pagadas a tiempo y oct-dic
// (las que el refinanciamiento no alcanza) pagadas a su vencimiento: abr-sep quedan refinanciadas.
const pagosOD = [...doceSin.pagos, { id: 'm', vencKey: 'dz@2027-03-15', fecha: '2027-03-15', capital: 100000, interes: 10000 },
  ...['10', '11', '12'].map(mm => ({ id: 'p' + mm, vencKey: `dz@2027-${mm}-15`, fecha: `2027-${mm}-15`, capital: 100000, interes: 10000 }))];
const d600 = { ...doceSin, pagos: pagosOD, renovaciones: [{ ...doceSin.renovaciones[0], monto: 600000, ...R('2027-03-20') }] };
const e600 = estadoCreditoAlCorte(d600, '2028-01-15');
// Lo único vencido es el interés de abr devengado hasta el desembolso (10.000 × 5/31 = 1.612,90), sin pago registrado.
check('Pago y nuevo de 600.000 con oct-dic pagadas a su vencimiento: 600.000 vigente, sin aviso; vencido solo el interés devengado al desembolso (1.612,90), no jul-sep',
  e600.saldoCapital === 600000 && e600.vencidoTotal === 1612.9 && !e600.avisosVigencia.some(a => /no cubre/.test(a)), `${e600.saldoCapital} · vencido ${e600.vencidoTotal} · ${e600.avisosVigencia.join(' | ')}`);
const f600 = flujoCreditosEmpresa('Mediterra', [d600], { hoy: '2027-04-15', ubicar: ubicarT });
const egr600 = r2(SUM(f600.prestamos.total) + SUM(f600.renovaciones.total));
check('Mismo caso en el flujo (visto el 15-04-27): egresos 1.639.612,90 (sin inventar el interés de jul-sep)', Math.abs(egr600 - 1639612.90) < 0.01, String(egr600));
// El pago del anterior registrado como pagos de capital de abr-sep el 20-03 (con el nuevo desembolso):
// su interés futuro tampoco se debe. Interés pendiente al 15-04 = 108.000 (renovación) + 30.000 (oct-dic)
// + 1.612,90 (abr devengado al 20-03) = 139.612,90; flujo visto el 15-04 = 1.039.612,90.
const pAS = [...doceSin.pagos, { id: 'm', vencKey: 'dz@2027-03-15', fecha: '2027-03-15', capital: 100000, interes: 10000 },
  ...['04', '05', '06', '07', '08', '09'].map(mm => ({ id: 'r' + mm, vencKey: `dz@2027-${mm}-15`, fecha: '2027-03-20', capital: 100000 }))];
const d6 = { ...doceSin, pagos: pAS, renovaciones: [{ ...doceSin.renovaciones[0], monto: 600000, ...R('2027-03-20') }] };
const e6 = estadoCreditoAlCorte(d6, '2027-04-15');
check('Pago del anterior registrado como capital el día del refinanciamiento: capital 900.000 e interés pendiente 139.612,90 (sin el interés futuro de abr-sep)',
  e6.saldoCapital === 900000 && Math.abs(e6.interesPend - 139612.90) < 0.01, `${e6.saldoCapital} / ${e6.interesPend}`);
const f6 = flujoCreditosEmpresa('Mediterra', [d6], { hoy: '2027-04-15', ubicar: ubicarT });
check('Mismo caso en el flujo: 1.039.612,90 (no inventa 58.387,10 de interés)', Math.abs(r2(SUM(f6.prestamos.total) + SUM(f6.renovaciones.total)) - 1039612.90) < 0.01, String(r2(SUM(f6.prestamos.total) + SUM(f6.renovaciones.total))));
// Pago del anterior SIN DESGLOSE el día del refinanciamiento: se imputa primero a interés (10.000)
// y luego a capital (90.000); los 10.000 de capital que quedan en cada cuota se refinancian.
const pSD = [...doceSin.pagos, { id: 'm', vencKey: 'dz@2027-03-15', fecha: '2027-03-15', capital: 100000, interes: 10000 },
  ...['04', '05', '06', '07', '08', '09'].map(mm => ({ id: 's' + mm, vencKey: `dz@2027-${mm}-15`, fecha: '2027-03-20', sinDesglose: 100000 }))];
const dSD = { ...doceSin, pagos: pSD, renovaciones: [{ ...doceSin.renovaciones[0], monto: 600000, ...R('2027-03-20') }] };
const eSD = estadoCreditoAlCorte(dSD, '2027-04-25');
check('Pago sin desglose del anterior el día del refinanciamiento: capital 900.000 (no 910.000) y aviso «quedan 300000»',
  eSD.saldoCapital === 900000 && eSD.avisosVigencia.some(a => /quedan 300000 /.test(a)), `${eSD.saldoCapital} | ${eSD.avisosVigencia.join(' | ')}`);
// UF: el capital reemplazado = capital de las cuotas de la renovación (redondeado), sin diferencia.
const uf = { ...rb, uid: 'uf', moneda: 'UF', monto: 10000, cuota: 10450, desglose: { capital: 10000, interes: 450, cargos: 0 }, renovaciones: [pyn({ monto: 7000.1234, ...R('2026-12-27') })] };
const eUF = estadoCreditoAlCorte(uf, '2027-01-15');
check('UF: pago y nuevo de 7.000,1234 sobre 10.000 → 10.000 exacto (sin diferencia de redondeo)', Math.abs(eUF.saldoCapital - 10000) < 0.00005, String(eUF.saldoCapital));

// ── 9) Un pago no puede superar lo que debe la cuota (se rechaza al registrar) ──
const ok1 = registrarPagoIdempotente(rb, { vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1000000, interes: 45000, origen: { clave: 'k1' } }, 'x');
check('Pago exacto de la cuota (1.000.000 + 45.000): se registra', ok1.credito.pagos.length === 1);
let msj = '';
try { registrarPagoIdempotente(rb, { vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1200000, origen: { clave: 'k2' } }, 'x'); } catch (e) { msj = e.message; }
check('Pago de capital mayor al de la cuota (1.200.000 > 1.000.000): se rechaza con el motivo', /supera lo que debe la cuota/.test(msj) && /capital 1200000 > pendiente 1000000/.test(msj), msj);
msj = ''; try { registrarPagoIdempotente(rb, { vencKey: 'rv@2026-12-27', fecha: '2026-12-27', sinDesglose: 1100000, origen: { clave: 'k3' } }, 'x'); } catch (e) { msj = e.message; }
check('Pago sin desglose mayor al total pendiente (1.100.000 > 1.045.000): se rechaza', /total 1100000 > pendiente 1045000/.test(msj), msj);
msj = ''; try { registrarPagoIdempotente(ok1.credito, { vencKey: 'rv@2026-12-27', fecha: '2026-12-28', interes: 1, origen: { clave: 'k4' } }, 'x'); } catch (e) { msj = e.message; }
check('Cuota ya pagada: un pago adicional se rechaza', /supera lo que debe la cuota/.test(msj), msj);
check('Pago parcial (500.000 de capital): se registra', registrarPagoIdempotente(rb, { vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 500000, origen: { clave: 'k5' } }, 'x').credito.pagos.length === 1);
// Un exceso YA guardado no se modifica ni se borra: el crédito se lee igual que antes.
const hist = { ...rb, pagos: [{ id: 'h', vencKey: 'rv@2026-12-27', fecha: '2026-12-27', capital: 1200000, interes: 45000 }] };
const eH = estadoCreditoAlCorte(hist, '2027-01-15');
check('Pago histórico con exceso: no se modifica (sigue 1.200.000 de capital registrado) y el crédito se lee igual', hist.pagos[0].capital === 1200000 && eH.saldoCapital === 0 && eH.pagadoCapital === 1200000);
check('Un exceso ya guardado no impide registrar en otra cuota (validación por cuota)', excesoPagoCuota(hist, { vencKey: 'otra', capital: 1 }) === null);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
