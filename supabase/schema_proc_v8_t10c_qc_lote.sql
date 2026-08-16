-- ============================================================================
-- schema_proc_v8_t10c_qc_lote.sql · T10c-QC — QC por Lote (Opción C, aditivo)
-- proc_qc_recepcion admite QC de header (lote_id NULL, legacy) Y QC por lote
-- (lote_id seteado). Autoridad de elegibilidad = LOTE. La especie de evaluación
-- pasa a ser la DEL LOTE (no la del header). Gate de consumo sin cambios.
-- NO toca ledger/origen/genealogía/ownership/RLS/bounded context.
-- ============================================================================

-- ── 1. Aditivo: lote_id nullable + FK ───────────────────────────────────────
ALTER TABLE proc_qc_recepcion ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES proc_lote(id);

-- ── 2. Unicidad: reemplazar UNIQUE(recepcion) por índices únicos parciales ──
--    header: máx 1 QC activo por recepción (lote_id NULL)
--    lote:   máx 1 QC activo por recepción+lote (lote_id seteado)
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid='proc_qc_recepcion'::regclass AND contype='u';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE proc_qc_recepcion DROP CONSTRAINT %I', c); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_qc_header ON proc_qc_recepcion(empresa_id, recepcion_id)
  WHERE lote_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_qc_lote ON proc_qc_recepcion(empresa_id, recepcion_id, lote_id)
  WHERE lote_id IS NOT NULL AND deleted_at IS NULL;

