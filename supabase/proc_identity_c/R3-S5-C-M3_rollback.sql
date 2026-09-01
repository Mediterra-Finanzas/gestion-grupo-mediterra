-- ============================================================================
-- R3-S5-C-M3_rollback.sql — Elimina SOLO el fixture R3S5 (orden FK), affected_rows exactos.
-- NO CASCADE. NO toca datos preexistentes. TARGET: staging. AUTH CLEANUP del auth.users
-- sintético = borrarlo en el Dashboard (Authentication → Users → uat-multi-r3s5@fixture.invalid
-- → Delete), es un side-effect GoTrue explícito, NO se hace por SQL.
-- ============================================================================
BEGIN;

DO $r$
DECLARE n_proc int; n_mem int; n_iam int; n_emp int;
BEGIN
  -- 1) filas proc fixture (hijas de empresa) primero — cualquier marcador R3S5 en las empresas fixture
  --    (incluye la fila de la prueba de escritura MULTI-08).
  DELETE FROM proc_repaletizaje WHERE motivo LIKE 'R3S5%'
    AND empresa_id IN ('f1000000-0000-0000-0000-0000000000aa','f1000000-0000-0000-0000-0000000000bb');
  GET DIAGNOSTICS n_proc = ROW_COUNT;

  -- 2) memberships fixture
  DELETE FROM iam_usuario_empresa WHERE usuario_id='f1000000-0000-0000-0000-000000000011';
  GET DIAGNOSTICS n_mem = ROW_COUNT;

  -- 3) iam sintético
  DELETE FROM iam_usuario WHERE id='f1000000-0000-0000-0000-000000000011'
    AND lower(btrim(email))='uat-multi-r3s5@fixture.invalid';
  GET DIAGNOSTICS n_iam = ROW_COUNT;

  -- 4) empresas fixture
  DELETE FROM contab_empresas WHERE codigo IN ('UAT-A-R3S5','UAT-B-R3S5')
    AND id IN ('f1000000-0000-0000-0000-0000000000aa','f1000000-0000-0000-0000-0000000000bb');
  GET DIAGNOSTICS n_emp = ROW_COUNT;

  RAISE NOTICE 'M3 rollback: proc=% mem=% iam=% emp=% eliminados.', n_proc, n_mem, n_iam, n_emp;

  -- POST: 0 residual fixture; invariantes intactos
  IF (SELECT count(*) FROM contab_empresas WHERE codigo IN ('UAT-A-R3S5','UAT-B-R3S5'))<>0 THEN RAISE EXCEPTION 'M3 FAIL: empresas fixture no eliminadas.'; END IF;
  IF (SELECT count(*) FROM iam_usuario WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid')<>0 THEN RAISE EXCEPTION 'M3 FAIL: iam fixture no eliminado.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE usuario_id='f1000000-0000-0000-0000-000000000011')<>0 THEN RAISE EXCEPTION 'M3 FAIL: memberships fixture no eliminadas.'; END IF;
  IF (SELECT count(*) FROM proc_repaletizaje WHERE motivo LIKE 'R3S5%')<>0 THEN RAISE EXCEPTION 'M3 FAIL: filas proc fixture no eliminadas.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS'))<>6 THEN RAISE EXCEPTION 'M3 FAIL: ALS memberships != 6.'; END IF;
  IF (SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') IS DISTINCT FROM '29b0217d-40ed-4fde-84c0-51d51b98c849'::uuid THEN RAISE EXCEPTION 'M3 FAIL: Angelo binding alterado.'; END IF;

  RAISE NOTICE 'M3 OK: fixture eliminado, invariantes intactos (ALS=6, Angelo ok). Falta AUTH CLEANUP: borrar auth.users uat-multi en el Dashboard. Commit.';
END
$r$;

COMMIT;
