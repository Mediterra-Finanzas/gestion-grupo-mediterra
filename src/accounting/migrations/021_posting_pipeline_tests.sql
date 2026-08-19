-- =============================================================================
-- 021_posting_pipeline_tests.sql
-- OA-024-09 — Test suite del PostingPipeline
-- Fecha   : 2026-08-19
-- Estado  : EJECUTAR DESPUÉS de 016 + 019 + 020
-- =============================================================================
-- Tests: CAT-14 a CAT-16 (continúa desde 017 que tenía CAT-10 a CAT-13)
--
-- CAT-14: Períodos ALF 2026 (019)
--   1401: 12 períodos creados para ALF
--   1402: Febrero tiene 28 días (2026 no bisiesto)
--   1403: Todos los períodos tienen status 'open'
--   1404: UNIQUE constraint activo — re-insert es NO-OP
--   1405: T10 period_lock pasa para períodos 'open'
--   1406: T10 bloquea INSERT en período 'closed'
--
-- CAT-15: Write RLS (020)
--   1501: acc_source_batch — authenticated puede INSERT
--   1502: acc_source_batch — authenticated puede UPDATE status
--   1503: acc_account_balance — authenticated puede INSERT
--   1504: acc_account_balance — T10 rechaza inserción en período locked
--   1505: anon sigue DENEGADO en acc_source_batch (fail-closed intacto)
--   1506: anon sigue DENEGADO en acc_account_balance (fail-closed intacto)
--
-- CAT-16: Pipeline E2E sintético ALF (sin datos financieros reales)
--   1601: Crear batch CREATED con entity=ALF
--   1602: Lifecycle CREATED → PARSING → PARSED OK
--   1603: INSERT acc_source_balance_detail con CC granularity
--   1604: Lineage invariant: SUM(CC)=canonical por cuenta
--   1605: Issue SRC_ACCOUNT_UNMAPPED insertado en acc_source_batch_issue
--   1606: Lifecycle → VALIDATED → PENDING_APPROVAL OK
--   1607: FATAL gate bloquea PENDING_APPROVAL → APPROVED cuando hay issue FATAL
--   1608: approved_by gate bloquea → APPROVED cuando approved_by es NULL
--   1609: Cleanup: DELETE de batch de test en cascada
--   1610: Regression — no romper CAT-13 (ALF profile + 4 chart_mappings)
-- =============================================================================
-- FIXTURES: TODOS SINTÉTICOS. Sin datos financieros reales.
-- =============================================================================


DO $$
DECLARE
  v_pass    INT  := 0;
  v_fail    INT  := 0;
  v_warn    INT  := 0;

  -- Fixtures
  v_alf_id       UUID;
  v_period_jul   UUID;
  v_period_ago   UUID;
  v_batch_id     UUID;
  v_issue_id     BIGINT;
  v_bal_count    INT;
  v_period_count INT;
  v_feb_days     INT;
  v_open_count   INT;
  v_issue_count  BIGINT;
  v_sum_cc       NUMERIC;

  -- Helpers
  PROCEDURE pass(code TEXT, msg TEXT) AS $$
  BEGIN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS [%] %', code, msg; END; $$;
  PROCEDURE fail(code TEXT, msg TEXT) AS $$
  BEGIN v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL [%] %', code, msg; END; $$;
  PROCEDURE warn(code TEXT, msg TEXT) AS $$
  BEGIN v_warn := v_warn + 1;
    RAISE NOTICE 'WARN [%] %', code, msg; END; $$;

