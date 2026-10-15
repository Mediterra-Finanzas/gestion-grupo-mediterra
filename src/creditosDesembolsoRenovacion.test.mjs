/* eslint-disable */
// Desembolso recibido y renovaciones con modalidad — node src/creditosDesembolsoRenovacion.test.mjs
// Cada caso deja escrito el cálculo esperado. Fecha de referencia fija: 15-oct-2026.
import {
  calendarioContrato, estadoCredito, flujoCreditosEmpresa, registrarPago, saldoCapitalAl,
  registrarDesembolsoRecibido, anularDesembolsoRecibido, estadoDesembolso, desembolsoRecibido,
  ingresosRenovacion, avisosRenovacion, calcCuotasRenovacion, getRenovaciones,
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
const rec = registrarDesembolsoRecibido(bullet, { fecha: '2026-10-10', monto: 998500, nota: 'cartola BCI 10-10' }, 'Angelo');
const f1 = flujo([rec], 'Mediterra');
const e0 = estadoCredito(bullet, HOY), e1 = estadoCredito(rec, HOY);
check('A2: con fondos recibidos NO se proyecta ningún ingreso (ni en nov-26 ni en otro mes)', sum(f1.ingresos.total) === 0);
check('A3: el calendario de pago sigue igual: 1.040.000 en abr-27', aprox(f1.prestamos.total[iM(2027, 4)], 1040000) && aprox(f0.prestamos.total[iM(2027, 4)], f1.prestamos.total[iM(2027, 4)]));
check('A4: capital pendiente sin cambio (1.000.000) e intereses 40.000', aprox(e1.saldoCapital, 1000000) && aprox(e1.interesPend, 40000) && e1.saldoCapital === e0.saldoCapital);
check('A5: ninguna cuota pagada y ningún pago registrado', e1.vencimientos.every(v => v.estado === 'pendiente') && (rec.pagos || []).length === 0);
const ed = estadoDesembolso(rec, HOY);
check('A6: estado = recibido, monto recibido 998.500, diferencia vs capital −1.500', ed.estado === 'recibido' && ed.recibido.monto === 998500 && aprox(ed.diferencia, -1500));
check('A7: queda en el historial', rec.historial.some(h => h.accion === 'desembolso_recibido'));
let dup = null; try { registrarDesembolsoRecibido(rec, { fecha: '2026-10-11', monto: 1 }, 'x'); } catch (e) { dup = e.message; }
check('A8: no se puede registrar dos veces (anular y registrar el correcto)', !!dup);
const anul = anularDesembolsoRecibido(rec, desembolsoRecibido(rec).id, 'era otro crédito', 'Angelo');
check('A9: anular con motivo devuelve el ingreso proyectado y conserva el registro anulado',
  aprox(flujo([anul], 'Mediterra').ingresos.total[iM(2026, 11)], 1000000) && anul.desembolso_registros[0].anulado === true);
let sinMotivo = null; try { anularDesembolsoRecibido(rec, desembolsoRecibido(rec).id, '', 'x'); } catch (e) { sinMotivo = e.message; }
check('A10: anular sin motivo se rechaza', !!sinMotivo);
// Pendiente con fecha pasada: no se mueve, se informa.
const viejo = { ...bullet, uid: 'bv', fecha_desembolso: '2026-10-01' };
const fv = flujo([viejo], 'Mediterra');
check('A11: desembolso pendiente con fecha pasada se informa (no se da por recibido ni se mueve)',
  fv.desembolsosPendientesVencidos.length === 1 && aprox(fv.ingresos.total[iM(2026, 10)], 1000000) && estadoDesembolso(viejo, HOY).estado === 'pendiente_vencido');

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
const r1 = resumen(ren({ modalidad: 'extension', confirmada: true }));
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
const r3 = resumen(ren({ monto: 600000, modalidad: 'parcial', confirmada: true }));
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
const r7 = resumen(ren({ monto: 1200000, modalidad: 'extension', confirmada: true }));
// La extensión traslada CAPITAL (o lo sin desglose), nunca el interés del vencimiento original.
check('B7 exceso: se traslada el capital que vencía (1.000.000), el interés 50.000 sigue en caja y se informa el exceso de 200.000',
  aprox(r7.vo.renovado, 1000000) && aprox(r7.vo.renovadoExceso, 200000) && aprox(r7.vo.pendienteTotal, 50000));

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
