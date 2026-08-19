-- =============================================================================
-- 013b_source_adapter_preflight.sql
-- OA-024-07 — Preflight READ-ONLY antes de ejecutar 014
-- Fecha   : 2026-08-17
-- Autor   : Generado por static review previo a ejecución CFO
-- =============================================================================
-- INSTRUCCIÓN: SOLO SELECT. No ejecutar 014, 015, 012 hasta que este preflight
-- entregue resultado PASS. Copiar y pegar completo en SQL Editor → Run.
-- =============================================================================


-- =============================================================================
-- BLOQUE 1: Constraint CHECK actual de acc_source_batch.status
-- Objetivo: confirmar el nombre del constraint y los valores permitidos hoy.
-- =============================================================================

SELECT
  conname         AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.acc_source_batch'::regclass
  AND contype  = 'c'           -- c = CHECK
ORDER BY conname;

-- Esperado: al menos un CHECK con valores legacy:
--   'pending','processing','completed','failed','rejected'
-- El nombre puede ser ck_acc_source_batch_status o similar.
-- 014 elimina este CHECK con DROP CONSTRAINT IF EXISTS ck_acc_source_batch_status
-- → verificar que el nombre aquí coincide con ese IF EXISTS.


-- =============================================================================
-- BLOQUE 2: Conteo de filas por status actual
-- =============================================================================

SELECT
  status,
  COUNT(*) AS filas
FROM acc_source_batch
GROUP BY status
ORDER BY filas DESC;

-- Si la tabla está vacía → resultado en blanco → migración limpia sin riesgo.
-- Si hay filas → identificar si algún status es legacy (ver bloque 3).


-- =============================================================================
-- BLOQUE 3: Listado de filas con status legacy
-- Objetivo: confirmar si hay registros que 014 necesita transformar.
-- Columnas: sin datos financieros (id, entity_id, source_system, file_name,
--           status, created_at). SIN file_hash, row_count, error_detail.
-- =============================================================================

SELECT
  b.id,
  b.entity_id,
  e.code            AS entity_code,
  b.source_system,
  b.file_name,
  b.status,
  b.created_at
FROM acc_source_batch b
LEFT JOIN core_entities e ON e.id = b.entity_id
WHERE b.status IN ('pending', 'processing', 'completed', 'failed', 'rejected')
ORDER BY b.created_at;

-- Si 0 filas → NO hay filas legacy → migración limpia.
-- Si N filas → 014 las transformará con estos UPDATEs (en este orden, antes del DROP):
--   pending     → CREATED
--   processing  → PARSING
--   completed   → POSTED
--   failed      → REJECTED
--   rejected    → REJECTED


-- =============================================================================
-- BLOQUE 4: Confirmar mapping explícito de 014 sobre filas legacy
-- Objetivo: mostrar exactamente qué recibiría cada fila legacy tras 014.
-- =============================================================================

SELECT
  b.id,
  b.status                   AS status_actual,
  CASE b.status
    WHEN 'pending'     THEN 'CREATED'
    WHEN 'processing'  THEN 'PARSING'
    WHEN 'completed'   THEN 'POSTED'
    WHEN 'failed'      THEN 'REJECTED'
    WHEN 'rejected'    THEN 'REJECTED'
    ELSE '** NO LEGACY — sin cambio **'
  END                        AS status_post_014,
  e.code                     AS entity_code,
  b.source_system,
  b.file_name,
  b.created_at
FROM acc_source_batch b
LEFT JOIN core_entities e ON e.id = b.entity_id
WHERE b.status IN ('pending', 'processing', 'completed', 'failed', 'rejected')
ORDER BY b.created_at;

-- Si 0 filas → sección vacía → sin riesgo de datos huérfanos.


-- =============================================================================
-- BLOQUE 5: Columnas actuales de acc_source_batch
-- Objetivo: confirmar schema base antes de los ADD COLUMN de 014.
-- =============================================================================

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'acc_source_batch'
ORDER BY ordinal_position;

-- Esperado pre-014: ~12 columnas sin report_type, approved_by, approved_at,
-- posted_at, posted_by, superseded_by_id.
-- Si alguna de esas ya existe → 014 usa ADD COLUMN IF NOT EXISTS → no rompe.


-- =============================================================================
-- BLOQUE 6: Todos los constraints actuales de acc_source_batch
-- Objetivo: confirmar nombre exacto del CHECK de status + constraints que 014
-- NO debe tocar (UNIQUE file_hash, FK entity_id → core_entities, etc.).
-- =============================================================================

