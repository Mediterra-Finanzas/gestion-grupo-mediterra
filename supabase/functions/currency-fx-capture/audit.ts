/* eslint-disable */
// supabase/functions/currency-fx-capture/audit.ts
// Wrapper sobre la RPC insert_currency_audit_event.
// F2-A: dry_run siempre true — no escribe en currency_tc.
// OA-022-05: metadata = solo campos construidos por pipeline, nunca raw request/headers/secrets.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Campos permitidos en metadata (OA-022-05).
// El pipeline construye objetos que cumplan este contrato; audit.ts no valida internamente.
export interface AuditMetadata {
  dry_run?: boolean;
  pares_solicitados?: string[];
  pares_exitosos?: string[];
  pares_fallo?: string[];
  success_count?: number;
  error_count?: number;
  coverage_gap_count?: number;
  decision?: string;
  [key: string]: unknown; // campos adicionales de pipeline (no del request)
}

export interface AuditEvent {
  requestId: string;
  executionId: string;
  eventType:
    | 'scheduler_start'
    | 'scheduler_end'
    | 'fetch'
    | 'retry'
    | 'provider_error'
    | 'normalize'
    | 'validate'
    | 'dry_run_decision'
    | 'coverage_gap'
    | 'security_reject';
  severity?: 'info' | 'warn' | 'error' | 'critical';
  par?: string;
  fechaSolicitada?: string;   // ISO date YYYY-MM-DD
  fechaEfectiva?: string;
  rateType?: string;
  ratePurpose?: string;
  proveedor?: string;
  connectorVersion?: string;
  valor?: number;
  resultado?: string;
  motivo?: string;
  retryNumber?: number;
  httpStatus?: number;
  latencyMs?: number;
  hashRespuesta?: string;
  metadata?: AuditMetadata | null;
  correlationId?: string;
}

export function createAuditClient(): SupabaseClient {
  const url    = Deno.env.get('SUPABASE_URL')               ?? '';
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? '';
  return createClient(url, svcKey, { auth: { persistSession: false } });
}

export async function writeAuditEvent(
  client: SupabaseClient,
  ev: AuditEvent,
): Promise<void> {
  const { error } = await client.rpc('insert_currency_audit_event', {
    p_request_id:        ev.requestId,
    p_execution_id:      ev.executionId,
    p_event_type:        ev.eventType,
    p_severity:          ev.severity          ?? 'info',
    p_par:               ev.par               ?? null,
    p_fecha_solicitada:  ev.fechaSolicitada   ?? null,
    p_fecha_efectiva:    ev.fechaEfectiva     ?? null,
    p_rate_type:         ev.rateType          ?? null,
    p_rate_purpose:      ev.ratePurpose       ?? null,
    p_proveedor:         ev.proveedor         ?? null,
    p_connector_version: ev.connectorVersion  ?? null,
    p_valor:             ev.valor             ?? null,
    p_resultado:         ev.resultado         ?? null,
    p_motivo:            ev.motivo            ?? null,
    p_retry_number:      ev.retryNumber       ?? 0,
    p_http_status:       ev.httpStatus        ?? null,
    p_latency_ms:        ev.latencyMs         ?? null,
    p_hash_respuesta:    ev.hashRespuesta     ?? null,
    p_metadata:          ev.metadata          ?? null,
    p_actor_type:        'system',
    p_actor_id:          'edge:currency-fx-capture',
    p_correlation_id:    ev.correlationId     ?? null,
  });

  if (error) {
    // Replay guard: unique constraint en scheduler_start con mismo request_id.
    if (error.code === '23505') throw new ReplayError(ev.requestId);
    throw new AuditError(error.message, ev.eventType);
  }
}

export class ReplayError extends Error {
  constructor(public requestId: string) {
    super(`replay_detected: request_id ya existe: ${requestId}`);
    this.name = 'ReplayError';
  }
}

export class AuditError extends Error {
  constructor(message: string, public eventType: string) {
    super(`audit_write_failed [${eventType}]: ${message}`);
    this.name = 'AuditError';
  }
}
