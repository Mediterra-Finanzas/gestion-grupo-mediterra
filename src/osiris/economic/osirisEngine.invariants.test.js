/* eslint-disable */
// ============================================================================
// Osiris — FASE 0 — Tests de INVARIANTES del motor económico.
// Propiedades que deben mantenerse en el comportamiento ACTUAL. Ajustados a lo
// que el código realmente hace hoy (no a un ideal).
// ============================================================================
import * as E from "../../OsirisModule.jsx";
import * as F from "./fixtures";

const ocOf = (cts, viv) => F.buildOcsByContrato(viv || [], cts, E.ocLigadaAContrato);

// Un universo de derivaciones para chequear invariantes transversales.
function allDerived() {
  const cf = E.derivarContractFeeDesdeContratos([F.CF_CHILE, F.CF_PERU, F.CF_SIN]);
  const rpLeg = E.derivarRoyaltyPlantaDesdeContratos([F.RP_LEGACY], {});
  const rpFac = E.derivarRoyaltyPlantaDesdeContratos([F.RP_FACTURAS], {});
  const rpOc = E.derivarRoyaltyPlantaDesdeContratos([F.RP_OC], ocOf([F.RP_OC], F.RP_OC_VIVEROS));
  const rcLeg = E.derivarRoyaltyComercialDesdeContratos([F.RC_LEGACY], {});
  const rcCoh = E.derivarRoyaltyComercialDesdeContratos([F.RC_COHORTES], {});
  const tp = E.derivarTotalPedidosDesdeContratos([F.TP_CONTRATO]);
  return { cf, rp: [...rpLeg, ...rpFac, ...rpOc], rc: [...rcLeg, ...rcCoh], tp };
}

const numeric = (rows, fields) => rows.flatMap(r => fields.map(f => r[f]));

test("ningún monto/cantidad es NaN", () => {
  const { cf, rp, rc, tp } = allDerived();
  numeric(cf, ["montoUSD", "montoNeto", "whtPct"]).forEach(v => expect(Number.isNaN(v)).toBe(false));
  numeric(rp, ["montoFact", "montoCobro", "nPlantas", "pctCuota"]).forEach(v => expect(Number.isNaN(v)).toBe(false));
  numeric(rc, ["montoFact", "montoCobro", "haTotal", "factorInfl"]).forEach(v => expect(Number.isNaN(v)).toBe(false));
  numeric(tp, ["nPlantas", "hectareas"]).forEach(v => expect(Number.isNaN(v)).toBe(false));
});

test("ninguna cantidad de plantas/ha derivada es negativa", () => {
  const { rp, rc, tp } = allDerived();
  rp.forEach(r => expect(r.nPlantas).toBeGreaterThanOrEqual(0));
  rc.forEach(r => expect(r.haTotal).toBeGreaterThanOrEqual(0));
  tp.forEach(r => { expect(r.nPlantas).toBeGreaterThanOrEqual(0); expect(r.hectareas).toBeGreaterThanOrEqual(0); });
});

test("montoCobro = montoFact × pct(pais) (WHT cliente reproducible)", () => {
  const { rp, rc } = allDerived();
  [...rp, ...rc].forEach(r => {
    const esperado = r.montoFact * E.pct(r.pais);
    expect(r.montoCobro).toBeCloseTo(esperado, 6);
  });
});

test("IDs derivados son únicos dentro de cada colección (no duplica registros)", () => {
  const { cf, rp, rc, tp } = allDerived();
  for (const rows of [cf, rp, rc, tp]) {
    const ids = rows.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  }
});

test("inflación RC: factor no decrece con las temporadas (por cohorte base)", () => {
  const rows = E.derivarRoyaltyComercialDesdeContratos([F.RC_LEGACY], {})
    .sort((a, b) => a.temporada.localeCompare(b.temporada));
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].factorInfl).toBeGreaterThanOrEqual(rows[i - 1].factorInfl);
  }
});

test("Trial/Prueba no aporta hectáreas cobrables al RC", () => {
  const soloPrueba = { ...F.RC_LEGACY, plantaciones: [{ id: "p", hectareas: 99, tipoPlantacion: "Prueba" }] };
  E.derivarRoyaltyComercialDesdeContratos([soloPrueba], {}).forEach(r => expect(r.haTotal).toBe(0));
});

test("obtentor: neto = bruto − WHT, y bruto ≥ neto siempre", () => {
  const r = E.calcularDeudaObtentor(F.OBT, [], F.OBT_FE, F.OBT_RP, F.OBT_RC);
  expect(r.netoAPagar).toBeCloseTo(r.deudaBruta - r.whtTotal, 6);
  expect(r.deudaBruta).toBeGreaterThanOrEqual(r.netoAPagar);
});

test("pureza: llamar dos veces produce el mismo resultado (sin efectos)", () => {
  const a = JSON.stringify(E.derivarRoyaltyComercialDesdeContratos([F.RC_COHORTES], {}));
  const b = JSON.stringify(E.derivarRoyaltyComercialDesdeContratos([F.RC_COHORTES], {}));
  expect(a).toBe(b);
});

test("las derivaciones NO mutan el contrato de entrada", () => {
  const ct = JSON.parse(JSON.stringify(F.RC_LEGACY));
  const antes = JSON.stringify(ct);
  E.derivarRoyaltyComercialDesdeContratos([ct], {});
  E.derivarRoyaltyPlantaDesdeContratos([ct], {});
  E.derivarTotalPedidosDesdeContratos([ct]);
  expect(JSON.stringify(ct)).toBe(antes);
});
