-- ============================================================================
-- R3-S3_throttle.sql — IAM-R3 micro-gate S3: rate-limit / lockout persistente del endpoint PROC.
-- Materializa SOLO: proc_auth_throttle (tabla deny-browser) + proc_fn_auth_attempt/reset (SECURITY
-- DEFINER, server-only). Serverless-safe: el estado vive en Postgres (autoritativo), NO en memoria
-- de la instancia Vercel. TARGET: gestion-mediterra-staging. Producción bywovqayuzodbzwsriet = HANDS-OFF.
--
-- PRIVACIDAD: la tabla NO guarda email/IP en claro NI PIN/token/secreto — la clave se persiste como
-- md5(email|ip) (bucketing, no credencial). CONCURRENCIA: contador atómico (UPSERT + FOR UPDATE) →
-- N intentos simultáneos no pierden incrementos ni evaden el lockout por carrera. SEGURIDAD: las RPC
-- son server-only (REVOKE anon/authenticated/PUBLIC; solo service_role ejecuta) → el browser no puede
-- leer/escribir el contador ni resetear el de otro usuario.
--
-- BLINDAJE: UNA transacción (BEGIN…COMMIT) + preflight embebido fail-closed (staging post-S2 pre-S3).
-- Target equivocado → RAISE → ROLLBACK (no crea objetos).
--
-- ROLLBACK EXACTO (acotado, no CASCADE; no toca IAM/proc/bridge/otros):
--   BEGIN;
--   DROP FUNCTION IF EXISTS proc_fn_auth_attempt(text,int,int,int);
--   DROP FUNCTION IF EXISTS proc_fn_auth_reset(text);
--   DROP TABLE IF EXISTS proc_auth_throttle;
--   COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed): staging post-S2 pre-S3 ──────────────────
DO $pre$
DECLARE
  v_als int; v_proc int; v_bgrant int; v_main int; v_iam boolean; v_mem int; v_carol int;
  v_bind boolean; v_v2 boolean; v_thr boolean; v_rpc boolean;
BEGIN
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

  IF v_als<>1 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): proc_* = % (<30). Target NO es staging. HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): bridge DEV_ONLY ausente. HARD STOP.'; END IF;
  IF v_main<>1 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): calendario_data.main ausente. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): iam_* ausente. HARD STOP.'; END IF;
  v_mem  := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49');
  v_carol:= (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
               WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): memberships ALS = % (esperado 6). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): Carol tiene % membership (esperado 0). HARD STOP.', v_carol; END IF;
  IF NOT v_bind THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): binding S1 ausente. HARD STOP.'; END IF;
  IF NOT v_v2 THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): helpers S2 ausentes. Correr R3-S2 primero. HARD STOP.'; END IF;
  IF v_thr OR v_rpc THEN RAISE EXCEPTION 'R3-S3 ABORT (ROLLBACK): throttle/RPC YA existen. S3 ya aplicado. STOP y revisar.'; END IF;

  RAISE NOTICE 'R3-S3 preflight OK: staging post-S2 pre-S3 confirmado. Materializando rate-limit…';
END
$pre$;

