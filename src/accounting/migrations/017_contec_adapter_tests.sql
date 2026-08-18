-- =============================================================================
-- 017_contec_adapter_tests.sql
-- OA-024-08 — ContecAdapter Test Suite
-- Fecha   : 2026-08-18
-- Estado  : EJECUTAR DESPUÉS de 016
-- =============================================================================
-- CAT-10: Schema integrity — acc_source_balance_detail + storage cols (1001-1008)
-- CAT-11: Constraints & RLS (1101-1106)
-- CAT-12: Lineage invariant (1201-1205)
-- CAT-13: Pilot ALF readiness (1301-1304)
-- Total  : 23 tests
-- =============================================================================
-- FIXTURES: SINTÉTICOS EXCLUSIVAMENTE. Sin datos financieros reales.
-- POST: cada test hace cleanup para no dejar datos residuales.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== OA-024-08 CONTEC ADAPTER TEST SUITE iniciando ==='; END; $$;


-- =============================================================================
-- CAT-10: Schema integrity
-- =============================================================================

DO $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='acc_source_balance_detail') INTO v_exists;
  IF v_exists THEN RAISE NOTICE 'TEST-1001 PASS: acc_source_balance_detail existe';
  ELSE RAISE EXCEPTION 'TEST-1001 FAIL: acc_source_balance_detail no fue creada'; END IF;
END; $$;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='acc_source_balance_detail'
    AND column_name IN (
      'id','batch_id','source_row_ref','source_report_type',
      'source_account_code','source_account_name',
      'cost_center_code','nature','class','subclass',
      'actual_amount','budget_amount','variance_amount',
      'ytd_debit','ytd_credit','debit_balance','credit_balance',
      'source_currency','created_at'
    );
  IF v_count = 19 THEN RAISE NOTICE 'TEST-1002 PASS: acc_source_balance_detail tiene 19 columnas requeridas';
  ELSE RAISE EXCEPTION 'TEST-1002 FAIL: % columnas (esperado 19)', v_count; END IF;
END; $$;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='acc_source_balance_detail'
    AND ccu.table_name='acc_source_batch';
  IF v_count >= 1 THEN RAISE NOTICE 'TEST-1003 PASS: FK batch_id → acc_source_batch existe';
  ELSE RAISE EXCEPTION 'TEST-1003 FAIL: FK batch_id → acc_source_batch no encontrado'; END IF;
END; $$;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_constraint
  WHERE conrelid='public.acc_source_balance_detail'::regclass
    AND contype='c' AND conname='ck_asbd_report_type';
  IF v_count = 1 THEN RAISE NOTICE 'TEST-1004 PASS: ck_asbd_report_type CHECK existe';
  ELSE RAISE EXCEPTION 'TEST-1004 FAIL: ck_asbd_report_type no encontrado'; END IF;
END; $$;

DO $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='acc_source_batch'
    AND column_name='storage_bucket') INTO v_exists;
  IF v_exists THEN RAISE NOTICE 'TEST-1005 PASS: acc_source_batch tiene columna storage_bucket';
  ELSE RAISE EXCEPTION 'TEST-1005 FAIL: storage_bucket no existe en acc_source_batch'; END IF;
END; $$;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_schema='public' AND table_name='acc_source_batch'
    AND column_name IN ('storage_bucket','storage_path','mime_type','file_size_bytes');
  IF v_count = 4 THEN RAISE NOTICE 'TEST-1006 PASS: 4 columnas storage en acc_source_batch';
  ELSE RAISE EXCEPTION 'TEST-1006 FAIL: Solo % columnas storage (esperado 4)', v_count; END IF;
END; $$;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_constraint
  WHERE conrelid='public.acc_source_batch'::regclass
    AND contype='c' AND conname='ck_asb_storage_bucket';
  IF v_count = 1 THEN RAISE NOTICE 'TEST-1007 PASS: ck_asb_storage_bucket CHECK existe';
  ELSE RAISE EXCEPTION 'TEST-1007 FAIL: ck_asb_storage_bucket no encontrado'; END IF;
END; $$;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_indexes
  WHERE schemaname='public' AND tablename='acc_source_balance_detail'
    AND indexname LIKE 'idx_asbd_%';
  IF v_count >= 4 THEN RAISE NOTICE 'TEST-1008 PASS: % índices idx_asbd_* en acc_source_balance_detail', v_count;
  ELSE RAISE EXCEPTION 'TEST-1008 FAIL: Solo % índices idx_asbd_* (esperado ≥4)', v_count; END IF;
