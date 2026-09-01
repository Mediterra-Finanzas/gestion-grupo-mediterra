-- ============================================================================
-- R3-S5-B_whoami_deploy.sql — Despliega proc_whoami() en staging para certificar el
-- forwarding real del header X-Proc-Empresa a través de Kong/PostgREST (T11-08).
-- proc_whoami() es READ-ONLY (no muta datos): SECURITY DEFINER, STABLE, solo devuelve el
-- contexto resuelto (rol/sub/header/iam/empresa). ELIMINABLE tras certificar (ver rollback).
-- Es DDL aditiva (CREATE FUNCTION) — la única "mutación" es el objeto función. TARGET: staging.
-- Producción bywovqayuzodbzwsriet = HANDS-OFF.
--
-- ROLLBACK (tras certificar):
--   BEGIN; DROP FUNCTION IF EXISTS public.proc_whoami(); COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT (fail-closed): staging post-S3 ─────────────────────────────────
DO $pre$
DECLARE v_proc int; v_thr boolean; v_iam boolean; v_als int; v_v2 boolean;
BEGIN
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_thr  := to_regclass('public.proc_auth_throttle') IS NOT NULL;
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL;
  v_als  := (SELECT count(*) FROM contab_empresas WHERE codigo='ALS');
  v_v2   := to_regproc('public.proc_current_empresa') IS NOT NULL AND to_regproc('public.proc_current_iam_user') IS NOT NULL;
  IF v_proc<30 THEN RAISE EXCEPTION 'S5-B ABORT: proc_*=% (<30). No staging. HARD STOP.', v_proc; END IF;
  IF NOT v_thr THEN RAISE EXCEPTION 'S5-B ABORT: throttle S3 ausente. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'S5-B ABORT: iam_* ausente. HARD STOP.'; END IF;
  IF v_als<>1 THEN RAISE EXCEPTION 'S5-B ABORT: ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF NOT v_v2 THEN RAISE EXCEPTION 'S5-B ABORT: helpers v2 ausentes. HARD STOP.'; END IF;
  RAISE NOTICE 'S5-B preflight OK: staging. Desplegando proc_whoami() (read-only, eliminable)…';
END
$pre$;

-- ── FUNCIÓN READ-ONLY (idéntica a proc_whoami_cert.sql) ──────────────────────
CREATE OR REPLACE FUNCTION public.proc_whoami() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'req_role',    current_setting('role', true),
    'sub',         current_setting('request.jwt.claims', true)::jsonb->>'sub',
    'hdr_empresa', (current_setting('request.headers', true)::jsonb)->>'x-proc-empresa',
    'iam_user',    proc_current_iam_user(),
    'empresa',     proc_current_empresa()
  )
$$;
GRANT EXECUTE ON FUNCTION public.proc_whoami() TO anon, authenticated;

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
DECLARE v_ok boolean; v_exec int;
BEGIN
  v_ok := to_regproc('public.proc_whoami') IS NOT NULL;
  v_exec := (SELECT count(*) FROM information_schema.role_routine_grants
               WHERE routine_schema='public' AND routine_name='proc_whoami'
                 AND grantee IN ('anon','authenticated') AND privilege_type='EXECUTE');
  IF NOT v_ok THEN RAISE EXCEPTION 'S5-B POST FAIL: proc_whoami no creada. ABORT.'; END IF;
  IF v_exec<2 THEN RAISE EXCEPTION 'S5-B POST FAIL: EXECUTE anon/authenticated=% (esperado 2). ABORT.', v_exec; END IF;
  RAISE NOTICE 'S5-B OK: proc_whoami() desplegada (read-only, EXECUTE anon+authenticated). Commit. Recordar DROP tras certificar.';
END
$post$;

COMMIT;
