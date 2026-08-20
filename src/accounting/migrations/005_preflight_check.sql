-- =============================================================================
-- 005_preflight_check.sql
-- OA-024-05 ETAPA 0 — Preflight Read-Only
-- Fecha   : 2026-08-14
-- Autor   : Claude Code / Angelo Huerta CFO
-- Estado  : EJECUTAR PRIMERO, READ-ONLY, antes de cualquier DDL de Etapa 0
-- Ambiente: Supabase SQL Editor — staging/dev project
--           NO ejecutar en producción hasta que Etapa 0 sea STABLE
-- =============================================================================
-- INSTRUCCIÓN:
--   Ejecutar cada bloque en Supabase SQL Editor (modo READ-ONLY simulado).
--   No hay DDL aquí — solo SELECT e inspección de catálogos.
--   Copiar los resultados y reportar al CFO (Angelo) para desbloquear el gate.
-- =============================================================================

-- =============================================================================
-- CHECK 0: AMBIENTE Y PROYECTO
-- =============================================================================

SELECT
  current_database()                  AS database_name,
  current_schema()                    AS current_schema,
  version()                           AS postgres_version,
  now()                               AS preflight_timestamp;

-- =============================================================================
-- CHECK 1: INVENTARIO DE TABLAS RELEVANTES
-- =============================================================================

SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS total_size,
  pg_size_pretty(pg_relation_size(quote_ident(table_name)))       AS table_size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    -- D9-A: tablas en disputa
    'empresas',
    'contab_empresas',
    'core_entities',
    -- ANF (confirmed deployed)
    'anf_filiales',
    'anf_informes',
    'anf_saldos_esf',
    'anf_movimientos_er',
    'anf_libro_mayor',
    'anf_justificaciones',
    'anf_metricas_config',
    'anf_kpis_operacionales',
    'anf_kpis_derivados',
    'anf_tipos_cambio',
    -- Contable legacy v1
    'plan_cuentas',
    'asientos',
    'asiento_lineas',
    'saldos_cuenta',
    'periodos',
    'presupuesto',
    'activo_fijo',
    'mapeo_codigos',
    'centros_costo',
    'usuarios_empresa',
    'tipos_documento',
    'tipos_cambio',
    'auxiliares',
    'eliminaciones_intercompany',
    'migracion_importaciones',
    'auditoria_log',
    -- Contable legacy v2 (contab_*)
    'contab_plan_cuentas',
    'contab_asientos',
    'contab_asientos_lineas',
    'contab_homologacion',
    'contab_presupuesto',
    -- Accounting OA-024 (no deberían existir aún)
    'acc_period',
    'acc_journal_entry',
    'acc_account_balance',
    'acc_consolidation_run',
    'dim_type',
    'pln_scenario'
  )
ORDER BY table_name;

-- =============================================================================
-- CHECK 2: D9-A — ¿Existe `empresas`? ¿Cuántas filas? ¿Con FK activas?
-- =============================================================================

-- 2a: Existencia y conteo
SELECT
  'empresas'::TEXT AS table_name,
  COUNT(*)         AS row_count,
  MIN(created_at)  AS oldest_row,
  MAX(created_at)  AS newest_row
FROM empresas
UNION ALL
SELECT
  'contab_empresas'::TEXT,
  COUNT(*),
  NULL,
  NULL
FROM contab_empresas;
-- Si alguna tabla no existe, este query fallará con "relation does not exist"
-- Reportar cuál falló — eso confirma D9-A

-- 2b: Si `empresas` existe — mostrar contenido completo
SELECT
  codigo, nombre, moneda_func, method_consol, nci_pct, sistema_origen, activa
FROM empresas
ORDER BY codigo;

-- 2c: FK dependientes sobre `empresas` (tablas que la referencian)
SELECT
  tc.table_name       AS tabla_origen,
  kcu.column_name     AS columna_fk,
  ccu.table_name      AS tabla_referenciada,
  ccu.column_name     AS columna_ref
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'empresas'
ORDER BY tc.table_name;

