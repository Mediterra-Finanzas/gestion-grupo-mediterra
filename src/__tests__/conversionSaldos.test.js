/* eslint-disable */
// Política maestro_tc_v1 en datos AISLADOS (sin red ni Supabase).
import { cotizacionSaldo, convertirSaldoNuevo, leerUsdSaldo, diasHabilesEntre, totalSaldosUSD, textoConversionSaldos, saldosVigentes } from "../tc/conversionSaldos.js";

const TC = {
  "USD-CLP": [{ fecha: "2026-09-11", valor: 930.10, fuente: "mindicador" }, { fecha: "2026-09-15", valor: 925.40, fuente: "mindicador" }],
  "EUR-USD": [{ fecha: "2026-09-15", valor: 1.085, fuente: "frankfurter" }],
  "USD-EUR": [{ fecha: "2026-09-15", valor: 0.9, fuente: "frankfurter" }],
  "USD-PEN": [{ fecha: "2026-09-14", valor: 3.75, fuente: "manual" }, { fecha: "2026-09-15", valor: 3.70, fuente: "frankfurter" }],
};

test("días hábiles: fin de semana no cuenta", () => {
  expect(diasHabilesEntre("2026-09-11", "2026-09-14")).toBe(1);   // vie → lun
  expect(diasHabilesEntre("2026-09-15", "2026-09-15")).toBe(0);
  expect(diasHabilesEntre("2026-09-07", "2026-09-15")).toBe(6);
});

test("TC del día del saldo; si no hay, el último anterior (≤ 5 días hábiles)", () => {
  expect(cotizacionSaldo("clp", "2026-09-15", TC)).toMatchObject({ ok: true, tc: 925.40, fechaTC: "2026-09-15", fuente: "mindicador", diasHabiles: 0 });
  expect(cotizacionSaldo("clp", "2026-09-13", TC)).toMatchObject({ ok: true, tc: 930.10, fechaTC: "2026-09-11", diasHabiles: 0 });  // domingo → viernes
  expect(cotizacionSaldo("clp", "2026-09-22", TC)).toMatchObject({ ok: true, tc: 925.40, diasHabiles: 5 });
  const vencido = cotizacionSaldo("clp", "2026-09-23", TC);
  expect(vencido.ok).toBe(false);
  expect(vencido.motivo).toMatch(/2026-09-15 \(6 días hábiles antes; máximo 5\)/);
});

test("conversión y aritmética (ejemplos del documento de política)", () => {
  expect(convertirSaldoNuevo(95000000, "clp", "2026-09-15", TC)).toMatchObject({ usd: 102658.31, tc: 925.40, tcPar: "USD-CLP", tcFecha: "2026-09-15", tcFuente: "mindicador", tcPolitica: "maestro_tc_v1" }); // 95.000.000 / 925,40
  expect(convertirSaldoNuevo(50000, "eur", "2026-09-15", TC)).toMatchObject({ usd: 54250, tcPar: "EUR-USD" });            // 50.000 × 1,085 (EUR-USD manda sobre USD-EUR)
  expect(convertirSaldoNuevo(380000, "pen", "2026-09-15", TC)).toMatchObject({ usd: 101333.33, tc: 3.75, tcFuente: "manual", tcFecha: "2026-09-14" }); // 380.000 / 3,75; el 3,70 de frankfurter NO se usa
});

test("sin cotización: usd null y motivo, nunca 0 ni TC fijo", () => {
  const r = convertirSaldoNuevo(1000, "pen", "2026-09-30", TC);
  expect(r).toMatchObject({ usd: null, tcEstado: "sin_tc" });
  expect(r.tcMotivo).toMatch(/USD-PEN/);
  expect(convertirSaldoNuevo(1000, "clp", "2026-09-15", null).tcMotivo).toBe("maestro_tc no disponible");
  expect(convertirSaldoNuevo(1000, "gbp", "2026-09-15", TC).tcMotivo).toMatch(/sin regla/);
});

test("lectura: nuevo vs histórico vs sin paridad", () => {
  const nuevo = { moneda: "clp", monto: 95000000, fecha: "2026-09-15", ...convertirSaldoNuevo(95000000, "clp", "2026-09-15", TC) };
  expect(leerUsdSaldo(nuevo, "clp")).toMatchObject({ usd: 102658.31, estado: "politica" });
  expect(leerUsdSaldo(nuevo, "clp").etiqueta).toBe("TC 925,4 USD-CLP al 2026-09-15 · mindicador");
  expect(leerUsdSaldo({ moneda: "clp", monto: 50000000, usd: 52083.33 }, "clp")).toMatchObject({ usd: 52083.33, estado: "historico" }); // se respeta, no se recalcula
  expect(leerUsdSaldo({ moneda: "clp", monto: 95000000, usd: null }, "clp")).toMatchObject({ usd: null, estado: "sin_paridad" });
  expect(leerUsdSaldo({ moneda: "eur", monto: 50000, usd: 0 }, "eur")).toMatchObject({ usd: null, estado: "sin_paridad" });
  expect(leerUsdSaldo({ moneda: "usd", monto: 17433 }, "usd")).toMatchObject({ usd: 17433, estado: "usd" });
});

test("total por empresa = Σ cuentas vigentes; detalle para pantalla y Excel", () => {
  const SB = {
    "A||BICE||usd": { moneda: "usd", monto: 17433, fecha: "2026-09-15" },
    "A||BICE||clp": { moneda: "clp", monto: 95000000, fecha: "2026-09-15", ...convertirSaldoNuevo(95000000, "clp", "2026-09-15", TC) },
    "A||Itaú||clp": { moneda: "clp", monto: 50000000, fecha: "2026-09-15", usd: 52083.33 },
    "A||Santander||eur": { moneda: "eur", monto: 50000, fecha: "2026-09-15", usd: 0 },
  };
  const t = totalSaldosUSD(SB, "A");
  expect(t.total).toBeCloseTo(17433 + 102658.31 + 52083.33, 2);   // 172.174,64; EUR sin paridad no suma
  expect(t.sinParidad.map(c => c.banco)).toEqual(["Santander"]);
  const txt = textoConversionSaldos(t.cuentas);
  expect(txt).toContain("BICE CLP 95.000.000 al 2026-09-15 → US$ 102.658,31 · TC 925,4 USD-CLP al 2026-09-15 · mindicador");
  expect(txt).toContain("Itaú CLP 50.000.000 al 2026-09-15 → US$ 52.083,33 · TC histórico");
  expect(txt).toContain("Santander EUR 50.000 al 2026-09-15 → SIN PARIDAD");
});

test("saldo vigente: fecha local, futuras excluidas si se pide, 'antesDe' estricto", () => {
  const SB = { "A||B||clp": { moneda: "clp", monto: 1, fecha: "2026-10-08", usd: 1 } };
  expect(saldosVigentes(SB, "A", { excluirFuturas: true, hoy: new Date(2026, 9, 7) })).toHaveLength(0);
  expect(saldosVigentes(SB, "A", { excluirFuturas: true, hoy: new Date(2026, 9, 8, 23) })).toHaveLength(1);
  expect(saldosVigentes(SB, "A", { antesDe: new Date(2026, 9, 8) })).toHaveLength(0);
});
