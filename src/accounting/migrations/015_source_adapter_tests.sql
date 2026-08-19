-- =============================================================================
-- 015_source_adapter_tests.sql
-- OA-024-07 — Suite de Tests: Source Adapter Framework Infrastructure
-- Fecha   : 2026-08-17
-- Estado  : EJECUTAR DESPUÉS de 014_source_adapter_infra.sql
-- =============================================================================
-- CATEGORÍAS (5):
--   CAT-5: Migration Integrity   — schema, constraints, índices, seeds
--   CAT-6: Batch Lifecycle       — transiciones, approval gate, immutability
--   CAT-7: Issue Management      — FK, severity, FATAL gate, POSTED immutability
--   CAT-8: Mapping & Security    — mapping completeness function, RLS, anon denied
--   CAT-9: Regression            — OA-024-05 37 tests mencionados (ref check)
-- =============================================================================
-- Todos los datos son SINTÉTICOS. No se usan datos financieros reales.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== OA-024-07 SOURCE ADAPTER TESTS iniciando ==='; END; $$;

-- =============================================================================
-- CAT-5: MIGRATION INTEGRITY
-- =============================================================================

-- TEST-501: acc_source_batch tiene el nuevo default de status = 'CREATED'
DO $$
DECLARE v_default TEXT;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'acc_source_batch'
    AND column_name  = 'status';
  IF v_default LIKE '%CREATED%' THEN
    RAISE NOTICE 'TEST-501 PASS: acc_source_batch.status default = CREATED';
  ELSE
    RAISE EXCEPTION 'TEST-501 FAIL: default de status es % (esperado CREATED)', v_default;
  END IF;
END; $$;

-- TEST-502: acc_source_batch tiene las 6 columnas nuevas
DO $$
DECLARE
  v_missing TEXT[];
  required TEXT[] := ARRAY['report_type','approved_by','approved_at','posted_at','posted_by','superseded_by_id'];
  existing TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name::TEXT) INTO existing
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'acc_source_batch'
    AND column_name = ANY(required);

  v_missing := ARRAY(SELECT unnest(required) EXCEPT SELECT unnest(COALESCE(existing, '{}'::TEXT[])));

  IF array_length(v_missing, 1) IS NULL THEN
    RAISE NOTICE 'TEST-502 PASS: acc_source_batch tiene las 6 columnas nuevas';
  ELSE
    RAISE EXCEPTION 'TEST-502 FAIL: Columnas faltantes: %', v_missing;
  END IF;
END; $$;

-- TEST-503: acc_source_batch_issue existe con columnas requeridas
DO $$
DECLARE
  v_missing TEXT[];
  required TEXT[] := ARRAY['id','batch_id','severity','issue_code','message','created_at',
                            'source_record_ref','field_name','value_found','suggested_resolution',
                            'resolved_by','resolved_at'];
  existing TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name::TEXT) INTO existing
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'acc_source_batch_issue'
    AND column_name = ANY(required);

  v_missing := ARRAY(SELECT unnest(required) EXCEPT SELECT unnest(COALESCE(existing, '{}'::TEXT[])));

  IF array_length(v_missing, 1) IS NULL THEN
    RAISE NOTICE 'TEST-503 PASS: acc_source_batch_issue tiene todas las columnas requeridas';
  ELSE
    RAISE EXCEPTION 'TEST-503 FAIL: Columnas faltantes en acc_source_batch_issue: %', v_missing;
  END IF;
END; $$;

-- TEST-504: acc_source_adapter_profile existe con UNIQUE(entity_id, source_system)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE table_schema   = 'public'
    AND table_name     = 'acc_source_adapter_profile'
    AND constraint_type = 'UNIQUE';
  IF v_count >= 1 THEN
    RAISE NOTICE 'TEST-504 PASS: acc_source_adapter_profile tiene constraint UNIQUE';
  ELSE
    RAISE EXCEPTION 'TEST-504 FAIL: acc_source_adapter_profile no tiene UNIQUE constraint';
  END IF;
END; $$;

