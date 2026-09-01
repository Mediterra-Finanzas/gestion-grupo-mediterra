-- ============================================================================
-- R4-A_LOTE6.sql — SOLO el LOTE 6 (F6, 5 tablas) VERBATIM de R4-A_drop_dev_uat.sql (18/18).
-- TARGET: staging nlvfjpwiecgrosjnwwik. Produccion HANDS-OFF. Entrada esperada: dev_uat schema = 19.
-- ============================================================================
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote6: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote6: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE6 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;