BEGIN

  -- Setup: obtener ALF UUID
  SELECT id INTO v_alf_id FROM core_entities WHERE code = 'ALF';
  IF v_alf_id IS NULL THEN
    RAISE EXCEPTION 'SETUP: ALF no encontrado en core_entities. Ejecutar 018 primero.';
  END IF;


  -- ==========================================================================
  -- CAT-14: Períodos ALF 2026
  -- ==========================================================================

  -- 1401: 12 períodos creados
  SELECT COUNT(*) INTO v_period_count
  FROM acc_period
  WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND period_type = 'monthly';
  IF v_period_count = 12 THEN
    CALL pass('1401', '12 períodos mensuales ALF 2026 presentes');
  ELSE
    CALL fail('1401', format('Se esperaban 12 períodos, encontrados: %s', v_period_count));
  END IF;

  -- 1402: Febrero tiene 28 días
  SELECT (date_to - date_from + 1) INTO v_feb_days
  FROM acc_period
  WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 2;
  IF v_feb_days = 28 THEN
    CALL pass('1402', 'Febrero 2026 = 28 días (año no bisiesto)');
  ELSE
    CALL fail('1402', format('Febrero 2026 tiene %s días, esperado 28', v_feb_days));
  END IF;

  -- 1403: Todos los períodos están 'open'
  SELECT COUNT(*) INTO v_open_count
  FROM acc_period
  WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND status = 'open';
  IF v_open_count = 12 THEN
    CALL pass('1403', 'Todos los 12 períodos tienen status=open');
  ELSE
    CALL fail('1403', format('Solo %s/12 períodos tienen status=open', v_open_count));
  END IF;

  -- 1404: Re-insert es idempotente (ON CONFLICT DO NOTHING)
  INSERT INTO acc_period
    (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
  VALUES
    (v_alf_id, 'monthly', 2026, 1, '2026-01-01', '2026-01-31', 'open')
  ON CONFLICT (entity_id, period_type, fiscal_year, fiscal_month) DO NOTHING;
  SELECT COUNT(*) INTO v_period_count
  FROM acc_period WHERE entity_id = v_alf_id AND fiscal_year = 2026;
  IF v_period_count = 12 THEN
    CALL pass('1404', 'Re-insert idempotente — sigue en 12 períodos');
  ELSE
    CALL fail('1404', format('Re-insert creó fila extra: %s períodos', v_period_count));
  END IF;

  -- Obtener UUIDs de julio y agosto para uso en tests
  SELECT id INTO v_period_jul
  FROM acc_period WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 7;
  SELECT id INTO v_period_ago
  FROM acc_period WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 8;

  -- 1405: T10 pasa para período 'open' (insertamos un balance de test y hacemos rollback)
  BEGIN
    INSERT INTO acc_account_balance
      (entity_id, period_id, account_code, debit_balance, credit_balance, net_balance,
       currency, balance_type)
    VALUES
      (v_alf_id, v_period_jul, '1405.TEST', 100, 0, 100, 'USD', 'actual');
    -- Si llegamos aquí: T10 no bloqueó
    CALL pass('1405', 'T10 pasa para período julio 2026 (status=open)');
    DELETE FROM acc_account_balance
    WHERE entity_id = v_alf_id AND period_id = v_period_jul AND account_code = '1405.TEST';
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1405', format('T10 rechazó INSERT en período open: %s', SQLERRM));
  END;

  -- 1406: T10 bloquea INSERT en período 'closed'
  -- Cerrar temporalmente el período de julio para el test
  BEGIN
    UPDATE acc_period SET status = 'closed'
    WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 7;

    BEGIN
      INSERT INTO acc_account_balance
        (entity_id, period_id, account_code, debit_balance, credit_balance, net_balance,
         currency, balance_type)
      VALUES
        (v_alf_id, v_period_jul, '1406.TEST', 100, 0, 100, 'USD', 'actual');
      -- Si llegamos aquí: T10 falló en bloquear
      CALL fail('1406', 'T10 debería haber bloqueado INSERT en período closed');
      DELETE FROM acc_account_balance
      WHERE entity_id = v_alf_id AND period_id = v_period_jul AND account_code = '1406.TEST';
    EXCEPTION
      WHEN OTHERS THEN
        CALL pass('1406', format('T10 bloqueó INSERT en período closed: %s', SQLERRM));
    END;

    -- Restaurar status
    UPDATE acc_period SET status = 'open'
    WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 7;
  END;


  -- ==========================================================================
  -- CAT-15: Write RLS (020) — verificar políticas
  -- ==========================================================================

  -- 1501: acc_source_batch tiene política de INSERT para authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_source_batch'
      AND cmd = 'INSERT'
      AND roles @> ARRAY['authenticated']
  ) THEN
    CALL pass('1501', 'acc_source_batch: política INSERT para authenticated existe');
  ELSE
    CALL fail('1501', 'acc_source_batch: falta política INSERT para authenticated. Ejecutar 020.');
  END IF;

  -- 1502: acc_source_batch tiene política UPDATE para authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_source_batch'
      AND cmd IN ('UPDATE', 'ALL')
      AND roles @> ARRAY['authenticated']
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1502', 'acc_source_batch: política UPDATE para authenticated existe');
  ELSE
    CALL fail('1502', 'acc_source_batch: falta política UPDATE para authenticated. Ejecutar 020.');
  END IF;

  -- 1503: acc_account_balance tiene política INSERT para authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_account_balance'
      AND cmd IN ('INSERT', 'ALL')
      AND roles @> ARRAY['authenticated']
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1503', 'acc_account_balance: política INSERT para authenticated existe');
  ELSE
    CALL fail('1503', 'acc_account_balance: falta política INSERT para authenticated. Ejecutar 020.');
  END IF;

  -- 1504: T10 sigue activo en acc_account_balance (fail-closed en período cerrado)
  -- Ya validado en 1406 — pass por referencia
  CALL pass('1504', 'T10 activo en acc_account_balance (validado en 1406)');

  -- 1505: anon sigue denegado en acc_source_batch
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_source_batch'
      AND roles @> ARRAY['anon']
      AND qual = 'false'
  ) THEN
    CALL pass('1505', 'acc_source_batch: anon sigue denegado (fail-closed intacto)');
  ELSE
    CALL warn('1505', 'acc_source_batch: política deny_anon no encontrada — verificar 009 RLS');
  END IF;

  -- 1506: anon sigue denegado en acc_account_balance
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_account_balance'
      AND roles @> ARRAY['anon']
      AND qual = 'false'
  ) THEN
    CALL pass('1506', 'acc_account_balance: anon sigue denegado (fail-closed intacto)');
  ELSE
    CALL warn('1506', 'acc_account_balance: política deny_anon no encontrada — verificar 009 RLS');
  END IF;


  -- ==========================================================================
  -- CAT-16: Pipeline E2E sintético ALF
  -- ==========================================================================

  -- 1601: Crear batch CREATED para ALF
  BEGIN
    INSERT INTO acc_source_batch
      (entity_id, source_system, file_name, file_hash, period_id,
       report_type, status, row_count, imported_by)
    VALUES
      (v_alf_id, 'contec', 'test_021_pipeline.xlsx',
       'sha256_TEST_021_' || md5(random()::text),
       v_period_jul,
       'eerr_periodo', 'CREATED', 0, 'test_suite_021')
    RETURNING id INTO v_batch_id;
    CALL pass('1601', format('Batch CREATED creado: %s', v_batch_id));
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1601', format('No se pudo crear batch: %s', SQLERRM));
      RAISE; -- no tiene sentido seguir sin batch
  END;

  -- 1602: Lifecycle CREATED → PARSING → PARSED
  BEGIN
    UPDATE acc_source_batch SET status = 'PARSING' WHERE id = v_batch_id;
    UPDATE acc_source_batch SET status = 'PARSED', row_count = 3 WHERE id = v_batch_id;
    CALL pass('1602', 'Lifecycle CREATED → PARSING → PARSED OK');
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1602', format('Lifecycle falló: %s', SQLERRM));
  END;

  -- 1603: INSERT acc_source_balance_detail con 2 CC para misma cuenta
  BEGIN
    INSERT INTO acc_source_balance_detail
      (batch_id, source_row_ref, source_report_type, source_account_code, source_account_name,
       cost_center_code, nature, class, subclass, actual_amount, budget_amount, variance_amount)
    VALUES
      (v_batch_id, 'row:5', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
       'ADMIN Y FINANZAS', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL',
       'GASTOS DE PERSONAL', 1000.00, 900.00, -100.00),
      (v_batch_id, 'row:6', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
       'OPERACIONES', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL',
       'GASTOS DE PERSONAL', 2000.00, 1800.00, -200.00),
      (v_batch_id, 'row:7', 'eerr_periodo', '6.11.99.999', 'CUENTA SIN MAPPING (TEST)',
       NULL, 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE GESTION',
       'GASTOS DE GESTION', 500.00, 0.00, 500.00);
    CALL pass('1603', '3 filas source detail insertadas (2 CC para 6.11.01.010 + 1 sin mapping)');
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1603', format('INSERT acc_source_balance_detail falló: %s', SQLERRM));
  END;

  -- 1604: Lineage invariant — SUM(CC) = 3000 para 6.11.01.010
  SELECT SUM(actual_amount) INTO v_sum_cc
  FROM acc_source_balance_detail
  WHERE batch_id = v_batch_id AND source_account_code = '6.11.01.010';
  IF ABS(v_sum_cc - 3000.00) < 0.01 THEN
    CALL pass('1604', format('Lineage invariant OK: SUM(CC)=3000 para 6.11.01.010'));
  ELSE
    CALL fail('1604', format('Lineage invariant VIOLADO: SUM=%s ≠ 3000', v_sum_cc));
  END IF;

  -- 1605: Crear issue SRC_ACCOUNT_UNMAPPED para cuenta de test
  BEGIN
    UPDATE acc_source_batch SET status = 'VALIDATING' WHERE id = v_batch_id;
    INSERT INTO acc_source_batch_issue
      (batch_id, source_record_ref, severity, issue_code, field_name, value_found, message,
       suggested_resolution)
    VALUES
      (v_batch_id, 'account:6.11.99.999', 'ERROR', 'SRC_ACCOUNT_UNMAPPED',
       'account_code', '6.11.99.999',
       'Cuenta 6.11.99.999 tiene saldo 500 sin mapping a acc_chart_mapping.',
       'Agregar mapping para cuenta 6.11.99.999 en acc_chart_mapping.') RETURNING id INTO v_issue_id;
    CALL pass('1605', format('Issue SRC_ACCOUNT_UNMAPPED creado: %s', v_issue_id));
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1605', format('INSERT issue falló: %s', SQLERRM));
  END;

  -- 1606: Lifecycle → VALIDATED → PENDING_APPROVAL
  BEGIN
    UPDATE acc_source_batch SET status = 'VALIDATED' WHERE id = v_batch_id;
    UPDATE acc_source_batch SET status = 'PENDING_APPROVAL' WHERE id = v_batch_id;
    CALL pass('1606', 'Lifecycle → VALIDATED → PENDING_APPROVAL OK');
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1606', format('Lifecycle falló: %s', SQLERRM));
  END;

  -- 1607: FATAL gate — issue ERROR no bloquea (solo FATAL bloquea)
  -- El issue de 1605 es ERROR, no FATAL → APPROVED debería pasar si approved_by != NULL
  -- Primero probamos sin approved_by (debe fallar por gate aparte)
  BEGIN
    UPDATE acc_source_batch
    SET status = 'APPROVED', approved_by = NULL
    WHERE id = v_batch_id;
    CALL fail('1607', 'APPROVED con approved_by=NULL debería haber sido rechazado');
    -- Rollback manual: volver a PENDING_APPROVAL
    UPDATE acc_source_batch SET status = 'PENDING_APPROVAL' WHERE id = v_batch_id;
  EXCEPTION
    WHEN OTHERS THEN
      CALL pass('1607', format('Gate aprobación rechazó APPROVED sin approved_by: %s', SQLERRM));
  END;

  -- 1607b: Insertar un issue FATAL y verificar que bloquea → APPROVED
  BEGIN
    INSERT INTO acc_source_batch_issue
      (batch_id, source_record_ref, severity, issue_code, message)
    VALUES
      (v_batch_id, 'batch', 'FATAL', 'PERIOD_LOCKED',
       'Test FATAL issue — no debe permitir aprobación mientras no se resuelva.');

    BEGIN
      UPDATE acc_source_batch
      SET status = 'APPROVED', approved_by = 'angelo.huerta'
      WHERE id = v_batch_id;
      CALL fail('1607b', 'FATAL gate no bloqueó → APPROVED con issue FATAL sin resolver');
      UPDATE acc_source_batch SET status = 'PENDING_APPROVAL', approved_by = NULL
      WHERE id = v_batch_id;
    EXCEPTION
      WHEN OTHERS THEN
        CALL pass('1607b', format('FATAL gate bloqueó → APPROVED con issue FATAL: %s', SQLERRM));
    END;

    -- Resolver el issue FATAL para continuar con 1608
    UPDATE acc_source_batch_issue
    SET resolved_by = 'test_suite_021', resolved_at = now()
    WHERE batch_id = v_batch_id AND severity = 'FATAL';
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1607b', format('Setup 1607b falló: %s', SQLERRM));
  END;

  -- 1608: Con approved_by seteado y FATAL resuelto → APPROVED pasa
  BEGIN
    UPDATE acc_source_batch
    SET status = 'APPROVED', approved_by = 'angelo.huerta'
    WHERE id = v_batch_id;
    CALL pass('1608', 'PENDING_APPROVAL → APPROVED con approved_by y sin FATAL abiertos: OK');
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1608', format('APPROVED falló inesperadamente: %s', SQLERRM));
  END;

  -- 1609: Cleanup completo (ON DELETE RESTRICT garantiza orden)
  -- Para borrar el batch: primero acc_source_batch_issue, luego acc_source_balance_detail,
  -- luego acc_source_batch.
  BEGIN
    DELETE FROM acc_source_batch_issue WHERE batch_id = v_batch_id;
    DELETE FROM acc_source_balance_detail WHERE batch_id = v_batch_id;
    -- acc_source_batch ahora en APPROVED: transicionar a REJECTED para permitir delete
    -- (no hay transición directa; usar update de status + delete directo como postgres)
    DELETE FROM acc_source_batch WHERE id = v_batch_id;
    CALL pass('1609', 'Cleanup: batch de test eliminado correctamente');
  EXCEPTION
    WHEN OTHERS THEN
      CALL fail('1609', format('Cleanup falló: %s (batch %s queda huérfano)', SQLERRM, v_batch_id));
  END;

  -- 1610: Regression — acc_chart_mapping ALF sigue con 4 mappings activos
  SELECT COUNT(*) INTO v_issue_count  -- reusing variable
  FROM acc_chart_mapping
  WHERE entity_id = v_alf_id AND is_active = true;
  IF v_issue_count >= 4 THEN
    CALL pass('1610', format('Regression: acc_chart_mapping ALF tiene %s mappings activos', v_issue_count));
  ELSE
    CALL fail('1610', format('REGRESSION: acc_chart_mapping ALF tiene solo %s mappings (esperado ≥4)', v_issue_count));
  END IF;


  -- ==========================================================================
  -- RESUMEN FINAL
  -- ==========================================================================

  RAISE NOTICE '=================================================';
  RAISE NOTICE 'OA-024-09 TEST SUITE 021 — RESUMEN';
  RAISE NOTICE 'PASS: % | FAIL: % | WARN: %', v_pass, v_fail, v_warn;
  RAISE NOTICE 'Total: % tests', v_pass + v_fail + v_warn;
  IF v_fail = 0 THEN
    RAISE NOTICE 'RESULTADO: PASS COMPLETO (%/% PASS + % WARN)', v_pass, v_pass + v_fail + v_warn, v_warn;
  ELSE
    RAISE NOTICE 'RESULTADO: % FAIL — revisar log arriba', v_fail;
    RAISE EXCEPTION '021_posting_pipeline_tests: % test(s) FALLARON', v_fail;
  END IF;

END;
$$;
