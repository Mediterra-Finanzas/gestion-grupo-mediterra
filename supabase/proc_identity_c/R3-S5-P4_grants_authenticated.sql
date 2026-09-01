-- ============================================================================
-- R3-S5-P4_grants_authenticated.sql — IAM-R3 micro-gate S5-P4: paridad de grants
-- authenticated ← anon sobre proc_*. Root cause del 403 en runtime (Angelo entró a ALS
-- pero las lecturas/RPC daban 403): la app vieja corría con la ANON key (bridge DEV_ONLY),
-- así que proc_* se concedió a `anon`; Opción C corre como `authenticated`, que quedó con
-- grants parciales (SELECT 63 vs 95, EXECUTE 8 vs 70). Un 403 en SELECT/EXECUTE es falta de
-- GRANT (capa previa a RLS). Este gate otorga a `authenticated` EXACTAMENTE los mismos
-- privilegios que `anon` ya tiene en cada objeto proc_* (SELECT/INSERT/UPDATE/DELETE en
-- tablas/vistas; EXECUTE en funciones). TARGET: gestion-mediterra-staging. Producción
-- bywovqayuzodbzwsriet = HANDS-OFF.
--
-- AUTO-SCOPING SEGURO: como se ESPEJA anon, el gate NO otorga lo que anon NO tiene →
-- proc_auth_throttle y los RPC server-only proc_fn_auth_attempt/reset (S3: REVOKE anon,
-- solo service_role) NO se conceden a authenticated → throttle sigue server-only.
-- NO toca RLS/policies (la seguridad de tenant sigue en RLS, re-validada por request).
-- NO toca anon (el bridge DEV_ONLY se retira en R4, no aquí). NO DDL de datos. Aditivo/idempotente.
--
-- BLINDAJE: UNA transacción + preflight fail-closed (staging post-S3) + POST-check de paridad
-- y de que throttle sigue server-only. Cualquier desvío → RAISE → ROLLBACK → HARD STOP.
--
-- ROLLBACK EXACTO (revoca de authenticated SOLO lo que este gate pudo otorgar; no toca anon/
-- service_role ni RLS). Acotado a proc_* espejando lo que anon tiene:
--   BEGIN;
--   DO $r$ DECLARE x record; BEGIN
--     FOR x IN SELECT c.oid, c.relname, pr.priv FROM pg_class c
--       CROSS JOIN LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) pr(priv)
--       WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
--         AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,pr.priv)
--     LOOP EXECUTE format('REVOKE %s ON public.%I FROM authenticated', x.priv, x.relname); END LOOP;
--     FOR x IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
--       WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'proc_%'
--         AND has_function_privilege('anon',p.oid,'EXECUTE')
--     LOOP EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', x.sig); END LOOP;
--   END $r$;
--   COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed): staging post-S3 ─────────────────────────
DO $pre$
DECLARE
  c_als constant uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_proc int; v_bgrant int; v_thr boolean; v_iam boolean; v_als int;
  v_sr boolean; v_auth boolean; v_anon boolean;
BEGIN
  v_sr   := EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role');
  v_auth := EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated');
  v_anon := EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon');
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_thr := to_regclass('public.proc_auth_throttle') IS NOT NULL;
  v_iam := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_als := (SELECT count(*) FROM contab_empresas WHERE id=c_als AND codigo='ALS');

  IF NOT (v_sr AND v_auth AND v_anon) THEN RAISE EXCEPTION 'P4 ABORT (ROLLBACK): faltan roles Supabase (sr=%,auth=%,anon=%). Target NO es Supabase. HARD STOP.', v_sr, v_auth, v_anon; END IF;
  IF v_proc<30 THEN RAISE EXCEPTION 'P4 ABORT (ROLLBACK): proc_*=% (<30). Target NO es staging. HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'P4 ABORT (ROLLBACK): bridge DEV_ONLY (anon grants proc_*) ausente. HARD STOP.'; END IF;
  IF NOT v_thr THEN RAISE EXCEPTION 'P4 ABORT (ROLLBACK): throttle S3 ausente. Correr S3 primero. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'P4 ABORT (ROLLBACK): iam_* ausente. HARD STOP.'; END IF;
  IF v_als<>1 THEN RAISE EXCEPTION 'P4 ABORT (ROLLBACK): ALS no exacto (%). HARD STOP.', v_als; END IF;

  RAISE NOTICE 'P4 preflight OK: staging post-S3. Espejando grants anon→authenticated sobre proc_*…';
