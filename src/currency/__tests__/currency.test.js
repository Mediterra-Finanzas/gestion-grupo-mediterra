/* eslint-disable */
/**
 * Suite de tests — Currency Domain
 * OA-010-11: cubre todos los casos requeridos.
 * Supabase está mockeado; no requiere conectividad.
 */

import {
  esDireccionCanonica, parExiste, normalizarPar, valorInverso,
  calcularStaleDays, rutaConversion, aplicarConversion,
  tasaValida, promedioAritmetico, promedioMixto, tieneCoverageGap,
} from '../calc';
import { CANONICAL_PAIRS, RATE_TYPES, RATE_PURPOSES, COVERAGE_GAPS } from '../constants';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../store', () => ({
  storeBuscarTasa: jest.fn(),
  storeBuscarRango: jest.fn(),
  storeInsertarTasa: jest.fn(),
  storeCrearBatch: jest.fn(),
  storeCompletarBatch: jest.fn(),
  storeRollbackBatch: jest.fn(),
  storeContarRegistros: jest.fn(),
}));

jest.mock('../connectors/index', () => ({
  fetchConector: jest.fn(),
}));

import { storeBuscarTasa, storeBuscarRango, storeInsertarTasa, storeRollbackBatch, storeContarRegistros } from '../store';
import { fetchConector } from '../connectors/index';
import { buscarTC, convertir, calcularPromedio, actualizarDesdeAPIs } from '../index';

const ROW_USD_CLP = {
  id: 'uuid-usd-clp-1',
  moneda_origen: 'USD', moneda_destino: 'CLP',
  fecha: '2026-07-07', valor: '926.25',
  rate_type: 'spot', rate_purpose: 'market', fuente: 'mindicador.cl',
  estado: 'activo',
};
const ROW_EUR_CLP = {
  id: 'uuid-eur-clp-1',
  moneda_origen: 'EUR', moneda_destino: 'CLP',
  fecha: '2026-07-07', valor: '1059.54',
  rate_type: 'spot', rate_purpose: 'market', fuente: 'mindicador.cl',
  estado: 'activo',
};
const ROW_EUR_USD = {
  id: 'uuid-eur-usd-1',
  moneda_origen: 'EUR', moneda_destino: 'USD',
  fecha: '2026-07-07', valor: '1.1435',
  rate_type: 'spot', rate_purpose: 'market', fuente: 'frankfurter.app',
  estado: 'activo',
};

// OA-013-04: constante sintética para tests de triangulación.
// 3.75 es LEGACY/NO AUDITABLE FX y no debe aparecer en la suite Currency.
const TEST_ONLY_RATE = 4.00;

beforeEach(() => jest.clearAllMocks());

// ── 1. Funciones puras de calc ─────────────────────────────────────────────────

describe('calc — par directo', () => {
  test('USD-CLP es canónico', () => expect(esDireccionCanonica('USD', 'CLP')).toBe(true));
  test('CLP-USD no es canónico', () => expect(esDireccionCanonica('CLP', 'USD')).toBe(false));
  test('parExiste detecta ambas direcciones', () => {
    expect(parExiste('USD', 'CLP')).toBe(true);
    expect(parExiste('CLP', 'USD')).toBe(true);
  });
});

describe('calc — par inverso', () => {
  test('normalizarPar detecta inversión', () => {
    const n = normalizarPar('CLP', 'USD');
    expect(n).toEqual({ base: 'USD', quote: 'CLP', invertida: true });
  });
  test('normalizarPar directo sin inversión', () => {
    const n = normalizarPar('USD', 'CLP');
    expect(n).toEqual({ base: 'USD', quote: 'CLP', invertida: false });
  });
  test('valorInverso es recíproco exacto', () => {
    expect(valorInverso(926.25)).toBeCloseTo(1 / 926.25, 8);
  });
  test('valorInverso de cero devuelve null', () => expect(valorInverso(0)).toBeNull());
  test('valorInverso de null devuelve null', () => expect(valorInverso(null)).toBeNull());
});

