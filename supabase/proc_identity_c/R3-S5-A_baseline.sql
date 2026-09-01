-- ============================================================================
-- R3-S5-A_baseline.sql — BASELINE INMUTABLE (READ-ONLY) para certificación R3-S5.
-- NO muta nada. Correr en staging ANTES de cualquier fixture. Guardar el output.
-- NO expone PIN/hashes/JWT/service_role/secrets. TARGET: gestion-mediterra-staging.
-- Permite demostrar al final: DATA LOSS = 0 y UNEXPECTED MUTATIONS = 0.
-- Correr las DOS queries; guardar ambos resultados.
-- ============================================================================

-- ── A1 · IDENTIDAD + CONFIG BASELINE (una fila por métrica) ──────────────────
SELECT '01 Angelo iam_usuario id' AS metrica,
       (SELECT id::text FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') AS valor
UNION ALL SELECT '02 Angelo activo',
       (SELECT activo::text FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
UNION ALL SELECT '03 Angelo auth_user_id (binding)',
       (SELECT auth_user_id::text FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
UNION ALL SELECT '04 email de ese binding en auth.users',
       (SELECT email FROM auth.users WHERE id=(SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl'))
UNION ALL SELECT '05 auth.users con email ahuerta (count)',
       (SELECT count(*)::text FROM auth.users WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')
UNION ALL SELECT '06 memberships activas de Angelo (empresa_ids)',
       (SELECT string_agg(empresa_id::text, ', ' ORDER BY empresa_id) FROM iam_usuario_empresa m
          JOIN iam_usuario u ON u.id=m.usuario_id WHERE lower(btrim(u.email))='ahuerta@grupomediterra.cl' AND m.activo)
UNION ALL SELECT '07 ALS id + codigo',
       (SELECT id::text||' / '||codigo FROM contab_empresas WHERE codigo='ALS')
UNION ALL SELECT '08 memberships ALS totales (count)',
       (SELECT count(*)::text FROM iam_usuario_empresa WHERE activo AND empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS'))
UNION ALL SELECT '09 Carol memberships activas (count)',
       (SELECT count(*)::text FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
          WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo)
UNION ALL SELECT '10 Osiris sintetico 207b6125 email (intacto)',
       (SELECT email FROM auth.users WHERE id='207b6125-34ac-4396-a330-e8ecfdb0038c')
UNION ALL SELECT '11 proc_* tablas (count)',
       (SELECT count(*)::text FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')
UNION ALL SELECT '12 proc_* policies (count)',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'proc_%')
UNION ALL SELECT '13 proc_* objetos con SELECT authenticated',
       (SELECT count(DISTINCT c.relname)::text FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
          AND c.relkind IN ('r','v','m','p') AND has_table_privilege('authenticated',c.oid,'SELECT'))
UNION ALL SELECT '14 proc_* fn con EXECUTE authenticated',
       (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'proc_%'
          AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
UNION ALL SELECT '15 helpers v2 presentes',
       (SELECT string_agg(proname,',' ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace
          AND proname IN ('proc_current_empresa','proc_current_iam_user','proc_current_user','proc_current_auth_user'))
UNION ALL SELECT '16 throttle deny-browser (RLS+FORCE)',
       (SELECT (relrowsecurity AND relforcerowsecurity)::text FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass)
UNION ALL SELECT '17 throttle RPC ejecutable por authenticated (debe ser 0/false)',
       (SELECT bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE'))::text FROM pg_proc p
          WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset'))
ORDER BY metrica;

-- ── A2 · FOOTPRINT DE DATOS PROC (una fila por tabla proc_* con su conteo) ────
--    Guardar este resultado. Al terminar la certificación, re-correr y comparar:
--    cualquier delta no explicado por un fixture = UNEXPECTED MUTATION.
SELECT tablename,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', tablename), false, true, '')))[1]::text::int AS filas
FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%'
ORDER BY tablename;
