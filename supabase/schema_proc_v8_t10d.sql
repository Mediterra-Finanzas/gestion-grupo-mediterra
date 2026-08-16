-- ============================================================================
-- schema_proc_v8_t10d.sql · T10d — Read-model de Cliente Service (listado + ficha)
-- Une identidad (proc_vinculo rol cliente_servicio) + relación Service
-- (proc_cliente_ficha) + estado contractual (T8) + contrato vigente y agregados
-- de contratos (T7). NO recrea reglas: el nivel/estado lo resuelve el backend
-- (proc_fn_estado_contractual_cliente). security_invoker → RLS por tenant.
-- Aditivo. NO toca T6-T9. NO producción.
-- ============================================================================

CREATE OR REPLACE VIEW proc_v_cliente_servicio AS
SELECT
  v.empresa_id,
  v.id                                AS cliente_vinculo_id,
  v.nombre_provisional                AS cliente,
  v.rut,
  v.estado                            AS vinculo_estado,
  f.id                                AS ficha_id,
  (f.id IS NOT NULL)                  AS tiene_ficha,
  f.contacto_principal, f.email, f.telefono, f.responsable_comercial,
  f.politica_contrato,
  f.estado                            AS ficha_estado,
  ec.j->>'nivel'                      AS nivel_contractual,
  ec.j->>'estado_display'             AS estado_contractual_display,
  COALESCE((ec.j->>'tiene_contrato_vigente')::boolean, false) AS tiene_contrato_vigente,
  cv.codigo                           AS contrato_vigente_codigo,
  cv.version                          AS contrato_vigente_version,
  cv.fecha_termino                    AS contrato_vigente_hasta,
  COALESCE(cc.n_contratos, 0)         AS n_contratos,
  COALESCE(cc.n_vigentes, 0)          AS n_vigentes,
  COALESCE(cc.n_pendiente_firma, 0)   AS n_pendiente_firma,
  COALESCE(cc.n_vencidos, 0)          AS n_vencidos
FROM proc_vinculo v
LEFT JOIN proc_cliente_ficha f
  ON f.cliente_vinculo_id = v.id AND f.empresa_id = v.empresa_id AND f.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT proc_fn_estado_contractual_cliente(v.empresa_id, v.id) AS j
) ec ON true
LEFT JOIN LATERAL (
  SELECT c.codigo, c.version, c.fecha_termino
  FROM proc_cliente_contrato c
  WHERE c.empresa_id = v.empresa_id AND c.cliente_vinculo_id = v.id
    AND c.estado = 'vigente' AND c.deleted_at IS NULL
  ORDER BY c.version DESC LIMIT 1
) cv ON true
LEFT JOIN LATERAL (
  SELECT count(*)                                         AS n_contratos,
         count(*) FILTER (WHERE c.estado = 'vigente')         AS n_vigentes,
         count(*) FILTER (WHERE c.estado = 'pendiente_firma') AS n_pendiente_firma,
         count(*) FILTER (WHERE c.estado = 'vencido')         AS n_vencidos
  FROM proc_cliente_contrato c
  WHERE c.empresa_id = v.empresa_id AND c.cliente_vinculo_id = v.id AND c.deleted_at IS NULL
) cc ON true
WHERE v.rol_operacional = 'cliente_servicio' AND v.deleted_at IS NULL;

ALTER VIEW proc_v_cliente_servicio SET (security_invoker = on);

-- FIN T10d (read-model). Aditivo. NO producción.
