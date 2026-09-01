-- ============================================================================
-- R4-B_revoke_anon.sql — RLS-HARDEN-PROC R4-B. Cierra la superficie ANON sobre proc_*.
-- v2 (2026-08-26): FIX del hueco de PUBLIC EXECUTE en funciones (preflight R4-B lo cazo:
--   las 70 proc_fn_* operacionales tienen PUBLIC EXECUTE -> REVOKE FROM anon NO alcanza).
--
--   TABLAS/VISTAS proc_*  : REVOKE ALL FROM anon  (las tablas NO tienen PUBLIC -> alcanza).
--   FUNCIONES proc_fn_*   : (operacionales, EXCLUYE throttle) GRANT EXECUTE a authenticated+service_role
--                           (preservar; service_role explicito para sobrevivir al revoke de PUBLIC),
--                           luego REVOKE EXECUTE FROM anon, PUBLIC.
--   THROTTLE (proc_fn_auth_attempt/reset): NO se tocan (ya server-only: PUBLIC/anon/authenticated
--                           revocado, service_role explicito).
--
-- POST-check EFECTIVO con has_function_privilege (no solo information_schema): anon/PUBLIC=false,
-- authenticated/service_role=true en las operacionales; throttle intacto.
--
-- CORRER SOLO DESPUES de R4-A (dev_uat=0). Precondicion: app 100% authenticated. Con este REVOKE la
-- app DEBE correr como authenticated. TARGET: staging nlvfjpwiecgrosjnwwik. Produccion HANDS-OFF.
--
-- GUARD CRITICO (fail-closed): NUNCA revoca anon USAGE ON SCHEMA, ni objetos no-proc_*
-- (calendario_data / iam_* / contab_* / etc.). Itera solo prefijo proc_/proc_v_/proc_fn_ y aborta
-- si tocaria algo fuera de ese conjunto. Rollback: R4-B_rollback (abajo).
-- NOTA: sin `\set ON_ERROR_STOP` (meta-comando psql, NO soportado por el SQL Editor de Supabase).
-- La atomicidad la da el BEGIN..COMMIT + el DO que hace RAISE: si algo falla no llega al COMMIT y revierte.
-- ============================================================================
BEGIN;
DO $b$
DECLARE
  r record;
  v_calendario_anon_pre  int; v_calendario_anon_post int;
  v_auth_pre  int; v_auth_post int;
  v_anon_proc_pre int; v_anon_proc_post int; v_anon_view_post int;
  v_anon_fn_eff int; v_auth_fn_eff int; v_svc_fn_eff int;
  n_tbl int := 0; n_view int := 0; n_fn int := 0;
  throttle text[] := ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset'];
