-- ============================================================================
-- schema_proc_v7_7_f7_7.sql · proc_* F7.7 (UI Tarifario + Servicios + Base de Cobro)
-- INCREMENTAL sobre F1-F6. SOLO backend MENOR para la UI: read-models de lectura
-- (vistas security_invoker) + 2 funciones de lectura/derivación. NO cambia el
-- modelo F6 (tarifa/snapshot/XOR/inmutabilidad/multimoneda/ledger/tenancy).
--
-- Autoridad = F6. Estas vistas resuelven NOMBRES (proc_vinculo) y REFERENCIAS
-- HUMANAS (folio de orden / código de pallet / repaletizaje) para no exponer UUID,
-- y computan la especificidad/vigencia de la tarifa para EXPLICAR por qué gana una
-- tarifa sobre otra. La resolución determinística sigue en proc_fn_resolver_tarifa.
-- ============================================================================

-- ── Read-model: Tarifario (con especificidad + estado de vigencia computado) ─
CREATE OR REPLACE VIEW proc_v_tarifa_listado AS
SELECT t.id, t.empresa_id, t.tipo_servicio_id,
       ts.codigo AS servicio_codigo, ts.nombre AS servicio_nombre,
       t.cliente_vinculo_id, cli.nombre_provisional AS cliente,
       t.temporada_codigo, t.especie_codigo, t.unidad,
       t.tarifa, t.moneda, t.vigencia_desde, t.vigencia_hasta,
       t.prioridad, t.estado, t.version, t.observaciones, t.created_at, t.updated_at,
       (t.cliente_vinculo_id IS NULL AND t.temporada_codigo IS NULL AND t.especie_codigo IS NULL) AS es_general,
       ((t.cliente_vinculo_id IS NOT NULL)::int + (t.temporada_codigo IS NOT NULL)::int
        + (t.especie_codigo IS NOT NULL)::int) AS especificidad,
       CASE
         WHEN t.estado <> 'vigente' THEN t.estado
         WHEN t.vigencia_desde > current_date THEN 'futura'
         WHEN t.vigencia_hasta IS NOT NULL AND t.vigencia_hasta < current_date THEN 'vencida'
         ELSE 'vigente'
       END AS vigencia_estado
FROM proc_tarifa t
JOIN proc_tipo_servicio ts ON ts.id = t.tipo_servicio_id
LEFT JOIN proc_vinculo cli ON cli.id = t.cliente_vinculo_id
WHERE t.deleted_at IS NULL;
ALTER VIEW proc_v_tarifa_listado SET (security_invoker = on);

-- ── Read-model: Servicios Facturables (referencia humana + estado en base) ──
-- Origen = XOR real (orden/repaletizaje/pallet/manual) resuelto a texto humano.
CREATE OR REPLACE VIEW proc_v_servicio_facturable AS
SELECT s.id, s.empresa_id, s.tipo_servicio_id,
       ts.codigo AS servicio_codigo, ts.nombre AS servicio_nombre,
       s.cliente_vinculo_id, cli.nombre_provisional AS cliente,
       s.origen_tipo, s.orden_id, s.repaletizaje_id, s.pallet_id,
       CASE s.origen_tipo
         WHEN 'orden'        THEN o.folio
         WHEN 'pallet'       THEN p.codigo
         WHEN 'repaletizaje' THEN 'Repaletizaje ' || COALESCE(rep.tipo,'') || ' ' || to_char(rep.fecha,'DD-MM-YYYY')
         WHEN 'manual'       THEN 'Manual'
       END AS referencia,
       s.fecha_hecho, s.cantidad, s.unidad,
       s.tarifa_id, s.tarifa_aplicada, s.moneda, s.unidad_tarifa, s.vigencia_usada, s.subtotal,
       s.estado, s.es_manual, s.motivo, s.autorizado_por,
       (bcl.id IS NOT NULL) AS en_base, b.id AS base_id, b.folio AS base_folio, b.estado AS base_estado,
       s.created_at, s.updated_at
