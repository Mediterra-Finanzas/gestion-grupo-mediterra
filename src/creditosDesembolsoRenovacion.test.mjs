/* eslint-disable */
// Desembolso recibido y renovaciones con modalidad — node src/creditosDesembolsoRenovacion.test.mjs
// Cada caso deja escrito el cálculo esperado. Fecha de referencia fija: 15-oct-2026.
import {
  calendarioContrato, estadoCredito, flujoCreditosEmpresa, registrarPago, saldoCapitalAl,
  registrarDesembolsoRecibido, anularDesembolsoRecibido, estadoDesembolso, desembolsoRecibido,
  ingresosRenovacion, avisosRenovacion, calcCuotasRenovacion, getRenovaciones, desembolsoPendiente,
  movimientosCapitalAlCorte, saldosAlCorte, ingresosRenovacionFlujo,
} from './creditos.js';

let fallos = 0;
const aprox = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const HOY = '2026-10-15';
// Horizonte como en FinanzasModule: Apr-26 = índice 0.
const ubicar = (iso) => { const [y, m, d] = iso.split('-').map(Number); const idx = (y - 2026) * 12 + (m - 4); return { idx: idx >= 0 && idx < 63 ? idx : -1, semIdx: Math.min(3, Math.floor((d - 1) / 7)) }; };
const iM = (y, m) => (y - 2026) * 12 + (m - 4);
const flujo = (cs, emp) => flujoCreditosEmpresa(emp, cs, { hoy: HOY, ubicar });
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ═══ A. BULLET YA RECIBIDO ════════════════════════════════════════
// 1.000.000 al 8% Act/360, desembolso contractual 01-nov-26, bullet capital+interés
// al 30-abr-27 (180 días): interés = 1.000.000 × 8% × 180/360 = 40.000; total 1.040.000.
// Los fondos llegaron ANTES, el 10-oct-26 (neto de gastos: 998.500).
const bullet = { uid: 'bu', n: 1, tipo_credito: 'contrato', empresa: 'Mediterra', acreedor: 'Banco Bullet', moneda: 'USD',
  monto: 1000000, fecha_desembolso: '2026-11-01', vencimiento_final: '2027-04-30', modalidad: 'bullet_total',
  tasa_tipo: 'fija', tasa_anual: 8, base: 'act360' };
const k = calendarioContrato(bullet).filas;
check('A0: calendario 1 vencimiento 30-abr-27 = 1.000.000 + 40.000', k.length === 1 && aprox(k[0].capital, 1000000) && aprox(k[0].interes, 40000));
const f0 = flujo([bullet], 'Mediterra');
check('A1: sin registrar, el desembolso se proyecta como ingreso en nov-26 (1.000.000)', aprox(f0.ingresos.total[iM(2026, 11)], 1000000));
check('A1b: estado del desembolso = pendiente', estadoDesembolso(bullet, HOY).estado === 'pendiente');
// 998.500 en la cartola + 1.500 retenidos por el banco (gastos notariales e impuesto) = 1.000.000 desembolsados.
const rec = registrarDesembolsoRecibido(bullet, { fecha: '2026-10-10', monto: 998500, retenido: 1500, concepto_retenido: 'gastos notariales e impuesto', nota: 'cartola BCI 10-10', tipo: 'total' }, 'Angelo', HOY);
const f1 = flujo([rec], 'Mediterra');
const e0 = estadoCredito(bullet, HOY), e1 = estadoCredito(rec, HOY);
check('A2: con fondos recibidos NO se proyecta ningún ingreso (ni en nov-26 ni en otro mes)', sum(f1.ingresos.total) === 0);
check('A3: el calendario de pago sigue igual: 1.040.000 en abr-27', aprox(f1.prestamos.total[iM(2027, 4)], 1040000) && aprox(f0.prestamos.total[iM(2027, 4)], f1.prestamos.total[iM(2027, 4)]));
check('A4: capital pendiente sin cambio (1.000.000) e intereses 40.000', aprox(e1.saldoCapital, 1000000) && aprox(e1.interesPend, 40000) && e1.saldoCapital === e0.saldoCapital);
check('A5: ninguna cuota pagada y ningún pago registrado', e1.vencimientos.every(v => v.estado === 'pendiente') && (rec.pagos || []).length === 0);
const ed = estadoDesembolso(rec, HOY);
check('A6: estado = recibido: 998.500 en caja + 1.500 retenidos = 1.000.000; pendiente 0; diferencia 0; capital sin cambio',
  ed.estado === 'recibido' && ed.recibidoTotal === 998500 && ed.retenidoTotal === 1500 && ed.pendiente === 0 && aprox(ed.diferencia, 0) && aprox(e1.saldoCapital, 1000000));
