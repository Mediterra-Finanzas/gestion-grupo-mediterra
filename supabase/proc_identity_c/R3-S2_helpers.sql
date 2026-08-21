-- ============================================================================
-- R3-S2_helpers.sql — IAM-R3 micro-gate S2: helpers de resolución identidad/tenant (Option C).
-- Materializa SOLO 4 funciones (sin tocar el binding de S1, sin tocar datos, sin tocar el contrato
-- empresa_id = proc_current_empresa() de las 61 policies proc_*). TARGET: gestion-mediterra-staging.
-- Producción bywovqayuzodbzwsriet = HANDS-OFF.
--
-- BLINDAJE: UNA transacción (BEGIN…COMMIT) + preflight embebido fail-closed (staging post-S1 pre-S2:
-- binding PRESENTE, helpers v2 AUSENTES). Target equivocado → RAISE → ROLLBACK (no crea nada).
--
-- CONTRATO: AUTH=Supabase Auth (sub=auth.users.id, no se sobrescribe) · IDENTITY=iam_usuario (binding
-- auth_user_id) · AUTHZ=iam_usuario_empresa (ausencia=DENY) · TENANT request-scoped (header
-- X-Proc-Empresa re-validado; single auto) · SIN hook, SIN app_metadata mutable, SIN HS256.
--
-- SEGURIDAD: funciones que leen iam_* son SECURITY DEFINER (owner=postgres, bypassa RLS del owner) con
-- search_path FIJO (public), SIN dynamic SQL, SIN argumentos del browser; sólo exponen un uuid resuelto,
-- NUNCA filas de iam_*. authenticated recibe EXECUTE; anon/PUBLIC REVOCADOS. iam_* sigue deny-browser.
--
-- ROLLBACK EXACTO (restaura v1 de schema_proc_v1.sql; NO CASCADE; no toca datos/binding/bridge):
--   BEGIN;
--   CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid LANGUAGE sql STABLE AS $r$
--     SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'empresa_id','')::uuid $r$;
--   CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid LANGUAGE sql STABLE AS $r$
--     SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid $r$;
--   DROP FUNCTION IF EXISTS proc_current_iam_user();
--   DROP FUNCTION IF EXISTS proc_current_auth_user();
--   COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed): staging post-S1 pre-S2 ──────────────────
DO $pre$
DECLARE
  v_als int; v_proc int; v_bgrant int; v_main int; v_iam boolean; v_mem int; v_carol int;
  v_bind boolean; v_v2 boolean;
BEGIN
  v_als  := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_bind := EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id');
  v_v2   := to_regproc('public.proc_current_iam_user') IS NOT NULL;

  IF v_als<>1 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): proc_* = % (<30). Target NO es staging. HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): bridge DEV_ONLY ausente. Target sospechoso. HARD STOP.'; END IF;
  IF v_main<>1 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): calendario_data.main ausente. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): iam_* ausente. HARD STOP.'; END IF;
  v_mem  := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49');
  v_carol:= (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
               WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): memberships ALS = % (esperado 6). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): Carol tiene % membership (esperado 0). HARD STOP.', v_carol; END IF;
  IF NOT v_bind THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): iam_usuario.auth_user_id ausente. Correr R3-S1 primero. HARD STOP.'; END IF;
  IF v_v2 THEN RAISE EXCEPTION 'R3-S2 ABORT (ROLLBACK): helpers v2 YA existen (proc_current_iam_user). S2 ya aplicado. STOP y revisar.'; END IF;

  RAISE NOTICE 'R3-S2 preflight OK: staging post-S1 pre-S2 confirmado. Materializando helpers…';
END
$pre$;

-- ── (2) sub del JWT = auth.users.id (traza de autenticación; SECURITY INVOKER: solo lee el claim). ──
CREATE OR REPLACE FUNCTION proc_current_auth_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;

-- ── (3) actor IAM autoritativo: sub → iam_usuario ACTIVO por binding. Inactivo/no-binding → NULL. ──
CREATE OR REPLACE FUNCTION proc_current_iam_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT iu.id FROM iam_usuario iu
  WHERE iu.activo
    AND iu.auth_user_id = NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;

-- ── (4) auditoría: actor = iam_usuario.id (NO el sub/auth.users.id). ──────────
CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT proc_current_iam_user()
$$;

