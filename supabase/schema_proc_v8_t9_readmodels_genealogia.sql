-- ============================================================================
-- schema_proc_v8_t9_readmodels_genealogia.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T9
-- Genealogía extendida al origen del LOTE (snapshot) + read-models de origen y
-- estado contractual. §13 CFO: navegar hasta cuartel/predio/productor; cliente =
-- dimensión comercial paralela. Aditivo (CREATE OR REPLACE). Ledger sin tocar.
-- ============================================================================

-- ── Genealogía: el bloque de lotes-origen ahora sale del LOTE (snapshot inmutable
--    + FK CURRENT), no de la cabecera de recepción; agrega predio/cuartel/especie/
--    variedad y el cliente del servicio como dimensión paralela.
CREATE OR REPLACE FUNCTION proc_fn_pallet_genealogia(p_empresa uuid, p_pallet uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v_back jsonb; v_lotes jsonb; v_fwd jsonb;
BEGIN
  SELECT jsonb_agg(x) INTO v_back FROM (
    SELECT DISTINCT jsonb_build_object(
      'pt', pt.id, 'orden', o.folio, 'resultado', pt.resultado_id,
      'especie', pt.especie_codigo, 'variedad', pt.variedad_codigo,
      'calibre', cal.nombre, 'categoria', cat.nombre) AS x
    FROM proc_pallet_linea pll
    JOIN proc_producto_terminado pt ON pt.id = pll.pt_id
    JOIN proc_orden_proceso o ON o.id = pt.orden_id
    LEFT JOIN proc_calibre cal ON cal.id = pt.calibre_id
    LEFT JOIN proc_categorias_calidad cat ON cat.id = pt.categoria_id
    WHERE pll.pallet_id = p_pallet AND pll.empresa_id = p_empresa
  ) s;

  -- lotes/orígenes agrícolas: autoridad = el LOTE (origen_snapshot congelado)
  SELECT jsonb_agg(x) INTO v_lotes FROM (
    SELECT DISTINCT jsonb_build_object(
      'lote', l.codigo, 'recepcion', r.folio,
      'cliente', cli.nombre_provisional,   -- dimensión comercial paralela
      'productor', COALESCE(l.origen_snapshot->'productor'->>'nombre', prod.nombre_provisional),
      'productor_csg', l.origen_snapshot->'productor'->>'csg_sag',
      'predio', COALESCE(l.origen_snapshot->'predio'->>'nombre', pre.nombre),
      'predio_csg', l.origen_snapshot->'predio'->>'csg_sag',
      'cuartel', COALESCE(l.origen_snapshot->'cuartel'->>'codigo', cu.codigo, l.origen_snapshot->>'cuartel'),
      'especie', COALESCE(l.origen_snapshot->'especie'->>'nombre', l.especie_codigo),
      'variedad', COALESCE(l.origen_snapshot->'variedad'->>'nombre', l.variedad_codigo),
      'origen_reconstruido', COALESCE(l.origen_reconstruido, false)) AS x
    FROM proc_pallet_linea pll
    JOIN proc_producto_terminado pt ON pt.id = pll.pt_id
    JOIN proc_orden_insumo i ON i.orden_id = pt.orden_id
    JOIN proc_lote l ON l.id = i.lote_id
    JOIN proc_recepcion r ON r.id = l.recepcion_id
    LEFT JOIN proc_vinculo prod ON prod.id = l.productor_vinculo_id
    LEFT JOIN proc_vinculo cli  ON cli.id  = r.cliente_servicio_vinculo_id
    LEFT JOIN proc_predios pre  ON pre.id  = l.predio_id
    LEFT JOIN proc_cuartel cu   ON cu.id   = l.cuartel_id
    WHERE pll.pallet_id = p_pallet AND pll.empresa_id = p_empresa
  ) s;

  WITH RECURSIVE fwd AS (
    SELECT d.pallet_id AS pid, 1 AS gen
      FROM proc_repaletizaje_origen o JOIN proc_repaletizaje_destino d ON d.repaletizaje_id = o.repaletizaje_id
     WHERE o.pallet_id = p_pallet AND o.empresa_id = p_empresa
    UNION
    SELECT d.pallet_id, fwd.gen + 1
      FROM fwd JOIN proc_repaletizaje_origen o ON o.pallet_id = fwd.pid
               JOIN proc_repaletizaje_destino d ON d.repaletizaje_id = o.repaletizaje_id
  )
  SELECT jsonb_agg(DISTINCT jsonb_build_object('pallet', pl.codigo, 'generacion', fwd.gen))
    INTO v_fwd FROM fwd JOIN proc_pallet pl ON pl.id = fwd.pid;

  RETURN jsonb_build_object(
    'backwards', COALESCE(v_back, '[]'::jsonb),
    'lotes_origen', COALESCE(v_lotes, '[]'::jsonb),
    'forwards', COALESCE(v_fwd, '[]'::jsonb));
END $$;

-- ── Read-model: Lote con origen resuelto (snapshot + FK CURRENT + cliente) ───
CREATE OR REPLACE VIEW proc_v_lote_origen AS
SELECT l.id, l.empresa_id, l.codigo, l.recepcion_id, r.folio AS recepcion_folio,
  cli.nombre_provisional AS cliente,
  COALESCE(l.origen_snapshot->'productor'->>'nombre', prod.nombre_provisional) AS productor,
  l.productor_vinculo_id,
  COALESCE(l.origen_snapshot->'predio'->>'nombre', pre.nombre) AS predio, l.predio_id,
  COALESCE(l.origen_snapshot->'cuartel'->>'codigo', cu.codigo, l.origen_snapshot->>'cuartel') AS cuartel, l.cuartel_id,
  l.especie_codigo, l.variedad_codigo,
  COALESCE(l.origen_reconstruido, false) AS origen_reconstruido, l.origen_snapshot
FROM proc_lote l
JOIN proc_recepcion r ON r.id = l.recepcion_id
LEFT JOIN proc_vinculo cli  ON cli.id  = r.cliente_servicio_vinculo_id
LEFT JOIN proc_vinculo prod ON prod.id = l.productor_vinculo_id
LEFT JOIN proc_predios pre  ON pre.id  = l.predio_id
LEFT JOIN proc_cuartel cu   ON cu.id   = l.cuartel_id
WHERE l.deleted_at IS NULL;
ALTER VIEW proc_v_lote_origen SET (security_invoker = on);

-- ── Read-model: estado contractual por cliente (Centro/Ficha/alertas) ───────
CREATE OR REPLACE VIEW proc_v_cliente_contractual AS
SELECT f.empresa_id, f.cliente_vinculo_id, v.nombre_provisional AS cliente,
  f.politica_contrato, f.estado AS ficha_estado,
  proc_fn_estado_contractual_cliente(f.empresa_id, f.cliente_vinculo_id, current_date) AS estado_contractual
FROM proc_cliente_ficha f JOIN proc_vinculo v ON v.id = f.cliente_vinculo_id
WHERE f.deleted_at IS NULL;
ALTER VIEW proc_v_cliente_contractual SET (security_invoker = on);

-- FIN T9. Aditivo. NO producción.
