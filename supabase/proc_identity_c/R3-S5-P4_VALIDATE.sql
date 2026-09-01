-- ============================================================================
-- R3-S5-P4_VALIDATE.sql — VALIDACIÓN INDEPENDIENTE (READ-ONLY) del gate P4.
-- NO muta nada: UNA query. Segura de re-correr. TARGET: staging.
-- Matriz check | expected | actual | result. Filas 90+ = RESUMEN.
-- ============================================================================
WITH m AS (
  SELECT
    (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
       AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'SELECT')) AS gap_sel,
    (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
       AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'INSERT') AND NOT has_table_privilege('authenticated',c.oid,'INSERT')) AS gap_ins,
    (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
       AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'UPDATE') AND NOT has_table_privilege('authenticated',c.oid,'UPDATE')) AS gap_upd,
    (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
       AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'DELETE') AND NOT has_table_privilege('authenticated',c.oid,'DELETE')) AS gap_del,
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'proc_%'
       AND has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AS gap_exec,
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
       AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset') AND has_function_privilege('authenticated',p.oid,'EXECUTE')) AS thr_auth,
    (SELECT count(*) FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='proc_auth_throttle' AND grantee IN ('authenticated','anon')) AS thr_tbl,
    (SELECT relrowsecurity      FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass) AS thr_rls,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass) AS thr_force,
    (SELECT count(DISTINCT c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
       AND c.relkind IN ('r','v','m','p') AND has_table_privilege('authenticated',c.oid,'SELECT')) AS auth_sel_obj,
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'proc_%'
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')) AS auth_exec_fn
),
rows AS (
  SELECT * FROM m, LATERAL (VALUES
    ('01','gap SELECT (anon sin authenticated)',   '0', gap_sel::text,  CASE WHEN gap_sel=0  THEN 'PASS' ELSE 'FAIL' END),
    ('02','gap INSERT',                            '0', gap_ins::text,  CASE WHEN gap_ins=0  THEN 'PASS' ELSE 'FAIL' END),
    ('03','gap UPDATE',                            '0', gap_upd::text,  CASE WHEN gap_upd=0  THEN 'PASS' ELSE 'FAIL' END),
    ('04','gap DELETE',                            '0', gap_del::text,  CASE WHEN gap_del=0  THEN 'PASS' ELSE 'FAIL' END),
    ('05','gap EXECUTE (funciones proc_*)',        '0', gap_exec::text, CASE WHEN gap_exec=0 THEN 'PASS' ELSE 'FAIL' END),
    ('06','throttle RPC EXECUTE por authenticated','0', thr_auth::text, CASE WHEN thr_auth=0 THEN 'PASS' ELSE 'FAIL' END),
    ('07','proc_auth_throttle grants browser',     '0', thr_tbl::text,  CASE WHEN thr_tbl=0  THEN 'PASS' ELSE 'FAIL' END),
    ('08','proc_auth_throttle RLS ENABLE',         'YES', CASE WHEN thr_rls THEN 'YES' ELSE 'NO' END,   CASE WHEN thr_rls THEN 'PASS' ELSE 'FAIL' END),
    ('09','proc_auth_throttle FORCE RLS',          'YES', CASE WHEN thr_force THEN 'YES' ELSE 'NO' END, CASE WHEN thr_force THEN 'PASS' ELSE 'FAIL' END),
    ('19','[INFO] proc_* obj con SELECT authenticated', '(paridad)', auth_sel_obj::text, 'INFO'),
    ('20','[INFO] proc_* fn con EXECUTE authenticated', '(paridad)', auth_exec_fn::text, 'INFO'),
    ('90','RESUMEN · PARIDAD authenticated←anon',   'YES',
       CASE WHEN gap_sel=0 AND gap_ins=0 AND gap_upd=0 AND gap_del=0 AND gap_exec=0 THEN 'YES' ELSE 'NO' END,
       CASE WHEN gap_sel=0 AND gap_ins=0 AND gap_upd=0 AND gap_del=0 AND gap_exec=0 THEN 'PASS' ELSE 'FAIL' END),
    ('91','RESUMEN · THROTTLE SERVER-ONLY INTACTO', 'YES',
       CASE WHEN thr_auth=0 AND thr_tbl=0 AND thr_rls AND thr_force THEN 'YES' ELSE 'NO' END,
       CASE WHEN thr_auth=0 AND thr_tbl=0 AND thr_rls AND thr_force THEN 'PASS' ELSE 'FAIL' END)
  ) AS t(ord, chk, expected, actual, result)
)
SELECT ord AS "#", chk AS check, expected, actual, result FROM rows ORDER BY ord;
