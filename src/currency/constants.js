/* eslint-disable */
export const CURRENCY_DOMAIN_VERSION = '1.0.0';

export const RATE_TYPES = {
  SPOT: 'spot',
  PERIOD_END: 'period_end',
  ARITHMETIC_AVG: 'arithmetic_avg',
  WEIGHTED_AVG: 'weighted_avg',
  MANUAL: 'manual',
};

export const RATE_PURPOSES = {
  MARKET: 'market',
  ACCOUNTING: 'accounting',
  TREASURY: 'treasury',
  TAX: 'tax',
  BUDGET: 'budget',
};

// Pares canónicos: un único sentido físico por par.
// Tasa inversa se calcula en runtime. (OA-009-01, OA-010-02)
export const CANONICAL_PAIRS = [
  ['USD', 'CLP'],
  ['EUR', 'CLP'],
  ['USD', 'PEN'],
  ['EUR', 'USD'],
  ['USD', 'GBP'],
  ['USD', 'CNY'],
  ['USD', 'BRL'],
  ['USD', 'MXN'],
  ['USD', 'AUD'],
  ['USD', 'CAD'],
  ['USD', 'JPY'],
];

// OA-010-06: Frankfurter no cubre PEN (verificado 2026-08-07).
// El par USD-PEN requiere entrada manual o fuente oficial alternativa.
export const COVERAGE_GAPS = {
  'USD-PEN': {
    causa: 'Frankfurter no cubre PEN. Par sin cobertura histórica.',
    accion: 'Requiere fuente oficial (BCR Perú) o entrada manual.',
    deuda: 'TD-CUR-001',
  },
};

// Pivot de triangulación: USD es la moneda puente por defecto.
export const PIVOT_CURRENCY = 'USD';

// Máximo de días "stale" antes de advertencia (sin bloqueo).
export const STALE_WARN_DAYS = 7;

// Estados de ciclo de vida de un registro currency_tc.
export const TC_ESTADOS = {
  ACTIVO: 'activo',
  SUPERSEDIDO: 'supersedido',
  INVALIDADO: 'invalidado',
};
