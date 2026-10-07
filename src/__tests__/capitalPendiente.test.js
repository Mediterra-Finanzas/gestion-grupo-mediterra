/* eslint-disable */
// Capital pendiente de créditos: misma función para el KPI del Dashboard y "Deuda
// por Empresa" (Créditos). Estimación de caja, sin intereses; renovaciones sin duplicar.
import { capitalPendienteCreditos, CREDITOS_DEFAULT } from "../FinanzasModule.jsx";

const CORTE = "2026-10-07";

test("datos por defecto: Σ por empresa = total; consolidado + JV = total; vencidos impagos informados", () => {
  const r = capitalPendienteCreditos(CREDITOS_DEFAULT, CORTE);
  const suma = Object.values(r.porEmpresa).reduce((a, x) => a + x.capital, 0);
  expect(r.total).toBeCloseTo(suma, 6);
  expect(r.consolidado + r.fueraConsolidado).toBeCloseTo(r.total, 6);
  expect(r.empresasFuera).toEqual(["Allpa Farms"]);
  // = Σ monto de los pagos no marcados pagados (así lo calculaba "Deuda por Empresa" sin renovaciones)
  const ref = CREDITOS_DEFAULT.filter(c => !c.pagado).reduce((a, c) => a + c.monto, 0);
  expect(r.total).toBe(ref);
  console.log("[capital pendiente al " + CORTE + "]", JSON.stringify({ total: r.total, consolidado: r.consolidado, jv: r.fueraConsolidado, vencidoImpago: r.vencidoImpago }));
});

test("leasing: cuenta el capital (monto), no la cuota con intereses", () => {
  const r = capitalPendienteCreditos([{ n: 1, empresa: "Mediterra", tipo_cr: "Leasing", monto: 395759, cuota: 600000, f_venc: "2027-11-05" }], CORTE);
  expect(r.total).toBe(395759);
});

test("renovación: no se suma mientras el original sigue impago; después, monto − amortizaciones", () => {
  const base = { n: 9, empresa: "Mediterra", acreedor: "Banco R", tipo_cr: "Bullet", monto: 100000, cuota: 100000, f_venc: "2026-06-30", renovable: true,
    renovaciones: [{ monto: 100000, mes_ingreso: "Jul", anio_ingreso: 2026, tasa_anual: 0,
      cuotas: [{ mes: "Sep", anio: 2026, tipo: "Capital+Interés" }, { mes: "Mar", anio: 2027, tipo: "Capital+Interés" }] }] };
  const impago = capitalPendienteCreditos([{ ...base, pagado: false }], CORTE);
  expect(impago.total).toBe(100000);                                  // solo el original (vencido impago)
  expect(impago.porEmpresa.Mediterra).toMatchObject({ vencidoImpago: 100000, renovacionNoIniciada: 100000 });
  const pagado = capitalPendienteCreditos([{ ...base, pagado: true }], CORTE);
  expect(pagado.total).toBe(50000);                                   // 100.000 − 50.000 amortizados el 28-09-2026
});

test("socio: saldo insoluto al corte; no desembolsado → 0", () => {
  const socio = { empresa: "Mediterra", tipo_credito: "socio", monto: 200000, tasa_efectiva_anual: 0, fecha_desembolso: "2026-01-10",
    cuotas_socio: [{ fecha_vencimiento: "2026-06-30", modo: "amortizacion", amortizacion: 80000 }, { fecha_vencimiento: "2027-06-30", modo: "amortizacion", amortizacion: 120000 }] };
  expect(capitalPendienteCreditos([socio], CORTE).total).toBe(120000);   // 200.000 − 80.000
  expect(capitalPendienteCreditos([{ ...socio, fecha_desembolso: "2026-12-01" }], CORTE).total).toBe(0);
});
