/* eslint-disable */
// =============================================================================
// PostingPipeline.js — OA-024-09
// Orchestración de ingesta Contec → acc_* tables (Balance ESF y EERR)
// =============================================================================
// SCOPE:
//   Phase 1 — PREFLIGHT: parse → aggregate → validate → mapping check → report
//   Phase 2 — MAPPING GATE: cobertura por cuenta + materialidad
//   Phase 3 — POSTING: acc_source_batch lifecycle + acc_source_balance_detail
//             + acc_account_balance (atómico, idempotente, con lineage)
//
// FROZEN CONSTRAINTS — no modificar:
//   - ContecAdapter.js: módulo puro de transformación, sin I/O
//   - anfParser.js: módulo legacy, sin modificar
//   - acc_account_balance UNIQUE: (entity_id, period_id, account_code, balance_type)
//   - acc_source_balance_detail: preserva CC completo antes de agregar
//   - RLS: fail-closed anon, authenticated broad V1
//
// DEPENDENCIAS:
//   - xlsx-js-style: parsing Excel (ya presente en el build)
//   - ContecAdapter: parsers + aggregators + validators
//   - supabase: cliente inyectado como parámetro (no importado)
// =============================================================================

import * as XLSX from 'xlsx-js-style';
import {
  parseBalanceContec,
  parseEerrContec,
  aggregateEerrToCanonical,
  aggregateBalanceToCanonical,
  validateAggregateInvariant,
  buildMappingIssues,
  detectReportType,
  REPORT_TYPES,
  RECONCILIATION_TOLERANCE,
} from '../../accountingAdapters/ContecAdapter.js';


// =============================================================================
// CONSTANTES
// =============================================================================

export const PIPELINE_VERSION = 'v1';

// Severity mínima que bloquea la transición PENDING_APPROVAL → APPROVED
export const BLOCKING_SEVERITY = 'FATAL';

// Threshold de materialidad para reportar cuenta sin mapping (en unidad monetaria)
export const MATERIALITY_THRESHOLD = RECONCILIATION_TOLERANCE;

// Patrón de path en Storage
// {entity_uuid}/{fiscal_year}/{period_code}/{batch_uuid}/{filename}
export const storagePathFor = (entityId, fiscalYear, periodCode, batchId, fileName) =>
  `${entityId}/${fiscalYear}/${periodCode}/${batchId}/${fileName}`;


// =============================================================================
// UTILIDADES
// =============================================================================

