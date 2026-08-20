-- ============================================================================
-- schema_proc_v8_t8_gates_contractuales.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T8
-- Gates contractuales (D11/D12). Backend = autoridad. La recepción física SIEMPRE
-- es registrable (D12); el bloqueo aplica al AVANCE según politica_contrato de la
-- ficha. Contrato ≠ tarifario (controles independientes).
-- ============================================================================

-- ── Estado contractual del cliente a una fecha (lectura) ────────────────────
-- Devuelve nivel/estado_display + si hay contrato vigente que satisface el requisito.
CREATE OR REPLACE FUNCTION proc_fn_estado_contractual_cliente(p_empresa uuid, p_cliente uuid, p_fecha date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v_pol text; v_vig boolean; v_hasta date; v_display text; v_nivel text;
BEGIN
  SELECT politica_contrato INTO v_pol FROM proc_cliente_ficha
    WHERE empresa_id=p_empresa AND cliente_vinculo_id=p_cliente AND deleted_at IS NULL;
  v_pol := COALESCE(v_pol, 'no_requerido');

  SELECT count(*) > 0, max(c.fecha_termino) INTO v_vig, v_hasta
  FROM proc_cliente_contrato c
  LEFT JOIN proc_tipo_documento_contractual td ON td.id = c.tipo_documento_id
  WHERE c.empresa_id=p_empresa AND c.cliente_vinculo_id=p_cliente AND c.estado='vigente'
    AND COALESCE(td.satisface_requisito_contractual, true)
    AND (c.requiere_firma=false OR c.fecha_firma IS NOT NULL)
    AND (c.fecha_inicio IS NULL OR c.fecha_inicio <= p_fecha)
    AND (c.fecha_termino IS NULL OR c.fecha_termino >= p_fecha)
    AND c.deleted_at IS NULL;
  v_vig := COALESCE(v_vig, false);

  IF v_pol = 'no_requerido' THEN
    v_nivel := 'info'; v_display := CASE WHEN v_vig THEN 'Contrato vigente' ELSE 'Sin requisito de contrato' END;
  ELSIF v_vig THEN
    v_nivel := 'ok'; v_display := 'Contrato vigente' || COALESCE(' hasta '||to_char(v_hasta,'DD-MM-YYYY'), '');
  ELSE
    v_nivel := v_pol;  -- informativo | advertencia | bloqueante
    v_display := 'Sin contrato firmado vigente';
  END IF;

  RETURN jsonb_build_object('nivel', v_nivel, 'estado_display', v_display,
                            'tiene_contrato_vigente', v_vig, 'politica', v_pol);
END $$;

-- ── Habilitación para operar por etapa (D12) ────────────────────────────────
-- etapa 'recepcion' → SIEMPRE habilitado (no se pierde trazabilidad física),
--   pero devuelve el nivel de alerta. Otras etapas: bloqueante inhabilita.
CREATE OR REPLACE FUNCTION proc_fn_cliente_habilitado_para_operar(
  p_empresa uuid, p_cliente uuid, p_fecha date DEFAULT current_date, p_etapa text DEFAULT 'proceso'
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v jsonb; v_nivel text; v_hab boolean; v_activo boolean;
BEGIN
  -- cliente activo (ficha inactiva bloquea el avance, no la recepción física)
  SELECT (estado='activo') INTO v_activo FROM proc_cliente_ficha
    WHERE empresa_id=p_empresa AND cliente_vinculo_id=p_cliente AND deleted_at IS NULL;
  v_activo := COALESCE(v_activo, true);  -- sin ficha = no restringido por estado

  v := proc_fn_estado_contractual_cliente(p_empresa, p_cliente, p_fecha);
  v_nivel := v->>'nivel';

  IF p_etapa = 'recepcion' THEN
    v_hab := true;  -- D12: la fruta que llegó SIEMPRE se registra
  ELSE
    v_hab := (v_nivel <> 'bloqueante') AND v_activo;
  END IF;

  RETURN jsonb_build_object('habilitado', v_hab, 'nivel', v_nivel, 'etapa', p_etapa,
    'motivo', CASE WHEN NOT v_hab AND v_nivel='bloqueante' THEN 'Contrato obligatorio sin vigencia firmada'
                   WHEN NOT v_hab AND NOT v_activo THEN 'Cliente inactivo'
                   ELSE NULL END,
    'estado_display', v->>'estado_display');
END $$;

-- FIN T8. Funciones de lectura/gate. Backend autoridad. NO producción.
