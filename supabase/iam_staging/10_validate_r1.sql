-- ============================================================================
-- 10_validate_r1.sql — Validación POST IAM-R1 (schema_iam_v1.sql). READ-ONLY.
-- Correr DESPUÉS de aplicar supabase/schema_iam_v1.sql en staging. Antes de R2.
-- ============================================================================
SELECT
  (to_regclass('public.iam_usuario')          IS NOT NULL)                       AS iam_usuario_existe,
  (to_regclass('public.iam_usuario_empresa')  IS NOT NULL)                       AS iam_ue_existe,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname='public' AND indexname='ux_iam_usuario_email_norm')        AS unique_email_norm,   -- esperado 1
  (SELECT count(*) FROM pg_constraint WHERE conname='ux_iam_usuario_empresa')    AS unique_membership,   -- esperado 1
  (SELECT count(*) FROM pg_constraint
     WHERE contype='f' AND conrelid='public.iam_usuario_empresa'::regclass)      AS fks_membership,      -- esperado 2 (usuario+empresa)
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass)        AS iam_usuario_rls,        -- true
  (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass)   AS iam_usuario_force,      -- true
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass) AS iam_ue_rls,            -- true
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name IN ('iam_usuario','iam_usuario_empresa')
       AND grantee IN ('anon','authenticated'))                                  AS browser_grants,      -- esperado 0 (deny-browser)
  -- integridad de contextos vecinos (no tocados por R1)
  (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49') AS als_intacto,
  (SELECT count(*) FROM calendario_data)                                         AS calendario_filas,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%') AS proc_tablas_intactas;
