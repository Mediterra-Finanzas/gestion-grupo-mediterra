-- ============================================================================
-- R3-S5-C-M2_validate.sql — VALIDACIÓN READ-ONLY del fixture. NO muta. TARGET: staging.
-- ============================================================================
WITH m AS (
  SELECT
    (SELECT count(*) FROM contab_empresas WHERE codigo IN ('UAT-A-R3S5','UAT-B-R3S5'))                                  AS empresas_fix,
    (SELECT count(*) FROM iam_usuario WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid')                       AS iam_fix,
    (SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid')                   AS bind,
    (SELECT id FROM auth.users WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid')                              AS auth_uat,
    (SELECT count(*) FROM iam_usuario_empresa WHERE usuario_id='f1000000-0000-0000-0000-000000000011' AND activo)      AS mem_fix,
    (SELECT count(*) FROM proc_repaletizaje WHERE motivo IN ('R3S5-FIXTURE-A','R3S5-FIXTURE-B'))                        AS proc_fix,
    (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS')) AS als_mem,
    (SELECT count(*) FROM iam_usuario_empresa mm JOIN iam_usuario u ON u.id=mm.usuario_id WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND mm.activo) AS carol_mem,
    (SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')                        AS angelo_bind
),
rows AS (
  SELECT * FROM m, LATERAL (VALUES
    ('01 empresas fixture (A,B)',        '2',   empresas_fix::text, CASE WHEN empresas_fix=2 THEN 'PASS' ELSE 'FAIL' END),
    ('02 iam sintético',                 '1',   iam_fix::text,      CASE WHEN iam_fix=1 THEN 'PASS' ELSE 'FAIL' END),
    ('03 binding = auth.users uat',      'YES', CASE WHEN bind IS NOT DISTINCT FROM auth_uat THEN 'YES' ELSE 'NO' END, CASE WHEN bind IS NOT DISTINCT FROM auth_uat THEN 'PASS' ELSE 'FAIL' END),
    ('04 memberships activas',           '2',   mem_fix::text,      CASE WHEN mem_fix=2 THEN 'PASS' ELSE 'FAIL' END),
    ('05 filas proc fixture',            '2',   proc_fix::text,     CASE WHEN proc_fix=2 THEN 'PASS' ELSE 'FAIL' END),
    ('06 ALS memberships intacto',       '6',   als_mem::text,      CASE WHEN als_mem=6 THEN 'PASS' ELSE 'FAIL' END),
    ('07 Carol intacto',                 '0',   carol_mem::text,    CASE WHEN carol_mem=0 THEN 'PASS' ELSE 'FAIL' END),
    ('08 Angelo binding intacto',        'YES', CASE WHEN angelo_bind='29b0217d-40ed-4fde-84c0-51d51b98c849'::uuid THEN 'YES' ELSE 'NO' END, CASE WHEN angelo_bind='29b0217d-40ed-4fde-84c0-51d51b98c849'::uuid THEN 'PASS' ELSE 'FAIL' END)
  ) AS t(chk, expected, actual, result)
)
SELECT chk AS check, expected, actual, result FROM rows ORDER BY chk;
