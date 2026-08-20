/* eslint-disable */
// connectors/mindicador.ts — Banco Central Chile vía mindicador.cl.
// Cubre: USD-CLP (dólar observado) y EUR-CLP (euro).
// Sin auth. CORS abierto. F2-A: solo fetch + audit, no escribe en currency_tc.

import type { ConnectorResult } from './types.ts';

const VERSION = '1.0.0';
const TIMEOUT_MS = 8_000;

const ENDPOINTS: Record<string, string> = {
  'USD-CLP': 'https://mindicador.cl/api/dolar',
  'EUR-CLP': 'https://mindicador.cl/api/euro',
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchMindicador(par: string): Promise<ConnectorResult> {
  const url = ENDPOINTS[par];
  if (!url) {
    return {
      par, valor: null, fechaEfectiva: null,
      proveedor: 'mindicador', connectorVersion: VERSION,
      httpStatus: null, latencyMs: 0,
      error: `par_no_soportado:${par}`, hashRespuesta: null,
    };
  }

  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const latencyMs = Date.now() - t0;
    const rawBody = await res.text();
    const httpStatus = res.status;

    if (!res.ok) {
      return {
        par, valor: null, fechaEfectiva: null,
        proveedor: 'mindicador', connectorVersion: VERSION,
        httpStatus, latencyMs, error: `http_${httpStatus}`, hashRespuesta: null,
      };
    }

    const json = JSON.parse(rawBody);
    const serie: Array<{ fecha: string; valor: number }> = json?.serie ?? [];
    const ultimo = serie[0];

    if (!ultimo || typeof ultimo.valor !== 'number') {
      return {
        par, valor: null, fechaEfectiva: null,
        proveedor: 'mindicador', connectorVersion: VERSION,
        httpStatus, latencyMs, error: 'parse_error:serie_vacia', hashRespuesta: null,
      };
    }

    const fechaEfectiva = ultimo.fecha.substring(0, 10); // "2026-08-10T00:00:00.000Z" → "2026-08-10"
    const hashRespuesta = await sha256Hex(rawBody);

    return {
      par,
      valor: ultimo.valor,
      fechaEfectiva,
      proveedor: 'mindicador',
      connectorVersion: VERSION,
      httpStatus,
      latencyMs,
      error: null,
      hashRespuesta,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.name : 'unknown';
    return {
      par, valor: null, fechaEfectiva: null,
      proveedor: 'mindicador', connectorVersion: VERSION,
      httpStatus: null, latencyMs,
      error: msg === 'TimeoutError' ? 'timeout' : `fetch_error:${msg}`,
      hashRespuesta: null,
    };
  }
}

export const MINDICADOR_PARES = Object.keys(ENDPOINTS);
