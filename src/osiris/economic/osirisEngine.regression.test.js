/* eslint-disable */
// ============================================================================
// Osiris — FASE 0 — Regression / Characterization suite
// ----------------------------------------------------------------------------
// CONGELA el comportamiento ACTUAL del motor económico de Osiris. Los expected
// values fueron VERIFICADOS ejecutando las funciones reales sobre fixtures
// deterministas (ver E-golden-cases.md). NO son el comportamiento "deseado":
// son el comportamiento vigente. Si un cambio futuro rompe estos tests, es una
// alerta de que la lógica económica cambió y debe revisarse conscientemente.
//
// Importa las funciones REALES exportadas desde OsirisModule.jsx (export block
// de baseline, sin alterar la lógica).
// ============================================================================
import * as E from "../../OsirisModule.jsx";
import * as F from "./fixtures";

const ocOf = (cts, viv) => F.buildOcsByContrato(viv || [], cts, E.ocLigadaAContrato);

// ── Helpers WHT cliente ─────────────────────────────────────────────────────
describe("WHT cliente — pct() / whtLabel()", () => {
  test("Chile no retiene (factor 1.00)", () => { expect(E.pct("Chile")).toBe(1); });
  test("Perú/México retienen 15% (factor 0.85)", () => {
    expect(E.pct("Peru")).toBeCloseTo(0.85, 10);
    expect(E.pct("Mexico")).toBeCloseTo(0.85, 10);
  });
  test("país vacío/desconocido => factor 0.85 (trato como con WHT)", () => { expect(E.pct("")).toBeCloseTo(0.85, 10); });
  test("whtLabel: null Chile, 'WHT 15%' resto", () => {
    expect(E.whtLabel("Chile")).toBeNull();
    expect(E.whtLabel("Peru")).toBe("WHT 15%");
  });
});

// ── Temporadas (año agrícola Jul–Jun) ───────────────────────────────────────
describe("Temporadas", () => {
  test("temporadasEntre acota por fechaTermino (inclusive)", () => {
    expect(E.temporadasEntre("2026/2027", "2028-06-30")).toEqual(["2026/2027", "2027/2028"]);
  });
  test("temporadasEntre sin término => horizonte de 11 temporadas (a1 .. a1+10 inclusive)", () => {
    expect(E.temporadasEntre("2026/2027", "").length).toBe(11);
  });
  test("temporadaDeFecha (mes central, robusto a TZ)", () => {
    expect(E.temporadaDeFecha("2026-08-15")).toBe("2026/2027");
    expect(E.temporadaDeFecha("2026-03-15")).toBe("2025/2026");
    expect(E.temporadaDeFecha("")).toBe("");
  });
  // NOTA (hallazgo Fase 0): temporadaDeFecha es sensible a timezone en los
  // bordes (una fecha "2026-07-01" se parsea como UTC medianoche y puede caer
  // en 30-jun local). Documentado en G-risk-register. Se CONGELA, no se corrige.
});

// ── Contract Fee ────────────────────────────────────────────────────────────
describe("derivarContractFeeDesdeContratos", () => {
  const rows = E.derivarContractFeeDesdeContratos([F.CF_CHILE, F.CF_PERU, F.CF_SIN]);
  test("excluye 'Sin Contract Fee' (2 filas de 3 contratos)", () => { expect(rows.length).toBe(2); });
  test("Chile: neto == bruto, whtPct 0", () => {
    const r = rows.find(x => x.ctId === "c_cf_cl");
    expect(r.montoUSD).toBe(30000);
    expect(r.montoNeto).toBe(30000);
    expect(r.whtPct).toBe(0);
  });
  test("Perú: neto = bruto * 0.85, whtPct 15", () => {
    const r = rows.find(x => x.ctId === "c_cf_pe");
    expect(r.montoUSD).toBe(20000);
    expect(r.montoNeto).toBe(17000);
    expect(r.whtPct).toBe(15);
  });
});

