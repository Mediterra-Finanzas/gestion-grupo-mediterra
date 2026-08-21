/* eslint-disable */
// supabase/functions/currency-fx-capture/index.ts
// F2-A — Edge Function principal. Siempre dry_run:true. No escribe en currency_tc.
// Flujo: validar auth → replay guard DB → pipeline fetch/normalize → dry_run_decision → audit.

import { validateAuth }                               from './security.ts';
import { createAuditClient, writeAuditEvent, ReplayError } from './audit.ts';
import { runPipeline }                                from './pipeline.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  // ── 1. Auth ──────────────────────────────────────────────────────────
  const authResult = await validateAuth(req);

  if (!authResult.ok) {
    // validation_reject (400): UUID malformado o timestamp no numérico.
    // No genera audit event — el request no tiene request_id válido o el TS es basura.
    if (authResult.isValidationReject) {
      return new Response(
        JSON.stringify({ error: 'validation_reject', reason: authResult.reason }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    // security_reject (401): token inválido, timestamp fuera de ventana, headers faltantes.
    // Genera audit event best-effort con metadata=null (OA-022-05: no datos del request).
    const executionId = crypto.randomUUID();
    // requestId: si ya pasó la validación UUID use ese; si faltaban headers generar uno sintético.
    const auditReqId = authResult.requestId ?? crypto.randomUUID();

    const client = createAuditClient();
    try {
      await writeAuditEvent(client, {
        requestId:   auditReqId,
        executionId,
        eventType:   'security_reject',
        severity:    'warn',
        motivo:      authResult.reason,  // string estático de whitelist, nunca del request
        metadata:    null,               // OA-022-05: no raw request, no headers, no tokens
      });
    } catch (_) {
      // best-effort — un fallo de audit no cambia la respuesta al cliente
    }

    return new Response(JSON.stringify({ error: 'security_reject' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  // ── 2. Pipeline ──────────────────────────────────────────────────────
  // Auth ok. requestId ya validado como UUID en security.ts.
  const requestId   = authResult.requestId!;
  const executionId = crypto.randomUUID();
  const client      = createAuditClient();

  try {
    // runPipeline:
    //   - Inserta scheduler_start ANTES de cualquier fetch externo (OA-021-05).
    //     Si request_id ya existe → unique constraint → ReplayError.
    //   - Fetch connectors (mindicador, frankfurter, bcrp stub).
    //   - Normaliza y clasifica resultado (success/coverage_gap/provider_error).
    //   - Inserta dry_run_decision con resultado completo.
    //   - Inserta scheduler_end.
    //   - Retorna PipelineResult con outcome y métricas.
    const result = await runPipeline({ requestId, executionId, client });

    // outcome semántico → HTTP status:
    //   success / partial_success / coverage_gap → 200
    //   provider_error → 503
    const status = result.outcome === 'provider_error' ? 503 : 200;
    return new Response(JSON.stringify(result), { status, headers: JSON_HEADERS });

  } catch (err) {
    if (err instanceof ReplayError) {
      // ix_cal_replay_guard: scheduler_start duplicado con el mismo request_id.
      return new Response(JSON.stringify({ error: 'replay_detected' }), {
        status: 409,
        headers: JSON_HEADERS,
      });
    }

    // Error inesperado — loguear sin exponer detalles al cliente.
    console.error('[currency-fx-capture] internal_error:', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
