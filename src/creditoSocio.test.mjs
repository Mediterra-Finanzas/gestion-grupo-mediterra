/* eslint-disable */
// Tests de calcularAmortizacionSocio — ejecutar: node src/creditoSocio.test.mjs
import { calcularAmortizacionSocio, diasEntreFechas, generarInteresPeriodico } from './creditoSocio.js';

let fallos = 0;
const aprox = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✓" : "✗ FALLA"}  ${nombre}${extra ? "  — " + extra : ""}`);
  if (!cond) fallos++;
}

// ── (a) 2 cuotas que cierran en cero ──────────────────────────────
// Capital 1.100.000, 12,6% EA, desembolso 2026-01-01. Dos amortizaciones
// de 550.000 → saldo final 0, suma amortizaciones = capital.
{
  const r = calcularAmortizacionSocio(1100000, 12.6, "2026-01-01", [
    { fecha_vencimiento: "2026-07-01", modo: "amortizacion", amortizacion: 550000 },
    { fecha_vencimiento: "2027-01-01", modo: "amortizacion", amortizacion: 550000 },
  ]);
  check("(a) cierra en cero", r.cierra && aprox(r.saldoFinal, 0), `saldoFinal=${r.saldoFinal}`);
  check("(a) Σ amortizaciones = capital", aprox(r.sumaAmortizaciones, 1100000), `Σ=${r.sumaAmortizaciones}`);
  // Interés cuota 1: 181 días → 1.100.000 × (1,126^(181/365) − 1)
  const iEsp1 = 1100000 * (Math.pow(1.126, 181 / 365) - 1);
  check("(a) interés cuota 1 (geométrico Actual/365)", aprox(r.filas[0].interes, iEsp1, 1), `${r.filas[0].interes} vs ${iEsp1.toFixed(2)}`);
  check("(a) 2 cuotas", r.filas.length === 2);
  console.log(`     interés total vida = ${r.totalInteres.toLocaleString("en-US")}`);
}

// ── (b) cuota insuficiente que capitaliza ─────────────────────────
// Cuota 1 total = 10.000 < interés del período → amortización negativa,
// el saldo SUBE (capitaliza) y se marca la fila.
{
  const r = calcularAmortizacionSocio(1100000, 12.6, "2026-01-01", [
    { fecha_vencimiento: "2026-07-01", modo: "cuota", cuota_total: 10000 },
    { fecha_vencimiento: "2027-01-01", modo: "cuota", cuota_total: 10000 },
  ]);
  check("(b) cuota 1 capitaliza (marca)", r.filas[0].capitaliza === true);
  check("(b) saldo sube sobre el capital", r.filas[0].saldo > 1100000, `saldo=${r.filas[0].saldo}`);
  check("(b) amortización cuota 1 negativa", r.filas[0].amortizacion < 0, `amort=${r.filas[0].amortizacion}`);
  // Interés cuota 2 se calcula sobre el saldo ya capitalizado (interés-sobre-interés)
  check("(b) interés cuota 2 > interés cuota 1 (interés sobre interés)", r.filas[1].interes > r.filas[0].interes,
    `${r.filas[1].interes} > ${r.filas[0].interes}`);
  check("(b) NO cierra en cero", r.cierra === false, `saldoFinal=${r.saldoFinal}`);
}

// ── (c) fechas irregulares ────────────────────────────────────────
// Períodos de largos distintos; el interés debe escalar con los días.
{
  check("(c) diasEntreFechas 2026-01-01→2026-04-01 = 90", diasEntreFechas("2026-01-01", "2026-04-01") === 90);
  const r = calcularAmortizacionSocio(1000000, 12.6, "2026-01-01", [
    { fecha_vencimiento: "2026-04-01", modo: "amortizacion", amortizacion: 400000 }, // 90 días
    { fecha_vencimiento: "2026-12-15", modo: "amortizacion", amortizacion: 600000 }, // 258 días
  ]);
  check("(c) período 1 = 90 días", r.filas[0].dias === 90, `dias=${r.filas[0].dias}`);
  check("(c) período 2 = 258 días", r.filas[1].dias === 258, `dias=${r.filas[1].dias}`);
  const iEsp1 = 1000000 * (Math.pow(1.126, 90 / 365) - 1);
  const iEsp2 = 600000 * (Math.pow(1.126, 258 / 365) - 1); // saldo tras amortizar 400k = 600k
  check("(c) interés período 1 exacto", aprox(r.filas[0].interes, iEsp1, 1), `${r.filas[0].interes} vs ${iEsp1.toFixed(2)}`);
  check("(c) interés período 2 exacto (sobre saldo 600k, 258 días)", aprox(r.filas[1].interes, iEsp2, 1), `${r.filas[1].interes} vs ${iEsp2.toFixed(2)}`);
  check("(c) cierra en cero", r.cierra, `saldoFinal=${r.saldoFinal}`);
}

// ── (d) interés aplazado + trimestral + amortización al final ─────
// Desembolso 2026-08-30. Primer pago de INTERÉS aplazado a 2027-01-30, luego
// trimestral hasta la amortización de 2028-01-30 (2 cuotas de 550.000).
{
  const desembolso = "2026-08-30";
  const gen = generarInteresPeriodico("2027-01-30", "2028-01-30", 3); // 2027: Ene, Abr, Jul, Oct
  check("(d) genera 4 cuotas de interés trimestral", gen.length === 4, `n=${gen.length}`);
  check("(d) todas modo 'interes'", gen.every(c => c.modo === "interes"));
  check("(d) primer pago aplazado a 2027-01-30", gen[0].fecha_vencimiento === "2027-01-30");
  const cuotas = [
    ...gen,
    { fecha_vencimiento: "2028-01-30", modo: "amortizacion", amortizacion: 550000 },
    { fecha_vencimiento: "2029-01-30", modo: "amortizacion", amortizacion: 550000 },
  ];
  const r = calcularAmortizacionSocio(1100000, 12.6, desembolso, cuotas);
  // El primer pago de interés cubre ~5 meses (Ago-26→Ene-27): capital NO baja.
  check("(d) primera cuota solo interés no amortiza", r.filas[0].amortizacion === 0 && r.filas[0].cuota_total > 0,
    `amort=${r.filas[0].amortizacion} cuota=${r.filas[0].cuota_total}`);
  check("(d) saldo tras interés trimestral sigue = capital", r.filas[3].saldo === 1100000, `saldo=${r.filas[3].saldo}`);
  check("(d) cierra en cero", r.cierra, `saldoFinal=${r.saldoFinal}`);
  // Con interés pagado trimestral, la cuota de amortización ya NO carga 3 años de interés:
  const cuotaAmort1 = r.filas[4];
  check("(d) cuota amortización 1 ≈ 550.000 + interés de 1 trimestre (no de años)",
    cuotaAmort1.cuota_total < 600000, `cuota=${cuotaAmort1.cuota_total}`);
  console.log(`     interés total (pagado en el camino) = ${r.totalInteres.toLocaleString("en-US")}`);
}

console.log(fallos === 0 ? "\nTODOS LOS TESTS PASARON ✓" : `\n${fallos} TEST(S) FALLARON ✗`);
process.exit(fallos === 0 ? 0 : 1);
