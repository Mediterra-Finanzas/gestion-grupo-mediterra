/* eslint-disable */
/**
 * Funciones puras de cálculo cambiario.
 * Sin dependencias de Supabase — completamente testeables en aislamiento.
 */
import { CANONICAL_PAIRS, PIVOT_CURRENCY, COVERAGE_GAPS } from './constants';

/** Determina si un par está en dirección canónica. */
export function esDireccionCanonica(base, quote) {
  return CANONICAL_PAIRS.some(([b, q]) => b === base && q === quote);
}

/** Determina si el par existe (en cualquier dirección). */
export function parExiste(base, quote) {
  return CANONICAL_PAIRS.some(
    ([b, q]) => (b === base && q === quote) || (b === quote && q === base)
  );
}

/** Normaliza el par a su dirección canónica. */
export function normalizarPar(base, quote) {
  if (esDireccionCanonica(base, quote)) return { base, quote, invertida: false };
  if (esDireccionCanonica(quote, base)) return { base: quote, quote: base, invertida: true };
  return null;
}

/** Calcula el valor inverso con precisión NUMERIC(20,10). */
export function valorInverso(valor) {
  if (!valor || valor === 0) return null;
  return parseFloat((1 / valor).toFixed(10));
}

/**
 * Dado un resultado de búsqueda de tasa y la dirección original,
 * devuelve el valor aplicable (directo o inverso).
 */
export function aplicarDireccion(valorCanónico, invertida) {
  if (invertida) return valorInverso(valorCanónico);
  return valorCanónico;
}

/** Calcula stale_days = requestedDate - effectiveRateDate (OA-009-03). */
export function calcularStaleDays(requestedDate, effectiveRateDate) {
  if (!requestedDate || !effectiveRateDate) return null;
  const req = new Date(requestedDate);
  const eff = new Date(effectiveRateDate);
  if (isNaN(req.getTime()) || isNaN(eff.getTime())) return null;
  return Math.floor((req - eff) / 86400000);
}

/**
 * Determina la ruta de conversión entre dos monedas.
 * Devuelve: { tipo: 'directa'|'inversa'|'triangulacion', cadena: [...] }
 */
export function rutaConversion(origen, destino) {
  if (origen === destino) {
    return { tipo: 'identidad', cadena: [origen] };
  }
  if (esDireccionCanonica(origen, destino)) {
    return { tipo: 'directa', cadena: [origen, destino] };
  }
  if (esDireccionCanonica(destino, origen)) {
    return { tipo: 'inversa', cadena: [origen, destino] };
  }
  // Triangulación via USD (pivot por defecto)
  const pivotsViables = [PIVOT_CURRENCY].filter(p => p !== origen && p !== destino);
  for (const pivot of pivotsViables) {
    const leg1Ok = esDireccionCanonica(origen, pivot) || esDireccionCanonica(pivot, origen);
    const leg2Ok = esDireccionCanonica(pivot, destino) || esDireccionCanonica(destino, pivot);
    if (leg1Ok && leg2Ok) {
      return { tipo: 'triangulacion', cadena: [origen, pivot, destino], pivot };
    }
  }
  return { tipo: 'sin_ruta', cadena: [origen, destino] };
}

/**
 * Aplica la conversión dado: monto, tasa leg1, tasa leg2 (opcional para triangulación).
 * No redondea internamente (OA-010-10).
 */
export function aplicarConversion(monto, tasa1, tasa2 = null) {
  if (monto === null || monto === undefined || isNaN(monto)) return null;
  if (!tasa1 || isNaN(tasa1) || tasa1 === 0) return null;
  const paso1 = monto * tasa1;
  if (tasa2 === null) return paso1;
  if (isNaN(tasa2) || tasa2 === 0) return null;
  return paso1 * tasa2;
}

/** Valida que un valor de tasa sea numérico, positivo y no NaN. */
export function tasaValida(valor) {
  return typeof valor === 'number' && isFinite(valor) && valor > 0;
}

/** Calcula promedio aritmético de un array de valores. */
export function promedioAritmetico(valores) {
  if (!valores || valores.length === 0) return null;
  const validos = valores.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
  if (validos.length === 0) return null;
  return validos.reduce((acc, v) => acc + v, 0) / validos.length;
}

/** Calcula promedio ponderado dado [{valor, peso}]. */
export function promedioMixto(items) {
  if (!items || items.length === 0) return null;
  const validos = items.filter(
    i => typeof i.valor === 'number' && isFinite(i.valor) && i.valor > 0 &&
         typeof i.peso === 'number' && isFinite(i.peso) && i.peso > 0
  );
  if (validos.length === 0) return null;
  const sumPeso = validos.reduce((acc, i) => acc + i.peso, 0);
  const sumProducto = validos.reduce((acc, i) => acc + i.valor * i.peso, 0);
  return sumProducto / sumPeso;
}

/** Verifica si hay COVERAGE_GAP registrado para el par. */
export function tieneCoverageGap(base, quote) {
  return !!(COVERAGE_GAPS[`${base}-${quote}`] || COVERAGE_GAPS[`${quote}-${base}`]);
}
