/* eslint-disable */
// src/accounting/currency/index.js
// Tipos de cambio y conversión de monedas.
//
// ESTADO: NOT_IMPLEMENTED — habilitado en Paso 1.
//
// Paso 1 deberá:
//   1. Declarar anf_tipos_cambio como la única tabla canónica de TC.
//   2. Migrar friskuHelpers.js (maestro_tc en calendario_data) a esta tabla.
//   3. Exponer convertir(monto, monedaOrigen, monedaDest, fecha, tipo) como
//      la función única de conversión para toda la plataforma.
//
// Mientras Paso 1 no esté completado, cada módulo usa su propio sistema de TC:
//   - ANF: anf_tipos_cambio (anfPersistence.js → cargarTc)
//   - Frisku / Rendiciones: maestro_tc en calendario_data (friskuHelpers.js → buscarTC)
//
// DEUDA TÉCNICA (TD-TC-001): dos fuentes de TC paralelas e incompatibles.
//
// No importar nada de este módulo hasta que Paso 1 esté completado.
// Cualquier intento de llamar las funciones previstas lanzará error explícito.

export const CURRENCY_STATUS = 'NOT_IMPLEMENTED';

/** @throws {Error} siempre — implementado en Paso 1 */
export function convertir(monto, monedaOrigen, monedaDest, fecha) {
  throw new Error(
    '[accounting/currency] convertir() NOT_IMPLEMENTED. ' +
    'Disponible en Paso 1. Ver TD-TC-001.'
  );
}

/** @throws {Error} siempre — implementado en Paso 1 */
export function buscarTC(par, fecha) {
  throw new Error(
    '[accounting/currency] buscarTC() NOT_IMPLEMENTED. ' +
    'Disponible en Paso 1. Ver TD-TC-001.'
  );
}
