-- ============================================================================
-- R3-S0_preflight.sql — PRE-FLIGHT staging para R3 (READ-ONLY, fail-closed).
-- Correr PRIMERO en el SQL Editor de gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik).
-- NO crea/altera/borra nada (solo SELECT + DO con RAISE). Si aborta → HARD STOP (no correr R3-S1..S5).
-- Verificar en la barra: URL contiene nlvfjpwiecgrosjnwwik y NO bywovqayuzodbzwsriet.
--
-- Confirma: (a) target=staging por fingerprint estructural; (b) estado POST-R2 (IAM materializado,
-- 6 memberships ALS, Carol=0); (c) estado PRE-R3 (binding/throttle/helpers-v2/whoami ausentes).
-- ROBUSTO al target equivocado: Q1 solo consulta catálogo (no referencia iam_*/proc_* por nombre),
-- así en Producción (sin proc_*/iam_*) aborta con mensaje de guard limpio, no un error de relación.
-- ============================================================================

-- Q1 — fingerprint visible (una fila; todo catálogo-safe, no falla si faltan iam_*/proc_*)
SELECT
  (SELECT count(*) FROM contab_empresas
     WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS')            AS als_exacto,             -- 1
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%') AS proc_tablas,     -- >=30 (staging)
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon')  AS bridge_anon_grants,    -- >0 (bridge DEV_ONLY)
  (SELECT count(*) FROM calendario_data WHERE id='main')                          AS main_presente,          -- 1
  (to_regclass('public.iam_usuario')          IS NOT NULL)                        AS iam_presente,           -- true (post-R1)
  (to_regclass('public.iam_usuario_empresa')  IS NOT NULL)                        AS iam_ue_presente,        -- true (post-R1)
  EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id') AS bind_col_ya_existe,  -- false
  (to_regclass('public.proc_auth_throttle')   IS NOT NULL)                        AS throttle_ya_existe,     -- false
  (to_regproc('public.proc_current_iam_user') IS NOT NULL)                        AS helpers_v2_ya_existen,  -- false
  (to_regproc('public.proc_whoami')           IS NOT NULL)                        AS whoami_ya_existe;       -- false

-- Q2 — guard fail-closed. Los conteos de membership se calculan SOLO tras confirmar que iam_* existe.
DO $s0$
DECLARE
  v_als int; v_proc int; v_bgrant int; v_main int; v_iam boolean; v_mem int; v_carol int;
  v_bind boolean; v_thr boolean; v_v2 boolean; v_who boolean;
BEGIN
  v_als  := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_bind := EXISTS(SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='iam_usuario' AND column_name='auth_user_id');
  v_thr  := to_regclass('public.proc_auth_throttle') IS NOT NULL;
  v_v2   := to_regproc('public.proc_current_iam_user') IS NOT NULL;
  v_who  := to_regproc('public.proc_whoami') IS NOT NULL;

  -- (1) TARGET = staging por fingerprint estructural. Producción (sin proc_*) aborta acá, limpio.
  IF v_als<>1 THEN RAISE EXCEPTION 'R3-S0 ABORT: ALS no exacto (count=%). Target/Core. HARD STOP.', v_als; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'R3-S0 ABORT: proc_* = % (<30). Target NO es staging (Producción no tiene proc_*). HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'R3-S0 ABORT: bridge DEV_ONLY ausente (anon_grants proc_*=0). Target sospechoso. HARD STOP.'; END IF;
  IF v_main<>1 THEN RAISE EXCEPTION 'R3-S0 ABORT: calendario_data.main ausente. HARD STOP.'; END IF;

  -- (2) IAM POST-R2. Sólo tras confirmar que iam_* existe se consultan las membership (evita error de relación).
  IF NOT v_iam THEN RAISE EXCEPTION 'R3-S0 ABORT: iam_* ausente. Correr R1/R2 primero (o target equivocado). HARD STOP.'; END IF;
  v_mem  := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49');
  v_carol:= (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
               WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'R3-S0 ABORT: memberships ALS = % (esperado 6, post-R2). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'R3-S0 ABORT: Carol (cmachuca) tiene % membership (esperado 0 = DENY). HARD STOP y revisar.', v_carol; END IF;

  -- (3) PRE-R3: ningún artefacto de R3 debe existir aún.
  IF v_bind OR v_thr OR v_v2 OR v_who THEN
    RAISE EXCEPTION 'R3-S0 ABORT: estado NO es PRE-R3 (binding=%, throttle=%, helpers_v2=%, whoami=%). R3 ya parcialmente aplicado. STOP y revisar.', v_bind, v_thr, v_v2, v_who;
  END IF;

  RAISE NOTICE 'R3 PRE-STATE OK: staging (proc_*=%, anon_grants=%), post-R2 (iam presente, % memberships ALS, Carol=%), pre-R3 (binding/throttle/helpers-v2/whoami ausentes). Listo para R3-S1 (esperar autorización).', v_proc, v_bgrant, v_mem, v_carol;
END
$s0$;
