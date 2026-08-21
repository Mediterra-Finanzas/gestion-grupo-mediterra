/* eslint-disable */
// connectors/bcrp.ts — Banco Central de Reserva del Perú (BCRP). STUB F2-A.
// USD-PEN: por diseño no disponible en APIs gratuitas (frankfurter no lo cubre).
// El par USD-PEN debe cargarse manual en Maestros → Tipo de Cambio.
// Este conector retorna coverage_gap — HTTP 200, sin retry, sin alerta.
// F2-B podrá integrar la API real del BCRP si se requiere automatización.

import type { CoverageGapResult } from './types.ts';

const VERSION = '1.0.0-stub';

// Pares que serían responsabilidad del BCRP en una integración real.
// Actualmente: solo coverage_gap por diseño.
export const BCRP_PARES = ['USD-PEN'];

export async function fetchBcrp(par: string): Promise<CoverageGapResult> {
  return {
    par,
    valor:            null,
    fechaEfectiva:    null,
    proveedor:        'bcrp',
    connectorVersion: VERSION,
    httpStatus:       null,
    latencyMs:        0,
    error:            'coverage_gap',
    hashRespuesta:    null,
  };
}