-- ── (5) tenant efectivo (request-scoped; autorización SIEMPRE desde iam_usuario_empresa). ──
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_iam uuid; v_req uuid; v_cnt int; v_one uuid;
BEGIN
  v_iam := proc_current_iam_user();
  IF v_iam IS NULL THEN RETURN NULL; END IF;                       -- sin identidad IAM activa → DENY
  v_req := NULLIF( (current_setting('request.headers', true)::jsonb ->> 'x-proc-empresa'), '' )::uuid;
  IF v_req IS NOT NULL THEN                                        -- selección explícita → re-validar
    PERFORM 1 FROM iam_usuario_empresa m WHERE m.usuario_id=v_iam AND m.empresa_id=v_req AND m.activo;
    IF FOUND THEN RETURN v_req; ELSE RETURN NULL; END IF;          -- no autorizada/revocada → DENY inmediato
  END IF;
  SELECT count(*) INTO v_cnt FROM iam_usuario_empresa WHERE usuario_id=v_iam AND activo;
  IF v_cnt = 1 THEN                                                -- single membership → auto
    SELECT empresa_id INTO v_one FROM iam_usuario_empresa WHERE usuario_id=v_iam AND activo LIMIT 1;
    RETURN v_one;
  END IF;
  RETURN NULL;                                                     -- 0 → DENY ; N sin selección → DENY
END $$;

-- ── GRANTS: authenticated ejecuta (las policies proc_* las invocan como authenticated). ──
--   anon/PUBLIC revocados (defensa en profundidad; anon ya no opera proc_* en el target productivo).
DO $g$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'proc_current_auth_user()','proc_current_iam_user()','proc_current_user()','proc_current_empresa()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated;', fn);
  END LOOP;
END
$g$;

-- ── POST-CHECK (fail-closed) ─────────────────────────────────────────────────
DO $post$
DECLARE v_fns int; v_def int; v_sp int; v_exec_auth int; v_exec_anon int; v_iam_grants int;
BEGIN
  SELECT count(*) INTO v_fns FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('proc_current_auth_user','proc_current_iam_user','proc_current_user','proc_current_empresa');
  -- las 3 que leen iam_* deben ser SECURITY DEFINER (prosecdef) con search_path fijo
  SELECT count(*) INTO v_def FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('proc_current_iam_user','proc_current_user','proc_current_empresa') AND prosecdef;
  SELECT count(*) INTO v_sp FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('proc_current_iam_user','proc_current_user','proc_current_empresa')
    AND array_to_string(proconfig,',') LIKE '%search_path=public%';
  SELECT count(*) INTO v_exec_auth FROM information_schema.role_routine_grants
    WHERE routine_schema='public' AND grantee='authenticated' AND privilege_type='EXECUTE'
      AND routine_name IN ('proc_current_auth_user','proc_current_iam_user','proc_current_user','proc_current_empresa');
  SELECT count(*) INTO v_exec_anon FROM information_schema.role_routine_grants
    WHERE routine_schema='public' AND grantee='anon' AND privilege_type='EXECUTE'
      AND routine_name IN ('proc_current_auth_user','proc_current_iam_user','proc_current_user','proc_current_empresa');
  SELECT count(*) INTO v_iam_grants FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('iam_usuario','iam_usuario_empresa') AND grantee IN ('anon','authenticated');

  IF v_fns<>4 THEN RAISE EXCEPTION 'R3-S2 POST FAIL: helpers creados = % (esperado 4). ABORT.', v_fns; END IF;
  IF v_def<>3 THEN RAISE EXCEPTION 'R3-S2 POST FAIL: SECURITY DEFINER = % (esperado 3). ABORT.', v_def; END IF;
  IF v_sp<>3 THEN RAISE EXCEPTION 'R3-S2 POST FAIL: search_path=public fijo = % (esperado 3). ABORT.', v_sp; END IF;
  IF v_exec_auth<>4 THEN RAISE EXCEPTION 'R3-S2 POST FAIL: EXECUTE authenticated = % (esperado 4). ABORT.', v_exec_auth; END IF;
  IF v_exec_anon<>0 THEN RAISE EXCEPTION 'R3-S2 POST FAIL: anon conserva EXECUTE en % función(es). ABORT.', v_exec_anon; END IF;
  IF v_iam_grants<>0 THEN RAISE EXCEPTION 'R3-S2 POST FAIL: iam_* dejó de ser deny-browser (grants=%). ABORT.', v_iam_grants; END IF;

  RAISE NOTICE 'R3-S2 OK: 4 helpers (3 SECURITY DEFINER + search_path fijo); EXECUTE=authenticated, anon revocado; iam_* deny-browser intacto; contrato proc_* sin cambio. Commit.';
END
$post$;

COMMIT;
