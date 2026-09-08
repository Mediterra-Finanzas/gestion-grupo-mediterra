/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// instancia.js — ÚNICA instancia compartida del contrato de persistencia.
//
// Toda escritura a `calendario_data` de las filas-blob migradas (main, pins,
// finanzas, finanzas_esc_*, allegria, maestro_plan_cuentas, nominas_tipos_doc)
// pasa por ESTE objeto `persist`, para que el estado de versión/base/dirty/cola
// por-fila sea el mismo en toda la app (no globales dispersos por módulo).
//
// F0-B (P0-1, GO-LIVE BLOCKER). Ver docs/persistencia-f0-contract.md.
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia } from "./persistContract.js";

export const persist = crearPersistencia();
export { construirAvisoDesde, MOTIVOS } from "./persistContract.js";
export default persist;
