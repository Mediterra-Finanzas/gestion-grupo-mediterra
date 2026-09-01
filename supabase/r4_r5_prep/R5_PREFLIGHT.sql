-- ============================================================================
-- R5_PREFLIGHT.sql — READ ONLY. Estado de entrada de R5 (post-R4) + residuales.
-- TARGET: Supabase STAGING (nlvfjpwiecgrosjnwwik). Production = HANDS-OFF. No muta.
-- Grilla check/expected/actual/status + VERDICT. Confirma que R5 arranca sobre el baseline
-- exacto que dejó R4-B, e identifica el residual proc_whoami (anon-ejecutable, context-only)
-- y que identity_lookup aún no existe (R5-MIN no aplicado). Autoritativo: has_function_privilege.
-- ============================================================================
WITH throttle AS (SELECT ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']::text[] AS names),
op AS (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
  WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname = ANY(t.names))
),
checks AS (
  -- Baseline post-R4 (debe coincidir con el postcheck R4-B)
  SELECT '01_anon_grants_proc' AS check_name, '0' AS expected,
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\') AS actual
  UNION ALL SELECT '02_auth_grants_proc','278',
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '03_op_public_exec','0',
         (SELECT count(*)::text FROM op JOIN pg_proc p ON p.oid=op.oid
          WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '04_op_anon_exec','0',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('anon', op.oid, 'EXECUTE'))
  UNION ALL SELECT '05_op_auth_exec','70',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('authenticated', op.oid, 'EXECUTE'))
  UNION ALL SELECT '06_op_service_role_exec','70',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('service_role', op.oid, 'EXECUTE'))
  UNION ALL SELECT '07_dev_uat_policies','0',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_dev_uat$')
  UNION ALL SELECT '08_dev_only_policies','0',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_dev_only$')
  UNION ALL SELECT '09_empresa_policies','60',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_empresa$')
  UNION ALL SELECT '10_resolvers_secdef','3',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace
          AND proname IN ('proc_current_empresa','proc_current_iam_user','proc_current_user','proc_current_auth_user') AND prosecdef)
  UNION ALL SELECT '11_anon_calendario_data','3',
         (SELECT count(*)::text FROM information_schema.role_table_grants
          WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data')
  UNION ALL SELECT '12_als_memberships','6',
         (SELECT count(*)::text FROM iam_usuario_empresa WHERE empresa_id::text LIKE '5aa10886%' AND activo = true)
  UNION ALL SELECT '13_angelo_binding','29b0217d-40ed-4fde-84c0-51d51b98c849',
         (SELECT coalesce(auth_user_id::text,'<null>') FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
  -- Residuales / estado de entrada R5
  UNION ALL SELECT '14_proc_whoami_present','1',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_whoami')
  UNION ALL SELECT '15_proc_whoami_anon_exec_RESIDUAL','true',
         (SELECT CASE WHEN to_regprocedure('public.proc_whoami()') IS NULL THEN 'n/a'
                      ELSE has_function_privilege('anon','public.proc_whoami()','EXECUTE')::text END)
  UNION ALL SELECT '16_proc_whoami_deps','0',
         (SELECT count(*)::text FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid
          JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='proc_whoami' AND d.deptype='n')
  UNION ALL SELECT '17_identity_lookup_present','0',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_fn_identity_lookup')
),
scored AS (
  SELECT check_name, expected, actual,
         CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS status FROM checks
)
SELECT check_name, expected, actual, status FROM scored
UNION ALL
SELECT 'ZZ_VERDICT','PASS', (SELECT count(*) FILTER (WHERE status='FAIL')::text FROM scored)||' fail',
       (SELECT CASE WHEN bool_and(status='PASS') THEN 'PASS(R5 entry OK)' ELSE 'FAIL-REVIEW' END FROM scored)
ORDER BY 1;
