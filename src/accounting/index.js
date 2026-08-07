/* eslint-disable */
// src/accounting/index.js
// Accounting Core — API Pública v1.0
//
// REGLA (OA-004-03): Los módulos externos (FRP, Tesorería, Presupuesto, Tributario,
// Activos Fijos y cualquier módulo futuro) SOLO importan desde este archivo.
// No importar directamente desde subdirectorios internos del dominio.
//
// Ejemplo correcto:
//   import { CAT_GRUPO, valorSit } from '../accounting';
//
// Ejemplo incorrecto:
//   import { CAT_GRUPO } from '../accounting/classification/categories';

// ── Clasificación ────────────────────────────────────────────────────────────
export { CAT_GRUPO, resolverGrupo }               from './classification/categories';
export { ESF_SECCIONES, ER_BLOQUES, getBloqueEr } from './classification/structure';
export {
  obtenerSegmentosCodigo,
  clasificarSeccionEsf,
  clasificarGrupoEr,
  resolverClasificacion,
}                                                  from './classification/classifier';

// ── Valuación ────────────────────────────────────────────────────────────────
export { valorSit, valorERCuenta }                from './valuation/accountValue';
export { sumaEsf, sumaEr }                        from './valuation/sectionTotals';

// ── Validación ───────────────────────────────────────────────────────────────
export { verificarCuadre }                        from './validation/balanceCheck';

// ── Consolidación (Paso 2) ───────────────────────────────────────────────────
export { EMPRESAS_LINEAALINEA, FACTORES_CONSOLIDADO } from './consolidation';

// ── Currency (Paso 1) — pendiente ───────────────────────────────────────────
// Sin exports todavía. Ver currency/index.js.

// ── Comparison (Paso 3) — pendiente ─────────────────────────────────────────
// Sin exports todavía. Ver comparison/index.js.

// ── Posting Engine (C9) — reservado ─────────────────────────────────────────
// Sin exports todavía. Ver posting/index.js.