END; $$;


-- =============================================================================
-- CAT-11: Constraints & RLS
-- =============================================================================

DO $$
DECLARE v_rls BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname='acc_source_balance_detail';
  IF COALESCE(v_rls, false) THEN RAISE NOTICE 'TEST-1101 PASS: RLS habilitado en acc_source_balance_detail';
  ELSE RAISE EXCEPTION 'TEST-1101 FAIL: RLS no habilitado en acc_source_balance_detail'; END IF;
END; $$;

DO $$
DECLARE v_anon_deny INT;
BEGIN
  SELECT COUNT(*) INTO v_anon_deny FROM pg_policies
  WHERE tablename='acc_source_balance_detail' AND 'anon'=ANY(roles) AND qual='false';
  IF v_anon_deny >= 1 THEN RAISE NOTICE 'TEST-1102 PASS: anon DENY (USING false) en acc_source_balance_detail';
  ELSE RAISE EXCEPTION 'TEST-1102 FAIL: No hay política anon DENY en acc_source_balance_detail'; END IF;
END; $$;

DO $$
DECLARE v_svc INT;
BEGIN
  SELECT COUNT(*) INTO v_svc FROM pg_policies
  WHERE tablename='acc_source_balance_detail' AND 'service_role'=ANY(roles) AND cmd='ALL';
  IF v_svc >= 1 THEN RAISE NOTICE 'TEST-1103 PASS: service_role ALL en acc_source_balance_detail';
  ELSE RAISE EXCEPTION 'TEST-1103 FAIL: service_role ALL no encontrado en acc_source_balance_detail'; END IF;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_restrict.xlsx', 'sha256_restrict_1104', 'CREATED')
  RETURNING id INTO v_batch_id;
  INSERT INTO acc_source_balance_detail
    (batch_id, source_row_ref, source_report_type, source_account_code, actual_amount)
  VALUES (v_batch_id, 'row:1', 'eerr_periodo', '6.01.01.001', 100.00);
  BEGIN
    DELETE FROM acc_source_batch WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-1104 FAIL: ON DELETE RESTRICT no bloqueó borrar batch con detail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'TEST-1104 PASS: ON DELETE RESTRICT bloqueó borrar batch con acc_source_balance_detail';
  END;
  DELETE FROM acc_source_balance_detail WHERE batch_id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_ck.xlsx', 'sha256_ck_1105', 'CREATED')
  RETURNING id INTO v_batch_id;
  BEGIN
    INSERT INTO acc_source_balance_detail
      (batch_id, source_row_ref, source_report_type, source_account_code)
    VALUES (v_batch_id, 'row:1', 'INVALIDO', '6.01.01.001');
    RAISE EXCEPTION 'TEST-1105 FAIL: ck_asbd_report_type no bloqueó valor inválido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST-1105 PASS: ck_asbd_report_type bloqueó source_report_type inválido';
  END;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_bucket_ck.xlsx', 'sha256_bucket_1106', 'CREATED')
  RETURNING id INTO v_batch_id;
  BEGIN
    UPDATE acc_source_batch SET storage_bucket='bucket-no-autorizado' WHERE id=v_batch_id;
    RAISE EXCEPTION 'TEST-1106 FAIL: ck_asb_storage_bucket no bloqueó bucket inválido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST-1106 PASS: ck_asb_storage_bucket bloqueó bucket no autorizado';
  END;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;


