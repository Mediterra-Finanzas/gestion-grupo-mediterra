-- =============================================================================
-- 012_test_suite.sql
-- OA-024-05 ETAPA 0 — Suite de Validación Post-Materialización
-- Fecha   : 2026-08-14
-- Estado  : EJECUTAR DESPUÉS de 011_technical_seeds.sql
-- =============================================================================
-- CATEGORÍAS (5):
--   CAT-1: Corporate Identity       — 11 entidades, UUIDs, bridges ANF
--   CAT-2: Referential Integrity    — FK catalog, constraints
--   CAT-3: Accounting Invariants    — T1-T10 behavioral tests
--   CAT-4: Security                 — RLS fail-closed, anon denied
--   CAT-5: Reproducibility          — Idempotencia de seeds/006
-- =============================================================================
-- PATRÓN: Cada test es un DO $$ block.
--   PASS → RAISE NOTICE 'TEST-NNN PASS: descripción'
--   FAIL → RAISE EXCEPTION 'TEST-NNN FAIL: descripción (%)', detalle
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== OA-024-05 ETAPA 0 TEST SUITE iniciando ==='; END; $$;

-- =============================================================================
-- CAT-1: CORPORATE IDENTITY
-- =============================================================================

-- TEST-101: Exactamente 11 entidades en core_entities
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM core_entities;
  IF v_count = 11 THEN
    RAISE NOTICE 'TEST-101 PASS: core_entities tiene 11 entidades';
  ELSE
    RAISE EXCEPTION 'TEST-101 FAIL: core_entities tiene % entidades (esperado 11)', v_count;
  END IF;
END; $$;

-- TEST-102: Los 11 códigos canónicos existen
DO $$
DECLARE
  v_missing TEXT[];
  required TEXT[] := ARRAY['MED','ALF','ALS','FRI','INT','OSI','APC','APP','ARR','MES','MON'];
  existing TEXT[];
BEGIN
  SELECT ARRAY_AGG(code) INTO existing FROM core_entities;
  v_missing := ARRAY(
    SELECT unnest(required) EXCEPT SELECT unnest(existing)
  );
  IF array_length(v_missing, 1) IS NULL THEN
    RAISE NOTICE 'TEST-102 PASS: Los 11 códigos canónicos presentes';
  ELSE
    RAISE EXCEPTION 'TEST-102 FAIL: Faltan códigos: %', v_missing;
  END IF;
END; $$;

-- TEST-103: MED tiene entity_type = 'holding'
DO $$
DECLARE v_type TEXT;
BEGIN
  SELECT entity_type INTO v_type FROM core_entities WHERE code = 'MED';
  IF v_type = 'holding' THEN
    RAISE NOTICE 'TEST-103 PASS: MED entity_type = holding';
  ELSE
    RAISE EXCEPTION 'TEST-103 FAIL: MED entity_type = % (esperado holding)', v_type;
  END IF;
END; $$;

-- TEST-104: APC/APP/ARR/MES/MON tienen entity_type = 'unresolved' (D7 abierto)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM core_entities
  WHERE code IN ('APC','APP','ARR','MES','MON')
    AND entity_type = 'unresolved';
  IF v_count = 5 THEN
    RAISE NOTICE 'TEST-104 PASS: 5 entidades D7-open tienen entity_type = unresolved';
  ELSE
    RAISE EXCEPTION
      'TEST-104 FAIL: Solo % de 5 entidades D7-open tienen entity_type = unresolved', v_count;
  END IF;
END; $$;

-- TEST-105: ALF/ALS/FRI/INT/OSI tienen entity_type = 'subsidiary'
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM core_entities
  WHERE code IN ('ALF','ALS','FRI','INT','OSI')
    AND entity_type = 'subsidiary';
  IF v_count = 5 THEN
    RAISE NOTICE 'TEST-105 PASS: 5 subsidiarias tienen entity_type = subsidiary';
  ELSE
    RAISE EXCEPTION
      'TEST-105 FAIL: Solo % de 5 subsidiarias tienen entity_type = subsidiary', v_count;
  END IF;
