-- !! ARTEFACTO DE DISEÑO — NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA DEL CFO !!
-- =============================================================================
-- OA-024-01 Architecture Frozen v1 — DDL Design Artifact v2
-- Archivo : 004_accounting_schema_draft_v2.sql
-- Versión : v2 (OA-024-04 — Technical Closure)
-- Fecha   : 2026-08-13
-- Autor   : Claude Code / Angelo Huerta CFO
-- Estado  : ARTEFACTO DE DISEÑO — NO EJECUTAR en producción sin GO explícito del CFO
--
-- Cambios respecto a v1 (OA-024-02):
--   D10-B: core_entities.id → UUID; todos los entity_id FK → UUID (T1 — sin reabrir OA-024-01)
--   B1 FIX: acc_reporting_account/financial_statement/reporting_line movidos antes de journal/balance
--   B2 FIX: eliminado acc_consolidation_run.conversion_run_id (FK circular)
--   B3 FIX: acc_materiality_policy.scope_ref_id polimórfico → scope_entity_id + scope_reporting_line_id explícitos
--   NOTE4: pln_scenario.code UNIQUE inline eliminado (duplicado)
--   NOTE5: UNIQUE (entity_id, effective_from) en acc_entity_config
--   NOTE6: UNIQUE (entity_id, parent_entity_id, effective_from) en acc_ownership
--   NOTE7: updated_at agregado a tablas con estado mutable
--   NOTE8: índice ix_acc_period_status agregado
--   CONTEO: 36 tablas (v1 tenía 36; OA-024-03 reportó erróneamente 31 — corregido)
--   STATIC REVIEW: PASS (sin blockers)
-- =============================================================================
-- PREREQUISITOS:
--   Extension btree_gist si se implementan EXCLUDE USING gist para [T4],[T5]
--   Roles: platform_admin, authenticated, anon (Supabase standard)
-- =============================================================================

-- =============================================================================
-- SECTION 1: CORPORATE ENTITY MASTER (CEM)
-- D10-B: PK es UUID — coincide con anf_filiales y contab_* desplegados
-- =============================================================================

CREATE TABLE IF NOT EXISTS core_entities (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT          NOT NULL,
  legal_name      TEXT          NOT NULL,
  short_name      TEXT          NOT NULL,
  country_code    CHAR(2)       NOT NULL,
  tax_id          TEXT,
  entity_type     TEXT          NOT NULL,
  -- 'holding'|'subsidiary'|'jv'|'associate'|'related'|'branch'|'other'
  grupo_code      TEXT,         -- 'MEDITERRA' (extensible a multi-grupo futuro)
  group_id        UUID          REFERENCES core_entities(id),  -- FK padre en jerarquía
  activa          BOOLEAN       NOT NULL DEFAULT true,
  source_anf_id   UUID,         -- referencia a anf_filiales.id (pre-CEM compat)
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_core_entity_code   UNIQUE (code),
  CONSTRAINT ck_entity_type        CHECK (entity_type IN (
    'holding','subsidiary','jv','associate','related','branch','other'
  )),
  CONSTRAINT ck_country_code       CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT ck_no_self_group      CHECK (group_id IS DISTINCT FROM id)
);

COMMENT ON TABLE  core_entities IS 'Corporate Entity Master (CEM). Única fuente de verdad para identidad societaria. UUID PK — D10-B (OA-024-04). No duplicar en anf_filiales ni en JS hardcode una vez aprobada la materialización.';
COMMENT ON COLUMN core_entities.entity_type IS 'Taxonomía societaria. related = entidad relacionada fuera del perímetro de consolidación (ej. Montejato, Arrayon, Mesain).';
COMMENT ON COLUMN core_entities.source_anf_id IS 'FK de compatibilidad hacia anf_filiales.id. Solo para período de transición. Eliminar tras migración completa.';

-- =============================================================================
-- SECTION 2: DIMENSION CATALOG
-- Sin dependencias externas — debe crearse temprano para evitar forward refs
-- =============================================================================

