/* eslint-disable */
/**
 * Conector mindicador.cl — Banco Central de Chile.
 * Cubre pares *-CLP para dólar y euro.
 * OA-010-08: informa proveedor, versión, par, fechas, latencia, HTTP status, hash.
 */

const CONNECTOR_VERSION = 'mindicador@1.0.0';
const BASE_URL = 'https://mindicador.cl/api';

const CODIGO_POR_MONEDA = {
  'USD-CLP': 'dolar',
  'EUR-CLP': 'euro',
};

/**
 * Obtiene la tasa para (base, quote) en una fecha específica.
 * Retorna un objeto estandarizado de conector.
 */
export async function fetchMindicador(base, quote, fecha) {
  const par = `${base}-${quote}`;
  const codigo = CODIGO_POR_MONEDA[par];

  if (!codigo) {
    return {
      ok: false,
      proveedor: 'mindicador.cl',
      connector_version: CONNECTOR_VERSION,
      par,
      fechaSolicitada: fecha,
      error: `Par ${par} no soportado por mindicador`,
    };
  }

  const t0 = Date.now();
  let httpStatus = null;
  let reintentos = 0;
  const MAX_REINTENTOS = 2;

  while (reintentos <= MAX_REINTENTOS) {
    try {
      const url = `${BASE_URL}/${codigo}/${fecha}`;
      const res = await fetch(url);
      httpStatus = res.status;
      const latencia = Date.now() - t0;

      if (!res.ok) {
        if (reintentos < MAX_REINTENTOS) { reintentos++; continue; }
        return {
          ok: false,
          proveedor: 'mindicador.cl',
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
      const serie = json?.serie;
      if (!serie || serie.length === 0) {
        return {
          ok: false,
          proveedor: 'mindicador.cl',
          connector_version: CONNECTOR_VERSION,
          par,
          fechaSolicitada: fecha,
          httpStatus,
          latencia,
          reintentos,
          error: 'Sin datos para la fecha solicitada',
        };
      }

      const registro = serie[0];
      const valor = registro.valor;
      const fechaEfectiva = registro.fecha?.slice(0, 10);
      const rawStr = JSON.stringify(json);
      const hash = await _sha256(rawStr);

      return {
        ok: true,
        proveedor: 'mindicador.cl',
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
        proveedor: 'mindicador.cl',
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