// Sin explicación de los 1.500: no se acepta como total; como parcial, los 1.500 siguen proyectados.
let sinExpl = null; try { registrarDesembolsoRecibido(bullet, { fecha: '2026-10-10', monto: 998500, tipo: 'total' }, 'x', HOY); } catch (e) { sinExpl = e.message; }
check('A6b: 998.500 como TOTAL sin retención explicada se rechaza (indica retenido o registra parcial)', !!sinExpl && /parcial/.test(sinExpl));
const recP = registrarDesembolsoRecibido(bullet, { fecha: '2026-10-10', monto: 998500, tipo: 'parcial' }, 'x', HOY);
check('A6c: 998.500 como PARCIAL → 1.500 siguen pendientes y proyectados en nov-26; capital 1.000.000',
  desembolsoPendiente(recP) === 1500 && aprox(flujo([recP], 'Mediterra').ingresos.total[iM(2026, 11)], 1500) && aprox(estadoCredito(recP, HOY).saldoCapital, 1000000));
let sinConc = null; try { registrarDesembolsoRecibido(bullet, { fecha: '2026-10-10', monto: 998500, retenido: 1500, tipo: 'total' }, 'x', HOY); } catch (e) { sinConc = e.message; }
check('A6d: retenido sin concepto se rechaza', !!sinConc && /concepto/.test(sinConc));
check('A6e: el historial registra lo retenido y su concepto', rec.historial.some(h => /retenido 1500 \(gastos notariales/.test(h.detalle)));
check('A7: queda en el historial', rec.historial.some(h => h.accion === 'desembolso_recibido'));
let dup = null; try { registrarDesembolsoRecibido(rec, { fecha: '2026-10-11', monto: 1 }, 'x', HOY); } catch (e) { dup = e.message; }
check('A8: no se puede registrar dos veces (anular y registrar el correcto)', !!dup);
const anul = anularDesembolsoRecibido(rec, desembolsoRecibido(rec).id, 'era otro crédito', 'Angelo');
check('A9: anular con motivo devuelve el ingreso proyectado y conserva el registro anulado',
  aprox(flujo([anul], 'Mediterra').ingresos.total[iM(2026, 11)], 1000000) && anul.desembolso_registros[0].anulado === true);
let sinMotivo = null; try { anularDesembolsoRecibido(rec, desembolsoRecibido(rec).id, '', 'x'); } catch (e) { sinMotivo = e.message; }
check('A10: anular sin motivo se rechaza', !!sinMotivo);
// Pendiente con fecha pasada: no se mueve, se informa.
const viejo = { ...bullet, uid: 'bv', fecha_desembolso: '2026-10-01', control_desde: '2026-09-01' };
const fv = flujo([viejo], 'Mediterra');
check('A11: desembolso pendiente con fecha pasada se informa (no se da por recibido ni se mueve)',
  fv.desembolsosPendientesVencidos.length === 1 && aprox(fv.ingresos.total[iM(2026, 10)], 1000000) && estadoDesembolso(viejo, HOY).estado === 'pendiente_vencido');
// Un registro anterior al control en la app (fecha < control_desde) no genera aviso: es histórico.
const hist = { ...bullet, uid: 'bh', fecha_desembolso: '2026-08-01', control_desde: '2026-09-01' };
check('A12: desembolso anterior al control en la app: sin aviso (histórico)', flujo([hist], 'Mediterra').desembolsosPendientesVencidos.length === 0 && estadoDesembolso(hist, HOY).estado === 'historico');
let fut = null; try { registrarDesembolsoRecibido(bullet, { fecha: '2026-12-01', monto: 1, tipo: 'parcial' }, 'x', HOY); } catch (e) { fut = e.message; }
check('A13: no se registra una recepción con fecha futura', !!fut);

// ═══ A'. DESEMBOLSO PARCIAL ═══════════════════════════════════════
// Recibido 600.000 (parcial) el 12-oct: sigue proyectado 1.000.000 − 600.000 = 400.000 en nov-26.
const p1 = registrarDesembolsoRecibido(bullet, { fecha: '2026-10-12', monto: 600000, tipo: 'parcial' }, 'Angelo', HOY);
const fp1 = flujo([p1], 'Mediterra');
check("A'1: parcial 600.000 → sigue proyectado 400.000 en nov-26", aprox(fp1.ingresos.total[iM(2026, 11)], 400000) && desembolsoPendiente(p1) === 400000);
check("A'2: estado 'parcial' con recibido 600.000 y pendiente 400.000", estadoDesembolso(p1, HOY).estado === 'parcial' && estadoDesembolso(p1, HOY).recibidoTotal === 600000);
check("A'3: el calendario y el capital no cambian (1.000.000 / 1.040.000)", aprox(estadoCredito(p1, HOY).saldoCapital, 1000000) && aprox(fp1.prestamos.total[iM(2027, 4)], 1040000));
const p2 = registrarDesembolsoRecibido(p1, { fecha: '2026-10-14', monto: 400000, tipo: 'parcial' }, 'Angelo', HOY);
check("A'4: segundo tramo 400.000 → nada pendiente; estado 'recibido'", sum(flujo([p2], 'Mediterra').ingresos.total) === 0 && estadoDesembolso(p2, HOY).estado === 'recibido');
const p3 = anularDesembolsoRecibido(p2, p2.desembolso_registros[1].id, 'monto equivocado', 'Angelo');
check("A'5: anular el 2º tramo devuelve 400.000 al flujo", aprox(flujo([p3], 'Mediterra').ingresos.total[iM(2026, 11)], 400000));
const p4 = registrarDesembolsoRecibido(p1, { fecha: '2026-10-14', monto: 398500, retenido: 1500, concepto_retenido: 'comisión', tipo: 'total' }, 'Angelo', HOY);
check("A'6: segundo tramo TOTAL 398.500 + 1.500 retenidos → nada pendiente; diferencia 0",
  sum(flujo([p4], 'Mediterra').ingresos.total) === 0 && aprox(estadoDesembolso(p4, HOY).diferencia, 0) && estadoDesembolso(p4, HOY).retenidoTotal === 1500);

// ═══ B. RENOVACIONES (registro por vencimiento) ═══════════════════
// Crédito original: cuota 1.050.000 el 31-dic-26 = capital 1.000.000 + interés 50.000
// (desglose con respaldo). Renovación: entra/extiende en dic-26, al 10% anual simple:
//   jun-27 Solo Interés: 1.000.000 × 10%/12 × 6 = 50.000
//   dic-27 Capital+Interés: 1.000.000 + 50.000 = 1.050.000
const base = { uid: 'rv', n: 2, empresa: 'Allegria Foods', acreedor: 'Banco Renov', moneda: 'USD', tipo_cr: 'Bullet',
  monto: 1000000, f_inicio: '2026-06-30', f_venc: '2026-12-31', cuota: 1050000, tasa_anual: 10,
  desglose: { capital: 1000000, interes: 50000, cargos: 0, respaldo: 'pagaré', usuario: 'x', ts: 'x' },
  control_desde: '2026-06-30', renovable: true };
const ren = (extra) => ({ ...base, renovaciones: [{ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 10,
  cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2027 }, { tipo: 'Capital+Interés', mes: 'Dic', anio: 2027 }], ...extra }] });