-- ── TABLA (deny-browser; NO PII en claro: la clave es md5(email|ip)) ─────────
CREATE TABLE IF NOT EXISTS proc_auth_throttle (
  bucket_key   text PRIMARY KEY,           -- md5(lower(email)|ip) — bucketing, no credencial, no PII en claro
  intentos     int  NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
ALTER TABLE proc_auth_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_auth_throttle FORCE ROW LEVEL SECURITY;
REVOKE ALL ON proc_auth_throttle FROM anon, authenticated, PUBLIC;

-- ── RPC attempt: atómico (UPSERT + FOR UPDATE). Registra intento; TRUE=permite, FALSE=bloqueado. ──
CREATE OR REPLACE FUNCTION proc_fn_auth_attempt(
  p_key text, p_max int DEFAULT 5, p_window_secs int DEFAULT 300, p_lock_secs int DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r proc_auth_throttle%ROWTYPE; v_now timestamptz := clock_timestamp(); v_k text := md5(coalesce(p_key,''));
BEGIN
  INSERT INTO proc_auth_throttle(bucket_key, intentos, window_start) VALUES (v_k, 0, v_now)
    ON CONFLICT (bucket_key) DO NOTHING;
  SELECT * INTO r FROM proc_auth_throttle WHERE bucket_key = v_k FOR UPDATE;   -- serializa concurrentes

  IF r.locked_until IS NOT NULL AND r.locked_until > v_now THEN
    RETURN false;                                                             -- en lockout
  END IF;
  IF v_now - r.window_start > make_interval(secs => p_window_secs) THEN
    UPDATE proc_auth_throttle SET intentos = 1, window_start = v_now, locked_until = NULL WHERE bucket_key = v_k;
    RETURN true;                                                             -- ventana nueva
  END IF;
  IF r.intentos + 1 >= p_max THEN
    UPDATE proc_auth_throttle SET intentos = r.intentos + 1,
           locked_until = v_now + make_interval(secs => p_lock_secs) WHERE bucket_key = v_k;
    RETURN false;                                                            -- alcanza el máximo → lock
  END IF;
  UPDATE proc_auth_throttle SET intentos = r.intentos + 1 WHERE bucket_key = v_k;
  RETURN true;
END $$;

-- ── RPC reset: éxito de login → limpia el bucket (no penaliza sesiones válidas). ──
CREATE OR REPLACE FUNCTION proc_fn_auth_reset(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM proc_auth_throttle WHERE bucket_key = md5(coalesce(p_key,''))
$$;

-- ── GRANTS: server-only. El browser (anon/authenticated) NUNCA ejecuta. Solo service_role. ──
DO $g$
DECLARE fn text; has_sr boolean := EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role');
BEGIN
  FOREACH fn IN ARRAY ARRAY['proc_fn_auth_attempt(text,int,int,int)','proc_fn_auth_reset(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated;', fn);
    IF has_sr THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role;', fn); END IF;
  END LOOP;
END
$g$;

-- ── POST-CHECK (fail-closed) ─────────────────────────────────────────────────
DO $post$
DECLARE v_tbl int; v_tbl_rls boolean; v_tbl_force boolean; v_tbl_grants int; v_fns int; v_def int; v_sp int;
        v_exec_browser int; v_rows int;
BEGIN
  v_tbl := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='proc_auth_throttle');
  v_tbl_rls   := (SELECT relrowsecurity FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass);
  v_tbl_force := (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass);
  v_tbl_grants := (SELECT count(*) FROM information_schema.role_table_grants
                     WHERE table_schema='public' AND table_name='proc_auth_throttle' AND grantee IN ('anon','authenticated'));
  v_fns := (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
              AND proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset'));
  v_def := (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
              AND proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset') AND prosecdef);
  v_sp  := (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
              AND proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset')
              AND array_to_string(proconfig,',') LIKE '%search_path=public%');
  v_exec_browser := (SELECT count(*) FROM information_schema.role_routine_grants
                       WHERE routine_schema='public' AND grantee IN ('anon','authenticated') AND privilege_type='EXECUTE'
                         AND routine_name IN ('proc_fn_auth_attempt','proc_fn_auth_reset'));
  v_rows := (SELECT count(*) FROM proc_auth_throttle);

  IF v_tbl<>1 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: proc_auth_throttle no creada (%). ABORT.', v_tbl; END IF;
  IF NOT v_tbl_rls OR NOT v_tbl_force THEN RAISE EXCEPTION 'R3-S3 POST FAIL: throttle sin RLS FORCE. ABORT.'; END IF;
  IF v_tbl_grants<>0 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: throttle no es deny-browser (grants=%). ABORT.', v_tbl_grants; END IF;
  IF v_fns<>2 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: RPC = % (esperado 2). ABORT.', v_fns; END IF;
  IF v_def<>2 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: RPC SECURITY DEFINER = % (esperado 2). ABORT.', v_def; END IF;
  IF v_sp<>2 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: RPC search_path fijo = % (esperado 2). ABORT.', v_sp; END IF;
  IF v_exec_browser<>0 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: browser (anon/authenticated) puede ejecutar RPC (%). ABORT.', v_exec_browser; END IF;
  IF v_rows<>0 THEN RAISE EXCEPTION 'R3-S3 POST FAIL: throttle no vacía (% filas). ABORT.', v_rows; END IF;

  RAISE NOTICE 'R3-S3 OK: proc_auth_throttle (deny-browser, RLS FORCE, clave md5) + 2 RPC (SECURITY DEFINER, search_path fijo, server-only: anon/authenticated sin EXECUTE); vacía. Commit.';
END
$post$;

COMMIT;