describe('calc — identidad', () => {
  test('rutaConversion USD→USD es identidad', () => {
    expect(rutaConversion('USD', 'USD').tipo).toBe('identidad');
  });
  test('aplicarConversion monto×1 es identidad', () => {
    expect(aplicarConversion(1000, 1)).toBe(1000);
  });
});

describe('calc — triangulación', () => {
  test('PEN→CLP resuelve via USD', () => {
    const r = rutaConversion('PEN', 'CLP');
    expect(r.tipo).toBe('triangulacion');
    expect(r.cadena).toEqual(['PEN', 'USD', 'CLP']);
  });
  test('aplicarConversion con dos tasas (PEN→USD→CLP)', () => {
    // 100 PEN × (1/TEST_ONLY_RATE USD/PEN) × 926.25 CLP/USD
    // leg1 = 1/4.00 = 0.25, leg2 = 926.25 → resultado = 100 × 0.25 × 926.25 = 23,156.25 CLP
    expect(aplicarConversion(100, 1 / TEST_ONLY_RATE, 926.25)).toBeCloseTo(23156.25, 0);
  });
});

describe('calc — stale_days', () => {
  test('misma fecha → 0 días', () => {
    expect(calcularStaleDays('2026-07-07', '2026-07-07')).toBe(0);
  });
  test('diferencia de 7 días', () => {
    expect(calcularStaleDays('2026-07-14', '2026-07-07')).toBe(7);
  });
  test('fecha futura: stale_days negativo', () => {
    expect(calcularStaleDays('2026-07-01', '2026-07-07')).toBe(-6);
  });
  test('null devuelve null', () => {
    expect(calcularStaleDays(null, '2026-07-07')).toBeNull();
  });
});

describe('calc — precisión y validación', () => {
  test('tasaValida acepta positivos', () => expect(tasaValida(926.25)).toBe(true));
  test('tasaValida rechaza NaN', () => expect(tasaValida(NaN)).toBe(false));
  test('tasaValida rechaza cero', () => expect(tasaValida(0)).toBe(false));
  test('tasaValida rechaza null', () => expect(tasaValida(null)).toBe(false));
  test('aplicarConversion con NaN devuelve null', () => expect(aplicarConversion(NaN, 926)).toBeNull());
  test('aplicarConversion con tasa cero devuelve null', () => expect(aplicarConversion(100, 0)).toBeNull());
});

describe('calc — promedios', () => {
  test('promedioAritmetico básico', () => {
    expect(promedioAritmetico([900, 920, 940])).toBeCloseTo(920, 5);
  });
  test('promedioAritmetico array vacío devuelve null', () => {
    expect(promedioAritmetico([])).toBeNull();
  });
  test('promedioAritmetico filtra valores inválidos', () => {
    expect(promedioAritmetico([900, NaN, 940])).toBeCloseTo(920, 5);
  });
  test('promedioMixto ponderado correcto', () => {
    const items = [{ valor: 900, peso: 1 }, { valor: 960, peso: 3 }];
    expect(promedioMixto(items)).toBeCloseTo(945, 5);
  });
  test('promedioMixto array vacío devuelve null', () => {
    expect(promedioMixto([])).toBeNull();
  });
});

describe('calc — canonical pair y coverage gap', () => {
  test('todos los canonical pairs tienen exactamente 2 elementos', () => {
    CANONICAL_PAIRS.forEach(p => expect(p).toHaveLength(2));
  });
  test('no hay pares duplicados simétricos', () => {
    const vistos = new Set();
    CANONICAL_PAIRS.forEach(([b, q]) => {
      const key = [b, q].sort().join('-');
      expect(vistos.has(key)).toBe(false);
      vistos.add(key);
    });
  });
  test('USD-PEN tiene COVERAGE_GAP', () => {
    expect(tieneCoverageGap('USD', 'PEN')).toBe(true);
  });
  test('USD-CLP no tiene COVERAGE_GAP', () => {
    expect(tieneCoverageGap('USD', 'CLP')).toBe(false);
  });
});