const cq = calcCuotasRenovacion(getRenovaciones(ren({}))[0]);
check('B0: cuotas de la renovación 50.000 (jun-27) y 1.050.000 (dic-27)', cq[0].montoReal === 50000 && cq[1].montoReal === 1050000, cq.map(x => x.montoReal).join(' / '));
const dic26 = iM(2026, 12), jun27 = iM(2027, 6), dic27 = iM(2027, 12);
const resumen = (c) => {
  const e = estadoCredito(c, HOY), f = flujo([c], 'Allegria Foods');
  const vo = e.vencimientos.find(v => v.origen !== 'renovacion' && v.fecha === '2026-12-31');
  return { e, f, vo, ing: ingresosRenovacion(c) };
};

// B1 — Extensión sin movimiento de caja
const r1 = resumen(ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados' }));
check('B1a extensión: el 31-dic-26 solo vence el interés en caja (50.000); el capital 1.000.000 se extiende',
  aprox(r1.vo.pendienteTotal, 50000) && aprox(r1.vo.renovado, 1000000) && aprox(r1.f.prestamos.total[dic26], 50000));
check('B1b extensión: NO hay ingreso de renovación', r1.ing.length === 0);
check('B1c extensión: la renovación proyecta 50.000 (jun-27) y 1.050.000 (dic-27)', aprox(r1.f.renovaciones.total[jun27], 50000) && aprox(r1.f.renovaciones.total[dic27], 1050000));
check('B1d extensión: capital pendiente 1.000.000 (no se duplica)', aprox(r1.e.saldoCapital, 1000000), String(r1.e.saldoCapital));
check('B1e extensión: el vencimiento original NO figura como pagado (sin pago registrado)', r1.vo.pagadoTotal === 0 && (r1.e.c.pagos || []).length === 0);

// B2 — Pago del anterior + nuevo desembolso
const c2 = ren({ modalidad: 'pago_y_nuevo', confirmada: true });
const r2 = resumen(c2);
check('B2a pago+nuevo: el 31-dic-26 se paga en caja la cuota completa 1.050.000', aprox(r2.vo.pendienteTotal, 1050000) && aprox(r2.f.prestamos.total[dic26], 1050000));
check('B2b pago+nuevo: ingreso de caja 1.000.000 en dic-26 (una sola vez)', r2.ing.length === 1 && r2.ing[0].monto === 1000000 && r2.ing[0].fecha === '2026-12-01');
check('B2c pago+nuevo: antes de pagar el anterior hay 2 obligaciones (2.000.000 de capital)', aprox(r2.e.saldoCapital, 2000000));
const c2p = registrarPago(c2, { vencKey: r2.vo.key, fecha: '2026-12-31', capital: 1000000, interes: 50000 }, 'x');
check('B2d pago+nuevo: pagado el anterior, queda solo el nuevo (1.000.000)', aprox(estadoCredito(c2p, HOY).saldoCapital, 1000000));
const c2r = { ...c2, renovaciones: [{ ...c2.renovaciones[0], recibido: { fecha: '2026-12-20', monto: 1000000 } }] };
check('B2e pago+nuevo: con los fondos del nuevo ya recibidos, no se proyecta el ingreso; las cuotas siguen',
  ingresosRenovacion(c2r).length === 0 && aprox(flujo([c2r], 'Allegria Foods').renovaciones.total[dic27], 1050000));

// B3 — Parcial: paga 400.000 de capital y extiende 600.000
// Renovación 600.000 al 10%: jun-27 = 600.000 × 10%/12 × 6 = 30.000; dic-27 = 600.000 + 30.000 = 630.000
const r3 = resumen(ren({ monto: 600000, modalidad: 'parcial', confirmada: true, intereses: 'pagados' }));
check('B3a parcial: el 31-dic-26 se paga en caja 400.000 de capital + 50.000 de interés = 450.000',
  aprox(r3.vo.pendienteTotal, 450000) && aprox(r3.vo.pendiente.capital, 400000) && aprox(r3.vo.renovado, 600000));
check('B3b parcial: NO hay ingreso de renovación', r3.ing.length === 0);
check('B3c parcial: renovación 30.000 (jun-27) y 630.000 (dic-27)', aprox(r3.f.renovaciones.total[jun27], 30000) && aprox(r3.f.renovaciones.total[dic27], 630000));
check('B3d parcial: capital pendiente 1.000.000 = 400.000 (original) + 600.000 (renovado)', aprox(r3.e.saldoCapital, 1000000));

// B4 — Propuesta (sin confirmar): no se supone
const r4 = resumen(ren({ modalidad: 'extension', confirmada: false }));
check('B4 propuesta: no proyecta ingreso ni cuotas; el original vence completo (1.050.000)',
  r4.ing.length === 0 && sum(r4.f.renovaciones.total) === 0 && aprox(r4.vo.pendienteTotal, 1050000) && avisosRenovacion(ren({ modalidad: 'extension', confirmada: false })).propuestas.length === 1);
check('B4b confirmada sin modalidad: no se proyecta y se avisa', ingresosRenovacion(ren({ confirmada: true })).length === 0
  && sum(resumen(ren({ confirmada: true })).f.renovaciones.total) === 0 && avisosRenovacion(ren({ confirmada: true })).incompletas.length === 1);

// B5 — Registro antiguo (sin modalidad ni confirmación): comportamiento histórico, avisado
const r5 = resumen(ren({}));
check('B5 antigua: igual que antes (ingreso 1.000.000 + cuotas + original completo) y queda avisada',
  r5.ing.length === 1 && aprox(r5.f.renovaciones.total[dic27], 1050000) && aprox(r5.vo.pendienteTotal, 1050000) && avisosRenovacion(ren({})).antiguas.length === 1);

// B6 — Desconfirmar la extensión deshace el traslado (el dato no se perdió)
const r6 = resumen(ren({ modalidad: 'extension', confirmada: false }));
check('B6 desconfirmar: el original vuelve a vencer completo; nada quedó registrado como pago', aprox(r6.vo.pendienteTotal, 1050000) && !r6.vo.renovado);

// B7 — Extender más de lo que vence: no se inventa, se informa
const r7 = resumen(ren({ monto: 1200000, modalidad: 'extension', confirmada: true, intereses: 'pagados' }));
// La extensión traslada CAPITAL (o lo sin desglose), nunca el interés del vencimiento original.
check('B7 exceso: se traslada el capital que vencía (1.000.000), el interés 50.000 sigue en caja y el exceso 200.000 se informa SIN crear deuda',
  aprox(r7.vo.renovado, 1000000) && aprox(r7.vo.renovadoExceso, 200000) && aprox(r7.vo.pendienteTotal, 50000)
  && aprox(r7.e.saldoCapital, 1000000) && aprox(r7.f.renovaciones.total[dic27], 1050000) && avisosRenovacion(ren({ monto: 1200000, modalidad: 'extension', confirmada: true, intereses: 'pagados' })).excesos.length === 1);

// ═══ C. INTERESES Y CARGOS AL RENOVAR (extensión de 1.000.000; interés original 50.000) ═══
// Pendientes: el 31-dic-26 no sale nada en caja; los 50.000 se pagan con la 1ª cuota de la
// renovación (jun-27: 50.000 propio + 50.000 trasladado = 100.000), sin devengar interés.
const rP = resumen(ren({ modalidad: 'extension', confirmada: true, intereses: 'pendientes' }));
check('C1 pendientes: nada en caja el 31-dic-26 (vencimiento "renovada")', aprox(rP.vo.pendienteTotal, 0) && rP.vo.estado === 'renovada' && aprox(rP.f.prestamos.total[dic26], 0));
check('C2 pendientes: jun-27 = 50.000 + 50.000 trasladado = 100.000; dic-27 = 1.050.000', aprox(rP.f.renovaciones.total[jun27], 100000) && aprox(rP.f.renovaciones.total[dic27], 1050000));
check('C3 pendientes: capital 1.000.000 e intereses pendientes 150.000 (50.000 + 50.000 + 50.000)', aprox(rP.e.saldoCapital, 1000000) && aprox(rP.e.interesPend, 150000), `${rP.e.saldoCapital} / ${rP.e.interesPend}`);
// Capitalizados: capital renovado 1.050.000 al 10%: jun-27 = 1.050.000 × 10%/12 × 6 = 52.500;
// dic-27 = 1.050.000 + 52.500 = 1.102.500.
const rK = resumen(ren({ modalidad: 'extension', confirmada: true, intereses: 'capitalizados' }));
check('C4 capitalizados: nada en caja el 31-dic-26', aprox(rK.vo.pendienteTotal, 0) && aprox(rK.f.prestamos.total[dic26], 0));
check('C5 capitalizados: jun-27 52.500 y dic-27 1.102.500', aprox(rK.f.renovaciones.total[jun27], 52500) && aprox(rK.f.renovaciones.total[dic27], 1102500),
  `${rK.f.renovaciones.total[jun27]} / ${rK.f.renovaciones.total[dic27]}`);
// Antes del 31-dic-26 lo capitalizado sigue siendo interés (el banco informa 1.000.000);
// desde esa fecha es capital: 1.050.000. El total nunca cambia.
check('C6 capitalizados HOY (antes del 31-dic-26): capital 1.000.000 + interés 50.000 por capitalizar', aprox(rK.e.saldoCapital, 1000000), String(rK.e.saldoCapital));
const rK2 = estadoCredito(ren({ modalidad: 'extension', confirmada: true, intereses: 'capitalizados' }), '2027-01-15');
check('C6b capitalizados DESPUÉS del 31-dic-26: capital 1.050.000 (sin duplicar)', aprox(rK2.saldoCapital, 1050000), String(rK2.saldoCapital));
check('C7 sin tratamiento elegido: no se proyecta y se avisa', sum(resumen(ren({ modalidad: 'extension', confirmada: true })).f.renovaciones.total) === 0
  && avisosRenovacion(ren({ modalidad: 'extension', confirmada: true })).incompletas.length === 1);

// ═══ D. RESGUARDOS ═══════════════════════════════════════════════
const soloInt = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2027 }] });
const rS = resumen(soloInt);
check('D1 cuotas que no devuelven el capital: NO se traslada ni proyecta (el capital no desaparece) y se avisa',
  aprox(rS.e.saldoCapital, 1000000) && aprox(rS.vo.pendienteTotal, 1050000) && sum(rS.f.renovaciones.total) === 0 && avisosRenovacion(soloInt).incompletas.length === 1);