// ── Royalty Planta — 3 ramas ────────────────────────────────────────────────
describe("derivarRoyaltyPlantaDesdeContratos", () => {
  test("rama legacy: cuotas 50/50 sobre plantas × US$/planta, con WHT país", () => {
    const rows = E.derivarRoyaltyPlantaDesdeContratos([F.RP_LEGACY], {});
    expect(rows.length).toBe(2);
    rows.forEach(r => {
      expect(r.nPlantas).toBe(1000);         // 2000 × 50%
      expect(r.usdPlanta).toBe(1.5);
      expect(r.pctCuota).toBe(50);
      expect(r.montoFact).toBe(1500);        // 1000 × 1.5
      expect(r.montoCobro).toBe(1275);       // 1500 × 0.85 (Perú)
      expect(r.pagado).toBe(false);
    });
  });
  test("rama facturas: agrupa OC, monto auto, pctCuota 100, pagado por estadoCF", () => {
    const rows = E.derivarRoyaltyPlantaDesdeContratos([F.RP_FACTURAS], {});
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.montoFact).toBe(1000);          // 500 plantas × US$2
    expect(r.montoCobro).toBe(1000);         // Chile, sin WHT
    expect(r.pctCuota).toBe(100);
    expect(r.pagado).toBe(true);
    expect(r.nFact).toBe("F-1");
  });
  test("rama OC-despacho: bruto = plantas despachadas × US$/planta, cobro con WHT", () => {
    const cts = [F.RP_OC];
    const rows = E.derivarRoyaltyPlantaDesdeContratos(cts, ocOf(cts, F.RP_OC_VIVEROS));
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.nPlantas).toBe(300);
    expect(r.brutoTeorico).toBe(300);        // 300 × US$1
    expect(r.montoFact).toBe(300);
    expect(r.montoCobro).toBe(255);          // 300 × 0.85 (Perú)
  });
});

// ── Royalty Comercial — legacy + cohortes + inflación + Prueba ───────────────
describe("derivarRoyaltyComercialDesdeContratos", () => {
  test("legacy: ha (excluye Prueba) × US$/ha × (1+infl)^idx por temporada, WHT país", () => {
    const rows = E.derivarRoyaltyComercialDesdeContratos([F.RC_LEGACY], {});
    expect(rows.length).toBe(2);
    const t1 = rows.find(r => r.temporada === "2026/2027");
    const t2 = rows.find(r => r.temporada === "2027/2028");
    expect(t1.haTotal).toBe(10);             // 10 comercial (5 Prueba excluidas)
    expect(t1.factorInfl).toBe(1);
    expect(t1.montoFact).toBe(10000);        // 10 × 1000 × 1
    expect(t1.montoCobro).toBe(10000);       // Chile
    expect(t2.factorInfl).toBeCloseTo(1.05, 10);
    expect(t2.montoFact).toBeCloseTo(10500, 6); // 10 × 1000 × 1.05
    expect(t2.añoCobro).toBe(2028);
  });
  test("Prueba NO genera Royalty Comercial (contribución 0 ha)", () => {
    const soloPrueba = { ...F.RC_LEGACY, plantaciones: [{ id: "p", hectareas: 8, tipoPlantacion: "Prueba" }] };
    const rows = E.derivarRoyaltyComercialDesdeContratos([soloPrueba], {});
    rows.forEach(r => expect(r.haTotal).toBe(0));
  });
  test("cohortes: inflación por cohorte, mezcla ponderada por temporada de cobro", () => {
    const rows = E.derivarRoyaltyComercialDesdeContratos([F.RC_COHORTES], {});
    expect(rows.length).toBe(2);
    const t1 = rows.find(r => r.temporada === "2026/2027");
    const t2 = rows.find(r => r.temporada === "2027/2028");
    expect(t1.montoFact).toBe(20000);        // cohorte A: 20ha × 1000 × 1.10^0
    expect(t1.haTotal).toBe(20);
    // t2: A(20×1000×1.10^1=22000) + B(10×1000×1.10^0=10000) = 32000 sobre 30 ha
    expect(t2.montoFact).toBe(32000);
    expect(t2.haTotal).toBe(30);
    expect(t2.valorPorHaInfl).toBeCloseTo(1066.6667, 3);
  });
});

// ── Total Pedidos ───────────────────────────────────────────────────────────
describe("derivarTotalPedidosDesdeContratos", () => {
  test("proyecta 1 fila por plantación, preserva estado y datos", () => {
    const rows = E.derivarTotalPedidosDesdeContratos([F.TP_CONTRATO]);
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ especie: "Cereza", nPlantas: 100, hectareas: 2, estado: "Confirmado" });
    expect(rows[1]).toMatchObject({ especie: "Arandano", estado: "Por confirmar" });
  });
});

