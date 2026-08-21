-- =============================================================================
-- 008_accounting_tables_apply.sql
-- OA-024-05 ETAPA 0 — Accounting Schema v2: 36 tablas en orden topológico
-- Fecha   : 2026-08-14
-- Estado  : EJECUTAR DESPUÉS de 007 (security gate) y 006 (core_entities)
-- =============================================================================
-- FIXES INCLUIDOS (de OA-024-04):
--   B1: acc_financial_statement y acc_reporting_account creados en Tier 0
--       (antes journals), para que acc_reporting_line pueda FK a acc_reporting_account.
--   B2: acc_consolidation_run sin FK circular a sí mismo.
--       parent_run_id eliminado. Re-ejecuciones se rastrean por audit log externo.
--   B3: acc_consolidation_result_line y acc_account_balance usan
--       scope_entity_id + scope_reporting_line_id en lugar de scope_ref_id polimórfico.
-- =============================================================================
-- NO INCLUYE: core_entities (006), RLS (009), triggers (010), seeds (011).
-- =============================================================================

-- =============================================================================
-- TIER 0 — Sin dependencias
-- =============================================================================

-- T0.1: Dimensiones de análisis
CREATE TABLE IF NOT EXISTS dim_type (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         TEXT         NOT NULL,
  label        TEXT         NOT NULL,
  description  TEXT,
  allows_multiple BOOLEAN   NOT NULL DEFAULT false,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_dim_type_code UNIQUE (code)
);

-- T0.2: Estados Financieros estándar IFRS (B1: va en Tier 0)
CREATE TABLE IF NOT EXISTS acc_financial_statement (
  id             BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           TEXT         NOT NULL,
  name           TEXT         NOT NULL,
  statement_type TEXT         NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_fs_code UNIQUE (code),
  CONSTRAINT ck_acc_fs_type CHECK (statement_type IN (
    'balance_sheet', 'income', 'cash_flow', 'equity_changes'
  ))
);

-- T0.3: Escenarios de planificación
CREATE TABLE IF NOT EXISTS pln_scenario (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         TEXT         NOT NULL,
  label        TEXT         NOT NULL,
  description  TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  is_locked    BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_pln_scenario_code UNIQUE (code)
);

-- T0.4: Cuentas de reporting de alto nivel (B1: antes de acc_reporting_line)
CREATE TABLE IF NOT EXISTS acc_reporting_account (
  id                    BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  financial_statement_id BIGINT      NOT NULL
                          REFERENCES acc_financial_statement(id) ON DELETE RESTRICT,
  code                  TEXT         NOT NULL,
  name                  TEXT         NOT NULL,
  normal_balance        TEXT         NOT NULL DEFAULT 'debit',
  sort_order            INT          NOT NULL DEFAULT 0,
  is_subtotal           BOOLEAN      NOT NULL DEFAULT false,
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_reporting_account_code UNIQUE (code),
  CONSTRAINT ck_acc_ra_normal_balance CHECK (normal_balance IN ('debit','credit'))
);

-- =============================================================================
-- TIER 1 — Dependen de Tier 0 y/o core_entities
-- =============================================================================

-- T1.1: Valores de dimensión por entidad
CREATE TABLE IF NOT EXISTS dim_value (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dim_type_id BIGINT       NOT NULL REFERENCES dim_type(id) ON DELETE RESTRICT,
  entity_id   UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  code        TEXT         NOT NULL,
  label       TEXT         NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_dim_value_entity_type_code UNIQUE (entity_id, dim_type_id, code)
);