const sinOrig = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', venc_origen: '2026-12-01' });
const rO = resumen(sinOrig);
check('D2 vencimiento de origen inexistente: no se proyecta (no duplica) y se avisa',
  aprox(rO.e.saldoCapital, 1000000) && sum(rO.f.renovaciones.total) === 0 && avisosRenovacion(sinOrig).incompletas.length === 1);
const anulada = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', anulada: true, motivoAnulacion: 'banco no aprobó' });
const rA = resumen(anulada);
check('D3 renovación ANULADA: sin efecto (original completo, sin cuotas ni ingreso), el dato se conserva',
  aprox(rA.vo.pendienteTotal, 1050000) && sum(rA.f.renovaciones.total) === 0 && rA.ing.length === 0 && aprox(rA.e.saldoCapital, 1000000)
  && getRenovaciones(anulada)[0].motivoAnulacion === 'banco no aprobó');
// Movimientos de capital cuadran con la extensión (antes: 2.000.000 calculado vs 1.000.000).
const mv = movimientosCapitalAlCorte([ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados' })], '2027-01-31');
check('D4 "Ver movimientos" cuadra con una extensión', mv && mv.cuadra === true, mv ? `${mv.calculado} vs ${mv.capitalApp}` : 'sin resultado');

// ═══ E. HALLAZGOS DE LA 2ª REVISIÓN ═════════════════════════════════
const R = (o) => ({ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 10, confirmada: true, modalidad: 'extension', intereses: 'pagados',
  cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2027 }, { tipo: 'Capital+Interés', mes: 'Dic', anio: 2027 }], ...o });
