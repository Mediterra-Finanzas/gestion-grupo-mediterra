-- =============================================================================
-- 010_triggers_t1_t11.sql
-- OA-024-05 ETAPA 0 — Invariants T1–T11 (Triggers y Constraints)
-- Fecha   : 2026-08-14
-- Estado  : EJECUTAR DESPUÉS de 009_rls_all.sql
-- =============================================================================
-- T1:  Journal balance — BEFORE UPDATE en acc_journal_entry al postear
-- T2:  Adjustment journal balance — BEFORE UPDATE en acc_adjustment_journal
-- T3:  Consolidation journal balance — BEFORE INSERT en acc_consolidation_journal
-- T4:  Ownership temporal overlap — BEFORE INSERT/UPDATE en acc_ownership
-- T5:  Entity config temporal overlap — BEFORE INSERT/UPDATE en acc_entity_config
-- T6:  Source batch idempotency — SERVICE LAYER (no trigger DB; ver comentario)
-- T7:  IAS 28 balance — BEFORE INSERT/UPDATE en acc_equity_method_entry
-- T8:  NCI reconciliation — BEFORE INSERT/UPDATE en acc_nci_movement
-- T9:  SoD — BEFORE UPDATE en acc_adjustment_journal (prepared_by ≠ approved_by)
-- T10: Period lock — BEFORE INSERT en acc_journal_entry y acc_account_balance
-- T11: updated_at — BEFORE UPDATE en todas las tablas mutables
-- =============================================================================

-- ===========================================================================
-- T11 PRIMERO (necesario antes de usarlo en otros triggers)
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at_acc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

-- Aplicar T11 en tablas mutables de accounting
DO $$
DECLARE
  mutable_tables TEXT[] := ARRAY[
    'acc_period',
    'acc_entity_config',
    'acc_ownership',
    'acc_materiality_policy',
    'acc_base_profile',
    'acc_company_profile',
    'acc_chart_mapping',
    'acc_source_batch',
    'acc_adjustment_journal',
    'acc_consolidation_run',
    'acc_conversion_run',
    'acc_journal_entry',
    'acc_reporting_run',
    'pln_scenario',
    'pln_budget_entry'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY mutable_tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at '
      'BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at_acc()',
      t, t
    );
  END LOOP;
END;
$$;

-- ===========================================================================
-- T1: JOURNAL BALANCE
-- Invariante: cuando acc_journal_entry pasa a 'posted', SUM(debit) = SUM(credit)
-- Tolerancia: ±0.01 (centavo) por aritmética de punto flotante.
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_journal_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_debit_sum   NUMERIC;
  v_credit_sum  NUMERIC;
  v_diff        NUMERIC;