SELECT
  conname         AS constraint_name,
  contype         AS tipo,   -- c=CHECK, u=UNIQUE, f=FK, p=PK
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.acc_source_batch'::regclass
ORDER BY contype, conname;

-- IMPORTANTE: verificar que el nombre del CHECK de status que aparece en el
-- resultado sea exactamente el que 014 usa en:
--   ALTER TABLE acc_source_batch DROP CONSTRAINT IF EXISTS ck_acc_source_batch_status;
-- Si el nombre difiere → el DROP usa IF EXISTS → no falla, pero el CHECK antiguo
-- permanecería. Ese sería un STOP.


-- =============================================================================
-- BLOQUE 7: Índices actuales de acc_source_batch
-- Objetivo: confirmar que 014 no duplica índices existentes (usa IF NOT EXISTS).
-- =============================================================================

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
ORDER BY indexname;

-- Esperado: ~2-3 índices (PK + uq_source_batch_hash + tal vez entity_id).
-- Los nuevos índices de 014 usan CREATE INDEX IF NOT EXISTS → no falla.


-- =============================================================================
-- BLOQUE 8: RLS actual de acc_source_batch
-- =============================================================================

SELECT
  t.schemaname,
  t.tablename,
  t.rowsecurity              AS rls_enabled,
  c.relforcerowsecurity      AS rls_forced
FROM pg_tables t
JOIN pg_class c
  ON c.relname = t.tablename
 AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
  AND t.tablename  = 'acc_source_batch';

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
ORDER BY policyname;

-- 014 NO modifica RLS de acc_source_batch (solo crea RLS en tablas nuevas).
-- Documentar estado actual para comparar post-014.


-- =============================================================================
-- BLOQUE 9: RLS de tablas que 014 crea (no deben existir aún)
-- Si ya existen → 014 CREATE TABLE IF NOT EXISTS → no rompe; pero RLS existente
-- puede diferir. Verificar.
-- =============================================================================

SELECT
  t.tablename,
  t.rowsecurity              AS rls_enabled,
  c.relforcerowsecurity      AS rls_forced,
  p.policyname,
  p.cmd,
  p.roles
FROM pg_tables t
JOIN pg_class c
  ON c.relname = t.tablename
 AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname
 AND p.tablename  = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN ('acc_source_batch_issue', 'acc_source_adapter_profile')
ORDER BY t.tablename, p.policyname;

-- Esperado pre-014: 0 filas (tablas no existen aún).
-- Si hay filas → las tablas ya existen → investigar antes de ejecutar 014.


-- =============================================================================
-- BLOQUE 10: Confirmar si 014 transforma estados ANTES del DROP CONSTRAINT
-- Este bloque responde la pregunta conceptual sobre la estrategia de 014.
-- Es un análisis estático documentado, no una query ejecutable.
-- =============================================================================

SELECT '014 STRATEGY CHECK' AS check_type,
       'UPDATE filas legacy → DROP old CHECK → ADD new CHECK' AS strategy,
       'Líneas 32-35 UPDATEs, luego línea 38-39 DROP, luego línea 42-56 ADD' AS detail,
       'CORRECTO: datos migrados antes de cambiar constraint' AS verdict;


-- =============================================================================
-- BLOQUE 11: Confirmar existencia de tablas prerequisito que 014 referencia
-- Objetivo: FK de 014 → core_entities y acc_chart_mapping deben existir.
-- =============================================================================

SELECT
  tablename,
  'EXISTE' AS estado
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'core_entities',
    'acc_source_batch',
    'acc_account_balance',
    'acc_chart_mapping',
    'acc_period'
  )
ORDER BY tablename;

-- Esperado: 5 filas con 'EXISTE'.
-- Si falta alguna → 014 fallará en FK constraint.


-- =============================================================================
-- BLOQUE 12: Verificar entity ALF existe (requerida para seed de 014)
-- =============================================================================

SELECT
  id,
  code,
  name
FROM core_entities
WHERE code = 'ALF';

-- Esperado: 1 fila con code='ALF'.
-- Si 0 filas → el seed de 014 hace INSERT...SELECT...WHERE code='ALF'
--              y no insertará nada (sin error, pero seed vacío).
--              Esto fallaría TEST-505 en 015.