// E1 renovación de una renovación: la 2ª extiende la última cuota de la 1ª (dic-27).
const enc = { ...base, renovaciones: [R({}), R({ mes_ingreso: 'Dic', anio_ingreso: 2027, venc_origen_key: 'rv@R0@1',
  cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2028 }, { tipo: 'Capital+Interés', mes: 'Dic', anio: 2028 }] })] };
const eE = estadoCredito(enc, HOY), fE = flujo([enc], 'Allegria Foods');
check('E1 renovación encadenada: capital 1.000.000 (no 2.000.000)', aprox(eE.saldoCapital, 1000000), String(eE.saldoCapital));
check('E1b dic-27 solo interés 50.000; jun-28 50.000; dic-28 1.050.000', aprox(fE.renovaciones.total[dic27], 50000) && aprox(fE.renovaciones.total[iM(2028, 6)], 50000) && aprox(fE.renovaciones.total[iM(2028, 12)], 1050000));
// E2 dos renovaciones sobre EL MISMO vencimiento: la 2ª solo puede tomar lo que queda (0) → no crea deuda.
const dobles = { ...base, renovaciones: [R({}), R({ venc_origen: '2026-12-31', cuotas: [{ tipo: 'Capital+Interés', mes: 'Mar', anio: 2028 }] })] };
check('E2 dos renovaciones sobre el mismo vencimiento: capital 1.000.000 y la 2ª no se aplica (sin capital disponible) y se avisa',
  aprox(estadoCredito(dobles, HOY).saldoCapital, 1000000) && avisosRenovacion(dobles).incompletas.length === 1, String(estadoCredito(dobles, HOY).saldoCapital));