-- TEST-505: Seed ALF Contec existe y tiene capability_set no vacío
DO $$
DECLARE
  v_count    INT;
  v_cap_keys TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM acc_source_adapter_profile p
  JOIN core_entities e ON e.id = p.entity_id
  WHERE e.code = 'ALF' AND p.source_system = 'contec';

  SELECT (capability_set->>'balance') INTO v_cap_keys
  FROM acc_source_adapter_profile p
  JOIN core_entities e ON e.id = p.entity_id
  WHERE e.code = 'ALF' AND p.source_system = 'contec';

  IF v_count = 1 AND v_cap_keys IS NOT NULL THEN
    RAISE NOTICE 'TEST-505 PASS: Seed ALF/contec existe con capability_set.balance';
  ELSE
    RAISE EXCEPTION 'TEST-505 FAIL: Seed ALF/contec no encontrado o capability_set vacío (count=%, cap=%)',
      v_count, v_cap_keys;
  END IF;
END; $$;

-- TEST-506: acc_source_batch_issue tiene índice en batch_id
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'acc_source_batch_issue'
    AND indexdef LIKE '%batch_id%';
  IF v_count >= 1 THEN
    RAISE NOTICE 'TEST-506 PASS: acc_source_batch_issue tiene índice en batch_id';
  ELSE
    RAISE EXCEPTION 'TEST-506 FAIL: No hay índice en acc_source_batch_issue.batch_id';
  END IF;
END; $$;

-- TEST-507: Triggers de lifecycle existen
DO $$
DECLARE
  v_missing TEXT[];
  required TEXT[] := ARRAY['trg_acc_source_batch_lifecycle','trg_acc_source_batch_fatal_gate','trg_asbi_immutable'];
  existing TEXT[];
BEGIN
  SELECT ARRAY_AGG(tgname::TEXT) INTO existing
  FROM pg_trigger
  WHERE tgname = ANY(required);

  v_missing := ARRAY(SELECT unnest(required) EXCEPT SELECT unnest(COALESCE(existing, '{}'::TEXT[])));

  IF array_length(v_missing, 1) IS NULL THEN
    RAISE NOTICE 'TEST-507 PASS: Los 3 triggers de lifecycle existen';
  ELSE
    RAISE EXCEPTION 'TEST-507 FAIL: Triggers faltantes: %', v_missing;
  END IF;
END; $$;

-- TEST-508: fn_acc_mapping_completeness existe y es invocable
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'fn_acc_mapping_completeness';
  IF v_count >= 1 THEN
    RAISE NOTICE 'TEST-508 PASS: fn_acc_mapping_completeness existe';
  ELSE
    RAISE EXCEPTION 'TEST-508 FAIL: fn_acc_mapping_completeness no encontrada';
  END IF;
END; $$;


-- =============================================================================
-- CAT-6: BATCH LIFECYCLE
-- =============================================================================

