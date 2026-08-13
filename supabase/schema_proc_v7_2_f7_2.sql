-- ============================================================================
-- schema_proc_v7_2_f7_2.sql · F7.2 — BACKEND MENOR (aditivo, no destructivo)
--   1) Gate QC → proceso: un lote con QC rechazado o QC obligatorio no ejecutado
--      NO puede ser consumido por una orden (enforce en el punto de consumo).
--      La existencia física se preserva; solo se bloquea la elegibilidad.
--   2) Read-models de listado (recepciones y lotes) con nombres + saldos + QC.
--   3) Helper de elegibilidad de lote para mensajería de UI.
-- NO altera ledger/SoT/genealogía/ownership. Requiere schema_proc_v1..v7_f7_1.
-- ============================================================================

-- ── 1. GATE QC → PROCESO (data-driven) ──────────────────────────────────────
-- Elegibilidad de un lote para ser consumido, derivada del QC de su recepción:
--   * QC 'rechazado'                         -> NO elegible.
--   * especie con QC obligatorio y sin QC    -> NO elegible ("no ejecutado").
--   * en otro caso                           -> elegible.
CREATE OR REPLACE FUNCTION proc_fn_lote_elegible(p_empresa uuid, p_lote uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v_esp text; v_rec uuid; v_res text; v_oblig boolean;
BEGIN
  SELECT l.recepcion_id, r.especie_codigo INTO v_rec, v_esp
    FROM proc_lote l JOIN proc_recepcion r ON r.id=l.recepcion_id
   WHERE l.id=p_lote AND l.empresa_id=p_empresa;
  IF v_rec IS NULL THEN RETURN jsonb_build_object('elegible', true, 'motivo', NULL); END IF;
  SELECT resultado INTO v_res FROM proc_qc_recepcion
   WHERE recepcion_id=v_rec AND empresa_id=p_empresa AND deleted_at IS NULL;
  IF v_res = 'rechazado' THEN
    RETURN jsonb_build_object('elegible', false, 'motivo', 'QC rechazado');
  END IF;
  SELECT EXISTS(SELECT 1 FROM proc_qc_parametro
     WHERE empresa_id=p_empresa AND especie_codigo=v_esp AND obligatorio AND activo AND deleted_at IS NULL
       AND (vigencia_desde IS NULL OR vigencia_desde<=current_date)
       AND (vigencia_hasta IS NULL OR vigencia_hasta>=current_date)) INTO v_oblig;
  IF v_oblig AND v_res IS NULL THEN
    RETURN jsonb_build_object('elegible', false, 'motivo', 'QC obligatorio no ejecutado');
  END IF;
  RETURN jsonb_build_object('elegible', true, 'motivo', NULL);
END $$;

-- Enforcement en el punto de consumo: trigger BEFORE INSERT en proc_orden_insumo
-- (cualquier vía de consumo pasa por acá; no reescribe la RPC de F2).
CREATE OR REPLACE FUNCTION proc_fn_qc_gate_consumo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_eleg jsonb;
BEGIN
  v_eleg := proc_fn_lote_elegible(NEW.empresa_id, NEW.lote_id);
  IF NOT (v_eleg->>'elegible')::boolean THEN
    RAISE EXCEPTION 'Lote no elegible para proceso: % (la fruta existe físicamente pero no puede consumirse)', v_eleg->>'motivo'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_qc_gate_consumo ON proc_orden_insumo;
CREATE TRIGGER trg_qc_gate_consumo BEFORE INSERT ON proc_orden_insumo
  FOR EACH ROW EXECUTE FUNCTION proc_fn_qc_gate_consumo();

-- ── 2. READ-MODELS DE LISTADO (security_invoker: RLS por empresa aplica) ─────
-- Filtrables/paginables vía PostgREST (?planta_id=eq.&fecha=gte.&limit=&offset=).
CREATE OR REPLACE VIEW proc_v_recepcion_listado AS
SELECT r.id, r.empresa_id, r.folio, r.fecha, r.planta_id, r.temporada_id,
       r.especie_codigo, r.variedad_codigo, r.kg_bruto, r.tara, r.kg_neto, r.estado,
       r.guia_despacho, r.patente,
       cli.nombre_provisional  AS cliente,
       prod.nombre_provisional AS productor,
       due.nombre_provisional  AS dueno_fruta,
       expo.nombre_provisional AS exportadora,
       q.resultado             AS qc_resultado,
       (SELECT count(*) FROM proc_lote l WHERE l.recepcion_id=r.id AND l.deleted_at IS NULL) AS lotes
FROM proc_recepcion r
LEFT JOIN proc_vinculo cli  ON cli.id  = r.cliente_servicio_vinculo_id
LEFT JOIN proc_vinculo prod ON prod.id = r.productor_vinculo_id
LEFT JOIN proc_vinculo due  ON due.id  = r.dueno_fruta_vinculo_id
LEFT JOIN proc_vinculo expo ON expo.id = r.exportadora_vinculo_id
LEFT JOIN proc_qc_recepcion q ON q.recepcion_id = r.id AND q.deleted_at IS NULL
WHERE r.deleted_at IS NULL;
ALTER VIEW proc_v_recepcion_listado SET (security_invoker = on);

CREATE OR REPLACE VIEW proc_v_lote_listado AS
SELECT l.id, l.empresa_id, l.codigo, l.recepcion_id, r.folio AS recepcion_folio,
       r.planta_id, r.temporada_id, l.especie_codigo, l.variedad_codigo, l.estado, l.ubicacion,
       cli.nombre_provisional  AS cliente,
       prod.nombre_provisional AS productor,
       due.nombre_provisional  AS dueno_fruta,
       q.resultado             AS qc_resultado,
       COALESCE(s.on_hand,0)    AS on_hand,
       COALESCE(s.reservado,0)  AS reservado,
       COALESCE(s.bloqueado,0)  AS bloqueado,
       COALESCE(s.disponible,0) AS disponible
FROM proc_lote l
JOIN proc_recepcion r ON r.id = l.recepcion_id
LEFT JOIN proc_vinculo cli  ON cli.id  = r.cliente_servicio_vinculo_id
LEFT JOIN proc_vinculo prod ON prod.id = r.productor_vinculo_id
LEFT JOIN proc_vinculo due  ON due.id  = r.dueno_fruta_vinculo_id
LEFT JOIN proc_qc_recepcion q ON q.recepcion_id = r.id AND q.deleted_at IS NULL
LEFT JOIN proc_v_lote_saldos s ON s.lote_id = l.id
WHERE l.deleted_at IS NULL;
ALTER VIEW proc_v_lote_listado SET (security_invoker = on);
