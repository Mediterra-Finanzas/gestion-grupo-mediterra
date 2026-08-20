-- =============================================================================
-- 014_source_adapter_infra.sql
-- OA-024-07 — Source Adapter Framework Infrastructure
-- Fecha   : 2026-08-17
-- Estado  : EJECUTAR DESPUÉS de 013 (rollback script existente, no ejecutado en prod)
--           y ANTES de 015 (test suite OA-024-07)
-- =============================================================================
-- SCOPE:
--   1. Extend acc_source_batch: lifecycle status + new columns
--   2. New table: acc_source_batch_issue
--   3. New table: acc_source_adapter_profile
--   4. Lifecycle trigger + approval gate + fatal-issue gate
--   5. Issue immutability trigger
--   6. fn_acc_check_mapping_completeness (helper function)
--   7. Indexes
--   8. RLS fail-closed for new tables
-- =============================================================================
-- NO INCLUYE: ContecAdapter, anfParser changes, real data, Budget ingestion,
--             EEFFModule, OA-023 Currency, D7/D8 resolution, Storage bucket.
-- =============================================================================
-- REGRESSION: No debe romper OA-024-05 37/37 PASS.
--   TEST-309 usa status='completed'/'pending'. Estos se actualizan a
--   'POSTED'/'CREATED' ANTES de cambiar el constraint.
-- =============================================================================


-- =============================================================================
-- PARTE 1: EXTENDER acc_source_batch
-- =============================================================================

-- Paso 1a: migrar filas existentes con status legacy ANTES de cambiar constraint
UPDATE acc_source_batch SET status = 'CREATED'  WHERE status = 'pending';
UPDATE acc_source_batch SET status = 'PARSING'  WHERE status = 'processing';
UPDATE acc_source_batch SET status = 'POSTED'   WHERE status = 'completed';
UPDATE acc_source_batch SET status = 'REJECTED' WHERE status IN ('failed', 'rejected');

-- Paso 1b: eliminar constraint de status legacy
ALTER TABLE acc_source_batch
  DROP CONSTRAINT IF EXISTS ck_acc_source_batch_status;

-- Paso 1c: agregar nuevo constraint de lifecycle
ALTER TABLE acc_source_batch
  ADD CONSTRAINT ck_acc_source_batch_status CHECK (status IN (
    'CREATED',
    'PARSING',
    'PARSED',
    'VALIDATING',
    'VALIDATED',
    'PENDING_APPROVAL',
    'APPROVED',
    'POSTING',
    'POSTED',
    'SUPERSEDED',
    'ROLLED_BACK',
    'REJECTED'
  ));

-- Paso 1d: cambiar default al nuevo valor inicial del lifecycle
ALTER TABLE acc_source_batch
  ALTER COLUMN status SET DEFAULT 'CREATED';

-- Paso 1e: agregar columnas nuevas (additive — no rompe filas existentes)
ALTER TABLE acc_source_batch
  ADD COLUMN IF NOT EXISTS report_type       TEXT,
  ADD COLUMN IF NOT EXISTS approved_by       TEXT,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by         TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by_id  UUID
    REFERENCES acc_source_batch(id) ON DELETE SET NULL;

-- Paso 1f: constraint report_type
ALTER TABLE acc_source_batch
  ADD CONSTRAINT ck_acc_source_batch_report_type CHECK (
    report_type IS NULL
    OR report_type IN ('balance', 'eerr_periodo', 'eerr_acumulado', 'journal', 'mixed')
  );

-- Paso 1g: no auto-supersesión
ALTER TABLE acc_source_batch
  ADD CONSTRAINT ck_acc_source_batch_no_self_supersede CHECK (
    superseded_by_id IS NULL OR superseded_by_id <> id
  );


-- =============================================================================
-- PARTE 2: NUEVA TABLA acc_source_batch_issue
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_source_batch_issue (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id             UUID          NOT NULL
                         REFERENCES acc_source_batch(id) ON DELETE RESTRICT,
  source_record_ref    TEXT,          -- ej. fila del Excel, código de cuenta
  severity             TEXT          NOT NULL,
  issue_code           TEXT          NOT NULL,
  field_name           TEXT,
  value_found          TEXT,
  message              TEXT          NOT NULL,
  suggested_resolution TEXT,
  resolved_by          TEXT,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_asbi_severity CHECK (severity IN ('FATAL', 'ERROR', 'WARNING', 'INFO'))
);