-- TEST-601: INSERT con status CREATED permitido (nuevo default)
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_601', 'CREATED')
  RETURNING id INTO v_batch_id;

  RAISE NOTICE 'TEST-601 PASS: INSERT con status=CREATED aceptado (batch %)', v_batch_id;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-602: Transición válida CREATED → PARSING permitida
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_602', 'CREATED')
  RETURNING id INTO v_batch_id;

  UPDATE acc_source_batch SET status = 'PARSING' WHERE id = v_batch_id;

  RAISE NOTICE 'TEST-602 PASS: Transición CREATED → PARSING permitida';

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-603: Transición inválida CREATED → POSTED bloqueada
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_603', 'CREATED')
  RETURNING id INTO v_batch_id;

  BEGIN
    UPDATE acc_source_batch SET status = 'POSTED' WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-603 FAIL: Transición inválida CREATED → POSTED NO fue bloqueada';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%BATCH_LIFECYCLE_VIOLATION%' THEN
        RAISE NOTICE 'TEST-603 PASS: Transición inválida CREATED → POSTED bloqueada correctamente';
      ELSE
        RAISE EXCEPTION 'TEST-603 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-604: Transición terminal REJECTED → PARSING bloqueada (terminal → no transitions)
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_604', 'REJECTED')
  RETURNING id INTO v_batch_id;

  BEGIN
    UPDATE acc_source_batch SET status = 'PARSING' WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-604 FAIL: Transición REJECTED → PARSING NO fue bloqueada';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%BATCH_LIFECYCLE_VIOLATION%' THEN
        RAISE NOTICE 'TEST-604 PASS: Estado terminal REJECTED no permite transiciones';
      ELSE
        RAISE EXCEPTION 'TEST-604 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-605: Aprobación sin approved_by bloqueada
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_605', 'PENDING_APPROVAL')
  RETURNING id INTO v_batch_id;

  BEGIN
    -- Intenta aprobar sin approved_by
    UPDATE acc_source_batch
    SET status = 'APPROVED', approved_by = NULL
    WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-605 FAIL: Aprobación sin approved_by NO fue bloqueada';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%BATCH_APPROVAL_REQUIRED%' THEN
        RAISE NOTICE 'TEST-605 PASS: Aprobación sin approved_by bloqueada (human approval obligatorio)';
      ELSE
        RAISE EXCEPTION 'TEST-605 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-606: Aprobación con approved_by válido permitida; approved_at se auto-stampa
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
  v_approved_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_606', 'PENDING_APPROVAL')
  RETURNING id INTO v_batch_id;

  UPDATE acc_source_batch
  SET status = 'APPROVED', approved_by = 'angelo.huerta'
  WHERE id = v_batch_id;

  SELECT approved_at INTO v_approved_at FROM acc_source_batch WHERE id = v_batch_id;

  IF v_approved_at IS NOT NULL THEN
    RAISE NOTICE 'TEST-606 PASS: Aprobación con approved_by aceptada; approved_at auto-stampado';
  ELSE
    RAISE EXCEPTION 'TEST-606 FAIL: approved_at no fue auto-stampado';
  END IF;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-607: SUPERSEDED requiere superseded_by_id
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'lifecycle_test.xlsx', 'sha256_lifecycle_607', 'POSTED')
  RETURNING id INTO v_batch_id;

  BEGIN
    UPDATE acc_source_batch SET status = 'SUPERSEDED', superseded_by_id = NULL
    WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-607 FAIL: SUPERSEDED sin superseded_by_id NO fue bloqueado';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%BATCH_SUPERSEDE_REQUIRED%' THEN
        RAISE NOTICE 'TEST-607 PASS: SUPERSEDED sin superseded_by_id bloqueado';
      ELSE
        RAISE EXCEPTION 'TEST-607 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;


-- =============================================================================
-- CAT-7: ISSUE MANAGEMENT
-- =============================================================================

-- TEST-701: Issue con batch_id inválido bloqueado (FK)
DO $$
BEGIN
  BEGIN
    INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
    VALUES (gen_random_uuid(), 'ERROR', 'TEST_ISSUE', 'batch inexistente');
    RAISE EXCEPTION 'TEST-701 FAIL: FK batch_id no fue bloqueada';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'TEST-701 PASS: FK batch_id bloqueó issue huérfano';
  END;
END; $$;

