-- ============================================================================
-- R4-A_rollback.sql — Rollback de R4-A: re-CREATE de las pol_<t>_DEV_UAT con su
-- definición ORIGINAL (schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql): AS PERMISSIVE FOR ALL
-- TO anon USING(true) WITH CHECK(true). Idempotente (DROP IF EXISTS + CREATE). Restaura el
-- bridge anon (POLICY). NO re-otorga grants (eso es rollback de R4-B). NO toca _empresa/_cat,
-- NO toca _dev_only, NO datos. TARGET: staging. DEV/UAT únicamente.
--
-- Cubre las 62 tablas base proc_* (allowlist explícita = inventario R4). DROP IF EXISTS +
-- CREATE por cada una; si una tabla no existe en el corte de staging, se omite (to_regclass).
-- Para rollback de UN lote, correr solo con su sub-array.
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
    'proc_correlativo',
    -- LOTE 8 · v8/v9/v10/reporting/temporadas (14)
    'proc_tipo_movimiento','proc_tipo_envase','proc_envase_movimiento','proc_especie','proc_variedad',
    'proc_cuartel','proc_cliente_productor','proc_cliente_ficha','proc_tipo_documento_contractual',
    'proc_cliente_contrato','proc_reporte_config','proc_reporte_destinatario','proc_reporte_ejecucion',
    'proc_temporada_reapertura_permiso'];
  t text; v_uat int;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t);
      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true)', 'pol_'||t||'_dev_uat', t);
    END IF;
  END LOOP;
  v_uat := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  RAISE NOTICE 'R4-A ROLLBACK OK: % _dev_uat re-creadas (bridge POLICY restaurado). Para restaurar acceso completo, re-otorgar grants (ver ROLLBACK R4-B).', v_uat;
END $r$;
COMMIT;
