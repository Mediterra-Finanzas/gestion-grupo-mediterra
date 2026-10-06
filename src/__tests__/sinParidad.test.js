/* eslint-disable */
// Cuentas sin paridad: quedan visibles y el total se marca INCOMPLETO, sin cambiar
// la cifra (siguen sumando 0 hasta que se apruebe la política de TC).
import { cuentasSinParidad, textoSinParidad, toUSD } from "../FinanzasModule.jsx";

const HOY = new Date("2026-10-06T12:00:00");
const SB = {
  "Mediterra||BICE||usd": { moneda: "usd", monto: 17433, fecha: "2026-10-01", usd: 17433 },
  "Mediterra||BICE||clp": { moneda: "clp", monto: 95000000, fecha: "2026-10-01", usd: null },          // API caída al guardar
  "Mediterra||Santander||eur": { moneda: "eur", monto: 50000, fecha: "2026-10-02", usd: 0 },           // API sin EUR: se guardó 0
  "Mediterra||Chile||clp": { moneda: "clp", monto: 1000000, fecha: "2026-10-02", usd: 1081.08 },       // convertida: no aparece
  "Mediterra||Itaú||clp": { moneda: "clp", monto: 0, fecha: "2026-10-02", usd: null },                 // saldo cero: no aparece
  "Mediterra||Security||clp": { moneda: "clp", monto: 5000000, fecha: "2026-10-20", usd: null },       // fecha futura
  "Osiris||BICE||clp": { moneda: "clp", monto: 3000000, fecha: "2026-10-01", usd: null },              // otra empresa
};

test("detecta usd null y usd 0 con monto; ignora USD, convertidas, saldo 0 y otras empresas", () => {
  const l = cuentasSinParidad(SB, "Mediterra", { hoy: HOY });
  expect(l.map(c => `${c.banco}|${c.moneda}|${c.motivo}`).sort()).toEqual(["BICE|clp|sin_tc", "Santander|eur|usd_cero", "Security|clp|sin_tc"]);
});

test("excluirFuturas sigue el criterio de Flujo Empresas / Dashboard / Reporte", () => {
  const l = cuentasSinParidad(SB, "Mediterra", { excluirFuturas: true, hoy: HOY });
  expect(l.map(c => c.banco).sort()).toEqual(["BICE", "Santander"]);
});

test("texto para el Excel nombra cada cuenta y declara el total incompleto", () => {
  const t = textoSinParidad(cuentasSinParidad(SB, "Mediterra", { excluirFuturas: true, hoy: HOY }));
  expect(t).toMatch(/INCOMPLETO: 2 cuenta\(s\)/);
  expect(t).toContain("BICE CLP 95.000.000 (2026-10-01)");
  expect(t).toContain("Santander EUR 50.000 (2026-10-02)");
  expect(textoSinParidad([])).toBeNull();
});

test("toUSD: moneda que la fuente no trae → null (antes 0); con tasa, sin cambios", () => {
  const fx = { usd: 1, clp: 1 / 925.4, eur: null, pen: 1 / 3.75 };
  expect(toUSD(50000, "eur", fx)).toBeNull();
  expect(toUSD(95000000, "clp", fx)).toBeCloseTo(102658.31, 2);   // 95.000.000 / 925,40
  expect(toUSD(380000, "pen", fx)).toBeCloseTo(101333.33, 2);     // 380.000 / 3,75
  expect(toUSD(100, "usd", fx)).toBe(100);
  expect(toUSD(100, "usd", null)).toBeNull();
});
