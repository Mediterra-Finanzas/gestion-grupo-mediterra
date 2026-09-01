-- ============================================================================
-- H2-A_rollback.sql — Rollback exacto de H2-A: re-CREATE de las 48 pol_<t>_DEV_ONLY
-- con su definición ORIGINAL autoritativa (H1): PERMISSIVE, FOR ALL, TO public,
-- USING(true) WITH CHECK(true). Idempotente (DROP IF EXISTS + CREATE) → restaura el
-- baseline exacto sin importar cuántos lotes se aplicaron. NO toca _empresa, NO toca
-- _DEV_UAT, NO toca grants, NO CASCADE, NO datos. TARGET: staging.
-- Para rollback de UN lote puntual, correr solo con el sub-array de ese lote.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
DO $r$
DECLARE
  tbls text[] := ARRAY[
    -- LOTE 1 · v1 (13)
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada','proc_vinculo',
    'proc_planta','proc_predios','proc_calibre','proc_color','proc_recepcion','proc_lote','proc_movimiento','proc_hold',
    -- LOTE 2 · F2 (14)
    'proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad','proc_motivos_descarte',
    'proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion','proc_programa_proceso','proc_orden_proceso',
    'proc_orden_insumo','proc_resultado','proc_resultado_descarte','proc_resultado_merma',
    -- LOTE 3 · F3 (7)
    'proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea','proc_repaletizaje',
    'proc_repaletizaje_origen','proc_repaletizaje_destino',
    -- LOTE 4 · F4 (3)
    'proc_despacho','proc_despacho_linea','proc_despacho_doc',
    -- LOTE 5 · F5 (5)
    'proc_informe','proc_informe_version','proc_informe_fuente','proc_informe_destinatario','proc_informe_envio',
    -- LOTE 6 · F6 (5)
    'proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea',
    -- LOTE 7 · v7.1 (1)
    'proc_correlativo'];
  t text; n int := array_length(tbls,1); v_dev int;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- solo si la tabla existe (evita error en rehearsal/parcial)
    IF to_regclass('public.'||quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_only', t);
      EXECUTE format('CREATE POLICY %I ON public.%I USING (true) WITH CHECK (true)', 'pol_'||t||'_dev_only', t);
    END IF;
  END LOOP;
  v_dev := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\');
  RAISE NOTICE 'H2-A ROLLBACK OK: % _DEV_ONLY re-creadas (baseline restaurado). Esperado hasta %.', v_dev, n;
END $r$;
COMMIT;