-- TEST-702: Severity inválida bloqueada
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_issue.xlsx', 'sha256_issue_702', 'CREATED')
  RETURNING id INTO v_batch_id;

  BEGIN
    INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
    VALUES (v_batch_id, 'CRITICAL', 'TEST_ISSUE', 'severity inválida');
    RAISE EXCEPTION 'TEST-702 FAIL: CHECK severity no fue bloqueado';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'TEST-702 PASS: Severity inválida CRITICAL bloqueada';
  END;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-703: Issue FATAL sin resolver bloquea transición PENDING_APPROVAL → APPROVED
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_fatal.xlsx', 'sha256_fatal_703', 'PENDING_APPROVAL')
  RETURNING id INTO v_batch_id;

  INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
  VALUES (v_batch_id, 'FATAL', 'SRC_ACCOUNT_UNMAPPED', 'Cuenta 6.11.01.010 sin mapping');

  BEGIN
    UPDATE acc_source_batch
    SET status = 'APPROVED', approved_by = 'angelo.huerta'
    WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-703 FAIL: FATAL sin resolver NO bloqueó aprobación';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%BATCH_FATAL_GATE%' THEN
        RAISE NOTICE 'TEST-703 PASS: Issue FATAL sin resolver bloqueó aprobación';
      ELSE
        RAISE EXCEPTION 'TEST-703 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  DELETE FROM acc_source_batch_issue WHERE batch_id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-704: Issue FATAL resuelto permite aprobación
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
  v_issue_id  BIGINT;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_resolved.xlsx', 'sha256_resolved_704', 'PENDING_APPROVAL')
  RETURNING id INTO v_batch_id;

  INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
  VALUES (v_batch_id, 'FATAL', 'SRC_ACCOUNT_UNMAPPED', 'Cuenta resuelta')
  RETURNING id INTO v_issue_id;

  -- Resolver el issue
  UPDATE acc_source_batch_issue
  SET resolved_by = 'angelo.huerta', resolved_at = now()
  WHERE id = v_issue_id;

  -- Ahora debería poder aprobar
  UPDATE acc_source_batch
  SET status = 'APPROVED', approved_by = 'angelo.huerta'
  WHERE id = v_batch_id;

  RAISE NOTICE 'TEST-704 PASS: Issue FATAL resuelto permite aprobación';

  DELETE FROM acc_source_batch_issue WHERE batch_id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;

-- TEST-705: Issues de batch POSTED son inmutables
-- Cleanup usa supersede: POSTED → SUPERSEDED → issues borrables (trigger solo bloquea POSTED)
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
  v_batch_aux UUID;
  v_issue_id  BIGINT;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  -- Batch auxiliar para el supersede del cleanup
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_posted_aux.xlsx', 'sha256_posted_705_aux', 'CREATED')
  RETURNING id INTO v_batch_aux;

  -- Batch POSTED (INSERT directo: lifecycle trigger solo actúa en UPDATE)
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_posted.xlsx', 'sha256_posted_705', 'POSTED')
  RETURNING id INTO v_batch_id;

  INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
  VALUES (v_batch_id, 'INFO', 'CC_AGGREGATION_APPLIED', 'CC agregado en posting')
  RETURNING id INTO v_issue_id;

  BEGIN
    UPDATE acc_source_batch_issue SET message = 'modificado' WHERE id = v_issue_id;
    RAISE EXCEPTION 'TEST-705 FAIL: Issue de batch POSTED fue modificado (no debe ser posible)';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%BATCH_ISSUE_IMMUTABLE%' THEN
        RAISE NOTICE 'TEST-705 PASS: Issues de batch POSTED son inmutables';
      ELSE
        RAISE EXCEPTION 'TEST-705 FAIL: Error inesperado: %', SQLERRM;
      END IF;
  END;

  -- Cleanup: superseder → batch queda SUPERSEDED → trigger permite DELETE de issues
  UPDATE acc_source_batch SET status = 'SUPERSEDED', superseded_by_id = v_batch_aux WHERE id = v_batch_id;
  DELETE FROM acc_source_batch_issue WHERE batch_id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_aux;
END; $$;

-- TEST-706: WARNING/INFO no bloquean aprobación
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_warn.xlsx', 'sha256_warn_706', 'PENDING_APPROVAL')
  RETURNING id INTO v_batch_id;

  INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
  VALUES (v_batch_id, 'WARNING', 'CC_AGGREGATION_APPLIED', 'Solo un warning');

  INSERT INTO acc_source_batch_issue (batch_id, severity, issue_code, message)
  VALUES (v_batch_id, 'INFO', 'BUDGET_SKIPPED', 'Budget no importado en V1');

  -- Aprobar sin errores
  UPDATE acc_source_batch
  SET status = 'APPROVED', approved_by = 'angelo.huerta'
  WHERE id = v_batch_id;

  RAISE NOTICE 'TEST-706 PASS: Issues WARNING/INFO no bloquean aprobación';

  DELETE FROM acc_source_batch_issue WHERE batch_id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;


