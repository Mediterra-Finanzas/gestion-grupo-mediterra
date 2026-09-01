-- ============================================================================
-- R3-S5-P2_VALIDATE.sql — VALIDACIÓN INDEPENDIENTE (READ-ONLY) del gate R3-S5-P2.
-- NO muta nada: es UNA sola query (sin BEGIN/COMMIT, sin GRANT/DDL/DML). Segura de correr
-- las veces que quieras. TARGET: gestion-mediterra-staging. Producción = HANDS-OFF.
--
-- Devuelve una matriz (una fila por control) con: check | expected | actual | result.
-- Léela de arriba a abajo. Todo lo marcado (PASS-REQUIRED) debe decir PASS; las filas
-- [INFO] son contexto (no fallan). Al final hay 4 filas RESUMEN.
-- ============================================================================
WITH g AS (
  SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('calendario_data','iam_usuario','iam_usuario_empresa','contab_empresas')
),
sr_has AS (  -- helper: ¿service_role tiene <priv> sobre <tabla>?
  SELECT table_name, privilege_type FROM g WHERE grantee='service_role'
),
metrics AS (
  SELECT
    (SELECT count(*) FROM sr_has WHERE table_name='calendario_data'     AND privilege_type='SELECT')                          AS cd_sel,
    (SELECT count(*) FROM sr_has WHERE table_name='calendario_data'     AND privilege_type IN ('INSERT','UPDATE','DELETE'))   AS cd_write,
    (SELECT count(*) FROM sr_has WHERE table_name='iam_usuario'         AND privilege_type='SELECT')                          AS iu_sel,
    (SELECT count(*) FROM sr_has WHERE table_name='iam_usuario'         AND privilege_type='UPDATE')                          AS iu_upd,
    (SELECT count(*) FROM sr_has WHERE table_name='iam_usuario'         AND privilege_type IN ('INSERT','DELETE'))            AS iu_indel,
    (SELECT count(*) FROM sr_has WHERE table_name='iam_usuario_empresa' AND privilege_type='SELECT')                          AS iue_sel,
    (SELECT count(*) FROM sr_has WHERE table_name='iam_usuario_empresa' AND privilege_type IN ('INSERT','UPDATE','DELETE'))   AS iue_write,
    (SELECT count(*) FROM sr_has WHERE table_name='contab_empresas'     AND privilege_type='SELECT')                          AS ce_sel,
    (SELECT count(*) FROM sr_has WHERE table_name='contab_empresas'     AND privilege_type IN ('INSERT','UPDATE','DELETE'))   AS ce_write,
    (SELECT count(*) FROM g WHERE table_name='iam_usuario'         AND grantee IN ('anon','authenticated','PUBLIC'))          AS iu_browser,
    (SELECT count(*) FROM g WHERE table_name='iam_usuario_empresa' AND grantee IN ('anon','authenticated','PUBLIC'))          AS iue_browser,
    (SELECT count(*) FROM g WHERE table_name='contab_empresas'     AND grantee IN ('anon','authenticated','PUBLIC'))          AS ce_browser,
    (SELECT string_agg(grantee||':'||privilege_type, ', ' ORDER BY grantee)
        FROM g WHERE table_name='calendario_data' AND grantee IN ('anon','authenticated','PUBLIC'))                           AS cd_browser_txt,
    (SELECT relrowsecurity      FROM pg_class WHERE oid='public.iam_usuario'::regclass)                                       AS iu_rls,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass)                                       AS iu_force,
    (SELECT relrowsecurity      FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass)                               AS iue_rls,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass)                               AS iue_force,
    (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49')            AS als_mem,
    (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
        WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo)                                                AS carol_mem,
    (SELECT count(*) FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon')                                         AS bridge_grants,
    (SELECT count(*) FROM iam_usuario WHERE auth_user_id IS NOT NULL)                                                         AS bound_cnt
),
rows AS (
  SELECT * FROM metrics, LATERAL (VALUES
    ('01', 'service_role SELECT calendario_data',           'YES', CASE WHEN cd_sel=1  THEN 'YES' ELSE 'NO' END,  CASE WHEN cd_sel=1  THEN 'PASS' ELSE 'FAIL' END),
    ('02', 'service_role SELECT iam_usuario',               'YES', CASE WHEN iu_sel=1  THEN 'YES' ELSE 'NO' END,  CASE WHEN iu_sel=1  THEN 'PASS' ELSE 'FAIL' END),
    ('03', 'service_role UPDATE iam_usuario',               'YES', CASE WHEN iu_upd=1  THEN 'YES' ELSE 'NO' END,  CASE WHEN iu_upd=1  THEN 'PASS' ELSE 'FAIL' END),
    ('04', 'service_role SELECT iam_usuario_empresa',       'YES', CASE WHEN iue_sel=1 THEN 'YES' ELSE 'NO' END,  CASE WHEN iue_sel=1 THEN 'PASS' ELSE 'FAIL' END),
    ('05', 'service_role SELECT contab_empresas',           'YES', CASE WHEN ce_sel=1  THEN 'YES' ELSE 'NO' END,  CASE WHEN ce_sel=1  THEN 'PASS' ELSE 'FAIL' END),
    ('06', 'service_role WRITE calendario_data (I/U/D)',    'NO',  CASE WHEN cd_write=0 THEN 'NO' ELSE 'YES' END, CASE WHEN cd_write=0 THEN 'PASS' ELSE 'FAIL' END),
    ('07', 'service_role INSERT/DELETE iam_usuario',        'NO',  CASE WHEN iu_indel=0 THEN 'NO' ELSE 'YES' END, CASE WHEN iu_indel=0 THEN 'PASS' ELSE 'FAIL' END),
    ('08', 'service_role WRITE iam_usuario_empresa',        'NO',  CASE WHEN iue_write=0 THEN 'NO' ELSE 'YES' END,CASE WHEN iue_write=0 THEN 'PASS' ELSE 'FAIL' END),
    ('09', 'service_role WRITE contab_empresas',            'NO',  CASE WHEN ce_write=0 THEN 'NO' ELSE 'YES' END, CASE WHEN ce_write=0 THEN 'PASS' ELSE 'FAIL' END),
    ('10', 'browser grants iam_usuario (anon/auth/PUBLIC)', '0',   iu_browser::text,                             CASE WHEN iu_browser=0 THEN 'PASS' ELSE 'FAIL' END),
    ('11', 'browser grants iam_usuario_empresa',           '0',   iue_browser::text,                            CASE WHEN iue_browser=0 THEN 'PASS' ELSE 'FAIL' END),
    ('12', 'iam_usuario RLS ENABLE',                        'YES', CASE WHEN iu_rls  THEN 'YES' ELSE 'NO' END,   CASE WHEN iu_rls  THEN 'PASS' ELSE 'FAIL' END),
    ('13', 'iam_usuario FORCE RLS',                         'YES', CASE WHEN iu_force THEN 'YES' ELSE 'NO' END,  CASE WHEN iu_force THEN 'PASS' ELSE 'FAIL' END),
    ('14', 'iam_usuario_empresa RLS ENABLE',               'YES', CASE WHEN iue_rls  THEN 'YES' ELSE 'NO' END,  CASE WHEN iue_rls  THEN 'PASS' ELSE 'FAIL' END),
    ('15', 'iam_usuario_empresa FORCE RLS',                'YES', CASE WHEN iue_force THEN 'YES' ELSE 'NO' END, CASE WHEN iue_force THEN 'PASS' ELSE 'FAIL' END),
    ('16', 'memberships ALS activas',                      '6',   als_mem::text,                                CASE WHEN als_mem=6 THEN 'PASS' ELSE 'FAIL' END),
    ('17', 'Carol memberships activas',                    '0',   carol_mem::text,                              CASE WHEN carol_mem=0 THEN 'PASS' ELSE 'FAIL' END),
    ('18', 'bridge DEV_ONLY (proc_* anon grants)',         '>=1', bridge_grants::text,                          CASE WHEN bridge_grants>=1 THEN 'PASS' ELSE 'FAIL' END),
    -- INFO (contexto, no fallan)
    ('19', '[INFO] iam_usuario con binding auth_user_id',  'sin cambio (0 pre-login)', bound_cnt::text,        'INFO'),
    ('20', '[INFO] calendario_data browser SELECT (legado, NO tocado por P2)', 'pre-existente', COALESCE(cd_browser_txt,'(ninguno)'), 'INFO'),
    -- RESUMEN
    ('90', 'RESUMEN · EXPECTED GRANTS (01-05)', 'ALL PASS',
       CASE WHEN cd_sel=1 AND iu_sel=1 AND iu_upd=1 AND iue_sel=1 AND ce_sel=1 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN cd_sel=1 AND iu_sel=1 AND iu_upd=1 AND iue_sel=1 AND ce_sel=1 THEN 'PASS' ELSE 'FAIL' END),
    ('91', 'RESUMEN · UNEXPECTED service_role GRANTS', '0',
       (cd_write+iu_indel+iue_write+ce_write)::text,
       CASE WHEN (cd_write+iu_indel+iue_write+ce_write)=0 THEN 'PASS' ELSE 'FAIL' END),
    ('92', 'RESUMEN · BROWSER GRANTS en deny-browser (iam_*)', '0',
       (iu_browser+iue_browser)::text,
       CASE WHEN (iu_browser+iue_browser)=0 THEN 'PASS' ELSE 'FAIL' END),
    ('93', 'RESUMEN · RLS INTACT (iam_* enable+force)', 'YES',
       CASE WHEN iu_rls AND iu_force AND iue_rls AND iue_force THEN 'YES' ELSE 'NO' END,
       CASE WHEN iu_rls AND iu_force AND iue_rls AND iue_force THEN 'PASS' ELSE 'FAIL' END)
  ) AS t(ord, chk, expected, actual, result)
)
SELECT ord AS "#", chk AS check, expected, actual, result
FROM rows
ORDER BY ord;
