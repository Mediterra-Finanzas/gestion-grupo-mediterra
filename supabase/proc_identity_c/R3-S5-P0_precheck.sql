-- ============================================================================
-- R3-S5-P0_precheck.sql — PRE-FLIGHT antes de tocar Vercel/ENV/Auth/Preview. READ-ONLY.
-- Correr en el SQL Editor de gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik). NO muta nada.
-- Confirma que el ladder remoto (R1/R2/S1/S2/S3) está PASS y no hay artefacto S5 inesperado.
-- Si aborta → HARD STOP: no configurar ENV, no deploy, no Auth write.
-- ============================================================================

-- Q1 — estado del ladder (una fila; SOLO catálogo-safe → no falla si faltan iam_*/proc_* en target equivocado)
SELECT
  (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS') AS als_exacto,        -- 1
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')                   AS proc_tablas,       -- >=30
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon')                          AS bridge_anon_grants,-- >0 (bridge DEV_ONLY activo)
  (to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL) AS iam_r1,           -- t
  (EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id'))             AS s1_binding_col,    -- t
  (to_regproc('public.proc_current_iam_user') IS NOT NULL AND to_regproc('public.proc_current_empresa') IS NOT NULL) AS s2_helpers, -- t
  (to_regclass('public.proc_auth_throttle') IS NOT NULL)                                                   AS s3_throttle,       -- t
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'proc_%' AND qual LIKE '%proc_current_empresa%') AS policies_contrato; -- >0
-- (als_memberships/carol/bindings_pobladas/throttle_rows se reportan en el NOTICE del guard, tras confirmar existencia.)

-- Q2 — prestate de auth.users (para saber si ensureUser reusa o crea, y detectar usuarios ajenos/Osiris)
SELECT
  (SELECT count(*) FROM auth.users)                                                                        AS auth_users_total,
  (SELECT count(*) FROM auth.users WHERE lower(btrim(email)) IN (
     'ahuerta@grupomediterra.cl','iparra@allegriaservice.com','lvergara@allegriaservice.com',
     'mgaete@allegriaservice.com','pmoreno@allegriaservice.com','sbustos@allegriaservice.com'))            AS auth_users_cohorte_als,  -- cuántos de los 6 ya existen
  (SELECT count(*) FROM auth.users WHERE lower(btrim(email))='ahuerta@grupomediterra.cl')                  AS angelo_auth_existe,       -- 0=ensureUser creará; 1=reusa
  (SELECT count(*) FROM auth.users WHERE lower(btrim(email))='cmachuca@grupomediterra.cl')                 AS carol_auth_existe;        -- informativo (Carol igual DENY por membership)

-- Guard fail-closed
DO $s5p0$
DECLARE v_als int; v_proc int; v_bg int; v_iam boolean; v_mem int; v_carol int;
        v_bind boolean; v_backfill int; v_v2 boolean; v_thr boolean;
BEGIN
  v_als:=(SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_proc:=(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bg:=(SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_iam:=to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_bind:=EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id');
  v_v2:=to_regproc('public.proc_current_iam_user') IS NOT NULL AND to_regproc('public.proc_current_empresa') IS NOT NULL;
  v_thr:=to_regclass('public.proc_auth_throttle') IS NOT NULL;
  IF v_als<>1 THEN RAISE EXCEPTION 'S5-P0 ABORT: ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'S5-P0 ABORT: proc_* = % (<30). Target NO es staging. HARD STOP.', v_proc; END IF;
  IF v_bg<1 THEN RAISE EXCEPTION 'S5-P0 ABORT: bridge DEV_ONLY ausente. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'S5-P0 ABORT: iam_* ausente (R1/R2). HARD STOP.'; END IF;
  v_mem:=(SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49');
  v_carol:=(SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'S5-P0 ABORT: memberships ALS = % (esperado 6). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'S5-P0 ABORT: Carol tiene % membership (esperado 0). HARD STOP.', v_carol; END IF;
  IF NOT v_bind THEN RAISE EXCEPTION 'S5-P0 ABORT: binding S1 ausente. HARD STOP.'; END IF;
  IF NOT v_v2 THEN RAISE EXCEPTION 'S5-P0 ABORT: helpers S2 ausentes. HARD STOP.'; END IF;
  IF NOT v_thr THEN RAISE EXCEPTION 'S5-P0 ABORT: throttle S3 ausente. HARD STOP.'; END IF;
  v_backfill:=(SELECT count(*) FROM iam_usuario WHERE auth_user_id IS NOT NULL);
  IF v_backfill<>0 THEN RAISE NOTICE 'S5-P0 AVISO: % binding(s) ya poblado(s) (auth_user_id). Esperado 0 pre-primer-login; si ya se probó un login, es normal — confirmar que corresponde a la cohorte.', v_backfill; END IF;
  RAISE NOTICE 'S5-P0 OK: ladder R1/R2/S1/S2/S3 PASS. proc_*=%, bridge activo, ALS memberships=%, Carol=%, bindings poblados=%, throttle_rows=%, binding/helpers/throttle presentes. Listo para DISEÑAR ENV Preview (NO configurar aún).',
    v_proc, v_mem, v_carol, v_backfill, (SELECT count(*) FROM proc_auth_throttle);
END
$s5p0$;
