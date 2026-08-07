/* eslint-disable */
/**
 * Conector frankfurter.app — Banco Central Europeo.
 * Cubre cross-rates globales. NO cubre PEN (verificado 2026-08-07).
 * OA-010-06: USD-PEN → COVERAGE_GAP, no se intenta via este conector.
 * OA-010-08: informa proveedor, versión, par, fechas, latencia, HTTP status, hash.
 */

const CONNECTOR_VERSION = 'frankfurter@1.0.0';
const BASE_URL = 'https://api.frankfurter.app';

// Monedas verificadas como NO disponibles en Frankfurter (2026-08-07).
const NO_DISPONIBLES = new Set(['PEN', 'CLP', 'ARS', 'COP', 'BOB']);

export async function fetchFrankfurter(base, quote, fecha) {
  const par = `${base}-${quote}`;

  if (NO_DISPONIBLES.has(base) || NO_DISPONIBLES.has(quote)) {
    return {
      ok: false,
      proveedor: 'frankfurter.app',
      connector_version: CONNECTOR_VERSION,
      par,
      fechaSolicitada: fecha,
      error: `COVERAGE_GAP: ${NO_DISPONIBLES.has(base) ? base : quote} no disponible en Frankfurter`,
      coverageGap: true,
    };
  }

  const t0 = Date.now();
  let httpStatus = null;
  let reintentos = 0;
  const MAX_REINTENTOS = 2;

  while (reintentos <= MAX_REINTENTOS) {
    try {
      const url = `${BASE_URL}/${fecha}?from=${base}&to=${quote}`;
      const res = await fetch(url);
      httpStatus = res.status;
      const latencia = Date.now() - t0;

      if (!res.ok) {
        if (reintentos < MAX_REINTENTOS) { reintentos++; continue; }
        return {
          ok: false,
          proveedor: 'frankfurter.app',
          connector_version: CONNECTOR_VERSION,
          par,
          fechaSolicitada: fecha,
          httpStatus,
          latencia,
          reintentos,
          error: `HTTP ${httpStatus}`,
        };
      }

      const json = await res.json();
      const valor = json?.rates?.[quote];
      const fechaEfectiva = json?.date;

      if (valor === undefined || valor === null) {
        return {
          ok: false,
          proveedor: 'frankfurter.app',
          connector_version: CONNECTOR_VERSION,
          par,
          fechaSolicitada: fecha,
          httpStatus,
          latencia,
          reintentos,
          error: `${quote} no en rates de respuesta`,
        };
      }

      const rawStr = JSON.stringify(json);
      const hash = await _sha256(rawStr);

      return {
        ok: true,
        proveedor: 'frankfurter.app',
        connector_version: CONNECTOR_VERSION,
        par,
        fechaSolicitada: fecha,
        fechaEfectiva,
        valor,
        httpStatus,
        latencia,
        reintentos,
        hashRespuesta: hash,
      };
    } catch (err) {
      if (reintentos < MAX_REINTENTOS) { reintentos++; continue; }
      return {
        ok: false,
        proveedor: 'frankfurter.app',
        connector_version: CONNECTOR_VERSION,
        par,
        fechaSolicitada: fecha,
        httpStatus,
        latencia: Date.now() - t0,
        reintentos,
        error: err.message,
      };
    }
  }
}

async function _sha256(str) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