// SHA-256 del buffer del archivo (Web Crypto API, disponible en browser moderno)
export async function hashBuffer(buffer) {
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parsea el primer sheet de un Excel como array-of-arrays
// @param {ArrayBuffer} buffer
// @param {number} sheetIndex — 0-based index del sheet (default 0)
// @returns {(string|number|null)[][]}
export function parseWorksheetRows(buffer, sheetIndex = 0) {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheetName = wb.SheetNames[sheetIndex];
  if (!sheetName) {
    throw new Error(`PostingPipeline: El archivo no tiene sheet en índice ${sheetIndex}.`);
  }
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}


// =============================================================================
// PHASE 1 — PREFLIGHT
// =============================================================================

/**
 * Corre el preflight local del archivo Contec.
 * NO escribe en Supabase. Ideal para DRY RUN y validación antes del posting real.
 *
 * @param {ArrayBuffer} buffer — contenido del archivo Excel
 * @param {Object} opts
 * @param {string} opts.reportType — 'balance' | 'eerr_periodo' | 'eerr_acumulado' | 'auto'
 * @param {string} opts.sourceCurrency — ISO 4217, eg 'USD'
 * @param {string} [opts.entityId] — UUID de core_entities (requerido para mapping check)
 * @param {Object} [opts.supabase] — cliente Supabase JS (requerido para mapping check)
 * @param {string} [opts.fileName] — nombre original del archivo (para el report)
 * @returns {Promise<PreflightReport>}
 */
export async function runPreflight(buffer, opts = {}) {
  const {
    reportType = 'auto',
    sourceCurrency,
    entityId,
    supabase,
    fileName = 'archivo.xlsx',
  } = opts;

  const report = {
    // Metadata del archivo
    file_name: fileName,
    file_hash: null,
    report_type_input: reportType,
    report_type_detected: null,
    report_type_used: null,
    source_currency: sourceCurrency,

    // Parse
    source_rows_count: 0,
    parse_ok: false,
    parse_error: null,

    // Aggregate + Invariant
    canonical_rows_count: 0,
    invariant_ok: false,
    invariant_error: null,

    // Mapping (solo si supabase + entityId disponibles)
    mapping_checked: false,
    total_accounts: 0,
    mapped_accounts: 0,
    unmapped_accounts: [],      // [{code, name, net_balance}]
    unmapped_with_balance: 0,   // cuentas con |net_balance| > MATERIALITY_THRESHOLD
    coverage_pct: null,

    // Issues generados
    issues: [],

    // Readiness
    ready_to_post: false,
    blockers: [],
    warnings: [],

    // Datos de trabajo (para UI + tests)
    source_rows: [],
    canonical_rows: [],
  };

  // ── Hash del archivo ──────────────────────────────────────────────────────
  try {
    report.file_hash = await hashBuffer(buffer);
  } catch (e) {
    report.blockers.push(`Hash SHA-256 falló: ${e.message}`);
    return report;
  }

  // ── Parse de rows del Excel ───────────────────────────────────────────────
  let rows;
  try {
    rows = parseWorksheetRows(buffer);
  } catch (e) {
    report.parse_error = e.message;
    report.blockers.push(`Parse Excel falló: ${e.message}`);
    return report;
  }

  // ── Detección de tipo de reporte ──────────────────────────────────────────
  const detectedType = detectReportType(rows);
  report.report_type_detected = detectedType;
  const resolvedType = reportType === 'auto' ? detectedType : reportType;
  report.report_type_used = resolvedType;

  if (!resolvedType) {
    report.parse_error = 'No se pudo detectar el tipo de reporte (Balance o EERR).';
    report.blockers.push(report.parse_error);
    return report;
  }

  // ── Validación de sourceCurrency ──────────────────────────────────────────
  if (!sourceCurrency || sourceCurrency.length !== 3) {
    report.blockers.push(`sourceCurrency inválido: "${sourceCurrency}". Requerido CHAR(3).`);
    return report;
  }

  // ── Parse según tipo de reporte ───────────────────────────────────────────
  let sourceRows = [];
  try {
    if (resolvedType === REPORT_TYPES.BALANCE) {
      sourceRows = parseBalanceContec(rows, sourceCurrency);
    } else {
      sourceRows = parseEerrContec(rows, resolvedType, sourceCurrency);
    }
    report.parse_ok = true;
    report.source_rows_count = sourceRows.length;
    report.source_rows = sourceRows;
  } catch (e) {
    report.parse_error = e.message;
    report.blockers.push(`Parser ContecAdapter falló: ${e.message}`);
    return report;
  }

  if (sourceRows.length === 0) {
    report.warnings.push('El archivo no tiene filas con datos (después de filtrar subtotales/grupos).');
  }

  // ── Aggregation → canonical ───────────────────────────────────────────────
  let canonicalRows = [];
  try {
    if (resolvedType === REPORT_TYPES.BALANCE) {
      canonicalRows = aggregateBalanceToCanonical(sourceRows);
    } else {
      canonicalRows = aggregateEerrToCanonical(sourceRows);
    }
    report.canonical_rows_count = canonicalRows.length;
    report.canonical_rows = canonicalRows;
  } catch (e) {
    report.blockers.push(`Aggregation falló: ${e.message}`);
    return report;
  }

  // ── Invariant check ───────────────────────────────────────────────────────
  try {
    if (resolvedType !== REPORT_TYPES.BALANCE) {
      // Para EERR: validar que SUM(CC) = canonical por cuenta
      validateAggregateInvariant(sourceRows, canonicalRows);
    }
    // Para Balance: invariante es 1:1, siempre OK
    report.invariant_ok = true;
  } catch (e) {
    report.invariant_ok = false;
    report.invariant_error = e.message;
    report.blockers.push(`Invariant de lineage violado: ${e.message}`);
    return report;
  }

  // ── Mapping check (requiere supabase + entityId) ──────────────────────────
  report.total_accounts = canonicalRows.length;

  if (supabase && entityId) {
    try {
      const mappings = await loadChartMappings(supabase, entityId);
      report.mapping_checked = true;

      const unmapped = [];
      let mappedCount = 0;
      canonicalRows.forEach(row => {
        if (mappings.has(row.account_code)) {
          mappedCount++;
        } else {
          unmapped.push({
            code: row.account_code,
            name: row.account_name,
            net_balance: row.net_balance,
          });
        }
      });

      report.mapped_accounts = mappedCount;
      report.unmapped_accounts = unmapped;
      report.unmapped_with_balance = unmapped.filter(
        u => Math.abs(u.net_balance) > MATERIALITY_THRESHOLD
      ).length;
      report.coverage_pct = canonicalRows.length > 0
        ? Math.round((mappedCount / canonicalRows.length) * 10000) / 100
        : 100;

      // Generar issues desde ContecAdapter (para cuentas con saldo sin mapping)
      const mappingFn = (code) => mappings.has(code);
      report.issues = buildMappingIssues(canonicalRows, mappingFn);
    } catch (e) {
      report.warnings.push(`Mapping check falló (no bloquea preflight): ${e.message}`);
    }
  }

  // ── Readiness final ───────────────────────────────────────────────────────
  const fatalIssues = report.issues.filter(i => i.severity === 'FATAL');
  if (fatalIssues.length > 0) {
    report.blockers.push(`${fatalIssues.length} issue(s) FATAL sin resolver.`);
  }

  report.ready_to_post = report.parse_ok
    && report.invariant_ok
    && report.blockers.length === 0;

  return report;
}


// =============================================================================
// PHASE 2 — MAPPING GATE
// =============================================================================

/**
 * Carga los mappings vigentes de acc_chart_mapping para una entidad.
 * Retorna un Map keyed por local_account_code.
 *
 * @param {Object} supabase
 * @param {string} entityId
 * @returns {Promise<Map<string, MappingEntry>>}
 */
export async function loadChartMappings(supabase, entityId) {
  const { data, error } = await supabase
    .from('acc_chart_mapping')
    .select('local_account_code, reporting_account_id, is_active, effective_to, notes')
    .eq('entity_id', entityId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`loadChartMappings: Supabase error: ${error.message}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const map = new Map();
  (data || []).forEach(row => {
    // Filtrar expirados (effective_to < hoy)
    if (row.effective_to && row.effective_to < today) return;
    map.set(row.local_account_code, {
      reporting_account_id: row.reporting_account_id,
      notes: row.notes,
    });
  });

  return map;
}

/**
 * Evalúa la cobertura de mapping de una lista de canonical rows.
 * Retorna el reporte de completitud para el gate de materialidad.
 *
 * @param {CanonicalBalanceRow[]} canonicalRows
 * @param {Map<string, MappingEntry>} mappings
 * @returns {MappingCompletenessReport}
 */
export function evalMappingCompleteness(canonicalRows, mappings) {
  const total = canonicalRows.length;
  const mapped = [];
  const unmapped = [];

  canonicalRows.forEach(row => {
    if (mappings.has(row.account_code)) {
      mapped.push(row);
    } else {
      unmapped.push(row);
    }
  });

  const unmappedWithBalance = unmapped.filter(
    r => Math.abs(r.net_balance) > MATERIALITY_THRESHOLD
  );

  return {
    total_accounts: total,
    mapped_count: mapped.length,
    unmapped_count: unmapped.length,
    unmapped_with_balance: unmappedWithBalance.length,
    coverage_pct: total > 0 ? Math.round((mapped.length / total) * 10000) / 100 : 100,
    can_post: unmappedWithBalance.length === 0,
    unmapped_detail: unmapped.map(r => ({
      account_code: r.account_code,
      account_name: r.account_name,
      net_balance: r.net_balance,
      material: Math.abs(r.net_balance) > MATERIALITY_THRESHOLD,
    })),
  };
}


// =============================================================================
// PHASE 3 — POSTING PIPELINE
// =============================================================================

/**
 * Crea una fila en acc_source_batch con estado inicial CREATED.
 * Requiere: authenticated con INSERT en acc_source_batch (migration 020).
 *
 * @param {Object} supabase
 * @param {Object} spec
 * @param {string} spec.entityId
 * @param {string} spec.sourceSystem — 'contec'
 * @param {string} spec.fileName
 * @param {string} spec.fileHash
 * @param {string} [spec.periodId] — UUID de acc_period
 * @param {string} spec.reportType — 'balance' | 'eerr_periodo' | 'eerr_acumulado'
 * @param {number} [spec.rowCount]
 * @param {string} [spec.importedBy]
 * @param {string} [spec.storageBucket]
 * @param {string} [spec.storagePath]
 * @param {string} [spec.mimeType]
 * @param {number} [spec.fileSizeBytes]
 * @returns {Promise<{ batchId: string }>}
 */
export async function createBatch(supabase, spec) {
  const payload = {
    entity_id:      spec.entityId,
    source_system:  spec.sourceSystem || 'contec',
    file_name:      spec.fileName,
    file_hash:      spec.fileHash,
    period_id:      spec.periodId || null,
    report_type:    spec.reportType,
    status:         'CREATED',
    row_count:      spec.rowCount || 0,
    imported_by:    spec.importedBy || null,
    storage_bucket: spec.storageBucket || null,
    storage_path:   spec.storagePath  || null,
    mime_type:      spec.mimeType     || null,
    file_size_bytes: spec.fileSizeBytes || null,
  };

  const { data, error } = await supabase
    .from('acc_source_batch')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    // Código 23505 = unique violation → archivo ya procesado (idempotencia T6)
    if (error.code === '23505') {
      throw new Error(
        `PostingPipeline: El archivo ya fue procesado (file_hash UNIQUE). ` +
        `Verificar el batch existente antes de re-procesar.`
      );
    }
    throw new Error(`createBatch: ${error.message}`);
  }

  return { batchId: data.id };
}

/**
 * Transiciona el status de un batch en acc_source_batch.
 * El trigger trg_acc_source_batch_lifecycle valida las transiciones permitidas.
 *
 * @param {Object} supabase
 * @param {string} batchId
 * @param {string} toStatus — status destino
 * @param {Object} [extra] — campos adicionales a incluir en el UPDATE
 * @param {string} [entityId] — UUID de core_entities; agrega filtro de aislamiento B3
 * @returns {Promise<void>}
 */
export async function transitionBatch(supabase, batchId, toStatus, extra = {}, entityId = null) {
  const payload = { status: toStatus, ...extra };

  let query = supabase
    .from('acc_source_batch')
    .update(payload)
    .eq('id', batchId);

  if (entityId) {
    query = query.eq('entity_id', entityId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(
      `transitionBatch → ${toStatus} (batch ${batchId}): ${error.message}`
    );
  }
}

/**
 * Inserta las filas de detalle source en acc_source_balance_detail.
 * Preserva granularidad CC completa (una fila por account_code × cost_center).
 * Requiere: migration 016 ejecutada en Supabase.
 *
 * @param {Object} supabase
 * @param {string} batchId
 * @param {(BalanceSourceRow|EerrSourceRow)[]} sourceRows
 * @returns {Promise<{ count: number }>}
 */
export async function insertSourceDetail(supabase, batchId, sourceRows) {
  if (sourceRows.length === 0) return { count: 0 };

  const rows = sourceRows.map(r => ({
    batch_id:            batchId,
    source_row_ref:      r.source_row_ref,
    source_report_type:  r.source_report_type,
    source_account_code: r.source_account_code,
    source_account_name: r.source_account_name || null,
    cost_center_code:    r.cost_center_code    || null,
    nature:              r.nature              || null,
    class:               r.class               || null,
    subclass:            r.subclass            || null,
    actual_amount:       r.actual_amount       ?? null,
    budget_amount:       r.budget_amount       ?? null,
    variance_amount:     r.variance_amount     ?? null,
    ytd_debit:           r.ytd_debit           ?? null,
    ytd_credit:          r.ytd_credit          ?? null,
    debit_balance:       r.debit_balance       ?? null,
    credit_balance:      r.credit_balance      ?? null,
    source_currency:     r.source_currency     || 'USD',
  }));

  // Insertar en chunks de 500 para evitar límites de request
  const CHUNK_SIZE = 500;
  let totalCount = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('acc_source_balance_detail')
      .insert(chunk);

    if (error) {
      throw new Error(
        `insertSourceDetail (chunk ${i}–${i + chunk.length}): ${error.message}`
      );
    }
    totalCount += chunk.length;
  }

  return { count: totalCount };
}

/**
 * @deprecated INTERNAL — no llamar desde la UI.
 * Las escrituras al ledger son exclusivamente vía fn_acc_post_batch (RPC, SECURITY DEFINER).
 * Esta función queda aquí como referencia de la estructura de datos; no se exporta en el
 * contrato público de PostingPipeline. Cualquier llamada directa desde el frontend viola
 * el modelo de seguridad C (Hybrid Controlled).
 *
 * @param {Object} supabase
 * @param {Object} opts
 * @param {string} opts.entityId
 * @param {string} opts.periodId — UUID de acc_period (debe ser 'open' o 'forecast')
 * @param {string} opts.batchId
 * @param {CanonicalBalanceRow[]} opts.canonicalRows
 * @param {Map<string, MappingEntry>} opts.mappings — resultado de loadChartMappings()
 * @param {string} [opts.currency] — moneda (default 'USD')
 * @returns {Promise<{ count: number, skipped_unmapped: number }>}
 */
export async function upsertAccountBalance(supabase, opts) {
  const {
    entityId,
    periodId,
    batchId,
    canonicalRows,
    mappings,
    currency = 'USD',
  } = opts;

  if (canonicalRows.length === 0) return { count: 0, skipped_unmapped: 0 };

  const toInsert = [];
  let skipped = 0;

  canonicalRows.forEach(row => {
    const mapping = mappings.get(row.account_code);
    if (!mapping && Math.abs(row.net_balance) > MATERIALITY_THRESHOLD) {
      // Cuenta material sin mapping → no postear (se reportó como issue)
      skipped++;
      return;
    }

    toInsert.push({
      entity_id:            entityId,
      period_id:            periodId,
      account_code:         row.account_code,
      reporting_account_id: mapping ? mapping.reporting_account_id : null,
      debit_balance:        row.debit_balance,
      credit_balance:       row.credit_balance,
      net_balance:          row.net_balance,
      currency:             currency,
      balance_type:         row.balance_type || 'actual',
      source_batch_id:      batchId,
    });
  });

  if (toInsert.length === 0) {
    return { count: 0, skipped_unmapped: skipped };
  }

  // Supabase JS no soporta ON CONFLICT nativo en .insert() — usar RPC o upsert()
  // upsert() en supabase-js usa ON CONFLICT DO UPDATE para las columnas de onConflict
  const { error } = await supabase
    .from('acc_account_balance')
    .upsert(toInsert, {
      onConflict: 'entity_id,period_id,account_code,balance_type',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`upsertAccountBalance: ${error.message}`);
  }

  return { count: toInsert.length, skipped_unmapped: skipped };
}

/**
 * Inserta issues en acc_source_batch_issue.
 *
 * @param {Object} supabase
 * @param {string} batchId
 * @param {BatchIssueSpec[]} issues — desde buildMappingIssues() u otras validaciones
 * @returns {Promise<{ count: number }>}
 */
export async function createBatchIssues(supabase, batchId, issues) {
  if (issues.length === 0) return { count: 0 };

  const rows = issues.map(i => ({
    batch_id:             batchId,
    source_record_ref:    i.source_record_ref  || null,
    severity:             i.severity,
    issue_code:           i.issue_code,
    field_name:           i.field_name         || null,
    value_found:          i.value_found        || null,
    message:              i.message,
    suggested_resolution: i.suggested_resolution || null,
  }));

  const { error } = await supabase
    .from('acc_source_batch_issue')
    .insert(rows);

  if (error) {
    throw new Error(`createBatchIssues: ${error.message}`);
  }

  return { count: rows.length };
}

/**
 * Verifica que el período existe y está abierto para una entidad.
 *
 * @param {Object} supabase
 * @param {string} entityId
 * @param {string} periodId
 * @returns {Promise<{ id, period_type, fiscal_year, fiscal_month, date_from, date_to, status }>}
 */
export async function fetchPeriod(supabase, entityId, periodId) {
  const { data, error } = await supabase
    .from('acc_period')
    .select('id, entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status')
    .eq('id', periodId)
    .eq('entity_id', entityId)
    .single();

  if (error || !data) {
    throw new Error(
      `fetchPeriod: Period ${periodId} no encontrado para entity ${entityId}. ` +
      `Verificar que 019_alf_acc_period_seed.sql fue ejecutado.`
    );
  }

  if (data.status === 'closed' || data.status === 'locked') {
    throw new Error(
      `fetchPeriod: Period ${periodId} tiene status '${data.status}' — no se puede postear.`
    );
  }

  return data;
}


// =============================================================================
// FULL POSTING ORCHESTRATOR
// =============================================================================

/**
 * Ejecuta el ciclo completo de posting para un archivo Contec.
 * Lifecycle: CREATED → PARSING → PARSED → VALIDATING → VALIDATED
 *            → PENDING_APPROVAL (espera CFO) → APPROVED → POSTING → POSTED
 *
 * IMPORTANTE: Esta función ejecuta hasta VALIDATED y deja el batch en
 * PENDING_APPROVAL. La aprobación (→ APPROVED → POSTING → POSTED) se hace
 * con approveAndPost() tras revisión humana del CFO.
 *
 * @param {Object} supabase
 * @param {Object} opts
 * @param {string} opts.entityId — UUID core_entities
 * @param {ArrayBuffer} opts.buffer — contenido del archivo Excel
 * @param {string} opts.fileName — nombre del archivo
 * @param {string} opts.periodId — UUID acc_period (debe estar 'open')
 * @param {string} opts.reportType — 'balance' | 'eerr_periodo' | 'eerr_acumulado' | 'auto'
 * @param {string} opts.sourceCurrency — ISO 4217
 * @param {string} opts.importedBy — usuario que hace el upload
 * @param {string} [opts.storageBucket] — bucket name (default 'accounting-source')
 * @param {string} [opts.storagePath] — path en el bucket
 * @param {number} [opts.fileSizeBytes]
 * @returns {Promise<PostingIngestResult>}
 */
export async function runIngest(supabase, opts) {
  const {
    entityId,
    buffer,
    fileName,
    periodId,
    reportType = 'auto',
    sourceCurrency,
    importedBy,
    storageBucket = 'accounting-source',
    storagePath,
    fileSizeBytes,
  } = opts;

  const result = {
    batchId:           null,
    status:            'FAILED',
    source_rows:       0,
    canonical_rows:    0,
    issues_created:    0,
    mapped_accounts:   0,
    unmapped_accounts: [],
    preflight:         null,
    error:             null,
  };

  try {
    // ── Preflight local (sin DB writes) ──────────────────────────────────────
    result.preflight = await runPreflight(buffer, {
      reportType,
      sourceCurrency,
      entityId,
      supabase,
      fileName,
    });

    if (!result.preflight.parse_ok || !result.preflight.invariant_ok) {
      result.error = result.preflight.blockers.join('; ');
      return result;
    }

    const { source_rows, canonical_rows, issues, report_type_used } = result.preflight;
    result.source_rows = result.preflight.source_rows_count;
    result.canonical_rows = result.preflight.canonical_rows_count;

    // ── Verificar período ────────────────────────────────────────────────────
    await fetchPeriod(supabase, entityId, periodId);

    // ── Crear batch (CREATED) ────────────────────────────────────────────────
    const fileHash = result.preflight.file_hash;
    const { batchId } = await createBatch(supabase, {
      entityId,
      sourceSystem: 'contec',
      fileName,
      fileHash,
      periodId,
      reportType:   report_type_used,
      rowCount:     source_rows.length,
      importedBy,
      storageBucket,
      storagePath,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSizeBytes,
    });
    result.batchId = batchId;

    // ── PARSING → PARSED: insertar source detail (preserva CC) ───────────────
    await transitionBatch(supabase, batchId, 'PARSING', {}, entityId);
    await insertSourceDetail(supabase, batchId, source_rows);
    await transitionBatch(supabase, batchId, 'PARSED', { row_count: source_rows.length }, entityId);

    // ── VALIDATING → VALIDATED: issues de mapping ─────────────────────────────
    await transitionBatch(supabase, batchId, 'VALIDATING', {}, entityId);
    if (issues.length > 0) {
      const { count } = await createBatchIssues(supabase, batchId, issues);
      result.issues_created = count;
    }
    await transitionBatch(supabase, batchId, 'VALIDATED', {}, entityId);

    // ── → PENDING_APPROVAL: espera human approval del CFO ────────────────────
    await transitionBatch(supabase, batchId, 'PENDING_APPROVAL', {}, entityId);

    result.status            = 'PENDING_APPROVAL';
    result.mapped_accounts   = result.preflight.mapped_accounts;
    result.unmapped_accounts = result.preflight.unmapped_accounts;

  } catch (e) {
    result.error = e.message;
    // Intentar marcar el batch como REJECTED si fue creado
    if (result.batchId) {
      try {
        await transitionBatch(supabase, result.batchId, 'REJECTED', {
          error_detail: e.message,
        }, entityId);
      } catch (_) {
        // Si la transición falla (ej. ya en estado terminal), ignorar
      }
    }
  }

  return result;
}

/**
 * Completa el posting tras la aprobación del CFO.
 * Transiciona: PENDING_APPROVAL → APPROVED (frontend), luego llama a
 * fn_acc_post_batch (RPC, SECURITY DEFINER) que ejecuta POSTING → POSTED
 * de forma atómica en el servidor. Las escrituras a acc_account_balance
 * ocurren exclusivamente dentro del RPC.
 *
 * @param {Object} supabase
 * @param {Object} opts
 * @param {string} opts.batchId
 * @param {string} opts.entityId
 * @param {string} opts.approvedBy — nombre/email del CFO que aprueba
 * @returns {Promise<PostingResult>}
 * El actor de posting se deriva de auth.uid() server-side (B8 — no aceptado del caller).
 */
export async function approveAndPost(supabase, opts) {
  const {
    batchId,
    entityId,
    approvedBy,
    // postedBy eliminado: fn_acc_post_batch lo deriva de auth.uid() server-side (B8)
  } = opts;

  const result = {
    batchId,
    status:        'FAILED',
    posted_count:  0,
    rpc_result:    null,
    error:         null,
  };

  try {
    // PENDING_APPROVAL → APPROVED: acción del CFO registrada con entity isolation
    await transitionBatch(supabase, batchId, 'APPROVED', { approved_by: approvedBy }, entityId);

    // APPROVED → POSTING → POSTED: atomico en el servidor (SECURITY DEFINER)
    // fn_acc_post_batch deriva canonical rows desde acc_source_balance_detail,
    // hace upsert en acc_account_balance y retorna JSONB con resumen.
    // Actor derivado de auth.uid() server-side — no se acepta del cliente (B8).
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('fn_acc_post_batch', {
        p_batch_id: batchId,
      });

    if (rpcError) {
      throw new Error(`fn_acc_post_batch RPC error: ${rpcError.message}`);
    }

    result.rpc_result   = rpcData;
    result.posted_count = rpcData?.posted_count ?? 0;
    result.status       = rpcData?.status ?? 'POSTED';

  } catch (e) {
    result.error = e.message;
    try {
      await transitionBatch(supabase, batchId, 'REJECTED', { error_detail: e.message }, entityId);
    } catch (_) {}
  }

  return result;
}


// =============================================================================
// QUERY HELPERS (para UI)
// =============================================================================

/**
 * Retorna los batches de una entidad (para la UI de histórico).
 *
 * @param {Object} supabase
 * @param {string} entityId
 * @param {number} [limit]
 * @returns {Promise<BatchSummary[]>}
 */
export async function listBatches(supabase, entityId, limit = 50) {
  const { data, error } = await supabase
    .from('acc_source_batch')
    .select(`
      id, source_system, file_name, file_hash, report_type,
      status, row_count, imported_by, imported_at,
      approved_by, approved_at, posted_by, posted_at,
      storage_bucket, storage_path, file_size_bytes,
      created_at, updated_at,
      period:acc_period (
        fiscal_year, fiscal_month, date_from, date_to, status
      )
    `)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listBatches: ${error.message}`);
  return data || [];
}

/**
 * Retorna los issues de un batch específico.
 *
 * @param {Object} supabase
 * @param {string} batchId
 * @returns {Promise<BatchIssue[]>}
 */
export async function listBatchIssues(supabase, batchId) {
  const { data, error } = await supabase
    .from('acc_source_batch_issue')
    .select('*')
    .eq('batch_id', batchId)
    .order('severity')
    .order('created_at');

  if (error) throw new Error(`listBatchIssues: ${error.message}`);
  return data || [];
}

/**
 * Retorna los saldos ya posteados para una entidad + período.
 *
 * @param {Object} supabase
 * @param {string} entityId
 * @param {string} periodId
 * @param {string} [balanceType] — 'actual' (default)
 * @returns {Promise<AccountBalance[]>}
 */
export async function listPostedBalances(supabase, entityId, periodId, balanceType = 'actual') {
  const { data, error } = await supabase
    .from('acc_account_balance')
    .select(`
      id, account_code, debit_balance, credit_balance, net_balance,
      currency, balance_type, source_batch_id,
      reporting_account:acc_reporting_account (code, name, normal_balance)
    `)
    .eq('entity_id', entityId)
    .eq('period_id', periodId)
    .eq('balance_type', balanceType)
    .order('account_code');

  if (error) throw new Error(`listPostedBalances: ${error.message}`);
  return data || [];
}