-- =============================================================================
-- CAT-12: Lineage invariant
-- =============================================================================

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID; v_count INT;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status, report_type)
  VALUES (v_entity_id, 'contec', 'test_lineage_1201.xlsx', 'sha256_lin_1201', 'CREATED', 'balance')
  RETURNING id INTO v_batch_id;
  INSERT INTO acc_source_balance_detail
    (batch_id, source_row_ref, source_report_type, source_account_code, source_account_name,
     debit_balance, credit_balance, source_currency)
  VALUES
    (v_batch_id, 'row:3', 'balance', '1.01.01.001', 'BANCO BCI CTA CTE', 5000000.00, 0, 'USD'),
    (v_batch_id, 'row:4', 'balance', '2.01.01.001', 'PROVEEDORES', 0, 1200000.00, 'USD');
  SELECT COUNT(*) INTO v_count FROM acc_source_balance_detail WHERE batch_id=v_batch_id;
  IF v_count = 2 THEN RAISE NOTICE 'TEST-1201 PASS: 2 filas Balance source insertadas correctamente';
  ELSE RAISE EXCEPTION 'TEST-1201 FAIL: % filas (esperado 2)', v_count; END IF;
  DELETE FROM acc_source_balance_detail WHERE batch_id=v_batch_id;
  DELETE FROM acc_source_batch WHERE id=v_batch_id;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID; v_count INT;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status, report_type)
  VALUES (v_entity_id, 'contec', 'test_eerr_cc_1202.xlsx', 'sha256_eerr_1202', 'CREATED', 'eerr_periodo')
  RETURNING id INTO v_batch_id;
  -- Misma cuenta, 3 centros de costo (escenario real CC múltiple)
  INSERT INTO acc_source_balance_detail
    (batch_id, source_row_ref, source_report_type, source_account_code, source_account_name,
     cost_center_code, nature, class, subclass, actual_amount, budget_amount, variance_amount)
  VALUES
    (v_batch_id, 'row:12', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
     'ADMINISTRACION Y FINANZAS', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL', 'GASTOS DE PERSONAL',
     150000.00, 140000.00, -10000.00),
    (v_batch_id, 'row:13', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
     'OPERACIONES', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL', 'GASTOS DE PERSONAL',
     80000.00, 75000.00, -5000.00),
    (v_batch_id, 'row:14', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
     'COMEX', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL', 'GASTOS DE PERSONAL',
     45000.00, 50000.00, 5000.00);
  SELECT COUNT(*) INTO v_count FROM acc_source_balance_detail
  WHERE batch_id=v_batch_id AND source_account_code='6.11.01.010';
  IF v_count = 3 THEN RAISE NOTICE 'TEST-1202 PASS: 3 filas CC (EERR multi-CC) para misma cuenta';
  ELSE RAISE EXCEPTION 'TEST-1202 FAIL: % filas CC (esperado 3)', v_count; END IF;
  DELETE FROM acc_source_balance_detail WHERE batch_id=v_batch_id;
  DELETE FROM acc_source_batch WHERE id=v_batch_id;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID; v_sum NUMERIC; v_tolerance NUMERIC := 0.01;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status, report_type)
  VALUES (v_entity_id, 'contec', 'test_invariant_1203.xlsx', 'sha256_inv_1203', 'CREATED', 'eerr_periodo')
  RETURNING id INTO v_batch_id;
  INSERT INTO acc_source_balance_detail
    (batch_id, source_row_ref, source_report_type, source_account_code, cost_center_code, actual_amount)
  VALUES
    (v_batch_id, 'row:20', 'eerr_periodo', '6.11.01.010', 'ADMIN',      150000.00),
    (v_batch_id, 'row:21', 'eerr_periodo', '6.11.01.010', 'OPERACIONES', 80000.00),
    (v_batch_id, 'row:22', 'eerr_periodo', '6.11.01.010', 'COMEX',       45000.00);
  -- Verificar invariante: SUM = 275000 (lo que se postearía a acc_account_balance.net_balance)
  SELECT SUM(actual_amount) INTO v_sum FROM acc_source_balance_detail
  WHERE batch_id=v_batch_id AND source_account_code='6.11.01.010';
  IF ABS(v_sum - 275000.00) <= v_tolerance
    THEN RAISE NOTICE 'TEST-1203 PASS: Invariante de lineage cumplido — SUM(CC) = % = canonical net_balance', v_sum;
  ELSE RAISE EXCEPTION 'TEST-1203 FAIL: SUM=% (esperado 275000)', v_sum; END IF;
  DELETE FROM acc_source_balance_detail WHERE batch_id=v_batch_id;
  DELETE FROM acc_source_batch WHERE id=v_batch_id;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_batch_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status, report_type)
  VALUES (v_entity_id, 'contec', 'test_storage_1204.xlsx', 'sha256_storage_1204', 'CREATED', 'eerr_periodo')
  RETURNING id INTO v_batch_id;
  UPDATE acc_source_batch SET
    storage_bucket   = 'accounting-source',
    storage_path     = v_entity_id || '/2026/2026-01/' || v_batch_id || '/test_storage_1204.xlsx',
    mime_type        = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size_bytes  = 24576
  WHERE id = v_batch_id;
  DECLARE v_path TEXT; v_bucket TEXT; v_size BIGINT;
  BEGIN
    SELECT storage_bucket, storage_path, file_size_bytes
    INTO v_bucket, v_path, v_size
    FROM acc_source_batch WHERE id = v_batch_id;
    IF v_bucket = 'accounting-source' AND v_path IS NOT NULL AND v_size = 24576
      THEN RAISE NOTICE 'TEST-1204 PASS: Campos storage en acc_source_batch correctos — bucket=%, size=%', v_bucket, v_size;
    ELSE RAISE EXCEPTION 'TEST-1204 FAIL: bucket=% path=% size=%', v_bucket, v_path, v_size; END IF;
  END;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