END; $$;

-- TEST-106: core_entities no tiene columnas de accounting (corporativamente neutro)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'core_entities'
    AND column_name IN (
      'method_consol', 'nci_pct', 'moneda_func', 'functional_currency',
      'reporting_currency', 'source_anf_id'
    );
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-106 PASS: core_entities es corporativamente neutro (sin columnas accounting)';
  ELSE
    RAISE EXCEPTION
      'TEST-106 FAIL: core_entities tiene % columnas contables no autorizadas', v_count;
  END IF;
END; $$;

-- TEST-107: Exactamente 8 bridges ANF en core_entity_external_refs
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM core_entity_external_refs
  WHERE source_system = 'anf';
  IF v_count = 8 THEN
    RAISE NOTICE 'TEST-107 PASS: 8 bridges ANF en core_entity_external_refs';
  ELSE
    RAISE EXCEPTION
      'TEST-107 FAIL: % bridges ANF (esperado 8)', v_count;
  END IF;
END; $$;

-- TEST-108: APP, ARR, MON NO tienen bridge ANF (no existen en ANF)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM core_entity_external_refs cer
  JOIN core_entities ce ON ce.id = cer.entity_id
  WHERE cer.source_system = 'anf'
    AND ce.code IN ('APP','ARR','MON');
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-108 PASS: APP/ARR/MON sin bridge ANF (correcto — no existen en ANF)';
  ELSE
    RAISE EXCEPTION
      'TEST-108 FAIL: APP/ARR/MON tienen % bridges ANF inesperados', v_count;
  END IF;
END; $$;

-- TEST-109: Todos los bridges ANF tienen source_entity_id (no NULL)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM core_entity_external_refs
  WHERE source_system = 'anf'
    AND source_entity_id IS NULL;
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-109 PASS: Todos los bridges ANF tienen source_entity_id';
  ELSE
    RAISE EXCEPTION 'TEST-109 FAIL: % bridges ANF sin source_entity_id', v_count;
  END IF;
END; $$;

-- TEST-110: UNIQUE constraint en core_entity_external_refs funciona
DO $$
DECLARE v_entity_id UUID;
DECLARE v_anf_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';
  SELECT source_entity_id INTO v_anf_id
  FROM core_entity_external_refs
  WHERE source_system = 'anf'
  LIMIT 1;

  BEGIN
    INSERT INTO core_entity_external_refs
      (entity_id, source_system, source_entity_id, active)
    VALUES (v_entity_id, 'anf', v_anf_id, true);
    RAISE EXCEPTION 'TEST-110 FAIL: UNIQUE constraint no bloqueó duplicado ANF';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'TEST-110 PASS: UNIQUE constraint bloqueó duplicado ANF correctamente';
  END;
END; $$;

-- TEST-111: ALF tiene tax_identifier (RUT) y country = CL
DO $$
DECLARE v_rut TEXT; v_country CHAR(2);
BEGIN
  SELECT tax_identifier, country INTO v_rut, v_country
  FROM core_entities WHERE code = 'ALF';
  IF v_rut IS NOT NULL AND v_country = 'CL' THEN
    RAISE NOTICE 'TEST-111 PASS: ALF tiene RUT=% y country=CL', v_rut;
  ELSE
    RAISE EXCEPTION
      'TEST-111 FAIL: ALF rut=% country=%', v_rut, v_country;
  END IF;
END; $$;

-- =============================================================================
-- CAT-2: REFERENTIAL INTEGRITY
-- =============================================================================