BEGIN
  -- Solo verificar cuando se intenta postear
  IF NEW.status = 'posted' AND (OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT
      COALESCE(SUM(debit),  0),
      COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
    FROM acc_journal_line
    WHERE journal_entry_id = NEW.id;

    v_diff := ABS(v_debit_sum - v_credit_sum);

    IF v_diff > 0.01 THEN
      RAISE EXCEPTION
        '[T1] Journal % no está balanceado: debe=% haber=% diferencia=%',
        NEW.id, v_debit_sum, v_credit_sum, v_diff;
    END IF;

    -- Asiento vacío no puede ser posteado
    IF v_debit_sum = 0 AND v_credit_sum = 0 THEN
      RAISE EXCEPTION
        '[T1] Journal % no tiene líneas — no se puede postear.',
        NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entry_balance ON acc_journal_entry;
CREATE TRIGGER trg_journal_entry_balance
  BEFORE UPDATE ON acc_journal_entry
  FOR EACH ROW EXECUTE FUNCTION fn_check_journal_balance();

-- ===========================================================================
-- T2: ADJUSTMENT JOURNAL BALANCE
-- Invariante: cuando acc_adjustment_journal pasa a estado aprobado,
--             SUM(debit) = SUM(credit) en acc_adjustment_journal_line.
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_adj_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_debit_sum   NUMERIC;
  v_credit_sum  NUMERIC;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT
      COALESCE(SUM(debit),  0),
      COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
    FROM acc_adjustment_journal_line
    WHERE adjustment_journal_id = NEW.id;

    IF ABS(v_debit_sum - v_credit_sum) > 0.01 THEN
      RAISE EXCEPTION
        '[T2] Adjustment journal % no balanceado: debe=% haber=%',
        NEW.id, v_debit_sum, v_credit_sum;
    END IF;

    IF v_debit_sum = 0 THEN
      RAISE EXCEPTION
        '[T2] Adjustment journal % no tiene líneas.',
        NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adj_journal_balance ON acc_adjustment_journal;
CREATE TRIGGER trg_adj_journal_balance
  BEFORE UPDATE ON acc_adjustment_journal
  FOR EACH ROW EXECUTE FUNCTION fn_check_adj_balance();

-- ===========================================================================
-- T3: CONSOLIDATION JOURNAL BALANCE
-- Invariante: cada acc_consolidation_journal insertado debe tener asiento previo
--             balanceado. Se verifica al insertar líneas (via trigger de línea)
--             y al cerrar el run de consolidación.
-- Implementación pragmática: verificación al cerrar acc_consolidation_run.
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_consol_run_journals()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_unbalanced_count INT;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT COUNT(*)
    INTO v_unbalanced_count
    FROM (
      SELECT cj.id
      FROM acc_consolidation_journal cj
      JOIN acc_consolidation_journal_line cjl ON cjl.consolidation_journal_id = cj.id
      WHERE cj.consolidation_run_id = NEW.id
      GROUP BY cj.id
      HAVING ABS(SUM(cjl.debit) - SUM(cjl.credit)) > 0.01
    ) unbalanced;

    IF v_unbalanced_count > 0 THEN
      RAISE EXCEPTION
        '[T3] Consolidation run % tiene % journals no balanceados.',
        NEW.id, v_unbalanced_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consol_run_journals ON acc_consolidation_run;
CREATE TRIGGER trg_consol_run_journals
  BEFORE UPDATE ON acc_consolidation_run
  FOR EACH ROW EXECUTE FUNCTION fn_check_consol_run_journals();

-- ===========================================================================
-- T4: OWNERSHIP TEMPORAL OVERLAP
-- Invariante: para una entidad+padre, los rangos (effective_from, effective_to)
--             no deben solaparse.
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_ownership_overlap()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_overlap_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_overlap_count
  FROM acc_ownership
  WHERE entity_id        = NEW.entity_id
    AND parent_entity_id = NEW.parent_entity_id
    AND id               <> COALESCE(NEW.id, -1)
    AND (
      -- El nuevo registro se solapa con uno existente
      (NEW.effective_from  < COALESCE(effective_to, 'infinity'::date)) AND
      (COALESCE(NEW.effective_to, 'infinity'::date) > effective_from)
    );

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION
      '[T4] Solapamiento de ownership para entity=% parent=% en rango % – %',
      NEW.entity_id, NEW.parent_entity_id,
      NEW.effective_from, COALESCE(NEW.effective_to::text, 'presente');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ownership_overlap ON acc_ownership;
CREATE TRIGGER trg_ownership_overlap
  BEFORE INSERT OR UPDATE ON acc_ownership
  FOR EACH ROW EXECUTE FUNCTION fn_check_ownership_overlap();

-- ===========================================================================
-- T5: ENTITY CONFIG TEMPORAL OVERLAP
-- Invariante: para una entidad, los rangos de configuración no deben solaparse.
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_entity_config_overlap()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_overlap_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_overlap_count
  FROM acc_entity_config
  WHERE entity_id = NEW.entity_id
    AND id        <> COALESCE(NEW.id, -1)
    AND (
      (NEW.effective_from < COALESCE(effective_to, 'infinity'::date)) AND
      (COALESCE(NEW.effective_to, 'infinity'::date) > effective_from)
    );

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION
      '[T5] Solapamiento de entity_config para entity=% en rango % – %',
      NEW.entity_id, NEW.effective_from,
      COALESCE(NEW.effective_to::text, 'presente');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entity_config_overlap ON acc_entity_config;
CREATE TRIGGER trg_entity_config_overlap
  BEFORE INSERT OR UPDATE ON acc_entity_config
  FOR EACH ROW EXECUTE FUNCTION fn_check_entity_config_overlap();

-- ===========================================================================
-- T6: SOURCE BATCH IDEMPOTENCY
-- Invariante: un batch con el mismo file_hash no debe re-procesarse.
-- IMPLEMENTACIÓN: Service layer (Edge Function / ingesta).
-- El DB solo refuerza UNIQUE constraint en acc_source_batch.file_hash.
-- Ver: 008_accounting_tables_apply.sql — CONSTRAINT uq_source_batch_hash.
-- ===========================================================================

-- No hay trigger DB para T6. La UNIQUE constraint en file_hash es suficiente.
-- Si se intenta insertar el mismo hash → PostgreSQL lanza error 23505 (unique violation).
-- El service layer debe capturar este error y tratarlo como "ya procesado".

DO $$
BEGIN
  RAISE NOTICE 'T6: Idempotency de source batch implementado via UNIQUE(file_hash) en acc_source_batch.';
END;
$$;

-- ===========================================================================
-- T7: IAS 28 EQUITY METHOD BALANCE
-- Invariante: en cada entrada, los 9 campos de movimiento deben sumar el neto.
-- Verificación: opening_balance + sum(movements) = closing_balance ± 0.01
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_ias28_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_computed_closing NUMERIC;
BEGIN
  -- Suma de todos los movimientos del período
  v_computed_closing :=
    COALESCE(NEW.opening_balance, 0)
    + COALESCE(NEW.share_of_profit_loss, 0)
    + COALESCE(NEW.share_of_oci, 0)
    + COALESCE(NEW.dividends_received, 0)
    + COALESCE(NEW.capital_contributions, 0)
    + COALESCE(NEW.capital_reductions, 0)
    + COALESCE(NEW.fx_translation_diff, 0)
    + COALESCE(NEW.other_adjustments, 0)
    + COALESCE(NEW.impairment, 0);

  IF ABS(v_computed_closing - COALESCE(NEW.closing_balance, 0)) > 0.01 THEN
    RAISE EXCEPTION
      '[T7] IAS 28 entry para entity=% period=% no cuadra: '
      'apertura + movimientos = % ≠ cierre declarado = %',
      NEW.entity_id, NEW.period_id,
      v_computed_closing, NEW.closing_balance;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ias28_balance ON acc_equity_method_entry;
CREATE TRIGGER trg_ias28_balance
  BEFORE INSERT OR UPDATE ON acc_equity_method_entry
  FOR EACH ROW EXECUTE FUNCTION fn_check_ias28_balance();

-- ===========================================================================
-- T8: NCI RECONCILIATION
-- Invariante: NCI closing = opening + share_of_profit + dividends + other
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_nci_reconciliation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_computed NUMERIC;
BEGIN
  v_computed :=
    COALESCE(NEW.nci_opening, 0)
    + COALESCE(NEW.nci_share_of_profit, 0)
    + COALESCE(NEW.nci_dividends, 0)
    + COALESCE(NEW.nci_other, 0);

  IF ABS(v_computed - COALESCE(NEW.nci_closing, 0)) > 0.01 THEN
    RAISE EXCEPTION
      '[T8] NCI reconciliation para entity=% period=% no cuadra: '
      'computed=% ≠ closing=%',
      NEW.entity_id, NEW.period_id, v_computed, NEW.nci_closing;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nci_reconciliation ON acc_nci_movement;
CREATE TRIGGER trg_nci_reconciliation
  BEFORE INSERT OR UPDATE ON acc_nci_movement
  FOR EACH ROW EXECUTE FUNCTION fn_check_nci_reconciliation();

-- ===========================================================================
-- T9: SEGREGACIÓN DE FUNCIONES (SoD)
-- Invariante: prepared_by ≠ approved_by en acc_adjustment_journal.
-- Solo aplica a ajustes con is_material = true (ajustes inmateriales exentos).
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_sod_adjustment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved'
     AND NEW.is_material = true
     AND NEW.prepared_by IS NOT NULL
     AND NEW.approved_by IS NOT NULL
     AND NEW.prepared_by = NEW.approved_by
  THEN
    RAISE EXCEPTION
      '[T9] SoD violado en adjustment journal %: '
      'prepared_by = approved_by = % — no permitido para ajustes materiales.',
      NEW.id, NEW.prepared_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sod_adjustment ON acc_adjustment_journal;
CREATE TRIGGER trg_sod_adjustment
  BEFORE INSERT OR UPDATE ON acc_adjustment_journal
  FOR EACH ROW EXECUTE FUNCTION fn_check_sod_adjustment();

-- ===========================================================================
-- T10: PERIOD LOCK
-- Invariante: no se puede insertar journal o balance en un período cerrado.
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_check_period_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period_status TEXT;
BEGIN
  SELECT status
  INTO v_period_status
  FROM acc_period
  WHERE id = NEW.period_id;

  IF v_period_status IS NULL THEN
    RAISE EXCEPTION
      '[T10] Period % no existe para entity % — no se puede insertar.',
      NEW.period_id, NEW.entity_id;
  END IF;

  IF v_period_status IN ('closed', 'locked') THEN
    RAISE EXCEPTION
      '[T10] Period % tiene estado ''%'' — no se puede insertar journal/balance.',
      NEW.period_id, v_period_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_period_lock ON acc_journal_entry;
CREATE TRIGGER trg_journal_period_lock
  BEFORE INSERT ON acc_journal_entry
  FOR EACH ROW EXECUTE FUNCTION fn_check_period_lock();

DROP TRIGGER IF EXISTS trg_balance_period_lock ON acc_account_balance;
CREATE TRIGGER trg_balance_period_lock
  BEFORE INSERT ON acc_account_balance
  FOR EACH ROW EXECUTE FUNCTION fn_check_period_lock();

-- ===========================================================================
-- VERIFICACIÓN POST-TRIGGERS
-- ===========================================================================

/*
-- V1: Triggers creados en tablas correctas
SELECT
  trigger_name,
  event_object_table AS tabla,
  event_manipulation AS evento,
  action_timing      AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trg_%'
ORDER BY event_object_table, trigger_name;

-- Esperado: ~30 triggers (T11 × ~15 tablas + T1-T10)

-- V2: Funciones de trigger creadas
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'fn_%'
ORDER BY routine_name;
-- Esperado: fn_set_updated_at_acc, fn_set_updated_at_cem, fn_check_journal_balance,
--           fn_check_adj_balance, fn_check_consol_run_journals, fn_check_ownership_overlap,
--           fn_check_entity_config_overlap, fn_check_ias28_balance,
--           fn_check_nci_reconciliation, fn_check_sod_adjustment, fn_check_period_lock
*/
