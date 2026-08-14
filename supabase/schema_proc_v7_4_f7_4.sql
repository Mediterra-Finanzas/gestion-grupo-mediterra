-- ============================================================================
-- schema_proc_v7_4_f7_4.sql · F7.4 — BACKEND MENOR (aditivo, no destructivo)
--   1) Holds genéricos de bodega (reserva/bloqueo) sobre proc_hold existente
--      (NO segundo mecanismo). El saldo ya los agrega (proc_v_pallet_saldos).
--   2) Read-models: resultado materializable, PT operacional, bodega de pallets.
--   3) Genealogía de pallet (backwards origen + forwards repaletizaje).
-- NO altera ledger/SoT/proc_pallet_linea/genealogía/repaletizaje. Req v1..v7_3.
-- ============================================================================

-- ── 1. HOLDS GENÉRICOS (reserva/bloqueo de bodega; no cambian stock físico) ──
CREATE OR REPLACE FUNCTION proc_fn_hold_pallet(
  p_empresa uuid, p_pallet uuid, p_tipo text, p_cantidad numeric, p_motivo text, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_disp numeric; v_id uuid;
BEGIN
  IF p_tipo NOT IN ('reserva','bloqueo') THEN RAISE EXCEPTION 'tipo de hold inválido: %', p_tipo; END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'cantidad de hold debe ser > 0'; END IF;
  PERFORM 1 FROM proc_pallet WHERE id=p_pallet AND empresa_id=p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pallet % no existe', p_pallet; END IF;
  SELECT disponible INTO v_disp FROM proc_v_pallet_saldos WHERE pallet_id=p_pallet;
  IF p_cantidad > COALESCE(v_disp,0) THEN
    RAISE EXCEPTION 'hold % excede disponible % del pallet', p_cantidad, COALESCE(v_disp,0) USING ERRCODE='check_violation';
  END IF;
  INSERT INTO proc_hold(empresa_id, objeto_tipo, objeto_id, tipo, cantidad, ref_tipo, motivo, created_by)
    VALUES (p_empresa, 'pallet', p_pallet, p_tipo, p_cantidad, 'bodega', p_motivo, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION proc_fn_liberar_hold(p_empresa uuid, p_hold uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE proc_hold SET estado='liberado', liberado_por=p_actor, liberado_at=now()
   WHERE id=p_hold AND empresa_id=p_empresa AND estado='activo';
  IF NOT FOUND THEN RAISE EXCEPTION 'hold % no existe o ya liberado', p_hold; END IF;
END $$;

-- ── 2. READ-MODELS (security_invoker → RLS por empresa) ─────────────────────
-- Resultado materializable a PT (kg disponible por línea de resultado).
CREATE OR REPLACE VIEW proc_v_resultado_materializable AS
SELECT rd.resultado_id, rd.empresa_id, rd.kg_resultado, rd.kg_materializado, rd.kg_disponible,
       o.id AS orden_id, o.folio AS orden_folio, o.estado AS orden_estado,
       o.especie_codigo, o.variedad_codigo,
       cat.nombre AS categoria, cal.nombre AS calibre, col.nombre AS color,
       r.categoria_id, r.calibre_id, r.color_id
FROM proc_v_resultado_disponible rd
JOIN proc_resultado r ON r.id = rd.resultado_id AND r.deleted_at IS NULL
JOIN proc_orden_proceso o ON o.id = r.orden_id
LEFT JOIN proc_categorias_calidad cat ON cat.id = r.categoria_id
LEFT JOIN proc_calibre cal ON cal.id = r.calibre_id
LEFT JOIN proc_color col ON col.id = r.color_id;
ALTER VIEW proc_v_resultado_materializable SET (security_invoker = on);

-- PT operacional (con saldo on_hand; pendiente de palletizar = on_hand>0).
CREATE OR REPLACE VIEW proc_v_pt_operacional AS
SELECT pt.id AS pt_id, pt.empresa_id, pt.orden_id, o.folio AS orden_folio, pt.resultado_id,
       pt.especie_codigo, pt.variedad_codigo, pt.categoria_id, pt.calibre_id, pt.color_id, pt.formato_id,
       f.codigo AS formato, pt.cajas, pt.kg, pt.estado, pt.planta_id, pt.temporada_codigo,
       cat.nombre AS categoria, cal.nombre AS calibre, col.nombre AS color,
       COALESCE(s.on_hand,0) AS on_hand
FROM proc_producto_terminado pt
JOIN proc_orden_proceso o ON o.id = pt.orden_id
LEFT JOIN proc_formato f ON f.id = pt.formato_id
LEFT JOIN proc_categorias_calidad cat ON cat.id = pt.categoria_id
LEFT JOIN proc_calibre cal ON cal.id = pt.calibre_id
LEFT JOIN proc_color col ON col.id = pt.color_id
LEFT JOIN proc_v_pt_saldos s ON s.pt_id = pt.id
WHERE pt.deleted_at IS NULL;
ALTER VIEW proc_v_pt_operacional SET (security_invoker = on);

-- Bodega: pallets con producto/cliente/ubicación + saldos + composición.
CREATE OR REPLACE VIEW proc_v_pallet_bodega AS
SELECT p.id AS pallet_id, p.empresa_id, p.codigo, p.temporada_codigo, p.planta_id, p.estado,
       p.formato_id, f.codigo AS formato, f.especie_codigo,
       p.ubicacion_id, u.codigo AS ubicacion_codigo, u.nombre AS ubicacion,
       COALESCE(sc.kg_lineas,0)   AS kg_composicion,
       COALESCE(sc.cajas_lineas,0) AS cajas,
       COALESCE(sp.kg_fisico,0)   AS kg_fisico,
       COALESCE(sp.reservado,0)   AS reservado,
       COALESCE(sp.bloqueado,0)   AS bloqueado,
       COALESCE(sp.disponible,0)  AS disponible,
       (SELECT string_agg(DISTINCT cli.nombre_provisional, ', ')
          FROM proc_pallet_linea pll
          JOIN proc_producto_terminado pt ON pt.id = pll.pt_id
          JOIN proc_orden_proceso o ON o.id = pt.orden_id
          LEFT JOIN proc_vinculo cli ON cli.id = o.cliente_servicio_vinculo_id
         WHERE pll.pallet_id = p.id AND pll.estado='activa') AS cliente
FROM proc_pallet p
LEFT JOIN proc_formato f ON f.id = p.formato_id
LEFT JOIN proc_ubicaciones u ON u.id = p.ubicacion_id
LEFT JOIN proc_v_pallet_composicion sc ON sc.pallet_id = p.id
LEFT JOIN proc_v_pallet_saldos sp ON sp.pallet_id = p.id
WHERE p.deleted_at IS NULL;
ALTER VIEW proc_v_pallet_bodega SET (security_invoker = on);

-- ── 3. GENEALOGÍA de pallet (backwards origen + forwards repaletizaje) ───────
CREATE OR REPLACE FUNCTION proc_fn_pallet_genealogia(p_empresa uuid, p_pallet uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v_back jsonb; v_lotes jsonb; v_fwd jsonb;
BEGIN
  -- backwards: PT/orden/resultado que componen el pallet
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
  -- lotes/recepciones origen (vía las órdenes de los PT del pallet)
  SELECT jsonb_agg(x) INTO v_lotes FROM (
    SELECT DISTINCT jsonb_build_object(
      'lote', l.codigo, 'recepcion', r.folio, 'productor', prod.nombre_provisional) AS x
    FROM proc_pallet_linea pll
    JOIN proc_producto_terminado pt ON pt.id = pll.pt_id
    JOIN proc_orden_insumo i ON i.orden_id = pt.orden_id
    JOIN proc_lote l ON l.id = i.lote_id
    JOIN proc_recepcion r ON r.id = l.recepcion_id
    LEFT JOIN proc_vinculo prod ON prod.id = r.productor_vinculo_id
    WHERE pll.pallet_id = p_pallet AND pll.empresa_id = p_empresa
  ) s;
  -- forwards: pallets a los que este pallet dio origen por repaletizaje (recursivo)
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