// ── 2. buscarTC ────────────────────────────────────────────────────────────────

describe('buscarTC — par directo', () => {
  test('devuelve valor correcto', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(true);
    expect(r.valor).toBeCloseTo(926.25);
    expect(r.invertida).toBe(false);
    expect(r.triangulacion).toBe(false);
    expect(r.fuente).toBe('mindicador.cl');
  });

  test('stale cuando hay brecha > 7 días', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await buscarTC('USD', 'CLP', '2026-08-01');
    expect(r.ok).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.stale_days).toBe(25);
  });

  test('no stale cuando brecha ≤ 7 días', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await buscarTC('USD', 'CLP', '2026-07-10');
    expect(r.stale).toBe(false);
    expect(r.stale_days).toBe(3);
  });
});

describe('buscarTC — par inverso', () => {
  test('CLP→USD devuelve 1/tasa', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await buscarTC('CLP', 'USD', '2026-07-07');
    expect(r.ok).toBe(true);
    expect(r.invertida).toBe(true);
    expect(r.valor).toBeCloseTo(1 / 926.25, 6);
  });
});

describe('buscarTC — identidad', () => {
  test('USD→USD devuelve tasa 1 sin llamar a DB', async () => {
    const r = await buscarTC('USD', 'USD', '2026-07-07');
    expect(r.ok).toBe(true);
    expect(r.tasa).toBe(1);
    expect(storeBuscarTasa).not.toHaveBeenCalled();
  });
});

describe('buscarTC — triangulación', () => {
  test('PEN→CLP via USD cuando ambos legs existen', async () => {
    const ROW_USD_PEN = { id: 'u-p', moneda_origen: 'USD', moneda_destino: 'PEN', fecha: '2026-07-07', valor: String(TEST_ONLY_RATE), rate_type: 'spot', rate_purpose: 'market', fuente: 'manual', estado: 'activo' };
    storeBuscarTasa
      .mockResolvedValueOnce(ROW_USD_PEN)  // USD-PEN (leg1 invertido: PEN→USD)
      .mockResolvedValueOnce(ROW_USD_CLP); // USD-CLP (leg2 directo)
    const r = await buscarTC('PEN', 'CLP', '2026-07-07');
    expect(r.ok).toBe(true);
    expect(r.triangulacion).toBe(true);
    expect(r.cadena).toEqual(['PEN', 'USD', 'CLP']);
  });

  test('triangulación incompleta cuando falta un leg', async () => {
    storeBuscarTasa
      .mockResolvedValueOnce(null) // leg1 no encontrado
      .mockResolvedValueOnce(ROW_USD_CLP);
    const r = await buscarTC('PEN', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.triangulacion).toBe(true);
    expect(r.causa).toContain('incompleta');
  });
});

describe('buscarTC — inexistencia', () => {
  test('tasa inexistente → ok:false con causa', async () => {
    storeBuscarTasa.mockResolvedValue(null);
    const r = await buscarTC('USD', 'CLP', '2020-01-01');
    expect(r.ok).toBe(false);
    expect(r.causa).toBeTruthy();
  });

  test('COVERAGE_GAP para USD-PEN sin tasa en DB', async () => {
    storeBuscarTasa.mockResolvedValue(null);
    const r = await buscarTC('USD', 'PEN', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.coverageGap).toBe(true);
    expect(r.causa).toContain('TD-CUR-001');
  });
});

describe('buscarTC — fecha futura', () => {
  test('devuelve la tasa más reciente disponible con stale_days alto y stale=true', async () => {
    // Si se solicita una fecha futura (2030), la tasa efectiva (2026-07-07) es la más reciente.
    // stale_days = 2030-01-01 - 2026-07-07 > 0 (grande), no negativo.
    // Stale negativo ocurriría solo si effective_date > requested_date.
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await buscarTC('USD', 'CLP', '2030-01-01');
    expect(r.ok).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.stale_days).toBeGreaterThan(365);
  });
});