CREATE TABLE IF NOT EXISTS dim_type (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT        NOT NULL UNIQUE,
  -- 'cost_center'|'project'|'agr_field'|'client'|'product'|'segment'
  name        TEXT        NOT NULL,
  description TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_value (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dim_type_id    BIGINT      NOT NULL REFERENCES dim_type(id),
  entity_id      UUID        REFERENCES core_entities(id),  -- NULL = valor global
  code           TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  active         BOOLEAN     NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_dim_value_code   UNIQUE (dim_type_id, entity_id, code)
);

COMMENT ON TABLE dim_type  IS 'Catálogo de tipos de dimensión analítica. Agregar dimensiones nuevas sin ALTER TABLE en acc_journal_line.';
COMMENT ON TABLE dim_value IS 'Valores por tipo de dimensión. entity_id NULL = valor global a todas las entidades.';

-- =============================================================================
-- SECTION 3: REPORTING CATALOG
-- B1 FIX: movido aquí (antes era Section 9). acc_journal_line y acc_account_balance
-- necesitan acc_reporting_account antes de ser creadas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_financial_statement (
  id      BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code    TEXT    NOT NULL UNIQUE,  -- 'BALANCE'|'PNL'|'CASHFLOW'|'EQUITY'
  name    TEXT    NOT NULL,
  active  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS acc_reporting_account (
  id             BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           TEXT    NOT NULL UNIQUE,   -- '1.1.01', '4.1.01', etc.
  name           TEXT    NOT NULL,
  account_nature TEXT    NOT NULL,
  -- 'asset'|'liability'|'equity'|'revenue'|'expense'|'contra'|'informational'
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_ra_nature CHECK (account_nature IN (
    'asset','liability','equity','revenue','expense','contra','informational'
  ))
);

COMMENT ON COLUMN acc_reporting_account.account_nature IS 'D1 APPROVED: presentation_sign está en acc_reporting_line, no aquí. Esta columna es la naturaleza contable del tipo de cuenta.';

CREATE TABLE IF NOT EXISTS acc_reporting_line (
  id                     BIGINT   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  financial_statement_id BIGINT   NOT NULL REFERENCES acc_financial_statement(id),
  reporting_account_id   BIGINT   NOT NULL REFERENCES acc_reporting_account(id),
  section_name           TEXT     NOT NULL,
  -- 'Activo Corriente'|'Ingresos Operacionales'|etc
  display_order          INT      NOT NULL,
  presentation_sign      SMALLINT NOT NULL,
  -- +1 o -1. D1: display_value = canonical_value × presentation_sign
  is_subtotal            BOOLEAN  NOT NULL DEFAULT false,
  active                 BOOLEAN  NOT NULL DEFAULT true,

  CONSTRAINT uq_rl_stmt_account  UNIQUE (financial_statement_id, reporting_account_id),
  CONSTRAINT ck_rl_sign          CHECK (presentation_sign IN (1, -1))
);

COMMENT ON COLUMN acc_reporting_line.presentation_sign IS 'D1 APPROVED: display_value = canonical_value × presentation_sign. Pasivos/Patrimonio/Ingresos = -1 para mostrar positivo en EEFF.';

-- =============================================================================
-- SECTION 4: PLANNING SCENARIO
-- Sin dependencias — debe existir antes de pln_budget_entry
-- =============================================================================

CREATE TABLE IF NOT EXISTS pln_scenario (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT        NOT NULL,       -- NOTE4: UNIQUE inline eliminado — usa CONSTRAINT
  scenario_type TEXT        NOT NULL,
  -- 'budget'|'revised_budget'|'forecast'|'stress_test'
  fiscal_year   INT         NOT NULL,
  version       INT         NOT NULL DEFAULT 1,
  status        TEXT        NOT NULL DEFAULT 'draft',
  -- 'draft'|'submitted'|'approved'|'locked'|'superseded'
  description   TEXT,
  approved_by   TEXT,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- NOTE7: estado mutable

  CONSTRAINT uq_pln_code   UNIQUE (code),            -- NOTE4: un solo UNIQUE
  CONSTRAINT ck_pln_type   CHECK (scenario_type IN ('budget','revised_budget','forecast','stress_test')),
  CONSTRAINT ck_pln_status CHECK (status IN ('draft','submitted','approved','locked','superseded'))
);

-- =============================================================================
-- SECTION 5: PERIOD MANAGEMENT
-- Depende de: core_entities
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_period (
  id           BIGINT   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id    UUID     NOT NULL REFERENCES core_entities(id),
  period_code  TEXT     NOT NULL,   -- 'MED-2026-01' (entity_code + año + mes)
  fiscal_year  INT      NOT NULL,
  fiscal_month INT      NOT NULL,   -- 1-12
  start_date   DATE     NOT NULL,
  end_date     DATE     NOT NULL,
  status       TEXT     NOT NULL DEFAULT 'open',
  -- 'open'|'closed'|'locked'|'post_close_adjustment'
  closed_by    TEXT,
  closed_at    TIMESTAMPTZ,
  locked_by    TEXT,
  locked_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_period_entity_code  UNIQUE (entity_id, period_code),
  CONSTRAINT ck_period_dates        CHECK (end_date > start_date),
  CONSTRAINT ck_fiscal_month        CHECK (fiscal_month BETWEEN 1 AND 12),
  CONSTRAINT ck_fiscal_year         CHECK (fiscal_year BETWEEN 2000 AND 2099),
  CONSTRAINT ck_period_status       CHECK (status IN (
    'open','closed','locked','post_close_adjustment'
  ))
);

COMMENT ON TABLE  acc_period IS 'Estado del período contable por entidad. Separado de acc_reporting_run (aprobación del reporte).';
COMMENT ON COLUMN acc_period.status IS 'post_close_adjustment: estado transitorio para correcciones en período locked. Requiere CFO + audit.';

-- Auditoría de cambios de estado de período
CREATE TABLE IF NOT EXISTS acc_period_audit (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id    BIGINT      NOT NULL REFERENCES acc_period(id),
  entity_id    UUID        NOT NULL REFERENCES core_entities(id),
  period_code  TEXT        NOT NULL,
  status_from  TEXT        NOT NULL,
  status_to    TEXT        NOT NULL,
  changed_by   TEXT        NOT NULL,
  reason       TEXT        NOT NULL,  -- obligatorio para bloqueo y desbloqueo
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- SECTION 6: ENTITY CONFIGURATION & OWNERSHIP
-- Depende de: core_entities, acc_period (acc_entity_config)
-- =============================================================================

-- Moneda funcional y de presentación versionada por entidad [T5]
CREATE TABLE IF NOT EXISTS acc_entity_config (
  id                     BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id              UUID        NOT NULL REFERENCES core_entities(id),
  functional_currency    CHAR(3),             -- NULL si UNRESOLVED (D8)
  presentation_currency  CHAR(3)     NOT NULL DEFAULT 'USD',
  effective_from         DATE        NOT NULL,
  effective_to           DATE,
  d8_status              TEXT        NOT NULL DEFAULT 'unresolved',
  -- 'approved'|'unresolved'|'requires_cfo_determination'
  changed_by             TEXT        NOT NULL,
  change_reason          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NOTE5: proxy débil de no-solapamiento. Garantía fuerte requiere trigger [T5]
  CONSTRAINT uq_entity_config_start      UNIQUE (entity_id, effective_from),
  CONSTRAINT ck_entity_config_dates      CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT ck_functional_currency_fmt  CHECK (functional_currency IS NULL OR functional_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_presentation_currency    CHECK (presentation_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_d8_status                CHECK (d8_status IN ('approved','unresolved','requires_cfo_determination'))
  -- [T5] No solapamiento de vigencias por entity_id: requiere EXCLUDE gist o trigger
);

COMMENT ON COLUMN acc_entity_config.d8_status IS 'D8: moneda funcional de Allegria Service, Integrity Farms y Allpa Perú no confirmada. Fichas de evidencia requeridas al CFO.';

-- Participación y método de consolidación temporal [T4]
CREATE TABLE IF NOT EXISTS acc_ownership (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID          NOT NULL REFERENCES core_entities(id),  -- entidad hija
  parent_entity_id     UUID          NOT NULL REFERENCES core_entities(id),  -- entidad padre
  ownership_pct        NUMERIC(7,4)  NOT NULL,    -- 0.0000 a 100.0000
  voting_pct           NUMERIC(7,4),               -- NULL si igual a ownership_pct
  consolidation_method TEXT          NOT NULL,
  -- 'full_consolidation'|'equity_method'|'cost_method'|'held_for_sale'|'none'
  d7_status            TEXT          NOT NULL DEFAULT 'pending',
  -- 'confirmed'|'pending'|'external_evidence_required'
  effective_from       DATE          NOT NULL,
  effective_to         DATE,
  changed_by           TEXT          NOT NULL,
  change_reason        TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- NOTE6: proxy débil de no-solapamiento. Garantía fuerte requiere trigger [T4]
  CONSTRAINT uq_ownership_start         UNIQUE (entity_id, parent_entity_id, effective_from),
  CONSTRAINT ck_no_self_ownership       CHECK (entity_id <> parent_entity_id),
  CONSTRAINT ck_ownership_pct           CHECK (ownership_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_voting_pct              CHECK (voting_pct IS NULL OR voting_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_consolidation_method    CHECK (consolidation_method IN (
    'full_consolidation','equity_method','cost_method','held_for_sale','none'
  )),
  CONSTRAINT ck_d7_status               CHECK (d7_status IN ('confirmed','pending','external_evidence_required')),
  CONSTRAINT ck_ownership_dates         CHECK (effective_to IS NULL OR effective_to > effective_from)
  -- [T4] No solapamiento por (entity_id, parent_entity_id): requiere EXCLUDE gist o trigger
);

COMMENT ON COLUMN acc_ownership.d7_status   IS 'D7: inversionista directo en Allpa Chile/Perú pendiente de evidencia societaria. No hardcodear hasta confirmar.';
COMMENT ON COLUMN acc_ownership.ownership_pct IS 'Porcentaje de participación directa. No inferir de PARTICIPACION_CONTROLADORA JS hasta que D7 = confirmed.';

-- =============================================================================
-- SECTION 7: MATERIALITY POLICY
-- B3 FIX: scope_ref_id polimórfico → columnas FK explícitas
-- Depende de: core_entities, acc_reporting_line
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_materiality_policy (
  id                      BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_type              TEXT          NOT NULL,
  -- 'global'|'entity'|'reporting_line'|'analysis_type'
  -- B3 FIX: columnas FK explícitas en lugar de scope_ref_id polimórfico
  scope_entity_id         UUID          REFERENCES core_entities(id),
  scope_reporting_line_id BIGINT        REFERENCES acc_reporting_line(id),
  -- scope_type='analysis_type' usa la columna analysis_type como discriminador
  -- scope_type='global' → scope_entity_id IS NULL AND scope_reporting_line_id IS NULL
  analysis_type           TEXT,
  -- 'variance_actual_budget'|'variance_actual_py'|'elimination'|'adjustment'|'period_close'
  absolute_threshold      NUMERIC(18,4),
  relative_threshold      NUMERIC(7,4),   -- 0.05 = 5%
  combination_rule        TEXT          NOT NULL DEFAULT 'either',
  -- 'either' (superar UNO) | 'both' (superar AMBOS)
  effective_from          DATE          NOT NULL,
  effective_to            DATE,
  created_by              TEXT          NOT NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT ck_materiality_scope         CHECK (scope_type IN ('global','entity','reporting_line','analysis_type')),
  CONSTRAINT ck_materiality_combo         CHECK (combination_rule IN ('either','both')),
  CONSTRAINT ck_materiality_dates         CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT ck_materiality_has_threshold CHECK (
    absolute_threshold IS NOT NULL OR relative_threshold IS NOT NULL
  ),
  -- B3 FIX: at-most-one scope FK
  CONSTRAINT ck_materiality_scope_refs CHECK (
    (scope_entity_id IS NOT NULL)::int +
    (scope_reporting_line_id IS NOT NULL)::int <= 1
  ),
  -- B3 FIX: coherencia entre scope_type y FK poblada
  CONSTRAINT ck_materiality_scope_coherent CHECK (
    (scope_type = 'global'        )  OR
    (scope_type = 'entity'         AND scope_entity_id IS NOT NULL) OR
    (scope_type = 'reporting_line' AND scope_reporting_line_id IS NOT NULL) OR
    (scope_type = 'analysis_type'  AND analysis_type IS NOT NULL)
  )
);

COMMENT ON COLUMN acc_materiality_policy.scope_entity_id         IS 'B3 FIX (OA-024-04): reemplaza scope_ref_id polimórfico. Poblado solo cuando scope_type=entity.';
COMMENT ON COLUMN acc_materiality_policy.scope_reporting_line_id IS 'B3 FIX (OA-024-04): FK explícita a acc_reporting_line. Poblado solo cuando scope_type=reporting_line.';

-- =============================================================================
-- SECTION 8: ACCOUNTING PROFILE — 5 NIVELES
-- Depende de: core_entities, acc_reporting_account, acc_period
-- =============================================================================

-- Nivel 1: Base profile (default por plan de cuentas)
CREATE TABLE IF NOT EXISTS acc_base_profile (
  id                   BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_chart_code    TEXT    NOT NULL,   -- 'contec_v1'|'excel_v1'|'erp_m1'
  source_account_code  TEXT    NOT NULL,
  reporting_account_id BIGINT  NOT NULL REFERENCES acc_reporting_account(id),
  active               BOOLEAN NOT NULL DEFAULT true,
  created_by           TEXT    NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_bp_chart_account UNIQUE (source_chart_code, source_account_code)
);

-- Nivel 2: Company profile override
CREATE TABLE IF NOT EXISTS acc_company_profile (
  id                   BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID    NOT NULL REFERENCES core_entities(id),
  source_chart_code    TEXT    NOT NULL,
  source_account_group TEXT    NOT NULL,  -- patrón '4*' = todas las de ingreso
  reporting_account_id BIGINT  NOT NULL REFERENCES acc_reporting_account(id),
  effective_from       DATE    NOT NULL,
  effective_to         DATE,
  active               BOOLEAN NOT NULL DEFAULT true,
  created_by           TEXT    NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_cp_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Nivel 3: Account override por empresa y cuenta específica
CREATE TABLE IF NOT EXISTS acc_chart_mapping (
  id                   BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID    NOT NULL REFERENCES core_entities(id),
  source_chart_code    TEXT    NOT NULL,
  source_account_code  TEXT    NOT NULL,
  reporting_account_id BIGINT  NOT NULL REFERENCES acc_reporting_account(id),
  effective_from       DATE    NOT NULL,
  effective_to         DATE,
  active               BOOLEAN NOT NULL DEFAULT true,
  created_by           TEXT    NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                TEXT,

  CONSTRAINT uq_cm_entity_account UNIQUE (entity_id, source_chart_code, source_account_code, effective_from),
  CONSTRAINT ck_cm_dates          CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Nivel 4: Period mapping override (temporal por período)
CREATE TABLE IF NOT EXISTS acc_period_mapping_override (
  id                   BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID    NOT NULL REFERENCES core_entities(id),
  period_id            BIGINT  NOT NULL REFERENCES acc_period(id),
  source_account_code  TEXT    NOT NULL,
  reporting_account_id BIGINT  NOT NULL REFERENCES acc_reporting_account(id),
  reason               TEXT    NOT NULL,
  approved_by          TEXT    NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_pmo_entity_period_account UNIQUE (entity_id, period_id, source_account_code)
);

COMMENT ON TABLE acc_period_mapping_override IS 'Nivel 4 de AccountingProfile. Override temporal por período. Ej: cuenta reclasificada a CP por vencimiento. No altera mapping histórico de períodos aprobados.';

-- =============================================================================
-- SECTION 9: SOURCE INGESTION
-- Depende de: core_entities, acc_period
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_source_batch (
  id             BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id      UUID          NOT NULL REFERENCES core_entities(id),
  period_id      BIGINT        NOT NULL REFERENCES acc_period(id),
  source_system  TEXT          NOT NULL,
  -- 'contec'|'excel'|'erp_m1'|'manual'
  granularity    TEXT          NOT NULL,
  -- 'journal_lines'|'trial_balance'|'account_summary'
  file_name      TEXT,
  file_hash      TEXT,         -- SHA-256 para idempotencia [T6]
  total_accounts INT,
  total_debit    NUMERIC(18,4),
  total_credit   NUMERIC(18,4),
  status         TEXT          NOT NULL DEFAULT 'pending',
  -- 'pending'|'processing'|'validated'|'rejected'|'superseded'
  superseded_by  BIGINT        REFERENCES acc_source_batch(id),
  loaded_by      TEXT          NOT NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  notes          TEXT,

  CONSTRAINT ck_source_system CHECK (source_system IN ('contec','excel','erp_m1','manual')),
  CONSTRAINT ck_granularity   CHECK (granularity IN ('journal_lines','trial_balance','account_summary')),
  CONSTRAINT ck_batch_status  CHECK (status IN ('pending','processing','validated','rejected','superseded'))
  -- [T6] Idempotencia por file_hash: service layer verifica hash antes de procesar.
  -- Si existe batch con mismo hash en mismo (entity_id, period_id) y status=validated → rechazar.
);

COMMENT ON COLUMN acc_source_batch.granularity IS 'Declara capability del adapter. Determina drill-down disponible para esta carga. Ver CapabilitySet.';
COMMENT ON COLUMN acc_source_batch.file_hash   IS 'SHA-256. Idempotencia en service layer — verificar antes de procesar.';

-- =============================================================================
-- SECTION 10: ADJUSTMENT JOURNALS (ajustes manuales con SoD)
-- Depende de: acc_period, core_entities
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_adjustment_journal (
  id                 BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id          BIGINT        NOT NULL REFERENCES acc_period(id),
  entity_id          UUID          NOT NULL REFERENCES core_entities(id),
  adjustment_type    TEXT          NOT NULL,
  -- 'reclassification'|'correction'|'consolidation'|'opening'|'provision'|'accrual'|'other'
  description        TEXT          NOT NULL,
  affected_period_id BIGINT        REFERENCES acc_period(id),  -- si retroactivo
  evidence_ref       TEXT,
  status             TEXT          NOT NULL DEFAULT 'draft',
  -- 'draft'|'submitted'|'reviewed'|'approved'|'posted'|'reversed'
  prepared_by        TEXT          NOT NULL,
  submitted_by       TEXT,
  reviewed_by        TEXT,
  approved_by        TEXT,
  posted_by          TEXT,
  posted_at          TIMESTAMPTZ,
  reversal_of        BIGINT        REFERENCES acc_adjustment_journal(id),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7

  CONSTRAINT ck_adj_type       CHECK (adjustment_type IN (
    'reclassification','correction','consolidation','opening','provision','accrual','other'
  )),
  CONSTRAINT ck_adj_status     CHECK (status IN (
    'draft','submitted','reviewed','approved','posted','reversed'
  )),
  CONSTRAINT ck_adj_no_self_rev CHECK (reversal_of IS DISTINCT FROM id)
  -- [T9] prepared_by ≠ approved_by para ajustes > materialidad: requiere trigger o service layer
);

-- =============================================================================
-- SECTION 11: CONSOLIDATION RUN
-- B2 FIX: sin FK hacia acc_conversion_run (relación unidireccional: conversion_run → consol_run)
-- Depende de: acc_period, core_entities
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_consolidation_run (
  id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id       BIGINT        NOT NULL REFERENCES acc_period(id),
  group_entity_id UUID          NOT NULL REFERENCES core_entities(id),
  run_version     INT           NOT NULL DEFAULT 1,
  run_type        TEXT          NOT NULL DEFAULT 'regular',
  -- 'regular'|'restatement'|'interim'
  status          TEXT          NOT NULL DEFAULT 'draft',
  -- 'draft'|'running'|'completed'|'approved'|'superseded'
  superseded_by   BIGINT        REFERENCES acc_consolidation_run(id),
  -- B2 FIX: conversion_run_id eliminado para romper ciclo FK
  -- El lookup inverso se hace: SELECT * FROM acc_conversion_run WHERE consolidation_run_id = X
  executed_at     TIMESTAMPTZ,
  executed_by     TEXT,
  approved_at     TIMESTAMPTZ,
  approved_by     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7

  CONSTRAINT uq_cr_period_version UNIQUE (period_id, group_entity_id, run_version),
  CONSTRAINT ck_cr_run_type       CHECK (run_type IN ('regular','restatement','interim')),
  CONSTRAINT ck_cr_status         CHECK (status IN ('draft','running','completed','approved','superseded'))
);

COMMENT ON COLUMN acc_consolidation_run.superseded_by IS 'B2 FIX (OA-024-04): conversion_run_id eliminado. Para encontrar el conversion_run asociado: SELECT id FROM acc_conversion_run WHERE consolidation_run_id = <este.id>.';

-- =============================================================================
-- SECTION 12: CURRENCY CONVERSION (IAS 21)
-- B2 FIX: acc_conversion_run creado DESPUÉS de acc_consolidation_run
-- FK consolidation_run_id es nullable → no crea ciclo
-- Depende de: acc_period, acc_consolidation_run
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_conversion_run (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- B2 FIX: esta FK es unidireccional (conversion → consolidation), no circular
  consolidation_run_id  BIGINT        REFERENCES acc_consolidation_run(id),
  period_id             BIGINT        NOT NULL REFERENCES acc_period(id),
  presentation_currency CHAR(3)       NOT NULL DEFAULT 'USD',
  status                TEXT          NOT NULL DEFAULT 'draft',
  -- 'draft'|'approved'
  executed_at           TIMESTAMPTZ,
  executed_by           TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7

  CONSTRAINT ck_conv_currency CHECK (presentation_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_conv_status   CHECK (status IN ('draft','approved'))
);

COMMENT ON COLUMN acc_conversion_run.consolidation_run_id IS 'B2 FIX (OA-024-04): FK nullable unidireccional. NULL = conversión standalone (ej. TC snapshot sin consolidación asociada).';

-- Tasas congeladas para reproducibilidad histórica (IAS 21)
CREATE TABLE IF NOT EXISTS acc_conversion_rate_used (
  id                BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversion_run_id BIGINT        NOT NULL REFERENCES acc_conversion_run(id),
  currency_pair     TEXT          NOT NULL,  -- 'USD-CLP'|'USD-PEN'|etc
  rate_type         TEXT          NOT NULL,
  -- 'closing'|'average'|'historical'
  rate_value_used   NUMERIC(18,8) NOT NULL,
  rate_date         DATE          NOT NULL,
  rate_source       TEXT          NOT NULL,
  -- 'mindicador'|'frankfurter'|'manual'|'bcch'
  currency_domain_ref TEXT,       -- referencia a fila en maestro_tc / currency_tc

  CONSTRAINT uq_cru_run_pair_type UNIQUE (conversion_run_id, currency_pair, rate_type),
  CONSTRAINT ck_cru_rate_type     CHECK (rate_type IN ('closing','average','historical')),
  CONSTRAINT ck_cru_rate_positive CHECK (rate_value_used > 0)
);

COMMENT ON TABLE acc_conversion_rate_used IS 'IAS 21 reproducibilidad: tasa exacta congelada por conversion_run. Un snapshot aprobado de 2026 es exactamente reproducible en 2028. Distingue current truth de historical approved truth.';

-- =============================================================================
-- SECTION 13: JOURNAL LEDGER (granularidad asiento)
-- B1 FIX: acc_reporting_account ya existe (Section 3)
-- Depende de: core_entities, acc_source_batch, acc_period, acc_reporting_account
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_journal_entry (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID          NOT NULL REFERENCES core_entities(id),
  source_batch_id      BIGINT        NOT NULL REFERENCES acc_source_batch(id),
  period_id            BIGINT        NOT NULL REFERENCES acc_period(id),
  source_system        TEXT          NOT NULL,
  source_journal_id    TEXT,         -- ID en sistema origen
  source_document_id   TEXT,
  posting_date         DATE          NOT NULL,
  document_date        DATE,
  document_type        TEXT,
  -- 'factura'|'nota_credito'|'diario'|'pago'|etc (abierto, depende del ERP)
  document_number      TEXT,
  description          TEXT,
  transaction_currency CHAR(3)       NOT NULL,
  status               TEXT          NOT NULL DEFAULT 'posted',
  -- 'draft'|'posted'|'reversed'
  reversal_of          BIGINT        REFERENCES acc_journal_entry(id),
  created_by           TEXT          NOT NULL,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7
  metadata_source      JSONB,        -- metadata no canónica del origen ÚNICAMENTE

  CONSTRAINT ck_je_status      CHECK (status IN ('draft','posted','reversed')),
  CONSTRAINT ck_je_no_self_rev CHECK (reversal_of IS DISTINCT FROM id),
  CONSTRAINT ck_je_currency    CHECK (transaction_currency ~ '^[A-Z]{3}$')
  -- [T1] SUM(debit) = SUM(credit) por id: requiere trigger o validación en service layer
  -- [T10] Bloqueo por período locked: requiere trigger antes de INSERT/UPDATE
);

COMMENT ON TABLE acc_journal_entry IS 'Cabecera de asiento. D1 APPROVED: balance de líneas validado por trigger [T1]. Período locked bloquea INSERT via trigger [T10].';

CREATE TABLE IF NOT EXISTS acc_journal_line (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id     BIGINT        NOT NULL REFERENCES acc_journal_entry(id) ON DELETE CASCADE,
  line_number          INT           NOT NULL,
  source_account_code  TEXT          NOT NULL,
  reporting_account_id BIGINT        REFERENCES acc_reporting_account(id),  -- post-mapping
  -- D1 APPROVED: debit ≥ 0, credit ≥ 0, canonical_value = debit - credit
  debit                NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit               NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  transaction_currency CHAR(3)       NOT NULL,
  functional_currency  CHAR(3),      -- de acc_entity_config vigente
  description          TEXT,
  source_line_id       TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_jl_entry_line UNIQUE (journal_entry_id, line_number),
  CONSTRAINT ck_jl_currency   CHECK (transaction_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_jl_nonzero    CHECK (debit > 0 OR credit > 0)
);

COMMENT ON COLUMN acc_journal_line.debit  IS 'D1 APPROVED: debit ≥ 0 siempre. canonical_value = debit - credit.';
COMMENT ON COLUMN acc_journal_line.credit IS 'D1 APPROVED: credit ≥ 0 siempre.';

CREATE TABLE IF NOT EXISTS acc_adjustment_journal_line (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adjustment_journal_id BIGINT        NOT NULL REFERENCES acc_adjustment_journal(id) ON DELETE CASCADE,
  line_number           INT           NOT NULL,
  entity_id             UUID          NOT NULL REFERENCES core_entities(id),
  reporting_account_id  BIGINT        NOT NULL REFERENCES acc_reporting_account(id),
  debit                 NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit                NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  presentation_currency CHAR(3)       NOT NULL,
  description           TEXT,

  CONSTRAINT uq_ajl_journal_line UNIQUE (adjustment_journal_id, line_number),
  CONSTRAINT ck_ajl_nonzero      CHECK (debit > 0 OR credit > 0)
  -- [T3] SUM(debit) = SUM(credit) por adjustment_journal_id: requiere trigger
);

COMMENT ON TABLE acc_adjustment_journal IS 'Ajuste manual con partida doble obligatoria. SoD: prepared_by ≠ approved_by para ajustes materiales [T9]. Toda línea debe pertenecer a un journal balanceado [T3].';

-- =============================================================================
-- SECTION 14: BALANCE LEDGER (granularidad saldo — trial balance)
-- B1 FIX: acc_reporting_account ya existe (Section 3)
-- Depende de: core_entities, acc_source_batch, acc_period, acc_reporting_account
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_account_balance (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID          NOT NULL REFERENCES core_entities(id),
  source_batch_id      BIGINT        NOT NULL REFERENCES acc_source_batch(id),
  period_id            BIGINT        NOT NULL REFERENCES acc_period(id),
  source_account_code  TEXT          NOT NULL,
  reporting_account_id BIGINT        REFERENCES acc_reporting_account(id),  -- post-mapping
  -- D1 APPROVED
  transaction_currency CHAR(3)       NOT NULL,
  opening_balance      NUMERIC(18,4),
  period_debit         NUMERIC(18,4),
  period_credit        NUMERIC(18,4),
  closing_balance      NUMERIC(18,4) NOT NULL,
  granularity_level    TEXT          NOT NULL,
  -- 'trial_balance'|'account_summary'
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  metadata_source      JSONB,

  CONSTRAINT uq_ab_batch_account_currency UNIQUE (source_batch_id, source_account_code, transaction_currency),
  CONSTRAINT ck_ab_granularity CHECK (granularity_level IN ('trial_balance','account_summary')),
  CONSTRAINT ck_ab_balance_check CHECK (
    opening_balance IS NULL OR period_debit IS NULL OR period_credit IS NULL OR
    ABS((opening_balance + period_debit - period_credit) - closing_balance) < 0.01
  ),
  CONSTRAINT ck_ab_currency CHECK (transaction_currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE acc_account_balance IS 'Saldo de cuenta cuando la fuente no entrega asientos individuales. Separado de acc_journal_line — contratos distintos por granularidad. Ver acc_source_batch.granularity.';

-- =============================================================================
-- SECTION 15: DIMENSION PIVOT TABLES (sin polimorfismo)
-- Depende de: acc_journal_line, acc_account_balance, dim_type, dim_value
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_journal_line_dim (
  id              BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_line_id BIGINT  NOT NULL REFERENCES acc_journal_line(id) ON DELETE CASCADE,
  dim_type_id     BIGINT  NOT NULL REFERENCES dim_type(id),
  dim_value_id    BIGINT  NOT NULL REFERENCES dim_value(id),

  CONSTRAINT uq_jld_line_type UNIQUE (journal_line_id, dim_type_id)
);

CREATE TABLE IF NOT EXISTS acc_account_balance_dim (
  id                 BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_balance_id BIGINT  NOT NULL REFERENCES acc_account_balance(id) ON DELETE CASCADE,
  dim_type_id        BIGINT  NOT NULL REFERENCES dim_type(id),
  dim_value_id       BIGINT  NOT NULL REFERENCES dim_value(id),

  CONSTRAINT uq_abd_balance_type UNIQUE (account_balance_id, dim_type_id)
);

COMMENT ON TABLE acc_journal_line_dim     IS 'Dimensiones extensibles de journal_line. FK fuerte, sin polimorfismo. Una fila por dimensión aplicable.';
COMMENT ON TABLE acc_account_balance_dim  IS 'Dimensiones extensibles de account_balance. Mismo patrón que acc_journal_line_dim.';

-- =============================================================================
-- SECTION 16: CONSOLIDATION JOURNALS
-- Depende de: acc_consolidation_run, acc_period, core_entities, acc_reporting_account
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_consolidation_journal (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consolidation_run_id  BIGINT        NOT NULL REFERENCES acc_consolidation_run(id),
  period_id             BIGINT        NOT NULL REFERENCES acc_period(id),
  group_entity_id       UUID          NOT NULL REFERENCES core_entities(id),
  journal_type          TEXT          NOT NULL,
  -- 'intercompany_elimination'|'nci'|'ias28'|'reclassification'|'other'
  elimination_type      TEXT,
  -- 'cxc_cxp'|'loans'|'current_accounts'|'sales_purchases'|'services'
  -- 'mgmt_fee'|'dividends'|'unrealized_margin'|'ppe_ic'|'deferred_tax_ic'|'other'
  entity_origin_id      UUID          REFERENCES core_entities(id),
  entity_counterpart_id UUID          REFERENCES core_entities(id),
  elimination_rule      TEXT,
  source                TEXT          NOT NULL DEFAULT 'manual',
  -- 'auto'|'manual'
  status                TEXT          NOT NULL DEFAULT 'draft',
  -- 'draft'|'submitted'|'approved'|'posted'|'reversed'
  reversal_of           BIGINT        REFERENCES acc_consolidation_journal(id),
  prepared_by           TEXT          NOT NULL,
  approved_by           TEXT,
  evidence_ref          TEXT,
  description           TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT ck_cj_journal_type CHECK (journal_type IN (
    'intercompany_elimination','nci','ias28','reclassification','other'
  )),
  CONSTRAINT ck_cj_source       CHECK (source IN ('auto','manual')),
  CONSTRAINT ck_cj_status       CHECK (status IN ('draft','submitted','approved','posted','reversed'))
  -- [T2] SUM(debit) = SUM(credit): requiere trigger — toda eliminación debe estar balanceada
);

CREATE TABLE IF NOT EXISTS acc_consolidation_journal_line (
  id                       BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consolidation_journal_id BIGINT        NOT NULL REFERENCES acc_consolidation_journal(id) ON DELETE CASCADE,
  line_number              INT           NOT NULL,
  entity_id                UUID          NOT NULL REFERENCES core_entities(id),
  reporting_account_id     BIGINT        NOT NULL REFERENCES acc_reporting_account(id),
  debit                    NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit                   NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  presentation_currency    CHAR(3)       NOT NULL,
  description              TEXT,

  CONSTRAINT uq_cjl_journal_line UNIQUE (consolidation_journal_id, line_number),
  CONSTRAINT ck_cjl_nonzero      CHECK (debit > 0 OR credit > 0)
);

COMMENT ON TABLE acc_consolidation_journal IS 'Eliminación intercompany como journal balanceado. ∑debit = ∑credit obligatorio [T2]. Nunca un par de cuentas + monto; siempre N líneas balanceadas.';

-- =============================================================================
-- SECTION 17: IAS 28 & NCI
-- Depende de: acc_period, acc_consolidation_run, core_entities, acc_ownership, acc_conversion_rate_used
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_equity_method_entry (
  id                           BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id                    BIGINT        NOT NULL REFERENCES acc_period(id),
  consolidation_run_id         BIGINT        REFERENCES acc_consolidation_run(id),
  investor_entity_id           UUID          NOT NULL REFERENCES core_entities(id),
  investee_entity_id           UUID          NOT NULL REFERENCES core_entities(id),
  ownership_id                 BIGINT        NOT NULL REFERENCES acc_ownership(id),
  -- Movimientos del período (moneda presentación)
  carrying_amount_open         NUMERIC(18,4) NOT NULL,
  result_increment             NUMERIC(18,4) NOT NULL DEFAULT 0,
  oci_increment                NUMERIC(18,4) NOT NULL DEFAULT 0,
  dividends_received           NUMERIC(18,4) NOT NULL DEFAULT 0,
  contributions                NUMERIC(18,4) NOT NULL DEFAULT 0,
  disposals                    NUMERIC(18,4) NOT NULL DEFAULT 0,
  ownership_change_effect      NUMERIC(18,4) NOT NULL DEFAULT 0,
  impairment                   NUMERIC(18,4) NOT NULL DEFAULT 0,
  fx_translation_effect        NUMERIC(18,4) NOT NULL DEFAULT 0,
  carrying_amount_close        NUMERIC(18,4) NOT NULL,
  -- Datos de entrada del período
  investee_net_result_local    NUMERIC(18,4),
  investee_net_result_currency CHAR(3),
  investee_result_rate_id      BIGINT        REFERENCES acc_conversion_rate_used(id),
  investee_oci_local           NUMERIC(18,4),
  investee_dividends_local     NUMERIC(18,4),
  -- Granularidad [T7]
  result_granularity           TEXT          NOT NULL,
  -- 'monthly_incremental'|'ytd_cumulative'
  ytd_prior_period_result      NUMERIC(18,4),  -- obligatorio si ytd_cumulative
  status                       TEXT          NOT NULL DEFAULT 'draft',
  -- 'draft'|'approved'
  approved_by                  TEXT,
  created_at                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7

  CONSTRAINT uq_eme_period_investor_investee UNIQUE (period_id, investor_entity_id, investee_entity_id),
  CONSTRAINT ck_eme_no_self_inv   CHECK (investor_entity_id <> investee_entity_id),
  CONSTRAINT ck_eme_granularity   CHECK (result_granularity IN ('monthly_incremental','ytd_cumulative')),
  CONSTRAINT ck_eme_ytd_requires_prior CHECK (
    result_granularity <> 'ytd_cumulative' OR ytd_prior_period_result IS NOT NULL
  ),
  CONSTRAINT ck_eme_status        CHECK (status IN ('draft','approved'))
  -- [T7] carrying_amount_close = open + movimientos: requiere trigger
);

COMMENT ON COLUMN acc_equity_method_entry.result_granularity    IS 'IAS 28: si fuente entrega YTD, el sistema deriva result_increment = YTD_actual - YTD_prior. Nunca aplica YTD directamente.';
COMMENT ON COLUMN acc_equity_method_entry.ytd_prior_period_result IS 'Obligatorio cuando ytd_cumulative. result_increment = investee_net_result_local - ytd_prior_period_result.';

CREATE TABLE IF NOT EXISTS acc_nci_movement (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id            BIGINT        NOT NULL REFERENCES acc_period(id),
  consolidation_run_id BIGINT        REFERENCES acc_consolidation_run(id),
  entity_id            UUID          NOT NULL REFERENCES core_entities(id),
  ownership_id         BIGINT        NOT NULL REFERENCES acc_ownership(id),
  -- Balance NCI en patrimonio [T8]
  nci_equity_open      NUMERIC(18,4) NOT NULL,
  nci_result_share     NUMERIC(18,4) NOT NULL DEFAULT 0,
  nci_oci_share        NUMERIC(18,4) NOT NULL DEFAULT 0,
  nci_dividends        NUMERIC(18,4) NOT NULL DEFAULT 0,
  nci_ownership_change NUMERIC(18,4) NOT NULL DEFAULT 0,
  nci_other            NUMERIC(18,4) NOT NULL DEFAULT 0,
  nci_equity_close     NUMERIC(18,4) NOT NULL,
  -- P&L: resultado atribuible a NCI
  nci_pl_result        NUMERIC(18,4) NOT NULL DEFAULT 0,
  status               TEXT          NOT NULL DEFAULT 'draft',
  approved_by          TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7

  CONSTRAINT uq_nci_period_entity UNIQUE (period_id, entity_id, consolidation_run_id),
  CONSTRAINT ck_nci_status        CHECK (status IN ('draft','approved'))
  -- [T8] nci_equity_close = open + movimientos: requiere trigger
);

COMMENT ON TABLE acc_nci_movement IS 'NCI movement table. Reconciliación: nci_equity_close = open + result + oci - dividends +/- changes. Balance (nci_equity_close) separado de P&L (nci_pl_result).';

-- =============================================================================
-- SECTION 18: CONSOLIDATION RESULTS & SNAPSHOT
-- Depende de: acc_consolidation_run, core_entities, acc_reporting_line, acc_reporting_account
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_consolidation_result_line (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consolidation_run_id  BIGINT        NOT NULL REFERENCES acc_consolidation_run(id),
  entity_id             UUID          NOT NULL REFERENCES core_entities(id),
  reporting_line_id     BIGINT        NOT NULL REFERENCES acc_reporting_line(id),
  reporting_account_id  BIGINT        NOT NULL REFERENCES acc_reporting_account(id),
  -- Columnas de reconciliación
  individual_value      NUMERIC(18,4) NOT NULL DEFAULT 0,
  eliminations_value    NUMERIC(18,4) NOT NULL DEFAULT 0,
  adjustments_value     NUMERIC(18,4) NOT NULL DEFAULT 0,
  ias28_value           NUMERIC(18,4) NOT NULL DEFAULT 0,
  nci_value             NUMERIC(18,4) NOT NULL DEFAULT 0,
  consolidated_value    NUMERIC(18,4) NOT NULL,
  presentation_currency CHAR(3)       NOT NULL,

  CONSTRAINT uq_crl_run_entity_line UNIQUE (consolidation_run_id, entity_id, reporting_account_id)
);

-- Snapshot inmutable post-aprobación
CREATE TABLE IF NOT EXISTS acc_snapshot_metadata (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consolidation_run_id BIGINT        NOT NULL UNIQUE REFERENCES acc_consolidation_run(id),
  hash_input_entries   TEXT,
  hash_mappings_used   TEXT,
  hash_ownership_used  TEXT,
  hash_result_lines    TEXT,
  mapping_snapshot     JSONB,
  ownership_snapshot   JSONB,
  currency_run_id      BIGINT        REFERENCES acc_conversion_run(id),
  rules_applied        JSONB,
  total_eliminations   INT,
  total_adjustments    INT,
  validated_at         TIMESTAMPTZ,
  validated_by         TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
  -- Sin updated_at: tabla append-only (inmutable post-aprobación)
);

COMMENT ON TABLE acc_snapshot_metadata IS 'Snapshot inmutable al aprobar consolidation_run. Hashes permiten verificar integridad. JSONB contiene copias congeladas. Sin updated_at — append-only.';

-- =============================================================================
-- SECTION 19: REPORTING RUN (separado de period close)
-- Depende de: acc_period, acc_consolidation_run
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_reporting_run (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id            BIGINT        NOT NULL REFERENCES acc_period(id),
  consolidation_run_id BIGINT        REFERENCES acc_consolidation_run(id),
  run_version          INT           NOT NULL DEFAULT 1,
  correction_type      TEXT,
  -- NULL | 'mapping_correction' (Caso A) | 'accounting_correction' (Caso B)
  status               TEXT          NOT NULL DEFAULT 'draft',
  -- 'draft'|'submitted'|'approved'|'superseded'
  superseded_by        BIGINT        REFERENCES acc_reporting_run(id),
  submitted_by         TEXT,
  approved_by          TEXT,
  approved_at          TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- NOTE7

  CONSTRAINT uq_rr_period_version  UNIQUE (period_id, run_version),
  CONSTRAINT ck_rr_status          CHECK (status IN ('draft','submitted','approved','superseded')),
  CONSTRAINT ck_rr_correction_type CHECK (correction_type IS NULL OR correction_type IN (
    'mapping_correction','accounting_correction'
  ))
);

COMMENT ON TABLE acc_reporting_run IS 'Aprobación del reporte financiero. SEPARADO de acc_period (cierre operativo). Período locked puede tener múltiples reporting_run. Caso A (mapping correction) no reabre período. Caso B requiere proceso controlado.';

-- =============================================================================
-- SECTION 20: PLANNING LEDGER (dominio separado)
-- Depende de: pln_scenario, acc_period, core_entities, acc_reporting_account
-- =============================================================================

CREATE TABLE IF NOT EXISTS pln_budget_entry (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id           BIGINT        NOT NULL REFERENCES pln_scenario(id),
  period_id             BIGINT        NOT NULL REFERENCES acc_period(id),
  entity_id             UUID          NOT NULL REFERENCES core_entities(id),
  reporting_account_id  BIGINT        NOT NULL REFERENCES acc_reporting_account(id),
  value                 NUMERIC(18,4) NOT NULL,
  presentation_currency CHAR(3)       NOT NULL DEFAULT 'USD',
  loaded_by             TEXT          NOT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_pbe_scenario_period_entity_account
    UNIQUE (scenario_id, period_id, entity_id, reporting_account_id)
);

CREATE TABLE IF NOT EXISTS pln_budget_entry_dim (
  id              BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  budget_entry_id BIGINT  NOT NULL REFERENCES pln_budget_entry(id) ON DELETE CASCADE,
  dim_type_id     BIGINT  NOT NULL REFERENCES dim_type(id),
  dim_value_id    BIGINT  NOT NULL REFERENCES dim_value(id),

  CONSTRAINT uq_pbed_entry_type UNIQUE (budget_entry_id, dim_type_id)
);

COMMENT ON TABLE pln_budget_entry IS 'Planning Ledger separado del Accounting Ledger. Comparte: entity_id, period_id, reporting_account_id, dimensiones. NO comparte tablas con acc_*.';

-- =============================================================================
-- SECTION 21: INDEXES
-- =============================================================================

-- core_entities
CREATE INDEX IF NOT EXISTS ix_core_entities_code    ON core_entities(code);
CREATE INDEX IF NOT EXISTS ix_core_entities_group   ON core_entities(group_id);

-- acc_period
CREATE INDEX IF NOT EXISTS ix_acc_period_entity     ON acc_period(entity_id, period_code);
CREATE INDEX IF NOT EXISTS ix_acc_period_status     ON acc_period(entity_id, status);  -- NOTE8: para [T10]

-- acc_entity_config
CREATE INDEX IF NOT EXISTS ix_entity_config_entity  ON acc_entity_config(entity_id, effective_from);

-- acc_ownership
CREATE INDEX IF NOT EXISTS ix_ownership_entity      ON acc_ownership(entity_id, effective_from);
CREATE INDEX IF NOT EXISTS ix_ownership_parent      ON acc_ownership(parent_entity_id);

-- acc_source_batch
CREATE INDEX IF NOT EXISTS ix_sb_entity_period      ON acc_source_batch(entity_id, period_id);
CREATE INDEX IF NOT EXISTS ix_sb_file_hash          ON acc_source_batch(file_hash) WHERE file_hash IS NOT NULL;

-- acc_journal_entry
CREATE INDEX IF NOT EXISTS ix_je_entity_period      ON acc_journal_entry(entity_id, period_id);
CREATE INDEX IF NOT EXISTS ix_je_posting_date       ON acc_journal_entry(posting_date);
CREATE INDEX IF NOT EXISTS ix_je_batch              ON acc_journal_entry(source_batch_id);
CREATE INDEX IF NOT EXISTS ix_je_status             ON acc_journal_entry(entity_id, status);

-- acc_journal_line
CREATE INDEX IF NOT EXISTS ix_jl_entry              ON acc_journal_line(journal_entry_id);
CREATE INDEX IF NOT EXISTS ix_jl_source_account     ON acc_journal_line(source_account_code);
CREATE INDEX IF NOT EXISTS ix_jl_reporting_account  ON acc_journal_line(reporting_account_id);

-- acc_account_balance
CREATE INDEX IF NOT EXISTS ix_ab_entity_period      ON acc_account_balance(entity_id, period_id);
CREATE INDEX IF NOT EXISTS ix_ab_source_account     ON acc_account_balance(source_account_code);
CREATE INDEX IF NOT EXISTS ix_ab_batch              ON acc_account_balance(source_batch_id);

-- acc_chart_mapping
CREATE INDEX IF NOT EXISTS ix_cm_entity_account     ON acc_chart_mapping(entity_id, source_account_code);
CREATE INDEX IF NOT EXISTS ix_cm_effective          ON acc_chart_mapping(effective_from, effective_to);

-- acc_consolidation_run
CREATE INDEX IF NOT EXISTS ix_cr_period             ON acc_consolidation_run(period_id, group_entity_id);

-- acc_conversion_run
CREATE INDEX IF NOT EXISTS ix_conv_run_period       ON acc_conversion_run(period_id);
CREATE INDEX IF NOT EXISTS ix_conv_run_consol       ON acc_conversion_run(consolidation_run_id);

-- acc_consolidation_result_line
CREATE INDEX IF NOT EXISTS ix_crl_run_entity        ON acc_consolidation_result_line(consolidation_run_id, entity_id);
CREATE INDEX IF NOT EXISTS ix_crl_account           ON acc_consolidation_result_line(reporting_account_id);

-- acc_equity_method_entry
CREATE INDEX IF NOT EXISTS ix_eme_period_investor   ON acc_equity_method_entry(period_id, investor_entity_id);

-- acc_adjustment_journal
CREATE INDEX IF NOT EXISTS ix_adj_entity_period     ON acc_adjustment_journal(entity_id, period_id);
CREATE INDEX IF NOT EXISTS ix_adj_status            ON acc_adjustment_journal(status);

-- pln_budget_entry
CREATE INDEX IF NOT EXISTS ix_pbe_scenario_entity   ON pln_budget_entry(scenario_id, entity_id);
CREATE INDEX IF NOT EXISTS ix_pbe_period            ON pln_budget_entry(period_id);

-- =============================================================================
-- SECTION 22: RLS STRATEGY (referencia — no ejecutar)
-- =============================================================================

/*
ESTRATEGIA RLS POR DOMINIO:

core_entities:
  - SELECT para authenticated (todos los usuarios ven entidades)
  - INSERT/UPDATE/DELETE solo para platform_admin (CFO o rol designado)
  - anon: SIN ACCESO (datos societarios sensibles)

acc_period, acc_entity_config, acc_ownership:
  - SELECT para authenticated
  - INSERT/UPDATE para accounting_admin
  - anon: SIN ACCESO

acc_journal_entry, acc_journal_line, acc_account_balance:
  - SELECT/INSERT para authenticated CON FILTRO entity_id IN (user_entity_access)
  - UPDATE/DELETE: solo para batches en status='pending'
  - anon: SIN ACCESO
  - Trigger [T10] rechaza INSERT si acc_period.status = 'locked'

acc_source_batch:
  - SELECT/INSERT para authenticated con filtro entity_id
  - UPDATE solo para service_role (batch processing)
  - anon: SIN ACCESO

acc_consolidation_run, acc_conversion_run, acc_snapshot_metadata:
  - SELECT para authenticated
  - INSERT/UPDATE para consolidation_admin
  - acc_snapshot_metadata: sin UPDATE (append-only, trigger protege)
  - anon: SIN ACCESO

acc_reporting_run:
  - SELECT para authenticated
  - INSERT/UPDATE para reporting_admin
  - anon: SIN ACCESO

acc_equity_method_entry, acc_nci_movement:
  - SELECT para authenticated
  - INSERT/UPDATE para accounting_admin
  - anon: SIN ACCESO

acc_materiality_policy:
  - SELECT para authenticated
  - INSERT/UPDATE solo para platform_admin
  - anon: SIN ACCESO

pln_* tablas:
  - SELECT para authenticated con filtro entity_id
  - INSERT/UPDATE para planning_admin
  - anon: SIN ACCESO

dim_type, dim_value, acc_reporting_account, acc_financial_statement, acc_reporting_line:
  - SELECT para authenticated (catálogos de referencia)
  - INSERT/UPDATE para platform_admin
  - anon: SIN ACCESO

Nota: Supabase service_role bypasses RLS. El backend nunca expone service_role al cliente.
La app frontend usa anon key + guardia/proxy (pendiente de reactivar post-incidente 2026-06-18).
*/

-- =============================================================================
-- SECTION 23: TRIGGER / SERVICE LAYER REQUIREMENTS
-- =============================================================================

/*
[T1] acc_journal_entry balance:
     AFTER INSERT/UPDATE ON acc_journal_line
     ASSERT SUM(debit) = SUM(credit) ± 0.005 (tolerancia redondeo)
     por journal_entry_id. Raise exception si desequilibrado.

[T2] acc_consolidation_journal balance:
     AFTER INSERT/UPDATE ON acc_consolidation_journal_line
     ASSERT SUM(debit) = SUM(credit)
     por consolidation_journal_id.

[T3] acc_adjustment_journal balance:
     AFTER INSERT/UPDATE ON acc_adjustment_journal_line
     ASSERT SUM(debit) = SUM(credit)
     por adjustment_journal_id.

[T4] acc_ownership no-overlap:
     BEFORE INSERT/UPDATE ON acc_ownership
     ASSERT no existe otro registro activo con mismo (entity_id, parent_entity_id)
     con rango de fechas solapado.
     Alternativa: EXCLUDE USING gist (requiere btree_gist extension).

[T5] acc_entity_config no-overlap:
     Mismo patrón que [T4] para (entity_id).

[T6] acc_source_batch idempotencia:
     Service layer verifica file_hash antes de procesar.
     Si existe batch en mismo (entity_id, period_id) con mismo hash y status='validated' → rechazar.
     La verificación en service layer es suficiente; trigger opcional para defense-in-depth.

[T7] acc_equity_method_entry balance check:
     BEFORE INSERT ON acc_equity_method_entry
     ASSERT carrying_amount_close =
       carrying_amount_open + result_increment + oci_increment
       + dividends_received + contributions - disposals
       + ownership_change_effect - impairment + fx_translation_effect
     ± 0.01 tolerancia.
     Si result_granularity = 'ytd_cumulative':
       ASSERT result_increment = investee_net_result_local - ytd_prior_period_result

[T8] acc_nci_movement balance check:
     BEFORE INSERT ON acc_nci_movement
     ASSERT nci_equity_close =
       nci_equity_open + nci_result_share + nci_oci_share
       + nci_dividends + nci_ownership_change + nci_other
     ± 0.01 tolerancia.

[T9] acc_adjustment_journal SoD:
     BEFORE UPDATE (status → 'approved') ON acc_adjustment_journal
     IF ABS(total_adjustment) > (SELECT absolute_threshold FROM acc_materiality_policy WHERE scope_type='global'):
       ASSERT prepared_by != approved_by
     Raise exception si misma persona prepara y aprueba un ajuste material.

[T10] acc_period lock protection:
      BEFORE INSERT ON acc_journal_entry, acc_account_balance:
        SELECT status FROM acc_period WHERE id = NEW.period_id
        IF status = 'locked' → RAISE EXCEPTION 'Período bloqueado. Solo ajustes via acc_adjustment_journal.'
        IF status IN ('closed','post_close_adjustment') → verificar que sea via acc_adjustment_journal

[T11] updated_at auto-update:
      BEFORE UPDATE ON tablas con updated_at:
        NEW.updated_at = now()
      Tablas: core_entities, acc_consolidation_run, acc_conversion_run, acc_journal_entry,
              acc_adjustment_journal, acc_reporting_run, acc_equity_method_entry,
              acc_nci_movement, pln_scenario
*/

-- =============================================================================
-- END OF DESIGN ARTIFACT v2
-- Static Review: PASS — 0 blockers, 0 notas pendientes (OA-024-04)
-- 36 tablas en orden topológico correcto, 0 ciclos FK
-- NO EJECUTAR SIN GO EXPLÍCITO DEL CFO
-- OA-024-01 Architecture Frozen v1 — OA-024-04 Technical Closure
-- =============================================================================