FROM proc_servicio_facturable s
JOIN proc_tipo_servicio ts ON ts.id = s.tipo_servicio_id
LEFT JOIN proc_vinculo cli ON cli.id = s.cliente_vinculo_id
LEFT JOIN proc_orden_proceso o ON o.id = s.orden_id
LEFT JOIN proc_pallet p ON p.id = s.pallet_id
LEFT JOIN proc_repaletizaje rep ON rep.id = s.repaletizaje_id
LEFT JOIN proc_base_cobro_linea bcl ON bcl.servicio_facturable_id = s.id
LEFT JOIN proc_base_cobro b ON b.id = bcl.base_cobro_id
WHERE s.deleted_at IS NULL;
ALTER VIEW proc_v_servicio_facturable SET (security_invoker = on);

-- ── Read-model: Bases de Cobro (folio + cliente + conteo líneas + total) ────
CREATE OR REPLACE VIEW proc_v_base_cobro_listado AS
SELECT b.id, b.empresa_id, b.folio, b.cliente_vinculo_id, cli.nombre_provisional AS cliente,
       b.temporada_codigo, b.periodo_desde, b.periodo_hasta, b.moneda, b.estado, b.total,
       b.observaciones, b.created_at, b.updated_at,
       (SELECT count(*) FROM proc_base_cobro_linea l WHERE l.base_cobro_id = b.id) AS lineas
FROM proc_base_cobro b
LEFT JOIN proc_vinculo cli ON cli.id = b.cliente_vinculo_id
WHERE b.deleted_at IS NULL;
ALTER VIEW proc_v_base_cobro_listado SET (security_invoker = on);

-- ── Read-model: Detalle de líneas de una base (auditable) ───────────────────
CREATE OR REPLACE VIEW proc_v_base_cobro_linea AS
SELECT l.id, l.empresa_id, l.base_cobro_id, l.servicio_facturable_id, l.subtotal,
       ts.codigo AS servicio_codigo, ts.nombre AS servicio_nombre,
       s.cantidad, s.unidad, s.tarifa_aplicada, s.moneda, s.fecha_hecho,
       s.origen_tipo, s.es_manual,
       CASE s.origen_tipo
         WHEN 'orden'        THEN o.folio
         WHEN 'pallet'       THEN p.codigo
         WHEN 'repaletizaje' THEN 'Repaletizaje ' || COALESCE(rep.tipo,'') || ' ' || to_char(rep.fecha,'DD-MM-YYYY')
         WHEN 'manual'       THEN 'Manual'
       END AS referencia
FROM proc_base_cobro_linea l
JOIN proc_servicio_facturable s ON s.id = l.servicio_facturable_id
JOIN proc_tipo_servicio ts ON ts.id = s.tipo_servicio_id
LEFT JOIN proc_orden_proceso o ON o.id = s.orden_id
LEFT JOIN proc_pallet p ON p.id = s.pallet_id
LEFT JOIN proc_repaletizaje rep ON rep.id = s.repaletizaje_id;
ALTER VIEW proc_v_base_cobro_linea SET (security_invoker = on);

-- ── Read-model: Órdenes elegibles para generar servicio de proceso ──────────
-- Órdenes conciliadas/cerradas, con cliente (vínculo), kg PROCESADOS (base del
-- cobro) y si ya tienen servicio (idempotencia visible). No expone UUID a la UI.
CREATE OR REPLACE VIEW proc_v_orden_facturable AS
SELECT o.id, o.empresa_id, o.folio, o.fecha, o.especie_codigo, o.estado,
       o.cliente_servicio_vinculo_id AS cliente_vinculo_id, cli.nombre_provisional AS cliente,
       (SELECT COALESCE(SUM(i.kg),0) FROM proc_orden_insumo i WHERE i.orden_id = o.id) AS kg_procesados,
       EXISTS (SELECT 1 FROM proc_servicio_facturable s
               WHERE s.orden_id = o.id AND s.deleted_at IS NULL) AS tiene_servicio
FROM proc_orden_proceso o
LEFT JOIN proc_vinculo cli ON cli.id = o.cliente_servicio_vinculo_id
WHERE o.deleted_at IS NULL AND o.estado IN ('conciliado','cerrado');
ALTER VIEW proc_v_orden_facturable SET (security_invoker = on);

