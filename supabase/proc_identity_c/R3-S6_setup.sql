-- ============================================================================
-- R3-S6_setup.sql - Micro-fixture REVOCATION (1 usuario, 1 empresa, 1 membership, 1 fila proc).
-- TARGET: staging (nlvfjpwiecgrosjnwwik). NO ejecutar sin autorizacion explicita.
-- PRE-REQUISITO MANUAL (Dashboard -> Authentication -> Add user, YA HECHO):
--   email = uat-revoke-r3s6@fixture.invalid ; User UID = 78313a98-1a83-4d3d-b11a-eddce226bb3c
-- Fail-closed: preflight autoritativo (fingerprint staging+H2, auth.users exacto, residual=0,
-- invariantes reales) -> INSERT exactos SIN ON CONFLICT (affected_rows deterministas) -> postcheck.
-- Si CUALQUIER objeto fixture ya existe -> ABORT (no auto-heal, no duplica). NO CASCADE. NO secretos.
-- ============================================================================
BEGIN;
DO $r$
DECLARE
  v_auid  uuid := '78313a98-1a83-4d3d-b11a-eddce226bb3c';        -- auth.users.id sintetico (no secreto)
  v_email text := 'uat-revoke-r3s6@fixture.invalid';
  A       uuid := 'f1000000-0000-0000-0000-0000000000aa';        -- empresa fixture A
  IAMID   uuid := 'f1000000-0000-0000-0000-000000000011';        -- iam_usuario fixture
  ANGELO  uuid := '29b0217d-40ed-4fde-84c0-51d51b98c849';        -- binding auth de Angelo (invariante)
  v_als   uuid;
