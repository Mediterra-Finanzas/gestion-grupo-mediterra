-- ============================================================================
-- R4-A_LOTE8.sql — SOLO el LOTE 8 (v8/v9/v10/reporting/temporadas, 14 tablas) VERBATIM de
-- R4-A_drop_dev_uat.sql (18/18). Incluye el catalogo GLOBAL proc_tipo_movimiento (estricta =
-- pol_proc_tipo_movimiento_cat) — el preflight >=1-estricta lo cubre sin caso especial. Usa
-- to_regclass (tabla puede no existir en algun corte) y exige estricta solo si la tabla tiene _dev_uat.
-- TARGET: staging nlvfjpwiecgrosjnwwik. Produccion HANDS-OFF. Entrada esperada: dev_uat schema = 13.
-- ============================================================================
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_tipo_movimiento','proc_tipo_envase','proc_envase_movimiento',
                       'proc_especie','proc_variedad','proc_cuartel','proc_cliente_productor',
                       'proc_cliente_ficha','proc_tipo_documento_contractual','proc_cliente_contrato',
                       'proc_reporte_config','proc_reporte_destinatario','proc_reporte_ejecucion',
                       'proc_temporada_reapertura_permiso'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||quote_ident(t)) IS NULL THEN CONTINUE; END IF;  -- tabla puede no existir en algun corte de staging
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_dev_uat')
       AND v_estrictas < 1
       THEN RAISE EXCEPTION 'R4 ABORT lote8: % sin policy estricta — no dropear su _dev_uat.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||quote_ident(t)) IS NULL THEN CONTINUE; END IF;  -- FIX 2026-08-26: saltar tabla inexistente (staging no tiene proc_temporada_reapertura_permiso); DROP POLICY IF EXISTS no cubre tabla faltante -> 42P01
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t);
  END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote8: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE8 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── POST-CHECK GLOBAL (read-only, informativo) ──
DO $g$
DECLARE v_uat_total int; v_bridge_grants int;
BEGIN
  v_uat_total := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_uat_total<>0 THEN RAISE EXCEPTION 'R4-A POST GLOBAL: quedan % _dev_uat en el schema (esperado 0).', v_uat_total; END IF;
  v_bridge_grants := (SELECT count(*) FROM information_schema.role_table_grants
                      WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\');
  RAISE NOTICE 'R4-A COMPLETO: 0 _dev_uat en schema. AUN quedan % grants anon sobre proc_* -> correr R4-B_revoke_anon.sql para cerrar.', v_bridge_grants;
END $g$;