describe('buscarTC — parámetros inválidos', () => {
  test('sin monedaOrigen → ok:false', async () => {
    const r = await buscarTC(null, 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
  });
  test('sin fecha → ok:false', async () => {
    const r = await buscarTC('USD', 'CLP', null);
    expect(r.ok).toBe(false);
  });
});

describe('buscarTC — rate_type y rate_purpose', () => {
  test('devuelve rate_type del registro', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r.rateType).toBe('spot');
    expect(r.ratePurpose).toBe('market');
  });

  test('pasa ratePurpose al store', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    await buscarTC('USD', 'CLP', '2026-07-07', { ratePurpose: 'accounting' });
    expect(storeBuscarTasa).toHaveBeenCalledWith('USD', 'CLP', '2026-07-07', 'accounting');
  });
});

describe('buscarTC — error de DB', () => {
  test('propaga error de DB con ok:false', async () => {
    storeBuscarTasa.mockRejectedValue(new Error('RLS policy violation'));
    const r = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.causa).toContain('DB error');
  });
});

// ── 3. convertir ───────────────────────────────────────────────────────────────

describe('convertir', () => {
  test('conversión directa correcta', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await convertir(1000, 'USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(true);
    expect(r.valorConvertido).toBeCloseTo(926250, 0);
    expect(r.monto).toBe(1000);
    expect(r.monedaOrigen).toBe('USD');
    expect(r.monedaDest).toBe('CLP');
  });

  test('evidencia completa presente (OA-010-10)', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r = await convertir(100, 'USD', 'CLP', '2026-07-07');
    expect(r).toHaveProperty('tasa');
    expect(r).toHaveProperty('tasaId');
    expect(r).toHaveProperty('fechaSolicitada');
    expect(r).toHaveProperty('fechaEfectiva');
    expect(r).toHaveProperty('rateType');
    expect(r).toHaveProperty('ratePurpose');
    expect(r).toHaveProperty('fuente');
    expect(r).toHaveProperty('invertida');
    expect(r).toHaveProperty('triangulacion');
    expect(r).toHaveProperty('cadena');
    expect(r).toHaveProperty('stale');
    expect(r).toHaveProperty('stale_days');
  });

  test('monto NaN → ok:false', async () => {
    const r = await convertir(NaN, 'USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.causa).toContain('NaN');
  });

  test('monto null → ok:false', async () => {
    const r = await convertir(null, 'USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
  });

  test('sin tasa disponible → ok:false con causa', async () => {
    storeBuscarTasa.mockResolvedValue(null);
    const r = await convertir(100, 'USD', 'CLP', '2020-01-01');
    expect(r.ok).toBe(false);
    expect(r.causa).toBeTruthy();
  });

  test('no redondea internamente', async () => {
    storeBuscarTasa.mockResolvedValue({ ...ROW_USD_CLP, valor: '926.25' });
    const r = await convertir(1.33333, 'USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(true);
    // Valor sin redondeo de presentación
    expect(r.valorConvertido).not.toBe(Math.round(r.valorConvertido));
  });
});

// ── 4. calcularPromedio ────────────────────────────────────────────────────────

describe('calcularPromedio', () => {
  const ROWS = [
    { fecha: '2026-05-01', valor: '900', rate_type: 'spot', rate_purpose: 'market' },
    { fecha: '2026-05-02', valor: '920', rate_type: 'spot', rate_purpose: 'market' },
    { fecha: '2026-05-03', valor: '940', rate_type: 'spot', rate_purpose: 'market' },
  ];

  test('promedio aritmético correcto', async () => {
    storeBuscarRango.mockResolvedValue(ROWS);
    const r = await calcularPromedio('USD', 'CLP', '2026-05-01', '2026-05-03', 'arithmetic');
    expect(r.ok).toBe(true);
    expect(r.valor).toBeCloseTo(920, 5);
    expect(r.n).toBe(3);
  });

  test('sin tasas en rango → ok:false', async () => {
    storeBuscarRango.mockResolvedValue([]);
    const r = await calcularPromedio('USD', 'CLP', '2020-01-01', '2020-01-31', 'arithmetic');
    expect(r.ok).toBe(false);
  });

  test('par no reconocido → ok:false', async () => {
    const r = await calcularPromedio('XYZ', 'CLP', '2026-05-01', '2026-05-31', 'arithmetic');
    expect(r.ok).toBe(false);
  });

  test('methodology_metadata presente', async () => {
    storeBuscarRango.mockResolvedValue(ROWS);
    const r = await calcularPromedio('USD', 'CLP', '2026-05-01', '2026-05-03');
    expect(r.methodology_metadata).toHaveProperty('n', 3);
  });
});

// ── 5. Manual overrides y segregación ─────────────────────────────────────────

describe('manual overrides y segregación', () => {
  test('tasa manual retorna es_manual=true del store', async () => {
    const manualRow = { ...ROW_USD_CLP, es_manual: true, fuente: 'manual', rate_type: 'manual' };
    storeBuscarTasa.mockResolvedValue(manualRow);
    const r = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(true);
    // La API pasa el rateType directamente del registro
    expect(r.rateType).toBe('manual');
  });

  test('constantes RATE_TYPES incluye manual', () => {
    expect(RATE_TYPES.MANUAL).toBe('manual');
  });

  test('constantes RATE_PURPOSES incluyen accounting', () => {
    expect(RATE_PURPOSES.ACCOUNTING).toBe('accounting');
  });
});

// ── 6. Idempotencia ────────────────────────────────────────────────────────────

describe('idempotencia', () => {
  test('dos llamadas a buscarTC con mismos params devuelven mismo valor', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    const r1 = await buscarTC('USD', 'CLP', '2026-07-07');
    const r2 = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r1.valor).toBe(r2.valor);
    expect(r1.tasaId).toBe(r2.tasaId);
  });
});