-- =============================================================================
-- CHECK 3: anf_filiales — Contrato y contenido
-- =============================================================================

-- 3a: Estructura de la tabla
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'anf_filiales'
ORDER BY ordinal_position;

-- 3b: Contenido
SELECT id, codigo, nombre, moneda, sistema, activa
FROM anf_filiales
ORDER BY codigo;

-- 3c: FK dependientes sobre anf_filiales
SELECT
  tc.table_name       AS tabla_origen,
  kcu.column_name     AS columna_fk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'anf_filiales'
ORDER BY tc.table_name;

-- =============================================================================
-- CHECK 4: ¿Existe `core_entities`? (no debería)
-- =============================================================================

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'core_entities'
) AS core_entities_exists;

-- =============================================================================
-- CHECK 5: TRIGGERS Y FUNCIONES EXISTENTES RELEVANTES
-- =============================================================================

-- 5a: Funciones
SELECT
  routine_name,
  routine_type,
  data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE ANY(ARRAY['fn_%','trg_%','check_%'])
ORDER BY routine_name;

-- 5b: Triggers sobre tablas relevantes
SELECT
  trigger_name,
  event_object_table AS tabla,
  event_manipulation AS evento,
  action_timing      AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'empresas','anf_filiales','contab_empresas',
    'asientos','asiento_lineas','plan_cuentas'
  )
ORDER BY event_object_table, trigger_name;

-- =============================================================================
-- CHECK 6: RLS ESTADO ACTUAL — tablas relevantes
-- =============================================================================

SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'empresas','anf_filiales','contab_empresas',
    'plan_cuentas','asientos','saldos_cuenta',
    'anf_informes','anf_saldos_esf','anf_libro_mayor'
  )
ORDER BY tablename;

-- 6b: Políticas activas por tabla
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN (
    'empresas','anf_filiales','contab_empresas',
    'plan_cuentas','asientos','saldos_cuenta'
  )
ORDER BY tablename, policyname;

-- =============================================================================
-- CHECK 7: EXTENSIONES HABILITADAS
-- =============================================================================

SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name IN ('uuid-ossp','pgcrypto','btree_gist','pg_stat_statements','moddatetime')
ORDER BY name;

-- =============================================================================
-- CHECK 8: VISTAS EXISTENTES
-- =============================================================================

SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- =============================================================================
-- CHECK 9: MIGRATIONS APLICADAS (si existe tabla de control)
-- =============================================================================

-- Si existe supabase_migrations o similar:
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'supabase_migrations'
    AND table_name = 'schema_migrations'
) AS migrations_table_exists;

-- Si existe:
-- SELECT version FROM supabase_migrations.schema_migrations ORDER BY inserted_at DESC LIMIT 20;

-- =============================================================================
-- RESUMEN D9-A — INTERPRETAR RESULTADOS
-- =============================================================================
/*
Después de ejecutar este preflight, reportar:

A. ¿Qué tablas existen? (Check 1)
   [ ] empresas
   [ ] contab_empresas
   [ ] core_entities (no debería existir)
   [ ] anf_filiales
   [ ] plan_cuentas / asientos / etc.
   [ ] acc_* (no deberían existir)

B. D9-A: ¿Existe `empresas`?
   Si SÍ → cuántas filas, qué FKs dependen de ella
   Si NO → D9-A = CONFIRMED NO-DEPLOY (green light para core_entities)

C. anf_filiales: qué entidades existen, cuántas FKs dependen

D. Funciones/triggers existentes (para evitar conflictos con los nuevos)

E. RLS estado actual

GATE:
  Si `empresas` NO existe → CFO confirma → proceder con core_entities
  Si `empresas` SÍ existe con FKs → STOP, presentar migration plan, CFO decide
  Si `core_entities` ya existe → STOP, comparar contrato

Reportar TODOS los resultados antes de ejecutar el siguiente paso.
*/
