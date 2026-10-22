/* eslint-disable */
// Tests del informe de deuda al corte — ejecutar: node src/informeDeuda.test.mjs
// Cada caso deja escrito el cálculo aritmético esperado.
import { informeDeuda, clasificacionCredito, clasificacionSugerida } from './informeDeuda.js';
import { valorizarCreditos, fraccionAnio } from './creditos.js';

let fallos = 0;
const aprox = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
function check(nombre, cond, extra = '') { console.log(`${cond ? '✓' : '✗ FALLA'}  ${nombre}${extra ? '  — ' + extra : ''}`); if (!cond) fallos++; }

// ═══ CASO 1 — Leasing BCI (calendario manual), corte 22-10-2026 ═════
// Cuotas 1 y 2 pagadas. Capital pendiente = 3.000.000 − 243.800 − 364.620,52 = 2.391.579,48
// Cuota 3 (05-11-2026) interés 204.240,89. Base 30/360: período 05-11-2025 → 05-11-2026 = 360,
// transcurridos al 22-10-2026 = 11×30 + 17 = 347 → devengado = 204.240,89 × 347/360 = 196.865,52
// Por devengar = (204.240,89 − 196.865,52) + 170.443,06 + 133.759,11 + 87.348,73 + 3.080,73 = 402.007,00
const cal = [['2024-11-05', 243800, 256200], ['2025-11-05', 364620.52, 235379.48], ['2026-11-05', 395759.11, 204240.89],
  ['2027-11-05', 429556.94, 170443.06], ['2028-11-05', 543446.89, 133759.11], ['2029-11-05', 589857.27, 87348.73], ['2029-12-05', 432959.27, 3080.73]];
const bci = { uid: 'bci', tipo_credito: 'contrato', modalidad: 'manual', empresa: 'Allegria Service', acreedor: 'BCI', moneda: 'USD',
  monto: 3000000, fecha_desembolso: '2023-11-05', tasa_anual: 8.54, base: '30360', tipo_cr: 'Leasing', control_desde: '2024-01-01',
  calendario_manual: cal.map(([fecha, capital, interes]) => ({ fecha, capital, interes, cargos: 0 })),
  pagos: [{ id: 'p1', vencKey: 'bci@2024-11-05', fecha: '2024-11-05', capital: 243800, interes: 256200 },
          { id: 'p2', vencKey: 'bci@2025-11-05', fecha: '2025-11-05', capital: 364620.52, interes: 235379.48 }],
  garantias_lista: [{ tipo: 'Aval', otorgante: 'Mediterra Holding', monto: 3000000, moneda: 'USD' }, { tipo: 'Prenda', bien: 'Línea proceso cerezas' }] };
const inf = informeDeuda([bci], '2026-10-22');
const f = inf.filas[0];
const devEsp = 204240.89 * 347 / 360;
check('Capital pendiente = 2.391.579,48', aprox(f.capital, 2391579.48), String(f.capital));
check('Devengado (30/360) = 204.240,89 × 347/360', aprox(f.devengado, devEsp), `${f.devengado} vs ${devEsp.toFixed(2)}`);
check('Saldo deuda = capital + devengado', aprox(f.saldoDeuda, 2391579.48 + devEsp));
const porDevEsp = (204240.89 - devEsp) + 170443.06 + 133759.11 + 87348.73 + 3080.73;
check('Por devengar = resto del período + intereses futuros', aprox(f.porDevengar, porDevEsp, 0.02), `${f.porDevengar} vs ${porDevEsp.toFixed(2)}`);
check('Total por pagar = capital + todos los intereses pendientes', aprox(f.totalPorPagar, 2391579.48 + 204240.89 + 170443.06 + 133759.11 + 87348.73 + 3080.73, 0.02));
check('Leasing → Estructurado (sugerida)', f.clasificacion === 'Estructurado' && f.clasificacionOrigen === 'sugerida');
check('Garantías estructuradas: aval y prenda', inf.garantias.Aval.cantidad === 1 && inf.garantias.Prenda.cantidad === 1 && inf.garantias.Aval.montos.USD === 3000000);