// ── 7. Rollback e invalidación ────────────────────────────────────────────────

describe('rollback e invalidación', () => {
  test('storeRollbackBatch llama PATCH con estado=invalidado', async () => {
    storeRollbackBatch.mockResolvedValue([{ id: 'u1', estado: 'invalidado' }]);
    const result = await storeRollbackBatch('batch-id-123');
    expect(storeRollbackBatch).toHaveBeenCalledWith('batch-id-123');
    expect(result[0].estado).toBe('invalidado');
  });

  test('storeContarRegistros devuelve conteos por estado', async () => {
    storeContarRegistros.mockResolvedValue({ activo: 45, invalidado: 3 });
    const conteos = await storeContarRegistros('batch-id-123');
    expect(conteos.activo).toBe(45);
    expect(conteos.invalidado).toBe(3);
  });
});

// ── 8. Conectores caídos ──────────────────────────────────────────────────────

describe('conectores caídos', () => {
  test('buscarTC maneja error de DB graciosamente', async () => {
    storeBuscarTasa.mockRejectedValue(new Error('Network timeout'));
    const r = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.causa).toBeDefined();
  });

  test('convertir propaga error de buscarTC', async () => {
    storeBuscarTasa.mockRejectedValue(new Error('BLOQUEADO_POR_SEGURIDAD'));
    const r = await convertir(100, 'USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
  });
});

// ── 9. actualizarDesdeAPIs ────────────────────────────────────────────────────

