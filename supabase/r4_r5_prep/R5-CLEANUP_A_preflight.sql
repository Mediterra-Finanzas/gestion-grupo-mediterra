-- ============================================================================
-- R5-CLEANUP_A_preflight.sql (v2) — READ ONLY. Antes de DROP proc_whoami().
-- TARGET: STAGING nlvfjpwiecgrosjnwwik. Production = HANDS-OFF. No muta.
--
-- OJO: este NO es R5-MIN_A_preflight.sql. Aqui identity_lookup DEBE EXISTIR (R5-MIN CLOSED, live,
-- consumida por /api/proc-token). Este preflight valida: (a) proc_whoami existe y es dropeable
-- (sin deps), (b) identity_lookup INTACTO y BLOQUEADO (service_role-only), (c) R4/baseline intacto.
-- R5-CLEANUP solo elimina proc_whoami(); NUNCA toca proc_fn_identity_lookup(text).
--
-- Nota: los "runtime consumers" de proc_whoami en src/ y api/ (=0) se auditaron por codigo (grep);
-- SQL no ve el codigo — aqui 07/08 verifican dependencias A NIVEL DB (pg_depend), que es lo que
-- un DROP sin CASCADE evalua.
-- ============================================================================
WITH throttle AS (SELECT ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']::text[] AS names),
op AS (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, throttle t
       WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname = ANY(t.names))),
who AS (SELECT to_regprocedure('public.proc_whoami()') AS oid),
idl AS (SELECT to_regprocedure('public.proc_fn_identity_lookup(text)') AS oid),
checks AS (
  SELECT '01_proc_whoami_existe' AS check_name,'1' AS expected,
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_whoami') AS actual
  UNION ALL SELECT '02_identity_lookup_existe','1',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_fn_identity_lookup')
  UNION ALL SELECT '03_identity_lookup_service_role_exec','true',
         (SELECT CASE WHEN (SELECT oid FROM idl) IS NULL THEN 'n/a' ELSE has_function_privilege('service_role',(SELECT oid FROM idl),'EXECUTE')::text END)
  UNION ALL SELECT '04_identity_lookup_public_exec','false',
         (SELECT CASE WHEN (SELECT oid FROM idl) IS NULL THEN 'n/a'
                 ELSE EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=(SELECT oid FROM idl)
                        AND (p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')))::text END)
  UNION ALL SELECT '05_identity_lookup_anon_exec','false',
         (SELECT CASE WHEN (SELECT oid FROM idl) IS NULL THEN 'n/a' ELSE has_function_privilege('anon',(SELECT oid FROM idl),'EXECUTE')::text END)
  UNION ALL SELECT '06_identity_lookup_authenticated_exec','false',
         (SELECT CASE WHEN (SELECT oid FROM idl) IS NULL THEN 'n/a' ELSE has_function_privilege('authenticated',(SELECT oid FROM idl),'EXECUTE')::text END)
  UNION ALL SELECT '07_runtime_dependencies_whoami','0',
         (SELECT count(*)::text FROM pg_depend d WHERE d.refobjid=(SELECT oid FROM who) AND d.deptype IN ('n','a'))
  UNION ALL SELECT '08_pg_depend_blocking_whoami','0',
         (SELECT count(*)::text FROM pg_depend d WHERE d.refobjid=(SELECT oid FROM who) AND d.deptype='n')
  UNION ALL SELECT '09_anon_grants_proc','0',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '10_op_public_exec','0',
         (SELECT count(*)::text FROM op JOIN pg_proc p ON p.oid=op.oid WHERE p.proacl IS NULL OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT '11_op_anon_exec','0',
         (SELECT count(*)::text FROM op WHERE has_function_privilege('anon', op.oid, 'EXECUTE'))
  UNION ALL SELECT '12_auth_grants_proc','278',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\')
  UNION ALL SELECT '13_calendario_anon_legacy','3',
         (SELECT count(*)::text FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data')
  UNION ALL SELECT '14_resolvers_secdef','3',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('proc_current_empresa','proc_current_iam_user','proc_current_user','proc_current_auth_user') AND prosecdef)
  UNION ALL SELECT '15_ALS_memberships','6',
         (SELECT count(*)::text FROM iam_usuario_empresa WHERE empresa_id::text LIKE '5aa10886%' AND activo=true)
  UNION ALL SELECT '16_Angelo_binding','29b0217d-40ed-4fde-84c0-51d51b98c849',
         (SELECT coalesce(auth_user_id::text,'<null>') FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
),
scored AS (SELECT check_name,expected,actual,CASE WHEN actual=expected THEN 'PASS' ELSE 'FAIL' END status FROM checks)
SELECT check_name,expected,actual,status FROM scored
UNION ALL SELECT 'ZZ_VERDICT','PASS',(SELECT count(*) FILTER (WHERE status='FAIL')::text FROM scored)||' fail',
       (SELECT CASE WHEN bool_and(status='PASS') THEN 'PASS(ready to drop proc_whoami)' ELSE 'FAIL-HARDSTOP' END FROM scored)
ORDER BY 1;