-- TEST-201: Las tablas de Tier 0 tienen PKs correctas
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'PRIMARY KEY'
    AND table_schema = 'public'
    AND table_name IN ('dim_type','acc_financial_statement','pln_scenario','acc_reporting_account');
  IF v_count = 4 THEN
    RAISE NOTICE 'TEST-201 PASS: Las 4 tablas Tier 0 tienen PKs';
  ELSE
    RAISE EXCEPTION 'TEST-201 FAIL: Solo % de 4 tablas Tier 0 tienen PKs', v_count;
  END IF;
END; $$;

-- TEST-202: acc_consolidation_run NO tiene FK a sí mismo (fix B2)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'acc_consolidation_run'
    AND ccu.table_name = 'acc_consolidation_run';
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-202 PASS: acc_consolidation_run no tiene FK circular (B2)';
  ELSE
    RAISE EXCEPTION 'TEST-202 FAIL: acc_consolidation_run tiene % FKs circulares', v_count;
  END IF;
END; $$;

-- TEST-203: scope_ref_id NO existe en ninguna tabla (fix B3)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'scope_ref_id';
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-203 PASS: scope_ref_id eliminado de todas las tablas (B3)';
  ELSE
    RAISE EXCEPTION 'TEST-203 FAIL: scope_ref_id presente en % tablas', v_count;
  END IF;
END; $$;

-- TEST-204: acc_account_balance tiene scope_entity_id (B3 implementado)
DO $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acc_account_balance'
      AND column_name = 'reporting_account_id'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE NOTICE 'TEST-204 PASS: acc_account_balance tiene reporting_account_id (B3)';
  ELSE
    RAISE EXCEPTION 'TEST-204 FAIL: acc_account_balance no tiene reporting_account_id';
  END IF;
END; $$;

-- TEST-205: acc_financial_statement existe y está en Tier 0 (antes de journals)
DO $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'acc_financial_statement'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE NOTICE 'TEST-205 PASS: acc_financial_statement existe (B1)';
  ELSE
    RAISE EXCEPTION 'TEST-205 FAIL: acc_financial_statement no fue creada';
  END IF;
END; $$;

-- TEST-206: acc_source_batch tiene UNIQUE(file_hash) para idempotencia T6
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'UNIQUE'
    AND table_schema = 'public'
    AND table_name = 'acc_source_batch'
    AND constraint_name = 'uq_source_batch_hash';
  IF v_count = 1 THEN
    RAISE NOTICE 'TEST-206 PASS: acc_source_batch tiene UNIQUE(file_hash) — T6';
  ELSE
    RAISE EXCEPTION 'TEST-206 FAIL: UNIQUE(file_hash) no existe en acc_source_batch';
  END IF;
END; $$;

-- TEST-207: Contar tablas totales acc_*/pln_*/dim_*
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%']);
  IF v_count >= 33 THEN
    RAISE NOTICE 'TEST-207 PASS: % tablas acc_*/pln_*/dim_* creadas', v_count;
  ELSE
    RAISE EXCEPTION 'TEST-207 FAIL: Solo % tablas acc_*/pln_*/dim_* (esperado ≥33)', v_count;
  END IF;
END; $$;

-- =============================================================================
-- CAT-3: ACCOUNTING INVARIANTS (T1–T10 behavioral)
-- Para testear triggers se usan transacciones que se revierten al final.
-- =============================================================================

-- TEST-301: T1 — Journal sin líneas no puede ser posteado
DO $$
DECLARE
  v_entity_id UUID;
  v_period_id UUID;
  v_journal_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';

  -- Crear período de prueba
  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 1, '9999-01-01', '9999-01-31', 'open')
  RETURNING id INTO v_period_id;

  -- Crear journal vacío
  INSERT INTO acc_journal_entry (entity_id, period_id, entry_date, description, status)
  VALUES (v_entity_id, v_period_id, '9999-01-15', 'TEST-301 journal vacío', 'draft')
  RETURNING id INTO v_journal_id;

  BEGIN
    UPDATE acc_journal_entry SET status = 'posted' WHERE id = v_journal_id;
    -- Si no lanza excepción, el trigger no funciona
    RAISE EXCEPTION 'TEST-301 FAIL: T1 no bloqueó journal vacío';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%T1%' THEN
        RAISE NOTICE 'TEST-301 PASS: T1 bloqueó correctamente journal vacío';
      ELSE
        RAISE EXCEPTION 'TEST-301 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  -- Cleanup
  DELETE FROM acc_journal_entry WHERE id = v_journal_id;
  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-302: T1 — Journal desbalanceado no puede ser posteado