// Pago posterior al corte NO reduce el saldo al corte.
const inf2 = informeDeuda([{ ...bci, pagos: [...bci.pagos, { id: 'p3', vencKey: 'bci@2026-11-05', fecha: '2026-11-05', capital: 395759.11, interes: 204240.89 }] }], '2026-10-22');
check('Un pago con fecha posterior al corte no cambia el saldo al corte', aprox(inf2.filas[0].saldoDeuda, f.saldoDeuda));
// Al día del vencimiento la cuota está devengada completa.
const inf3 = informeDeuda([bci], '2026-11-05');
check('Al vencimiento (impaga): devengado = 204.240,89', aprox(inf3.filas[0].devengado, 204240.89));

// ═══ CASO 2 — Registro antiguo sin desglose ═════════════════════════
// Cuota 120.000 al 30-11-2026: va entera a "sin desglose", fuera de capital y de intereses.
const leg = { uid: 'z', empresa: 'Allegria Foods', acreedor: 'Zelun', tipo_inst: 'Privado', monto: 120000, f_venc: '2026-11-30', tipo_cr: 'Bullet', cuota: 120000, control_desde: '2026-01-01' };
const i2 = informeDeuda([leg], '2026-10-22');
check('Sin desglose aparte: 120.000, capital 0, saldo 0', i2.filas[0].sinDesglose === 120000 && i2.filas[0].capital === 0 && i2.filas[0].saldoDeuda === 0);
check('Listada en cuotas sin desglosar (no vencida)', i2.cuotasSinDesglose.length === 1 && i2.cuotasSinDesglose[0].monto === 120000 && !i2.cuotasSinDesglose[0].vencida);
check('Acreedor privado → Otros', i2.filas[0].clasificacion === 'Otros');

// Con desglose (registro por vencimiento → días reales): capital 100.000, interés 20.000,
// desembolso 30-05-2026 → período 184 días,
// transcurridos 145 → devengado = 20.000 × 145/184 = 15.760,87
const legD = { ...leg, uid: 'zd', f_inicio: '2026-05-30', desglose: { capital: 100000, interes: 20000, cargos: 0 } };
const i3 = informeDeuda([legD], '2026-10-22');
check('Con desglose: devengado lineal 20.000 × 145/184', aprox(i3.filas[0].devengado, 20000 * 145 / 184), String(i3.filas[0].devengado));
check('Con desglose: sin cuotas sin desglosar', i3.cuotasSinDesglose.length === 0);
const legSinIni = { ...legD, uid: 'zs', f_inicio: '' };
const i4 = informeDeuda([legSinIni], '2026-10-22');
check('Sin fecha de desembolso: nada devengado, aviso', i4.filas[0].devengado === 0 && i4.filas[0].porDevengar === 20000 && i4.filas[0].avisos.some(a => /desembolso/.test(a)));

// ═══ CASO 3 — Moneda y totales ═══════════════════════════════════════
// CLP sin TC → fuera de los totales en USD, listado en sinTC.
const clp = { ...legD, uid: 'clp', moneda: 'CLP', acreedor: 'Banco CLP', tipo_inst: 'Banco' };
const i5 = informeDeuda([legD, clp], '2026-10-22');
check('CLP sin TC: incompleto y fuera del total', i5.incompleto && i5.sinTC.length === 1 && i5.total.creditos === 1);
const tcData = { 'USD-CLP': [{ fecha: '2026-10-20', valor: 950, fuente: 'manual' }] };
const i6 = informeDeuda(valorizarCreditos([legD, clp], tcData, '2026-10-22'), '2026-10-22');
check('CLP con TC 950: capital USD = 100.000/950', i6.filas.find(x => x.uid === 'clp').usd.capital === Math.round(100000 / 950 * 100) / 100);
// Mismo crédito en Actual/365: 351/365 días.
const i7 = informeDeuda([{ ...bci, base: 'act365' }], '2026-10-22');
check('Act/365: devengado = 204.240,89 × 351/365', aprox(i7.filas[0].devengado, 204240.89 * 351 / 365));
check('Totales por clasificación suman el total', Math.abs(Object.values(i6.porClasificacion).reduce((s, x) => s + x.saldoDeuda, 0) - i6.total.saldoDeuda) < 0.02);

