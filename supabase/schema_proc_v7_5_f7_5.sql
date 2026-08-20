-- ============================================================================
-- schema_proc_v7_5_f7_5.sql · F7.5 — BACKEND MENOR (aditivo, no destructivo)
--   1) Cancelar despacho no-confirmado: libera reservas + estado cancelado
--      (F4 solo tenía reversa desde 'despachado'; cancelar previo dejaba holds).
--   2) Read-models: despachos (con nombres + totales), líneas de despacho,
--      holds de pallet con folio de despacho (para "reservado para DES-...").
-- NO altera ledger/SoT/composición/repaletizaje/despacho F4. Req v1..v7_4.
-- ============================================================================

-- ── 1. CANCELAR despacho no-confirmado (libera reservas) ────────────────────
-- Distinto de reversar_despacho (que restituye físico de un despacho YA
-- despachado). Cancelar aplica a borrador/preparando/listo/cargando: no hubo
-- salida física, solo se liberan las reservas (holds) del despacho.
CREATE OR REPLACE FUNCTION proc_fn_cancelar_despacho(p_empresa uuid, p_despacho uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM proc_despacho WHERE id=p_despacho AND empresa_id=p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'despacho % no existe', p_despacho; END IF;
  IF v_estado = 'despachado' THEN
    RAISE EXCEPTION 'despacho ya despachado: usar reversa, no cancelación' USING ERRCODE='check_violation';
  END IF;
  IF v_estado = 'cancelado' THEN RETURN; END IF;
  -- liberar todas las reservas activas del despacho
  UPDATE proc_hold SET estado='liberado', liberado_por=p_actor, liberado_at=now()
   WHERE empresa_id=p_empresa AND ref_tipo='despacho' AND ref_id=p_despacho AND estado='activo';
  UPDATE proc_despacho SET estado='cancelado', updated_by=p_actor WHERE id=p_despacho;
END $$;

-- ── 2. READ-MODELS (security_invoker → RLS por empresa) ─────────────────────
CREATE OR REPLACE VIEW proc_v_despacho_listado AS
SELECT d.id, d.empresa_id, d.folio, d.temporada_codigo, d.planta_origen_id, d.estado,
       d.fecha_prevista, d.fecha_efectiva, d.vehiculo_patente, d.conductor,
       cli.nombre_provisional   AS cliente,
       dest.nombre_provisional  AS destinatario,
       trans.nombre_provisional AS transportista,
       COALESCE(co.n_pallets,0) AS pallets, COALESCE(co.cajas,0) AS cajas, COALESCE(co.kg,0) AS kg,
       (SELECT count(*) FROM proc_despacho_doc dd WHERE dd.despacho_id=d.id AND dd.deleted_at IS NULL) AS docs
FROM proc_despacho d
LEFT JOIN proc_vinculo cli   ON cli.id   = d.cliente_servicio_vinculo_id
LEFT JOIN proc_vinculo dest  ON dest.id  = d.destinatario_vinculo_id
LEFT JOIN proc_vinculo trans ON trans.id = d.transportista_vinculo_id
LEFT JOIN LATERAL (
  SELECT count(DISTINCT pallet_id) AS n_pallets, COALESCE(SUM(cajas),0) AS cajas, COALESCE(SUM(kg),0) AS kg
  FROM proc_despacho_linea WHERE despacho_id=d.id AND estado='confirmada'
) co ON true
WHERE d.deleted_at IS NULL;
ALTER VIEW proc_v_despacho_listado SET (security_invoker = on);

CREATE OR REPLACE VIEW proc_v_despacho_linea AS
SELECT dl.id, dl.empresa_id, dl.despacho_id, dl.pallet_id, p.codigo AS pallet_codigo,
       dl.pt_id, dl.cajas, dl.kg, dl.ubicacion_origen_id, u.nombre AS ubicacion_origen,
       dl.estado, dl.movimiento_id, dl.created_at
FROM proc_despacho_linea dl
JOIN proc_pallet p ON p.id = dl.pallet_id
LEFT JOIN proc_ubicaciones u ON u.id = dl.ubicacion_origen_id;
ALTER VIEW proc_v_despacho_linea SET (security_invoker = on);

-- Holds de pallet con folio de despacho (para "reservado para DES-...").
CREATE OR REPLACE VIEW proc_v_pallet_hold AS
SELECT h.id, h.empresa_id, h.objeto_id AS pallet_id, h.tipo, h.cantidad, h.estado,
       h.ref_tipo, h.ref_id, h.motivo, h.created_at, h.liberado_at,
       d.folio AS despacho_folio
FROM proc_hold h
LEFT JOIN proc_despacho d ON d.id = h.ref_id AND h.ref_tipo = 'despacho'
WHERE h.objeto_tipo = 'pallet';
ALTER VIEW proc_v_pallet_hold SET (security_invoker = on);
