-- ============================================================================
-- R3-S1_binding.sql — IAM-R3 micro-gate S1: binding estable auth.users ↔ iam_usuario.
-- Materializa SOLO: iam_usuario.auth_user_id uuid NULL + índice único parcial. Aditivo, nullable,
-- 1:1, reversible. SIN backfill (el endpoint /api/proc-token lo puebla por email en el 1er login).
-- TARGET: gestion-mediterra-staging (nlvfjpwiecgrosjnwwik). Producción bywovqayuzodbzwsriet = HANDS-OFF.
--
-- BLINDAJE: todo en UNA transacción (BEGIN…COMMIT) con preflight embebido fail-closed (mismo
-- fingerprint estructural de R3-S0 + binding AÚN ausente). Si el target no es staging post-R2 pre-S1,
-- RAISE → ROLLBACK → NO altera nada. Correr en Producción NO materializa el binding.
--
-- ROLLBACK (no destructivo; la columna es nullable y sin datos):
--   BEGIN; DROP INDEX IF EXISTS ux_iam_usuario_auth_user_id;
--          ALTER TABLE iam_usuario DROP COLUMN IF EXISTS auth_user_id; COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed) ─────────────────────────────────────────
DO $pre$
DECLARE
  v_als int; v_proc int; v_bgrant int; v_main int; v_iam boolean; v_mem int; v_carol int; v_bind boolean;
BEGIN
  v_als  := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_bind := EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id');

  IF v_als<>1 THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): proc_* = % (<30). Target NO es staging (Producción no tiene proc_*). HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): bridge DEV_ONLY ausente. Target sospechoso. HARD STOP.'; END IF;
  IF v_main<>1 THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): calendario_data.main ausente. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): iam_* ausente. Correr R1/R2 primero. HARD STOP.'; END IF;
  v_mem  := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49');
  v_carol:= (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
               WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): memberships ALS = % (esperado 6). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): Carol tiene % membership (esperado 0). HARD STOP.', v_carol; END IF;
  IF v_bind THEN RAISE EXCEPTION 'R3-S1 ABORT (ROLLBACK): iam_usuario.auth_user_id YA existe. S1 ya aplicado. STOP y revisar.'; END IF;

  RAISE NOTICE 'R3-S1 preflight OK: staging post-R2 pre-S1 confirmado. Materializando binding…';
END
$pre$;

-- ── BINDING (aditivo, nullable, 1:1) ─────────────────────────────────────────
ALTER TABLE iam_usuario ADD COLUMN IF NOT EXISTS auth_user_id uuid;
-- Unicidad 1:1 solo sobre valores presentes (los legados sin binding no colisionan entre sí).
CREATE UNIQUE INDEX IF NOT EXISTS ux_iam_usuario_auth_user_id
  ON iam_usuario (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ── POST-CHECK (fail-closed) ─────────────────────────────────────────────────
DO $post$
DECLARE v_col text; v_null text; v_idx int; v_backfill int; v_rls boolean; v_force boolean; v_grants int;
BEGIN
  SELECT data_type, is_nullable INTO v_col, v_null FROM information_schema.columns
    WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id';
  v_idx := (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_iam_usuario_auth_user_id');
  v_backfill := (SELECT count(*) FROM iam_usuario WHERE auth_user_id IS NOT NULL);
  v_rls   := (SELECT relrowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass);
  v_force := (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass);
  v_grants := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='iam_usuario' AND grantee IN ('anon','authenticated'));

  IF v_col<>'uuid' THEN RAISE EXCEPTION 'R3-S1 POST FAIL: auth_user_id tipo=% (esperado uuid). ABORT.', v_col; END IF;
  IF v_null<>'YES' THEN RAISE EXCEPTION 'R3-S1 POST FAIL: auth_user_id NOT nullable. ABORT.'; END IF;
  IF v_idx<>1 THEN RAISE EXCEPTION 'R3-S1 POST FAIL: índice único ausente. ABORT.'; END IF;
  IF v_backfill<>0 THEN RAISE EXCEPTION 'R3-S1 POST FAIL: % filas con auth_user_id (esperado 0, sin backfill). ABORT.', v_backfill; END IF;
  IF NOT v_rls OR NOT v_force THEN RAISE EXCEPTION 'R3-S1 POST FAIL: iam_usuario RLS/FORCE alterado. ABORT.'; END IF;
  IF v_grants<>0 THEN RAISE EXCEPTION 'R3-S1 POST FAIL: iam_usuario dejó de ser deny-browser (grants=%). ABORT.', v_grants; END IF;

  RAISE NOTICE 'R3-S1 OK: iam_usuario.auth_user_id (uuid,null) + ux_iam_usuario_auth_user_id creados; sin backfill; deny-browser intacto. Commit.';
END
$post$;

COMMIT;