// E3 cuota sin mes: la renovación no se aplica (el capital no desaparece)
const sinMes = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', cuotas: [{ tipo: 'Capital+Interés', mes: 'Sep', anio: 2027 }, { tipo: 'Capital+Interés', mes: '', anio: '' }] });
check('E3 una cuota sin mes: no se aplica; capital 1.000.000; original completo; avisado',
  aprox(estadoCredito(sinMes, HOY).saldoCapital, 1000000) && aprox(resumen(sinMes).vo.pendienteTotal, 1050000) && avisosRenovacion(sinMes).incompletas.length === 1);
// E4 cuotas anteriores al vencimiento que se renueva
const antes = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', cuotas: [{ tipo: 'Capital+Interés', mes: 'Nov', anio: 2026 }] });
check('E4 cuotas anteriores al origen: no se aplica y se avisa', aprox(resumen(antes).vo.pendienteTotal, 1050000) && avisosRenovacion(antes).incompletas.length === 1);
// E5 el vencimiento original ya tiene un pago registrado: no se renueva en silencio
const pagadoAntes = registrarPago(base, { vencKey: 'rv@2026-12-31', fecha: '2026-10-01', capital: 1000000, interes: 50000 }, 'x');
const pyR = { ...pagadoAntes, renovaciones: ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados' }).renovaciones };
check('E5 origen con pago registrado: la extensión no se aplica (no baja la deuda dos veces) y se avisa',
  aprox(estadoCredito(pyR, HOY).saldoCapital, 0) && sum(flujo([pyR], 'Allegria Foods').renovaciones.total) === 0 && avisosRenovacion(pyR).incompletas.length === 1, String(estadoCredito(pyR, HOY).saldoCapital));
// E6 cuota antigua sin desglose: no se supone qué parte es capital
const sinDesg = { ...base, desglose: undefined, renovaciones: ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados' }).renovaciones };
check('E6 vencimiento sin desglose capital/interés: no se aplica y se pide el desglose',
  sum(flujo([sinDesg], 'Allegria Foods').renovaciones.total) === 0 && /desglose/.test(avisosRenovacion(sinDesg).incompletas[0]?.falta || ''));
// E7 tramos parciales que superan el capital: rechazados
let sup = null; try { registrarDesembolsoRecibido(p1, { fecha: '2026-10-14', monto: 500000, tipo: 'parcial' }, 'x', HOY); } catch (e) { sup = e.message; }
check('E7 parciales que superarían el capital se rechazan (usar "total")', !!sup);

// ═══ F. HALLAZGOS DE LA 3ª REVISIÓN ═════════════════════════════════
// F1 extensión con intereses "pagados": registrar el pago en caja de esos 50.000 NO anula la renovación.
const ext = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados' });
const extPag = registrarPago(ext, { vencKey: 'rv@2026-12-31', fecha: '2026-12-31', interes: 50000 }, 'x');
const rF1 = resumen(extPag);
check('F1 extensión + pago del interés en el origen: la renovación sigue (dic-27 1.050.000), origen saldado, capital 1.000.000',
  aprox(rF1.vo.pendienteTotal, 0) && aprox(rF1.f.renovaciones.total[dic27], 1050000) && aprox(rF1.e.saldoCapital, 1000000), `${rF1.vo.pendienteTotal} / ${rF1.e.saldoCapital}`);
// F2 parcial: se pagan en caja 400.000 de capital + 50.000 de interés; se extienden 600.000.
const par = ren({ monto: 600000, modalidad: 'parcial', confirmada: true, intereses: 'pagados' });
const parPag = registrarPago(par, { vencKey: 'rv@2026-12-31', fecha: '2026-12-31', capital: 400000, interes: 50000 }, 'x');
const rF2 = resumen(parPag);
check('F2 parcial + pago en caja de la parte no renovada: renovación vigente, origen saldado, capital 600.000',
  aprox(rF2.vo.pendienteTotal, 0) && aprox(rF2.f.renovaciones.total[dic27], 630000) && aprox(rF2.e.saldoCapital, 600000), `${rF2.e.saldoCapital}`);
// F3 renovación encadenada: pagar el interés de la cuota de origen (R0@1) no apaga la 2ª renovación.
const encPag = registrarPago(enc, { vencKey: 'rv@R0@1', fecha: '2027-12-28', interes: 50000 }, 'x');
check('F3 encadenada + pago del interés de la cuota de origen: la 2ª sigue (dic-28 1.050.000), capital 1.000.000',
  aprox(flujo([encPag], 'Allegria Foods').renovaciones.total[iM(2028, 12)], 1050000) && aprox(estadoCredito(encPag, HOY).saldoCapital, 1000000));
// F4 clave del origen con un uid que no coincide (alta nueva): se ubica por la fecha guardada.
const malaClave = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', venc_origen_key: 'nundefined@2026-12-31', venc_origen: '2026-12-31' });
check('F4 clave de origen inexistente con fecha válida: se aplica por fecha', aprox(resumen(malaClave).vo.pendienteTotal, 50000) && aprox(resumen(malaClave).f.renovaciones.total[dic27], 1050000));
// F5 capitalizados: el flujo y el servicio de deuda NO reclasifican (cada cuota vence después del origen).
const cap = ren({ modalidad: 'extension', confirmada: true, intereses: 'capitalizados' });
const fC = flujo([cap], 'Allegria Foods');
check('F5 capitalizados: servicio de deuda dic-27 = capital 1.050.000 + interés 52.500 (aunque hoy sea antes del origen)',
  aprox(fC.renovaciones.capital[dic27], 1050000) && aprox(fC.renovaciones.interes[dic27], 52500), `${fC.renovaciones.capital[dic27]} / ${fC.renovaciones.interes[dic27]}`);
check('F5b capital pendiente medido al 31-mar-27 = 1.050.000 (ya capitalizado)', aprox(saldoCapitalAl([cap], '2027-03-31', HOY).capital, 1050000), String(saldoCapitalAl([cap], '2027-03-31', HOY).capital));
// F6 Ver movimientos cuadra antes y después del origen, con la línea de capitalización.
const mvA = movimientosCapitalAlCorte([cap], '2026-11-30'), mvD = movimientosCapitalAlCorte([cap], '2027-01-31');
check('F6 Ver movimientos cuadra antes (1.000.000) y después (1.050.000) del origen, y explica lo capitalizado',
  mvA.cuadra && aprox(mvA.capitalApp, 1000000) && mvD.cuadra && aprox(mvD.capitalApp, 1050000) && mvD.movimientos.some(m => /capitalizado/.test(m.tipo) && aprox(m.capital, 50000)),
  `${mvA.calculado}/${mvA.capitalApp} · ${mvD.calculado}/${mvD.capitalApp}`);

// ═══ G. HALLAZGOS DE LA 4ª REVISIÓN ═════════════════════════════════
// G1 pago y nuevo confirmado SIN mes de ingreso: no se proyecta (ni deuda nueva ni ingreso) y se avisa.
const pynSin = ren({ modalidad: 'pago_y_nuevo', confirmada: true, mes_ingreso: '', anio_ingreso: '' });
const rG1 = resumen(pynSin);
check('G1 pago y nuevo sin mes de ingreso: no proyecta cuotas nuevas ni ingreso; capital 1.000.000; aviso "mes y año de ingreso"',
  sum(rG1.f.renovaciones.total) === 0 && rG1.ing.length === 0 && aprox(rG1.e.saldoCapital, 1000000)
  && /ingreso/.test(avisosRenovacion(pynSin, HOY).incompletas[0]?.falta || ''), String(rG1.e.saldoCapital));
// G2 extensión sin mes de ingreso: el interés corre desde el vencimiento de origen (31-dic-26).
// 1.000.000 × 10% / 12 × 6 meses = 50.000 en jun-27 y otros 50.000 + capital en dic-27.
const extSin = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', mes_ingreso: '', anio_ingreso: '' });
const fG2 = flujo([extSin], 'Allegria Foods');
check('G2 extensión sin mes de ingreso: interés desde el origen → jun-27 50.000, dic-27 1.050.000',
  aprox(fG2.renovaciones.total[jun27], 50000) && aprox(fG2.renovaciones.total[dic27], 1050000), `${fG2.renovaciones.total[jun27]} / ${fG2.renovaciones.total[dic27]}`);
// …y un mes de ingreso posterior al origen (Feb-27) no deja tramos sin interés.
const extFeb = ren({ modalidad: 'extension', confirmada: true, intereses: 'pagados', mes_ingreso: 'Feb', anio_ingreso: 2027 });
check('G2b extensión con "mes de ingreso" Feb-27: igual corre desde dic-26 (jun-27 50.000)', aprox(flujo([extFeb], 'Allegria Foods').renovaciones.total[jun27], 50000));
// G3 ingreso de un pago y nuevo con mes pasado y no registrado: se avisa (no se mueve ni se da por recibido).
const pynPas = { ...base, renovaciones: [{ monto: 1000000, mes_ingreso: 'Sep', anio_ingreso: 2026, tasa_anual: 10, modalidad: 'pago_y_nuevo', confirmada: true,
  cuotas: [{ tipo: 'Capital+Interés', mes: 'Mar', anio: 2027 }] }] };
const avG3 = avisosRenovacion(pynPas, HOY);
check('G3 pago y nuevo con ingreso en sep-26 sin registrar: aviso de ingreso vencido por 1.000.000',
  avG3.ingresosVencidos.length === 1 && aprox(avG3.ingresosVencidos[0].monto, 1000000) && avG3.ingresosVencidos[0].fecha === '2026-09-01');
const pynRec = { ...pynPas, renovaciones: [{ ...pynPas.renovaciones[0], recibido: { fecha: '2026-09-05' } }] };
check('G3b registrado como recibido: sin aviso', avisosRenovacion(pynRec, HOY).ingresosVencidos.length === 0);
// G4 encadenada con capitalización en R0: al 15-oct-26 (antes del origen) el capital es 1.000.000;
// después del origen (31-ene-27) 1.050.000; Ver movimientos cuadra en las dos fechas.
const encCap = { ...base, renovaciones: [R({ intereses: 'capitalizados' }), R({ intereses: 'pagados', venc_origen_key: 'rv@R0@1',
  cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2028 }, { tipo: 'Capital+Interés', mes: 'Dic', anio: 2028 }] })] };