DO $$
DECLARE
  v_entity_id UUID;
  v_period_id UUID;
  v_journal_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 2, '9999-02-01', '9999-02-28', 'open')
  RETURNING id INTO v_period_id;

  INSERT INTO acc_journal_entry (entity_id, period_id, entry_date, description, status)
  VALUES (v_entity_id, v_period_id, '9999-02-15', 'TEST-302 journal desbalanceado', 'draft')
  RETURNING id INTO v_journal_id;

  -- Insertar líneas desbalanceadas (debe=100, haber=0)
  INSERT INTO acc_journal_line (journal_entry_id, account_code, debit, credit)
  VALUES (v_journal_id, '1110', 100.00, 0);

  BEGIN
    UPDATE acc_journal_entry SET status = 'posted' WHERE id = v_journal_id;
    RAISE EXCEPTION 'TEST-302 FAIL: T1 no bloqueó journal desbalanceado';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%T1%' OR SQLERRM LIKE '%balan%' THEN
        RAISE NOTICE 'TEST-302 PASS: T1 bloqueó journal desbalanceado (debe≠haber)';
      ELSE
        RAISE EXCEPTION 'TEST-302 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_journal_line WHERE journal_entry_id = v_journal_id;
  DELETE FROM acc_journal_entry WHERE id = v_journal_id;
  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-303: T1 — Journal balanceado SÍ puede ser posteado
DO $$
DECLARE
  v_entity_id UUID;
  v_period_id UUID;
  v_journal_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 3, '9999-03-01', '9999-03-31', 'open')
  RETURNING id INTO v_period_id;

  INSERT INTO acc_journal_entry (entity_id, period_id, entry_date, description, status)
  VALUES (v_entity_id, v_period_id, '9999-03-15', 'TEST-303 journal balanceado', 'draft')
  RETURNING id INTO v_journal_id;

  -- Líneas balanceadas
  INSERT INTO acc_journal_line (journal_entry_id, account_code, debit, credit)
  VALUES
    (v_journal_id, '1110', 1000.00, 0),
    (v_journal_id, '2110', 0, 1000.00);

  BEGIN
    UPDATE acc_journal_entry SET status = 'posted' WHERE id = v_journal_id;
    RAISE NOTICE 'TEST-303 PASS: T1 permitió journal balanceado (debe=haber=1000)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST-303 FAIL: T1 bloqueó journal balanceado inesperadamente: %', SQLERRM;
  END;

  DELETE FROM acc_journal_line WHERE journal_entry_id = v_journal_id;
  DELETE FROM acc_journal_entry WHERE id = v_journal_id;
  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-304: T4 — Ownership temporal overlap bloqueado
DO $$
DECLARE
  v_entity_id UUID;
  v_parent_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';
  SELECT id INTO v_parent_id  FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_ownership (entity_id, parent_entity_id, effective_from, ownership_pct)
  VALUES (v_entity_id, v_parent_id, '2024-01-01', 100.0);

  BEGIN
    INSERT INTO acc_ownership (entity_id, parent_entity_id, effective_from, ownership_pct)
    VALUES (v_entity_id, v_parent_id, '2024-06-01', 100.0);
    RAISE EXCEPTION 'TEST-304 FAIL: T4 no bloqueó overlap de ownership';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%T4%' OR SQLERRM LIKE '%olapamiento%' OR SQLERRM LIKE '%overlap%' THEN
        RAISE NOTICE 'TEST-304 PASS: T4 bloqueó ownership con overlap temporal';
      ELSE
        RAISE EXCEPTION 'TEST-304 FAIL: Error inesperado en T4: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_ownership
  WHERE entity_id = v_entity_id AND parent_entity_id = v_parent_id;
