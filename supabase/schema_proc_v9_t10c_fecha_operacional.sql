-- ============================================================================
-- schema_proc_v9_t10c_fecha_operacional.sql
-- T10C-FECHA-OPERACIONAL-GATE — fecha operacional en el ingreso de lote (ADITIVO).
--
-- Evidencia que habilita esta ruta (no structural-gap):
--   - proc_movimiento.fecha = fecha OPERACIONAL; proc_movimiento.created_at = auditoría (columna
--     independiente, se conserva intacta).
--   - proc_recepcion.fecha = operacional; created_at = auditoría independiente.
--   - Reporting Daily (proc_fn_informe_diario_operacion) ya agrupa por
--     (proc_movimiento.fecha AT TIME ZONE 'America/Santiago')::date → basta sellar fecha operacional.
--   - Postgres tz = Etc/UTC; la tz operacional canónica ('America/Santiago') está ratificada por
--     CURRENT (default de la RPC del informe). No hay columna de tz por empresa/planta (agregarla
--     sería estructural → NO se toca).
--
-- Contrato del parámetro nuevo (aditivo, opcional):
--   - p_fecha_operacional: wall-clock NAIVE de America/Santiago (el frontend NUNCA envía tz;
--     el backend es la autoridad de conversión). Omitido/NULL → now() del servidor.
--   - Conversión DST-correcta vía AT TIME ZONE 'America/Santiago'.
--   - Rechaza fecha futura fuera de tolerancia (10 min de skew).
--   - Sella movimiento.fecha; propaga la MISMA fecha a proc_recepcion.fecha (cabecera↔ledger mismo
--     instante). created_at (auditoría) queda intacto (default now()).
--   - Ledger append-only intacto: solo se agrega la columna fecha al INSERT (no UPDATE/DELETE de
--     movimientos). El UPDATE es sobre proc_recepcion (mutable), no sobre el ledger.
-- ============================================================================

DROP FUNCTION IF EXISTS proc_fn_ingresar_lote_ubicado(uuid,uuid,text,text,text,numeric,uuid,text,uuid,uuid,uuid,uuid,uuid);

CREATE FUNCTION proc_fn_ingresar_lote_ubicado(
  p_empresa_id uuid, p_recepcion_id uuid, p_codigo text, p_especie text, p_variedad text,
  p_kg numeric, p_planta_id uuid, p_temporada text, p_ubicacion_id uuid, p_actor uuid,
  p_productor uuid DEFAULT NULL::uuid, p_predio uuid DEFAULT NULL::uuid, p_cuartel uuid DEFAULT NULL::uuid,
  p_fecha_operacional timestamp DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE v_lote uuid; v_tx uuid := gen_random_uuid(); v_snap jsonb; v_fecha timestamptz;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg del lote debe ser > 0'; END IF;
  -- Fecha operacional: wall-clock naive de America/Santiago → instante UTC (DST-correcto).
  -- Omitida → now(). El navegador NUNCA es autoridad de tz.
  v_fecha := COALESCE(p_fecha_operacional AT TIME ZONE 'America/Santiago', now());
  IF v_fecha > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'La fecha operacional no puede ser futura (% America/Santiago).',
      to_char(v_fecha AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI');
  END IF;
  v_snap := proc_fn_build_origen_snapshot(p_empresa_id, p_productor, p_predio, p_cuartel, p_especie, p_variedad);
  IF v_snap IS NULL OR v_snap = '{}'::jsonb THEN v_snap := NULL;
  ELSE v_snap := v_snap || jsonb_build_object('congelado_at', now()); END IF;
  INSERT INTO proc_lote(empresa_id, recepcion_id, codigo, especie_codigo, variedad_codigo, ubicacion,
    productor_vinculo_id, predio_id, cuartel_id, origen_snapshot, created_by)
  VALUES (p_empresa_id, p_recepcion_id, p_codigo, p_especie, p_variedad, NULL,
    p_productor, p_predio, p_cuartel, v_snap, p_actor) RETURNING id INTO v_lote;
  INSERT INTO proc_movimiento(empresa_id, planta_id, temporada_codigo, tipo_movimiento, naturaleza,
    objeto_tipo, objeto_id, cantidad, ubicacion_destino_id, ref_tipo, ref_id, transaccion_id, created_by, fecha)
  VALUES (p_empresa_id, p_planta_id, p_temporada, 'recepcion', 'entrada',
    'lote', v_lote, p_kg, p_ubicacion_id, 'recepcion', p_recepcion_id, v_tx, p_actor, v_fecha);
  -- Coherencia cabecera↔ledger: si se declaró fecha operacional, la recepción hereda el mismo instante.
  IF p_fecha_operacional IS NOT NULL THEN
    UPDATE proc_recepcion SET fecha = v_fecha WHERE id = p_recepcion_id AND empresa_id = p_empresa_id;
  END IF;
  RETURN v_lote;
END
$function$;
