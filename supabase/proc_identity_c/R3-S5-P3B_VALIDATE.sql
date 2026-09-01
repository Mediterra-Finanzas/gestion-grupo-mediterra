-- ============================================================================
-- R3-S5-P3B_VALIDATE.sql — VALIDACIÓN INDEPENDIENTE (READ-ONLY) del gate P3B.
-- NO muta nada: UNA query de solo lectura. Segura de re-correr. TARGET: staging.
-- Devuelve matriz check | expected | actual | result. Filas 90+ = RESUMEN.
-- ============================================================================
WITH
ang AS (  -- fila IAM de Angelo
  SELECT id, email, activo, auth_user_id FROM iam_usuario
   WHERE lower(btrim(email))='ahuerta@grupomediterra.cl'
),
newu AS ( -- auth.users real de ahuerta
  SELECT id FROM auth.users WHERE lower(btrim(email))='ahuerta@grupomediterra.cl'
),
oldu AS ( -- usuario sintético Osiris del binding viejo
  SELECT id, email FROM auth.users WHERE id='207b6125-34ac-4396-a330-e8ecfdb0038c'
),
m AS (
  SELECT
    (SELECT count(*) FROM ang)                                                              AS ang_cnt,
    (SELECT count(*) FROM newu)                                                             AS new_cnt,
    (SELECT auth_user_id FROM ang)                                                          AS ang_bind,
    (SELECT id FROM newu)                                                                   AS new_id,
    (SELECT u.email FROM ang i JOIN auth.users u ON u.id=i.auth_user_id)                    AS join_email,
    (SELECT count(*) FROM oldu)                                                             AS old_cnt,
    (SELECT lower(btrim(email)) FROM oldu)                                                  AS old_email,
    (SELECT count(*) FROM iam_usuario WHERE auth_user_id='207b6125-34ac-4396-a330-e8ecfdb0038c') AS uses_old,
    (SELECT count(*) FROM iam_usuario WHERE auth_user_id=(SELECT id FROM newu))             AS uses_new,
    (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49') AS als_mem,
    (SELECT count(*) FROM iam_usuario_empresa mm JOIN iam_usuario u ON u.id=mm.usuario_id
       WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND mm.activo)              AS carol_mem,
    (SELECT relrowsecurity      FROM pg_class WHERE oid='public.iam_usuario'::regclass)         AS iu_rls,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass)         AS iu_force,
    (SELECT relrowsecurity      FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass) AS iue_rls,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass) AS iue_force,
    (SELECT count(*) FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name IN ('iam_usuario','iam_usuario_empresa')
         AND grantee IN ('anon','authenticated'))                                          AS browser_iam
),
rows AS (
  SELECT * FROM m, LATERAL (VALUES
    ('01','Angelo IAM existe exactamente 1',                'YES', CASE WHEN ang_cnt=1 THEN 'YES' ELSE 'NO' END,       CASE WHEN ang_cnt=1 THEN 'PASS' ELSE 'FAIL' END),
    ('02','auth.users ahuerta existe exactamente 1',        'YES', CASE WHEN new_cnt=1 THEN 'YES' ELSE 'NO' END,       CASE WHEN new_cnt=1 THEN 'PASS' ELSE 'FAIL' END),
    ('03','binding Angelo = auth.users(ahuerta).id',        'YES', CASE WHEN ang_bind IS NOT DISTINCT FROM new_id THEN 'YES' ELSE 'NO' END, CASE WHEN ang_bind IS NOT DISTINCT FROM new_id THEN 'PASS' ELSE 'FAIL' END),
    ('04','JOIN iam↔auth por UUID da email ahuerta',        'YES', CASE WHEN lower(btrim(coalesce(join_email,'')))='ahuerta@grupomediterra.cl' THEN 'YES' ELSE 'NO' END, CASE WHEN lower(btrim(coalesce(join_email,'')))='ahuerta@grupomediterra.cl' THEN 'PASS' ELSE 'FAIL' END),
    ('05','binding Angelo != UUID viejo Osiris',            'YES', CASE WHEN ang_bind IS DISTINCT FROM '207b6125-34ac-4396-a330-e8ecfdb0038c'::uuid THEN 'YES' ELSE 'NO' END, CASE WHEN ang_bind IS DISTINCT FROM '207b6125-34ac-4396-a330-e8ecfdb0038c'::uuid THEN 'PASS' ELSE 'FAIL' END),
    ('06','usuario sintético Osiris SIGUE existiendo',      'YES', CASE WHEN old_cnt=1 THEN 'YES' ELSE 'NO' END,       CASE WHEN old_cnt=1 THEN 'PASS' ELSE 'FAIL' END),
    ('07','Osiris email = a3-otro-tenant@…invalid',         'YES', CASE WHEN old_email='a3-otro-tenant@osiris-sintetico.invalid' THEN 'YES' ELSE 'NO' END, CASE WHEN old_email='a3-otro-tenant@osiris-sintetico.invalid' THEN 'PASS' ELSE 'FAIL' END),
    ('08','ningún iam usa ya el UUID viejo',                '0',   uses_old::text,                                     CASE WHEN uses_old=0 THEN 'PASS' ELSE 'FAIL' END),
    ('09','exactamente 1 iam usa el destino (Angelo)',      '1',   uses_new::text,                                     CASE WHEN uses_new=1 THEN 'PASS' ELSE 'FAIL' END),
    ('10','memberships ALS activas',                        '6',   als_mem::text,                                      CASE WHEN als_mem=6 THEN 'PASS' ELSE 'FAIL' END),
    ('11','Carol memberships activas',                      '0',   carol_mem::text,                                    CASE WHEN carol_mem=0 THEN 'PASS' ELSE 'FAIL' END),
    ('12','iam_usuario RLS ENABLE',                         'YES', CASE WHEN iu_rls THEN 'YES' ELSE 'NO' END,          CASE WHEN iu_rls THEN 'PASS' ELSE 'FAIL' END),
    ('13','iam_usuario FORCE RLS',                          'YES', CASE WHEN iu_force THEN 'YES' ELSE 'NO' END,        CASE WHEN iu_force THEN 'PASS' ELSE 'FAIL' END),
    ('14','iam_usuario_empresa RLS ENABLE',                 'YES', CASE WHEN iue_rls THEN 'YES' ELSE 'NO' END,         CASE WHEN iue_rls THEN 'PASS' ELSE 'FAIL' END),
    ('15','iam_usuario_empresa FORCE RLS',                  'YES', CASE WHEN iue_force THEN 'YES' ELSE 'NO' END,       CASE WHEN iue_force THEN 'PASS' ELSE 'FAIL' END),
    ('16','browser grants iam_* (anon/auth)',              '0',   browser_iam::text,                                  CASE WHEN browser_iam=0 THEN 'PASS' ELSE 'FAIL' END),
    ('90','RESUMEN · BINDING REPARADO',                     'YES',
       CASE WHEN ang_bind IS NOT DISTINCT FROM new_id AND lower(btrim(coalesce(join_email,'')))='ahuerta@grupomediterra.cl' AND uses_new=1 THEN 'YES' ELSE 'NO' END,
       CASE WHEN ang_bind IS NOT DISTINCT FROM new_id AND lower(btrim(coalesce(join_email,'')))='ahuerta@grupomediterra.cl' AND uses_new=1 THEN 'PASS' ELSE 'FAIL' END),
    ('91','RESUMEN · OSIRIS INTACTO',                       'YES',
       CASE WHEN old_cnt=1 AND old_email='a3-otro-tenant@osiris-sintetico.invalid' AND uses_old=0 THEN 'YES' ELSE 'NO' END,
       CASE WHEN old_cnt=1 AND old_email='a3-otro-tenant@osiris-sintetico.invalid' AND uses_old=0 THEN 'PASS' ELSE 'FAIL' END),
    ('92','RESUMEN · MEMBERSHIPS + RLS INTACTOS',           'YES',
       CASE WHEN als_mem=6 AND carol_mem=0 AND iu_rls AND iu_force AND iue_rls AND iue_force AND browser_iam=0 THEN 'YES' ELSE 'NO' END,
       CASE WHEN als_mem=6 AND carol_mem=0 AND iu_rls AND iu_force AND iue_rls AND iue_force AND browser_iam=0 THEN 'PASS' ELSE 'FAIL' END)
  ) AS t(ord, chk, expected, actual, result)
)
SELECT ord AS "#", chk AS check, expected, actual, result FROM rows ORDER BY ord;
