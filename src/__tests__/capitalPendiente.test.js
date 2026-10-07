/* eslint-disable */
// Capital por vencer de créditos (KPI Dashboard / Créditos): estimación de caja, sin
// intereses; lo vencido sin pago registrado y las renovaciones con el original impago
// quedan POR CONCILIAR (no suman); nada se marca pagado automáticamente.
import { capitalPendienteCreditos, verificarLeasing, CREDITOS_DEFAULT } from "../FinanzasModule.jsx";

const CORTE = "2026-10-07";

test("datos por defecto: por vencer + por conciliar = Σ monto impago; perímetro y JV", () => {
  const r = capitalPendienteCreditos(CREDITOS_DEFAULT, CORTE);
  const impago = CREDITOS_DEFAULT.filter(c => !c.pagado).reduce((a, c) => a + c.monto, 0);
  expect(r.total + r.vencidoImpago).toBe(impago);                                // 7.776.346
  expect(r.consolidado + r.fueraConsolidado).toBeCloseTo(r.total, 6);
  expect(r.empresasFuera).toEqual(["Allpa Farms"]);
  console.log("[capital al " + CORTE + "]", JSON.stringify({ porVencer: r.total, consolidado: r.consolidado, jv: r.fueraConsolidado, porConciliar: r.vencidoImpago }));
});

test("leasing: la tasa implícita confirma monto = capital (datos del repositorio)", () => {
  const l = verificarLeasing(CREDITOS_DEFAULT);
  expect(l).toHaveLength(1);
  expect(l[0]).toMatchObject({ empresa: "Allegria Service", acreedor: "BCI", tasaDeclarada: 8.5, consistente: true });
  expect(l[0].tasasImplicitas).toEqual([8.54, 8.54, 8.54, 8.54, 8.54]);   // el 5.º pago es 1 mes después: 3.081 / 432.959 × 12
  // si monto fuera la cuota completa, la verificación lo detecta
  const malo = verificarLeasing([{ empresa: "X", acreedor: "B", tipo_cr: "Leasing", tasa: "8.5%", monto: 600000, cuota: 600000, f_venc: "2026-11-05" },
                                 { empresa: "X", acreedor: "B", tipo_cr: "Leasing", tasa: "8.5%", monto: 600000, cuota: 600000, f_venc: "2027-11-05" }]);
  expect(malo[0].consistente).toBe(false);
});

describe("estados desactualizados", () => {
  const base = { n: 9, empresa: "Mediterra", acreedor: "Banco R", tipo_cr: "Bullet", monto: 100000, cuota: 100000, f_venc: "2026-06-30", renovable: true,
    renovaciones: [{ monto: 100000, mes_ingreso: "Jul", anio_ingreso: 2026, tasa_anual: 0,
      cuotas: [{ mes: "Sep", anio: 2026, tipo: "Capital+Interés" }, { mes: "Mar", anio: 2027, tipo: "Capital+Interés" }] }] };
  test("original vencido sin marcar pagado + renovación ya recibida: nada suma, todo por conciliar", () => {
    const r = capitalPendienteCreditos([{ ...base, pagado: false }], CORTE);
    expect(r.total).toBe(0);
    expect(r.porEmpresa.Mediterra).toMatchObject({ vencidoImpago: 100000, renovacionConOriginalImpago: 50000 });
    expect(r.porConciliarConsolidado).toBe(150000);
  });
  test("original pagado: cuenta la renovación menos lo amortizado (sin duplicar)", () => {
    const r = capitalPendienteCreditos([{ ...base, pagado: true }], CORTE);
    expect(r.total).toBe(50000);
    expect(r.porConciliarConsolidado).toBe(0);
  });
  test("marcado pagado ANTES de vencer: no suma y se informa", () => {
    const r = capitalPendienteCreditos([{ empresa: "Mediterra", tipo_cr: "Bullet", monto: 70000, cuota: 70000, f_venc: "2027-03-01", pagado: true }], CORTE);
    expect(r.total).toBe(0);
    expect(r.porEmpresa.Mediterra).toMatchObject({ pagadoAntesDeVencer: 70000, nPagadoAntes: 1 });
  });
  test("leasing: cuenta el capital (monto), no la cuota con intereses", () => {
    expect(capitalPendienteCreditos([{ empresa: "Mediterra", tipo_cr: "Leasing", monto: 395759, cuota: 600000, f_venc: "2027-11-05" }], CORTE).total).toBe(395759);
  });
  test("socio: saldo insoluto al corte; no desembolsado → 0", () => {
    const socio = { empresa: "Mediterra", tipo_credito: "socio", monto: 200000, tasa_efectiva_anual: 0, fecha_desembolso: "2026-01-10",
      cuotas_socio: [{ fecha_vencimiento: "2026-06-30", modo: "amortizacion", amortizacion: 80000 }, { fecha_vencimiento: "2027-06-30", modo: "amortizacion", amortizacion: 120000 }] };
    expect(capitalPendienteCreditos([socio], CORTE).total).toBe(120000);
    expect(capitalPendienteCreditos([{ ...socio, fecha_desembolso: "2026-12-01" }], CORTE).total).toBe(0);
  });
});
