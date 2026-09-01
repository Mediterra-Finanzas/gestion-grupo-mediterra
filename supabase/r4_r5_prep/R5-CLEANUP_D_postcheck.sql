-- ============================================================================
-- R5-CLEANUP_D_postcheck.sql — READ ONLY. Tras DROP proc_whoami().
-- TARGET: STAGING nlvfjpwiecgrosjnwwik. Production = HANDS-OFF. No muta.
-- Confirma: whoami ausente, R5-MIN intacto, R4 intacto, baseline intacto.
-- ============================================================================
WITH throttle AS (SELECT ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']::text[] AS names),
op AS (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
       WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname = ANY(t.names))),
idl AS (SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_fn_identity_lookup'),
checks AS (
  SELECT '01_proc_whoami_ausente' AS check_name,'0' AS expected,
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_whoami') AS actual
  UNION ALL SELECT '02_identity_lookup_intacto','1',(SELECT count(*)::text FROM idl)
  UNION ALL SELECT '03_identity_lookup_svc_exec','true',(SELECT COALESCE(has_function_privilege('service_role',oid,'EXECUTE')::text,'n/a') FROM idl)
  UNION ALL SELECT '04_identity_lookup_anon_exec','false',(SELECT COALESCE(has_function_privilege('anon',oid,'EXECUTE')::text,'n/a') FROM idl)
  UNION ALL SELECT '05_R4_anon_grants_proc','0',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '06_R4_op_public_exec','0',
         (SELECT count(*)::text FROM op JOIN pg_proc p ON p.oid=op.oid WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '07_R4_auth_grants_proc','278',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '08_throttle_svc_exec','2',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset') AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  UNION ALL SELECT '09_dev_uat_policies','0',
         (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND lower(policyname) ~ '_dev_uat$')
  UNION ALL SELECT '10_calendario_anon_legacy','3',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data')
  UNION ALL SELECT '11_als_memberships','6',
         (SELECT count(*)::text FROM iam_usuario_empresa WHERE empresa_id::text LIKE '5aa10886%' AND activo=true)
  UNION ALL SELECT '12_angelo_binding','29b0217d-40ed-4fde-84c0-51d51b98c849',
         (SELECT coalesce(auth_user_id::text,'<null>') FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
),
scored AS (SELECT check_name,expected,actual,CASE WHEN actual=expected THEN 'PASS' ELSE 'FAIL' END status FROM checks)
SELECT check_name,expected,actual,status FROM scored
UNION ALL SELECT 'ZZ_VERDICT','PASS',(SELECT count(*) FILTER (WHERE status='FAIL')::text FROM scored)||' fail',
       (SELECT CASE WHEN bool_and(status='PASS') THEN 'PASS(R5-16 done, R5 FULLY CLOSED)' ELSE 'FAIL-REVIEW' END FROM scored)
ORDER BY 1;
