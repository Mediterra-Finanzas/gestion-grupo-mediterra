/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// CRÉDITO DE SOCIO — tabla de amortización con interés efectivo anual
// geométrico (devengo compuesto) sobre saldo insoluto, base Actual/365.
//
//   interes_periodo = saldo_anterior × [ (1 + tasa/100)^(dias/365) − 1 ]
//   dias = días reales entre el vencimiento anterior (o el desembolso) y
//          el vencimiento de este período.
//
// El interés se paga íntegro con cada cuota → el saldo baja solo por
// amortización. Si una cuota NO cubre el interés, la amortización sale
// negativa y el saldo SUBE (el interés no cubierto se capitaliza y opera
// interés-sobre-interés) → se marca `capitaliza:true`.
//
// Cada cuota puede definirse de dos modos:
//   modo:"cuota"        → das la cuota total; amortización = cuota − interés
//   modo:"amortizacion" → das la amortización; cuota total = amort + interés
// ═══════════════════════════════════════════════════════════════════

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// Suma meses a una fecha ISO ("YYYY-MM-DD") en UTC → ISO.
export function addMesesISO(iso, meses) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

// Genera cuotas "solo interés" cada `pasoMeses` (default 3 = trimestral),
// empezando EN `fechaInicio` (el primer pago de interés, que puedes aplazar)
// y hasta `fechaHasta` (exclusivo, típicamente la 1ª cuota de amortización).
export function generarInteresPeriodico(fechaInicio, fechaHasta, pasoMeses = 3) {
  const out = [];
  if (!fechaInicio || !fechaHasta) return out;
  let f = fechaInicio;
  while (f && f < fechaHasta) {
    out.push({ fecha_vencimiento: f, modo: "interes", cuota_total: "", amortizacion: "" });
    f = addMesesISO(f, pasoMeses);
  }
  return out;
}

// Días reales entre dos fechas ISO ("YYYY-MM-DD"), Actual/365.
export function diasEntreFechas(fDesde, fHasta) {
  if (!fDesde || !fHasta) return 0;
  const a = new Date(fDesde), b = new Date(fHasta);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// cuotas: [{ fecha_vencimiento, modo:"cuota"|"amortizacion", cuota_total, amortizacion }]
// Devuelve { filas, totalInteres, sumaAmortizaciones, saldoFinal, cierra, capital }.
export function calcularAmortizacionSocio(capital, tasaEfectivaAnual, fechaDesembolso, cuotas) {
  const cap = Number(capital) || 0;
  const factor = 1 + (Number(tasaEfectivaAnual) || 0) / 100;
  let saldo = cap;                 // saldo insoluto (precisión completa)
  let fechaPrev = fechaDesembolso; // ancla del primer período
  let totalInteres = 0;

  const filas = (cuotas || []).map((cu, i) => {
    const fecha = cu.fecha_vencimiento || "";
    const dias = diasEntreFechas(fechaPrev, fecha);
    const interes = saldo * (Math.pow(factor, dias / 365) - 1);
    let cuotaTotal, amort;
    const modo = cu.modo || "cuota";
    if (modo === "amortizacion") {
      amort = Number(cu.amortizacion) || 0;
      cuotaTotal = amort + interes;
    } else if (modo === "interes") {
      // Solo interés: paga exactamente el interés del período; el capital no baja.
      amort = 0;
      cuotaTotal = interes;
    } else {
      cuotaTotal = Number(cu.cuota_total) || 0;
      amort = cuotaTotal - interes;      // si cuota < interés → amort < 0 (capitaliza)
    }
    saldo = saldo - amort;               // amort negativa ⇒ saldo sube
    totalInteres += interes;
    fechaPrev = fecha;
    return {
      n: i + 1,
      fecha,
      dias,
      interes: round2(interes),
      amortizacion: round2(amort),
      cuota_total: round2(cuotaTotal),
      saldo: round2(saldo),
      capitaliza: amort < -0.005,        // el interés no fue cubierto por la cuota
    };
  });

  const saldoFinal = round2(saldo);
  return {
    filas,
    capital: cap,
    totalInteres: round2(totalInteres),
    sumaAmortizaciones: round2(cap - saldo),   // = Σ amortizaciones (precisión completa)
    saldoFinal,
    cierra: Math.abs(saldo) <= 0.01,           // saldo final ≈ 0 (tolerancia ±0,01)
  };
}