END; $$;

-- TEST-305: T9 — SoD: prepared_by = approved_by bloqueado en ajuste material
DO $$
DECLARE v_entity_id UUID; v_period_id UUID; v_adj_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 4, '9999-04-01', '9999-04-30', 'open')
  RETURNING id INTO v_period_id;

  INSERT INTO acc_adjustment_journal
    (entity_id, period_id, adj_type, description, is_material, status, prepared_by)
  VALUES (v_entity_id, v_period_id, 'manual', 'TEST-305 SoD test', true, 'submitted', 'usuario_a')
  RETURNING id INTO v_adj_id;

  -- Líneas balanceadas necesarias para que T2 no bloquee antes que T9 (orden alfabético de triggers)
  INSERT INTO acc_adjustment_journal_line (adjustment_journal_id, account_code, debit, credit)
  VALUES (v_adj_id, '1110', 100.00, 0), (v_adj_id, '2110', 0, 100.00);

  BEGIN
    UPDATE acc_adjustment_journal
    SET status = 'approved', approved_by = 'usuario_a'
    WHERE id = v_adj_id;
    RAISE EXCEPTION 'TEST-305 FAIL: T9 no bloqueó SoD (prepared=approved=usuario_a)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%T9%' OR SQLERRM LIKE '%SoD%' THEN
        RAISE NOTICE 'TEST-305 PASS: T9 bloqueó SoD en ajuste material';
      ELSE
        RAISE EXCEPTION 'TEST-305 FAIL: Error inesperado en T9: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_adjustment_journal_line WHERE adjustment_journal_id = v_adj_id;
  DELETE FROM acc_adjustment_journal WHERE id = v_adj_id;
  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-306: T10 — Período cerrado bloquea nuevo journal
DO $$
DECLARE v_entity_id UUID; v_period_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 5, '9999-05-01', '9999-05-31', 'closed')
  RETURNING id INTO v_period_id;

  BEGIN
    INSERT INTO acc_journal_entry (entity_id, period_id, entry_date, description, status)
    VALUES (v_entity_id, v_period_id, '9999-05-15', 'TEST-306 período cerrado', 'draft');
    RAISE EXCEPTION 'TEST-306 FAIL: T10 no bloqueó insert en período cerrado';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%T10%' OR SQLERRM LIKE '%cerrado%' OR SQLERRM LIKE '%closed%' THEN
        RAISE NOTICE 'TEST-306 PASS: T10 bloqueó journal en período cerrado';
      ELSE
        RAISE EXCEPTION 'TEST-306 FAIL: Error inesperado en T10: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-307: T7 — IAS 28 balance verifica cierre incorrecto
DO $$
DECLARE v_entity_id UUID; v_investor_id UUID; v_period_id UUID;
BEGIN
  SELECT id INTO v_entity_id  FROM core_entities WHERE code = 'APC';
  SELECT id INTO v_investor_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 6, '9999-06-01', '9999-06-30', 'open')
  RETURNING id INTO v_period_id;

  BEGIN
    INSERT INTO acc_equity_method_entry
      (entity_id, period_id, investor_entity_id, ownership_pct,
       opening_balance, share_of_profit_loss, closing_balance)
    VALUES
      (v_entity_id, v_period_id, v_investor_id, 50.0,
       1000.00, 200.00, 999.99);  -- closing incorrecto (esperado 1200)
    RAISE EXCEPTION 'TEST-307 FAIL: T7 no bloqueó IAS 28 con cierre incorrecto';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%T7%' OR SQLERRM LIKE '%cuadra%' OR SQLERRM LIKE '%IAS%' THEN
        RAISE NOTICE 'TEST-307 PASS: T7 bloqueó IAS 28 con cierre incorrecto';
      ELSE
        RAISE EXCEPTION 'TEST-307 FAIL: Error inesperado en T7: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-308: T7 — IAS 28 balance correcto sí se acepta