// ═══ CASO 4 — Clasificación ══════════════════════════════════════════
check('PAE → No estructurado', clasificacionSugerida({ tipo_cr: 'PAE', tipo_acreedor: 'Banco' }).valor === 'No estructurado');
check('Socio → Socios', clasificacionSugerida({ tipo_credito: 'socio' }).valor === 'Socios');
check('Cliente → Otros', clasificacionSugerida({ tipo_acreedor: 'Cliente', tipo_cr: 'PAE' }).valor === 'Otros');
check('Contrato cuota fija sin tipo → Estructurado', clasificacionSugerida({ tipo_credito: 'contrato', modalidad: 'frances' }).valor === 'Estructurado');
check('Contrato bullet sin tipo → No estructurado', clasificacionSugerida({ tipo_credito: 'contrato', modalidad: 'bullet_total' }).valor === 'No estructurado');
check('Sin tipo → sin dato', clasificacionSugerida({ tipo_inst: 'Banco' }).valor === null);
check('Elección manual prevalece', clasificacionCredito({ tipo_cr: 'PAE', clasificacion: 'Estructurado' }).origen === 'manual');
check('Anulado/eliminado no aparece', informeDeuda([{ ...legD, anulado: true }, { ...legD, uid: 'e', eliminado: true }], '2026-10-22').filas.length === 0);


// ═══ CASO 5 — Revisión independiente: renovaciones, prepagos, gracia, socio ═══
// Registro 900.000 capital + 100.000 interés, 30-06-2026 → 31-12-2026 (184 días),
// renovado por extensión a jun-2027 al 10%.
const renBase = { uid: 'r', empresa: 'Osiris', acreedor: 'Banco Ren', moneda: 'USD', monto: 900000, f_inicio: '2026-06-30', f_venc: '2026-12-31',
  cuota: 1000000, renovable: true, control_desde: '2026-06-30', desglose: { capital: 900000, interes: 100000, cargos: 0 } };
const ren = (intereses) => ({ monto: 900000, tasa_anual: 10, modalidad: 'extension', confirmada: true, intereses, venc_origen_key: 'r@2026-12-31',
  cuotas: [{ tipo: 'Capital+Interés', mes: 'Jun', anio: 2027 }] });
// Pagos: con fecha posterior al corte no reducen el capital, aunque toquen la renovación.
const rPag = { ...renBase, renovaciones: [ren('pagados')], pagos: [{ id: 'x', vencKey: 'r@2026-12-31', fecha: '2026-12-31', capital: 300000, interes: 100000 }] };
check('Renovación: capital al 31-10-2026 = 900.000 aunque haya pagos posteriores', aprox(informeDeuda([rPag], '2026-10-31').filas[0].capital, 900000), String(informeDeuda([rPag], '2026-10-31').filas[0].capital));
// Intereses "pagados": el interés de origen se devenga en su período: 100.000 × 123/184 = 66.847,83
const iPag = informeDeuda([{ ...renBase, renovaciones: [ren('pagados')] }], '2026-10-31').filas[0];
check('Renovación "pagados": devengado 100.000 × 123/184', aprox(iPag.devengado, 100000 * 123 / 184), String(iPag.devengado));
// "pendientes": el interés de origen viaja a la 1ª cuota de la renovación, pero se devenga en SU período.
const iPend = informeDeuda([{ ...renBase, renovaciones: [ren('pendientes')] }], '2026-10-31').filas[0];
check('Renovación "pendientes": devengado al 31-10-2026 = 100.000 × 123/184', aprox(iPend.devengado, 100000 * 123 / 184), String(iPend.devengado));
const iCap = informeDeuda([{ ...renBase, renovaciones: [ren('capitalizados')] }], '2026-10-31').filas[0];
check('Renovación "capitalizados": capital 900.000 y devengado 100.000 × 123/184', aprox(iCap.capital, 900000) && aprox(iCap.devengado, 100000 * 123 / 184, 0.05), `${iCap.capital} / ${iCap.devengado}`);
const iPend2 = informeDeuda([{ ...renBase, renovaciones: [ren('pendientes')] }], '2027-03-31').filas[0];
const intRen = iPend2.devengado + iPend2.porDevengar - 100000;   // interés propio de la renovación
const fr = 90 / 179;   // 31-12-2026 → 31-03-2027 = 90 días de 31-12-2026 → 28-06-2027 = 179
check('Renovación "pendientes" al 31-03-2027: 100.000 + propio × 90/179', aprox(iPend2.devengado, 100000 + intRen * fr, 0.05), `${iPend2.devengado} (propio ${intRen.toFixed(2)})`);

