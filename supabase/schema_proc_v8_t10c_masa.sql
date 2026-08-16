-- ============================================================================
-- schema_proc_v8_t10c_masa.sql · T10c-MASA — Conciliación de masa en recepción
-- La recepción se captura en 'borrador' (kg pendientes permitidos). El cierre
-- formal (borrador → recibida) valida Σ kg de lotes (LEDGER) vs kg_neto contra
-- una tolerancia dedicada. Sin enforcement por INSERT de lote. Sin "forzar cierre".
-- NO toca ledger/genealogía/ownership/RLS/bounded context (lee ledger, transiciona
-- estado ya existente). Aditivo.
-- ============================================================================

-- ── 1. Tolerancia dedicada de recepción (independiente de tolerancia_masa_pct) ─
ALTER TABLE proc_empresa_config
  ADD COLUMN IF NOT EXISTS tolerancia_recepcion_pct numeric(5,2) NOT NULL DEFAULT 0.50
  CHECK (tolerancia_recepcion_pct >= 0);

-- ── 2. Read-model de conciliación (display; la autoridad es el RPC) ───────────
--    kg_lotes = Σ neto de movimientos de ENTRADA de recepción del ledger.
CREATE OR REPLACE VIEW proc_v_recepcion_conciliacion AS
SELECT r.empresa_id, r.id AS recepcion_id, r.folio, r.estado, r.kg_neto,
  COALESCE(m.kg_lotes, 0)                                              AS kg_lotes,
  r.kg_neto - COALESCE(m.kg_lotes, 0)                                  AS diferencia,
  COALESCE(c.tolerancia_recepcion_pct, 0)                             AS tolerancia_pct,
  r.kg_neto * COALESCE(c.tolerancia_recepcion_pct, 0) / 100           AS tolerancia_abs,
  abs(r.kg_neto - COALESCE(m.kg_lotes, 0))
    <= r.kg_neto * COALESCE(c.tolerancia_recepcion_pct, 0) / 100       AS dentro_tolerancia
FROM proc_recepcion r
LEFT JOIN proc_empresa_config c ON c.empresa_id = r.empresa_id
LEFT JOIN (
  SELECT empresa_id, ref_id AS recepcion_id,
    COALESCE(sum(cantidad) FILTER (WHERE naturaleza='entrada'), 0)
      - COALESCE(sum(cantidad) FILTER (WHERE naturaleza='salida'), 0) AS kg_lotes
  FROM proc_movimiento
  WHERE ref_tipo = 'recepcion' AND objeto_tipo = 'lote'
  GROUP BY empresa_id, ref_id
) m ON m.recepcion_id = r.id AND m.empresa_id = r.empresa_id
WHERE r.deleted_at IS NULL;
ALTER VIEW proc_v_recepcion_conciliacion SET (security_invoker = on);

-- ── 3. RPC de cierre formal: valida masa y transiciona borrador → recibida ────
--    FOR UPDATE serializa cierres concurrentes (READ COMMITTED re-lee el estado).
CREATE OR REPLACE FUNCTION proc_fn_cerrar_recepcion(
  p_empresa uuid, p_recepcion uuid, p_actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_estado text; v_neto numeric; v_lotes numeric; v_tol_pct numeric; v_tol_abs numeric; v_diff numeric;
BEGIN
  SELECT estado, kg_neto INTO v_estado, v_neto FROM proc_recepcion
    WHERE id = p_recepcion AND empresa_id = p_empresa AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recepción no existe o no pertenece a la empresa.';
  END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'La recepción ya fue finalizada (estado: %). No se puede volver a cerrar.', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(cantidad) FILTER (WHERE naturaleza='entrada'), 0)
       - COALESCE(sum(cantidad) FILTER (WHERE naturaleza='salida'), 0)
    INTO v_lotes FROM proc_movimiento
    WHERE empresa_id = p_empresa AND ref_tipo = 'recepcion'
      AND ref_id = p_recepcion AND objeto_tipo = 'lote';

  IF v_lotes <= 0 THEN
    RAISE EXCEPTION 'La recepción no tiene lotes asignados: no hay kilos que conciliar.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(tolerancia_recepcion_pct, 0) INTO v_tol_pct
    FROM proc_empresa_config WHERE empresa_id = p_empresa;
  v_tol_pct := COALESCE(v_tol_pct, 0);
  v_tol_abs := v_neto * v_tol_pct / 100;
  v_diff := v_neto - v_lotes;

  IF abs(v_diff) > v_tol_abs THEN
    RAISE EXCEPTION 'No se puede finalizar: los kilos de los lotes (% kg) no cuadran con el peso neto (% kg). La diferencia (% kg) supera la tolerancia permitida (% kg = % %%). Revisá o corregí los lotes antes de finalizar.',
      round(v_lotes,1), round(v_neto,1), round(abs(v_diff),1), round(v_tol_abs,1), v_tol_pct
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE proc_recepcion SET estado = 'recibida', updated_by = p_actor
    WHERE id = p_recepcion AND empresa_id = p_empresa;

  RETURN jsonb_build_object(
    'estado', 'recibida', 'kg_neto', v_neto, 'kg_lotes', v_lotes,
    'diferencia', v_diff, 'tolerancia_abs', v_tol_abs, 'tolerancia_pct', v_tol_pct);
END $$;
GRANT EXECUTE ON FUNCTION proc_fn_cerrar_recepcion(uuid, uuid, uuid) TO authenticated;

-- FIN T10c-MASA. Aditivo. NO producción.
