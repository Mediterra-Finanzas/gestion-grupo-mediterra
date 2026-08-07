/* eslint-disable */
// src/accounting/comparison/index.js
// Comparativo Real / Presupuesto / Año Anterior — Capacidad C4.
//
// ESTADO: NOT_IMPLEMENTED — habilitado en Paso 3.
//   Requiere Paso 1 (TC unificado) y Paso 2 (pct_control en BD) completados.
//   Requiere además la tabla anf_ppto_cuentas (Presupuesto por Cuenta/Período).
//
// Cuando se implemente:
//   comparativo(filialId, codigoCuenta, año, mes)
//     → { real: number, ppto: number, añoAnt: number, varPpto: number, varAño: number }
//
// Esta capacidad desbloquea el análisis /financial-statements
// con columnas Real / Presupuesto / Año Anterior y varianzas en $ y %.
//
// No importar nada de este módulo hasta que Paso 3 esté completado.

export const COMPARISON_STATUS = 'NOT_IMPLEMENTED';

/** @throws {Error} siempre — implementado en Paso 3 */
export function comparativo(filialId, codigoCuenta, año, mes) {
  throw new Error(
    '[accounting/comparison] comparativo() NOT_IMPLEMENTED. ' +
    'Capacidad C4. Disponible en Paso 3 (requiere Pasos 1+2).'
  );
}
