-- ============================================================================
-- R5-MIN_D_postcheck.sql — READ ONLY. Verifica proc_fn_identity_lookup + R4 intacto.
-- TARGET: STAGING nlvfjpwiecgrosjnwwik. Production = HANDS-OFF. No muta.
-- ============================================================================
WITH throttle AS (SELECT ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']::text[] AS names),
op AS (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
       WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname = ANY(t.names))),
fn AS (SELECT oid, prosecdef, proconfig, proacl FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_fn_identity_lookup'),
checks AS (
  -- función y privilegios
  SELECT '01_function_exists' AS check_name,'1' AS expected,(SELECT count(*)::text FROM fn) AS actual
  UNION ALL SELECT '02_fn_public_exec','0',
         (SELECT count(*)::text FROM fn f WHERE f.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '03_fn_anon_exec','false',
         (SELECT COALESCE(has_function_privilege('anon', oid, 'EXECUTE')::text,'n/a') FROM fn)
  UNION ALL SELECT '04_fn_auth_exec','false',
         (SELECT COALESCE(has_function_privilege('authenticated', oid, 'EXECUTE')::text,'n/a') FROM fn)
  UNION ALL SELECT '05_fn_service_role_exec','true',
         (SELECT COALESCE(has_function_privilege('service_role', oid, 'EXECUTE')::text,'n/a') FROM fn)
  UNION ALL SELECT '06_fn_security_invoker','true',
         (SELECT COALESCE((NOT prosecdef)::text,'n/a') FROM fn)
  UNION ALL SELECT '07_fn_search_path','true',
         (SELECT COALESCE(('search_path=public' = ANY(proconfig))::text,'n/a') FROM fn)
  -- R4 intacto
  UNION ALL SELECT '08_R4_anon_grants_proc','0',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '09_R4_op_public_exec','0',
         (SELECT count(*)::text FROM op JOIN pg_proc p ON p.oid=op.oid WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '10_R4_auth_grants_proc','278',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '11_throttle_svc_exec','2',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset') AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  UNION ALL SELECT '12_throttle_anon_exec','0',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset') AND has_function_privilege('anon',p.oid,'EXECUTE'))
  UNION ALL SELECT '13_calendario_anon_legacy','3',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data')
  UNION ALL SELECT '14_als_memberships','6',
         (SELECT count(*)::text FROM iam_usuario_empresa WHERE empresa_id::text LIKE '5aa10886%' AND activo=true)
  UNION ALL SELECT '15_angelo_binding','29b0217d-40ed-4fde-84c0-51d51b98c849',
         (SELECT coalesce(auth_user_id::text,'<null>') FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
),
scored AS (SELECT check_name,expected,actual,CASE WHEN actual=expected THEN 'PASS' ELSE 'FAIL' END status FROM checks)
SELECT check_name,expected,actual,status FROM scored
UNION ALL SELECT 'ZZ_VERDICT','PASS',(SELECT count(*) FILTER (WHERE status='FAIL')::text FROM scored)||' fail',
       (SELECT CASE WHEN bool_and(status='PASS') THEN 'PASS(R5-MIN fn OK)' ELSE 'FAIL-REVIEW' END FROM scored)
ORDER BY 1;
