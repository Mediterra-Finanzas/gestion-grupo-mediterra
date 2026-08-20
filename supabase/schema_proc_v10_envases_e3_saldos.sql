-- ============================================================================
-- schema_proc_v10_envases_e3_saldos.sql
-- PROC-ENVASES-001 · E3 — Read-models de saldo y movimientos (derivados del ledger).
-- Saldo NUNCA se almacena; se deriva de proc_envase_movimiento. security_invoker=on (respeta RLS).
-- Referencias humanas (nombres de vínculo/ubicación); nunca UUID crudo en la UI.
-- ============================================================================

-- Saldo por posición: (tipo, owner, holder, ubicación, condición). holder_es_service distingue
-- "en custodia de Allegria Service" (rol propietario_planta) de "en poder de un tercero".
CREATE OR REPLACE VIEW proc_v_envase_saldo WITH (security_invoker=on) AS
WITH mov AS (
  SELECT empresa_id, tipo_envase_id, owner_vinculo_id,
         holder_hacia_vinculo_id AS holder_vinculo_id, ubicacion_hacia_id AS ubicacion_id,
         condicion_hacia AS condicion, cantidad AS delta
  FROM proc_envase_movimiento WHERE holder_hacia_vinculo_id IS NOT NULL
  UNION ALL
  SELECT empresa_id, tipo_envase_id, owner_vinculo_id,
         holder_desde_vinculo_id, ubicacion_desde_id, condicion_desde, -cantidad
  FROM proc_envase_movimiento WHERE holder_desde_vinculo_id IS NOT NULL
), agg AS (
  SELECT empresa_id, tipo_envase_id, owner_vinculo_id, holder_vinculo_id, ubicacion_id, condicion,
         SUM(delta) AS saldo
  FROM mov GROUP BY 1,2,3,4,5,6
)
SELECT a.empresa_id, a.tipo_envase_id, a.owner_vinculo_id, a.holder_vinculo_id, a.ubicacion_id,
       a.condicion, a.saldo,
       te.codigo AS tipo_codigo, te.nombre AS tipo_nombre,
       ow.nombre_provisional AS owner_nombre, ow.rol_operacional AS owner_rol,
       ho.nombre_provisional AS holder_nombre, ho.rol_operacional AS holder_rol,
       ub.nombre AS ubicacion_nombre, ub.codigo AS ubicacion_codigo,
       (ho.rol_operacional = 'propietario_planta') AS holder_es_service
FROM agg a
JOIN proc_tipo_envase te ON te.id = a.tipo_envase_id
LEFT JOIN proc_vinculo ow ON ow.id = a.owner_vinculo_id
LEFT JOIN proc_vinculo ho ON ho.id = a.holder_vinculo_id
LEFT JOIN proc_ubicaciones ub ON ub.id = a.ubicacion_id
WHERE a.saldo <> 0;

-- Ledger con etiquetas humanas para la pantalla de Movimientos.
CREATE OR REPLACE VIEW proc_v_envase_movimiento WITH (security_invoker=on) AS
SELECT m.id, m.empresa_id, m.fecha, m.naturaleza, m.cantidad,
       m.tipo_envase_id, te.codigo AS tipo_codigo, te.nombre AS tipo_nombre,
       m.owner_vinculo_id, ow.nombre_provisional AS owner_nombre,
       m.holder_desde_vinculo_id, hd.nombre_provisional AS holder_desde_nombre,
       m.holder_hacia_vinculo_id, hh.nombre_provisional AS holder_hacia_nombre,
       ud.nombre AS ubicacion_desde_nombre, uh.nombre AS ubicacion_hacia_nombre,
       m.condicion_desde, m.condicion_hacia, m.ref_tipo, m.ref_id, m.motivo, m.created_at
FROM proc_envase_movimiento m
JOIN proc_tipo_envase te ON te.id = m.tipo_envase_id
LEFT JOIN proc_vinculo ow ON ow.id = m.owner_vinculo_id
LEFT JOIN proc_vinculo hd ON hd.id = m.holder_desde_vinculo_id
LEFT JOIN proc_vinculo hh ON hh.id = m.holder_hacia_vinculo_id
LEFT JOIN proc_ubicaciones ud ON ud.id = m.ubicacion_desde_id
LEFT JOIN proc_ubicaciones uh ON uh.id = m.ubicacion_hacia_id;

GRANT SELECT ON proc_v_envase_saldo, proc_v_envase_movimiento TO anon, authenticated;
