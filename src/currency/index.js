/* eslint-disable */
/**
 * src/currency/index.js — API pública del Currency Domain.
 * Todo consumidor importa únicamente desde esta ruta (OA-010-09).
 * No importar desde subdirectorios internos.
 *
 * ESTADO: Fase 1 — BLOQUEADO_POR_SEGURIDAD en Supabase.
 * Las funciones están implementadas y testeadas.
 * Las lecturas de DB fallarán con RLS error hasta que EIAP esté activo.
 */

import {
  rutaConversion,
  normalizarPar,
  aplicarDireccion,
  calcularStaleDays,
  aplicarConversion,
  tasaValida,
  promedioAritmetico,
  promedioMixto,
  tieneCoverageGap,
} from './calc';
import {
  storeBuscarTasa,
  storeInsertarTasa,
  storeCrearBatch,
  storeCompletarBatch,
  storeRollbackBatch,
  storeBuscarRango,
} from './store';
import { fetchConector } from './connectors/index';
import { RATE_TYPES, RATE_PURPOSES, COVERAGE_GAPS, CANONICAL_PAIRS, CURRENCY_DOMAIN_VERSION } from './constants';

export { RATE_TYPES, RATE_PURPOSES, COVERAGE_GAPS, CANONICAL_PAIRS, CURRENCY_DOMAIN_VERSION };

/**
 * buscarTC — busca la tasa más reciente para (origen, destino) en o antes de fecha.
 *
 * Soporta:
 * - Par directo: USD→CLP
 * - Par inverso: CLP→USD (calcula 1/tasa)
 * - Triangulación: PEN→CLP via USD (si existen ambos legs)
 *
 * Devuelve objeto con evidencia completa para reconstrucción (OA-010-10).
 */