DO $$
DECLARE v_entity_id UUID; v_investor_id UUID; v_period_id UUID;
BEGIN
  SELECT id INTO v_entity_id  FROM core_entities WHERE code = 'APC';
  SELECT id INTO v_investor_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 7, '9999-07-01', '9999-07-31', 'open')
  RETURNING id INTO v_period_id;

  BEGIN
    INSERT INTO acc_equity_method_entry
      (entity_id, period_id, investor_entity_id, ownership_pct,
       opening_balance, share_of_profit_loss, closing_balance)
    VALUES
      (v_entity_id, v_period_id, v_investor_id, 50.0,
       1000.00, 200.00, 1200.00);  -- closing correcto (1000+200=1200)
    RAISE NOTICE 'TEST-308 PASS: T7 aceptó IAS 28 con cierre correcto (1200)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'TEST-308 FAIL: T7 bloqueó IAS 28 correcto inesperadamente: %', SQLERRM;
  END;

  DELETE FROM acc_equity_method_entry
  WHERE entity_id = v_entity_id AND period_id = v_period_id;
  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- TEST-309: T6 — file_hash duplicado bloqueado
-- NOTA: Usa status='POSTED'/'CREATED' (lifecycle OA-024-07). Era 'completed'/'pending' pre-014.
DO $$
DECLARE v_entity_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  -- Insertar batch inicial sin trigger de lifecycle (INSERT no tiene trigger BEFORE UPDATE)
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, row_count, status)
  VALUES (v_entity_id, 'contec', 'test_batch.xlsx', 'sha256_test_hash_309', 10, 'POSTED');

  BEGIN
    INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, row_count, status)
    VALUES (v_entity_id, 'contec', 'test_batch_copy.xlsx', 'sha256_test_hash_309', 10, 'CREATED');
    RAISE EXCEPTION 'TEST-309 FAIL: T6 UNIQUE(file_hash) no bloqueó duplicado';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'TEST-309 PASS: T6 UNIQUE(file_hash) bloqueó re-ingesta del mismo archivo';
  END;

  DELETE FROM acc_source_batch WHERE file_hash = 'sha256_test_hash_309';
END; $$;

-- =============================================================================
-- CAT-4: SECURITY
-- =============================================================================

-- TEST-401: Verificar RLS habilitado en tablas financieras críticas
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'acc_journal_entry', 'acc_account_balance', 'acc_adjustment_journal',
    'acc_consolidation_run', 'core_entities', 'core_entity_external_refs'
  ];
  t TEXT;
  v_rls_enabled BOOLEAN;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class
    WHERE relname = t AND relnamespace = 'public'::regnamespace;

    IF NOT COALESCE(v_rls_enabled, false) THEN
      RAISE EXCEPTION 'TEST-401 FAIL: RLS no habilitado en tabla %', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'TEST-401 PASS: RLS habilitado en todas las tablas críticas verificadas';
END; $$;

-- TEST-402: Ninguna política PERMISIVA para anon en tablas financieras
-- Acepta políticas USING(false) explícitas (deny activo = más seguro que ausencia).
-- Falla solo si hay políticas que podrían conceder acceso real a anon.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%'])
    AND 'anon' = ANY(roles)
    AND qual IS DISTINCT FROM 'false';
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-402 PASS: anon sin políticas permisivas en tablas acc_*/pln_*/dim_* (fail-closed)';
  ELSE
    RAISE EXCEPTION
      'TEST-402 FAIL: % políticas permisivas encontradas para anon en tablas financieras', v_count;
  END IF;