// Antes del desembolso no hay deuda.
const fr1 = { uid: 'f', tipo_credito: 'contrato', modalidad: 'frances', empresa: 'Osiris', acreedor: 'Banco Futuro', moneda: 'USD', monto: 1000000,
  fecha_desembolso: '2026-12-01', primer_venc: '2027-01-01', vencimiento_final: '2027-12-01', periodicidad: 1, tasa_tipo: 'fija', tasa_anual: 12, base: '30360' };
const iF = informeDeuda([fr1], '2026-10-22');
check('Corte antes del desembolso: no aparece, se informa aparte', iF.filas.length === 0 && iF.noDesembolsados.length === 1);
// Prepago con fecha posterior al corte no reduce el capital al corte.
const bi = { ...fr1, uid: 'b', modalidad: 'bullet_int', fecha_desembolso: '2026-06-01', primer_venc: '2026-07-01', vencimiento_final: '2027-06-01',
  prepagos: [{ id: 'pp', fecha: '2026-12-15', capital: 400000, modo: 'plazo' }] };
check('Prepago posterior al corte: capital 1.000.000', aprox(informeDeuda([bi], '2026-10-22').filas[0].capital, 1000000), String(informeDeuda([bi], '2026-10-22').filas[0].capital));
// Gracia total: el interés que se capitalizará después del corte NO es capital al corte.
const gr = { ...fr1, uid: 'g', fecha_desembolso: '2026-01-01', primer_venc: '2026-02-01', vencimiento_final: '2027-12-01', gracia_periodos: 6, gracia_tipo: 'total', base: 'act360' };
const iG = informeDeuda([gr], '2026-01-02').filas[0];
check('Gracia total: capital al día siguiente del desembolso = 1.000.000', aprox(iG.capital, 1000000), String(iG.capital));
check('Gracia total: devengado = 1 día de interés (1.000.000 × 12% / 360)', aprox(iG.devengado, 1000000 * 0.12 / 360, 0.05), String(iG.devengado));
// Pago parcial de interés en una cuota futura: 1ª cuota del caso 1 con 100.000 de interés pagado antes del corte.
const pp = { ...bci, pagos: [...bci.pagos, { id: 'p3', vencKey: 'bci@2026-11-05', fecha: '2026-10-01', capital: 0, interes: 100000 }] };
const iPP = informeDeuda([pp], '2026-10-22').filas[0];
check('Pago parcial de interés: devengado = 204.240,89 × 347/360 − 100.000', aprox(iPP.devengado, 204240.89 * 347 / 360 - 100000), String(iPP.devengado));
// UF: montos en moneda original con 4 decimales.
const uf = { ...legD, uid: 'uf', moneda: 'UF', monto: 1000.12345, desglose: { capital: 1000.1234, interes: 20.5678, cargos: 0 }, cuota: 1020.6912 };
check('UF con 4 decimales', informeDeuda([uf], '2026-10-22').filas[0].capital === 1000.1234);