export async function buscarTC(monedaOrigen, monedaDest, fecha, opts = {}) {
  const { ratePurpose = 'market', rateType = null } = opts;

  if (!monedaOrigen || !monedaDest || !fecha) {
    return { ok: false, causa: 'Parámetros incompletos: se requiere monedaOrigen, monedaDest, fecha' };
  }

  if (monedaOrigen === monedaDest) {
    return {
      ok: true, valor: 1, tasa: 1, tasaId: null, monedaOrigen, monedaDest,
      fechaSolicitada: fecha, fechaEfectiva: fecha, rateType: 'identidad',
      ratePurpose, fuente: 'identidad', invertida: false, triangulacion: false,
      stale: false, stale_days: 0,
    };
  }

  // Intento directo / inverso
  const norm = normalizarPar(monedaOrigen, monedaDest);
  if (norm) {
    try {
      const row = await storeBuscarTasa(norm.base, norm.quote, fecha, ratePurpose);
      if (row) {
        const stale_days = calcularStaleDays(fecha, row.fecha);
        const valorFinal = aplicarDireccion(parseFloat(row.valor), norm.invertida);
        return {
          ok: true,
          valor: valorFinal,
          tasa: valorFinal,
          tasaId: row.id,
          monedaOrigen,
          monedaDest,
          fechaSolicitada: fecha,
          fechaEfectiva: row.fecha,
          rateType: row.rate_type,
          ratePurpose: row.rate_purpose,
          fuente: row.fuente,
          invertida: norm.invertida,
          triangulacion: false,
          stale: stale_days > 7,
          stale_days,
        };
      }
    } catch (err) {
      return { ok: false, causa: `DB error: ${err.message}`, monedaOrigen, monedaDest, fecha };
    }
  }

  // Triangulación
  const ruta = rutaConversion(monedaOrigen, monedaDest);
  if (ruta.tipo === 'triangulacion') {
    const pivot = ruta.pivot;
    try {
      const normLeg1 = normalizarPar(monedaOrigen, pivot);
      const normLeg2 = normalizarPar(pivot, monedaDest);
      const [row1, row2] = await Promise.all([
        normLeg1 ? storeBuscarTasa(normLeg1.base, normLeg1.quote, fecha, ratePurpose) : null,
        normLeg2 ? storeBuscarTasa(normLeg2.base, normLeg2.quote, fecha, ratePurpose) : null,
      ]);

      if (!row1 || !row2) {
        const faltante = !row1 ? `${monedaOrigen}-${pivot}` : `${pivot}-${monedaDest}`;
        return {
          ok: false,
          causa: `Triangulación incompleta: falta tasa para ${faltante}`,
          monedaOrigen, monedaDest, fecha, triangulacion: true, cadena: ruta.cadena,
        };
      }

      const tasa1 = aplicarDireccion(parseFloat(row1.valor), normLeg1.invertida);
      const tasa2 = aplicarDireccion(parseFloat(row2.valor), normLeg2.invertida);
      const tasaTriang = tasa1 * tasa2;
      const stale1 = calcularStaleDays(fecha, row1.fecha);
      const stale2 = calcularStaleDays(fecha, row2.fecha);
      const stale_days = Math.max(stale1 ?? 0, stale2 ?? 0);

      return {
        ok: true,
        valor: tasaTriang,
        tasa: tasaTriang,
        tasaId: [row1.id, row2.id],
        monedaOrigen, monedaDest,
        fechaSolicitada: fecha,
        fechaEfectiva: row1.fecha,
        rateType: row1.rate_type,
        ratePurpose,
        fuente: `${row1.fuente}+${row2.fuente}`,
        invertida: false,
        triangulacion: true,
        cadena: ruta.cadena,
        stale: stale_days > 7,
        stale_days,
      };
    } catch (err) {
      return { ok: false, causa: `DB error (triangulación): ${err.message}`, monedaOrigen, monedaDest, fecha };
    }
  }

  // Sin ruta disponible
  const gap = tieneCoverageGap(monedaOrigen, monedaDest);
  return {
    ok: false,
    causa: gap
      ? `COVERAGE_GAP: ${monedaOrigen}-${monedaDest} sin cobertura histórica. Ver TD-CUR-001.`
      : `Sin ruta de conversión entre ${monedaOrigen} y ${monedaDest}`,
    monedaOrigen, monedaDest, fecha,
    coverageGap: gap,
  };
}

/**
 * convertir — convierte un monto con evidencia completa (OA-010-10).
 * No redondea internamente.
 */
export async function convertir(monto, monedaOrigen, monedaDest, fecha, opts = {}) {
  if (monto === null || monto === undefined || isNaN(monto)) {
    return { ok: false, causa: 'monto inválido (NaN o null)', monto, monedaOrigen, monedaDest };
  }

  const tasaResult = await buscarTC(monedaOrigen, monedaDest, fecha, opts);
  if (!tasaResult.ok) {
    return {
      ok: false,
      monto,
      monedaOrigen,
      monedaDest,
      causa: tasaResult.causa,
      coverageGap: tasaResult.coverageGap || false,
    };
  }

  const valorConvertido = aplicarConversion(monto, tasaResult.tasa);
  if (valorConvertido === null) {
    return { ok: false, causa: 'Error al aplicar conversión (tasa inválida)', monto, monedaOrigen, monedaDest };
  }

  return {
    ok: true,
    monto,
    monedaOrigen,
    monedaDest,
    valorConvertido,
    tasa: tasaResult.tasa,
    tasaId: tasaResult.tasaId,
    fechaSolicitada: fecha,
    fechaEfectiva: tasaResult.fechaEfectiva,
    rateType: tasaResult.rateType,
    ratePurpose: tasaResult.ratePurpose,
    fuente: tasaResult.fuente,
    invertida: tasaResult.invertida,
    triangulacion: tasaResult.triangulacion || false,
    cadena: tasaResult.cadena || [monedaOrigen, monedaDest],
    stale: tasaResult.stale,
    stale_days: tasaResult.stale_days,
  };
}