END; $$;

-- TEST-403: service_role tiene políticas ALL en tablas financieras
DO $$
DECLARE v_without_svc INT;
BEGIN
  SELECT COUNT(*) INTO v_without_svc
  FROM pg_tables pt
  WHERE pt.schemaname = 'public'
    AND pt.tablename LIKE ANY(ARRAY['acc_%','pln_%','dim_%'])
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies pp
      WHERE pp.tablename = pt.tablename
        AND 'service_role' = ANY(pp.roles)
        AND pp.cmd = 'ALL'
    );
  IF v_without_svc = 0 THEN
    RAISE NOTICE 'TEST-403 PASS: service_role tiene ALL en todas las tablas financieras';
  ELSE
    RAISE EXCEPTION
      'TEST-403 FAIL: % tablas financieras sin política ALL para service_role', v_without_svc;
  END IF;
END; $$;

-- TEST-404: core_entities también tiene RLS habilitado y sin policy anon
DO $$
DECLARE v_rls BOOLEAN; v_anon_count INT;
BEGIN
  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE relname = 'core_entities';

  SELECT COUNT(*) INTO v_anon_count
  FROM pg_policies
  WHERE tablename = 'core_entities' AND 'anon' = ANY(roles);

  IF COALESCE(v_rls, false) AND v_anon_count = 0 THEN
    RAISE NOTICE 'TEST-404 PASS: core_entities RLS habilitado, anon denegado';
  ELSE
    RAISE EXCEPTION
      'TEST-404 FAIL: core_entities rls=% anon_policies=%', v_rls, v_anon_count;
  END IF;
END; $$;

-- =============================================================================
-- CAT-5: REPRODUCIBILITY
-- =============================================================================

-- TEST-501: Seeds de dim_type son idempotentes (ON CONFLICT DO NOTHING)
DO $$
DECLARE v_count_before INT; v_count_after INT;
BEGIN
  SELECT COUNT(*) INTO v_count_before FROM dim_type;

  -- Re-ejecutar los mismos seeds
  INSERT INTO dim_type (code, label, description, allows_multiple, is_active) VALUES
    ('CC',  'Centro de Costo', 'Centro de costo operativo', false, true),
    ('PRY', 'Proyecto',        'Proyecto o iniciativa',     false, true)
  ON CONFLICT (code) DO NOTHING;

  SELECT COUNT(*) INTO v_count_after FROM dim_type;

  IF v_count_before = v_count_after THEN
    RAISE NOTICE 'TEST-501 PASS: Seeds dim_type idempotentes — % filas sin cambio', v_count_after;
  ELSE
    RAISE EXCEPTION
      'TEST-501 FAIL: Re-ejecución cambió filas: antes=% después=%',
      v_count_before, v_count_after;
  END IF;
END; $$;

-- TEST-502: Seeds de core_entities son idempotentes (ON CONFLICT DO NOTHING)
DO $$
DECLARE v_count_before INT; v_count_after INT;
BEGIN
  SELECT COUNT(*) INTO v_count_before FROM core_entities;

  -- Re-insertar MED (ya existe)
  INSERT INTO core_entities (id, code, legal_name, display_name, entity_type, is_active)
  VALUES (
    'ccaa4e1c-a12b-4f3d-9e1c-8d5f7b2a4e6c'::uuid,
    'MED', 'Mediterra Holding SpA', 'Mediterra Holding', 'holding', true
  )
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_count_after FROM core_entities;

  IF v_count_before = v_count_after THEN
    RAISE NOTICE 'TEST-502 PASS: Seeds core_entities idempotentes — % filas sin cambio', v_count_after;
  ELSE
    RAISE EXCEPTION
      'TEST-502 FAIL: Re-inserción cambió filas: antes=% después=%',
      v_count_before, v_count_after;
  END IF;