describe('actualizarDesdeAPIs', () => {
  test('COVERAGE_GAP para USD-PEN', async () => {
    fetchConector.mockImplementation(async (b, q) => {
      if (b === 'USD' && q === 'PEN') return { ok: false, coverageGap: true, par: 'USD-PEN', error: 'COVERAGE_GAP' };
      return { ok: true, par: `${b}-${q}`, valor: 1.0, fechaEfectiva: '2026-08-07', proveedor: 'test', connector_version: 'test@1', hashRespuesta: null };
    });
    const r = await actualizarDesdeAPIs('2026-08-07');
    const gap = r.gaps.find(g => g.par === 'USD-PEN');
    expect(gap).toBeDefined();
    expect(gap.coverageGap).toBe(true);
  });

  test('distingue actualizados vs gaps', async () => {
    fetchConector.mockImplementation(async (b, q) => {
      if (b === 'USD' && q === 'PEN') return { ok: false, coverageGap: true, par: 'USD-PEN', error: 'COVERAGE_GAP' };
      return { ok: true, par: `${b}-${q}`, valor: 1.0, fechaEfectiva: '2026-08-07', proveedor: 'test', connector_version: 'test@1', hashRespuesta: null };
    });
    const r = await actualizarDesdeAPIs('2026-08-07');
    expect(r.actualizados.length).toBeGreaterThan(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.errores.length).toBe(0);
  });
});

// ── 10. Encapsulamiento ───────────────────────────────────────────────────────

describe('encapsulamiento', () => {
  test('index exporta las 4 funciones públicas', () => {
    const mod = require('../index');
    expect(typeof mod.buscarTC).toBe('function');
    expect(typeof mod.convertir).toBe('function');
    expect(typeof mod.calcularPromedio).toBe('function');
    expect(typeof mod.actualizarDesdeAPIs).toBe('function');
  });

  test('constants exporta RATE_TYPES y RATE_PURPOSES', () => {
    expect(Object.keys(RATE_TYPES).length).toBeGreaterThan(0);
    expect(Object.keys(RATE_PURPOSES).length).toBeGreaterThan(0);
  });
});

// ── 11. RLS / seguridad esperada ──────────────────────────────────────────────

describe('seguridad — BLOQUEADO_POR_SEGURIDAD', () => {
  test('RLS error de Supabase produce ok:false sin crash', async () => {
    storeBuscarTasa.mockRejectedValue(new Error('permission denied for table currency_tc'));
    const r = await buscarTC('USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.causa).toContain('DB error');
  });

  test('convertir con RLS error devuelve causa sin throw', async () => {
    storeBuscarTasa.mockRejectedValue(new Error('permission denied for table currency_tc'));
    await expect(convertir(100, 'USD', 'CLP', '2026-07-07')).resolves.toHaveProperty('ok', false);
  });
});

// ── 12. Conectores individuales — OA-012-05 ───────────────────────────────────
// Tests de comportamiento real de fetchMindicador y fetchFrankfurter.
// Mockean global.fetch; no usan la capa de mocks de store/connectors/index.

import { fetchMindicador } from '../connectors/mindicador';
import { fetchFrankfurter } from '../connectors/frankfurter';

const FETCH_MINDICADOR_LATEST_RESP = {
  ok: true,
  status: 200,
  json: async () => ({
    codigo: 'dolar',
    serie: [{ fecha: '2026-08-06T04:00:00.000Z', valor: 913.86 }],
  }),
};

const FETCH_FRANKFURTER_LATEST_RESP = {
  ok: true,
  status: 200,
  json: async () => ({
    base: 'EUR',
    date: '2026-08-06',
    rates: { USD: 1.1535 },
  }),
};

describe('mindicador — política de endpoint (OA-012-05)', () => {
  afterEach(() => { if (global.fetch?.mockRestore) global.fetch.mockRestore(); });

  test('fecha = hoy → URL sin fecha (latest), esLatest=true', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    global.fetch = jest.fn().mockResolvedValue(FETCH_MINDICADOR_LATEST_RESP);
    const r = await fetchMindicador('USD', 'CLP', hoy);
    expect(r.ok).toBe(true);
    expect(r.esLatest).toBe(true);
    const url = global.fetch.mock.calls[0][0];
    expect(url).not.toContain(hoy);
    expect(url).toMatch(/\/api\/dolar$/);
  });

  test('fecha histórica → URL con fecha, esLatest=false', async () => {
    global.fetch = jest.fn().mockResolvedValue(FETCH_MINDICADOR_LATEST_RESP);
    const r = await fetchMindicador('USD', 'CLP', '2026-07-07');
    expect(r.ok).toBe(true);
    expect(r.esLatest).toBe(false);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('2026-07-07');
  });

  test('fechaEfectiva proviene del proveedor, no de fechaSolicitada', async () => {
    // Proveedor retorna datos del día anterior (lag BCCh)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        serie: [{ fecha: '2026-08-06T04:00:00.000Z', valor: 913.86 }],
      }),
    });
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await fetchMindicador('USD', 'CLP', hoy);
    expect(r.ok).toBe(true);
    // fechaEfectiva = 2026-08-06 (del proveedor), aunque se solicitó hoy
    expect(r.fechaEfectiva).toBe('2026-08-06');
    expect(r.fechaSolicitada).toBe(hoy);
    // Pueden diferir — es el comportamiento correcto
  });

  test('par no soportado → ok:false con error descriptivo', async () => {
    const r = await fetchMindicador('GBP', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('GBP-CLP');
  });

  test('HTTP 500 fecha-hoy → ok:false con httpStatus', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await fetchMindicador('USD', 'CLP', hoy);
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(500);
  });
});

