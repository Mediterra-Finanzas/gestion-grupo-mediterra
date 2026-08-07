/* eslint-disable */
/**
 * Capa de datos — currency_tc en Supabase.
 *
 * BLOQUEADO_POR_SEGURIDAD (OA-010-03):
 * RLS habilitada sin políticas hasta que EIAP esté implementado.
 * Las llamadas con anon key devolverán error de RLS.
 * Solo service_role (SQL Editor) puede escribir durante Fase 1.
 */

const SUPA_URL = 'https://bywovqayuzodbzwsriet.supabase.co';
// anon key — acceso bloqueado por RLS hasta autorización OA
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwMjE5OTEsImV4cCI6MjA1ODU5Nzk5MX0.bBq3vFaIvjwD8tOFTEgDiKHKpXEQWKjDiF9pHISzh0A';

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`currency_store [${res.status}]: ${body}`);
  }
  return res.json();
}

/**
 * Busca la tasa canónica más reciente para (base, quote) en o antes de fecha.
 * Solo devuelve registros con estado='activo'.
 */
export async function storeBuscarTasa(base, quote, fecha, ratePurpose = 'market') {
  const params = new URLSearchParams({
    moneda_origen: `eq.${base}`,
    moneda_destino: `eq.${quote}`,
    fecha: `lte.${fecha}`,
    estado: 'eq.activo',
    rate_purpose: `eq.${ratePurpose}`,
    order: 'fecha.desc',
    limit: '1',
  });
  const rows = await supaFetch(`currency_tc?${params}`);
  return rows[0] || null;
}

/**
 * Busca tasas en un rango de fechas para cálculo de promedios.
 */
export async function storeBuscarRango(base, quote, fechaInicio, fechaFin, ratePurpose = 'market') {
  const params = new URLSearchParams({
    moneda_origen: `eq.${base}`,
    moneda_destino: `eq.${quote}`,
    fecha: `gte.${fechaInicio}`,
    'fecha.lte': fechaFin,
    estado: 'eq.activo',
    rate_purpose: `eq.${ratePurpose}`,
    order: 'fecha.asc',
    limit: '500',
  });
  return supaFetch(`currency_tc?${params}`);
}

/**
 * Inserta un registro de tasa.
 * Solo accesible vía service_role durante Fase 1 (BLOQUEADO_POR_SEGURIDAD).
 */
export async function storeInsertarTasa(registro) {
  return supaFetch('currency_tc', {
    method: 'POST',
    body: JSON.stringify(registro),
  });
}

/**
 * Crea un migration batch y devuelve su id.
 */
export async function storeCrearBatch(fuentes, notas) {
  const rows = await supaFetch('currency_migration_batch', {
    method: 'POST',
    body: JSON.stringify({
      status: 'in_progress',
      source_tables: fuentes,
      notes: notas,
    }),
  });
  return rows[0];
}

/**
 * Marca un migration batch como completado.
 */
export async function storeCompletarBatch(batchId, recordCount) {
  const params = new URLSearchParams({ id: `eq.${batchId}` });
  return supaFetch(`currency_migration_batch?${params}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString(), record_count: recordCount }),
  });
}

/**
 * Rollback de un batch: marca todos sus registros como 'invalidado'.
 * No usa DELETE (OA-010-02).
 */
export async function storeRollbackBatch(batchId) {
  const params = new URLSearchParams({ migration_batch_id: `eq.${batchId}`, estado: 'eq.activo' });
  return supaFetch(`currency_tc?${params}`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'invalidado', invalidado_en: new Date().toISOString() }),
  });
}

/**
 * Cuenta registros en currency_tc por estado.
 */
export async function storeContarRegistros(batchId) {
  const params = new URLSearchParams({ migration_batch_id: `eq.${batchId}`, select: 'estado' });
  const rows = await supaFetch(`currency_tc?${params}`);
  return rows.reduce((acc, r) => {
    acc[r.estado] = (acc[r.estado] || 0) + 1;
    return acc;
  }, {});
}
