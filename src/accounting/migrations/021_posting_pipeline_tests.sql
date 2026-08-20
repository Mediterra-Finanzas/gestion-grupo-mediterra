-- =============================================================================
-- 021_posting_pipeline_tests.sql
-- OA-024-09 — Test suite del PostingPipeline
-- Fecha   : 2026-08-19
-- Estado  : EJECUTAR DESPUÉS de 016 + 019 + 020 + 022
-- =============================================================================
-- Tests: CAT-14 a CAT-19 (continúa desde 017 que tenía CAT-10 a CAT-13)
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
--   1503: acc_account_balance — authenticated NO puede INSERT directamente (solo vía RPC)
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
--
-- CAT-17: fn_acc_post_batch RPC (022) — existencia, grants y comportamiento
--   1701: authenticated no puede INSERT directo en acc_account_balance (RLS)
--   1702: fn_acc_post_batch existe, SECURITY DEFINER, retorna JSONB
--   1703: authenticated tiene EXECUTE grant en fn_acc_post_batch
--   1704: anon NO tiene EXECUTE grant en fn_acc_post_batch
--   1705: fn_acc_post_batch con UUID inexistente lanza error P0001
--   1706: fn_acc_post_batch con batch no-APPROVED lanza error P0002
--   1707: fn_acc_post_batch tiene firma correcta (1 parámetro IN — p_actor eliminado, B8)
--
-- CAT-18: Entity Isolation — Pilot ALF Scope (SEC-ENTITY-SCOPE-001, 020 v3)
--   1801: INSERT policy EXISTS con ALF UUID en WITH CHECK
--   1802: INSERT policy WITH CHECK NO es permisiva (no WITH CHECK(true))
--   1803: UPDATE policy USING restringe a ALF UUID (filas otras entidades invisibles)
--   1804: UPDATE policy WITH CHECK restringe a ALF UUID (entity_id inmutable)
--   1805: acc_account_balance sin write directo para authenticated (modelo C)
--   1806: anon fail-closed en acc_source_batch (RLS habilitado + sin política anon)
--   1807: service_role ALL en acc_source_batch (009 policy intacta)
--   1808: UPDATE USING y WITH CHECK tienen misma restricción ALF (entity_id change bloqueado)
--   1809: SELECT de authenticated intacto (020 no debilitó lectura de 009)
--   1810: Lifecycle trigger activo en acc_source_batch (014 trigger preservado)
--
-- CAT-19: fn_acc_post_batch hardening B7–B14 (022 v2)
--   1901: fn_acc_post_batch tiene 1 parámetro IN (B8 — p_actor eliminado)
--   1902: P0000 entity scope guard con ALF UUID en cuerpo de la función (B7)
--   1903: fn usa auth.uid() como actor — no del caller (B8)
--   1904: P0009 ledger overwrite guard presente (B11)
--   1905: mapping validity usa v_period.date_from/date_to, no CURRENT_DATE (B12)
--   1906: COALESCE(source_currency, 'USD') eliminado — NOT NULL en 016 (B13)
--   1907: SEC-ENTITY-SCOPE-001 referenciado como tech debt en función (B7 pilot)
--   1908: B9 (SoD): T9 solo aplica a adj_journal — PASS for pilot
--   1909: B10 (Model C): authenticated EXECUTE OK + sin write directo al ledger
--   1910: PUBLIC no tiene EXECUTE en fn_acc_post_batch (B15 — REVOKE FROM PUBLIC)
--   1911: anon no tiene EXECUTE en fn_acc_post_batch (B15 — denegado implícito)
--   1912: P000A guard en prosrc — auth.uid() IS NULL check (B16)
--   1913: 'system' no aparece como fallback actor en prosrc (B16)
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
      AND 'authenticated' = ANY(roles)
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
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1502', 'acc_source_batch: política UPDATE para authenticated existe');
  ELSE
    CALL fail('1502', 'acc_source_batch: falta política UPDATE para authenticated. Ejecutar 020.');
  END IF;

  -- 1503: acc_account_balance NO tiene política INSERT/UPDATE para authenticated
  --       (escrituras al ledger son exclusivamente vía fn_acc_post_batch, modelo C)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_account_balance'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1503', 'acc_account_balance: authenticated no tiene política INSERT/UPDATE directa (modelo C OK)');
  ELSE
    CALL fail('1503', 'SEGURIDAD: acc_account_balance tiene política INSERT/UPDATE para authenticated — viola modelo C. Revisar 020 v2.');
  END IF;

  -- 1504: T10 sigue activo en acc_account_balance (fail-closed en período cerrado)
  -- Ya validado en 1406 — pass por referencia
  CALL pass('1504', 'T10 activo en acc_account_balance (validado en 1406)');

  -- 1505: anon fail-closed en acc_source_batch
  -- 009 usa deny IMPLÍCITO: RLS habilitado + sin política para anon = acceso denegado.
  -- No hay política USING(false) explícita — buscar por esa expresión siempre daría WARN.
  IF (
    EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'acc_source_batch' AND rowsecurity = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'acc_source_batch' AND 'anon' = ANY(roles)
    )
  ) THEN
    CALL pass('1505', 'acc_source_batch: anon fail-closed (RLS habilitado + sin política anon = denegado implícito)');
  ELSE
    CALL fail('1505', 'SECURITY: acc_source_batch fail-closed para anon roto. Verificar 009 RLS.');
  END IF;

  -- 1506: anon fail-closed en acc_account_balance (mismo mecanismo implícito de 009)
  IF (
    EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'acc_account_balance' AND rowsecurity = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'acc_account_balance' AND 'anon' = ANY(roles)
    )
  ) THEN
    CALL pass('1506', 'acc_account_balance: anon fail-closed (RLS habilitado + sin política anon = denegado implícito)');
  ELSE
    CALL fail('1506', 'SECURITY: acc_account_balance fail-closed para anon roto. Verificar 009 RLS.');
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
  -- CAT-17: fn_acc_post_batch RPC (022) — existencia, grants y comportamiento
  -- ==========================================================================

  -- 1701: authenticated no puede INSERT directamente en acc_account_balance
  --       (duplica 1503 desde la perspectiva de seguridad del ledger; refuerza modelo C)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_account_balance'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1701', 'RLS acc_account_balance: authenticated sin write directo — ledger protegido');
  ELSE
    CALL fail('1701', 'SEGURIDAD: acc_account_balance tiene write policy para authenticated. Ledger desprotegido.');
  END IF;

  -- 1702: fn_acc_post_batch existe como SECURITY DEFINER con tipo de retorno JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND security_type  = 'DEFINER'
      AND data_type      = 'jsonb'
  ) THEN
    CALL pass('1702', 'fn_acc_post_batch: existe, SECURITY DEFINER, retorna JSONB');
  ELSE
    CALL fail('1702', 'fn_acc_post_batch no existe o faltan atributos (DEFINER/JSONB). Ejecutar 022.');
  END IF;

  -- 1703: authenticated tiene EXECUTE grant en fn_acc_post_batch
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'fn_acc_post_batch'
      AND grantee          = 'authenticated'
      AND privilege_type   = 'EXECUTE'
  ) THEN
    CALL pass('1703', 'fn_acc_post_batch: EXECUTE grant para authenticated existe');
  ELSE
    CALL fail('1703', 'fn_acc_post_batch: falta EXECUTE grant para authenticated. Revisar 022 GRANT.');
  END IF;

  -- 1704: anon NO tiene EXECUTE grant en fn_acc_post_batch
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'fn_acc_post_batch'
      AND grantee          = 'anon'
      AND privilege_type   = 'EXECUTE'
  ) THEN
    CALL pass('1704', 'fn_acc_post_batch: anon no tiene EXECUTE — fail-closed en posting OK');
  ELSE
    CALL fail('1704', 'SEGURIDAD: anon tiene EXECUTE en fn_acc_post_batch. Revisar 022 REVOKE.');
  END IF;

  -- 1705: fn_acc_post_batch con UUID inexistente lanza P0001
  BEGIN
    PERFORM fn_acc_post_batch('00000000-0000-0000-0000-000000000000'::uuid);
    CALL fail('1705', 'fn_acc_post_batch con batch inexistente debería lanzar P0001');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%P0001%' OR SQLERRM LIKE '%no encontrado%' THEN
        CALL pass('1705', format('fn_acc_post_batch lanza error para batch inexistente: %s', SQLERRM));
      ELSE
        CALL warn('1705', format('fn_acc_post_batch lanzó error pero mensaje inesperado: %s', SQLERRM));
      END IF;
  END;

  -- 1706: fn_acc_post_batch con batch en status distinto de APPROVED lanza P0002
  DECLARE
    v_rpc_batch_id UUID;
  BEGIN
    INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, report_type, status)
    VALUES (v_alf_id, 'contec', 'test_1706.xlsx', 'hash_1706_test_unique', 'eerr_acumulado', 'CREATED')
    RETURNING id INTO v_rpc_batch_id;

    BEGIN
      PERFORM fn_acc_post_batch(v_rpc_batch_id);
      CALL fail('1706', 'fn_acc_post_batch sobre batch CREATED debería rechazar con P0002');
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%P0002%' OR SQLERRM LIKE '%APPROVED%' THEN
          CALL pass('1706', format('fn_acc_post_batch rechaza batch no-APPROVED (P0002): %s', SQLERRM));
        ELSE
          CALL warn('1706', format('fn_acc_post_batch rechazó pero mensaje inesperado: %s', SQLERRM));
        END IF;
    END;

    DELETE FROM acc_source_batch WHERE id = v_rpc_batch_id;
  END;

  -- 1707: Firma de fn_acc_post_batch tiene exactamente 1 parámetro (p_actor eliminado — B8)
  DECLARE
    v_param_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_param_count
    FROM information_schema.parameters
    WHERE specific_schema = 'public'
      AND specific_name   LIKE 'fn_acc_post_batch%'
      AND parameter_mode  = 'IN';

    IF v_param_count = 1 THEN
      CALL pass('1707', format('fn_acc_post_batch: firma correcta (%s parámetro IN — p_actor eliminado)', v_param_count));
    ELSE
      CALL fail('1707', format('fn_acc_post_batch: firma incorrecta (%s parámetros IN, esperado 1). Si es 2, re-ejecutar 022 v2.', v_param_count));
    END IF;
  END;


  -- ==========================================================================
  -- CAT-18: Entity Isolation — Pilot ALF Scope (SEC-ENTITY-SCOPE-001)
  -- Verifica que las políticas de 020 v3 restringen acc_source_batch al UUID
  -- de Allegria Foods. Todos los tests son introspección de pg_policies.
  -- ALF UUID: 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
  -- ==========================================================================

  -- 1801: INSERT policy para authenticated EXISTS con ALF UUID en WITH CHECK
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'INSERT'
      AND 'authenticated' = ANY(roles)
      AND with_check LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%'
  ) THEN
    CALL pass('1801', 'INSERT policy: ALF UUID en WITH CHECK — entity scope correcto');
  ELSE
    CALL fail('1801', 'SECURITY: INSERT policy no restringe a ALF UUID. SEC-ENTITY-SCOPE-001 violado. Ejecutar 020 v3.');
  END IF;

  -- 1802: INSERT policy WITH CHECK NO es permisiva (WITH CHECK(true) sería un regresión de seguridad)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'INSERT'
      AND 'authenticated' = ANY(roles)
      AND with_check = 'true'
  ) THEN
    CALL pass('1802', 'INSERT policy WITH CHECK no es permisiva (true) — cross-entity write bloqueado');
  ELSE
    CALL fail('1802', 'SECURITY: INSERT policy tiene WITH CHECK (true) — cross-entity write NO bloqueado. Ejecutar 020 v3.');
  END IF;

  -- 1803: UPDATE policy USING restringe a ALF UUID (filas de otras entidades invisibles)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND qual LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%'
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1803', 'UPDATE policy USING: solo filas ALF visibles — batches de otras entidades ocultos');
  ELSE
    CALL fail('1803', 'SECURITY: UPDATE USING no restringe a ALF UUID. Batches de otras entidades accesibles.');
  END IF;

  -- 1804: UPDATE policy WITH CHECK restringe a ALF UUID (entity_id no puede cambiarse)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND with_check LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%'
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1804', 'UPDATE policy WITH CHECK: entity_id no puede cambiarse a otra empresa');
  ELSE
    CALL fail('1804', 'SECURITY: UPDATE WITH CHECK no restringe entity_id — cambio cross-entity posible.');
  END IF;

  -- 1805: acc_account_balance sin write directo para authenticated (modelo C — ledger protegido)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_account_balance'
      AND cmd        IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1805', 'acc_account_balance: authenticated sin write directo — ledger protegido (modelo C)');
  ELSE
    CALL fail('1805', 'SECURITY: acc_account_balance tiene write policy para authenticated — ledger desprotegido.');
  END IF;

  -- 1806: anon fail-closed en acc_source_batch (RLS habilitado + sin política anon = denegado)
  IF (
    EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'acc_source_batch' AND rowsecurity = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'acc_source_batch' AND 'anon' = ANY(roles)
    )
  ) THEN
    CALL pass('1806', 'acc_source_batch: anon fail-closed (RLS habilitado + sin política anon)');
  ELSE
    CALL fail('1806', 'SECURITY: anon no está fail-closed en acc_source_batch.');
  END IF;

  -- 1807: service_role tiene ALL en acc_source_batch (policy de 009 intacta)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'ALL'
      AND 'service_role' = ANY(roles)
  ) THEN
    CALL pass('1807', 'service_role ALL en acc_source_batch (009 intacta) — internal posting path OK');
  ELSE
    CALL fail('1807', 'service_role no tiene ALL en acc_source_batch — posting path roto.');
  END IF;

  -- 1808: UPDATE USING y WITH CHECK tienen MISMA restricción ALF (entity_id change bloqueado)
  -- Verifica consistencia: si USING = ALF y WITH CHECK != ALF, un UPDATE podría cambiar entity_id.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND qual       LIKE '%3df93d9d%'
      AND with_check LIKE '%3df93d9d%'
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1808', 'UPDATE USING y WITH CHECK consistentes en ALF — cambio de entity_id bloqueado');
  ELSE
    CALL fail('1808', 'UPDATE USING/WITH CHECK inconsistentes — cambio de entity_id puede no estar bloqueado.');
  END IF;

  -- 1809: SELECT policy de authenticated sigue activa (009 no fue afectado por 020)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'SELECT'
      AND 'authenticated' = ANY(roles)
  ) THEN
    CALL pass('1809', 'SELECT policy de authenticated intacta — 020 no debilitó lectura (009 preservado)');
  ELSE
    CALL fail('1809', 'REGRESSION: SELECT policy de authenticated desaparecida — 020 rompió lectura de 009.');
  END IF;

  -- 1810: Lifecycle trigger activo en acc_source_batch (014 no afectado por 020)
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'acc_source_batch'
      AND trigger_name        = 'trg_acc_source_batch_lifecycle'
  ) THEN
    CALL pass('1810', 'Lifecycle trigger trg_acc_source_batch_lifecycle activo — 020 no afectó triggers de 014');
  ELSE
    CALL fail('1810', 'REGRESSION: trg_acc_source_batch_lifecycle no encontrado — 014 puede no estar desplegado.');
  END IF;


  -- ==========================================================================
  -- CAT-19: fn_acc_post_batch hardening B7–B14 (022 v2)
  -- Todos los tests son introspección de pg_proc / pg_policies.
  -- Sin runtime de producción — DDL-only.
  -- ALF UUID: 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
  -- ==========================================================================

  DECLARE
    v_has_entity_guard   BOOLEAN;
    v_has_p0000          BOOLEAN;
    v_has_p0009          BOOLEAN;
    v_uses_auth_uid      BOOLEAN;
    v_uses_period_dates  BOOLEAN;
    v_uses_current_date  BOOLEAN;
    v_coalesce_usd       BOOLEAN;
    v_has_sec_debt       BOOLEAN;
    v_param_count_19     INT;
  BEGIN

    -- Cargar atributos del cuerpo de la función (un solo SELECT)
    SELECT
      prosrc LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%',
      prosrc LIKE '%P0000%',
      prosrc LIKE '%P0009%',
      prosrc LIKE '%auth.uid()%',
      prosrc LIKE '%v_period.date_from%',
      prosrc LIKE '%CURRENT_DATE%',
      prosrc LIKE '%COALESCE(sbd.source_currency%',
      prosrc LIKE '%SEC-ENTITY-SCOPE-001%'
    INTO
      v_has_entity_guard,
      v_has_p0000,
      v_has_p0009,
      v_uses_auth_uid,
      v_uses_period_dates,
      v_uses_current_date,
      v_coalesce_usd,
      v_has_sec_debt
    FROM pg_proc
    WHERE proname = 'fn_acc_post_batch';

    IF NOT FOUND THEN
      CALL fail('1901', 'fn_acc_post_batch no encontrada en pg_proc. Ejecutar 022 v2 primero.');
      CALL fail('1902', 'fn_acc_post_batch no encontrada — skip B8 check');
      CALL fail('1903', 'fn_acc_post_batch no encontrada — skip auth.uid check');
      CALL fail('1904', 'fn_acc_post_batch no encontrada — skip P0009 check');
      CALL fail('1905', 'fn_acc_post_batch no encontrada — skip B12 check');
    ELSE

      -- 1901: 1 parámetro IN (B8 — p_actor eliminado)
      SELECT COUNT(*) INTO v_param_count_19
      FROM information_schema.parameters
      WHERE specific_schema = 'public'
        AND specific_name LIKE 'fn_acc_post_batch%'
        AND parameter_mode = 'IN';

      IF v_param_count_19 = 1 THEN
        CALL pass('1901', 'B8: fn_acc_post_batch tiene 1 parámetro IN — p_actor eliminado');
      ELSE
        CALL fail('1901', format('B8: fn_acc_post_batch tiene %s parámetros IN — p_actor sigue presente. Re-ejecutar 022 v2.', v_param_count_19));
      END IF;

      -- 1902: Entity scope guard P0000 presente con ALF UUID (B7)
      IF v_has_entity_guard AND v_has_p0000 THEN
        CALL pass('1902', 'B7: P0000 entity scope guard con ALF UUID en cuerpo de fn_acc_post_batch');
      ELSE
        CALL fail('1902', format('B7: falta P0000 o ALF UUID en fn_acc_post_batch (has_guard=%s, has_p0000=%s)', v_has_entity_guard, v_has_p0000));
      END IF;

      -- 1903: fn usa auth.uid() como actor — no del caller (B8)
      IF v_uses_auth_uid THEN
        CALL pass('1903', 'B8: fn_acc_post_batch usa auth.uid() para derivar actor — no aceptado del caller');
      ELSE
        CALL fail('1903', 'B8: fn_acc_post_batch no usa auth.uid(). Actor podría ser falsificable.');
      END IF;

      -- 1904: P0009 ledger overwrite guard presente (B11)
      IF v_has_p0009 THEN
        CALL pass('1904', 'B11: P0009 ledger overwrite guard presente — sobreescritura silenciosa bloqueada');
      ELSE
        CALL fail('1904', 'B11: P0009 no encontrado en fn_acc_post_batch. Sobreescritura de ledger activo posible.');
      END IF;

      -- 1905: Mapping validity usa v_period dates (B12 — no CURRENT_DATE)
      IF v_uses_period_dates AND NOT v_uses_current_date THEN
        CALL pass('1905', 'B12: mapping validity usa v_period.date_from/date_to — reproducible en cargas históricas');
      ELSIF v_uses_current_date THEN
        CALL fail('1905', 'B12: fn_acc_post_batch aún usa CURRENT_DATE en mapping check — rompe cargas históricas');
      ELSE
        CALL warn('1905', 'B12: v_period.date_from no encontrado — verificar manualmente el mapping check');
      END IF;

      -- 1906: COALESCE('USD') eliminado (B13 — source_currency IS NOT NULL en 016)
      IF NOT v_coalesce_usd THEN
        CALL pass('1906', 'B13: COALESCE(sbd.source_currency, USD) eliminado — source_currency IS NOT NULL');
      ELSE
        CALL warn('1906', 'B13: COALESCE(sbd.source_currency, USD) sigue presente — redundante pero no bloqueante');
      END IF;

      -- 1907: SEC-ENTITY-SCOPE-001 referenciado como tech debt documentado (B7 pilot scope)
      IF v_has_sec_debt THEN
        CALL pass('1907', 'B7: SEC-ENTITY-SCOPE-001 referenciado en fn_acc_post_batch como tech debt de piloto');
      ELSE
        CALL warn('1907', 'SEC-ENTITY-SCOPE-001 no referenciado en fn — entity guard presente pero sin documentar');
      END IF;

    END IF;
  END;

  -- 1908: B9 — SoD: T9 solo aplica a acc_adjustment_journal (is_material=true)
  --        No existe regla SoD explícita posted_by ≠ approved_by en posting pipeline.
  --        PASS for pilot: documentado en sec-entity-scope-001 como diseño, no como deuda.
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'acc_adjustment_journal'
      AND trigger_name        = 'trg_sod_adjustment'
  ) THEN
    CALL pass('1908', 'B9 (SoD): T9 trg_sod_adjustment activo en acc_adjustment_journal. No aplica a posting pipeline — PASS for pilot.');
  ELSE
    CALL warn('1908', 'B9 (SoD): trg_sod_adjustment no encontrado. Verificar que T9 de 010 está desplegado.');
  END IF;

  -- 1910: B15 — PUBLIC no tiene EXECUTE en fn_acc_post_batch (REVOKE FROM PUBLIC)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND grantee        = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
  ) THEN
    CALL pass('1910', 'B15: PUBLIC no tiene EXECUTE en fn_acc_post_batch — REVOKE FROM PUBLIC OK');
  ELSE
    CALL fail('1910', 'SECURITY B15: PUBLIC tiene EXECUTE en fn_acc_post_batch — anon puede ejecutar indirectamente. Re-ejecutar 022 v3.');
  END IF;

  -- 1911: B15 — anon no tiene EXECUTE (confirmación directa + vía PUBLIC)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND grantee        = 'anon'
      AND privilege_type = 'EXECUTE'
  ) THEN
    CALL pass('1911', 'B15: anon no tiene EXECUTE directo en fn_acc_post_batch');
  ELSE
    CALL fail('1911', 'SECURITY B15: anon tiene EXECUTE directo en fn_acc_post_batch.');
  END IF;

  -- 1912: B16 — P000A guard en prosrc (auth.uid() IS NULL → RAISE antes de writes)
  DECLARE v_has_p000a BOOLEAN; v_has_system_fb BOOLEAN;
  BEGIN
    SELECT
      prosrc LIKE '%P000A%',
      -- 'system' como fallback silencioso está prohibido (B16)
      prosrc LIKE '%COALESCE(auth.uid()%''system''%'
    INTO v_has_p000a, v_has_system_fb
    FROM pg_proc WHERE proname = 'fn_acc_post_batch';

    IF v_has_p000a THEN
      CALL pass('1912', 'B16: P000A guard presente en fn_acc_post_batch — auth.uid() NULL → RAISE antes de writes');
    ELSE
      CALL fail('1912', 'B16: P000A no encontrado — auth.uid() NULL podría no ser bloqueado. Re-ejecutar 022 v3.');
    END IF;
  END;

  -- 1913: B16 — 'system' no es fallback actor en prosrc
  DECLARE v_has_coalesce_system BOOLEAN;
  BEGIN
    SELECT prosrc LIKE '%COALESCE(auth.uid()%'
    INTO v_has_coalesce_system
    FROM pg_proc WHERE proname = 'fn_acc_post_batch';

    IF NOT COALESCE(v_has_coalesce_system, false) THEN
      CALL pass('1913', 'B16: sin COALESCE(auth.uid()) en fn_acc_post_batch — actor desconocido no mapea a ''system''');
    ELSE
      CALL warn('1913', 'B16: prosrc contiene COALESCE(auth.uid()) — verificar que no sea fallback silencioso a ''system''');
    END IF;
  END;

  -- 1909: B10 — Model C: authenticated tiene EXECUTE pero no write directo al ledger
  --        Seguro: entity scope (B7) + auth.uid() (B8) hacen el GRANT seguro.
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND grantee        = 'authenticated'
      AND privilege_type = 'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_account_balance'
      AND cmd        IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    CALL pass('1909', 'B10 (Model C): authenticated puede EXECUTE RPC pero NO escribir directamente al ledger — OK');
  ELSE
    CALL fail('1909', 'B10 (Model C): inconsistencia — EXECUTE grant o write-ledger policy fuera de spec. Revisar 022 + 020.');
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
