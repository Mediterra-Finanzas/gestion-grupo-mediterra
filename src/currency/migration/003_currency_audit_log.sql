-- src/currency/migration/003_currency_audit_log.sql
-- F2-A · OA-019/020/021/022 · AUTHORIZED FOR EXECUTION (OA-022-07).
-- Transacción completa: 21 assertions — cualquier fallo → ROLLBACK automático.

BEGIN;

-- ── 1. TABLA ─────────────────────────────────────────────────────
CREATE TABLE public.currency_audit_log (
  id                bigserial     PRIMARY KEY,
  request_id        uuid          NOT NULL,   -- HTTP X-Request-Id; clave del replay guard
  execution_id      uuid          NOT NULL,   -- UUID del pipeline, generado internamente
  correlation_id    uuid,
  event_type        text          NOT NULL,
  severity          text          NOT NULL DEFAULT 'info',
  par               text,
  fecha_solicitada  date,
  fecha_efectiva    date,
  rate_type         text,
  rate_purpose      text,
  proveedor         text,
  connector_version text,
  valor             numeric(20,6),
  resultado         text,
  motivo            text,           -- truncado a 500 chars en la RPC (OA-021-07)
  retry_number      smallint      DEFAULT 0,
  http_status       smallint,
  latency_ms        integer,
  hash_respuesta    text,
  metadata          jsonb,
  actor_type        text          NOT NULL DEFAULT 'system',
  actor_id          text,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- ── 2. INDEXES ───────────────────────────────────────────────────
CREATE INDEX ix_cal_execution   ON public.currency_audit_log (execution_id);
CREATE INDEX ix_cal_par_fecha   ON public.currency_audit_log (par, fecha_solicitada);
CREATE INDEX ix_cal_event_time  ON public.currency_audit_log (event_type, created_at DESC);
CREATE INDEX ix_cal_severity    ON public.currency_audit_log (severity, created_at DESC)
  WHERE severity IN ('warn', 'error', 'critical');

-- Replay guard: pipeline hace INSERT scheduler_start como primera operación.
-- Segundo request con mismo request_id → unique violation → 409 replay_detected.
-- OA-021-05: el INSERT scheduler_start debe ocurrir ANTES de cualquier fetch externo.
CREATE UNIQUE INDEX ix_cal_replay_guard
  ON public.currency_audit_log (request_id)
  WHERE event_type = 'scheduler_start';

-- ── 3. REVOKE TABLA + SECUENCIA — OA-021-01 ─────────────────────
-- Revocar de todos los roles incluyendo service_role.
-- service_role bypasses RLS, así que el control real es por SQL privileges.
REVOKE ALL PRIVILEGES ON TABLE public.currency_audit_log
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL PRIVILEGES ON SEQUENCE public.currency_audit_log_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. RLS — defensa en profundidad ─────────────────────────────
ALTER TABLE public.currency_audit_log ENABLE ROW LEVEL SECURITY;
-- Sin policies → anon/authenticated rechazados incluso si obtuvieran privileges.
-- No usar USING(true) — bloqueo total es la intención.

-- ── 5. RPC SECURITY DEFINER — OA-020-03 / OA-021-02/03 ─────────
CREATE OR REPLACE FUNCTION public.insert_currency_audit_event(
  p_request_id        uuid,
  p_execution_id      uuid,
  p_event_type        text,
  p_severity          text            DEFAULT 'info',
  p_par               text            DEFAULT NULL,
  p_fecha_solicitada  date            DEFAULT NULL,
  p_fecha_efectiva    date            DEFAULT NULL,
  p_rate_type         text            DEFAULT NULL,
  p_rate_purpose      text            DEFAULT NULL,
  p_proveedor         text            DEFAULT NULL,
  p_connector_version text            DEFAULT NULL,
  p_valor             numeric(20,6)   DEFAULT NULL,
  p_resultado         text            DEFAULT NULL,
  p_motivo            text            DEFAULT NULL,
  p_retry_number      smallint        DEFAULT 0,
  p_http_status       smallint        DEFAULT NULL,
  p_latency_ms        integer         DEFAULT NULL,
  p_hash_respuesta    text            DEFAULT NULL,
  p_metadata          jsonb           DEFAULT NULL,
  p_actor_type        text            DEFAULT 'system',
  p_actor_id          text            DEFAULT NULL,
  p_correlation_id    uuid            DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''   -- OA-021-02: sin resolución implícita de objetos
AS $$
BEGIN
  IF p_event_type NOT IN (
    'scheduler_start', 'scheduler_end', 'fetch', 'retry',
    'provider_error', 'normalize', 'validate', 'dry_run_decision',
    'coverage_gap', 'security_reject'
  ) THEN
    RAISE EXCEPTION 'event_type inválido: %', p_event_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_severity NOT IN ('info', 'warn', 'error', 'critical') THEN
    RAISE EXCEPTION 'severity inválida: %', p_severity
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.currency_audit_log (
    request_id, execution_id, correlation_id, event_type, severity,
    par, fecha_solicitada, fecha_efectiva, rate_type, rate_purpose,
    proveedor, connector_version, valor, resultado,
    motivo,
    retry_number, http_status, latency_ms, hash_respuesta,
    metadata, actor_type, actor_id
  ) VALUES (
    p_request_id, p_execution_id, p_correlation_id, p_event_type, p_severity,
    p_par, p_fecha_solicitada, p_fecha_efectiva, p_rate_type, p_rate_purpose,
    p_proveedor, p_connector_version, p_valor, p_resultado,
    left(p_motivo, 500),    -- limitar input no confiable (OA-021-07)
    p_retry_number, p_http_status, p_latency_ms, p_hash_respuesta,
    p_metadata, p_actor_type, p_actor_id
  );
END;
$$;

-- OA-021-03: PostgreSQL otorga EXECUTE a PUBLIC por defecto al crear la función.
-- Revocar explícitamente antes de grant selectivo.
REVOKE EXECUTE
  ON FUNCTION public.insert_currency_audit_event(
    uuid, uuid, text, text, text, date, date, text, text, text, text,
    numeric, text, text, smallint, smallint, integer, text, jsonb, text, text, uuid
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.insert_currency_audit_event(
    uuid, uuid, text, text, text, date, date, text, text, text, text,
    numeric, text, text, smallint, smallint, integer, text, jsonb, text, text, uuid
  )
  TO service_role;

-- ── 6. ASSERTIONS — OA-021-04/08 + OA-022-01 ───────────────────
-- 21 checks: 5 privs × 3 roles (tabla=15) + 3 roles (secuencia=3) + 3 roles (RPC=3).
-- RAISE EXCEPTION dentro del DO → ROLLBACK automático del BEGIN.
DO $$
DECLARE v boolean;
BEGIN
  -- ── Tabla: anon — ningún privilegio ──────────────────────────
  SELECT has_table_privilege('anon', 'public.currency_audit_log', 'SELECT')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon tiene SELECT en audit_log'; END IF;

  SELECT has_table_privilege('anon', 'public.currency_audit_log', 'INSERT')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon tiene INSERT en audit_log'; END IF;

  SELECT has_table_privilege('anon', 'public.currency_audit_log', 'UPDATE')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon tiene UPDATE en audit_log'; END IF;

  SELECT has_table_privilege('anon', 'public.currency_audit_log', 'DELETE')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon tiene DELETE en audit_log'; END IF;

  SELECT has_table_privilege('anon', 'public.currency_audit_log', 'TRUNCATE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon tiene TRUNCATE en audit_log'; END IF;

  -- ── Tabla: authenticated — ningún privilegio ─────────────────
  SELECT has_table_privilege('authenticated', 'public.currency_audit_log', 'SELECT')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated tiene SELECT en audit_log'; END IF;

  SELECT has_table_privilege('authenticated', 'public.currency_audit_log', 'INSERT')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated tiene INSERT en audit_log'; END IF;

  SELECT has_table_privilege('authenticated', 'public.currency_audit_log', 'UPDATE')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated tiene UPDATE en audit_log'; END IF;

  SELECT has_table_privilege('authenticated', 'public.currency_audit_log', 'DELETE')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated tiene DELETE en audit_log'; END IF;

  SELECT has_table_privilege('authenticated', 'public.currency_audit_log', 'TRUNCATE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated tiene TRUNCATE en audit_log'; END IF;

  -- ── Tabla: service_role — CRUD directo bloqueado ─────────────
  -- service_role bypasses RLS → el control real es aquí, en SQL GRANT.
  SELECT has_table_privilege('service_role', 'public.currency_audit_log', 'SELECT')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role tiene SELECT directo en audit_log'; END IF;

  SELECT has_table_privilege('service_role', 'public.currency_audit_log', 'INSERT')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role tiene INSERT directo en audit_log — solo vía RPC'; END IF;

  SELECT has_table_privilege('service_role', 'public.currency_audit_log', 'UPDATE')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role tiene UPDATE directo en audit_log'; END IF;

  SELECT has_table_privilege('service_role', 'public.currency_audit_log', 'DELETE')   INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role tiene DELETE directo en audit_log'; END IF;

  SELECT has_table_privilege('service_role', 'public.currency_audit_log', 'TRUNCATE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role tiene TRUNCATE en audit_log'; END IF;

  -- ── Secuencia — ningún rol tiene USAGE directo ────────────────
  SELECT has_sequence_privilege('anon', 'public.currency_audit_log_id_seq', 'USAGE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon tiene USAGE en audit_log_id_seq'; END IF;

  SELECT has_sequence_privilege('authenticated', 'public.currency_audit_log_id_seq', 'USAGE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated tiene USAGE en audit_log_id_seq'; END IF;

  SELECT has_sequence_privilege('service_role', 'public.currency_audit_log_id_seq', 'USAGE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role tiene USAGE directo en audit_log_id_seq'; END IF;

  -- ── RPC EXECUTE — solo service_role ───────────────────────────
  SELECT has_function_privilege('anon',
    'public.insert_currency_audit_event(uuid,uuid,text,text,text,date,date,text,text,text,text,numeric,text,text,smallint,smallint,integer,text,jsonb,text,text,uuid)',
    'EXECUTE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: anon puede ejecutar audit RPC'; END IF;

  SELECT has_function_privilege('authenticated',
    'public.insert_currency_audit_event(uuid,uuid,text,text,text,date,date,text,text,text,text,numeric,text,text,smallint,smallint,integer,text,jsonb,text,text,uuid)',
    'EXECUTE') INTO v;
  IF v THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated puede ejecutar audit RPC'; END IF;

  SELECT has_function_privilege('service_role',
    'public.insert_currency_audit_event(uuid,uuid,text,text,text,date,date,text,text,text,text,numeric,text,text,smallint,smallint,integer,text,jsonb,text,text,uuid)',
    'EXECUTE') INTO v;
  IF NOT v THEN RAISE EXCEPTION 'ASSERTION FAILED: service_role NO puede ejecutar audit RPC'; END IF;

  RAISE NOTICE 'ASSERTIONS OK — currency_audit_log: 21 privilege checks passed';
END;
$$;

COMMIT;