BEGIN
  -- ======================= PREFLIGHT (cualquier desviacion = ABORT) =======================
  -- (0) FINGERPRINT: staging con Identity Bridge + H2 vigente. Production NO tiene esto -> aborta.
  IF to_regclass('public.iam_usuario') IS NULL OR to_regclass('public.iam_usuario_empresa') IS NULL
     OR to_regclass('public.contab_empresas') IS NULL OR to_regclass('public.proc_repaletizaje') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: faltan tablas base (target inesperado).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_current_empresa' AND prosecdef) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: proc_current_empresa SECURITY DEFINER ausente -> bridge no desplegado (posible Production).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id') THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: iam_usuario.auth_user_id ausente -> binding no desplegado (posible Production).';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND left(tablename, 5) = 'proc_'
      AND lower(policyname) ~ '_dev_only$'
  ) <> 0 THEN
    RAISE EXCEPTION
      'PREFLIGHT ABORT: existen policies _DEV_ONLY en proc_* -> H2 no vigente aqui.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND left(tablename, 5) = 'proc_'
      AND lower(policyname) ~ '_empresa$'
  ) < 48 THEN
    RAISE EXCEPTION
      'PREFLIGHT ABORT: <48 policies _empresa en proc_* -> tenant enforcement incompleto.';
  END IF;

  -- (0b) columnas NOT NULL sin default no cubiertas por el fixture -> ABORT informativo (cubre iam_usuario.nombre)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.is_nullable='NO' AND c.column_default IS NULL
      AND (
        (c.table_name='iam_usuario'         AND c.column_name NOT IN ('id','email','nombre','activo','auth_user_id')) OR
        (c.table_name='contab_empresas'     AND c.column_name NOT IN ('id','codigo','nombre')) OR
        (c.table_name='iam_usuario_empresa' AND c.column_name NOT IN ('usuario_id','empresa_id','activo')) OR
        (c.table_name='proc_repaletizaje'   AND c.column_name NOT IN ('empresa_id','motivo'))
      )
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: hay columna(s) NOT NULL sin default no cubiertas por el fixture (revisar schema).';
  END IF;

  -- (1) auth.users: EXACTAMENTE 1 fila id+email; y el email no esta usado por otro auth.users
  IF (SELECT count(*) FROM auth.users WHERE id=v_auid AND lower(btrim(email))=v_email) <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: auth.users(id=%, email=%) != 1 fila exacta.', v_auid, v_email;
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(btrim(email))=v_email) <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: hay >1 auth.users con email %.', v_email;
  END IF;

  -- (2) IDs/keys fixture NO deben existir (sin ON CONFLICT: si existen -> ABORT, no duplica)
  IF EXISTS (SELECT 1 FROM contab_empresas WHERE id=A) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: empresa fixture A ya existe (residual). Correr cleanup antes.';
  END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario WHERE id=IAMID) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: iam fixture ya existe (residual). Correr cleanup antes.';
  END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario WHERE lower(btrim(email))=v_email) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: email fixture ya usado en iam_usuario (residual).';
  END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario WHERE auth_user_id=v_auid) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: auth_user_id fixture ya ligado a un iam_usuario (residual/colision).';
  END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario_empresa WHERE usuario_id=IAMID OR empresa_id=A) THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: membership fixture residual presente.';
  END IF;
  IF (SELECT count(*) FROM proc_repaletizaje WHERE empresa_id=A AND motivo='R3S6-FIXTURE-A') <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: fila proc fixture residual presente.';
  END IF;

  -- (3) invariantes de datos REALES intactos ANTES de tocar nada
  SELECT id INTO v_als FROM contab_empresas WHERE codigo='ALS';
  IF v_als IS NULL THEN RAISE EXCEPTION 'PREFLIGHT ABORT: empresa ALS no encontrada.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=v_als) <> 6 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: ALS memberships != 6.';
  END IF;
  IF (SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') IS DISTINCT FROM ANGELO THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: Angelo binding alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario iu JOIN iam_usuario_empresa m ON m.usuario_id=iu.id AND m.activo
             WHERE lower(btrim(iu.email)) LIKE 'carol%') THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: Carol tiene memberships activas (no debia).';
  END IF;

  -- ======================= INSERTS EXACTOS (sin ON CONFLICT) =======================
  INSERT INTO contab_empresas(id,codigo,nombre) VALUES (A,'UAT-A-R3S6','R3S6 Fixture A');
  INSERT INTO iam_usuario(id,email,nombre,activo,auth_user_id) VALUES (IAMID,v_email,'R3S6 Revoke Fixture',true,v_auid);
  INSERT INTO iam_usuario_empresa(usuario_id,empresa_id,activo) VALUES (IAMID,A,true);
  INSERT INTO proc_repaletizaje(empresa_id,motivo) VALUES (A,'R3S6-FIXTURE-A');

  -- ======================= POSTCHECK =======================
  IF (SELECT count(*) FROM auth.users WHERE id=v_auid AND lower(btrim(email))=v_email) <> 1 THEN RAISE EXCEPTION 'POST FAIL: auth fixture != 1.'; END IF;
  IF (SELECT count(*) FROM contab_empresas WHERE id=A AND codigo='UAT-A-R3S6') <> 1 THEN RAISE EXCEPTION 'POST FAIL: empresa fixture != 1.'; END IF;
  IF (SELECT count(*) FROM iam_usuario WHERE id=IAMID AND auth_user_id=v_auid AND lower(btrim(email))=v_email) <> 1 THEN RAISE EXCEPTION 'POST FAIL: iam fixture/binding != 1.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE usuario_id=IAMID AND empresa_id=A AND activo) <> 1 THEN RAISE EXCEPTION 'POST FAIL: membership activa != 1.'; END IF;
  IF (SELECT count(*) FROM proc_repaletizaje WHERE empresa_id=A AND motivo='R3S6-FIXTURE-A') <> 1 THEN RAISE EXCEPTION 'POST FAIL: proc fixture != 1.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=v_als) <> 6 THEN RAISE EXCEPTION 'POST FAIL: ALS memberships != 6.'; END IF;
  IF (SELECT auth_user_id FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl') IS DISTINCT FROM ANGELO THEN RAISE EXCEPTION 'POST FAIL: Angelo binding alterado.'; END IF;
  IF EXISTS (SELECT 1 FROM iam_usuario iu JOIN iam_usuario_empresa m ON m.usuario_id=iu.id AND m.activo
             WHERE lower(btrim(iu.email)) LIKE 'carol%') THEN RAISE EXCEPTION 'POST FAIL: Carol tiene memberships activas.'; END IF;

  RAISE NOTICE 'R3-S6 setup OK: auth=1, empresa=1, iam(bind %)=1, membership ACTIVE=1, proc=1; ALS=6, Angelo ok, Carol=0.', v_auid;
END
$r$;
COMMIT;