BEGIN
  -- Guard destino
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\')<30
     THEN RAISE EXCEPTION 'R4-B ABORT: proc_*<30 (no staging).'; END IF;
  -- Precondicion: R4-A completo
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND left(tablename,5)='proc_' AND lower(policyname) ~ '_dev_uat$')<>0
     THEN RAISE EXCEPTION 'R4-B ABORT: quedan _dev_uat (correr R4-A primero).'; END IF;

  -- Baseline de invariantes que NO debemos tocar.
  v_calendario_anon_pre := (SELECT count(*) FROM information_schema.role_table_grants
                            WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data');
  v_auth_pre := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\');
  v_anon_proc_pre := (SELECT count(*) FROM information_schema.role_table_grants
                      WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\');

  -- 1) Tablas base proc_* (incluye envases v10). Sin PUBLIC (public_select=0) -> REVOKE anon alcanza.
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\' LOOP
    IF r.tablename NOT LIKE 'proc\_%' ESCAPE '\' THEN RAISE EXCEPTION 'R4-B GUARD: objeto no-proc %', r.tablename; END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', r.tablename);
    n_tbl := n_tbl + 1;
  END LOOP;

  -- 2) Vistas proc_v_*.
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname LIKE 'proc_v\_%' ESCAPE '\' LOOP
    IF r.viewname NOT LIKE 'proc\_%' ESCAPE '\' THEN RAISE EXCEPTION 'R4-B GUARD: vista no-proc %', r.viewname; END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', r.viewname);
    n_view := n_view + 1;
  END LOOP;

  -- 3) Funciones operacionales proc_fn_* (EXCLUYE throttle). Cierra PUBLIC + anon; preserva authenticated
  --    (ya explicito, idempotente) y service_role (explicito, para sobrevivir el revoke de PUBLIC).
  FOR r IN SELECT p.oid::regprocedure AS sig, p.proname
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\'
             AND NOT (p.proname = ANY(throttle)) LOOP
    IF r.proname NOT LIKE 'proc\_%' THEN RAISE EXCEPTION 'R4-B GUARD: fn no-proc %', r.proname; END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
    n_fn := n_fn + 1;
  END LOOP;

  -- ── POST-CHECK ──
  v_anon_proc_post := (SELECT count(*) FROM information_schema.role_table_grants
                       WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\');
  v_anon_view_post := (SELECT count(*) FROM information_schema.role_table_grants g
                       JOIN pg_views v ON v.viewname=g.table_name AND v.schemaname=g.table_schema
                       WHERE g.grantee='anon' AND g.table_schema='public' AND g.table_name LIKE 'proc_v\_%' ESCAPE '\');
  v_auth_post := (SELECT count(*) FROM information_schema.role_table_grants
                  WHERE grantee='authenticated' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\');
  v_calendario_anon_post := (SELECT count(*) FROM information_schema.role_table_grants
                             WHERE grantee='anon' AND table_schema='public' AND table_name='calendario_data');
  -- efectivo (has_function_privilege) sobre operacionales
  v_anon_fn_eff := (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname=ANY(throttle))
                      AND has_function_privilege('anon', p.oid, 'EXECUTE'));
  v_auth_fn_eff := (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname=ANY(throttle))
                      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  v_svc_fn_eff := (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname=ANY(throttle))
                     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE'));

  IF v_anon_proc_post<>0 THEN RAISE EXCEPTION 'R4-B POST: quedan % grants anon en proc_* tablas.', v_anon_proc_post; END IF;
  IF v_anon_view_post<>0 THEN RAISE EXCEPTION 'R4-B POST: quedan % grants anon en proc_v_*.', v_anon_view_post; END IF;
  IF v_anon_fn_eff<>0 THEN RAISE EXCEPTION 'R4-B POST: % funciones operacionales AUN ejecutables por anon (efectivo/PUBLIC).', v_anon_fn_eff; END IF;
  IF v_auth_fn_eff<>0 THEN RAISE EXCEPTION 'R4-B POST: % funciones operacionales NO ejecutables por authenticated.', v_auth_fn_eff; END IF;
  IF v_svc_fn_eff<>0 THEN RAISE EXCEPTION 'R4-B POST: % funciones operacionales NO ejecutables por service_role.', v_svc_fn_eff; END IF;
  IF (SELECT bool_or(has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(throttle))
     THEN RAISE EXCEPTION 'R4-B POST: throttle quedo ejecutable por anon/authenticated.'; END IF;
  -- invariantes no-regresion
  IF v_auth_post<>v_auth_pre THEN RAISE EXCEPTION 'R4-B POST REGRESION: grants authenticated proc_* (tablas) cambio (% -> %).', v_auth_pre, v_auth_post; END IF;
  IF v_calendario_anon_post<>v_calendario_anon_pre THEN RAISE EXCEPTION 'R4-B POST REGRESION CRITICA: se toco anon@calendario_data (% -> %).', v_calendario_anon_pre, v_calendario_anon_post; END IF;

  RAISE NOTICE 'R4-B OK: REVOKE anon en % tablas, % vistas. % funciones operacionales cerradas (anon/PUBLIC=DENY, auth/service_role=ALLOW). throttle intacto. anon@proc_*=% (pre %). authenticated tablas intacto (%). anon@calendario_data intacto (%).',
    n_tbl, n_view, n_fn, v_anon_proc_post, v_anon_proc_pre, v_auth_post, v_calendario_anon_post;
END $b$;
COMMIT;

-- ============================================================================
-- ROLLBACK R4-B v2 (restaura el baseline EXACTO — DEV/UAT). Re-GRANT anon en tablas/vistas;
-- en funciones operacionales restaura PUBLIC+anon EXECUTE y QUITA el service_role explicito que
-- agrego el forward (vuelve a ejecutar via PUBLIC = baseline). authenticated se mantiene. Throttle NO.
-- ----------------------------------------------------------------------------
-- BEGIN;
-- DO $r$ DECLARE r record; throttle text[] := ARRAY['proc_fn_auth_attempt','proc_fn_auth_reset']; BEGIN
--   FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\' LOOP
--     EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon;', r.tablename); END LOOP;
--   FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname LIKE 'proc_v\_%' ESCAPE '\' LOOP
--     EXECUTE format('GRANT SELECT ON public.%I TO anon;', r.viewname); END LOOP;
--   FOR r IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname LIKE 'proc_fn\_%' ESCAPE '\' AND NOT (p.proname=ANY(throttle)) LOOP
--     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC;', r.sig);
--     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon;', r.sig);
--     EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role;', r.sig);
--   END LOOP;
-- END $r$;
-- COMMIT;
-- ============================================================================