-- ── Preview de resolución de tarifa (NO reimplementa; envuelve la RPC F6) ────
-- Devuelve la fila efectiva que ganaría para una combinación, para explicar la UI.
CREATE OR REPLACE FUNCTION proc_fn_resolver_tarifa_detalle(
  p_empresa_id uuid, p_cliente uuid, p_temporada text, p_especie text, p_tipo_servicio uuid, p_fecha date
) RETURNS TABLE (
  id uuid, servicio_nombre text, cliente text, tarifa numeric, moneda text, unidad text,
  vigencia_desde date, vigencia_hasta date, prioridad int, especificidad int, es_general boolean
) LANGUAGE sql STABLE AS $$
  SELECT t.id, ts.nombre, cli.nombre_provisional, t.tarifa, t.moneda, t.unidad::text,
         t.vigencia_desde, t.vigencia_hasta, t.prioridad,
         ((t.cliente_vinculo_id IS NOT NULL)::int + (t.temporada_codigo IS NOT NULL)::int
          + (t.especie_codigo IS NOT NULL)::int),
         (t.cliente_vinculo_id IS NULL AND t.temporada_codigo IS NULL AND t.especie_codigo IS NULL)
  FROM proc_tarifa t
  JOIN proc_tipo_servicio ts ON ts.id = t.tipo_servicio_id
  LEFT JOIN proc_vinculo cli ON cli.id = t.cliente_vinculo_id
  WHERE t.id = proc_fn_resolver_tarifa(p_empresa_id, p_cliente, p_temporada, p_especie, p_tipo_servicio, p_fecha);
$$;

-- ── Revalorizar un servicio PENDIENTE de tarifa (tras cargar la tarifa faltante)
-- Rellena el snapshot que estaba NULL (no muta un snapshot ya emitido). Solo actúa
-- sobre estado='pendiente_tarifa'. Reutiliza proc_fn_resolver_tarifa (autoridad).
CREATE OR REPLACE FUNCTION proc_fn_revalorizar_servicio_pendiente(
  p_empresa_id uuid, p_servicio_id uuid, p_actor uuid
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r proc_servicio_facturable; v_tid uuid; v_tar numeric; v_mon text;
  v_uni proc_unidad_cobro; v_vd date; v_temp text; v_esp text;
BEGIN
  SELECT * INTO r FROM proc_servicio_facturable
    WHERE id = p_servicio_id AND empresa_id = p_empresa_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'servicio % no existe', p_servicio_id; END IF;
  IF r.estado <> 'pendiente_tarifa' THEN
    RAISE EXCEPTION 'servicio no está pendiente de tarifa (está %)', r.estado;
  END IF;
  IF r.origen_tipo = 'orden' THEN
    SELECT especie_codigo INTO v_esp FROM proc_orden_proceso WHERE id = r.orden_id;
    SELECT m.temporada_codigo INTO v_temp FROM proc_orden_insumo i
      JOIN proc_movimiento m ON m.objeto_tipo='lote' AND m.objeto_id=i.lote_id AND m.naturaleza='entrada'
      WHERE i.orden_id = r.orden_id LIMIT 1;
  END IF;
  v_tid := proc_fn_resolver_tarifa(p_empresa_id, r.cliente_vinculo_id, v_temp, v_esp, r.tipo_servicio_id, r.fecha_hecho);
  IF v_tid IS NULL THEN RETURN 'pendiente_tarifa'; END IF;
  SELECT tarifa, moneda, unidad, vigencia_desde INTO v_tar, v_mon, v_uni, v_vd FROM proc_tarifa WHERE id = v_tid;
  UPDATE proc_servicio_facturable
     SET tarifa_id=v_tid, tarifa_aplicada=v_tar, moneda=v_mon, unidad_tarifa=v_uni, vigencia_usada=v_vd,
         subtotal=round(cantidad * v_tar, 2), estado='valorizado', updated_by=p_actor
   WHERE id = p_servicio_id;
  RETURN 'valorizado';
END $$;

-- FIN schema_proc_v7_7_f7_7.sql — backend MENOR (read-models + preview + revalorizar
-- pendiente). Aditivo/no disruptivo. NO cambia el modelo F6. NO aplicado a producción.
