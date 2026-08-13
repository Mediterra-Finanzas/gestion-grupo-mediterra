-- ============================================================================
-- schema_proc_v7_3_f7_3.sql · F7.3 — BACKEND MENOR (aditivo, no destructivo)
--   1) Guard: no registrar resultado/descarte/merma en una orden terminal
--      (cerrada/anulada) — coherente con "orden cerrada = read-only".
--   2) Read-models: orden listado (con nombres + conciliación) y lotes con
--      elegibilidad QC computada (para selección de consumo).
-- NO altera ledger/SoT/genealogía/conciliación/estados. Requiere v1..v7_2.
-- ============================================================================

-- ── 1. GUARD resultado/descarte/merma en orden terminal ─────────────────────
CREATE OR REPLACE FUNCTION proc_fn_resultado_orden_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM proc_orden_proceso WHERE id=NEW.orden_id AND empresa_id=NEW.empresa_id;
  IF v_estado IN ('cerrado','anulado') THEN
    RAISE EXCEPTION 'orden en estado % no admite resultados (read-only)', v_estado USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_res_guard ON proc_resultado;
CREATE TRIGGER trg_res_guard BEFORE INSERT ON proc_resultado FOR EACH ROW EXECUTE FUNCTION proc_fn_resultado_orden_guard();
DROP TRIGGER IF EXISTS trg_desc_guard ON proc_resultado_descarte;
CREATE TRIGGER trg_desc_guard BEFORE INSERT ON proc_resultado_descarte FOR EACH ROW EXECUTE FUNCTION proc_fn_resultado_orden_guard();
DROP TRIGGER IF EXISTS trg_merma_guard ON proc_resultado_merma;
CREATE TRIGGER trg_merma_guard BEFORE INSERT ON proc_resultado_merma FOR EACH ROW EXECUTE FUNCTION proc_fn_resultado_orden_guard();

-- ── 2. READ-MODEL: órdenes con nombres + conciliación (security_invoker) ────
CREATE OR REPLACE VIEW proc_v_orden_listado AS
SELECT o.id, o.empresa_id, o.folio, o.fecha, o.planta_id, o.linea_id, o.turno, o.estado,
       o.especie_codigo, o.variedad_codigo, o.hora_inicio, o.hora_fin,
       cli.nombre_provisional AS cliente, ln.codigo AS linea,
       co.kg_entrada, co.kg_resultado, co.kg_descarte, co.kg_merma, co.diff, co.tolerancia,
       (SELECT count(*) FROM proc_orden_insumo i WHERE i.orden_id=o.id) AS n_insumos
FROM proc_orden_proceso o
LEFT JOIN proc_vinculo cli ON cli.id = o.cliente_servicio_vinculo_id
LEFT JOIN proc_lineas_proceso ln ON ln.id = o.linea_id
LEFT JOIN proc_v_orden_conciliacion co ON co.orden_id = o.id
WHERE o.deleted_at IS NULL;
ALTER VIEW proc_v_orden_listado SET (security_invoker = on);

-- ── 3. READ-MODEL: lotes con elegibilidad QC (para selección de consumo) ────
-- Extiende proc_v_lote_listado con elegible + motivo (mirror de proc_fn_lote_elegible).
CREATE OR REPLACE VIEW proc_v_lote_operacional AS
SELECT ll.*,
  CASE
    WHEN ll.qc_resultado = 'rechazado' THEN false
    WHEN ll.qc_resultado IS NULL AND EXISTS (
      SELECT 1 FROM proc_qc_parametro p
       WHERE p.empresa_id=ll.empresa_id AND p.especie_codigo=ll.especie_codigo
         AND p.obligatorio AND p.activo AND p.deleted_at IS NULL
         AND (p.vigencia_desde IS NULL OR p.vigencia_desde<=current_date)
         AND (p.vigencia_hasta IS NULL OR p.vigencia_hasta>=current_date)) THEN false
    ELSE true
  END AS elegible,
  CASE
    WHEN ll.qc_resultado = 'rechazado' THEN 'QC rechazado'
    WHEN ll.qc_resultado IS NULL AND EXISTS (
      SELECT 1 FROM proc_qc_parametro p
       WHERE p.empresa_id=ll.empresa_id AND p.especie_codigo=ll.especie_codigo
         AND p.obligatorio AND p.activo AND p.deleted_at IS NULL
         AND (p.vigencia_desde IS NULL OR p.vigencia_desde<=current_date)
         AND (p.vigencia_hasta IS NULL OR p.vigencia_hasta>=current_date)) THEN 'QC obligatorio no ejecutado'
    ELSE NULL
  END AS motivo_no_elegible
FROM proc_v_lote_listado ll;
ALTER VIEW proc_v_lote_operacional SET (security_invoker = on);
