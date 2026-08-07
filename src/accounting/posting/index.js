/* eslint-disable */
// src/accounting/posting/index.js
// Accounting Posting Engine — Capacidad C9 (OA-004-04).
//
// ESTADO: NOT_IMPLEMENTED — capacidad futura reservada por OA-004-04.
//   No tiene fase de implementación asignada todavía.
//
// Cuando se implemente, este módulo será el único responsable de generar
// movimientos contables desde otros dominios:
//   - Compras → asiento de costo e inventario
//   - Ventas → asiento de ingreso y cuentas por cobrar
//   - Activos Fijos → asiento de depreciación
//   - Remuneraciones → asiento de gasto de personal
//   - Inventarios → ajuste de valoración
//   - Tesorería → asiento de pago/cobro
//
// Objetivo: la lógica de contabilización existe en un único lugar.
// Todo dominio que genere movimientos contables deberá llamar a este engine.
//
// No importar nada de este módulo hasta que C9 esté implementado.

export const POSTING_STATUS = 'NOT_IMPLEMENTED';

/** @throws {Error} siempre — Capacidad C9 no implementada */
export function registrarAsiento(dominio, datos) {
  throw new Error(
    '[accounting/posting] registrarAsiento() NOT_IMPLEMENTED. ' +
    'Capacidad C9. Fase de implementación no asignada todavía (OA-004-04).'
  );
}
