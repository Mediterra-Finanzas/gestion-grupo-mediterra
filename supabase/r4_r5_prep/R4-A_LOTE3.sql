-- ============================================================================
-- R4-A_LOTE3.sql — SOLO el LOTE 3 (F3, 7 tablas) extraido VERBATIM de
-- R4-A_drop_dev_uat.sql (rehearsado 18/18). DROP de las pol_<t>_dev_uat del lote 3.
-- Preserva las policies estrictas (_empresa). Preflight fail-closed + POST 0-restantes + NOTICE.
-- TARGET: staging nlvfjpwiecgrosjnwwik. Produccion HANDS-OFF. Rollback: R4-A_rollback.sql (sub-array lote3).
-- Transaccion propia: si algo aborta (RAISE), COMMIT hace rollback -> nada mutado.
-- Estado de entrada esperado: lotes 1-2 aplicados, dev_uat schema = 34.
-- ============================================================================
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea',
                       'proc_repaletizaje','proc_repaletizaje_origen','proc_repaletizaje_destino'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote3: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote3: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE3 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;