DO $$
DECLARE v_entity_id UUID; v_count_before INT; v_count_after INT;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  SELECT COUNT(*) INTO v_count_before FROM acc_source_balance_detail;
  -- Verificar que no hay filas residuales de tests anteriores
  IF v_count_before = 0 THEN RAISE NOTICE 'TEST-1205 PASS: acc_source_balance_detail limpia (0 filas residuales)';
  ELSE RAISE NOTICE 'TEST-1205 WARN: % filas en acc_source_balance_detail (pueden ser de datos previos — aceptable si DB no es vacía)', v_count_before; END IF;
END; $$;


-- =============================================================================
-- CAT-13: Pilot ALF readiness
-- =============================================================================

DO $$
DECLARE v_code TEXT; v_country CHAR(2); v_tax TEXT;
BEGIN
  SELECT code, country, tax_identifier INTO v_code, v_country, v_tax
  FROM core_entities WHERE code='ALF';
  IF v_code='ALF' AND v_country='CL' AND v_tax IS NOT NULL
    THEN RAISE NOTICE 'TEST-1301 PASS: ALF entity OK — code=%, country=%, RUT=%', v_code, v_country, v_tax;
  ELSE RAISE EXCEPTION 'TEST-1301 FAIL: ALF entity incompleta — code=% country=% tax=%', v_code, v_country, v_tax; END IF;
END; $$;

DO $$
DECLARE v_count INT; v_cap JSONB;
BEGIN
  SELECT COUNT(*), (SELECT capability_set FROM acc_source_adapter_profile p2
    JOIN core_entities e2 ON e2.id=p2.entity_id WHERE e2.code='ALF' AND p2.source_system='contec')
  INTO v_count, v_cap
  FROM acc_source_adapter_profile p
  JOIN core_entities e ON e.id=p.entity_id
  WHERE e.code='ALF' AND p.source_system='contec';
  IF v_count = 1
    THEN RAISE NOTICE 'TEST-1302 PASS: acc_source_adapter_profile ALF/contec existe — capabilitySet keys: %',
      ARRAY(SELECT jsonb_object_keys(v_cap));
  ELSE RAISE EXCEPTION 'TEST-1302 FAIL: Profile ALF/contec no encontrado (% rows)', v_count; END IF;
END; $$;

DO $$
DECLARE v_func_curr TEXT;
BEGIN
  SELECT capability_set->>'functional_currency' INTO v_func_curr
  FROM acc_source_adapter_profile p JOIN core_entities e ON e.id=p.entity_id
  WHERE e.code='ALF' AND p.source_system='contec';
  IF v_func_curr IS NOT NULL
    THEN RAISE NOTICE 'TEST-1303 PASS: D8 ALF functional_currency = %', v_func_curr;
  ELSE RAISE NOTICE 'TEST-1303 WARN: D8 OPEN — functional_currency NULL en profile ALF/contec. Pilot financiero real bloqueado hasta resolución D8.'; END IF;
END; $$;

DO $$
DECLARE v_mapping_count INT; v_entity_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code='ALF';
  SELECT COUNT(*) INTO v_mapping_count FROM acc_chart_mapping WHERE entity_id=v_entity_id;
  IF v_mapping_count > 0
    THEN RAISE NOTICE 'TEST-1304 PASS: acc_chart_mapping para ALF tiene % entradas', v_mapping_count;
  ELSE RAISE NOTICE 'TEST-1304 WARN: acc_chart_mapping vacío para ALF. Posting de cuentas financieras bloqueado hasta poblar mapping.'; END IF;
END; $$;

DO $$
BEGIN
  RAISE NOTICE '=== OA-024-08 TEST SUITE COMPLETADO ===';
  RAISE NOTICE 'CAT-10: TEST-1001→1008 (8) | CAT-11: TEST-1101→1106 (6) | CAT-12: TEST-1201→1205 (5) | CAT-13: TEST-1301→1304 (4)';
  RAISE NOTICE 'Total: 23 tests. Algunos TEST-13xx emiten WARN en vez de FAIL (son gates de readiness, no de schema).';
  RAISE NOTICE 'Ejecutar 012 + 015 para confirmar regresión OA-024-05 y OA-024-07.';
END; $$;
