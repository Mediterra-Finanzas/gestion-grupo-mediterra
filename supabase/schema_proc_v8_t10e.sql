-- ============================================================================
-- schema_proc_v8_t10e.sql · T10e — Cierre UI: read-models de listado corregidos
-- + campos de filtrado server-side. ADITIVO/CORRECTIVO sobre read-models (NO toca
-- ledger, genealogía, ownership, QC/MASA backend, RLS de tablas ni bounded context).
--
-- Corrige un defecto introducido por T10c-QC: el join a proc_qc_recepcion por
-- recepcion (sin lote_id) MULTIPLICABA filas cuando hay QC por lote + header, y el
-- qc_resultado quedaba ambiguo. Se resuelve el QC por LOTE (propio → fallback header)
-- vía LATERAL (una sola fila por lote / por recepción).
-- CREATE OR REPLACE: se conservan columnas y orden existentes; sólo se AGREGAN al final.
-- ============================================================================

-- ── Lote: origen a nivel LOTE (snapshot-aware) + QC por lote + ids filtrables ──
CREATE OR REPLACE VIEW proc_v_lote_listado AS
SELECT l.id, l.empresa_id, l.codigo, l.recepcion_id, r.folio AS recepcion_folio,
       r.planta_id, r.temporada_id, l.especie_codigo, l.variedad_codigo, l.estado, l.ubicacion,
       cli.nombre_provisional AS cliente,
       -- productor del LOTE (no del header): snapshot inmutable → vínculo del lote → header
       COALESCE(l.origen_snapshot->'productor'->>'nombre', prodl.nombre_provisional, prodr.nombre_provisional) AS productor,
       due.nombre_provisional AS dueno_fruta,
       qc.resultado           AS qc_resultado,
       COALESCE(s.on_hand,0)    AS on_hand,
       COALESCE(s.reservado,0)  AS reservado,
       COALESCE(s.bloqueado,0)  AS bloqueado,
       COALESCE(s.disponible,0) AS disponible,
       -- ▼ columnas nuevas (filtrado server-side) ▼
       r.cliente_servicio_vinculo_id AS cliente_vinculo_id,
       l.productor_vinculo_id,
       COALESCE(l.origen_snapshot->'predio'->>'nombre', pre.nombre)                       AS predio,
       l.predio_id,
       COALESCE(l.origen_snapshot->'cuartel'->>'codigo', cu.codigo, l.origen_snapshot->>'cuartel') AS cuartel,
       l.cuartel_id,
       COALESCE(l.origen_reconstruido, false) AS origen_reconstruido
FROM proc_lote l
JOIN proc_recepcion r ON r.id = l.recepcion_id
LEFT JOIN proc_vinculo cli   ON cli.id   = r.cliente_servicio_vinculo_id
LEFT JOIN proc_vinculo prodl ON prodl.id = l.productor_vinculo_id
LEFT JOIN proc_vinculo prodr ON prodr.id = r.productor_vinculo_id
LEFT JOIN proc_vinculo due   ON due.id   = r.dueno_fruta_vinculo_id
LEFT JOIN proc_predios pre   ON pre.id   = l.predio_id
LEFT JOIN proc_cuartel cu    ON cu.id    = l.cuartel_id
LEFT JOIN proc_v_lote_saldos s ON s.lote_id = l.id
LEFT JOIN LATERAL (
  SELECT q.resultado FROM proc_qc_recepcion q
  WHERE q.recepcion_id = l.recepcion_id AND q.empresa_id = l.empresa_id AND q.deleted_at IS NULL
    AND (q.lote_id = l.id OR q.lote_id IS NULL)
  ORDER BY (q.lote_id IS NOT DISTINCT FROM l.id) DESC   -- QC propio del lote primero (nunca NULL); si no hay, header
  LIMIT 1
) qc ON true
WHERE l.deleted_at IS NULL;
ALTER VIEW proc_v_lote_listado SET (security_invoker = on);

-- ── Recepción: QC sin multiplicación (header) + resumen por lote + ids filtro ──
CREATE OR REPLACE VIEW proc_v_recepcion_listado AS
SELECT r.id, r.empresa_id, r.folio, r.fecha, r.planta_id, r.temporada_id,
       r.especie_codigo, r.variedad_codigo, r.kg_bruto, r.tara, r.kg_neto, r.estado,
       r.guia_despacho, r.patente,
       cli.nombre_provisional  AS cliente,
       prod.nombre_provisional AS productor,
       due.nombre_provisional  AS dueno_fruta,
       expo.nombre_provisional AS exportadora,
       qh.resultado            AS qc_resultado,   -- QC de cabecera (header, lote_id NULL); NO multiplica
       (SELECT count(*) FROM proc_lote l WHERE l.recepcion_id=r.id AND l.deleted_at IS NULL) AS lotes,
       -- ▼ columnas nuevas ▼
       r.cliente_servicio_vinculo_id,
       -- resumen QC por lote (conteos = hechos, NO un veredicto global inventado)
       COALESCE(qs.aprobados,0)   AS qc_aprobados,
       COALESCE(qs.rechazados,0)  AS qc_rechazados,
       COALESCE(qs.condicional,0) AS qc_condicional,
       COALESCE(qs.con_qc,0)      AS qc_con_qc,
       COALESCE(qs.mixto,false)   AS qc_mixto,
       -- conciliación de masa (T10c-MASA): permite filtrar cuadra/descuadre
       mc.dentro_tolerancia       AS masa_dentro_tolerancia,
       -- situación contractual del cliente (backend autoridad, T8)
       (proc_fn_estado_contractual_cliente(r.empresa_id, r.cliente_servicio_vinculo_id, current_date))->>'nivel' AS nivel_contractual
FROM proc_recepcion r
LEFT JOIN proc_vinculo cli  ON cli.id  = r.cliente_servicio_vinculo_id
LEFT JOIN proc_vinculo prod ON prod.id = r.productor_vinculo_id
LEFT JOIN proc_vinculo due  ON due.id  = r.dueno_fruta_vinculo_id
LEFT JOIN proc_vinculo expo ON expo.id = r.exportadora_vinculo_id
LEFT JOIN LATERAL (
  SELECT q.resultado FROM proc_qc_recepcion q
  WHERE q.recepcion_id = r.id AND q.empresa_id = r.empresa_id AND q.deleted_at IS NULL AND q.lote_id IS NULL
  LIMIT 1
) qh ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE resultado='aprobado')    AS aprobados,
         count(*) FILTER (WHERE resultado='rechazado')   AS rechazados,
         count(*) FILTER (WHERE resultado='condicional') AS condicional,
         count(*)                                        AS con_qc,
         (count(DISTINCT resultado) > 1)                 AS mixto
  FROM proc_qc_recepcion q
  WHERE q.recepcion_id = r.id AND q.empresa_id = r.empresa_id AND q.deleted_at IS NULL AND q.lote_id IS NOT NULL
) qs ON true
LEFT JOIN proc_v_recepcion_conciliacion mc ON mc.recepcion_id = r.id AND mc.empresa_id = r.empresa_id
WHERE r.deleted_at IS NULL;
ALTER VIEW proc_v_recepcion_listado SET (security_invoker = on);

-- FIN T10e (read-models). Aditivo/correctivo. NO producción.
