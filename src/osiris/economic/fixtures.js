/* eslint-disable */
// Osiris Fase 0 — Fixtures SINTÉTICAS y deterministas para tests de regresión.
// NO contienen data productiva real (no son clientes/contratos reales).
// Todas las fechas son explícitas para que los resultados NO dependan de la
// fecha de ejecución. Ver docs/osiris-fase0/E-golden-cases.md.

// Agrupa OCs de vivero por contrato replicando la lógica del componente
// (useMemo ocsByContrato, OsirisModule.jsx ~L10272), usando ocLigadaAContrato.
export function buildOcsByContrato(viveros, contratos, ocLigadaAContrato) {
  const todas = [];
  (viveros || []).forEach(v => (v.ordenesCompra || []).forEach(oc => todas.push({ ...oc, _viveroId: v.id, _viverista: v.viverista })));
  const map = {};
  (contratos || []).forEach(ct => {
    const ocs = todas.filter(oc => ocLigadaAContrato(oc, ct));
    if (ocs.length) map[ct.id] = ocs;
  });
  return map;
}

// ── Contract Fee ──────────────────────────────────────────────
export const CF_CHILE = {
  id: "c_cf_cl", razonSocial: "Cli CF Chile", pais: "Chile",
  tipoContractFee: "Sin Devolución", montoContractFee: 30000, fechaContrato: "2026-01-15",
};
export const CF_PERU = {
  id: "c_cf_pe", razonSocial: "Cli CF Peru", pais: "Peru",
  tipoContractFee: "Con Devolución", montoContractFee: 20000, fechaContrato: "2026-02-01",
};
export const CF_SIN = {
  id: "c_cf_no", razonSocial: "Cli Sin CF", pais: "Chile",
  tipoContractFee: "Sin Contract Fee", montoContractFee: 0,
};

// ── Royalty Planta — rama legacy cuotas % (RP_CUOTAS_DEFAULT 50/50) ──
export const RP_LEGACY = {
  id: "c_rp_leg", razonSocial: "Cli RP Legacy", pais: "Peru",
  modeloIngresos: "legacy", valorRoyaltyPlanta: 1.5,
  plantaciones: [{ id: "p1", nPlantas: 1000 }, { id: "p2", nPlantas: 1000 }],
};

// ── Royalty Planta — rama facturas (facturasRP) ──
export const RP_FACTURAS = {
  id: "c_rp_fac", razonSocial: "Cli RP Fact", pais: "Chile",
  modeloIngresos: "legacy", valorRoyaltyPlanta: 2,
  plantaciones: [{ id: "p1", nPlantas: 500 }],
  ordenesCompra: [{ id: "oc1", n_oc: "OC-1", plantacionIds: ["p1"] }],
  facturasRP: [{ id: "f1", n_factura: "F-1", ocIds: ["oc1"], montoFacturado: "", estadoCF: "pagado" }],
};

// ── Royalty Planta — rama OC-despacho (modeloIngresos "oc") ──
export const RP_OC = {
  id: "c_rp_oc", razonSocial: "Cli RP OC", pais: "Peru", clienteId: "cliX",
  modeloIngresos: "oc", valorRoyaltyPlanta: 1,
  plantaciones: [{ id: "p1", nPlantas: 300 }],
};
export const RP_OC_VIVEROS = [{
  id: "v1", viverista: "Vivero Uno",
  ordenesCompra: [{ id: "voc1", cliente_id: "cliX", cliente_nombre: "Cli RP OC", cantidad_plantas: 300,
    despachos: [{ id: "d1", cantidad_despachada: 300, tipo: "Comercial" }] }],
}];

// ── Royalty Comercial — rama legacy (ha, temporada, inflación, Prueba excluida) ──
export const RC_LEGACY = {
  id: "c_rc_leg", razonSocial: "Cli RC Legacy", pais: "Chile",
  modeloIngresos: "legacy", valorRoyaltyComercial: 1000,
  royaltyInflacion: true, rcInflacionPct: 5,
  rcInicioTemporada: "2026/2027", fechaTermino: "2028-06-30",
  plantaciones: [
    { id: "p1", hectareas: 10, tipoPlantacion: "Comercial" },
    { id: "p2", hectareas: 5, tipoPlantacion: "Prueba" }, // debe excluirse del RC
  ],
};

