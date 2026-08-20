-- =============================================================================
-- 013_rollback.sql
-- OA-024-05 ETAPA 0 — Rollback Completo (Orden Inverso)
-- Fecha   : 2026-08-14
-- =============================================================================
-- ADVERTENCIA: Este script elimina TODOS los artefactos de Etapa 0.
-- Ejecutar SOLO si Etapa 0 falla y se requiere volver al estado pre-materialización.
-- NO afecta: empresas, contab_empresas, anf_filiales, periodos, contab_plan_cuentas,
--            contab_homologacion, anf_*, rbac_*, currency_*, calendario_data.
-- =============================================================================
-- PREREQUISITO: Confirmar que acc_* no tienen datos financieros reales antes de DROP.
-- =============================================================================

-- Bloquear conexiones nuevas durante rollback no es necesario en dev/staging,
-- pero sí registrar el rollback antes de ejecutar.

DO $$
BEGIN
  RAISE NOTICE 'OA-024-05 ETAPA 0 ROLLBACK iniciando en %', now();
  RAISE NOTICE 'Este rollback ELIMINA: core_entities, core_entity_external_refs, '
               'todos los acc_*, pln_*, dim_*, funciones y triggers relacionados.';
  RAISE NOTICE 'NO elimina: empresas, anf_filiales, contab_*, periodos, rbac_*, calendar.';
END;
$$;

-- =============================================================================
-- TIER 6 — Tablas hoja (más dependientes)
-- =============================================================================

DROP TABLE IF EXISTS pln_budget_entry_dim          CASCADE;
DROP TABLE IF EXISTS acc_snapshot_metadata         CASCADE;
DROP TABLE IF EXISTS acc_equity_method_entry       CASCADE;
DROP TABLE IF EXISTS acc_consolidation_journal_line CASCADE;
DROP TABLE IF EXISTS acc_account_balance_dim       CASCADE;
DROP TABLE IF EXISTS acc_journal_line_dim          CASCADE;

-- =============================================================================
-- TIER 5
-- =============================================================================

DROP TABLE IF EXISTS pln_budget_entry              CASCADE;
DROP TABLE IF EXISTS acc_reporting_run             CASCADE;
DROP TABLE IF EXISTS acc_consolidation_result_line CASCADE;
DROP TABLE IF EXISTS acc_nci_movement              CASCADE;
DROP TABLE IF EXISTS acc_consolidation_journal     CASCADE;
DROP TABLE IF EXISTS acc_conversion_rate_used      CASCADE;
DROP TABLE IF EXISTS acc_adjustment_journal_line   CASCADE;
DROP TABLE IF EXISTS acc_account_balance           CASCADE;
DROP TABLE IF EXISTS acc_journal_line              CASCADE;

-- =============================================================================
-- TIER 4
-- =============================================================================

DROP TABLE IF EXISTS acc_journal_entry             CASCADE;
DROP TABLE IF EXISTS acc_conversion_run            CASCADE;
DROP TABLE IF EXISTS acc_account_balance           CASCADE;

-- =============================================================================
-- TIER 3
-- =============================================================================

DROP TABLE IF EXISTS acc_consolidation_run         CASCADE;
DROP TABLE IF EXISTS acc_adjustment_journal        CASCADE;
DROP TABLE IF EXISTS acc_period_mapping_override   CASCADE;

-- =============================================================================
-- TIER 2
-- =============================================================================

DROP TABLE IF EXISTS acc_materiality_policy        CASCADE;
DROP TABLE IF EXISTS acc_chart_mapping             CASCADE;
DROP TABLE IF EXISTS acc_company_profile           CASCADE;
DROP TABLE IF EXISTS acc_source_batch              CASCADE;
DROP TABLE IF EXISTS acc_period_audit              CASCADE;

-- =============================================================================
-- TIER 1
-- =============================================================================

DROP TABLE IF EXISTS acc_base_profile              CASCADE;
DROP TABLE IF EXISTS acc_reporting_line            CASCADE;
DROP TABLE IF EXISTS dim_value                     CASCADE;
DROP TABLE IF EXISTS acc_ownership                 CASCADE;
DROP TABLE IF EXISTS acc_entity_config             CASCADE;
DROP TABLE IF EXISTS acc_period                    CASCADE;

-- =============================================================================
-- TIER 0
-- =============================================================================

DROP TABLE IF EXISTS pln_scenario                  CASCADE;
DROP TABLE IF EXISTS acc_reporting_account         CASCADE;
DROP TABLE IF EXISTS acc_financial_statement       CASCADE;
DROP TABLE IF EXISTS dim_type                      CASCADE;

-- =============================================================================
-- CORE ENTITY MASTER (últimos — son el fundamento de todos los acc_*)
-- =============================================================================

DROP TABLE IF EXISTS core_entity_external_refs     CASCADE;
DROP TABLE IF EXISTS core_entities                 CASCADE;

-- =============================================================================
-- FUNCIONES Y TRIGGERS (si CASCADE no las limpió)
-- =============================================================================

DROP FUNCTION IF EXISTS fn_set_updated_at_cem()     CASCADE;
DROP FUNCTION IF EXISTS fn_check_journal_balance()  CASCADE;
DROP FUNCTION IF EXISTS fn_check_adj_balance()      CASCADE;
DROP FUNCTION IF EXISTS fn_check_consol_balance()   CASCADE;
DROP FUNCTION IF EXISTS fn_check_ownership_overlap() CASCADE;
DROP FUNCTION IF EXISTS fn_check_entity_config_overlap() CASCADE;
DROP FUNCTION IF EXISTS fn_check_ias28_balance()    CASCADE;
DROP FUNCTION IF EXISTS fn_check_nci_reconciliation() CASCADE;
DROP FUNCTION IF EXISTS fn_check_sod_adjustment()   CASCADE;
DROP FUNCTION IF EXISTS fn_check_period_lock()      CASCADE;
DROP FUNCTION IF EXISTS fn_set_updated_at_acc()     CASCADE;

-- =============================================================================
-- VERIFICACIÓN POST-ROLLBACK
-- =============================================================================

/*
-- V1: Ninguna tabla acc_*, pln_*, dim_* permanece
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%','core_%']);
-- Esperado: 0 filas.

-- V2: core_entities y core_entity_external_refs no existen
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('core_entities','core_entity_external_refs')
) AS should_be_false;
-- Esperado: false.

-- V3: Tablas legacy intactas
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('empresas','anf_filiales','contab_empresas','contab_plan_cuentas')
ORDER BY tablename;
-- Esperado: 4 filas (todas intactas).

-- V4: periodos intacto (12 rows)
SELECT COUNT(*) FROM periodos;
-- Esperado: 12.
*/

DO $$
BEGIN
  RAISE NOTICE 'OA-024-05 ETAPA 0 ROLLBACK completado en %', now();
  RAISE NOTICE 'Estado: pre-materialización. Legacy masters intactos.';
END;
$$;