COMMENT ON TABLE acc_source_batch_issue IS
  'Issues de validación vinculados a un acc_source_batch. '
  'Filas con severity=FATAL y resolved_at IS NULL bloquean la transición a APPROVED. '
  'Issues de batches en estado POSTED son inmutables (trigger trg_asbi_immutable).';

COMMENT ON COLUMN acc_source_batch_issue.source_record_ref IS
  'Referencia a la fila/cuenta origen: ej. "row:14", "account:6.11.01.010". '
  'Nullable: puede ser un issue a nivel de batch completo.';

COMMENT ON COLUMN acc_source_batch_issue.issue_code IS
  'Código normalizado. Ejemplos: SRC_ACCOUNT_UNMAPPED, PERIOD_LOCKED, '
  'TOLERANCE_EXCEEDED, DUPLICATE_ACCOUNT, INVALID_CURRENCY, CC_AGGREGATION_APPLIED.';


-- =============================================================================
-- PARTE 3: NUEVA TABLA acc_source_adapter_profile
-- Formaliza la capacidad del source system por entidad.
-- Contiene el CapabilitySet real según AC-04.
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_source_adapter_profile (
  id               UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        UUID          NOT NULL
                     REFERENCES core_entities(id) ON DELETE RESTRICT,
  source_system    TEXT          NOT NULL,
  adapter_version  TEXT          NOT NULL DEFAULT 'v1',
  capability_set   JSONB         NOT NULL DEFAULT '{}',
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_source_adapter_profile UNIQUE (entity_id, source_system)
);

COMMENT ON TABLE acc_source_adapter_profile IS
  'CapabilitySet formal por entidad y sistema fuente. '
  'Define qué información puede extraer realmente el source system '
  'según evidencia AC-04 (muestras reales Contec 2026-08-17). '
  'No modifica acc_chart_mapping. Es solo declaración de capacidades.';

COMMENT ON COLUMN acc_source_adapter_profile.capability_set IS
  'JSON schema libre. Ejemplo Contec: '
  '{"balance":{"trial_balance_debit":true,"ytd_gross_movements":true},'
  '"eerr_periodo":{"cost_centers":true,"budget_amount":true},'
  '"eerr_acumulado":{"cost_centers":true},'
  '"not_available":{"individual_journal_entries":false}}';


-- =============================================================================
-- PARTE 4: SEED SINTÉTICO — CapabilitySet Contec para ALF
-- Basado en evidencia AC-04 (archivos reales Allegria Foods, Contec, 2026-08-17)
-- SINTÉTICO: entity real pero datos de configuración no son financieros
-- =============================================================================

INSERT INTO acc_source_adapter_profile (entity_id, source_system, adapter_version, capability_set, notes)
SELECT
  ce.id,
  'contec',
  'v1',
  '{
    "balance": {
      "source_format": "contec_balance_export",
      "trial_balance_debit_col": 6,
      "trial_balance_credit_col": 7,
      "ytd_gross_debit_col": 2,
      "ytd_gross_credit_col": 3,
      "trial_balance_debit": true,
      "trial_balance_credit": true,
      "ytd_gross_movements": true,
      "opening_balance": false,
      "period_debit_credit_isolated": false,
      "cost_centers": false
    },
    "eerr_periodo": {
      "source_format": "contec_eerr_periodo_export",
      "naturaleza_col": 0,
      "clase_col": 1,
      "subclase_col": 2,
      "account_code_col": 3,
      "account_name_col": 4,
      "cost_center_col": 5,
      "real_col": 6,
      "budget_col": 7,
      "variance_col": 8,
      "real_amount": true,
      "budget_amount": true,
      "variance": true,
      "cost_centers": true,
      "account_hierarchy": true,
      "period_granularity": "single_month_per_file",
      "multi_month_single_file": false
    },
    "eerr_acumulado": {
      "source_format": "contec_eerr_acumulado_export",
      "real_amount": true,
      "budget_amount": true,
      "variance": true,
      "cost_centers": true,
      "account_hierarchy": true,
      "period_granularity": "ytd"
    },
    "not_available": {
      "individual_journal_entries": false,
      "opening_closing_balance_explicit": false,
      "intercompany_flags": false,
      "period_gross_debit_credit_isolated": false
    },
    "evidence": {
      "ac04_date": "2026-08-17",
      "files": ["Balance Foods.xlsx", "EERR Julio A.Foods 2026.xlsx", "EERR Acumulado A.Foods 2026.xlsx"]
    }
  }'::jsonb,
  'CapabilitySet Contec para Allegria Foods. Basado en evidencia AC-04 archivos reales 2026-08-17.'
