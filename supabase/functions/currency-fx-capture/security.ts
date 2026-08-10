/* eslint-disable */
// supabase/functions/currency-fx-capture/security.ts
// OA-020-05: timingSafeEqual de jsr:@std/crypto — no crypto.subtle.timingSafeEqual (no existe en Web Crypto).
// OA-020-06: sin seenRequestIds Set — no persiste entre isolates.
// OA-022-02: UUID_REGEX — valida x-request-id antes de llegar al DB.
// OA-022-03: TS_NUMERIC_REGEX — rechaza timestamps con caracteres no numéricos.

import { timingSafeEqual } from 'jsr:@std/crypto/timing-safe-equal';

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rechaza "123abc", "123.4", strings con espacios, etc.
const TS_NUMERIC_REGEX = /^\d{1,15}$/;

const encoder = new TextEncoder();

async function safeCompare(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  return timingSafeEqual(new Uint8Array(da), new Uint8Array(db));
}

export interface AuthResult {
  ok: boolean;
  isValidationReject?: boolean; // true → HTTP 400, no genera security_reject audit
  reason?: string;              // valor estático de whitelist, nunca del request
  requestId?: string;           // presente solo si ok=true
}

export async function validateAuth(req: Request): Promise<AuthResult> {
  const token     = req.headers.get('x-scheduler-token');
  const requestId = req.headers.get('x-request-id');
  const timestamp = req.headers.get('x-timestamp');

  if (!token || !requestId || !timestamp)
    return { ok: false, reason: 'missing_headers' };

  // OA-022-02: validar UUID antes de cualquier operación DB.
  // Strings malformados no deben producir excepción SQL en p_request_id uuid.
  // validation_reject (400) — no genera security_reject en audit_log.
  if (!UUID_REGEX.test(requestId))
    return { ok: false, reason: 'invalid_request_id', isValidationReject: true };

  // OA-022-03: parseInt('123abc', 10) == 123 en JS — regex primero.
  if (!TS_NUMERIC_REGEX.test(timestamp))
    return { ok: false, reason: 'timestamp_format_invalid', isValidationReject: true };

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS)
    return { ok: false, reason: 'timestamp_out_of_window' };

  const secret = Deno.env.get('SCHEDULER_SECRET') ?? '';
  if (!(await safeCompare(token, secret)))
    return { ok: false, reason: 'invalid_token' };

  // Replay prevention: DB-level vía UNIQUE INDEX ix_cal_replay_guard.
  // El pipeline inserta scheduler_start como primera op — second request falla en DB.
  return { ok: true, requestId };
}
