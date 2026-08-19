-- ============================================================================
-- 40_validate_p2.sql — VALIDACIÓN P2 (§9). SOLO LECTURA. Correr tras aplicar P2 (antes de P3/P4).
-- Baseline local esperado: proc_tablas≈61, proc_vistas≈34, proc_fn≈70.
-- ============================================================================
\set ON_ERROR_STOP off

SELECT '--- P2 conteos ---' AS seccion;
SELECT
  (SELECT count(*) FROM pg_tables  WHERE schemaname='public' AND tablename LIKE 'proc_%')                              AS proc_tablas,
  (SELECT count(*) FROM pg_views   WHERE schemaname='public' AND viewname  LIKE 'proc_v_%')                            AS proc_vistas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'proc_fn_%') AS proc_funciones,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname LIKE 'proc_%' AND NOT t.tgisinternal) AS proc_triggers,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'proc_%')                              AS proc_indices;

SELECT '--- RLS: tablas proc_* SIN rowsecurity (esperado 0) ---' AS seccion;
SELECT count(*) AS proc_tablas_sin_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'proc_%' AND NOT c.relrowsecurity;

SELECT '--- FK externas de proc_* fuera de proc_*/contab_* (esperado vacío) ---' AS seccion;
SELECT conrelid::regclass AS tabla, confrelid::regclass AS referencia
FROM pg_constraint
WHERE contype='f' AND conrelid::regclass::text LIKE 'proc_%'
  AND confrelid::regclass::text NOT LIKE 'proc_%' AND confrelid::regclass::text NOT LIKE 'contab_%';

SELECT '--- FK huérfanas proc_vinculo → Core (esperado 0 | 0) ---' AS seccion;
SELECT
  (SELECT count(*) FROM proc_vinculo v WHERE v.grupo_empresa_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contab_empresas e WHERE e.id=v.grupo_empresa_id)) AS empresa_huerfanos,
  (SELECT count(*) FROM proc_vinculo v WHERE v.auxiliar_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contab_auxiliares a WHERE a.id=v.auxiliar_id)) AS auxiliar_huerfanos;

-- Ledger append-only: el trigger de bloqueo debe existir sobre proc_movimiento.
SELECT '--- Ledger append-only: trigger de bloqueo presente (esperado >=1) ---' AS seccion;
SELECT count(*) AS triggers_block_ledger
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='proc_movimiento' AND NOT t.tgisinternal;

SELECT '--- calendario_data: sigue presente y NINGÚN objeto proc_* la referencia ---' AS seccion;
SELECT (to_regclass('public.calendario_data') IS NOT NULL) AS calendario_data_existe;