-- ── 3. Elegibilidad por LOTE: QC del lote → fallback header; especie del lote ─
CREATE OR REPLACE FUNCTION proc_fn_lote_elegible(p_empresa uuid, p_lote uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v_esp text; v_rec uuid; v_res text; v_oblig boolean;
BEGIN
  SELECT l.recepcion_id, l.especie_codigo INTO v_rec, v_esp
    FROM proc_lote l WHERE l.id=p_lote AND l.empresa_id=p_empresa;
  IF v_rec IS NULL THEN RETURN jsonb_build_object('elegible', true, 'motivo', NULL); END IF;
  -- QC específico del lote primero; si no hay, fallback al header (lote_id NULL)
  SELECT resultado INTO v_res FROM proc_qc_recepcion
    WHERE recepcion_id=v_rec AND empresa_id=p_empresa AND lote_id=p_lote AND deleted_at IS NULL;
  IF v_res IS NULL THEN
    SELECT resultado INTO v_res FROM proc_qc_recepcion
      WHERE recepcion_id=v_rec AND empresa_id=p_empresa AND lote_id IS NULL AND deleted_at IS NULL;
  END IF;
  IF v_res = 'rechazado' THEN RETURN jsonb_build_object('elegible', false, 'motivo', 'QC rechazado'); END IF;
  -- obligatorios según la ESPECIE DEL LOTE (no la del header)
  SELECT EXISTS(SELECT 1 FROM proc_qc_parametro
     WHERE empresa_id=p_empresa AND especie_codigo=v_esp AND obligatorio AND activo AND deleted_at IS NULL
       AND (vigencia_desde IS NULL OR vigencia_desde<=current_date)
       AND (vigencia_hasta IS NULL OR vigencia_hasta>=current_date)) INTO v_oblig;
  IF v_oblig AND v_res IS NULL THEN
    RETURN jsonb_build_object('elegible', false, 'motivo', 'QC obligatorio no ejecutado');
  END IF;
  RETURN jsonb_build_object('elegible', true, 'motivo', NULL);
END $$;

-- ── 4. registrar_qc con lote_id opcional (compat: 4 args → header) ───────────
DROP FUNCTION IF EXISTS proc_fn_registrar_qc(uuid, uuid, jsonb, uuid);
CREATE OR REPLACE FUNCTION proc_fn_registrar_qc(
  p_empresa uuid, p_recepcion uuid, p_valores jsonb, p_actor uuid, p_lote uuid DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_esp text; p record; v_val text; v_num numeric; v_out boolean; v_res text := 'aprobado'; v_id uuid;
BEGIN
  -- especie: la del LOTE si es QC de lote; la de la recepción si es header
  IF p_lote IS NOT NULL THEN
    SELECT especie_codigo INTO v_esp FROM proc_lote WHERE id=p_lote AND empresa_id=p_empresa;
    IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe', p_lote; END IF;
    PERFORM 1 FROM proc_lote WHERE id=p_lote AND recepcion_id=p_recepcion AND empresa_id=p_empresa;
    IF NOT FOUND THEN RAISE EXCEPTION 'el lote % no pertenece a la recepción %', p_lote, p_recepcion; END IF;
  ELSE
    SELECT especie_codigo INTO v_esp FROM proc_recepcion WHERE id=p_recepcion AND empresa_id=p_empresa;
    IF NOT FOUND THEN RAISE EXCEPTION 'recepción % no existe', p_recepcion; END IF;
  END IF;
  FOR p IN SELECT * FROM proc_qc_parametro
      WHERE empresa_id=p_empresa AND especie_codigo=v_esp AND activo AND deleted_at IS NULL
        AND (vigencia_desde IS NULL OR vigencia_desde <= current_date)
        AND (vigencia_hasta IS NULL OR vigencia_hasta >= current_date)
  LOOP
    v_val := p_valores ->> p.codigo; v_out := false;
    IF v_val IS NULL OR v_val = '' THEN
      IF p.obligatorio THEN v_out := true; END IF;
    ELSIF p.tipo_dato = 'numero' THEN
      BEGIN v_num := v_val::numeric; EXCEPTION WHEN others THEN v_num := NULL; END;
      IF v_num IS NULL THEN v_out := true;
      ELSIF (p.rango_min IS NOT NULL AND v_num < p.rango_min)
         OR (p.rango_max IS NOT NULL AND v_num > p.rango_max) THEN v_out := true; END IF;
    END IF;
    IF v_out THEN
      IF p.severidad = 'bloqueante' THEN v_res := 'rechazado';
      ELSIF p.severidad = 'advertencia' AND v_res <> 'rechazado' THEN v_res := 'condicional'; END IF;
    END IF;
  END LOOP;
  -- upsert manual por scope (header o lote); el índice único parcial es el guard real
  SELECT id INTO v_id FROM proc_qc_recepcion
    WHERE empresa_id=p_empresa AND recepcion_id=p_recepcion AND deleted_at IS NULL
      AND (lote_id IS NOT DISTINCT FROM p_lote);
  IF v_id IS NOT NULL THEN
    UPDATE proc_qc_recepcion SET valores=COALESCE(p_valores,'{}'::jsonb), resultado=v_res, updated_at=now(), updated_by=p_actor WHERE id=v_id;
  ELSE
    INSERT INTO proc_qc_recepcion(empresa_id, recepcion_id, lote_id, valores, resultado, created_by)
      VALUES (p_empresa, p_recepcion, p_lote, COALESCE(p_valores,'{}'::jsonb), v_res, p_actor);
  END IF;
  RETURN v_res;
END $$;

-- Read-model: resumen QC por recepción (para la cabecera) — sin 2a SoT.
CREATE OR REPLACE VIEW proc_v_qc_recepcion_resumen AS
SELECT empresa_id, recepcion_id,
  count(*) FILTER (WHERE lote_id IS NOT NULL AND resultado='aprobado')   AS lotes_aprobados,
  count(*) FILTER (WHERE lote_id IS NOT NULL AND resultado='condicional') AS lotes_condicional,
  count(*) FILTER (WHERE lote_id IS NOT NULL AND resultado='rechazado')  AS lotes_rechazados,
  bool_or(lote_id IS NULL) AS tiene_qc_header
FROM proc_qc_recepcion WHERE deleted_at IS NULL GROUP BY empresa_id, recepcion_id;
ALTER VIEW proc_v_qc_recepcion_resumen SET (security_invoker = on);

-- FIN T10c-QC. Aditivo. NO producción.