-- T1.2: Líneas de reporte detalladas (B1: FK a acc_reporting_account creada antes)
CREATE TABLE IF NOT EXISTS acc_reporting_line (
  id                   BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_account_id BIGINT       NOT NULL
                         REFERENCES acc_reporting_account(id) ON DELETE RESTRICT,
  code                 TEXT         NOT NULL,
  name                 TEXT         NOT NULL,
  normal_balance       TEXT         NOT NULL DEFAULT 'debit',
  parent_line_id       BIGINT       REFERENCES acc_reporting_line(id) ON DELETE SET NULL,
  sort_order           INT          NOT NULL DEFAULT 0,
  is_subtotal          BOOLEAN      NOT NULL DEFAULT false,
  is_active            BOOLEAN      NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_reporting_line_code UNIQUE (code),
  CONSTRAINT ck_acc_rl_normal_balance CHECK (normal_balance IN ('debit','credit'))
);

-- T1.3: Perfil contable base (uno por entidad, no temporal)
-- Referencia canónica de moneda funcional y método de consolidación.
-- D8 ABIERTO: functional_currency puede ser NULL hasta ficha técnica del CFO.
CREATE TABLE IF NOT EXISTS acc_base_profile (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id            UUID         NOT NULL UNIQUE
                         REFERENCES core_entities(id) ON DELETE RESTRICT,
  functional_currency  CHAR(3),      -- NULL = D8 sin resolver
  reporting_currency   CHAR(3)       NOT NULL DEFAULT 'USD',
  consol_method        TEXT         NOT NULL DEFAULT 'unresolved',
  is_ifrs              BOOLEAN      NOT NULL DEFAULT true,
  framework_version    TEXT         NOT NULL DEFAULT 'IFRS-2024',
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_base_profile_consol CHECK (consol_method IN (
    'line_by_line', 'equity_method', 'cost_method', 'proportional', 'unresolved'
  ))
);

-- T1.4: Períodos contables por entidad
CREATE TABLE IF NOT EXISTS acc_period (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id    UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_type  TEXT         NOT NULL DEFAULT 'monthly',
  fiscal_year  INT          NOT NULL,
  fiscal_month INT,
  fiscal_quarter INT,
  date_from    DATE         NOT NULL,
  date_to      DATE         NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'open',
  locked_at    TIMESTAMPTZ,
  locked_by    TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_period_entity_type_year_month
    UNIQUE (entity_id, period_type, fiscal_year, fiscal_month),
  CONSTRAINT ck_acc_period_type CHECK (period_type IN (
    'monthly','quarterly','annual','ytd'
  )),
  CONSTRAINT ck_acc_period_status CHECK (status IN (
    'open','closed','locked','forecast'
  )),
  CONSTRAINT ck_acc_period_dates CHECK (date_to >= date_from)
);

