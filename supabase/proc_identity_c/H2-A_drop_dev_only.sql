-- ============================================================================
-- H2-A_drop_dev_only.sql — RLS-HARDEN-PROC H2-A. Retira EXCLUSIVamente las 48 policies
-- pol_<t>_dev_only ({public} USING(true) WITH CHECK(true)) que anulan el tenant-scoping
-- para authenticated. Preserva pol_<t>_empresa (estricta) y pol_<t>_dev_uat ({anon}, bridge R4).
-- NOTA DE NOMBRES: en staging los nombres se guardaron en MINÚSCULAS (creados sin comillas →
-- Postgres los pliega): pol_<t>_dev_only / pol_<t>_dev_uat / pol_<t>_empresa. Los checks usan
-- lower(policyname) para ser case-insensitive; el DROP usa el nombre exacto en minúsculas.
-- 7 lotes, cada uno TRANSACCIÓN propia, preflight fail-closed (confirma que cada tabla conserva
-- su _empresa antes de dropear su _dev_only), POST-check. ALLOWLIST EXPLÍCITA (no wildcard).
-- TARGET: staging nlvfjpwiecgrosjnwwik. Producción HANDS-OFF. Precondición: REACT_APP_PROC_AUTH=true+token.
-- ROLLBACK: H2-A_rollback.sql.
-- ============================================================================
\set ON_ERROR_STOP on

-- ── LOTE 1 · v1 (13) ─────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
                       'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
                       'proc_recepcion','proc_lote','proc_movimiento','proc_hold'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\')<30
     THEN RAISE EXCEPTION 'H2 ABORT lote1: proc_*<30 (no staging).'; END IF;
  IF to_regclass('public.proc_recepcion') IS NULL THEN RAISE EXCEPTION 'H2 ABORT lote1: proc_* no materializado.'; END IF;
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote1: % sin pol_%_empresa — no dropear su unica policy tenant.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t);
  END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote1: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote1: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote1: _dev_uat cambió (% -> %).', v_uat_pre, v_uat_post; END IF;
  RAISE NOTICE 'H2 LOTE1 OK: % _dev_only dropeadas; _empresa % intactas; _dev_uat % sin cambio.', n, v_emp, v_uat_post;
END $b$;
COMMIT;

-- ── LOTE 2 · F2 (14) ─────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad',
                       'proc_motivos_descarte','proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion',
                       'proc_programa_proceso','proc_orden_proceso','proc_orden_insumo','proc_resultado',
                       'proc_resultado_descarte','proc_resultado_merma'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote2: % sin pol_%_empresa.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t); END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote2: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote2: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote2: _dev_uat cambió.'; END IF;
  RAISE NOTICE 'H2 LOTE2 OK: % _dev_only dropeadas; _empresa % intactas.', n, v_emp;
END $b$;
COMMIT;

-- ── LOTE 3 · F3 (7) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea',
                       'proc_repaletizaje','proc_repaletizaje_origen','proc_repaletizaje_destino'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote3: % sin pol_%_empresa.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t); END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote3: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote3: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote3: _dev_uat cambió.'; END IF;
  RAISE NOTICE 'H2 LOTE3 OK: % _dev_only dropeadas; _empresa % intactas.', n, v_emp;
END $b$;
COMMIT;

-- ── LOTE 4 · F4 (3) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_despacho','proc_despacho_linea','proc_despacho_doc'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote4: % sin pol_%_empresa.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t); END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote4: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote4: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote4: _dev_uat cambió.'; END IF;
  RAISE NOTICE 'H2 LOTE4 OK: % _dev_only dropeadas; _empresa % intactas.', n, v_emp;
END $b$;
COMMIT;

-- ── LOTE 5 · F5 (5) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_informe','proc_informe_version','proc_informe_fuente','proc_informe_destinatario','proc_informe_envio'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote5: % sin pol_%_empresa.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t); END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote5: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote5: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote5: _dev_uat cambió.'; END IF;
  RAISE NOTICE 'H2 LOTE5 OK: % _dev_only dropeadas; _empresa % intactas.', n, v_emp;
END $b$;
COMMIT;

-- ── LOTE 6 · F6 (5) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote6: % sin pol_%_empresa.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t); END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote6: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote6: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote6: _dev_uat cambió.'; END IF;
  RAISE NOTICE 'H2 LOTE6 OK: % _dev_only dropeadas; _empresa % intactas.', n, v_emp;
END $b$;
COMMIT;

-- ── LOTE 7 · v7.1 (1) ────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_correlativo'];
  t text; n int := array_length(tbls,1); v_uat_pre int; v_dev int; v_emp int; v_uat_post int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_empresa')
       THEN RAISE EXCEPTION 'H2 ABORT lote7: % sin pol_%_empresa.', t, t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t); END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  v_emp := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\');
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_dev<>0 THEN RAISE EXCEPTION 'H2 POST lote7: quedan % _dev_only.', v_dev; END IF;
  IF v_emp<>n THEN RAISE EXCEPTION 'H2 POST lote7: _empresa=% (esperado %).', v_emp, n; END IF;
  IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION 'H2 POST lote7: _dev_uat cambió.'; END IF;
  RAISE NOTICE 'H2 LOTE7 OK: % _dev_only dropeada; _empresa % intacta. TOTAL H2-A: 48 _dev_only retiradas.', n, v_emp;
END $b$;
COMMIT;
