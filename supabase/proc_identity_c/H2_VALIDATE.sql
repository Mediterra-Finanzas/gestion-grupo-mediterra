-- ============================================================================
-- H2_VALIDATE.sql — VALIDACIÓN READ-ONLY del post-estado H2 (A+B). NO muta. TARGET: staging.
-- Matriz de seguridad. Correr DESPUÉS de H2-A (+H2-B). Filas 90+ = RESUMEN.
-- ============================================================================
WITH the48 AS (
  SELECT unnest(ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada','proc_vinculo',
    'proc_planta','proc_predios','proc_calibre','proc_color','proc_recepcion','proc_lote','proc_movimiento','proc_hold',
    'proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad','proc_motivos_descarte',
    'proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion','proc_programa_proceso','proc_orden_proceso',
    'proc_orden_insumo','proc_resultado','proc_resultado_descarte','proc_resultado_merma',
    'proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea','proc_repaletizaje',
    'proc_repaletizaje_origen','proc_repaletizaje_destino',
    'proc_despacho','proc_despacho_linea','proc_despacho_doc',
    'proc_informe','proc_informe_version','proc_informe_fuente','proc_informe_destinatario','proc_informe_envio',
    'proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea',
    'proc_correlativo']) AS t
),
m AS (
  SELECT
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN (SELECT t FROM the48) AND lower(policyname) LIKE 'pol\_%\_dev\_only' ESCAPE '\') AS dev_only_en_48,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN (SELECT t FROM the48) AND lower(policyname) LIKE 'pol\_%\_empresa' ESCAPE '\')  AS empresa_en_48,
    (SELECT count(*) FROM the48)                                                                                                                          AS total_48,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\' AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\') AS dev_uat_total,
    -- bypass a authenticated remanente en cualquier proc_* (permisiva USING/CHECK true a public/authenticated)
    (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\'
       AND permissive='PERMISSIVE' AND (qual='true' OR with_check='true')
       AND ('public'=ANY(roles) OR 'authenticated'=ANY(roles))
       AND tablename IN (SELECT t FROM the48))                                                                                                             AS tablas_auth_bypass_48,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_tipo_envase'::regclass)       AS force_tipo_envase,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_envase_movimiento'::regclass) AS force_envase_mov,
    -- helpers Option C intactos
    (SELECT prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='proc_current_empresa')  AS empresa_secdef,
    -- throttle server-only
    (SELECT bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('proc_fn_auth_attempt','proc_fn_auth_reset')) AS thr_auth,
    -- iam deny-browser
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('iam_usuario','iam_usuario_empresa') AND grantee IN ('anon','authenticated')) AS iam_browser
),
rows AS (
  SELECT * FROM m, LATERAL (VALUES
    ('01 _DEV_ONLY peligrosas en las 48',       '0',    dev_only_en_48::text,        CASE WHEN dev_only_en_48=0 THEN 'PASS' ELSE 'FAIL' END),
    ('02 _empresa productivas en las 48',       total_48::text, empresa_en_48::text, CASE WHEN empresa_en_48=total_48 THEN 'PASS' ELSE 'FAIL' END),
    ('03 tablas auth-bypass en las 48',         '0',    tablas_auth_bypass_48::text, CASE WHEN tablas_auth_bypass_48=0 THEN 'PASS' ELSE 'FAIL' END),
    ('04 _DEV_UAT (anon bridge) intacto',       '>=48', dev_uat_total::text,         CASE WHEN dev_uat_total>=48 THEN 'PASS' ELSE 'WARN' END),
    ('05 FORCE proc_tipo_envase (H2-B)',        'true', COALESCE(force_tipo_envase,false)::text, CASE WHEN force_tipo_envase THEN 'PASS' ELSE 'PEND' END),
    ('06 FORCE proc_envase_movimiento (H2-B)',  'true', COALESCE(force_envase_mov,false)::text,  CASE WHEN force_envase_mov THEN 'PASS' ELSE 'PEND' END),
    ('07 proc_current_empresa SECURITY DEFINER','true', COALESCE(empresa_secdef,false)::text,    CASE WHEN empresa_secdef THEN 'PASS' ELSE 'FAIL' END),
    ('08 throttle server-only (auth=false)',    'false',COALESCE(thr_auth,false)::text,          CASE WHEN COALESCE(thr_auth,false)=false THEN 'PASS' ELSE 'FAIL' END),
    ('09 iam_* deny-browser (grants=0)',        '0',    iam_browser::text,           CASE WHEN iam_browser=0 THEN 'PASS' ELSE 'FAIL' END),
    ('90 RESUMEN · AUTHENTICATED BYPASS = 0',   'YES',  CASE WHEN dev_only_en_48=0 AND tablas_auth_bypass_48=0 THEN 'YES' ELSE 'NO' END,
       CASE WHEN dev_only_en_48=0 AND tablas_auth_bypass_48=0 THEN 'PASS' ELSE 'FAIL' END),
    ('91 RESUMEN · TENANT ENFORCED 48/48',      total_48::text, empresa_en_48::text, CASE WHEN empresa_en_48=total_48 AND dev_only_en_48=0 THEN 'PASS' ELSE 'FAIL' END),
    ('92 RESUMEN · BRIDGE/HELPERS/THROTTLE OK', 'YES',  CASE WHEN dev_uat_total>=48 AND empresa_secdef AND COALESCE(thr_auth,false)=false AND iam_browser=0 THEN 'YES' ELSE 'NO' END,
       CASE WHEN dev_uat_total>=48 AND empresa_secdef AND COALESCE(thr_auth,false)=false AND iam_browser=0 THEN 'PASS' ELSE 'FAIL' END)
  ) AS x(chk, expected, actual, result)
)
SELECT chk AS check, expected, actual, result FROM rows ORDER BY chk;

-- ── H2-D · matriz de vistas (security_invoker heredan RLS de base) ──
-- SELECT c.relname AS vista,
--        (SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name='security_invoker') AS security_invoker
-- FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'proc_v_%' AND c.relkind='v' ORDER BY 1;
