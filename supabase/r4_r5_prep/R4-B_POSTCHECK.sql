-- ============================================================================
-- R4-B_POSTCHECK.sql  — READ ONLY. Verificacion autoritativa DESPUES de R4-B v2.
-- TARGET: Supabase STAGING (nlvfjpwiecgrosjnwwik). Production = HANDS-OFF.
-- No muta. Grilla check/expected/actual/status + VERDICT. Autoritativo:
-- has_function_privilege(...) para EXECUTE efectivo; aclexplode(proacl) para PUBLIC.
-- Si VERDICT != PASS => estado parcial/FAIL real => considerar ROLLBACK v2.
-- ============================================================================
WITH throttle AS (SELECT ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']::text[] AS names),
op AS (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
  WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname = ANY(t.names))
),
thr AS (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
  WHERE n.nspname='public' AND p.proname = ANY(t.names)
),
checks AS (
  -- TABLAS/VISTAS
  SELECT '01_anon_grants_proc'        AS check_name, '0' AS expected,
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\') AS actual
  UNION ALL SELECT '02_auth_grants_proc','278',
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '03_public_select_proc_tablas','0',
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='PUBLIC' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\' AND privilege_type='SELECT')
  -- FUNCIONES OPERACIONALES 70
  UNION ALL SELECT '04_proc_fn_total','72',
         (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\')
  UNION ALL SELECT '05_fn_operacionales','70', (SELECT count(*)::text FROM op)
  UNION ALL SELECT '06_fn_throttle','2', (SELECT count(*)::text FROM thr)
  UNION ALL SELECT '07_op_public_exec','0',
         (SELECT count(*)::text FROM op JOIN pg_proc p ON p.oid=op.oid
          WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '08_op_anon_effective_exec','0',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('anon', op.oid, 'EXECUTE'))
  UNION ALL SELECT '09_op_auth_effective_exec','70',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('authenticated', op.oid, 'EXECUTE'))
  UNION ALL SELECT '10_op_service_role_effective_exec','70',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('service_role', op.oid, 'EXECUTE'))
  -- THROTTLE 2 (intacto)
  UNION ALL SELECT '11_thr_public_exec','0',
         (SELECT count(*)::text FROM thr JOIN pg_proc p ON p.oid=thr.oid
          WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '12_thr_anon_exec','0',
         (SELECT count(*)::text FROM thr WHERE has_function_privilege('anon', thr.oid, 'EXECUTE'))
  UNION ALL SELECT '13_thr_auth_exec','0',
         (SELECT count(*)::text FROM thr WHERE has_function_privilege('authenticated', thr.oid, 'EXECUTE'))
  UNION ALL SELECT '14_thr_service_role_exec','2',
         (SELECT count(*)::text FROM thr WHERE has_function_privilege('service_role', thr.oid, 'EXECUTE'))
  -- BASELINES (intactos)
  UNION ALL SELECT '15_anon_calendario_data','3',
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data')
  UNION ALL SELECT '16_dev_uat_policies','0',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_dev_uat$')
  UNION ALL SELECT '17_dev_only_policies','0',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_dev_only$')
  UNION ALL SELECT '18_empresa_policies','60',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_empresa$')
  UNION ALL SELECT '19_resolvers_secdef','3',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace
          AND proname IN ('proc_current_empresa','proc_current_iam_user','proc_current_user','proc_current_auth_user') AND prosecdef)
  UNION ALL SELECT '20_als_memberships_activas','6',
         (SELECT count(*)::text FROM iam_usuario_empresa WHERE empresa_id::text LIKE '5aa10886%' AND activo = true)
  UNION ALL SELECT '21_angelo_binding','29b0217d-40ed-4fde-84c0-51d51b98c849',
         (SELECT coalesce(auth_user_id::text,'<null>') FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
),
scored AS (
  SELECT check_name, expected, actual,
         CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM checks
)
SELECT check_name, expected, actual, status FROM scored
UNION ALL
SELECT 'ZZ_VERDICT', 'PASS', (SELECT count(*) FILTER (WHERE status='FAIL')::text FROM scored)||' fail',
       (SELECT CASE WHEN bool_and(status='PASS') THEN 'PASS(R4-B applied)' ELSE 'FAIL-CHECK-ROLLBACK' END FROM scored)
ORDER BY 1;
