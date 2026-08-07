/* eslint-disable */
// src/accounting/consolidation/index.js
// Consolidación de estados financieros — Paso 2.
//
// ESTADO: Paso 2 pendiente de implementación.
// Los factores NCI y la lista de entidades línea-a-línea estarán aquí temporalmente
// hasta que Paso 2 los migre a anf_filiales.pct_control en la base de datos.
//
// DEUDA TÉCNICA (TD-CONS-001):
//   EMPRESAS_LINEAALINEA y FACTORES_CONSOLIDADO están hardcoded.
//   Paso 2 deberá leerlos desde anf_filiales (campo pct_control + metodo_consolidacion)
//   y eliminar estas constantes.
//
// USO: Únicamente a través de src/accounting/index.js (API pública).

/** Entidades consolidadas línea-a-línea (IAS 27 / IFRS 10). */
export const EMPRESAS_LINEAALINEA = [
  'Mediterra',
  'Allegria Foods',
  'Allegria Service',
  'Frisku Foods',
  'Integrity Farms',
  'Osiris',
];

/**
 * Factor de participación para la consolidación línea-a-línea.
 * El factor es la participación efectiva del grupo (1.0 = 100%).
 * La participación de interés no controlante (NCI) = 1 − factor.
 *
 * Allpa Chile y Allpa Perú usan método patrimonial (IAS 28) — no están aquí.
 *
 * Paso 2: reemplazar con consulta a anf_filiales.pct_control.
 */
export const FACTORES_CONSOLIDADO = {
  'Mediterra':         1,
  'Allegria Foods':    1,
  'Allegria Service':  0.8,   // NCI 20%
  'Frisku Foods':      0.9,   // NCI 10%
  'Integrity Farms':   1,
  'Osiris':            1,
};

// ── Capacidad C7 — Accounting Posting Engine ─────────────────────────────────
// Reservado para Paso 2: consolidarEntidades(saldosPorEntidad, factoresNCI)
// con eliminaciones intercompany reales.