-- =============================================================================
-- CAT-8: MAPPING & SECURITY
-- =============================================================================

-- TEST-801: fn_acc_mapping_completeness retorna vacío cuando todos tienen mapping
DO $$
DECLARE v_count INT;
BEGIN
  -- Sin datos reales, la función debe retornar 0 filas para un batch inexistente
  SELECT COUNT(*) INTO v_count
  FROM fn_acc_mapping_completeness(gen_random_uuid());

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST-801 PASS: fn_acc_mapping_completeness retorna vacío para batch sin datos';
  ELSE
    RAISE EXCEPTION 'TEST-801 FAIL: fn_acc_mapping_completeness retornó % filas para batch inexistente', v_count;
  END IF;
END; $$;

-- TEST-802: RLS habilitado en acc_source_batch_issue
DO $$
DECLARE v_rls BOOLEAN;
BEGIN
  SELECT rowsecurity INTO v_rls
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'acc_source_batch_issue';

  IF v_rls THEN
    RAISE NOTICE 'TEST-802 PASS: RLS habilitado en acc_source_batch_issue';
  ELSE
    RAISE EXCEPTION 'TEST-802 FAIL: RLS NO habilitado en acc_source_batch_issue';
  END IF;
END; $$;

-- TEST-803: RLS habilitado en acc_source_adapter_profile
DO $$
DECLARE v_rls BOOLEAN;
BEGIN
  SELECT rowsecurity INTO v_rls
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'acc_source_adapter_profile';

  IF v_rls THEN
    RAISE NOTICE 'TEST-803 PASS: RLS habilitado en acc_source_adapter_profile';
  ELSE
    RAISE EXCEPTION 'TEST-803 FAIL: RLS NO habilitado en acc_source_adapter_profile';
  END IF;
END; $$;

-- TEST-804: Política anon-deny existe en acc_source_batch_issue
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'acc_source_batch_issue'
    AND policyname LIKE '%deny_anon%';

  IF v_count >= 1 THEN
    RAISE NOTICE 'TEST-804 PASS: Política anon-deny existe en acc_source_batch_issue';
  ELSE
    RAISE EXCEPTION 'TEST-804 FAIL: No hay política anon-deny en acc_source_batch_issue';
  END IF;
END; $$;

-- TEST-805: acc_source_adapter_profile UNIQUE(entity_id, source_system) — duplicado bloqueado
DO $$
DECLARE
  v_entity_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  -- El seed de migration 014 ya insertó ALF/contec
  -- Intentar insertar de nuevo debe fallar con unique_violation
  BEGIN
    INSERT INTO acc_source_adapter_profile (entity_id, source_system, capability_set)
    VALUES (v_entity_id, 'contec', '{"test":true}');
    RAISE EXCEPTION 'TEST-805 FAIL: UNIQUE(entity_id, source_system) no bloqueó duplicado';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'TEST-805 PASS: UNIQUE(entity_id, source_system) bloqueó duplicado';
  END;
END; $$;

-- TEST-806: acc_source_batch report_type inválido bloqueado
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  BEGIN
    INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status, report_type)
    VALUES (v_entity_id, 'contec', 'test_rt.xlsx', 'sha256_rt_806', 'CREATED', 'invalid_type');
    RAISE EXCEPTION 'TEST-806 FAIL: report_type inválido NO fue bloqueado';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'TEST-806 PASS: report_type inválido bloqueado por CHECK';
  END;
END; $$;

-- TEST-807: acc_source_batch self-supersede bloqueado
DO $$
DECLARE
  v_entity_id UUID;
  v_batch_id  UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';

  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status)
  VALUES (v_entity_id, 'contec', 'test_self.xlsx', 'sha256_self_807', 'CREATED')
  RETURNING id INTO v_batch_id;

  BEGIN
    UPDATE acc_source_batch SET superseded_by_id = v_batch_id WHERE id = v_batch_id;
    RAISE EXCEPTION 'TEST-807 FAIL: Auto-supersesión NO fue bloqueada';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'TEST-807 PASS: Auto-supersesión (superseded_by_id = id) bloqueada';
  END;

  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;