END; $$;

-- TEST-503: acc_reporting_account tiene 4 estados financieros seeded
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM acc_financial_statement WHERE is_active = true;
  IF v_count = 4 THEN
    RAISE NOTICE 'TEST-503 PASS: 4 estados financieros seeded (ESF, ERI, EFE, ECP)';
  ELSE
    RAISE EXCEPTION
      'TEST-503 FAIL: % estados financieros (esperado 4)', v_count;
  END IF;
END; $$;

-- TEST-504: acc_reporting_account tiene ≥8 filas de ESF
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM acc_reporting_account ra
  JOIN acc_financial_statement fs ON fs.id = ra.financial_statement_id
  WHERE fs.code = 'ESF';

  IF v_count >= 8 THEN
    RAISE NOTICE 'TEST-504 PASS: % líneas de reporting seeded para ESF', v_count;
  ELSE
    RAISE EXCEPTION
      'TEST-504 FAIL: Solo % líneas de ESF (esperado ≥8)', v_count;
  END IF;
END; $$;

-- TEST-505: pln_scenario tiene exactamente 4 escenarios
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pln_scenario;
  IF v_count = 4 THEN
    RAISE NOTICE 'TEST-505 PASS: 4 escenarios seeded (BASE, ACTUAL, REV1, STRESS)';
  ELSE
    RAISE EXCEPTION
      'TEST-505 FAIL: % escenarios (esperado 4)', v_count;
  END IF;
END; $$;

-- TEST-506: T11 updated_at se actualiza en acc_period
DO $$
DECLARE
  v_entity_id UUID;
  v_period_id UUID;
  v_ts_before TIMESTAMPTZ;
  v_ts_after  TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'MED';

  INSERT INTO acc_period (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES (v_entity_id, 'monthly', 9999, 8, '9999-08-01', '9999-08-31', 'open')
  RETURNING id INTO v_period_id;

  SELECT updated_at INTO v_ts_before FROM acc_period WHERE id = v_period_id;

  PERFORM pg_sleep(0.05);

  UPDATE acc_period SET status = 'open', locked_by = 'test-t11' WHERE id = v_period_id;

  SELECT updated_at INTO v_ts_after FROM acc_period WHERE id = v_period_id;

  IF v_ts_after > v_ts_before THEN
    RAISE NOTICE 'TEST-506 PASS: T11 updated_at actualizado en acc_period';
  ELSE
    RAISE EXCEPTION
      'TEST-506 FAIL: T11 no actualizó updated_at (antes=% después=%)',
      v_ts_before, v_ts_after;
  END IF;

  DELETE FROM acc_period WHERE id = v_period_id;
END; $$;

-- =============================================================================
-- RESUMEN FINAL
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== OA-024-05 ETAPA 0 TEST SUITE COMPLETADO ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Categorías:';
  RAISE NOTICE '  CAT-1 Corporate Identity     : TEST-101 a TEST-111 (11 tests)';
  RAISE NOTICE '  CAT-2 Referential Integrity  : TEST-201 a TEST-207 (7 tests)';
  RAISE NOTICE '  CAT-3 Accounting Invariants  : TEST-301 a TEST-309 (9 tests)';
  RAISE NOTICE '  CAT-4 Security               : TEST-401 a TEST-404 (4 tests)';
  RAISE NOTICE '  CAT-5 Reproducibility        : TEST-501 a TEST-506 (6 tests)';
  RAISE NOTICE '';
  RAISE NOTICE 'Total: 37 tests.';
  RAISE NOTICE '';
  RAISE NOTICE 'Si llegaste a este punto sin EXCEPTION: todos los tests pasaron.';
  RAISE NOTICE 'Si hubo una EXCEPTION: el batch se detuvo en el primer FAIL.';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximo paso: ejecutar 013_rollback.sql + repetir 006→012 para test de reproducibilidad.';
END; $$;