FROM core_entities ce
WHERE ce.code = 'ALF'
ON CONFLICT (entity_id, source_system) DO UPDATE
  SET capability_set  = EXCLUDED.capability_set,
      adapter_version = EXCLUDED.adapter_version,
      notes           = EXCLUDED.notes,
      updated_at      = now();


-- =============================================================================
-- PARTE 5: TRIGGERS DE LIFECYCLE EN acc_source_batch
-- =============================================================================

-- ─── Función: validación de transiciones de lifecycle ───────────────────────
CREATE OR REPLACE FUNCTION fn_acc_source_batch_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_from TEXT := OLD.status;
  v_to   TEXT := NEW.status;
  v_allowed BOOLEAN := FALSE;
BEGIN
  -- Sin cambio de status → pasar directamente
  IF v_from = v_to THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Tabla de transiciones permitidas
  v_allowed := CASE v_from
    WHEN 'CREATED'          THEN v_to IN ('PARSING','REJECTED')
    WHEN 'PARSING'          THEN v_to IN ('PARSED','REJECTED')
    WHEN 'PARSED'           THEN v_to IN ('VALIDATING','REJECTED')
    WHEN 'VALIDATING'       THEN v_to IN ('VALIDATED','REJECTED')
    WHEN 'VALIDATED'        THEN v_to IN ('PENDING_APPROVAL','REJECTED')
    WHEN 'PENDING_APPROVAL' THEN v_to IN ('APPROVED','REJECTED')
    WHEN 'APPROVED'         THEN v_to IN ('POSTING','REJECTED')
    WHEN 'POSTING'          THEN v_to IN ('POSTED','ROLLED_BACK','REJECTED')
    WHEN 'POSTED'           THEN v_to IN ('SUPERSEDED')
    WHEN 'SUPERSEDED'       THEN FALSE  -- terminal
    WHEN 'ROLLED_BACK'      THEN FALSE  -- terminal
    WHEN 'REJECTED'         THEN FALSE  -- terminal
    ELSE FALSE
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION
      'BATCH_LIFECYCLE_VIOLATION: Transición % → % no permitida en batch %',
      v_from, v_to, OLD.id;
  END IF;

  -- ── Gate: APPROVED requiere approved_by ────────────────────────────────────
  IF v_to = 'APPROVED' THEN
    IF NEW.approved_by IS NULL OR trim(NEW.approved_by) = '' THEN
      RAISE EXCEPTION
        'BATCH_APPROVAL_REQUIRED: approved_by debe estar informado para transición → APPROVED (batch %)',
        OLD.id;
    END IF;
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
    END IF;
  END IF;

  -- ── Gate: POSTED requiere posted_by ────────────────────────────────────────
  IF v_to = 'POSTED' THEN
    IF NEW.posted_by IS NULL OR trim(NEW.posted_by) = '' THEN
      RAISE EXCEPTION
        'BATCH_POSTED_REQUIRED: posted_by debe estar informado para transición → POSTED (batch %)',
        OLD.id;
    END IF;
    IF NEW.posted_at IS NULL THEN
      NEW.posted_at := now();
    END IF;
  END IF;

  -- ── Gate: SUPERSEDED requiere superseded_by_id ─────────────────────────────
  IF v_to = 'SUPERSEDED' THEN
    IF NEW.superseded_by_id IS NULL THEN
      RAISE EXCEPTION
        'BATCH_SUPERSEDE_REQUIRED: superseded_by_id debe estar informado para transición → SUPERSEDED (batch %)',
        OLD.id;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_acc_source_batch_lifecycle
  BEFORE UPDATE ON acc_source_batch
  FOR EACH ROW
  EXECUTE FUNCTION fn_acc_source_batch_lifecycle();


