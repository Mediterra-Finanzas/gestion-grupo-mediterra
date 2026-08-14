-- ============================================================================
-- schema_proc_v7_6_f7_6.sql · F7.6 — BACKEND MENOR (aditivo, no destructivo)
--   Read-models de Resultado de Proceso. NO agrega motor de reportes: consume
--   el contrato F5 (proc_informe/_version/_fuente/_destinatario/_envio).
--   La no-duplicación de fuente ya la garantiza UNIQUE(version_id,tipo,ref_id).
--   Snapshot inmutable e inmutabilidad de versión emitida = F5 (no se tocan).
-- NO altera snapshot/versionamiento/fuentes/identidad. Requiere v1..v7_5.
-- ============================================================================

-- ── Órdenes informables (cerradas/conciliadas) con packout + flag "informada" ─
-- Para la bandeja "pendientes de generar" (informada=false) y el selector de
-- fuentes. Números derivados de F1–F4 (no se recalculan en React).
CREATE OR REPLACE VIEW proc_v_orden_informable AS
SELECT o.id AS orden_id, o.empresa_id, o.folio, o.fecha, o.planta_id, o.estado,
       o.especie_codigo, o.variedad_codigo, o.cliente_servicio_vinculo_id,
       cli.nombre_provisional AS cliente,
       COALESCE(co.kg_entrada,0)   AS kg_procesados,
       COALESCE(co.kg_resultado,0) AS kg_comerciales,
       CASE WHEN COALESCE(co.kg_entrada,0) > 0 THEN round(co.kg_resultado / co.kg_entrada, 4) ELSE NULL END AS packout,
       EXISTS (SELECT 1 FROM proc_informe_fuente f
                WHERE f.empresa_id=o.empresa_id AND f.tipo_fuente='orden' AND f.ref_id=o.id) AS informada
FROM proc_orden_proceso o
LEFT JOIN proc_vinculo cli ON cli.id = o.cliente_servicio_vinculo_id
LEFT JOIN proc_v_orden_conciliacion co ON co.orden_id = o.id
WHERE o.deleted_at IS NULL AND o.estado IN ('conciliado','cerrado');
ALTER VIEW proc_v_orden_informable SET (security_invoker = on);

-- ── Informes (bandeja) con destinatario + estado de versión vigente ─────────
CREATE OR REPLACE VIEW proc_v_informe_listado AS
SELECT i.id, i.empresa_id, i.folio, i.temporada_codigo, i.planta_id, i.estado, i.version_actual,
       i.destinatario_principal_vinculo_id,
       dest.nombre_provisional AS destinatario,
       (SELECT count(*) FROM proc_informe_version v WHERE v.informe_id=i.id) AS versiones,
       (SELECT max(v.emitido_at) FROM proc_informe_version v WHERE v.informe_id=i.id AND v.estado='emitida') AS emitido_at,
       (SELECT v.estado FROM proc_informe_version v WHERE v.informe_id=i.id ORDER BY v.version DESC LIMIT 1) AS estado_version,
       (SELECT v.packout FROM proc_informe_version v WHERE v.informe_id=i.id ORDER BY v.version DESC LIMIT 1) AS packout,
       (SELECT v.kg_procesados FROM proc_informe_version v WHERE v.informe_id=i.id ORDER BY v.version DESC LIMIT 1) AS kg_procesados
FROM proc_informe i
LEFT JOIN proc_vinculo dest ON dest.id = i.destinatario_principal_vinculo_id
WHERE i.deleted_at IS NULL;
ALTER VIEW proc_v_informe_listado SET (security_invoker = on);
