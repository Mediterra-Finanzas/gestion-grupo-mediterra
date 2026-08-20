-- ============================================================================
-- 50_validate_uat.sql — REPORTE DE COBERTURA UAT (§12) + bounded context (§16) + calendario (§15).
-- SOLO LECTURA. Muestra qué escenarios §11 produjo el seed. NO hace RAISE: es un reporte, no un gate,
-- porque el seed baseline actual NO cubre todo el §11 (ver columna 'cubierto').
-- ============================================================================
\set ON_ERROR_STOP off

SELECT '--- Cobertura §11/§12 (cubierto = filas > 0) ---' AS seccion;
SELECT escenario, filas, (filas > 0) AS cubierto FROM (
  SELECT 'recepción (multi-lote)'        AS escenario, (SELECT count(*) FROM proc_recepcion)            AS filas, 1 ord
  UNION ALL SELECT 'predios (≥2)',            (SELECT count(*) FROM proc_predios), 2
  UNION ALL SELECT 'cuarteles (≥2)',          (SELECT count(*) FROM proc_cuartel), 3
  UNION ALL SELECT 'contratos',               (SELECT count(*) FROM proc_cliente_contrato), 4
  UNION ALL SELECT 'órdenes de proceso',      (SELECT count(*) FROM proc_orden_proceso), 5
  UNION ALL SELECT 'consumo N:M (orden_insumo)', (SELECT count(*) FROM proc_orden_insumo), 6
  UNION ALL SELECT 'resultado / merma / descarte', (SELECT count(*) FROM proc_resultado), 7
  UNION ALL SELECT 'tarifas',                 (SELECT count(*) FROM proc_tarifa), 8
  UNION ALL SELECT 'tipos de envase',         (SELECT count(*) FROM proc_tipo_envase), 9
  UNION ALL SELECT 'movimientos de envase',   (SELECT count(*) FROM proc_envase_movimiento), 10
  UNION ALL SELECT 'pallets (PT)',            (SELECT count(*) FROM proc_pallet), 11
  UNION ALL SELECT 'repaletizaje',            (SELECT count(*) FROM proc_repaletizaje), 12
  UNION ALL SELECT 'despacho',                (SELECT count(*) FROM proc_despacho), 13
  UNION ALL SELECT 'reporting: config',       (SELECT count(*) FROM proc_reporte_config), 14
  UNION ALL SELECT 'reporting: destinatario', (SELECT count(*) FROM proc_reporte_destinatario), 15
) x ORDER BY ord;

SELECT '--- §16 bounded context: FK proc_* fuera de proc_*/contab_* (esperado vacío) ---' AS seccion;
SELECT conrelid::regclass AS tabla, confrelid::regclass AS ref FROM pg_constraint
WHERE contype='f' AND conrelid::regclass::text LIKE 'proc_%'
  AND confrelid::regclass::text NOT LIKE 'proc_%' AND confrelid::regclass::text NOT LIKE 'contab_%';

SELECT '--- §16 sin objetos de otros contextos (esperado 0) ---' AS seccion;
SELECT count(*) AS tablas_otros_contextos
FROM pg_tables WHERE schemaname='public'
  AND (tablename LIKE 'frisku%' OR tablename LIKE 'friskuBI%' OR tablename LIKE 'exp_%' OR tablename LIKE 'osi_%');

SELECT '--- §15 calendario_data sigue presente (comparar count vs baseline del preflight) ---' AS seccion;
-- Dinámico: no referencia la tabla en parse-time (robusto si el destino no la tuviera).
DO $$
DECLARE v_existe boolean; v_filas bigint;
BEGIN
  v_existe := to_regclass('public.calendario_data') IS NOT NULL;
  IF v_existe THEN
    EXECUTE 'SELECT count(*) FROM public.calendario_data' INTO v_filas;
    RAISE NOTICE 'calendario_data: existe=true, filas=% (comparar contra baseline del preflight; deben coincidir).', v_filas;
  ELSE
    RAISE NOTICE 'calendario_data: existe=false (en STAGING real DEBE existir — verificar target).';
  END IF;
END $$;
