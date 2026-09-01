-- ============================================================================
-- CONC50_smoke_estructural.sql — SMOKE (estructural, READ-ONLY, bulletproof).
-- Prueba que los 2 índices son UNIQUE + PARCIALES sobre las columnas correctas.
-- Un índice UNIQUE parcial rechaza duplicados por definición de Postgres.
-- Devuelve 2 filas; ambas deben decir PASS. No muta, no usa temp tables, no \set.
-- ============================================================================
SELECT
  indexname,
  CASE
    WHEN indexdef ILIKE '%UNIQUE INDEX%'
     AND indexdef ILIKE '%WHERE%'
     AND (
          (indexname='ux_proc_mov_idem'
             AND indexdef ILIKE '%(empresa_id, idempotency_key)%'
             AND indexdef ILIKE '%idempotency_key IS NOT NULL%')
       OR (indexname='ux_proc_mov_reversa_unica'
             AND indexdef ILIKE '%(empresa_id, revierte_movimiento_id)%'
             AND indexdef ILIKE '%es_reversa%')
         )
    THEN 'PASS (UNIQUE parcial → rechaza duplicados)'
    ELSE 'REVISAR'
  END AS estado,
  indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('ux_proc_mov_idem','ux_proc_mov_reversa_unica')
ORDER BY indexname;
