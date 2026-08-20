-- =============================================================================
-- 007_security_final_preflight.sql
-- OA-024-05 ETAPA 0 — Security Gate: Preflight Final Antes de DDL
-- Fecha   : 2026-08-14
-- Estado  : EJECUTAR EN SQL EDITOR — READ-ONLY — ANTES de cualquier DDL
-- =============================================================================
-- INSTRUCCIÓN:
--   Ejecutar las 2 queries en Supabase SQL Editor.
--   Reportar resultados al CFO/Claude Code.
--   Decision logic al final.
--
-- GO si: las policies y FKs confirman el escenario del preflight REST.
-- STOP si: hay policies inesperadas o FKs no documentadas.
-- =============================================================================

-- =============================================================================
-- QUERY 1: RLS POLICIES — empresas, anf_filiales, contab_empresas
-- =============================================================================

SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('empresas', 'anf_filiales', 'contab_empresas')
ORDER BY tablename, cmd, policyname;

-- Resultado esperado (basado en análisis REST):
--   empresas:       Al menos una policy que permite anon SELECT (explicaría por qué
--                   el preflight recuperó 11 rows con anon key).
--   anf_filiales:   Igual — anon puede SELECT (8 rows recuperadas).
--   contab_empresas: Probablemente similar.
--
-- Resultado que activa STOP:
--   a) Policy que permite anon DELETE/UPDATE sin restricción en empresas o anf_filiales.
--      → Riesgo: datos legacy accesibles para borrado anónimo. Requiere fix antes de DDL.
--   b) Policy que restringe authenticated completamente (bloquearía futura migración).
--   c) Tablas sin RLS habilitado del todo (rowsecurity=false).
--
-- Si tablas NO tienen RLS habilitado (0 policies en pg_policies pero datos son visibles):
--   → Esto significa que RLS está OFF para esas tablas.
--   → No bloquea DDL de 006/008, pero sí debe reportarse.
--   → Fix SEC-1 legacy puede abordar esto en etapa posterior.

-- =============================================================================
-- QUERY 2: FK CATALOG — tablas con datos reales que referencian masters
-- =============================================================================

SELECT
  tc.table_name         AS tabla_origen,
  kcu.column_name       AS columna_fk,
  ccu.table_name        AS tabla_referenciada,
  ccu.column_name       AS columna_ref,
  tc.constraint_name    AS constraint_name,
  tc.is_deferrable,
  tc.initially_deferred
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema   = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema   = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN (
    'periodos',
    'contab_plan_cuentas',
    'contab_homologacion',
    'plan_cuentas',
    'asientos',
    'saldos_cuenta',
    'asiento_lineas',
    'usuarios_empresa',
    'presupuesto',
    'activo_fijo',
    'mapeo_codigos',
    'centros_costo',
    'eliminaciones_intercompany',
    'migracion_importaciones',
    'auditoria_log'
  )
ORDER BY tc.table_name, kcu.column_name;

-- Resultado esperado:
--   periodos.empresa_id → empresas.id (confirmado por datos REST)
--   contab_plan_cuentas.empresa_id → contab_empresas.id (esperado por diseño)
--   contab_homologacion.empresa_id → contab_empresas.id (esperado)
--   Tablas vacías (plan_cuentas, asientos, etc.) → FKs a empresas pero sin datos
--
-- Resultado crítico para migration:
--   Si contab_plan_cuentas → empresas (no contab_empresas):
--     → Los 746 rows de contab_plan_cuentas referencian empresas.id directamente.
--     → core_entities con mismos UUIDs igualmente compatible.
--     → No cambia el GO/NO-GO, pero sí la secuencia de migration FK.
--   Si hay FKs no documentadas (tablas inesperadas):
--     → STOP y documentar antes de proceder.

-- =============================================================================
-- DECISION LOGIC
-- =============================================================================

/*
ESCENARIO GO:
  Q1: Las policies permiten anon SELECT pero no anon DELETE (o no hay policies = RLS OFF)
  Q2: FKs confirman periodos→empresas y contab_*→contab_empresas (o empresas, mismos UUIDs)
  Sin FKs sorpresivas no documentadas.
  → Proceder con 006 → 008 → 009 → 010 → 011 → 012 → 013 (en ese orden).

ESCENARIO STOP-1 (anon DELETE activo en empresas/anf_filiales):
  → Antes de DDL de 006: aplicar fix RLS mínimo en empresas/anf_filiales.
  → Fix: DROP permissive ALL policy, CREATE SELECT-only para anon.
  → Luego proceder con 006.

ESCENARIO STOP-2 (FK inesperada no documentada):
  → Reportar al CFO con tabla y constraint.
  → No proceder hasta reconciliar.

ESCENARIO STOP-3 (core_entities ya existe):
  → Este script no lo checkea (ya confirmado NOT EXISTS en preflight REST).
  → Si por alguna razón existiera: STOP, comparar contrato.
*/