/**
 * calcularPromedio — promedio de tasas en un rango de fechas.
 */
export async function calcularPromedio(monedaOrigen, monedaDest, fechaInicio, fechaFin, tipo = 'arithmetic', opts = {}) {
  const { ratePurpose = 'market' } = opts;
  const norm = normalizarPar(monedaOrigen, monedaDest);
  if (!norm) {
    return { ok: false, causa: `Par ${monedaOrigen}-${monedaDest} no reconocido` };
  }

  let rows;
  try {
    rows = await storeBuscarRango(norm.base, norm.quote, fechaInicio, fechaFin, ratePurpose);
  } catch (err) {
    return { ok: false, causa: `DB error: ${err.message}` };
  }

  if (!rows || rows.length === 0) {
    return { ok: false, causa: `Sin tasas en rango ${fechaInicio}–${fechaFin} para ${monedaOrigen}-${monedaDest}` };
  }

  const valores = rows.map(r => aplicarDireccion(parseFloat(r.valor), norm.invertida));
  let valor;
  if (tipo === 'arithmetic' || tipo === RATE_TYPES.ARITHMETIC_AVG) {
    valor = promedioAritmetico(valores);
  } else if (tipo === 'weighted') {
    valor = promedioMixto(rows.map((r, i) => ({ valor: valores[i], peso: 1 })));
  } else {
    return { ok: false, causa: `Tipo de promedio no reconocido: ${tipo}` };
  }

  return {
    ok: true,
    valor,
    tipo,
    n: rows.length,
    fechaInicio: rows[0].fecha,
    fechaFin: rows[rows.length - 1].fecha,
    monedaOrigen,
    monedaDest,
    ratePurpose,
    methodology_metadata: { tipo, n: rows.length, fechas: [rows[0].fecha, rows[rows.length - 1].fecha] },
  };
}

/**
 * actualizarDesdeAPIs — fetch de tasas actuales para todos los pares configurados.
 * OA-010-07: solo como "fecha efectiva actual", no como backfill histórico.
 */
export async function actualizarDesdeAPIs(fecha = new Date().toISOString().slice(0, 10), opts = {}) {
  const resultados = { actualizados: [], omitidos: [], errores: [], gaps: [] };

  for (const [base, quote] of CANONICAL_PAIRS) {
    const resultado = await fetchConector(base, quote, fecha);

    if (resultado.coverageGap) {
      resultados.gaps.push({ par: `${base}-${quote}`, ...resultado });
      continue;
    }

    if (!resultado.ok) {
      resultados.errores.push({ par: `${base}-${quote}`, error: resultado.error, ...resultado });
      continue;
    }

    // Solo insertar si hay acceso (fuera de BLOQUEADO_POR_SEGURIDAD, esto se ejecuta con service_role)
    if (opts.insertar) {
      try {
        await storeInsertarTasa({
          moneda_origen: base,
          moneda_destino: quote,
          fecha: resultado.fechaEfectiva,
          rate_type: 'spot',
          rate_purpose: 'market',
          valor: resultado.valor,
          fuente: resultado.proveedor,
          connector_version: resultado.connector_version,
          obtenido_en: new Date().toISOString(),
          es_manual: false,
          estado: 'activo',
          metadata: {
            httpStatus: resultado.httpStatus,
            latencia: resultado.latencia,
            hashRespuesta: resultado.hashRespuesta,
          },
        });
        resultados.actualizados.push({ par: `${base}-${quote}`, valor: resultado.valor, fecha: resultado.fechaEfectiva });
      } catch (err) {
        resultados.errores.push({ par: `${base}-${quote}`, error: `Insert fallido: ${err.message}` });
      }
    } else {
      resultados.actualizados.push({ par: `${base}-${quote}`, valor: resultado.valor, fecha: resultado.fechaEfectiva, pendienteInsert: true });
    }
  }

  return resultados;
}
