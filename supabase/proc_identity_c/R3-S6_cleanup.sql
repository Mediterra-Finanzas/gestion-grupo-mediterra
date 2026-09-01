-- ============================================================================
-- R3-S6_cleanup.sql - Elimina SOLO el fixture R3S6. ASCII puro. Fail-closed.
-- TARGET: staging (nlvfjpwiecgrosjnwwik). NO ejecutar sin autorizacion explicita.
-- NO toca auth.users: el auth user sintetico (78313a98...) queda INTACTO para borrado
-- MANUAL en Dashboard -> Authentication despues de que este cleanup pase.
-- Orden de DELETE respeta FKs: proc (hijo de empresa) -> membership -> iam -> empresa.
-- Solo IDs exactos de R3-S6. NO CASCADE. NO secretos.
-- ============================================================================
BEGIN;
DO $r$
DECLARE
  v_auid  uuid := '78313a98-1a83-4d3d-b11a-eddce226bb3c';
  v_email text := 'uat-revoke-r3s6@fixture.invalid';
  A       uuid := 'f1000000-0000-0000-0000-0000000000aa';
  IAMID   uuid := 'f1000000-0000-0000-0000-000000000011';
  ANGELO  uuid := '29b0217d-40ed-4fde-84c0-51d51b98c849';
  v_als   uuid;
  n_proc int; n_mem int; n_iam int; n_emp int;
BEGIN
  -- guard target: staging con bridge desplegado. Production NO tiene proc_current_empresa -> aborta.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_current_empresa' AND prosecdef) THEN
    RAISE EXCEPTION 'CLEANUP ABORT: proc_current_empresa ausente -> target inesperado (posible Production).';
  END IF;
  SELECT id INTO v_als FROM contab_empresas WHERE codigo='ALS';
  IF v_als IS NULL THEN RAISE EXCEPTION 'CLEANUP ABORT: empresa ALS no encontrada.'; END IF;

  -- ===================== DELETE en orden FK (solo IDs exactos R3-S6) =====================
  -- 1) filas proc (hijas de empresa fixture)
  DELETE FROM proc_repaletizaje WHERE empresa_id=A AND motivo='R3S6-FIXTURE-A';
  GET DIAGNOSTICS n_proc = ROW_COUNT;
  -- 2) membership fixture (hija de iam_usuario + contab_empresas)
  DELETE FROM iam_usuario_empresa WHERE usuario_id=IAMID OR empresa_id=A;
  GET DIAGNOSTICS n_mem = ROW_COUNT;
  -- 3) iam_usuario fixture (triple guard: id + email + binding exactos)
  DELETE FROM iam_usuario WHERE id=IAMID AND lower(btrim(email))=v_email AND auth_user_id=v_auid;
  GET DIAGNOSTICS n_iam = ROW_COUNT;
  -- 4) empresa fixture A
  DELETE FROM contab_empresas WHERE id=A AND codigo='UAT-A-R3S6';
  GET DIAGNOSTICS n_emp = ROW_COUNT;
  RAISE NOTICE 'R3-S6 cleanup: proc=% mem=% iam=% emp=% eliminados.', n_proc, n_mem, n_iam, n_emp;

  -- ===================== POSTCHECK (fail-closed) =====================
  IF (SELECT count(*) FROM proc_repaletizaje WHERE empresa_id=A AND motivo='R3S6-FIXTURE-A') <> 0 THEN RAISE EXCEPTION 'POST FAIL: proc fixture != 0.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE usuario_id=IAMID OR empresa_id=A) <> 0 THEN RAISE EXCEPTION 'POST FAIL: membership fixture != 0.'; END IF;
  IF (SELECT count(*) FROM iam_usuario WHERE id=IAMID) <> 0 THEN RAISE EXCEPTION 'POST FAIL: iam fixture != 0.'; END IF;
  IF (SELECT count(*) FROM contab_empresas WHERE id=A) <> 0 THEN RAISE EXCEPTION 'POST FAIL: empresa fixture != 0.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=v_als) <> 6 THEN RAISE EXCEPTION 'POST FAIL: ALS memberships != 6.'; END IF;
  IF (SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') IS DISTINCT FROM ANGELO THEN RAISE EXCEPTION 'POST FAIL: Angelo binding alterado.'; END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario iu JOIN iam_usuario_empresa m ON m.usuario_id=iu.id AND m.activo
             WHERE lower(btrim(iu.email)) LIKE 'carol%') THEN RAISE EXCEPTION 'POST FAIL: Carol tiene memberships activas.'; END IF;
  -- auth.users fixture debe seguir INTACTO (borrado manual posterior en Dashboard)
  IF (SELECT count(*) FROM auth.users WHERE id=v_auid AND lower(btrim(email))=v_email) <> 1 THEN RAISE EXCEPTION 'POST FAIL: auth.users fixture ausente (no debia tocarse).'; END IF;

  RAISE NOTICE 'R3-S6 cleanup OK: proc=0, membership=0, iam=0, empresa=0; ALS=6, Angelo ok, Carol=0; auth.users fixture INTACTO (borrar manual en Dashboard).';
END
$r$;
COMMIT;