END
$pre$;

-- ── GRANTS: espejar anon → authenticated en cada objeto proc_* ───────────────
DO $g$
DECLARE r record; n_tab int := 0; n_fn int := 0;
BEGIN
  -- Tablas/vistas: por objeto, agrupar los privilegios que anon posee y otorgarlos a authenticated
  FOR r IN
    SELECT c.relname AS relname, string_agg(pr.priv, ', ' ORDER BY pr.priv) AS privs
    FROM pg_class c
    CROSS JOIN LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS pr(priv)
    WHERE c.relnamespace='public'::regnamespace
      AND c.relname LIKE 'proc_%'
      AND c.relkind IN ('r','v','m','p')
      AND has_table_privilege('anon', c.oid, pr.priv)
    GROUP BY c.relname
  LOOP
    EXECUTE format('GRANT %s ON public.%I TO authenticated', r.privs, r.relname);
    n_tab := n_tab + 1;
  END LOOP;

  -- Funciones: EXECUTE donde anon lo tiene (regprocedure = firma exacta, tolera overloading)
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname LIKE 'proc_%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    n_fn := n_fn + 1;
  END LOOP;

  RAISE NOTICE 'P4 grants aplicados: % objetos tabla/vista, % funciones (espejo de anon).', n_tab, n_fn;
END
$g$;

-- ── POST-CHECK (fail-closed): paridad + throttle server-only intacto ─────────
DO $post$
DECLARE
  v_gap_sel int; v_gap_ins int; v_gap_upd int; v_gap_del int; v_gap_exec int;
  v_thr_auth int; v_thr_tbl int; v_thr_rls boolean; v_thr_force boolean;
BEGIN
  -- gaps: anon tiene el priv pero authenticated NO (debe ser 0 tras el espejo)
  v_gap_sel := (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
                  AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'SELECT'));
  v_gap_ins := (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
                  AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'INSERT') AND NOT has_table_privilege('authenticated',c.oid,'INSERT'));
  v_gap_upd := (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
                  AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'UPDATE') AND NOT has_table_privilege('authenticated',c.oid,'UPDATE'));
  v_gap_del := (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_%'
                  AND c.relkind IN ('r','v','m','p') AND has_table_privilege('anon',c.oid,'DELETE') AND NOT has_table_privilege('authenticated',c.oid,'DELETE'));
  v_gap_exec := (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'proc_%'
                  AND has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'));
  -- throttle server-only intacto: authenticated NO ejecuta los RPC de throttle ni toca la tabla
  v_thr_auth := (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
                   AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset')
                   AND has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  v_thr_tbl  := (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name='proc_auth_throttle' AND grantee IN ('authenticated','anon'));
  v_thr_rls   := (SELECT relrowsecurity FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass);
  v_thr_force := (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_auth_throttle'::regclass);

  IF v_gap_sel<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: % objetos proc_* con SELECT anon sin authenticated. ABORT.', v_gap_sel; END IF;
  IF v_gap_ins<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: % objetos con INSERT anon sin authenticated. ABORT.', v_gap_ins; END IF;
  IF v_gap_upd<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: % objetos con UPDATE anon sin authenticated. ABORT.', v_gap_upd; END IF;
  IF v_gap_del<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: % objetos con DELETE anon sin authenticated. ABORT.', v_gap_del; END IF;
  IF v_gap_exec<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: % funciones con EXECUTE anon sin authenticated. ABORT.', v_gap_exec; END IF;
  IF v_thr_auth<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: throttle RPC quedó ejecutable por authenticated (%). ABORT.', v_thr_auth; END IF;
  IF v_thr_tbl<>0 THEN RAISE EXCEPTION 'P4 POST FAIL: proc_auth_throttle con grants browser (%). ABORT.', v_thr_tbl; END IF;
  IF NOT (v_thr_rls AND v_thr_force) THEN RAISE EXCEPTION 'P4 POST FAIL: throttle sin RLS FORCE. ABORT.'; END IF;

  RAISE NOTICE 'P4 OK: paridad authenticated←anon en proc_* (SELECT/INSERT/UPDATE/DELETE + EXECUTE, gaps=0); throttle server-only intacto (authenticated sin EXECUTE, tabla deny-browser, RLS FORCE); RLS/anon sin tocar. Commit.';
END
$post$;

COMMIT;
