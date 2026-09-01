-- ============================================================================
-- R4-B_PREFLIGHT.sql — READ-ONLY. Correr ANTES de autorizar R4-B (REVOKE anon).
-- NO muta. Fotografia el baseline exacto de grants anon a retirar + invariantes a preservar.
-- Precondicion R4-B: R4-A completo (dev_uat=0). TARGET: staging nlvfjpwiecgrosjnwwik.
-- ============================================================================
SELECT
  -- R4-A debe estar completo antes de R4-B
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND left(tablename,5)='proc_' AND lower(policyname) ~ '_dev_uat$') AS dev_uat_remaining,
  -- Objetos que R4-B REVOCA (grants anon)
  (SELECT count(*) FROM information_schema.role_table_grants g JOIN pg_tables tb ON tb.tablename=g.table_name AND tb.schemaname=g.table_schema
     WHERE g.grantee='anon' AND g.table_schema='public' AND g.table_name LIKE 'proc\_%' ESCAPE '\') AS anon_grants_tablas,
  (SELECT count(*) FROM information_schema.role_table_grants g JOIN pg_views v ON v.viewname=g.table_name AND v.schemaname=g.table_schema
     WHERE g.grantee='anon' AND g.table_schema='public' AND g.table_name LIKE 'proc_v\_%' ESCAPE '\') AS anon_grants_vistas,
  (SELECT count(*) FROM information_schema.role_routine_grants WHERE grantee='anon' AND routine_schema='public' AND routine_name LIKE 'proc_fn\_%' ESCAPE '\') AS anon_exec_fn,
  -- INVARIANTES que R4-B DEBE preservar (guard fail-closed lo re-verifica)
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\') AS auth_grants_proc_PRESERVAR,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data') AS anon_calendario_PRESERVAR,
  (SELECT count(*) FROM information_schema.role_usage_grants WHERE grantee='anon' AND object_schema='public') AS anon_usage_schema_PRESERVAR,
  -- objetos NO-proc con grant anon (contexto app legada; R4-B NO los toca)
  (SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants
     WHERE grantee='anon' AND table_schema='public' AND table_name NOT LIKE 'proc\_%' ESCAPE '\') AS anon_no_proc_tablas_PRESERVAR,
  -- R3-S5 assumptions
  (SELECT count(*) FROM iam_usuario_empresa m JOIN contab_empresas e ON e.id=m.empresa_id WHERE e.codigo='ALS' AND m.activo) AS als_memberships,
  (SELECT auth_user_id::text FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') AS angelo_binding;
-- Esperado: dev_uat_remaining=0 (R4-A completo), anon_grants_tablas/vistas + anon_exec_fn > 0 (a revocar),
--   auth_grants_proc=278 y anon_calendario=3 y anon_usage_schema>=1 y anon_no_proc>0 = PRESERVAR (R4-B no toca),
--   als=6, angelo=29b0217d.