// ── Obtentor: participación sobre BRUTO facturado ───────────────────────────
describe("calcularDeudaObtentor + calcMontoObtentor", () => {
  test("regla comodín (especie vacía) matchea; % sobre bruto; WHT del obtentor", () => {
    const r = E.calcularDeudaObtentor(F.OBT, [], F.OBT_FE, F.OBT_RP, F.OBT_RC);
    // Solo la regla contract_fee (comodín) computa: 30000 × 70% = 21000 bruto,
    // WHT 10% = 2100, neto 18900. La regla royalty_planta con especie "Cereza"
    // NO matchea porque compara contra ct.especie (inexistente) — ver hallazgo.
    expect(r.deudaBruta).toBe(21000);
    expect(r.whtTotal).toBe(2100);
    expect(r.netoAPagar).toBe(18900);
    expect(r.items.length).toBe(1);
  });
  test("HALLAZGO CONGELADO: regla scopeada por especie NO matchea sin ct.especie", () => {
    // Regla royalty_planta especie "Cereza" contra fila paga Cereza, pero sin
    // ctData que aporte ct.especie => 0 items. (Comportamiento actual, no deseado.)
    const r = E.calcularDeudaObtentor(F.OBT_SCOPED_RP, F.OBT_SCOPED_CTDATA, [], F.OBT_SCOPED_RP_ROWS, []);
    // Sin ctData: ctMap[ctId] no aporta especie => no matchea.
    const sinCt = E.calcularDeudaObtentor(F.OBT_SCOPED_RP, [], [], [{ id: "x", especie: "Cereza", montoFact: 100, pagado: true }], []);
    expect(sinCt.items.length).toBe(0);
    // CON ctData que declara ct.especie="Cereza" => sí matchea.
    expect(r.deudaBruta).toBe(1400);         // 2000 × 70%
    expect(r.items.length).toBe(1);
  });
  test("regla comodín royalty_planta suma todas las filas pagas", () => {
    const r = E.calcularDeudaObtentor(F.OBT_WILDCARD_RP, [], [], F.OBT_RP, []);
    // rp_x 1000 + rp_y 999 = 1999 × 70% = 1399.3 ; WHT 10% = 139.93
    expect(r.deudaBruta).toBeCloseTo(1399.3, 6);
    expect(r.whtTotal).toBeCloseTo(139.93, 6);
    expect(r.items.length).toBe(2);
  });
  test("calcMontoObtentor tipoCalculo usd_planta = nPlantas × valor (ignora montoFact)", () => {
    const r = E.calcularDeudaObtentor(F.OBT_PORPLANTA, [], [], F.OBT_PORPLANTA_RP, []);
    expect(r.deudaBruta).toBe(500);          // 1000 plantas × 0.5, NO 9999
  });
});

// ── Reconciliación IQ — CARACTERIZACIÓN de lógica INLINE (no exportada) ──────
// La lógica IQ vive inline en el componente ReconciliacionIQ (OsirisModule.jsx
// ~L3438: PCT_IQ=0.70, PCT_WHT=0.10; iq=montoFact×0.70; wht=iq×0.10;
// neto=iq−wht; sobre el BRUTO facturado). NO se exporta ni se toca en Fase 0.
// Este test documenta y CONGELA la aritmética esperada con un espejo local; si
// la Fase 1 extrae la función, debe reproducir exactamente estos números.
describe("Reconciliación IQ (espejo de lógica inline — congelar)", () => {
  const PCT_IQ = 0.70, PCT_WHT = 0.10;
  const iqDe = (montoFact) => {
    const iq = montoFact * PCT_IQ;
    const wht = iq * PCT_WHT;
    return { iq, wht, neto: iq - wht };
  };
  test("ejemplo canónico: factura 1000 => IQ 700 => WHT 70 => neto 630", () => {
    expect(iqDe(1000)).toEqual({ iq: 700, wht: 70, neto: 630 });
  });
  test("neto IQ = 63% del facturado", () => {
    expect(iqDe(54000).neto).toBeCloseTo(34020, 6);
  });
});
