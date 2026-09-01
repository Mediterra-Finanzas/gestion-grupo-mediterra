-- ============================================================================
-- R5-MIN_A_preflight.sql — READ ONLY. Estado de entrada antes de crear proc_fn_identity_lookup.
-- TARGET: STAGING nlvfjpwiecgrosjnwwik. Production = HANDS-OFF. No muta.
-- ============================================================================
WITH throttle AS (SELECT ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']::text[] AS names),
op AS (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
       WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname = ANY(t.names))),
checks AS (
  SELECT '01_identity_lookup_NO_existe' AS check_name,'0' AS expected,
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_fn_identity_lookup') AS actual
  UNION ALL SELECT '02_anon_grants_proc','0',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '03_op_public_exec','0',
         (SELECT count(*)::text FROM op JOIN pg_proc p ON p.oid=op.oid WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '04_op_anon_exec','0',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('anon', op.oid, 'EXECUTE'))
  UNION ALL SELECT '05_auth_grants_proc','278',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '06_service_role_existe','1',
         (SELECT count(*)::text FROM pg_roles WHERE rolname='service_role')
  UNION ALL SELECT '07_calendario_anon_legacy','3',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data')
  UNION ALL SELECT '08_resolvers_secdef','3',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('proc_current_empresa','proc_current_iam_user','proc_current_user','proc_current_auth_user') AND prosecdef)
  UNION ALL SELECT '09_als_memberships','6',
         (SELECT count(*)::text FROM iam_usuario_empresa WHERE empresa_id::text LIKE '5aa10886%' AND activo=true)
  UNION ALL SELECT '10_angelo_binding','29b0217d-40ed-4fde-84c0-51d51b98c849',
         (SELECT coalesce(auth_user_id::text,'<null>') FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
),
scored AS (SELECT check_name,expected,actual,CASE WHEN actual=expected THEN 'PASS' ELSE 'FAIL' END status FROM checks)
SELECT check_name,expected,actual,status FROM scored
UNION ALL SELECT 'ZZ_VERDICT','PASS',(SELECT count(*) FILTER (WHERE status='FAIL')::text FROM scored)||' fail',
       (SELECT CASE WHEN bool_and(status='PASS') THEN 'PASS(ready to create)' ELSE 'FAIL-HARDSTOP' END FROM scored)
ORDER BY 1;
