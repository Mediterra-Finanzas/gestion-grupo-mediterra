/* eslint-disable */
// src/accounting/classification/structure.js
// Estructura permanente de los estados financieros IFRS (IAS 1).
//
// ESF_SECCIONES — secciones del Balance General en orden de presentación.
// ER_BLOQUES    — bloques del Estado de Resultados con convención de signo.
//
// USO: Únicamente a través de src/accounting/index.js (API pública).

/**
 * Secciones del Estado de Situación Financiera (Balance General).
 * El orden de este array define el orden de presentación en todos los módulos.
 */
export const ESF_SECCIONES = [
  { id: 'ac',  label: 'Activo Corriente',    totalLabel: 'Total Activo Corriente',    grupo: 'Activo Corriente'    },
  { id: 'anc', label: 'Activo No Corriente', totalLabel: 'Total Activo No Corriente', grupo: 'Activo No Corriente' },
  { id: 'pc',  label: 'Pasivo Corriente',    totalLabel: 'Total Pasivo Corriente',    grupo: 'Pasivo Corriente'    },
  { id: 'pnc', label: 'Pasivo No Corriente', totalLabel: 'Total Pasivo No Corriente', grupo: 'Pasivo No Corriente' },
  { id: 'pat', label: 'Patrimonio',          totalLabel: 'Total Patrimonio',          grupo: 'Patrimonio'          },
];

/**
 * Bloques del Estado de Resultados.
 *
 * signo: contribución al resultado neto desde la perspectiva del resultado.
 *   1  → suma al resultado (ingresos)
 *  -1  → resta al resultado (costos/gastos/impuesto); se almacenan como negativos en DB
 *   0  → neto propio (no operacional mixto)
 */
export const ER_BLOQUES = [
  { id: 'ing_op',    label: 'Ingresos Operacionales',    grupo: 'Ingreso Operacional',    signo:  1 },
  { id: 'costo_op',  label: 'Costos',                    grupo: 'Costo Operacional',      signo: -1 },
  { id: 'gasto_op',  label: 'Gastos Operacionales',      grupo: 'Gasto Operacional',      signo: -1 },
  { id: 'ing_nop',   label: 'Ingresos No Operacionales', grupo: 'Ingreso No Operacional', signo:  1 },
  { id: 'gasto_nop', label: 'Gastos No Operacionales',   grupo: 'Gasto No Operacional',   signo: -1 },
  { id: 'no_op',     label: 'No Operacional',             grupo: 'No Operacional',         signo:  0 },
  { id: 'imp',       label: 'Impuesto a la Renta',        grupo: 'Impuesto',               signo: -1 },
];

/** Devuelve el bloque ER correspondiente al grupo dado, o null si no existe. */
export function getBloqueEr(grupo) {
  return ER_BLOQUES.find(b => b.grupo === grupo) ?? null;
}
