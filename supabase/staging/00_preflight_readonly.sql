-- ============================================================================
-- 00_preflight_readonly.sql — PRE-FLIGHT REMOTO (§2). SOLO LECTURA. No modifica nada.
-- Ejecutar en el SQL Editor de gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik) ANTES del guard.
-- Confirma estado de entrada y captura baseline. No toca calendario_data.
-- ============================================================================
\set ON_ERROR_STOP off

SELECT '--- PRE-FLIGHT baseline ---' AS seccion;

SELECT
  current_database()                                   AS db,
  (to_regclass('public.calendario_data') IS NOT NULL)  AS calendario_data_existe,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public')                            AS tablas_public,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')    AS proc_tablas_baseline,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'contab_%')  AS contab_tablas_baseline;

-- Extensiones necesarias (proc_* usa gen_random_uuid — nativo en PG13+; pgcrypto opcional).
SELECT 'extension' AS tipo, extname FROM pg_extension WHERE extname IN ('pgcrypto','uuid-ossp')
UNION ALL SELECT 'gen_random_uuid_disponible', (to_regprocedure('gen_random_uuid()') IS NOT NULL)::text;

-- Roles Supabase presentes.
SELECT 'rol' AS tipo, rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY rolname;

-- Materialización concurrente: no debe existir proc_* ni contab_* aún.
SELECT 'ESPERADO STAGING LIMPIO: proc_tablas=0 y contab_tablas=0' AS nota;