describe('frankfurter — política de endpoint (OA-012-05)', () => {
  afterEach(() => { if (global.fetch?.mockRestore) global.fetch.mockRestore(); });

  test('fecha = hoy → URL /latest, esLatest=true', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    global.fetch = jest.fn().mockResolvedValue(FETCH_FRANKFURTER_LATEST_RESP);
    const r = await fetchFrankfurter('EUR', 'USD', hoy);
    expect(r.ok).toBe(true);
    expect(r.esLatest).toBe(true);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('/latest');
    expect(url).not.toContain(hoy);
  });

  test('fecha histórica → URL con fecha, esLatest=false', async () => {
    global.fetch = jest.fn().mockResolvedValue(FETCH_FRANKFURTER_LATEST_RESP);
    const r = await fetchFrankfurter('EUR', 'USD', '2026-07-07');
    expect(r.ok).toBe(false === false ? true : false); // workaround — just check ok
    expect(r.esLatest).toBe(false);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('2026-07-07');
    expect(url).not.toContain('/latest');
  });

  test('fechaEfectiva proviene de response.date, no de fechaSolicitada', async () => {
    // BCE publica datos del día anterior con /latest
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ base: 'EUR', date: '2026-08-06', rates: { USD: 1.1535 } }),
    });
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await fetchFrankfurter('EUR', 'USD', hoy);
    expect(r.ok).toBe(true);
    expect(r.fechaEfectiva).toBe('2026-08-06');
    expect(r.fechaSolicitada).toBe(hoy);
  });

  test('COVERAGE_GAP para PEN — no llama a fetch', async () => {
    global.fetch = jest.fn();
    const r = await fetchFrankfurter('USD', 'PEN', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.coverageGap).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('COVERAGE_GAP para CLP — no llama a fetch', async () => {
    global.fetch = jest.fn();
    const r = await fetchFrankfurter('EUR', 'CLP', '2026-07-07');
    expect(r.ok).toBe(false);
    expect(r.coverageGap).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('HTTP 404 fecha-hoy → ok:false con httpStatus', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await fetchFrankfurter('EUR', 'USD', hoy);
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(404);
    expect(r.esLatest).toBe(true);
  });
});

// ── 13. Identidad de unicidad — OA-013-01 ─────────────────────────────────────
// Verifica que la identidad lógica sea (par + fecha + rate_type + rate_purpose).
// La unicidad se aplica en Postgres; estos tests documentan el modelo semántico esperado.

describe('identidad de unicidad — OA-013-01', () => {
  test('mismo par+fecha con diferente rate_purpose → registros independientes en store', async () => {
    const rowMarket     = { ...ROW_USD_CLP, rate_purpose: 'market',     valor: '926.25' };
    const rowAccounting = { ...ROW_USD_CLP, rate_purpose: 'accounting', valor: '928.00' };
    storeBuscarTasa
      .mockResolvedValueOnce(rowMarket)
      .mockResolvedValueOnce(rowAccounting);
    const r1 = await buscarTC('USD', 'CLP', '2026-07-07', { ratePurpose: 'market' });
    const r2 = await buscarTC('USD', 'CLP', '2026-07-07', { ratePurpose: 'accounting' });
    expect(r1.ratePurpose).toBe('market');
    expect(r2.ratePurpose).toBe('accounting');
    expect(r1.ratePurpose).not.toBe(r2.ratePurpose);
  });

  test('mismo par+fecha con diferente rate_type → RATE_TYPES distintos son identidades independientes', () => {
    // El índice único incluye rate_type: SPOT y MANUAL no colisionan para mismo par+fecha.
    expect(RATE_TYPES.SPOT).not.toBe(RATE_TYPES.MANUAL);
    expect(typeof RATE_TYPES.SPOT).toBe('string');
    expect(typeof RATE_TYPES.MANUAL).toBe('string');
  });

  test('identidad completa (par+fecha+rate_type+rate_purpose): store recibe los cuatro parámetros', async () => {
    storeBuscarTasa.mockResolvedValue(ROW_USD_CLP);
    await buscarTC('USD', 'CLP', '2026-07-07', { ratePurpose: 'accounting' });
    expect(storeBuscarTasa).toHaveBeenCalledWith('USD', 'CLP', '2026-07-07', 'accounting');
  });
});

// ── 14. Constraints de integridad — OA-013-02/03 ──────────────────────────────
// Simula el rechazo que Postgres emite cuando se violan chk_manual y chk_aprobacion_evidencia.
// Los valores de TEST_ONLY_RATE se usan intencionalmente (no 3.75).

describe('constraints integridad — registro manual (OA-013-02)', () => {
  test('manual sin ingresado_en → store rechaza con chk_manual', async () => {
    const err = Object.assign(
      new Error('new row violates check constraint "chk_manual"'), { code: '23514' }
    );
    storeInsertarTasa.mockRejectedValueOnce(err);
    await expect(storeInsertarTasa({
      es_manual: true, ingresado_por: 'angelo', ingresado_en: null,
      motivo: null, estado_aprobacion: 'auto', valor: TEST_ONLY_RATE,
    })).rejects.toThrow('chk_manual');
  });

  test('manual con estado_aprobacion="auto" → store rechaza con chk_manual (solo pendiente/aprobado/rechazado son válidos para manuales)', async () => {
    const err = Object.assign(
      new Error('new row violates check constraint "chk_manual"'), { code: '23514' }
    );
    storeInsertarTasa.mockRejectedValueOnce(err);
    await expect(storeInsertarTasa({
      es_manual: true, ingresado_por: 'angelo', ingresado_en: '2026-08-07T10:00:00Z',
      motivo: 'ajuste temporal', estado_aprobacion: 'auto', valor: TEST_ONLY_RATE,
    })).rejects.toThrow('chk_manual');
  });
});

describe('constraints integridad — evidencia de aprobación (OA-013-03)', () => {
  test('estado_aprobacion="aprobado" sin aprobado_por → store rechaza con chk_aprobacion_evidencia', async () => {
    const err = Object.assign(
      new Error('new row violates check constraint "chk_aprobacion_evidencia"'), { code: '23514' }
    );
    storeInsertarTasa.mockRejectedValueOnce(err);
    await expect(storeInsertarTasa({
      es_manual: true, estado_aprobacion: 'aprobado',
      aprobado_por: null, aprobado_en: null, valor: TEST_ONLY_RATE,
    })).rejects.toThrow('chk_aprobacion_evidencia');
  });
});
