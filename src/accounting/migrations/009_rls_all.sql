-- =============================================================================
-- 009_rls_all.sql
-- OA-024-05 ETAPA 0 — RLS Fail-Closed: acc_* + pln_* + dim_* + reporting
-- Fecha   : 2026-08-14
-- Estado  : EJECUTAR DESPUÉS de 008_accounting_tables_apply.sql
-- =============================================================================
-- PRINCIPIO: Ningún role tiene acceso por defecto.
-- anon: DENEGADO en todo — sin policy explícita = sin acceso.
-- service_role: acceso total (ingesta, migrations, admin).
-- authenticated: SELECT en tablas de referencia; scope por empresa en transaccionales.
-- =============================================================================
-- NOTA: core_entities y core_entity_external_refs tienen su propio RLS en 006.
-- NOTA: anf_* tienen su propio draft en SEC-ANF-RLS-FIX-DRAFT.sql (pendiente GO).
-- =============================================================================

-- Helper: lista de tablas a proteger
-- dim_type, dim_value
-- acc_financial_statement, acc_reporting_account, acc_reporting_line
-- pln_scenario
-- acc_period, acc_period_audit
-- acc_entity_config, acc_ownership
-- acc_materiality_policy
-- acc_base_profile, acc_company_profile, acc_chart_mapping, acc_period_mapping_override
-- acc_source_batch
-- acc_adjustment_journal, acc_adjustment_journal_line
-- acc_consolidation_run, acc_conversion_run, acc_conversion_rate_used
-- acc_journal_entry, acc_journal_line, acc_journal_line_dim
-- acc_account_balance, acc_account_balance_dim
-- acc_consolidation_journal, acc_consolidation_journal_line
-- acc_consolidation_result_line
-- acc_equity_method_entry
-- acc_nci_movement
-- acc_reporting_run
-- acc_snapshot_metadata
-- pln_budget_entry, pln_budget_entry_dim

-- =============================================================================
-- BLOQUE 1: HABILITAR RLS EN TODAS LAS TABLAS
-- =============================================================================

ALTER TABLE IF EXISTS dim_type                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dim_value                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_financial_statement       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_reporting_account         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_reporting_line            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pln_scenario                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_period                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_period_audit              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_entity_config             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_ownership                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_materiality_policy        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_base_profile              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_company_profile           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_chart_mapping             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_period_mapping_override   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_source_batch              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_adjustment_journal        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_adjustment_journal_line   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_consolidation_run         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_conversion_run            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_conversion_rate_used      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_journal_entry             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_journal_line              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_journal_line_dim          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_account_balance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_account_balance_dim       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_consolidation_journal     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_consolidation_journal_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_consolidation_result_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_equity_method_entry       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_nci_movement              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_reporting_run             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acc_snapshot_metadata         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pln_budget_entry              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pln_budget_entry_dim          ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- BLOQUE 2: TABLAS DE REFERENCIA (solo lectura para authenticated)
-- dim_type, dim_value, acc_financial_statement, acc_reporting_account,
-- acc_reporting_line, pln_scenario, acc_base_profile
-- =============================================================================

-- Patrón: service_role ALL + authenticated SELECT + anon NADA

DO $$
DECLARE
  ref_tables TEXT[] := ARRAY[
    'dim_type', 'dim_value',
    'acc_financial_statement', 'acc_reporting_account', 'acc_reporting_line',
    'pln_scenario', 'acc_base_profile'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ref_tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'rls_' || t || '_svc_all', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      'rls_' || t || '_auth_select', t
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- BLOQUE 3: TABLAS TRANSACCIONALES POR ENTIDAD
-- acc_period, acc_entity_config, acc_ownership, acc_materiality_policy,
-- acc_company_profile, acc_chart_mapping, acc_period_mapping_override,
-- acc_period_audit, acc_source_batch
-- =============================================================================
-- Scope: por entity_id. authenticated puede ver sus propias entidades.
-- En esta fase: USING(true) — scope granular se añade cuando app use auth JWT.

DO $$
DECLARE
  entity_tables TEXT[] := ARRAY[
    'acc_period', 'acc_period_audit',
    'acc_entity_config', 'acc_ownership',
    'acc_materiality_policy',
    'acc_company_profile', 'acc_chart_mapping',
    'acc_period_mapping_override',
    'acc_source_batch'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY entity_tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'rls_' || t || '_svc_all', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      'rls_' || t || '_auth_select', t
    );
    -- No INSERT/UPDATE/DELETE para authenticated en esta fase.
    -- Ingesta solo via service_role (Edge Functions o migration scripts).
  END LOOP;
END;
$$;

-- =============================================================================
-- BLOQUE 4: JOURNALS Y BALANCES (datos financieros — restricción máxima)
-- acc_journal_entry, acc_journal_line, acc_journal_line_dim
-- acc_account_balance, acc_account_balance_dim
-- acc_adjustment_journal, acc_adjustment_journal_line
-- acc_consolidation_run, acc_conversion_run, acc_conversion_rate_used
-- acc_consolidation_journal, acc_consolidation_journal_line
-- acc_consolidation_result_line
-- acc_equity_method_entry, acc_nci_movement
-- acc_reporting_run, acc_snapshot_metadata
-- pln_budget_entry, pln_budget_entry_dim
-- =============================================================================
-- authenticated: solo SELECT.
-- service_role: ALL.
-- anon: NADA.
-- SoD se aplica vía T9 trigger, no via RLS.

DO $$
DECLARE
  financial_tables TEXT[] := ARRAY[
    'acc_journal_entry', 'acc_journal_line', 'acc_journal_line_dim',
    'acc_account_balance', 'acc_account_balance_dim',
    'acc_adjustment_journal', 'acc_adjustment_journal_line',
    'acc_consolidation_run', 'acc_conversion_run', 'acc_conversion_rate_used',
    'acc_consolidation_journal', 'acc_consolidation_journal_line',
    'acc_consolidation_result_line',
    'acc_equity_method_entry', 'acc_nci_movement',
    'acc_reporting_run', 'acc_snapshot_metadata',
    'pln_budget_entry', 'pln_budget_entry_dim'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'rls_' || t || '_svc_all', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      'rls_' || t || '_auth_select', t
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- VERIFICACIÓN POST-DEPLOY (SELECT únicamente)
-- =============================================================================

/*
-- V1: Todas las tablas nuevas tienen RLS habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%'])
ORDER BY tablename;
-- Esperado: rowsecurity = true en todas.

-- V2: Ninguna tabla tiene política para anon
SELECT tablename, policyname, roles
FROM pg_policies
WHERE tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%'])
  AND 'anon' = ANY(roles);
-- Esperado: 0 filas.

-- V3: service_role tiene ALL en todas
SELECT tablename, COUNT(*) FILTER (WHERE 'service_role' = ANY(roles) AND cmd = 'ALL') AS svc_all_count
FROM pg_policies
WHERE tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%'])
GROUP BY tablename
HAVING COUNT(*) FILTER (WHERE 'service_role' = ANY(roles) AND cmd = 'ALL') = 0;
-- Esperado: 0 filas (toda tabla debe tener svc_all).

-- V4: TEST anon denegado via REST
-- GET /rest/v1/acc_journal_entry → esperar [] o 401 (no 200 con datos)

-- V5: TEST anon denegado para dim_type
-- GET /rest/v1/dim_type → esperar [] o 401
*/
