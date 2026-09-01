-- ============================================================================
-- R5-AUTH_M2_apply.sql — Fixture multi-membership/cross-tenant para R5-AUTH (post-R4).
-- Copia EXACTA de R3-S5-C-M2_apply.sql con UN SOLO cambio documentado: el preflight de la
-- era R3-S5 exigia el bridge anon presente (v_bridge>=1). R4-B lo elimino por diseno, asi que
-- aqui se INVIERTE el guard a "anon grants proc_* = 0" (invariante R5: superficie anon cerrada).
-- Todo lo demas (IDs, inserts, postcheck, invariantes) es identico y ya rehearsado (R3-S5 17/17).
--
--   empresa A = f1000000-0000-0000-0000-0000000000aa (UAT-A-R3S5)
--   empresa B = f1000000-0000-0000-0000-0000000000bb (UAT-B-R3S5)
--   iam user  = f1000000-0000-0000-0000-000000000011 (uat-multi-r3s5@fixture.invalid)
-- PRECONDICION: auth.users uat-multi-r3s5@fixture.invalid creado en el Dashboard (Auto Confirm).
-- TARGET: staging nlvfjpwiecgrosjnwwik. Produccion = HANDS-OFF. Reversible con M3.
-- ============================================================================
BEGIN;

DO $pre$
DECLARE
  v_proc int; v_iam boolean; v_als int; v_authu int; v_resid_e int; v_resid_i int;
  v_bridge int; v_als_mem int; v_carol int; v_ang uuid;