-- ─── Función: gate de issues FATAL al aprobar ────────────────────────────────
CREATE OR REPLACE FUNCTION fn_acc_source_batch_fatal_gate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_fatal INT;
BEGIN
  -- Solo actúa en la transición PENDING_APPROVAL → APPROVED
  IF OLD.status = 'PENDING_APPROVAL' AND NEW.status = 'APPROVED' THEN
    SELECT COUNT(*) INTO v_fatal
    FROM acc_source_batch_issue
    WHERE batch_id  = NEW.id
      AND severity  = 'FATAL'
      AND resolved_at IS NULL;

    IF v_fatal > 0 THEN
      RAISE EXCEPTION
        'BATCH_FATAL_GATE: % issue(s) FATAL sin resolver bloquean la aprobación del batch %',
        v_fatal, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_acc_source_batch_fatal_gate
  BEFORE UPDATE ON acc_source_batch
  FOR EACH ROW
  WHEN (OLD.status = 'PENDING_APPROVAL' AND NEW.status = 'APPROVED')
  EXECUTE FUNCTION fn_acc_source_batch_fatal_gate();


-- =============================================================================
-- PARTE 6: TRIGGER INMUTABILIDAD DE ISSUES EN BATCH POSTED
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_acc_source_batch_issue_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_batch_status TEXT;
BEGIN
  SELECT status INTO v_batch_status
  FROM acc_source_batch
  WHERE id = COALESCE(OLD.batch_id, NEW.batch_id);

  IF v_batch_status = 'POSTED' THEN
    RAISE EXCEPTION
      'BATCH_ISSUE_IMMUTABLE: No se pueden modificar ni eliminar issues de batch POSTED (batch %, issue %)',
      COALESCE(OLD.batch_id, NEW.batch_id),
      OLD.id;
  END IF;
  -- Para DELETE: NEW es NULL → RETURN NEW suprimiría el delete silenciosamente.
  -- COALESCE(NEW, OLD) devuelve OLD en DELETE (permite la operación) y NEW en UPDATE.
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_asbi_immutable
  BEFORE UPDATE OR DELETE ON acc_source_batch_issue
  FOR EACH ROW
  EXECUTE FUNCTION fn_acc_source_batch_issue_immutable();


-- =============================================================================
-- PARTE 7: FUNCIÓN HELPER — Completeness de mapeo
-- Devuelve account_codes sin mapping vigente en acc_chart_mapping.
-- El Adapter la ejecuta durante VALIDATING para generar issues SRC_ACCOUNT_UNMAPPED.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_acc_mapping_completeness(p_batch_id UUID)
RETURNS TABLE(account_code TEXT, net_balance NUMERIC, issue TEXT)
LANGUAGE sql STABLE AS $$
  SELECT
    ab.account_code,
    ab.net_balance,
    'SRC_ACCOUNT_UNMAPPED: sin mapping vigente en acc_chart_mapping' AS issue
  FROM acc_account_balance ab
  JOIN acc_source_batch    sb ON sb.id = ab.source_batch_id
  WHERE ab.source_batch_id = p_batch_id
    AND ab.balance_type    = 'actual'
    AND (ab.debit_balance <> 0 OR ab.credit_balance <> 0 OR ab.net_balance <> 0)
    AND NOT EXISTS (
      SELECT 1
      FROM acc_chart_mapping cm
      WHERE cm.entity_id         = sb.entity_id
        AND cm.local_account_code = ab.account_code
        AND cm.is_active          = true
        AND (cm.effective_to IS NULL OR cm.effective_to >= CURRENT_DATE)
    )
  ORDER BY ab.account_code;
$$;

COMMENT ON FUNCTION fn_acc_mapping_completeness(UUID) IS
  'Retorna cuentas con saldo no-cero en un batch que no tienen mapping vigente. '
  'Usar en fase VALIDATING para crear issues SRC_ACCOUNT_UNMAPPED. '
  'Si retorna filas: batch NO puede alcanzar POSTED en V1.';


-- =============================================================================
-- PARTE 8: ÍNDICES DE PERFORMANCE
-- =============================================================================

-- acc_source_batch — nuevos
CREATE INDEX IF NOT EXISTS idx_acc_source_batch_status_new
  ON acc_source_batch(status);

