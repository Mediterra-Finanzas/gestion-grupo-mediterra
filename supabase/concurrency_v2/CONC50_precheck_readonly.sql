-- ============================================================================
-- CONC50_precheck_readonly.sql — PASO 1 de la secuencia (READ-ONLY, NO muta nada).
-- Target: STAGING gestion-mediterra-staging (nlvfjpwiecgrosjnwwik). Producción = HANDS-OFF.
-- Ejecutar en Supabase SQL Editor. Devuelve UNA grilla; TODOS deben decir PASS.
-- Si cualquier fila dice FAIL / HARD STOP → NO ejecutar 50. Reportar.
-- No usa \set (no soportado por el SQL Editor). No abre transacción (solo SELECT).
-- ============================================================================
WITH chk AS (
  -- Fingerprint staging
  SELECT 1 AS ord, 'fingerprint_proc_>=30' AS check_name,
         (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')::text AS valor,
         CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%') >= 30
              THEN 'PASS' ELSE 'FAIL (target no es staging proc_*)' END AS estado
  UNION ALL
  SELECT 2, 'als_uuid_exacto=1',
         (SELECT count(*)::text FROM contab_empresas
            WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS'),
         CASE WHEN (SELECT count(*) FROM contab_empresas
                     WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS')=1
              THEN 'PASS' ELSE 'FAIL (fingerprint staging no confirmado)' END
  UNION ALL
  SELECT 3, 'calendario_data.main=1',
         (SELECT count(*)::text FROM calendario_data WHERE id='main'),
         CASE WHEN (SELECT count(*) FROM calendario_data WHERE id='main')=1
              THEN 'PASS' ELSE 'FAIL (destino sospechoso)' END
  UNION ALL
  SELECT 4, 'proc_movimiento_existe=1',
         (CASE WHEN to_regclass('public.proc_movimiento') IS NOT NULL THEN '1' ELSE '0' END),
         CASE WHEN to_regclass('public.proc_movimiento') IS NOT NULL
              THEN 'PASS' ELSE 'FAIL (aplicar schema_proc_v1 antes)' END
  UNION ALL
  -- Columnas que usa la mutación (deben existir en el ledger)
  SELECT 5, 'col_es_reversa_existe=1',
         (SELECT count(*)::text FROM information_schema.columns
            WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='es_reversa'),
         CASE WHEN (SELECT count(*) FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='es_reversa')=1
              THEN 'PASS' ELSE 'FAIL (ledger no compatible)' END
  UNION ALL
  SELECT 6, 'col_revierte_movimiento_id_existe=1',
         (SELECT count(*)::text FROM information_schema.columns
            WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='revierte_movimiento_id'),
         CASE WHEN (SELECT count(*) FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='revierte_movimiento_id')=1
              THEN 'PASS' ELSE 'FAIL (ledger no compatible)' END
  UNION ALL
  -- Estado limpio: la mutación es un ADD fresco (idempotente igual, pero informamos)
  SELECT 7, 'col_idempotency_key_AUSENTE',
         (SELECT count(*)::text FROM information_schema.columns
            WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key'),
         CASE WHEN (SELECT count(*) FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key')=0
              THEN 'PASS (fresco)'
              ELSE 'YA EXISTE — verificar tipo text; 50 es idempotente (ADD IF NOT EXISTS)' END
  UNION ALL
  SELECT 8, 'ix_ux_proc_mov_idem_AUSENTE',
         (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_idem'),
         CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_idem')=0
              THEN 'PASS (fresco)' ELSE 'YA EXISTE (50 idempotente)' END
  UNION ALL
  SELECT 9, 'ix_ux_proc_mov_reversa_unica_AUSENTE',
         (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica'),
         CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica')=0
              THEN 'PASS (fresco)' ELSE 'YA EXISTE (50 idempotente)' END
  UNION ALL
  -- CRÍTICO: datos incompatibles con el UNIQUE de reversa (esta columna YA existe → se puede medir)
  SELECT 10, 'dup_reversa_existente=0 (HARD STOP si !=0)',
         (SELECT COALESCE(count(*),0)::text FROM (
            SELECT empresa_id, revierte_movimiento_id
            FROM proc_movimiento
            WHERE es_reversa = true AND revierte_movimiento_id IS NOT NULL
            GROUP BY empresa_id, revierte_movimiento_id HAVING count(*) > 1) d),
         CASE WHEN (SELECT COALESCE(count(*),0) FROM (
                      SELECT empresa_id, revierte_movimiento_id
                      FROM proc_movimiento
                      WHERE es_reversa = true AND revierte_movimiento_id IS NOT NULL
                      GROUP BY empresa_id, revierte_movimiento_id HAVING count(*) > 1) d)=0
              THEN 'PASS'
              ELSE 'HARD STOP — doble reversa histórica: conciliar ANTES (NO deduplicar automáticamente)' END
)
SELECT check_name, valor, estado FROM chk ORDER BY ord;