BEGIN
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_als  := (SELECT count(*) FROM contab_empresas WHERE codigo='ALS');
  v_authu:= (SELECT count(*) FROM auth.users WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid');
  v_resid_e := (SELECT count(*) FROM contab_empresas WHERE codigo IN ('UAT-A-R3S5','UAT-B-R3S5'));
  v_resid_i := (SELECT count(*) FROM iam_usuario WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid');
  v_bridge  := (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_als_mem := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS'));
  v_carol   := (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  SELECT auth_user_id INTO v_ang FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl';

  IF v_proc<30 THEN RAISE EXCEPTION 'R5-M2 ABORT: proc_*=% (<30). No staging.', v_proc; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'R5-M2 ABORT: iam_* ausente.'; END IF;
  -- CAMBIO R5 (post-R4): antes exigia bridge presente; ahora exige superficie anon CERRADA.
  IF v_bridge<>0 THEN RAISE EXCEPTION 'R5-M2 ABORT: anon grants proc_*=% (esperado 0 post-R4; superficie anon reabierta?).', v_bridge; END IF;
  IF v_als<>1 THEN RAISE EXCEPTION 'R5-M2 ABORT: ALS no exacto (%).', v_als; END IF;
  IF v_authu<>1 THEN RAISE EXCEPTION 'R5-M2 ABORT: auth.users uat-multi cnt=% (esperado 1). Crea el usuario en el Dashboard primero.', v_authu; END IF;
  IF v_resid_e<>0 OR v_resid_i<>0 THEN RAISE EXCEPTION 'R5-M2 ABORT: fixture residual (empresas=%, iam=%). Correr rollback primero.', v_resid_e, v_resid_i; END IF;
  IF v_als_mem<>6 THEN RAISE EXCEPTION 'R5-M2 ABORT: ALS memberships baseline=% (esperado 6).', v_als_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R5-M2 ABORT: Carol baseline=% (esperado 0).', v_carol; END IF;
  IF v_ang IS DISTINCT FROM '29b0217d-40ed-4fde-84c0-51d51b98c849'::uuid THEN RAISE EXCEPTION 'R5-M2 ABORT: Angelo binding baseline alterado (%).', v_ang; END IF;
  RAISE NOTICE 'R5-M2 preflight OK: auth uat=1, anon proc_*=0 (superficie cerrada), sin residual, baseline ALS=6/Carol=0/Angelo intacto. Creando fixture...';
END
$pre$;

-- Empresas fixture (solo codigo+nombre requeridos; resto default)
INSERT INTO contab_empresas(id, codigo, nombre) VALUES
 ('f1000000-0000-0000-0000-0000000000aa','UAT-A-R3S5','FIXTURE R3-S5 A'),
 ('f1000000-0000-0000-0000-0000000000bb','UAT-B-R3S5','FIXTURE R3-S5 B');

-- Usuario IAM sintetico, binding resuelto por email (server-side)
INSERT INTO iam_usuario(id, nombre, email, auth_user_id) VALUES
 ('f1000000-0000-0000-0000-000000000011','UAT Multi R3S5','uat-multi-r3s5@fixture.invalid',
  (SELECT id FROM auth.users WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid'));

-- 2 memberships activas (A y B)
INSERT INTO iam_usuario_empresa(usuario_id, empresa_id, activo) VALUES
 ('f1000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-0000000000aa',true),
 ('f1000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-0000000000bb',true);

-- 1 fila fixture por tenant (marcador en motivo)
INSERT INTO proc_repaletizaje(empresa_id, motivo) VALUES
 ('f1000000-0000-0000-0000-0000000000aa','R3S5-FIXTURE-A'),
 ('f1000000-0000-0000-0000-0000000000bb','R3S5-FIXTURE-B');

-- POST-CHECK (fail-closed)
DO $post$
DECLARE v_e int; v_u int; v_bind uuid; v_authid uuid; v_m int; v_r int; v_als int; v_carol int; v_ang uuid;
BEGIN
  v_e := (SELECT count(*) FROM contab_empresas WHERE codigo IN ('UAT-A-R3S5','UAT-B-R3S5'));
  v_u := (SELECT count(*) FROM iam_usuario WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid');
  SELECT auth_user_id INTO v_bind FROM iam_usuario WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid';
  SELECT id INTO v_authid FROM auth.users WHERE lower(btrim(email))='uat-multi-r3s5@fixture.invalid';
  v_m := (SELECT count(*) FROM iam_usuario_empresa WHERE usuario_id='f1000000-0000-0000-0000-000000000011' AND activo);
  v_r := (SELECT count(*) FROM proc_repaletizaje WHERE motivo IN ('R3S5-FIXTURE-A','R3S5-FIXTURE-B'));
  v_als := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS'));
  v_carol := (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  SELECT auth_user_id INTO v_ang FROM iam_usuario WHERE lower(btrim(email))='ahuerta@grupomediterra.cl';

  IF v_e<>2 THEN RAISE EXCEPTION 'R5-M2 POST FAIL: empresas fixture=% (2).', v_e; END IF;
  IF v_u<>1 THEN RAISE EXCEPTION 'R5-M2 POST FAIL: iam fixture=% (1).', v_u; END IF;
  IF v_bind IS DISTINCT FROM v_authid THEN RAISE EXCEPTION 'R5-M2 POST FAIL: binding=% != auth uat=%.', v_bind, v_authid; END IF;
  IF v_m<>2 THEN RAISE EXCEPTION 'R5-M2 POST FAIL: memberships=% (2).', v_m; END IF;
  IF v_r<>2 THEN RAISE EXCEPTION 'R5-M2 POST FAIL: filas proc=% (2).', v_r; END IF;
  IF v_als<>6 THEN RAISE EXCEPTION 'R5-M2 POST FAIL: ALS memberships=% (6) - invariante roto.', v_als; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R5-M2 POST FAIL: Carol=% (0) - invariante roto.', v_carol; END IF;
  IF v_ang IS DISTINCT FROM '29b0217d-40ed-4fde-84c0-51d51b98c849'::uuid THEN RAISE EXCEPTION 'R5-M2 POST FAIL: Angelo binding alterado (%).', v_ang; END IF;

  RAISE NOTICE 'R5-M2 OK: fixture creado (2 empresas, iam bound a %, 2 memberships, 2 filas proc); ALS=6/Carol=0/Angelo intactos. Commit.', v_authid;
END
$post$;

COMMIT;
