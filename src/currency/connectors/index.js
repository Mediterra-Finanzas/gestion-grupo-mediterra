/* eslint-disable */
/**
 * Registro de conectores. El orden define la precedencia por par.
 * Cada conector implementa: fetch(base, quote, fecha) → resultado estandarizado.
 */
import { fetchMindicador } from './mindicador';
import { fetchFrankfurter } from './frankfurter';

// Regla de selección de conector por par (base-quote canónico).
const CONECTOR_POR_PAR = {
  'USD-CLP': [fetchMindicador],
  'EUR-CLP': [fetchMindicador],
  // Resto: frankfurter primario, mindicador NO aplica (no cubre esos pares).
  'USD-PEN': [], // COVERAGE_GAP — sin conector automático
  'EUR-USD': [fetchFrankfurter],
  'USD-GBP': [fetchFrankfurter],
  'USD-CNY': [fetchFrankfurter],
  'USD-BRL': [fetchFrankfurter],
  'USD-MXN': [fetchFrankfurter],
  'USD-AUD': [fetchFrankfurter],
  'USD-CAD': [fetchFrankfurter],
  'USD-JPY': [fetchFrankfurter],
};

/**
 * Selecciona el conector apropiado para el par canónico y lo ejecuta.
 * Recorre la lista de conectores por par hasta obtener ok:true.
 */
export async function fetchConector(base, quote, fecha) {
  const par = `${base}-${quote}`;
  const conectores = CONECTOR_POR_PAR[par];

  if (!conectores) {
    return {
      ok: false,
      par,
      fechaSolicitada: fecha,
      error: `Par ${par} no reconocido en registro de conectores`,
    };
  }

  if (conectores.length === 0) {
    return {
      ok: false,
      par,
      fechaSolicitada: fecha,
      error: `COVERAGE_GAP: sin conector automático para ${par}`,
      coverageGap: true,
    };
  }

  let ultimoError = null;
  for (const fn of conectores) {
    const resultado = await fn(base, quote, fecha);
    if (resultado.ok) return resultado;
    ultimoError = resultado;
  }
  return ultimoError;
}

export { fetchMindicador, fetchFrankfurter };