-- =============================================================================
-- BLOQUE 13: Verificar triggers existentes en acc_source_batch
-- Para confirmar que 014 no crea triggers duplicados.
-- =============================================================================

SELECT
  tgname          AS trigger_name,
  tgrelid::regclass AS tabla,
  CASE tgtype & 66
    WHEN 2  THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE        'AFTER'
  END             AS timing,
  CASE tgtype & 28
    WHEN 4  THEN 'INSERT'
    WHEN 8  THEN 'DELETE'
    WHEN 16 THEN 'UPDATE'
    WHEN 20 THEN 'INSERT OR UPDATE'
    WHEN 12 THEN 'INSERT OR DELETE'
    WHEN 24 THEN 'UPDATE OR DELETE'
    WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
    ELSE        'OTHER'
  END             AS events,
  tgenabled       AS enabled
FROM pg_trigger
WHERE tgrelid IN (
  'public.acc_source_batch'::regclass,
  'public.acc_source_batch_issue'::regclass
)
ORDER BY tgrelid::regclass, tgname;

-- Si aparece trg_acc_source_batch_lifecycle → 014 intenta CREATE TRIGGER (sin IF NOT EXISTS)
-- → fallará con error de duplicado. Investigar si 014 fue parcialmente ejecutado antes.


-- =============================================================================
-- BLOQUE 14: Verificar funciones existentes que 014 crea con CREATE OR REPLACE
-- CREATE OR REPLACE es seguro (reemplaza si existe). Solo informativo.
-- =============================================================================

SELECT
  proname         AS function_name,
  pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN (
  'fn_acc_source_batch_lifecycle',
  'fn_acc_source_batch_fatal_gate',
  'fn_acc_source_batch_issue_immutable',
  'fn_acc_mapping_completeness'
)
ORDER BY proname;

-- Esperado pre-014: 0 filas.
-- Si ya existen → CREATE OR REPLACE las actualizará. No falla.


-- =============================================================================
-- BLOQUE 15: Resumen de riesgo para acc_source_batch — tabla existente con datos
-- =============================================================================

SELECT
  (SELECT COUNT(*) FROM acc_source_batch)                              AS total_filas,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status NOT IN
    ('pending','processing','completed','failed','rejected'))          AS filas_status_no_legacy,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status IN
    ('pending','processing','completed','failed','rejected'))          AS filas_status_legacy,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status = 'pending')    AS pending,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status = 'processing') AS processing,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status = 'completed')  AS completed,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status = 'failed')     AS failed,
  (SELECT COUNT(*) FROM acc_source_batch WHERE status = 'rejected')   AS rejected;

-- Si filas_status_legacy = 0 → PASS (sin riesgo de migración de datos).
-- Si filas_status_legacy > 0 → verificar bloque 3 y 4 antes de ejecutar 014.


-- =============================================================================
-- FIN DEL PREFLIGHT
-- =============================================================================
-- Después de ejecutar, evaluar:
--   PASS si:
--     - Bloque 3: 0 filas legacy O Bloque 4 muestra mapping correcto
--     - Bloque 5: columnas nuevas de 014 NO existen aún
--     - Bloque 6: nombre del CHECK coincide con ck_acc_source_batch_status
--     - Bloque 9: 0 filas (tablas nuevas no existen aún)
--     - Bloque 12: ALF existe en core_entities
--     - Bloque 13: triggers de 014 NO existen aún
--     - Bloque 15: filas_status_legacy = 0 (o hay plan para migración)
--
--   STOP si:
--     - Bloque 6: nombre del CHECK difiere de ck_acc_source_batch_status
--     - Bloque 9: tablas nuevas ya existen con schema diferente
--     - Bloque 12: ALF no existe
--     - Bloque 13: triggers ya existen (014 parcialmente ejecutado)
--     - Bloque 15: filas legacy con status inesperado no cubierto
--
-- IMPORTANTE — BUG CONOCIDO EN 014 (ver static review):
--   fn_acc_source_batch_issue_immutable termina con RETURN NEW.
--   Para DELETE triggers, NEW=NULL → RETURN NULL → delete silenciosamente suprimido
--   para batches NO-POSTED. Esto hace que issues en batches pre-POSTED
--   no sean borrables, y que tests 703/704/705/706 fallen en cleanup.
--   FIX REQUERIDO en 014 antes de ejecutar:
--     Cambiar RETURN NEW → RETURN COALESCE(NEW, OLD)
--   en fn_acc_source_batch_issue_immutable.
-- =============================================================================
