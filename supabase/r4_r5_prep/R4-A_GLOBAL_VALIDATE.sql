-- ============================================================================
-- R4-A_GLOBAL_VALIDATE.sql — READ-ONLY. Correr DESPUES de completar los 8 lotes de R4-A
-- (o cuando se quiera un snapshot). NO muta. Confirma el post-estado de R4-A y el baseline
-- que R4-B debe preservar. TARGET: staging nlvfjpwiecgrosjnwwik.
-- ============================================================================
SELECT
  -- R4-A objetivo: 0 _dev_uat en TODO el schema proc_*
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND left(tablename,5)='proc_' AND lower(policyname) ~ '_dev_uat$') AS dev_uat_schema_total,
  -- estrictas preservadas (tenant + catalogo global)
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND left(tablename,5)='proc_' AND lower(policyname) ~ '_empresa$') AS empresa_pol_total,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='pol_proc_tipo_movimiento_cat') AS catalogo_global_cat,
  -- _dev_only (H2) debe seguir en 0
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND left(tablename,5)='proc_' AND lower(policyname) ~ '_dev_only$') AS dev_only_total,
  -- baseline que R4-B QUITARA (grants anon aun vigentes)
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\') AS anon_grants_proc,
  (SELECT count(*) FROM information_schema.role_routine_grants WHERE grantee='anon' AND routine_schema='public' AND routine_name LIKE 'proc_fn\_%' ESCAPE '\') AS anon_exec_fn,
  -- invariantes que R4-B DEBE preservar
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\') AS auth_grants_proc,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data') AS anon_calendario,
  -- R3-S5 assumptions
  (SELECT count(*) FROM iam_usuario_empresa m JOIN contab_empresas e ON e.id=m.empresa_id WHERE e.codigo='ALS' AND m.activo) AS als_memberships,
  (SELECT auth_user_id::text FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') AS angelo_binding,
  (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_whoami') AS whoami_exists;
-- Esperado post-R4-A completo: dev_uat_schema_total=0, empresa_pol_total=60, catalogo_global_cat=1,
--   dev_only_total=0, anon_grants_proc>0 (a quitar por R4-B), anon_exec_fn>0 (a quitar por R4-B),
--   auth_grants_proc=278 (preservar), anon_calendario=3 (preservar), als=6, angelo=29b0217d, whoami=1.