-- T1.5: Configuración contable por entidad (temporal)
-- Permite cambios de moneda funcional o método a lo largo del tiempo.
-- D8 ABIERTO: functional_currency puede ser NULL.
CREATE TABLE IF NOT EXISTS acc_entity_config (
  id                   BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  effective_from       DATE         NOT NULL,
  effective_to         DATE,
  functional_currency  CHAR(3),     -- NULL = D8 sin resolver
  reporting_currency   CHAR(3)       NOT NULL DEFAULT 'USD',
  consol_method        TEXT         NOT NULL DEFAULT 'unresolved',
  ownership_pct        NUMERIC(7,4),
  nci_pct              NUMERIC(7,4),
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_entity_config_consol CHECK (consol_method IN (
    'line_by_line', 'equity_method', 'cost_method', 'proportional', 'unresolved'
  )),
  CONSTRAINT ck_acc_entity_config_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

-- T1.6: Estructura de propiedad (temporal)
-- D7 ABIERTO: insertar solo cuando haya evidencia de negocio externa.
CREATE TABLE IF NOT EXISTS acc_ownership (
  id                BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id         UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  parent_entity_id  UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  effective_from    DATE         NOT NULL,
  effective_to      DATE,
  ownership_pct     NUMERIC(7,4) NOT NULL,
  nci_pct           NUMERIC(7,4),
  is_direct         BOOLEAN      NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_ownership_not_self CHECK (entity_id <> parent_entity_id),
  CONSTRAINT ck_acc_ownership_pct CHECK (ownership_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_acc_ownership_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

-- =============================================================================
-- TIER 2 — Dependen de Tier 1
-- =============================================================================

-- T2.1: Política de materialidad
CREATE TABLE IF NOT EXISTS acc_materiality_policy (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id       UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  threshold_pct   NUMERIC(5,2),  -- ej. 5.00 = 5%
  threshold_abs   NUMERIC(18,2), -- monto absoluto en reporting currency
  currency        CHAR(3)       NOT NULL DEFAULT 'USD',
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  valid_from      DATE          NOT NULL,
  valid_to        DATE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_mat_policy_dates CHECK (
    valid_to IS NULL OR valid_to >= valid_from
  )
);

-- T2.2: Perfil de empresa (join entre entidad y perfil base)
CREATE TABLE IF NOT EXISTS acc_company_profile (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id        UUID         NOT NULL UNIQUE
                     REFERENCES core_entities(id) ON DELETE RESTRICT,
  base_profile_id  UUID         NOT NULL REFERENCES acc_base_profile(id) ON DELETE RESTRICT,
  trade_name       TEXT,
  fiscal_id        TEXT,
  country          CHAR(2),
  reporting_standard TEXT       NOT NULL DEFAULT 'IFRS',
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- T2.3: Mapeo plan de cuentas local → línea de reporte
CREATE TABLE IF NOT EXISTS acc_chart_mapping (
  id                   BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  local_account_code   TEXT         NOT NULL,
  reporting_account_id BIGINT       NOT NULL
                         REFERENCES acc_reporting_account(id) ON DELETE RESTRICT,
  effective_from       DATE         NOT NULL,
  effective_to         DATE,
  is_active            BOOLEAN      NOT NULL DEFAULT true,
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_chart_mapping UNIQUE (entity_id, local_account_code, effective_from),
  CONSTRAINT ck_acc_chart_mapping_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

-- T2.4: Lotes de ingesta (fuente de datos externos)
-- T6: file_hash UNIQUE = idempotency constraint
CREATE TABLE IF NOT EXISTS acc_source_batch (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  source_system   TEXT         NOT NULL,
  file_name       TEXT         NOT NULL,
  file_hash       TEXT         NOT NULL,
  period_id       UUID         REFERENCES acc_period(id) ON DELETE SET NULL,
  row_count       INT          NOT NULL DEFAULT 0,
  status          TEXT         NOT NULL DEFAULT 'pending',
  imported_at     TIMESTAMPTZ,
  imported_by     TEXT,
  error_detail    TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_source_batch_hash UNIQUE (file_hash),
  CONSTRAINT ck_acc_source_batch_status CHECK (status IN (
    'pending','processing','completed','failed','rejected'
  ))
);

-- T2.5: Auditoría de cambios de estado de período
CREATE TABLE IF NOT EXISTS acc_period_audit (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id    UUID         NOT NULL REFERENCES acc_period(id) ON DELETE CASCADE,
  entity_id    UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  event_type   TEXT         NOT NULL,
  from_status  TEXT,
  to_status    TEXT,
  event_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  performed_by TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- T2.6: Overrides de mapeo de período (ej. diferencias de fecha de corte)
CREATE TABLE IF NOT EXISTS acc_period_mapping_override (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id        UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  source_period    TEXT         NOT NULL,  -- periodo externo (ej. "2025-03")
  target_period_id UUID         NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_period_mapping_override UNIQUE (entity_id, source_period)
);

-- =============================================================================
-- TIER 3 — Dependen de Tier 2
-- =============================================================================

-- T3.1: Journals de ajuste de consolidación
CREATE TABLE IF NOT EXISTS acc_adjustment_journal (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id        UUID         NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  adj_type         TEXT         NOT NULL DEFAULT 'manual',
  description      TEXT         NOT NULL,
  is_material      BOOLEAN      NOT NULL DEFAULT false,
  status           TEXT         NOT NULL DEFAULT 'draft',
  prepared_by      TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  reversal_date    DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_adj_journal_type CHECK (adj_type IN (
    'manual', 'accrual', 'deferral', 'reclassification', 'elimination', 'fx', 'nci', 'other'
  )),
  CONSTRAINT ck_acc_adj_journal_status CHECK (status IN (
    'draft', 'submitted', 'approved', 'posted', 'reversed', 'rejected'
  ))
);

-- T3.2: Run de consolidación (B2: sin FK circular)
CREATE TABLE IF NOT EXISTS acc_consolidation_run (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporting_period_id  UUID         NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  parent_entity_id     UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  run_label            TEXT,
  status               TEXT         NOT NULL DEFAULT 'pending',
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  error_detail         TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_consol_run_status CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  ))
);

-- T3.3: Run de conversión de moneda
CREATE TABLE IF NOT EXISTS acc_conversion_run (
  id             UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id      UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id      UUID         NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  from_currency  CHAR(3)      NOT NULL,
  to_currency    CHAR(3)      NOT NULL,
  method         TEXT         NOT NULL DEFAULT 'current_rate',
  status         TEXT         NOT NULL DEFAULT 'pending',
  executed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_conversion_run_method CHECK (method IN (
    'current_rate', 'average_rate', 'historical_rate', 'closing_rate'
  )),
  CONSTRAINT ck_acc_conversion_run_status CHECK (status IN (
    'pending', 'running', 'completed', 'failed'
  )),
  CONSTRAINT ck_acc_conversion_run_currencies CHECK (from_currency <> to_currency)
);

-- =============================================================================
-- TIER 4 — Dependen de Tier 3
-- =============================================================================

-- T4.1: Asiento contable (journal entry header)
CREATE TABLE IF NOT EXISTS acc_journal_entry (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        UUID         NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id        UUID         NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  source_batch_id  UUID         REFERENCES acc_source_batch(id) ON DELETE SET NULL,
  entry_date       DATE         NOT NULL,
  ref_number       TEXT,
  description      TEXT         NOT NULL,
  currency         CHAR(3)      NOT NULL DEFAULT 'USD',
  status           TEXT         NOT NULL DEFAULT 'draft',
  reversal_of_id   UUID         REFERENCES acc_journal_entry(id) ON DELETE SET NULL,
  posted_at        TIMESTAMPTZ,
  posted_by        TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_journal_entry_status CHECK (status IN (
    'draft', 'pending_approval', 'posted', 'reversed', 'void'
  ))
);

-- T4.2: Líneas de ajuste
CREATE TABLE IF NOT EXISTS acc_adjustment_journal_line (
  id                     BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adjustment_journal_id  UUID         NOT NULL
                           REFERENCES acc_adjustment_journal(id) ON DELETE CASCADE,
  sort_order             INT          NOT NULL DEFAULT 0,
  account_code           TEXT         NOT NULL,
  description            TEXT,
  debit                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit                 NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency               CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_adj_line_debit_credit CHECK (
    debit >= 0 AND credit >= 0 AND (debit > 0 OR credit > 0)
  ),
  CONSTRAINT ck_acc_adj_line_not_both CHECK (NOT (debit > 0 AND credit > 0))
);

-- T4.3: Tasas de conversión usadas en un run
CREATE TABLE IF NOT EXISTS acc_conversion_rate_used (
  id                BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversion_run_id UUID         NOT NULL
                      REFERENCES acc_conversion_run(id) ON DELETE CASCADE,
  from_currency     CHAR(3)      NOT NULL,
  to_currency       CHAR(3)      NOT NULL,
  rate              NUMERIC(20,8) NOT NULL,
  rate_date         DATE         NOT NULL,
  rate_type         TEXT         NOT NULL DEFAULT 'closing',
  source            TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_conv_rate_type CHECK (rate_type IN (
    'closing', 'average', 'historical', 'spot'
  )),
  CONSTRAINT ck_acc_conv_rate_positive CHECK (rate > 0)
);

-- =============================================================================
-- TIER 5 — Dependen de Tier 4
-- =============================================================================

-- T5.1: Líneas de asiento
CREATE TABLE IF NOT EXISTS acc_journal_line (
  id               BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id UUID          NOT NULL
                     REFERENCES acc_journal_entry(id) ON DELETE CASCADE,
  sort_order       INT           NOT NULL DEFAULT 0,
  account_code     TEXT          NOT NULL,
  description      TEXT,
  debit            NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit           NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency         CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_jl_debit_credit CHECK (
    debit >= 0 AND credit >= 0 AND (debit > 0 OR credit > 0)
  ),
  CONSTRAINT ck_acc_jl_not_both CHECK (NOT (debit > 0 AND credit > 0))
);

-- T5.2: Saldos contables por cuenta y período (B3: sin scope polimórfico)
CREATE TABLE IF NOT EXISTS acc_account_balance (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id             UUID          NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id             UUID          NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  account_code          TEXT          NOT NULL,
  reporting_account_id  BIGINT        REFERENCES acc_reporting_account(id) ON DELETE SET NULL,
  debit_balance         NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_balance        NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_balance           NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency              CHAR(3)       NOT NULL DEFAULT 'USD',
  balance_type          TEXT          NOT NULL DEFAULT 'actual',
  source_batch_id       UUID          REFERENCES acc_source_batch(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_account_balance UNIQUE (entity_id, period_id, account_code, balance_type),
  CONSTRAINT ck_acc_acct_balance_type CHECK (balance_type IN (
    'actual', 'budget', 'forecast', 'prior_year'
  ))
);

-- T5.3: Journals de consolidación (asientos de eliminación intercompany)
CREATE TABLE IF NOT EXISTS acc_consolidation_journal (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consolidation_run_id UUID         NOT NULL
                         REFERENCES acc_consolidation_run(id) ON DELETE CASCADE,
  elim_type            TEXT         NOT NULL DEFAULT 'intercompany',
  description          TEXT         NOT NULL,
  currency             CHAR(3)      NOT NULL DEFAULT 'USD',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_consol_journal_elim_type CHECK (elim_type IN (
    'intercompany', 'nci', 'goodwill', 'purchase_price_allocation',
    'fx_translation', 'equity_elimination', 'other'
  ))
);

-- T5.4: Movimiento de interés minoritario (NCI) — T8 valida cierre
CREATE TABLE IF NOT EXISTS acc_nci_movement (
  id                BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id         UUID          NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id         UUID          NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  consolidation_run_id UUID       REFERENCES acc_consolidation_run(id) ON DELETE SET NULL,
  nci_pct           NUMERIC(7,4)  NOT NULL,
  nci_opening       NUMERIC(18,2) NOT NULL DEFAULT 0,
  nci_share_of_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
  nci_dividends     NUMERIC(18,2) NOT NULL DEFAULT 0,
  nci_other         NUMERIC(18,2) NOT NULL DEFAULT 0,
  nci_closing       NUMERIC(18,2) NOT NULL DEFAULT 0,  -- T8 verifica
  currency          CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_nci_movement UNIQUE (entity_id, period_id)
);

-- T5.5: Método de patrimonio IAS 28 — T7 valida cierre
CREATE TABLE IF NOT EXISTS acc_equity_method_entry (
  id                   BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id            UUID          NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id            UUID          NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  investor_entity_id   UUID          NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  ownership_pct        NUMERIC(7,4)  NOT NULL,
  opening_balance      NUMERIC(18,2) NOT NULL DEFAULT 0,
  share_of_profit_loss NUMERIC(18,2) NOT NULL DEFAULT 0,
  share_of_oci         NUMERIC(18,2) NOT NULL DEFAULT 0,
  dividends_received   NUMERIC(18,2) NOT NULL DEFAULT 0,
  capital_contributions NUMERIC(18,2) NOT NULL DEFAULT 0,
  capital_reductions   NUMERIC(18,2) NOT NULL DEFAULT 0,
  fx_translation_diff  NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_adjustments    NUMERIC(18,2) NOT NULL DEFAULT 0,
  impairment           NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance      NUMERIC(18,2) NOT NULL DEFAULT 0,  -- T7 verifica
  currency             CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_equity_entry UNIQUE (entity_id, period_id, investor_entity_id),
  CONSTRAINT ck_acc_equity_entry_not_self CHECK (entity_id <> investor_entity_id)
);

-- T5.6: Líneas del resultado de consolidación (B3: scope_entity_id + scope_reporting_line_id)
CREATE TABLE IF NOT EXISTS acc_consolidation_result_line (
  id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consolidation_run_id  UUID          NOT NULL
                          REFERENCES acc_consolidation_run(id) ON DELETE CASCADE,
  reporting_line_id     BIGINT        NOT NULL
                          REFERENCES acc_reporting_line(id) ON DELETE RESTRICT,
  scope_entity_id       UUID          REFERENCES core_entities(id) ON DELETE SET NULL,
  scope_reporting_line_id BIGINT      REFERENCES acc_reporting_line(id) ON DELETE SET NULL,
  amount                NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency              CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- T5.7: Run de reporting (genera los EEFF)
CREATE TABLE IF NOT EXISTS acc_reporting_run (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consolidation_run_id UUID         REFERENCES acc_consolidation_run(id) ON DELETE SET NULL,
  scenario_id          BIGINT       NOT NULL REFERENCES pln_scenario(id) ON DELETE RESTRICT,
  period_id            UUID         NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  report_type          TEXT         NOT NULL DEFAULT 'full',
  status               TEXT         NOT NULL DEFAULT 'pending',
  generated_at         TIMESTAMPTZ,
  generated_by         TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_reporting_run_type CHECK (report_type IN (
    'full', 'interim', 'management', 'audit_trail'
  )),
  CONSTRAINT ck_acc_reporting_run_status CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'approved'
  ))
);

-- T5.8: Líneas de presupuesto
CREATE TABLE IF NOT EXISTS pln_budget_entry (
  id           BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id  BIGINT        NOT NULL REFERENCES pln_scenario(id) ON DELETE RESTRICT,
  entity_id    UUID          NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  period_id    UUID          NOT NULL REFERENCES acc_period(id) ON DELETE RESTRICT,
  account_code TEXT          NOT NULL,
  reporting_account_id BIGINT REFERENCES acc_reporting_account(id) ON DELETE SET NULL,
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency     CHAR(3)       NOT NULL DEFAULT 'USD',
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pln_budget_entry UNIQUE (scenario_id, entity_id, period_id, account_code)
);

-- =============================================================================
-- TIER 6 — Tablas hoja
-- =============================================================================

-- T6.1: Dimensiones de línea de asiento
CREATE TABLE IF NOT EXISTS acc_journal_line_dim (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_line_id BIGINT       NOT NULL REFERENCES acc_journal_line(id) ON DELETE CASCADE,
  dim_value_id    BIGINT       NOT NULL REFERENCES dim_value(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_jl_dim UNIQUE (journal_line_id, dim_value_id)
);

-- T6.2: Dimensiones de saldo de cuenta (B3: scope ya en acc_account_balance)
CREATE TABLE IF NOT EXISTS acc_account_balance_dim (
  id                 BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_balance_id BIGINT       NOT NULL REFERENCES acc_account_balance(id) ON DELETE CASCADE,
  dim_value_id       BIGINT       NOT NULL REFERENCES dim_value(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_acc_balance_dim UNIQUE (account_balance_id, dim_value_id)
);

-- T6.3: Líneas de journal de consolidación
CREATE TABLE IF NOT EXISTS acc_consolidation_journal_line (
  id                      BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consolidation_journal_id UUID         NOT NULL
                             REFERENCES acc_consolidation_journal(id) ON DELETE CASCADE,
  sort_order              INT           NOT NULL DEFAULT 0,
  account_code            TEXT          NOT NULL,
  description             TEXT,
  entity_id               UUID          REFERENCES core_entities(id) ON DELETE SET NULL,
  debit                   NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_acc_cjl_debit_credit CHECK (
    debit >= 0 AND credit >= 0 AND (debit > 0 OR credit > 0)
  ),
  CONSTRAINT ck_acc_cjl_not_both CHECK (NOT (debit > 0 AND credit > 0))
);

-- T6.4: Metadatos de snapshot de reporte (inmutable post-generación)
-- Snapshot immutability: no UPDATE trigger; insert-only por diseño.
CREATE TABLE IF NOT EXISTS acc_snapshot_metadata (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporting_run_id UUID         NOT NULL UNIQUE
                     REFERENCES acc_reporting_run(id) ON DELETE CASCADE,
  hash             TEXT         NOT NULL,
  row_count        INT          NOT NULL DEFAULT 0,
  payload_size_kb  INT,
  captured_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  captured_by      TEXT,
  is_final         BOOLEAN      NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
  -- Sin updated_at intencional: inmutable una vez insertado.
);

-- T6.5: Dimensiones de entrada de presupuesto
CREATE TABLE IF NOT EXISTS pln_budget_entry_dim (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  budget_entry_id BIGINT       NOT NULL REFERENCES pln_budget_entry(id) ON DELETE CASCADE,
  dim_value_id    BIGINT       NOT NULL REFERENCES dim_value(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_pln_budget_entry_dim UNIQUE (budget_entry_id, dim_value_id)
);

-- =============================================================================
-- ÍNDICES DE PERFORMANCE
-- =============================================================================

-- Búsqueda por período (más frecuente en reporting)
CREATE INDEX IF NOT EXISTS idx_acc_journal_entry_period ON acc_journal_entry(period_id);
CREATE INDEX IF NOT EXISTS idx_acc_journal_entry_entity ON acc_journal_entry(entity_id);
CREATE INDEX IF NOT EXISTS idx_acc_account_balance_period ON acc_account_balance(period_id);
CREATE INDEX IF NOT EXISTS idx_acc_account_balance_entity ON acc_account_balance(entity_id);
CREATE INDEX IF NOT EXISTS idx_acc_account_balance_account ON acc_account_balance(account_code);
CREATE INDEX IF NOT EXISTS idx_acc_period_entity ON acc_period(entity_id);
CREATE INDEX IF NOT EXISTS idx_acc_period_status ON acc_period(status);
CREATE INDEX IF NOT EXISTS idx_acc_source_batch_entity ON acc_source_batch(entity_id);
CREATE INDEX IF NOT EXISTS idx_acc_source_batch_status ON acc_source_batch(status);
CREATE INDEX IF NOT EXISTS idx_acc_consolidation_run_period ON acc_consolidation_run(reporting_period_id);
CREATE INDEX IF NOT EXISTS idx_dim_value_entity ON dim_value(entity_id);

-- =============================================================================
-- VERIFICACIÓN POST-DEPLOY (comentada — ejecutar manualmente en SQL Editor)
-- =============================================================================

/*
-- V1: Contar tablas creadas
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%'])
ORDER BY tablename;
-- Esperado: 33 filas (sin core_entities, que está en 006)

-- V2: Verificar FKs hacia core_entities
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'core_entities'
ORDER BY tc.table_name;

-- V3: Verificar que acc_consolidation_run NO tiene FK circular
SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'acc_consolidation_run';
-- Esperado: NINGUNA fila con ref_table = 'acc_consolidation_run' (B2 fix).

-- V4: Verificar B3 — sin scope_ref_id
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'scope_ref_id';
-- Esperado: 0 filas.
*/
