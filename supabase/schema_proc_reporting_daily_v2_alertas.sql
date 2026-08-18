-- ============================================================================
-- schema_proc_reporting_daily_v2_alertas.sql
-- PROC-REPORTING-DAILY-001 · completa el gap de ALERTAS (§13). Aditivo: recolecta las
-- "situaciones que requieren atención" del día desde SoT proc_* y las CONGELA en el snapshot
-- de la ejecución cuando la config tiene incluir_alertas=true. Cero cambios al motor de kg.
-- Referencias humanas (conteo + descripción), nunca UUID. Solo entradas con cantidad>0 (no satura).
-- ============================================================================

-- Colector de alertas operacionales del día (read-only, tenant-scoped por RLS de las vistas fuente).
CREATE OR REPLACE FUNCTION proc_fn_informe_diario_alertas(
  p_empresa uuid, p_fecha date, p_planta uuid DEFAULT NULL, p_tz text DEFAULT 'America/Santiago')
RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH rec AS (
    SELECT * FROM proc_v_recepcion_listado r
    WHERE r.empresa_id = p_empresa
      AND (r.fecha AT TIME ZONE p_tz)::date = p_fecha
      AND (p_planta IS NULL OR r.planta_id = p_planta)
  ), a(tipo, descripcion, cantidad) AS (
    VALUES
      ('recepcion_borrador',  'Recepciones en borrador (sin finalizar)',              (SELECT count(*) FROM rec WHERE estado = 'borrador')),
      ('masa_descuadre',      'Recepciones con descuadre de masa',                    (SELECT count(*) FROM rec WHERE masa_dentro_tolerancia = false)),
      ('qc_rechazado',        'Recepciones con QC rechazado',                         (SELECT count(*) FROM rec WHERE qc_resultado = 'rechazado')),
      ('contrato_bloqueante', 'Recepciones de clientes sin contrato vigente',         (SELECT count(*) FROM rec WHERE nivel_contractual = 'bloqueante')),
      ('hold_activo',         'Pallets con hold / bloqueo operacional activo',        (SELECT count(*) FROM proc_v_pallet_hold h WHERE h.empresa_id = p_empresa AND h.estado = 'activo'))
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('tipo', tipo, 'descripcion', descripcion, 'cantidad', cantidad) ORDER BY cantidad DESC),
    '[]'::jsonb)
  FROM a WHERE cantidad > 0;
$$;
GRANT EXECUTE ON FUNCTION proc_fn_informe_diario_alertas(uuid,date,uuid,text) TO anon, authenticated;

-- Motor de ejecución (aditivo): congela `alertas` en el snapshot cuando incluir_alertas=true.
-- Idénticos: idempotencia, guard de inmutabilidad, estados, destinatarios. Solo se agrega `alertas`.
CREATE OR REPLACE FUNCTION public.proc_fn_reporte_generar_ejecucion(p_empresa uuid, p_config uuid, p_fecha date, p_actor uuid DEFAULT NULL::uuid)
 RETURNS proc_reporte_ejecucion
 LANGUAGE plpgsql
AS $function$
DECLARE cfg proc_reporte_config; ej proc_reporte_ejecucion;
  v_rows jsonb; v_tot_r numeric; v_tot_p numeric; v_n int; v_dest jsonb; v_asunto text; v_con_mov boolean; v_alertas jsonb;
BEGIN
  SELECT * INTO cfg FROM proc_reporte_config WHERE id = p_config AND empresa_id = p_empresa AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'configuración de reporte no encontrada o de otra empresa'; END IF;

  SELECT * INTO ej FROM proc_reporte_ejecucion
    WHERE empresa_id = p_empresa AND config_id = p_config AND fecha_operacional = p_fecha;
  IF FOUND THEN RETURN ej; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.cliente_nombre), '[]'::jsonb),
         COALESCE(SUM(x.kg_recibido), 0), COALESCE(SUM(x.kg_procesado), 0), COUNT(*)
    INTO v_rows, v_tot_r, v_tot_p, v_n
    FROM proc_fn_informe_diario_operacion(
      p_empresa, p_fecha, cfg.planta_id,
      CASE WHEN cfg.alcance = 'cliente' THEN cfg.alcance_cliente_vinculo_id ELSE NULL END,
      cfg.timezone) x;

  v_alertas := CASE WHEN cfg.incluir_alertas
                    THEN proc_fn_informe_diario_alertas(p_empresa, p_fecha, cfg.planta_id, cfg.timezone)
                    ELSE '[]'::jsonb END;

  v_con_mov := (v_tot_r > 0 OR v_tot_p > 0);
  v_dest := COALESCE((SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'email', email, 'tipo', tipo))
                      FROM proc_reporte_destinatario
                      WHERE config_id = p_config AND empresa_id = p_empresa AND activo AND deleted_at IS NULL), '[]'::jsonb);
  v_asunto := COALESCE(NULLIF(cfg.asunto_prefijo, ''), 'Allegria Service · Informe Diario de Operación')
              || ' · ' || to_char(p_fecha, 'DD-MM-YYYY');

  INSERT INTO proc_reporte_ejecucion(
      empresa_id, config_id, tipo_reporte, fecha_operacional, planta_id, timezone,
      alcance, alcance_cliente_vinculo_id, asunto, snapshot, destinatarios_snapshot,
      total_kg_recibido, total_kg_procesado, cantidad_clientes, con_movimiento, estado, created_by)
  VALUES (
      p_empresa, p_config, cfg.tipo_reporte, p_fecha, cfg.planta_id, cfg.timezone,
      cfg.alcance, cfg.alcance_cliente_vinculo_id, v_asunto,
      jsonb_build_object('fecha', p_fecha, 'planta_id', cfg.planta_id, 'timezone', cfg.timezone,
                         'alcance', cfg.alcance, 'clientes', v_rows,
                         'total_kg_recibido', v_tot_r, 'total_kg_procesado', v_tot_p, 'cantidad_clientes', v_n,
                         'alertas', v_alertas),
      v_dest, v_tot_r, v_tot_p, v_n, v_con_mov,
      CASE WHEN NOT v_con_mov AND NOT cfg.enviar_sin_movimiento THEN 'omitido' ELSE 'pendiente' END, p_actor)
  ON CONFLICT (empresa_id, config_id, fecha_operacional) DO NOTHING
  RETURNING * INTO ej;

  IF ej.id IS NULL THEN
    SELECT * INTO ej FROM proc_reporte_ejecucion
      WHERE empresa_id = p_empresa AND config_id = p_config AND fecha_operacional = p_fecha;
  END IF;
  RETURN ej;
END $function$;