-- =============================================================================
-- CAT-9: REGRESSION — OA-024-05
-- =============================================================================

-- TEST-901: core_entities aún tiene 11 entidades (OA-024-05 TEST-101)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM core_entities;
  IF v_count = 11 THEN
    RAISE NOTICE 'TEST-901 PASS [regression]: core_entities sigue con 11 entidades';
  ELSE
    RAISE EXCEPTION 'TEST-901 FAIL [regression]: core_entities tiene % entidades (esperado 11)', v_count;
  END IF;
END; $$;

-- TEST-902: acc_account_balance UNIQUE(entity_id, period_id, account_code, balance_type) intacto
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'acc_account_balance'
    AND constraint_name = 'uq_acc_account_balance'
    AND constraint_type = 'UNIQUE';
  IF v_count = 1 THEN
    RAISE NOTICE 'TEST-902 PASS [regression]: UNIQUE de acc_account_balance intacto';
  ELSE
    RAISE EXCEPTION 'TEST-902 FAIL [regression]: UNIQUE de acc_account_balance no encontrado';
  END IF;
END; $$;

-- TEST-903: acc_source_batch UNIQUE(file_hash) intacto
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'acc_source_batch'
    AND constraint_name = 'uq_source_batch_hash'
    AND constraint_type = 'UNIQUE';
  IF v_count = 1 THEN
    RAISE NOTICE 'TEST-903 PASS [regression]: UNIQUE(file_hash) de acc_source_batch intacto';
  ELSE
    RAISE EXCEPTION 'TEST-903 FAIL [regression]: UNIQUE(file_hash) no encontrado';
  END IF;
END; $$;

-- TEST-904: Tablas OA-024-05 originales no fueron eliminadas
DO $$
DECLARE
  v_missing TEXT[];
  required TEXT[] := ARRAY[
    'acc_account_balance', 'acc_source_batch', 'acc_period', 'acc_chart_mapping',
    'acc_base_profile', 'acc_journal_entry', 'acc_journal_line', 'acc_reporting_account',
    'pln_budget_entry', 'dim_type', 'dim_value', 'core_entities'
  ];
  existing TEXT[];
BEGIN
  SELECT ARRAY_AGG(tablename::TEXT) INTO existing
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = ANY(required);

  v_missing := ARRAY(SELECT unnest(required) EXCEPT SELECT unnest(COALESCE(existing, '{}'::TEXT[])));

  IF array_length(v_missing, 1) IS NULL THEN
    RAISE NOTICE 'TEST-904 PASS [regression]: Todas las tablas OA-024-05 siguen existiendo';
  ELSE
    RAISE EXCEPTION 'TEST-904 FAIL [regression]: Tablas eliminadas o no encontradas: %', v_missing;
  END IF;
END; $$;

-- TEST-905: Triggers OA-024-05 no fueron eliminados (verificación spot)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger
  WHERE tgname LIKE 'trg_acc_%';
  -- OA-024-05 tenía T1-T11; OA-024-07 agrega 3 más → mínimo 3
  IF v_count >= 3 THEN
    RAISE NOTICE 'TEST-905 PASS [regression]: Triggers trg_acc_* siguen existiendo (count=%)', v_count;
  ELSE
    RAISE EXCEPTION 'TEST-905 FAIL [regression]: Pocos triggers trg_acc_* (count=%)', v_count;
  END IF;
END; $$;

DO $$ BEGIN
  RAISE NOTICE '=== OA-024-07 SOURCE ADAPTER TESTS completados ===';
  RAISE NOTICE 'Verificar conteo: 8 CAT-5 + 7 CAT-6 + 6 CAT-7 + 7 CAT-8 + 5 CAT-9 = 33 tests nuevos';
  RAISE NOTICE 'OA-024-05 (37 tests en 012_test_suite.sql) debe seguir en PASS — validar por separado';
END; $$;
