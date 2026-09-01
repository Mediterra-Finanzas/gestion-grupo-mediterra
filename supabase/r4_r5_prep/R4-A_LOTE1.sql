-- ============================================================================
-- R4-A_LOTE1.sql — SOLO el LOTE 1 (v1, 13 tablas) extraido VERBATIM de
-- R4-A_drop_dev_uat.sql (rehearsado 18/18). DROP de las pol_<t>_dev_uat del lote 1.
-- Preserva las policies estrictas (_empresa). Preflight fail-closed + POST 0-restantes + NOTICE.
-- TARGET: staging nlvfjpwiecgrosjnwwik. Produccion HANDS-OFF. Rollback: R4-A_rollback.sql (sub-array lote1).
-- Transaccion propia: si algo aborta (RAISE), COMMIT hace rollback -> nada mutado.
-- ============================================================================
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
                       'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
                       'proc_recepcion','proc_lote','proc_movimiento','proc_hold'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  -- Guard destino R4: proc_* materializado (NO el clean-staging guard). Bridge anon debe existir.
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\')<30
     THEN RAISE EXCEPTION 'R4 ABORT lote1: proc_*<30 (no staging).'; END IF;
  IF to_regclass('public.proc_recepcion') IS NULL THEN RAISE EXCEPTION 'R4 ABORT lote1: proc_* no materializado.'; END IF;
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  -- PREFLIGHT fail-closed: cada tabla conserva >=1 policy estricta antes de tocar su _dev_uat.
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote1: % sin policy estricta — dropear su _dev_uat lo dejaria sin enforcement.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote1: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE1 OK: % _dev_uat dropeadas (de % presentes); 0 restantes; estrictas intactas.', v_dropped, v_uat_pre;
END $b$;
COMMIT;