const eG4 = estadoCredito(encCap, HOY);
const mG4a = movimientosCapitalAlCorte([encCap], '2026-11-30'), mG4b = movimientosCapitalAlCorte([encCap], '2027-01-31');
check('G4 encadenada con capitalización: capital hoy 1.000.000 (+50.000 de interés), al 31-ene-27 1.050.000, movimientos cuadran',
  aprox(eG4.saldoCapital, 1000000) && aprox(saldoCapitalAl([encCap], '2027-01-31', HOY).capital, 1050000)
  && mG4a.cuadra && aprox(mG4a.capitalApp, 1000000) && mG4b.cuadra && aprox(mG4b.capitalApp, 1050000),
  `${eG4.saldoCapital} · ${saldoCapitalAl([encCap], '2027-01-31', HOY).capital} · ${mG4a.calculado}/${mG4a.capitalApp} · ${mG4b.calculado}/${mG4b.capitalApp}`);
// G5 no se anula un tramo parcial mientras exista un registro total vigente.
const g5a = registrarDesembolsoRecibido(bullet, { fecha: '2026-10-01', monto: 600000, tipo: 'parcial' }, 'x', HOY);
const g5b = registrarDesembolsoRecibido(g5a, { fecha: '2026-10-10', monto: 400000, tipo: 'total' }, 'x', HOY);
let g5 = null; try { anularDesembolsoRecibido(g5b, g5b.desembolso_registros[0].id, 'error', 'x'); } catch (e) { g5 = e.message; }
check('G5 anular el parcial con un total vigente se rechaza (primero el total)', !!g5 && /TOTAL/.test(g5));