// ═══ CASO 6 — Re-revisión: cargo único y socios con cuota menor al interés ═══
// Bullet con intereses mensuales 1.000.000 al 12% Act/360, control desde 01-10-2026, corte 22-10-2026.
// Cuota 01-10 vencida impaga: 1.000.000 × 12% × 30/360 = 10.000. Cuota 01-11: 10.333,33 × 21/31 = 7.000.
const bu = { uid: 'bu', tipo_credito: 'contrato', modalidad: 'bullet_int', empresa: 'Osiris', acreedor: 'Banco Cargo', moneda: 'USD', monto: 1000000,
  fecha_desembolso: '2026-01-01', primer_venc: '2026-02-01', vencimiento_final: '2027-01-01', periodicidad: 1, tasa_tipo: 'fija', tasa_anual: 12, base: 'act360', control_desde: '2026-10-01' };
const sinCargo = informeDeuda([bu], '2026-10-22').filas[0];
const conCargo = informeDeuda([{ ...bu, cargos_unicos: [{ fecha: '2026-10-20', monto: 500, concepto: 'Notaría' }] }], '2026-10-22').filas[0];
check('Bullet: devengado = 10.000 + 10.333,33 × 21/31 = 17.000', aprox(sinCargo.devengado, 17000), String(sinCargo.devengado));
check('Un cargo único no corta el período de interés', aprox(conCargo.devengado, 17000) && aprox(conCargo.cargosVencidos, 500), `${conCargo.devengado} / ${conCargo.cargosVencidos}`);
// Socio 100.000 al 10% efectivo, desembolso 15-01-2026. Fila 1 (15-07-2026, 181 días): interés
// 100.000 × (1,1^(181/365) − 1) = 4.839,81. Fila 2 (15-01-2027, 184 días) amortiza todo el saldo.
const int1 = 100000 * (Math.pow(1.1, 181 / 365) - 1);
const soc = (cuota1) => ({ uid: 's', tipo_credito: 'socio', empresa: 'Osiris', acreedor: 'Socio', moneda: 'USD', monto: 100000, tasa_efectiva_anual: 10,
  fecha_desembolso: '2026-01-15', control_desde: '2026-01-15',
  cuotas_socio: [{ fecha_vencimiento: '2026-07-15', modo: 'cuota', cuota_total: cuota1 },
    { fecha_vencimiento: '2027-01-15', modo: 'amortizacion', amortizacion: Math.round((100000 + int1 - cuota1) * 100) / 100 }] });
const s0a = informeDeuda([soc(0)], '2026-03-01').filas[0];
check('Socio cuota 0, corte 01-03-2026: capital 100.000, devengado 4.839,81 × 45/181', aprox(s0a.capital, 100000) && aprox(s0a.devengado, int1 * 45 / 181, 0.02), `${s0a.capital} / ${s0a.devengado}`);
const s0b = informeDeuda([soc(0)], '2026-10-15').filas[0];
const int2 = (100000 + int1) * (Math.pow(1.1, 184 / 365) - 1);
check('Socio cuota 0, corte 15-10-2026: capital 104.839,81, devengado = interés fila 2 × 92/184', aprox(s0b.capital, 100000 + int1, 0.02) && aprox(s0b.devengado, int2 * 92 / 184, 0.05), `${s0b.capital} / ${s0b.devengado} vs ${(int2 * 92 / 184).toFixed(2)}`);
// Cuota parcial de 1.000: capitalizan 3.839,81 (sin contarlos dos veces).
const s1a = informeDeuda([soc(1000)], '2026-03-01').filas[0];
check('Socio cuota parcial, corte 01-03-2026: capital 100.000', aprox(s1a.capital, 100000), String(s1a.capital));
const s1b = informeDeuda([{ ...soc(1000), pagos: [{ id: 'q', vencKey: 's@2026-07-15', fecha: '2026-07-15', capital: 0, interes: 1000 }] }], '2026-08-15').filas[0];
check('Socio cuota parcial pagada, corte 15-08-2026: capital 103.839,81 y sin interés vencido', aprox(s1b.capital, 100000 + int1 - 1000, 0.02) && s1b.devengado < int2, `${s1b.capital} / ${s1b.devengado}`);

