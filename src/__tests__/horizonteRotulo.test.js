/* eslint-disable */
// El rótulo del horizonte sale de la serie real (antes decía "64 meses" a mano).
// La deuda Q1-26 de CREDITOS_TRIM es histórica y estática: este test documenta
// cuánto se aleja de lo que da Créditos con los datos por defecto del repo.
import { rotuloHorizonte, MESES_INFO, generarMeses } from "../horizonte.js";
import { saldoCreditoAt, CREDITOS_DEFAULT } from "../FinanzasModule.jsx";

test("rótulo derivado de la serie: Apr-2026 → Jun-2031 · 63 meses", () => {
  expect(MESES_INFO).toHaveLength(63);
  expect(rotuloHorizonte()).toBe("Apr-2026 → Jun-2031 · 63 meses");
  expect(rotuloHorizonte(generarMeses().slice(0, 12))).toBe("Apr-2026 → Mar-2027 · 12 meses");
});

test("deuda calculada desde Créditos (datos por defecto) — referencia para la propuesta", () => {
  const al = (iso) => CREDITOS_DEFAULT.reduce((s, c) => s + saldoCreditoAt(c, iso), 0);
  const r = { "2026-03-31": Math.round(al("2026-03-31")), "2026-10-31": Math.round(al("2026-10-31")) };
  console.log("[deuda calculada, CREDITOS_DEFAULT]", JSON.stringify(r), "vs estático Q1-26 8355763");
  expect(r["2026-03-31"]).toBeGreaterThan(0);
});