// ═══ H. RENOVACIONES ANTIGUAS: CÁLCULO ANTERIOR CONSERVADO ══════════
// Hasta clasificarlas, su ingreso entra como antes: monto del registro, sin convertir y
// aunque el crédito esté anulado (defectos conocidos que el informe de impacto lista).
const antCLP = { ...base, uid: 'h-clp', moneda: 'CLP', tc_flujo: 950, renovaciones: [{ monto: 950000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 10,
  cuotas: [{ tipo: 'Capital+Interés', mes: 'Dic', anio: 2027 }] }] };
check('H1 antigua en CLP: ingreso como antes (950.000.000, sin convertir)', ingresosRenovacionFlujo(antCLP)[0].usd === 950000000 && ingresosRenovacionFlujo(antCLP)[0].antigua);
const antAnul = { ...base, uid: 'h-an', anulado: true, renovaciones: [{ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, cuotas: [] }] };
check('H2 antigua de un crédito anulado: ingreso como antes (1.000.000)', ingresosRenovacionFlujo(antAnul).length === 1 && ingresosRenovacionFlujo(antAnul)[0].usd === 1000000);
const clasCLP = { ...antCLP, renovaciones: [{ ...antCLP.renovaciones[0], modalidad: 'pago_y_nuevo', confirmada: true }] };
check('H3 al clasificarla, el ingreso se convierte con el TC (950.000.000 / 950 = 1.000.000)', aprox(ingresosRenovacionFlujo(clasCLP)[0].usd, 1000000));

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
