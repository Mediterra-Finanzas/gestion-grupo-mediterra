/* eslint-disable */
// supabase/functions/currency-fx-capture/pipeline.ts
// F2-A pipeline: fetch → normalize → dry_run_decision.
// NUNCA escribe en currency_tc. dry_run siempre true.
// OA-021-05: scheduler_start INSERT ocurre ANTES de cualquier fetch externo.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { writeAuditEvent, ReplayError }      from './audit.ts';
import type { ConnectorResult }              from './connectors/types.ts';
import { fetchMindicador, MINDICADOR_PARES } from './connectors/mindicador.ts';
import { fetchFrankfurter }                  from './connectors/frankfurter.ts';
import { fetchBcrp, BCRP_PARES }            from './connectors/bcrp.ts';

export interface PipelineInput {
  requestId:   string;
  executionId: string;
  client:      SupabaseClient;
}

export type PipelineOutcome =
  | 'success'          // todos los pares cubiertos con éxito
  | 'partial_success'  // ≥1 éxito, ≥1 error técnico
  | 'coverage_gap'     // 0 errores técnicos, 0 éxitos (todos son gaps por diseño)
  | 'provider_error';  // 0 éxitos, ≥1 error técnico → HTTP 503

export interface PipelineResult {
  outcome:           PipelineOutcome;
  dry_run:           true;
  success_count:     number;
  error_count:       number;
  coverage_gap_count: number;
  pares_exitosos:    string[];
  pares_fallo:       string[];
  pares_gap:         string[];
  latency_ms_total:  number;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { requestId, executionId, client } = input;
  const t0 = Date.now();
  const today = new Date().toISOString().substring(0, 10);

  // ── 1. scheduler_start — ANTES de cualquier fetch externo (OA-021-05) ────
  // Si request_id ya existe → unique constraint ix_cal_replay_guard → ReplayError.
  await writeAuditEvent(client, {
    requestId,
    executionId,
    eventType:       'scheduler_start',
    severity:        'info',
    fechaSolicitada: today,
    metadata:        {
      dry_run:            true,
      pares_solicitados:  [...MINDICADOR_PARES, 'USD-PEN', 'USD-EUR', 'USD-GBP', 'USD-CNY', 'USD-BRL', 'USD-MXN', 'USD-AUD', 'USD-CAD', 'USD-JPY', 'EUR-USD'],
    },
  });

  // ── 2. Fetch en paralelo ─────────────────────────────────────────────────
  const [mindicadorUsd, mindicadorEur, frankfurterResults, ...bcrpResults] =
    await Promise.all([
      fetchMindicador('USD-CLP'),
      fetchMindicador('EUR-CLP'),
      fetchFrankfurter(),
      ...BCRP_PARES.map(par => fetchBcrp(par)),
    ]);

  const allResults: ConnectorResult[] = [
    mindicadorUsd,
    mindicadorEur,
    ...frankfurterResults,
    ...bcrpResults,
  ];

  // ── 3. Audit fetch events ────────────────────────────────────────────────
  for (const r of allResults) {
    const isCoverageGap = r.error === 'coverage_gap';
    const isError       = r.error !== null && !isCoverageGap;

    await writeAuditEvent(client, {
      requestId,
      executionId,
      eventType:        isCoverageGap ? 'coverage_gap'
                      : isError       ? 'provider_error'
                      :                 'fetch',
      severity:         isError ? 'warn' : 'info',
      par:              r.par,
      fechaSolicitada:  today,
      fechaEfectiva:    r.fechaEfectiva ?? undefined,
      proveedor:        r.proveedor,
      connectorVersion: r.connectorVersion,
      valor:            r.valor ?? undefined,
      resultado:        isError || isCoverageGap ? 'error' : 'ok',
      motivo:           r.error ?? undefined,
      httpStatus:       r.httpStatus ?? undefined,
      latencyMs:        r.latencyMs,
      hashRespuesta:    r.hashRespuesta ?? undefined,
    });
  }

  // ── 4. Clasificar outcome ────────────────────────────────────────────────
  const exitosos  = allResults.filter(r => r.error === null);
  const gaps      = allResults.filter(r => r.error === 'coverage_gap');
  const errores   = allResults.filter(r => r.error !== null && r.error !== 'coverage_gap');

  const successCount      = exitosos.length;
  const errorCount        = errores.length;
  const coverageGapCount  = gaps.length;

  // Clasificación (del diseño OA-022):
  // success_count > 0 → partial_success (si hay ≥1 error técnico también)
  //   o success si 0 errores y 0 gaps
  // success_count == 0 && error_count == 0 → coverage_gap
  // success_count == 0 && error_count > 0  → provider_error → HTTP 503
  let outcome: PipelineOutcome;
  if (successCount > 0) {
    outcome = errorCount === 0 && coverageGapCount === 0 ? 'success' : 'partial_success';
  } else if (errorCount === 0) {
    outcome = 'coverage_gap';
  } else {
    outcome = 'provider_error';
  }

  // ── 5. dry_run_decision ──────────────────────────────────────────────────
  const latencyTotal = Date.now() - t0;
  await writeAuditEvent(client, {
    requestId,
    executionId,
    eventType:  'dry_run_decision',
    severity:   outcome === 'provider_error' ? 'error' : 'info',
    resultado:  outcome,
    motivo:     'F2-A: dry_run=true, no se escribe en currency_tc',
    latencyMs:  latencyTotal,
    metadata: {
      dry_run:            true,
      success_count:      successCount,
      error_count:        errorCount,
      coverage_gap_count: coverageGapCount,
      pares_exitosos:     exitosos.map(r => r.par),
      pares_fallo:        errores.map(r => r.par),
      pares_gap:          gaps.map(r => r.par),
      decision:           outcome,
    },
  });

  // ── 6. scheduler_end ─────────────────────────────────────────────────────
  await writeAuditEvent(client, {
    requestId,
    executionId,
    eventType:  'scheduler_end',
    severity:   outcome === 'provider_error' ? 'error' : 'info',
    latencyMs:  Date.now() - t0,
    resultado:  outcome,
    metadata:   { dry_run: true },
  });

  return {
    outcome,
    dry_run:            true,
    success_count:      successCount,
    error_count:        errorCount,
    coverage_gap_count: coverageGapCount,
    pares_exitosos:     exitosos.map(r => r.par),
    pares_fallo:        errores.map(r => r.par),
    pares_gap:          gaps.map(r => r.par),
    latency_ms_total:   latencyTotal,
  };
}