CREATE INDEX IF NOT EXISTS idx_acc_source_batch_report_type
  ON acc_source_batch(report_type)
  WHERE report_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acc_source_batch_superseded
  ON acc_source_batch(superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

-- acc_source_batch_issue
CREATE INDEX IF NOT EXISTS idx_asbi_batch_id
  ON acc_source_batch_issue(batch_id);

CREATE INDEX IF NOT EXISTS idx_asbi_severity_code
  ON acc_source_batch_issue(severity, issue_code);

CREATE INDEX IF NOT EXISTS idx_asbi_batch_severity
  ON acc_source_batch_issue(batch_id, severity)
  WHERE resolved_at IS NULL;

-- acc_source_adapter_profile
CREATE INDEX IF NOT EXISTS idx_asap_entity
  ON acc_source_adapter_profile(entity_id);

CREATE INDEX IF NOT EXISTS idx_asap_system
  ON acc_source_adapter_profile(source_system)
  WHERE is_active = true;


-- =============================================================================
-- PARTE 9: RLS — FAIL-CLOSED EN TABLAS NUEVAS
-- =============================================================================

-- ── acc_source_batch_issue ────────────────────────────────────────────────────
ALTER TABLE acc_source_batch_issue ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_source_batch_issue FORCE ROW LEVEL SECURITY;

-- Anon → denegado (fail-closed)
CREATE POLICY "asbi_deny_anon"
  ON acc_source_batch_issue
  FOR ALL
  TO anon
  USING (false);

-- Authenticated → acceso completo por ahora (igual que otras tablas acc_*)
-- TODO OA-024-08: refinar a roles específicos (importer, approver, auditor)
CREATE POLICY "asbi_authenticated_access"
  ON acc_source_batch_issue
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── acc_source_adapter_profile ────────────────────────────────────────────────
ALTER TABLE acc_source_adapter_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_source_adapter_profile FORCE ROW LEVEL SECURITY;

CREATE POLICY "asap_deny_anon"
  ON acc_source_adapter_profile
  FOR ALL
  TO anon
  USING (false);

CREATE POLICY "asap_authenticated_access"
  ON acc_source_adapter_profile
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- service_role → acceso total (mismo patrón que todas las tablas acc_*)
-- Requerido por TEST-403: service_role debe tener ALL en todas las tablas financieras.
CREATE POLICY "asbi_service_role_all"
  ON acc_source_batch_issue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "asap_service_role_all"
  ON acc_source_adapter_profile
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- VERIFICACIÓN POST-DEPLOY (ejecutar manualmente en SQL Editor)
-- =============================================================================

/*
-- V1: Confirmar nuevos status permitidos
SELECT unnest(ARRAY['CREATED','PARSING','PARSED','VALIDATING','VALIDATED',
  'PENDING_APPROVAL','APPROVED','POSTING','POSTED','SUPERSEDED','ROLLED_BACK','REJECTED'])
AS new_status;
-- Esperado: 12 valores. Insertar uno en acc_source_batch para confirmar que no falla.

-- V2: Confirmar columnas nuevas en acc_source_batch
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'acc_source_batch'
  AND column_name IN ('report_type','approved_by','approved_at','posted_at','posted_by','superseded_by_id');
-- Esperado: 6 filas.

-- V3: Confirmar tablas nuevas
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('acc_source_batch_issue', 'acc_source_adapter_profile');
-- Esperado: 2 filas.

-- V4: Confirmar RLS habilitado
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('acc_source_batch_issue', 'acc_source_adapter_profile');
-- Esperado: rowsecurity = true para ambas.

-- V5: Confirmar seed ALF Contec
SELECT e.code, p.source_system, p.adapter_version
FROM acc_source_adapter_profile p
JOIN core_entities e ON e.id = p.entity_id
WHERE e.code = 'ALF' AND p.source_system = 'contec';
-- Esperado: 1 fila (ALF, contec, v1).

-- V6: Confirmar triggers creados
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname IN (
  'trg_acc_source_batch_lifecycle',
  'trg_acc_source_batch_fatal_gate',
  'trg_asbi_immutable'
);
-- Esperado: 3 filas.

-- V7: Confirmar fn_acc_mapping_completeness
SELECT proname FROM pg_proc WHERE proname = 'fn_acc_mapping_completeness';
-- Esperado: 1 fila.
*/