// ── Royalty Comercial — rama bloques con múltiples cohortes ──
export const RC_COHORTES = {
  id: "c_rc_coh", razonSocial: "Cli RC Cohortes", pais: "Chile",
  modeloIngresos: "oc", valorRoyaltyComercial: 1000,
  royaltyInflacion: true, rcInflacionPct: 10,
  fechaTermino: "2028-06-30",
  rcCohortes: [
    { id: "co1", ha: 20, desde: "2026/2027" },
    { id: "co2", ha: 10, desde: "2027/2028" },
  ],
  plantaciones: [],
};

// ── Total Pedidos (proyección de plantaciones) ──
export const TP_CONTRATO = {
  id: "c_tp", razonSocial: "Cli TP", pais: "Peru",
  plantaciones: [
    { id: "p1", especie: "Cereza", variedad: "V1", nPlantas: 100, hectareas: 2, fechaPlantacion: "2026-07-01", estado: "Confirmado" },
    { id: "p2", especie: "Arandano", variedad: "V2", nPlantas: 50, hectareas: 1, estado: "Por confirmar" },
  ],
};

// ── Obtentor — participación por % sobre bruto facturado ──
export const OBT = {
  id: "obt1", obtentor: "Genetista Demo",
  participacionIngresos: [
    { id: "pi1", tipoIngreso: "contract_fee", especie: "", variedad: "", tipoCalculo: "porcentaje", valor: 70, wht: 10 },
    { id: "pi2", tipoIngreso: "royalty_planta", especie: "Cereza", variedad: "", tipoCalculo: "porcentaje", valor: 70, wht: 10 },
  ],
};
export const OBT_FE = [{ id: "fe_x", cliente: "Cli", pais: "Chile", montoUSD: 30000, pagado: true }];
export const OBT_RP = [
  { id: "rp_x", cliente: "Cli", pais: "Chile", especie: "Cereza", nPlantas: 500, montoFact: 1000, usdPlanta: 2, pagado: true },
  { id: "rp_y", cliente: "Cli", pais: "Chile", especie: "Manzana", nPlantas: 100, montoFact: 999, pagado: true }, // NO matchea regla Cereza
];
export const OBT_RC = [];

// Variante: regla royalty_planta comodín (especie:"") — SÍ matchea cualquier fila.
export const OBT_WILDCARD_RP = {
  id: "obt2", obtentor: "Genetista Wild",
  participacionIngresos: [
    { id: "piw", tipoIngreso: "royalty_planta", especie: "", variedad: "", tipoCalculo: "porcentaje", valor: 70, wht: 10 },
  ],
};
// Variante: regla royalty_planta con especie, y ctData que aporta ct.especie
// (así el matching por CONTRATO sí encuentra especie). Documenta el mecanismo real.
export const OBT_SCOPED_RP = {
  id: "obt3", obtentor: "Genetista Scoped",
  participacionIngresos: [
    { id: "pis", tipoIngreso: "royalty_planta", especie: "Cereza", variedad: "", tipoCalculo: "porcentaje", valor: 70, wht: 0 },
  ],
};
export const OBT_SCOPED_CTDATA = [{ id: "cc", especie: "Cereza", variedad: "" }];
export const OBT_SCOPED_RP_ROWS = [{ id: "rp_cc", ctId: "cc", cliente: "Cli", montoFact: 2000, nPlantas: 1000, pagado: true }];

// tipoCalculo por planta / por ha (documentar calcMontoObtentor)
export const OBT_PORPLANTA = {
  id: "obt4", obtentor: "G4",
  participacionIngresos: [{ id: "pip", tipoIngreso: "royalty_planta", especie: "", variedad: "", tipoCalculo: "usd_planta", valor: 0.5, wht: 0 }],
};
export const OBT_PORPLANTA_RP = [{ id: "rp_pp", cliente: "Cli", montoFact: 9999, nPlantas: 1000, pagado: true }];
