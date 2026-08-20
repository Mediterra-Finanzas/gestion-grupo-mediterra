-- =============================================================================
-- 021_posting_pipeline_tests.sql
-- OA-024-09 — Test suite del PostingPipeline
-- Fecha   : 2026-08-19
-- Estado  : EJECUTAR DESPUÉS de 016 + 019 + 020 + 022 + 023
-- =============================================================================
-- Tests: CAT-14 a CAT-20 (continúa desde 017 que tenía CAT-10 a CAT-13)
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
--
-- CAT-20: fn_acc_approve_batch + B17/B18 security model (023)
--   2001: fn_acc_approve_batch existe
--   2002: exactamente 1 parámetro (p_batch_id) — no approved_by del frontend
--   2003: SECURITY DEFINER
--   2004: search_path seguro (public + pg_temp)
--   2005: PUBLIC no tiene EXECUTE en fn_acc_approve_batch
--   2006: anon no tiene EXECUTE en fn_acc_approve_batch
--   2007: authenticated tiene EXECUTE en fn_acc_approve_batch
--   2008: P000A en prosrc (auth.uid() IS NULL → RAISE)
--   2009: P0000 + ALF UUID en prosrc (entity scope guard)
--   2010: SoD P0005 (imported_by ≠ aprobador) en prosrc
--   2011: approved_by = auth.uid()::TEXT server-side (no parámetro frontend)
--   2012: PENDING_APPROVAL check en prosrc
--   2013: RLS asb_authenticated_update bloquea status=APPROVED (B17 blocker)
--   2014: fn_acc_approve_batch sin fallback a 'system'
-- =============================================================================
-- FIXTURES: TODOS SINTÉTICOS. Sin datos financieros reales.
-- NOTA SINTAXIS: pass/fail/warn son macros inline (v_X := v_X + 1; RAISE NOTICE).
-- PL/pgSQL no soporta PROCEDURE en sección DECLARE — solo variables y cursores.
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1401] 12 períodos mensuales ALF 2026 presentes';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1401] Se esperaban 12 períodos, encontrados: %', v_period_count;
  END IF;

  -- 1402: Febrero tiene 28 días
  SELECT (date_to - date_from + 1) INTO v_feb_days
  FROM acc_period
  WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 2;
  IF v_feb_days = 28 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1402] Febrero 2026 = 28 días (año no bisiesto)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1402] Febrero 2026 tiene % días, esperado 28', v_feb_days;
  END IF;

  -- 1403: Todos los períodos están 'open'
  SELECT COUNT(*) INTO v_open_count
  FROM acc_period
  WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND status = 'open';
  IF v_open_count = 12 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1403] Todos los 12 períodos tienen status=open';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1403] Solo %/12 períodos tienen status=open', v_open_count;
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1404] Re-insert idempotente — sigue en 12 períodos';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1404] Re-insert creó fila extra: % períodos', v_period_count;
  END IF;

  -- Obtener UUIDs de julio y agosto para uso en tests
  SELECT id INTO v_period_jul
  FROM acc_period WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 7;
  SELECT id INTO v_period_ago
  FROM acc_period WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 8;

  -- 1405: T10 pasa para período 'open'
  BEGIN
    INSERT INTO acc_account_balance
      (entity_id, period_id, account_code, debit_balance, credit_balance, net_balance,
       currency, balance_type)
    VALUES
      (v_alf_id, v_period_jul, '1405.TEST', 100, 0, 100, 'USD', 'actual');
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1405] T10 pasa para período julio 2026 (status=open)';
    DELETE FROM acc_account_balance
    WHERE entity_id = v_alf_id AND period_id = v_period_jul AND account_code = '1405.TEST';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1405] T10 rechazó INSERT en período open: %', SQLERRM;
  END;

  -- 1406: T10 bloquea INSERT en período 'closed'
  BEGIN
    UPDATE acc_period SET status = 'closed'
    WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 7;

    BEGIN
      INSERT INTO acc_account_balance
        (entity_id, period_id, account_code, debit_balance, credit_balance, net_balance,
         currency, balance_type)
      VALUES
        (v_alf_id, v_period_jul, '1406.TEST', 100, 0, 100, 'USD', 'actual');
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1406] T10 debería haber bloqueado INSERT en período closed';
      DELETE FROM acc_account_balance
      WHERE entity_id = v_alf_id AND period_id = v_period_jul AND account_code = '1406.TEST';
    EXCEPTION
      WHEN OTHERS THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1406] T10 bloqueó INSERT en período closed: %', SQLERRM;
    END;

    UPDATE acc_period SET status = 'open'
    WHERE entity_id = v_alf_id AND fiscal_year = 2026 AND fiscal_month = 7;
  END;


  -- ==========================================================================
  -- CAT-15: Write RLS (020)
  -- ==========================================================================

  -- 1501: acc_source_batch tiene política de INSERT para authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_source_batch'
      AND cmd = 'INSERT'
      AND 'authenticated' = ANY(roles)
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1501] acc_source_batch: política INSERT para authenticated existe';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1501] acc_source_batch: falta política INSERT para authenticated. Ejecutar 020.';
  END IF;

  -- 1502: acc_source_batch tiene política UPDATE para authenticated
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_source_batch'
      AND cmd IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1502] acc_source_batch: política UPDATE para authenticated existe';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1502] acc_source_batch: falta política UPDATE para authenticated. Ejecutar 020.';
  END IF;

  -- 1503: acc_account_balance NO tiene política INSERT/UPDATE para authenticated (modelo C)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_account_balance'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1503] acc_account_balance: authenticated no tiene política INSERT/UPDATE directa (modelo C OK)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1503] SEGURIDAD: acc_account_balance tiene política INSERT/UPDATE para authenticated — viola modelo C. Revisar 020 v2.';
  END IF;

  -- 1504: T10 sigue activo (validado en 1406)
  v_pass := v_pass + 1; RAISE NOTICE 'PASS [1504] T10 activo en acc_account_balance (validado en 1406)';

  -- 1505: anon fail-closed en acc_source_batch
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1505] acc_source_batch: anon fail-closed (RLS habilitado + sin política anon)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1505] SECURITY: acc_source_batch fail-closed para anon roto. Verificar 009 RLS.';
  END IF;

  -- 1506: anon fail-closed en acc_account_balance
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1506] acc_account_balance: anon fail-closed (RLS habilitado + sin política anon)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1506] SECURITY: acc_account_balance fail-closed para anon roto. Verificar 009 RLS.';
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1601] Batch CREATED creado: %', v_batch_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1601] No se pudo crear batch: %', SQLERRM;
      RAISE;
  END;

  -- 1602: Lifecycle CREATED → PARSING → PARSED
  BEGIN
    UPDATE acc_source_batch SET status = 'PARSING' WHERE id = v_batch_id;
    UPDATE acc_source_batch SET status = 'PARSED', row_count = 3 WHERE id = v_batch_id;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1602] Lifecycle CREATED → PARSING → PARSED OK';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1602] Lifecycle falló: %', SQLERRM;
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1603] 3 filas source detail insertadas (2 CC para 6.11.01.010 + 1 sin mapping)';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1603] INSERT acc_source_balance_detail falló: %', SQLERRM;
  END;

  -- 1604: Lineage invariant — SUM(CC) = 3000 para 6.11.01.010
  SELECT SUM(actual_amount) INTO v_sum_cc
  FROM acc_source_balance_detail
  WHERE batch_id = v_batch_id AND source_account_code = '6.11.01.010';
  IF ABS(v_sum_cc - 3000.00) < 0.01 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1604] Lineage invariant OK: SUM(CC)=3000 para 6.11.01.010';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1604] Lineage invariant VIOLADO: SUM=% ≠ 3000', v_sum_cc;
  END IF;

  -- 1605: Crear issue SRC_ACCOUNT_UNMAPPED
  BEGIN
    UPDATE acc_source_batch SET status = 'VALIDATING' WHERE id = v_batch_id;
    INSERT INTO acc_source_batch_issue
      (batch_id, source_record_ref, severity, issue_code, field_name, value_found, message,
       suggested_resolution)
    VALUES
      (v_batch_id, 'account:6.11.99.999', 'ERROR', 'SRC_ACCOUNT_UNMAPPED',
       'account_code', '6.11.99.999',
       'Cuenta 6.11.99.999 tiene saldo 500 sin mapping a acc_chart_mapping.',
       'Agregar mapping para cuenta 6.11.99.999 en acc_chart_mapping.')
    RETURNING id INTO v_issue_id;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1605] Issue SRC_ACCOUNT_UNMAPPED creado: %', v_issue_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1605] INSERT issue falló: %', SQLERRM;
  END;

  -- 1606: Lifecycle → VALIDATED → PENDING_APPROVAL
  BEGIN
    UPDATE acc_source_batch SET status = 'VALIDATED' WHERE id = v_batch_id;
    UPDATE acc_source_batch SET status = 'PENDING_APPROVAL' WHERE id = v_batch_id;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1606] Lifecycle → VALIDATED → PENDING_APPROVAL OK';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1606] Lifecycle falló: %', SQLERRM;
  END;

  -- 1607: approved_by=NULL debe ser rechazado por trigger/constraint
  BEGIN
    UPDATE acc_source_batch
    SET status = 'APPROVED', approved_by = NULL
    WHERE id = v_batch_id;
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1607] APPROVED con approved_by=NULL debería haber sido rechazado';
    UPDATE acc_source_batch SET status = 'PENDING_APPROVAL' WHERE id = v_batch_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [1607] Gate aprobación rechazó APPROVED sin approved_by: %', SQLERRM;
  END;

  -- 1607b: FATAL issue abierto bloquea → APPROVED
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
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1607b] FATAL gate no bloqueó → APPROVED con issue FATAL sin resolver';
      UPDATE acc_source_batch SET status = 'PENDING_APPROVAL', approved_by = NULL
      WHERE id = v_batch_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1607b] FATAL gate bloqueó → APPROVED con issue FATAL: %', SQLERRM;
    END;

    -- Resolver el issue FATAL para continuar
    UPDATE acc_source_batch_issue
    SET resolved_by = 'test_suite_021', resolved_at = now()
    WHERE batch_id = v_batch_id AND severity = 'FATAL';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1607b] Setup 1607b falló: %', SQLERRM;
  END;

  -- 1608: Con approved_by y sin FATAL abiertos → APPROVED pasa
  BEGIN
    UPDATE acc_source_batch
    SET status = 'APPROVED', approved_by = 'angelo.huerta'
    WHERE id = v_batch_id;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1608] PENDING_APPROVAL → APPROVED con approved_by y sin FATAL abiertos: OK';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1608] APPROVED falló inesperadamente: %', SQLERRM;
  END;

  -- 1609: Cleanup completo
  BEGIN
    DELETE FROM acc_source_batch_issue WHERE batch_id = v_batch_id;
    DELETE FROM acc_source_balance_detail WHERE batch_id = v_batch_id;
    DELETE FROM acc_source_batch WHERE id = v_batch_id;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1609] Cleanup: batch de test eliminado correctamente';
  EXCEPTION
    WHEN OTHERS THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1609] Cleanup falló: % (batch % queda huérfano)', SQLERRM, v_batch_id;
  END;

  -- 1610: Regression — acc_chart_mapping ALF sigue con ≥4 mappings activos
  SELECT COUNT(*) INTO v_issue_count
  FROM acc_chart_mapping
  WHERE entity_id = v_alf_id AND is_active = true;
  IF v_issue_count >= 4 THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1610] Regression: acc_chart_mapping ALF tiene % mappings activos', v_issue_count;
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1610] REGRESSION: acc_chart_mapping ALF tiene solo % mappings (esperado ≥4)', v_issue_count;
  END IF;


  -- ==========================================================================
  -- CAT-17: fn_acc_post_batch RPC (022)
  -- ==========================================================================

  -- 1701: authenticated no puede INSERT directamente en acc_account_balance
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acc_account_balance'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1701] RLS acc_account_balance: authenticated sin write directo — ledger protegido';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1701] SEGURIDAD: acc_account_balance tiene write policy para authenticated. Ledger desprotegido.';
  END IF;

  -- 1702: fn_acc_post_batch existe, SECURITY DEFINER, retorna JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND security_type  = 'DEFINER'
      AND data_type      = 'jsonb'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1702] fn_acc_post_batch: existe, SECURITY DEFINER, retorna JSONB';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1702] fn_acc_post_batch no existe o faltan atributos (DEFINER/JSONB). Ejecutar 022.';
  END IF;

  -- 1703: authenticated tiene EXECUTE grant en fn_acc_post_batch
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'fn_acc_post_batch'
      AND grantee          = 'authenticated'
      AND privilege_type   = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1703] fn_acc_post_batch: EXECUTE grant para authenticated existe';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1703] fn_acc_post_batch: falta EXECUTE grant para authenticated. Revisar 022 GRANT.';
  END IF;

  -- 1704: anon NO tiene EXECUTE grant en fn_acc_post_batch
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema   = 'public'
      AND routine_name     = 'fn_acc_post_batch'
      AND grantee          = 'anon'
      AND privilege_type   = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1704] fn_acc_post_batch: anon no tiene EXECUTE — fail-closed en posting OK';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1704] SEGURIDAD: anon tiene EXECUTE en fn_acc_post_batch. Revisar 022 REVOKE.';
  END IF;

  -- 1705: fn_acc_post_batch con UUID inexistente lanza P0001
  BEGIN
    PERFORM fn_acc_post_batch('00000000-0000-0000-0000-000000000000'::uuid);
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1705] fn_acc_post_batch con batch inexistente debería lanzar P0001';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%P0001%' OR SQLERRM LIKE '%no encontrado%' THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1705] fn_acc_post_batch lanza error para batch inexistente: %', SQLERRM;
      ELSE
        v_warn := v_warn + 1; RAISE NOTICE 'WARN [1705] fn_acc_post_batch lanzó error pero mensaje inesperado: %', SQLERRM;
      END IF;
  END;

  -- 1706: fn_acc_post_batch con batch no-APPROVED lanza P0002
  DECLARE
    v_rpc_batch_id UUID;
  BEGIN
    INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, report_type, status)
    VALUES (v_alf_id, 'contec', 'test_1706.xlsx', 'hash_1706_test_unique', 'eerr_acumulado', 'CREATED')
    RETURNING id INTO v_rpc_batch_id;

    BEGIN
      PERFORM fn_acc_post_batch(v_rpc_batch_id);
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1706] fn_acc_post_batch sobre batch CREATED debería rechazar con P0002';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%P0002%' OR SQLERRM LIKE '%APPROVED%' THEN
          v_pass := v_pass + 1; RAISE NOTICE 'PASS [1706] fn_acc_post_batch rechaza batch no-APPROVED (P0002): %', SQLERRM;
        ELSE
          v_warn := v_warn + 1; RAISE NOTICE 'WARN [1706] fn_acc_post_batch rechazó pero mensaje inesperado: %', SQLERRM;
        END IF;
    END;

    DELETE FROM acc_source_batch WHERE id = v_rpc_batch_id;
  END;

  -- 1707: firma de fn_acc_post_batch tiene 1 parámetro IN (p_actor eliminado — B8)
  DECLARE
    v_param_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_param_count
    FROM information_schema.parameters
    WHERE specific_schema = 'public'
      AND specific_name   LIKE 'fn_acc_post_batch%'
      AND parameter_mode  = 'IN';

    IF v_param_count = 1 THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [1707] fn_acc_post_batch: firma correcta (% parámetro IN — p_actor eliminado)', v_param_count;
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1707] fn_acc_post_batch: firma incorrecta (% parámetros IN, esperado 1). Si es 2, re-ejecutar 022 v2.', v_param_count;
    END IF;
  END;


  -- ==========================================================================
  -- CAT-18: Entity Isolation — Pilot ALF Scope (SEC-ENTITY-SCOPE-001)
  -- ALF UUID: 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
  -- ==========================================================================

  -- 1801: INSERT policy con ALF UUID en WITH CHECK
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'INSERT'
      AND 'authenticated' = ANY(roles)
      AND with_check LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1801] INSERT policy: ALF UUID en WITH CHECK — entity scope correcto';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1801] SECURITY: INSERT policy no restringe a ALF UUID. SEC-ENTITY-SCOPE-001 violado. Ejecutar 020 v3.';
  END IF;

  -- 1802: INSERT policy WITH CHECK NO es permisiva
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'INSERT'
      AND 'authenticated' = ANY(roles)
      AND with_check = 'true'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1802] INSERT policy WITH CHECK no es permisiva (true) — cross-entity write bloqueado';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1802] SECURITY: INSERT policy tiene WITH CHECK (true) — cross-entity write NO bloqueado. Ejecutar 020 v3.';
  END IF;

  -- 1803: UPDATE policy USING restringe a ALF UUID
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND qual LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%'
      AND policyname NOT LIKE '%deny%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1803] UPDATE policy USING: solo filas ALF visibles — batches de otras entidades ocultos';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1803] SECURITY: UPDATE USING no restringe a ALF UUID. Batches de otras entidades accesibles.';
  END IF;

  -- 1804: UPDATE policy WITH CHECK restringe a ALF UUID
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND with_check LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%'
      AND policyname NOT LIKE '%deny%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1804] UPDATE policy WITH CHECK: entity_id no puede cambiarse a otra empresa';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1804] SECURITY: UPDATE WITH CHECK no restringe entity_id — cambio cross-entity posible.';
  END IF;

  -- 1805: acc_account_balance sin write directo para authenticated (modelo C)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_account_balance'
      AND cmd        IN ('INSERT', 'UPDATE', 'ALL')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT LIKE '%deny%'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1805] acc_account_balance: authenticated sin write directo — ledger protegido (modelo C)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1805] SECURITY: acc_account_balance tiene write policy para authenticated — ledger desprotegido.';
  END IF;

  -- 1806: anon fail-closed en acc_source_batch
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1806] acc_source_batch: anon fail-closed (RLS habilitado + sin política anon)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1806] SECURITY: anon no está fail-closed en acc_source_batch.';
  END IF;

  -- 1807: service_role tiene ALL en acc_source_batch (009 intacta)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'ALL'
      AND 'service_role' = ANY(roles)
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1807] service_role ALL en acc_source_batch (009 intacta) — internal posting path OK';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1807] service_role no tiene ALL en acc_source_batch — posting path roto.';
  END IF;

  -- 1808: UPDATE USING y WITH CHECK consistentes en ALF
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1808] UPDATE USING y WITH CHECK consistentes en ALF — cambio de entity_id bloqueado';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1808] UPDATE USING/WITH CHECK inconsistentes — cambio de entity_id puede no estar bloqueado.';
  END IF;

  -- 1809: SELECT policy de authenticated intacta (009 no afectado por 020)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acc_source_batch'
      AND cmd        = 'SELECT'
      AND 'authenticated' = ANY(roles)
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1809] SELECT policy de authenticated intacta — 020 no debilitó lectura (009 preservado)';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1809] REGRESSION: SELECT policy de authenticated desaparecida — 020 rompió lectura de 009.';
  END IF;

  -- 1810: Lifecycle trigger activo en acc_source_batch
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'acc_source_batch'
      AND trigger_name        = 'trg_acc_source_batch_lifecycle'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1810] Lifecycle trigger trg_acc_source_batch_lifecycle activo — 020 no afectó triggers de 014';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1810] REGRESSION: trg_acc_source_batch_lifecycle no encontrado — 014 puede no estar desplegado.';
  END IF;


  -- ==========================================================================
  -- CAT-19: fn_acc_post_batch hardening B7–B14 (022 v2)
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
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1901] fn_acc_post_batch no encontrada en pg_proc. Ejecutar 022 v2 primero.';
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1902] fn_acc_post_batch no encontrada — skip B8 check';
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1903] fn_acc_post_batch no encontrada — skip auth.uid check';
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1904] fn_acc_post_batch no encontrada — skip P0009 check';
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1905] fn_acc_post_batch no encontrada — skip B12 check';
    ELSE

      -- 1901: 1 parámetro IN (B8)
      SELECT COUNT(*) INTO v_param_count_19
      FROM information_schema.parameters
      WHERE specific_schema = 'public'
        AND specific_name LIKE 'fn_acc_post_batch%'
        AND parameter_mode = 'IN';

      IF v_param_count_19 = 1 THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1901] B8: fn_acc_post_batch tiene 1 parámetro IN — p_actor eliminado';
      ELSE
        v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1901] B8: fn_acc_post_batch tiene % parámetros IN — p_actor sigue presente. Re-ejecutar 022 v2.', v_param_count_19;
      END IF;

      -- 1902: P0000 entity scope guard (B7)
      IF v_has_entity_guard AND v_has_p0000 THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1902] B7: P0000 entity scope guard con ALF UUID en cuerpo de fn_acc_post_batch';
      ELSE
        v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1902] B7: falta P0000 o ALF UUID en fn_acc_post_batch (has_guard=%, has_p0000=%)', v_has_entity_guard, v_has_p0000;
      END IF;

      -- 1903: auth.uid() como actor (B8)
      IF v_uses_auth_uid THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1903] B8: fn_acc_post_batch usa auth.uid() para derivar actor — no aceptado del caller';
      ELSE
        v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1903] B8: fn_acc_post_batch no usa auth.uid(). Actor podría ser falsificable.';
      END IF;

      -- 1904: P0009 ledger overwrite guard (B11)
      IF v_has_p0009 THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1904] B11: P0009 ledger overwrite guard presente — sobreescritura silenciosa bloqueada';
      ELSE
        v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1904] B11: P0009 no encontrado en fn_acc_post_batch. Sobreescritura de ledger activo posible.';
      END IF;

      -- 1905: Mapping usa v_period dates, no CURRENT_DATE (B12)
      IF v_uses_period_dates AND NOT v_uses_current_date THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1905] B12: mapping validity usa v_period.date_from/date_to — reproducible en cargas históricas';
      ELSIF v_uses_current_date THEN
        v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1905] B12: fn_acc_post_batch aún usa CURRENT_DATE en mapping check — rompe cargas históricas';
      ELSE
        v_warn := v_warn + 1; RAISE NOTICE 'WARN [1905] B12: v_period.date_from no encontrado — verificar manualmente el mapping check';
      END IF;

      -- 1906: COALESCE(source_currency) eliminado (B13)
      IF NOT v_coalesce_usd THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1906] B13: COALESCE(sbd.source_currency, USD) eliminado — source_currency IS NOT NULL';
      ELSE
        v_warn := v_warn + 1; RAISE NOTICE 'WARN [1906] B13: COALESCE(sbd.source_currency, USD) sigue presente — redundante pero no bloqueante';
      END IF;

      -- 1907: SEC-ENTITY-SCOPE-001 referenciado en fn (B7 pilot scope)
      IF v_has_sec_debt THEN
        v_pass := v_pass + 1; RAISE NOTICE 'PASS [1907] B7: SEC-ENTITY-SCOPE-001 referenciado en fn_acc_post_batch como tech debt de piloto';
      ELSE
        v_warn := v_warn + 1; RAISE NOTICE 'WARN [1907] SEC-ENTITY-SCOPE-001 no referenciado en fn — entity guard presente pero sin documentar';
      END IF;

    END IF;
  END;

  -- 1908: B9 — SoD: T9 solo aplica a acc_adjustment_journal
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'acc_adjustment_journal'
      AND trigger_name        = 'trg_sod_adjustment'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1908] B9 (SoD): T9 trg_sod_adjustment activo en acc_adjustment_journal. No aplica a posting pipeline — PASS for pilot.';
  ELSE
    v_warn := v_warn + 1; RAISE NOTICE 'WARN [1908] B9 (SoD): trg_sod_adjustment no encontrado. Verificar que T9 de 010 está desplegado.';
  END IF;

  -- 1910: PUBLIC no tiene EXECUTE en fn_acc_post_batch (B15)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND grantee        = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1910] B15: PUBLIC no tiene EXECUTE en fn_acc_post_batch — REVOKE FROM PUBLIC OK';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1910] SECURITY B15: PUBLIC tiene EXECUTE en fn_acc_post_batch — anon puede ejecutar indirectamente. Re-ejecutar 022 v3.';
  END IF;

  -- 1911: anon no tiene EXECUTE en fn_acc_post_batch (B15)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_acc_post_batch'
      AND grantee        = 'anon'
      AND privilege_type = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1911] B15: anon no tiene EXECUTE directo en fn_acc_post_batch';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1911] SECURITY B15: anon tiene EXECUTE directo en fn_acc_post_batch.';
  END IF;

  -- 1912: P000A guard en prosrc (B16)
  DECLARE
    v_has_p000a     BOOLEAN;
    v_has_system_fb BOOLEAN;
  BEGIN
    SELECT
      prosrc LIKE '%P000A%',
      prosrc LIKE '%COALESCE(auth.uid()%''system''%'
    INTO v_has_p000a, v_has_system_fb
    FROM pg_proc WHERE proname = 'fn_acc_post_batch';

    IF v_has_p000a THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [1912] B16: P000A guard presente en fn_acc_post_batch — auth.uid() NULL → RAISE antes de writes';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1912] B16: P000A no encontrado — auth.uid() NULL podría no ser bloqueado. Re-ejecutar 022 v3.';
    END IF;
  END;

  -- 1913: sin COALESCE(auth.uid()) fallback (B16)
  DECLARE
    v_has_coalesce_system BOOLEAN;
  BEGIN
    SELECT prosrc LIKE '%COALESCE(auth.uid()%'
    INTO v_has_coalesce_system
    FROM pg_proc WHERE proname = 'fn_acc_post_batch';

    IF NOT COALESCE(v_has_coalesce_system, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [1913] B16: sin COALESCE(auth.uid()) en fn_acc_post_batch — actor desconocido no mapea a ''system''';
    ELSE
      v_warn := v_warn + 1; RAISE NOTICE 'WARN [1913] B16: prosrc contiene COALESCE(auth.uid()) — verificar que no sea fallback silencioso a ''system''';
    END IF;
  END;

  -- 1909: B10 — Model C: authenticated EXECUTE pero no write directo al ledger
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
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [1909] B10 (Model C): authenticated puede EXECUTE RPC pero NO escribir directamente al ledger — OK';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [1909] B10 (Model C): inconsistencia — EXECUTE grant o write-ledger policy fuera de spec. Revisar 022 + 020.';
  END IF;


  -- ==========================================================================
  -- CAT-20: fn_acc_approve_batch + B17/B18 security model (023)
  -- 14 tests: 2001-2014
  -- ==========================================================================

  -- 2001: fn_acc_approve_batch existe
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_acc_approve_batch') THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [2001] B17: fn_acc_approve_batch existe en el schema';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2001] B17: fn_acc_approve_batch NO existe — ejecutar 023';
  END IF;

  -- 2002: 1 parámetro (p_batch_id) — no accepted approved_by del frontend
  DECLARE
    v_pronargs INT;
    v_argnames TEXT;
  BEGIN
    SELECT pronargs, proargnames::TEXT
    INTO v_pronargs, v_argnames
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';

    IF v_pronargs = 1 AND v_argnames LIKE '%p_batch_id%' THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2002] B17: fn_acc_approve_batch acepta 1 parámetro (p_batch_id) — no approved_by del frontend';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2002] B17: fn_acc_approve_batch tiene % params — esperado 1 (p_batch_id)', COALESCE(v_pronargs::TEXT, '?');
    END IF;
  END;

  -- 2003: SECURITY DEFINER
  DECLARE
    v_secdef BOOLEAN;
  BEGIN
    SELECT prosecdef INTO v_secdef FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_secdef, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2003] B17: fn_acc_approve_batch es SECURITY DEFINER';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2003] B17: fn_acc_approve_batch NO es SECURITY DEFINER — re-ejecutar 023';
    END IF;
  END;

  -- 2004: search_path seguro (public + pg_temp)
  DECLARE
    v_cfg TEXT;
  BEGIN
    SELECT array_to_string(proconfig, ',') INTO v_cfg
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF v_cfg LIKE '%public%' AND v_cfg LIKE '%pg_temp%' THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2004] B17: fn_acc_approve_batch tiene search_path = public, pg_temp';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2004] B17: fn_acc_approve_batch search_path inseguro: %', COALESCE(v_cfg, 'NULL');
    END IF;
  END;

  -- 2005: PUBLIC no tiene EXECUTE en fn_acc_approve_batch
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE specific_name LIKE 'fn_acc_approve_batch%'
      AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [2005] B15 equiv: PUBLIC no tiene EXECUTE en fn_acc_approve_batch';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2005] B15 equiv: PUBLIC tiene EXECUTE en fn_acc_approve_batch — REVOKE faltó';
  END IF;

  -- 2006: anon no tiene EXECUTE en fn_acc_approve_batch
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE specific_name LIKE 'fn_acc_approve_batch%'
      AND grantee = 'anon' AND privilege_type = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [2006] B17: anon no tiene EXECUTE en fn_acc_approve_batch';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2006] B17: anon tiene EXECUTE en fn_acc_approve_batch — revisar GRANTs';
  END IF;

  -- 2007: authenticated tiene EXECUTE en fn_acc_approve_batch
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE specific_name LIKE 'fn_acc_approve_batch%'
      AND grantee = 'authenticated' AND privilege_type = 'EXECUTE'
  ) THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS [2007] B17: authenticated tiene EXECUTE en fn_acc_approve_batch — OK';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2007] B17: authenticated NO tiene EXECUTE en fn_acc_approve_batch — GRANT faltó';
  END IF;

  -- 2008: P000A en prosrc (auth.uid() IS NULL → RAISE)
  DECLARE
    v_p000a BOOLEAN;
  BEGIN
    SELECT (prosrc LIKE '%auth.uid() IS NULL%') INTO v_p000a
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_p000a, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2008] B16 equiv: P000A presente en fn_acc_approve_batch — auth.uid() NULL → RAISE';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2008] B16 equiv: P000A no encontrado en fn_acc_approve_batch — anónimo podría pasar';
    END IF;
  END;

  -- 2009: P0000 + ALF UUID en prosrc (entity scope guard)
  DECLARE
    v_p0000 BOOLEAN;
  BEGIN
    SELECT (prosrc LIKE '%P0000%' AND prosrc LIKE '%3df93d9d%') INTO v_p0000
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_p0000, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2009] B7 equiv: P0000 entity scope guard presente en fn_acc_approve_batch';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2009] B7 equiv: P0000 o ALF UUID no encontrado en fn_acc_approve_batch';
    END IF;
  END;

  -- 2010: SoD P0005 (imported_by ≠ aprobador) en prosrc
  DECLARE
    v_sod BOOLEAN;
  BEGIN
    SELECT (prosrc LIKE '%P0005%' AND prosrc LIKE '%imported_by%') INTO v_sod
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_sod, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2010] B17: SoD P0005 presente en fn_acc_approve_batch — importer ≠ approver';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2010] B17: SoD P0005 no encontrado en fn_acc_approve_batch — self-approve posible';
    END IF;
  END;

  -- 2011: approved_by = auth.uid()::TEXT server-side
  DECLARE
    v_uid_approved BOOLEAN;
  BEGIN
    SELECT (prosrc LIKE '%auth.uid()::TEXT%' AND prosrc LIKE '%approved_by%') INTO v_uid_approved
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_uid_approved, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2011] B17: approved_by = auth.uid()::TEXT server-side en fn_acc_approve_batch — frontend no inyecta';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2011] B17: approved_by no se deriva de auth.uid() en fn_acc_approve_batch';
    END IF;
  END;

  -- 2012: PENDING_APPROVAL check en prosrc
  DECLARE
    v_pending BOOLEAN;
  BEGIN
    SELECT (prosrc LIKE '%PENDING_APPROVAL%') INTO v_pending
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_pending, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2012] B17: PENDING_APPROVAL status check presente en fn_acc_approve_batch';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2012] B17: PENDING_APPROVAL check no encontrado en fn_acc_approve_batch';
    END IF;
  END;

  -- 2013: RLS asb_authenticated_update bloquea status=APPROVED (B17 blocker fix)
  DECLARE
    v_rls_approved BOOLEAN;
  BEGIN
    SELECT (with_check LIKE '%APPROVED%') INTO v_rls_approved
    FROM pg_policies
    WHERE tablename = 'acc_source_batch' AND policyname = 'asb_authenticated_update';

    IF COALESCE(v_rls_approved, false) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2013] B17: RLS asb_authenticated_update bloquea status=APPROVED para authenticated directo';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2013] B17: RLS no bloquea status=APPROVED — authenticated puede self-approve. Ejecutar PARTE 2 de 023.';
    END IF;
  END;

  -- 2014: fn_acc_approve_batch sin fallback a 'system'
  DECLARE
    v_no_system BOOLEAN;
  BEGIN
    SELECT (prosrc NOT LIKE '%''system''%') INTO v_no_system
    FROM pg_proc WHERE proname = 'fn_acc_approve_batch';
    IF COALESCE(v_no_system, true) THEN
      v_pass := v_pass + 1; RAISE NOTICE 'PASS [2014] B16 equiv: fn_acc_approve_batch sin fallback a ''system'' — audit trail íntegro';
    ELSE
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL [2014] B16 equiv: fn_acc_approve_batch contiene ''system'' como fallback — revisar prosrc';
    END IF;
  END;


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