const sPc = informeDeuda([{ ...soc(1000), control_desde: '2026-09-01' }], '2026-10-15').filas[0];
check('Socio cuota parcial por conciliar: por conciliar = 1.000 (no el interés completo)', aprox(sPc.porConciliar, 1000), String(sPc.porConciliar));
// ═══ CASO 7 — Cuadre, período de devengo y total identificado ════════
// BCI 30/360: período 05-11-2025 → 05-11-2026. Al 22-10-2026:
//   transcurrido = (2026−2025)×360 + (10−11)×30 + (22−5) = 360 − 30 + 17 = 347 · período = 360.
const qBci = f.cuotas.find(q => q.fecha === '2026-11-05');
const dv = qBci.devengo[0];
check('BCI: período 05-11-2025 → 05-11-2026, 347 de 360 días (30/360)', dv.inicio === '2025-11-05' && dv.fin === '2026-11-05' && dv.transcurrido === 347 && dv.periodo === 360 && dv.base === '30360', JSON.stringify(dv));
check('BCI: estados pagada / por vencer', f.cuotas[0].estado === 'pagada' && f.cuotas[1].estado === 'pagada' && qBci.estado === 'por_vencer');
// Act/365: 05-11-2025 → 22-10-2026 = 351 días reales de 365.
const dv365 = informeDeuda([{ ...bci, base: 'act365' }], '2026-10-22').filas[0].cuotas.find(q => q.fecha === '2026-11-05').devengo[0];
check('Act/365: 351 de 365 días reales', dv365.transcurrido === 351 && dv365.periodo === 365, JSON.stringify(dv365));
// Act/360: días reales sobre 360: 351 de 365 días reales → se muestra en días reales (351/365) con fracción 351/365.
const dv360 = informeDeuda([{ ...bci, base: 'act360' }], '2026-10-22').filas[0].cuotas.find(q => q.fecha === '2026-11-05').devengo[0];
check('Act/360: fracción = días reales / días reales del período', aprox(dv360.frac, 351 / 365, 1e-9) && dv360.transcurrido === 351 && dv360.periodo === 365, JSON.stringify(dv360));
// 30/360 con fin de mes: 31-01 → 28-02 (d1 = 30, d2 = 28) = 28 días; corte 15-02 → 15 días.
check('30/360 fin de mes: 31-01 → 15-02 = 15 días, 31-01 → 28-02 = 28 días',
  Math.round(fraccionAnio('30360', '2027-01-31', '2027-02-15') * 360) === 15 && Math.round(fraccionAnio('30360', '2027-01-31', '2027-02-28') * 360) === 28);

