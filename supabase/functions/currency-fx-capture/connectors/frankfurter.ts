/* eslint-disable */
// connectors/frankfurter.ts — Banco Central Europeo vía api.frankfurter.app.
// Cross-rates globales. Sin auth. CORS abierto.
// NO cubre PEN → esos pares resultan en coverage_gap por diseño.
// F2-A: solo fetch + audit, no escribe en currency_tc.

import type { ConnectorResult } from './types.ts';

const VERSION = '1.0.0';
const TIMEOUT_MS = 8_000;

// Pares que frankfurter puede cubrir (base USD → múltiples destinos en una sola llamada).
// PEN no está en la lista — frankfurter no lo soporta.
const USD_TARGETS = ['CLP', 'EUR', 'GBP', 'CNY', 'BRL', 'MXN', 'AUD', 'CAD', 'JPY'];

// Pares base EUR (complementan a mindicador para cross-rates).
const EUR_TARGETS = ['USD'];

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchBatch(
  baseCurrency: string,
  targets: string[],
  latencyOffset = 0,
): Promise<{ results: ConnectorResult[]; latencyMs: number }> {
  const toStr = targets.join(',');
  const url = `https://api.frankfurter.app/latest?from=${baseCurrency}&to=${toStr}`;
  const t0 = Date.now();

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const latencyMs = Date.now() - t0 + latencyOffset;
    const rawBody = await res.text();
    const httpStatus = res.status;

    if (!res.ok) {
      return {
        results: targets.map(t => ({
          par: `${baseCurrency}-${t}`, valor: null, fechaEfectiva: null,
          proveedor: 'frankfurter', connectorVersion: VERSION,
          httpStatus, latencyMs, error: `http_${httpStatus}`, hashRespuesta: null,
        })),
        latencyMs,
      };
    }

    const json = JSON.parse(rawBody);
    const fechaEfectiva: string = json?.date ?? '';
    const rates: Record<string, number> = json?.rates ?? {};
    const hashRespuesta = await sha256Hex(rawBody);

    const results: ConnectorResult[] = targets.map(t => {
      const valor = rates[t] ?? null;
      return {
        par: `${baseCurrency}-${t}`,
        valor,
        fechaEfectiva: valor !== null ? fechaEfectiva : null,
        proveedor: 'frankfurter',
        connectorVersion: VERSION,
        httpStatus,
        latencyMs,
        error: valor !== null ? null : `par_ausente:${baseCurrency}-${t}`,
        hashRespuesta: valor !== null ? hashRespuesta : null,
      };
    });

    return { results, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - t0 + latencyOffset;
    const msg = err instanceof Error ? err.name : 'unknown';
    const error = msg === 'TimeoutError' ? 'timeout' : `fetch_error:${msg}`;
    return {
      results: targets.map(t => ({
        par: `${baseCurrency}-${t}`, valor: null, fechaEfectiva: null,
        proveedor: 'frankfurter', connectorVersion: VERSION,
        httpStatus: null, latencyMs, error, hashRespuesta: null,
      })),
      latencyMs,
    };
  }
}

export async function fetchFrankfurter(): Promise<ConnectorResult[]> {
  // Dos llamadas en paralelo: USD→targets y EUR→targets.
  const [usdBatch, eurBatch] = await Promise.all([
    fetchBatch('USD', USD_TARGETS),
    fetchBatch('EUR', EUR_TARGETS),
  ]);
  return [...usdBatch.results, ...eurBatch.results];
}

export const FRANKFURTER_PARES = [
  ...USD_TARGETS.map(t => `USD-${t}`),
  ...EUR_TARGETS.map(t => `EUR-${t}`),
];
