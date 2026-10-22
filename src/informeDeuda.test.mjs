/* eslint-disable */
// Tests del informe de deuda al corte — ejecutar: node src/informeDeuda.test.mjs
// Cada caso deja escrito el cálculo aritmético esperado.
import { informeDeuda, clasificacionCredito, clasificacionSugerida } from './informeDeuda.js';
import { valorizarCreditos } from './creditos.js';

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

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