// Cuadre: Σ cuotas = crédito; saldo = capital + devengado + cargos vencidos; total identificado = total por pagar + sin desglosar.
const viejoPC = { uid: 'pc', empresa: 'Allegria Foods', acreedor: 'Banco Antiguo', tipo_inst: 'Banco', tipo_cr: 'PAE', monto: 40000, f_inicio: '2025-01-01', f_venc: '2025-06-30', cuota: 43828, control_desde: '2026-01-01' };
const todos = valorizarCreditos([bci, leg, legD, clp, { ...soc(1000), uid: 'sx' }, { ...renBase, uid: 'rx', renovaciones: [ren('pendientes')] }], tcData, '2026-10-22');
const I = informeDeuda(todos, '2026-10-22');
const r2t = (x) => Math.round(x * 100) / 100;
let okC = true, okU = true;
I.filas.forEach(x => {
  const S = (k) => r2t(x.cuotas.reduce((a, q) => a + q[k], 0));
  if (S('devengado') !== x.devengado || S('porDevengar') !== x.porDevengar || S('sdPend') !== x.sinDesglose
    || r2t(x.ajusteCapital.cuotas - x.ajusteCapital.interesRenovacion - x.ajusteCapital.interesACapitalizar) !== x.capital) okC = false;
  [x, x.usd].filter(Boolean).forEach(o => {
    if (r2t(o.capital + o.devengado + o.cargosVencidos) !== o.saldoDeuda || r2t(o.saldoDeuda + o.porDevengar + o.cargosFuturos) !== o.totalPorPagar
      || r2t(o.totalPorPagar + o.sinDesglose) !== o.totalIdentificado) okU = false;
  });
});
check('Cada crédito = suma de sus cuotas (moneda original)', okC);
// Detalle: Σ saldo pendiente de las cuotas confirmadas = total identificado; Σ por conciliar = por conciliar.
const escen = [I, informeDeuda([soc(1000)], '2026-03-01'), informeDeuda([{ ...soc(1000), pagos: [{ id: 'q', vencKey: 's@2026-07-15', fecha: '2026-07-15', capital: 0, interes: 1000 }] }], '2026-08-15'),
  informeDeuda([{ ...soc(1000), control_desde: '2026-09-01' }], '2026-10-15'), informeDeuda([soc(0)], '2026-10-15'), informeDeuda([gr], '2026-04-15'),
  informeDeuda([{ ...renBase, renovaciones: [ren('capitalizados')] }], '2026-10-31'), informeDeuda([viejoPC], '2026-10-22')];
const malos = [];
escen.forEach(E => E.filas.forEach(x => {
  const pend = r2t(x.cuotas.filter(q => q.estado !== 'por_conciliar').reduce((a, q) => a + q.pendiente, 0));
  if (Math.abs(pend - x.totalIdentificado) > 0.001) malos.push(`${x.uid}: Σ pendiente ${pend} vs total identificado ${x.totalIdentificado}`);
}));
check('Detalle: Σ saldo pendiente de cuotas confirmadas = total identificado del crédito', malos.length === 0, malos.join(' | '));
const sP = informeDeuda([{ ...soc(1000), pagos: [{ id: 'q', vencKey: 's@2026-07-15', fecha: '2026-07-15', capital: 0, interes: 1000 }] }], '2026-08-15').filas[0];
check('Socio cuota parcial pagada: la cuota figura pagada y el crédito al día', sP.cuotas[0].estado === 'pagada' && sP.cuotas[0].capital === 0 && sP.estadoCredito === 'al_dia', `${sP.cuotas[0].estado} / ${sP.estadoCredito}`);
check('Cuota que vence el día del corte: "vence en la fecha de corte"', informeDeuda([bci], '2026-11-05').filas[0].cuotas.find(q => q.fecha === '2026-11-05').estado === 'vence_corte');
check('Identidades exactas al centavo en moneda original y US$', okU);
const sumE = (k) => r2t(Object.values(I.porEmpresa).reduce((a, o) => a + o[k], 0));
const sumF = (k) => r2t(I.filas.filter(x => x.usd).reduce((a, x) => a + x.usd[k], 0));
check('Total = Σ empresas = Σ créditos (todas las columnas)', ['capital', 'devengado', 'saldoDeuda', 'porDevengar', 'totalPorPagar', 'sinDesglose', 'totalIdentificado', 'porConciliar']
  .every(k => sumE(k) === I.total[k] && sumF(k) === I.total[k]));
check('Total identificado = total por pagar + sin desglosar', I.total.totalIdentificado === r2t(I.total.totalPorPagar + I.total.sinDesglose));
check('Rótulo parcial con motivos (sin desglose)', I.parcial && I.motivosParcial.some(m => /sin desglosar/.test(m)));
const I2 = informeDeuda([legD, clp], '2026-10-22');
check('Conteo: 2 listados, 1 incluido, 1 sin TC', I2.conteo.listados === 2 && I2.conteo.incluidos === 1 && I2.conteo.sinTC === 1 && I2.parcial);
check('Sin desglose, por conciliar ni TC faltante → no parcial', !informeDeuda([bci], '2026-10-22').parcial);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
