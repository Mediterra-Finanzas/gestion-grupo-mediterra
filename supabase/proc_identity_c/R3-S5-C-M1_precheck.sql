-- ============================================================================
-- R3-S5-C-M1_precheck.sql — MICRO-GATE M1: precheck READ-ONLY antes del fixture
-- multi-membership/cross-tenant. NO muta nada. Correr las 3 queries en staging y pegar
-- resultados. HARD STOP si aparece fixture residual previo. TARGET: nlvfjpwiecgrosjnwwik.
-- ============================================================================

-- ── Q1 · GUARD MATRIX (una fila por check) ───────────────────────────────────
WITH m AS (
  SELECT
    (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')                                   AS proc_tablas,
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon') AS bridge_anon,
    (SELECT (to_regclass('public.proc_auth_throttle') IS NOT NULL))::int                                                     AS s3_throttle,
    (SELECT (to_regproc('public.proc_current_empresa') IS NOT NULL AND to_regproc('public.proc_current_iam_user') IS NOT NULL))::int AS s2_helpers,
    (SELECT (EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id')))::int AS s1_binding,
    (SELECT (to_regproc('public.proc_whoami') IS NOT NULL))::int                                                             AS whoami_present,
    (SELECT (relrowsecurity AND relforcerowsecurity)::int FROM pg_class WHERE oid='public.iam_usuario'::regclass)            AS iam_rls_force,
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('iam_usuario','iam_usuario_empresa') AND grantee IN ('anon','authenticated')) AS iam_browser_grants,
    (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS')) AS als_mem,
    (SELECT count(*) FROM iam_usuario_empresa mm JOIN iam_usuario u ON u.id=mm.usuario_id WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND mm.activo) AS carol_mem,
    (SELECT auth_user_id::text FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')                       AS angelo_binding,
    -- fixture residual (marcador R3S5): iam/empresa/nada previo con el marcador
    (SELECT count(*) FROM iam_usuario WHERE lower(email) LIKE '%r3s5%' OR lower(email) LIKE '%fixture%') AS resid_iam,
    (SELECT count(*) FROM contab_empresas WHERE codigo LIKE 'UAT-%R3S5%' OR upper(nombre) LIKE '%FIXTURE R3-S5%')            AS resid_emp
),
rows AS (
  SELECT * FROM m, LATERAL (VALUES
    ('01 proc_* >=30 (staging)',        (proc_tablas>=30)::text,                    CASE WHEN proc_tablas>=30 THEN 'PASS' ELSE 'STOP' END),
    ('02 bridge DEV_ONLY (anon>=1)',    (bridge_anon>=1)::text,                     CASE WHEN bridge_anon>=1 THEN 'PASS' ELSE 'STOP' END),
    ('03 S1 binding col',               (s1_binding=1)::text,                       CASE WHEN s1_binding=1 THEN 'PASS' ELSE 'STOP' END),
    ('04 S2 helpers v2',                (s2_helpers=1)::text,                       CASE WHEN s2_helpers=1 THEN 'PASS' ELSE 'STOP' END),
    ('05 S3 throttle',                  (s3_throttle=1)::text,                      CASE WHEN s3_throttle=1 THEN 'PASS' ELSE 'STOP' END),
    ('06 proc_whoami presente (temp)',  (whoami_present=1)::text,                   CASE WHEN whoami_present=1 THEN 'PASS' ELSE 'WARN' END),
    ('07 iam_usuario RLS+FORCE',        (iam_rls_force=1)::text,                    CASE WHEN iam_rls_force=1 THEN 'PASS' ELSE 'STOP' END),
    ('08 iam_* deny-browser (grants=0)',(iam_browser_grants=0)::text,               CASE WHEN iam_browser_grants=0 THEN 'PASS' ELSE 'STOP' END),
    ('09 ALS memberships = 6',          als_mem::text,                              CASE WHEN als_mem=6 THEN 'PASS' ELSE 'STOP' END),
    ('10 Carol memberships = 0',        carol_mem::text,                            CASE WHEN carol_mem=0 THEN 'PASS' ELSE 'STOP' END),
    ('11 Angelo binding = 29b0217d',    angelo_binding,                             CASE WHEN angelo_binding='29b0217d-40ed-4fde-84c0-51d51b98c849' THEN 'PASS' ELSE 'STOP' END),
    ('12 fixture residual iam = 0',     resid_iam::text,                            CASE WHEN resid_iam=0 THEN 'PASS' ELSE 'HARD STOP' END),
    ('13 fixture residual empresa = 0', resid_emp::text,                            CASE WHEN resid_emp=0 THEN 'PASS' ELSE 'HARD STOP' END)
  ) AS t(chk, valor, veredicto)
)
SELECT chk AS check, valor, veredicto FROM rows ORDER BY chk;

-- ── Q2 · EMPRESAS EXISTENTES (para elegir/crear A_fix y B_fix) ───────────────
SELECT id, codigo, nombre FROM contab_empresas ORDER BY codigo;

-- ── Q3 · TABLAS proc_* CANDIDATAS (bajo riesgo para 1 fila fixture) ──────────
--   Buscamos una tabla con columna empresa_id, RLS activa, y POCAS columnas NOT NULL
--   sin default (menos fricción para insertar una fila fixture). Menor n_obligatorias = mejor.
SELECT c.relname AS tabla,
       (EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='empresa_id')) AS tiene_empresa_id,
       c.relrowsecurity AS rls,
       (SELECT count(*) FROM information_schema.columns col
          WHERE col.table_schema='public' AND col.table_name=c.relname
            AND col.is_nullable='NO' AND col.column_default IS NULL
            AND col.column_name NOT IN ('id','empresa_id')) AS n_obligatorias_extra,
       (SELECT string_agg(col.column_name||':'||col.data_type, ', ' ORDER BY col.ordinal_position)
          FROM information_schema.columns col
          WHERE col.table_schema='public' AND col.table_name=c.relname
            AND col.is_nullable='NO' AND col.column_default IS NULL
            AND col.column_name NOT IN ('id','empresa_id')) AS columnas_obligatorias
FROM pg_class c
WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%' AND c.relkind='r'
  AND EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='empresa_id')
  AND c.relrowsecurity
ORDER BY n_obligatorias_extra ASC, c.relname
LIMIT 15;
