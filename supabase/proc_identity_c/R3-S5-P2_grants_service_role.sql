-- ============================================================================
-- R3-S5-P2_grants_service_role.sql — IAM-R3 micro-gate S5-P2: grants server-only.
-- Otorga a service_role los privilegios de TABLA que el endpoint /api/proc-token
-- necesita para operar. Root cause del 500 en el Preview: en este staging service_role
-- NO tenía NINGÚN grant sobre estas tablas → PostgREST devolvía 403 (permission denied
-- for table) aunque el rol fuese service_role. `BYPASSRLS` salta las POLICIES, NO otorga
-- el privilegio de tabla: sin GRANT no hay acceso. Esto restaura el default esperado de
-- Supabase (service_role = rol de servicio, NUNCA en el browser). TARGET: gestion-mediterra-
-- staging. Producción bywovqayuzodbzwsriet = HANDS-OFF.
--
-- ALCANCE (mínimo, exacto a lo que el endpoint usa):
--   calendario_data      → SELECT            (roster usuarios + fila 'pins' para validar PIN)
--   iam_usuario          → SELECT, UPDATE    (identidad activa + binding auth_user_id)
--   iam_usuario_empresa  → SELECT            (memberships / autorización)
--   contab_empresas      → SELECT            (lista de empresas en rama multi-membership)
-- NO se otorga INSERT/DELETE (identidad pre-provisionada; el endpoint no crea/borra).
-- NO se toca anon/authenticated, NI RLS, NI datos. El contrato deny-browser de iam_*
-- (REVOKE anon/authenticated + RLS FORCE) queda intacto: este gate SOLO agrega service_role.
--
-- BLINDAJE: UNA transacción (BEGIN…COMMIT) + preflight embebido fail-closed (staging post-S3).
-- Target equivocado → RAISE → ROLLBACK (no otorga nada). Idempotente (GRANT re-ejecutable).
--
-- ROLLBACK EXACTO (si se quisiera revertir; acotado, no toca datos ni otros roles):
--   BEGIN;
--   REVOKE SELECT ON public.calendario_data      FROM service_role;
--   REVOKE SELECT, UPDATE ON public.iam_usuario   FROM service_role;
--   REVOKE SELECT ON public.iam_usuario_empresa   FROM service_role;
--   REVOKE SELECT ON public.contab_empresas       FROM service_role;
--   COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed): staging post-S3 ─────────────────────────
DO $pre$
DECLARE
  v_als int; v_proc int; v_bgrant int; v_main int; v_iam boolean; v_mem int; v_carol int;
  v_bind boolean; v_v2 boolean; v_thr boolean; v_rpc boolean; v_sr boolean;
BEGIN
  v_sr   := EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role');
  v_als  := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_bind := EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id');
  v_v2   := to_regproc('public.proc_current_iam_user') IS NOT NULL AND to_regproc('public.proc_current_empresa') IS NOT NULL;
  v_thr  := to_regclass('public.proc_auth_throttle') IS NOT NULL;
  v_rpc  := to_regproc('public.proc_fn_auth_attempt') IS NOT NULL;

  IF NOT v_sr THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): rol service_role no existe. Target NO es Supabase. HARD STOP.'; END IF;
  IF v_als<>1 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): proc_* = % (<30). Target NO es staging. HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): bridge DEV_ONLY ausente. HARD STOP.'; END IF;
  IF v_main<>1 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): calendario_data.main ausente. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): iam_* ausente. HARD STOP.'; END IF;
  v_mem  := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49');
  v_carol:= (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
               WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): memberships ALS = % (esperado 6). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): Carol tiene % membership (esperado 0). HARD STOP.', v_carol; END IF;
  IF NOT v_bind THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): binding S1 ausente. HARD STOP.'; END IF;
  IF NOT v_v2 THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): helpers S2 ausentes. HARD STOP.'; END IF;
  IF NOT v_thr OR NOT v_rpc THEN RAISE EXCEPTION 'R3-S5-P2 ABORT (ROLLBACK): throttle/RPC S3 ausentes. Correr R3-S3 primero. HARD STOP.'; END IF;

  RAISE NOTICE 'R3-S5-P2 preflight OK: staging post-S3 confirmado. Otorgando grants server-only a service_role…';
END
$pre$;

-- ── GRANTS server-only (aditivos; solo service_role) ─────────────────────────
GRANT SELECT          ON public.calendario_data     TO service_role;
GRANT SELECT, UPDATE  ON public.iam_usuario          TO service_role;
GRANT SELECT          ON public.iam_usuario_empresa  TO service_role;
GRANT SELECT          ON public.contab_empresas      TO service_role;

-- ── POST-CHECK (fail-closed): grants correctos + deny-browser intacto ─────────
DO $post$
DECLARE
  v_cd int; v_iu int; v_iue int; v_ce int; v_browser_iam int;
BEGIN
  v_cd  := (SELECT count(*) FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='calendario_data'
                AND grantee='service_role' AND privilege_type='SELECT');
  v_iu  := (SELECT count(*) FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='iam_usuario'
                AND grantee='service_role' AND privilege_type IN ('SELECT','UPDATE'));
  v_iue := (SELECT count(*) FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='iam_usuario_empresa'
                AND grantee='service_role' AND privilege_type='SELECT');
  v_ce  := (SELECT count(*) FROM information_schema.role_table_grants
              WHERE table_schema='public' AND table_name='contab_empresas'
                AND grantee='service_role' AND privilege_type='SELECT');
  -- Regresión deny-browser: anon/authenticated NO deben ganar NADA sobre iam_* por este gate.
  v_browser_iam := (SELECT count(*) FROM information_schema.role_table_grants
                      WHERE table_schema='public'
                        AND table_name IN ('iam_usuario','iam_usuario_empresa')
                        AND grantee IN ('anon','authenticated'));

  IF v_cd<>1  THEN RAISE EXCEPTION 'R3-S5-P2 POST FAIL: service_role SELECT calendario_data = % (esperado 1). ABORT.', v_cd; END IF;
  IF v_iu<>2  THEN RAISE EXCEPTION 'R3-S5-P2 POST FAIL: service_role SELECT+UPDATE iam_usuario = % (esperado 2). ABORT.', v_iu; END IF;
  IF v_iue<>1 THEN RAISE EXCEPTION 'R3-S5-P2 POST FAIL: service_role SELECT iam_usuario_empresa = % (esperado 1). ABORT.', v_iue; END IF;
  IF v_ce<>1  THEN RAISE EXCEPTION 'R3-S5-P2 POST FAIL: service_role SELECT contab_empresas = % (esperado 1). ABORT.', v_ce; END IF;
  IF v_browser_iam<>0 THEN RAISE EXCEPTION 'R3-S5-P2 POST FAIL: deny-browser roto — anon/authenticated con % grants en iam_*. ABORT.', v_browser_iam; END IF;

  RAISE NOTICE 'R3-S5-P2 OK: service_role con SELECT calendario_data / SELECT+UPDATE iam_usuario / SELECT iam_usuario_empresa / SELECT contab_empresas; deny-browser iam_* intacto (anon/authenticated=0). Commit.';
END
$post$;

COMMIT;
