-- !! DRAFT — NO EJECUTAR SIN TESTS COMPLETOS Y GO EXPLÍCITO DEL CFO !!
-- =============================================================================
-- SEC-ANF-RLS-FIX-DRAFT.sql
-- OA-024-03 SEC-1 Finding — Fix RLS en tablas ANF
-- Fecha   : 2026-08-13
-- Autor   : Claude Code / Angelo Huerta CFO
-- Estado  : DRAFT — NO EJECUTAR en producción sin:
--           (1) Guardia/proxy activo (incidente 2026-06-18 — proxy fue revertido)
--           (2) Tests completos en branch controlado
--           (3) GO explícito del CFO
-- =============================================================================
-- CONTEXTO:
--   SEC-1 confirmado en OA-024-03: 10 tablas ANF tienen política
--   FOR ALL TO anon USING (true) WITH CHECK (true)
--   RLS habilitado pero completamente permisivo — cualquier cliente con anon key
--   puede leer, escribir y eliminar datos financieros de anf_*.
--
-- RESTRICCIÓN CRÍTICA:
--   La app actualmente usa anon key (sin JWT auth). Si se restringe escritura
--   a anon, la app deja de poder cargar informes (INSERT en anf_informes,
--   anf_saldos_esf, etc.). El fix completo requiere que el guardia/proxy
--   esté activo primero (memoria: seguridad-guardia-proxy.md).
--
-- ESTRATEGIA EN 2 FASES:
--   Fase 1 (este draft): Eliminar DELETE para anon en todas las tablas
--                        (cambio más seguro — no rompe flujos de carga)
--   Fase 2 (futuro):     Con guardia activo, migrar a authenticated para
--                        INSERT/UPDATE y restringir anon solo a SELECT o nada
--
-- TABLAS CUBIERTAS (10):
--   1. anf_filiales           — maestro de filiales (bajo riesgo — solo READ para UI)
--   2. anf_informes           — cabeceras de informes
--   3. anf_saldos_esf         — saldos del Balance (sensible)
--   4. anf_movimientos_er     — movimientos del P&L (sensible)
--   5. anf_libro_mayor        — libro mayor detallado (muy sensible)
--   6. anf_justificaciones    — narrativas de análisis (muy sensible)
--   7. anf_metricas_config    — configuración de KPIs
--   8. anf_kpis_operacionales — KPIs operacionales (sensible)
--   9. anf_kpis_derivados     — KPIs calculados (sensible)
--  10. anf_tipos_cambio       — tipos de cambio ANF (menos sensible)
-- =============================================================================

-- =============================================================================
-- BLOQUE 0: VERIFICACIÓN PREVIA (ejecutar como SELECT antes del fix)
-- =============================================================================

/*
-- Verificar estado actual de políticas antes de modificar:
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename LIKE 'anf_%'
ORDER BY tablename, policyname;

-- Resultado esperado actual (SEC-1 confirmado):
-- Todas las tablas: cmd=ALL, roles={anon}, qual=(true), with_check=(true)
*/

-- =============================================================================
-- BLOQUE 1: anf_filiales — Maestro de filiales
-- Riesgo: BAJO. La UI necesita leer la lista de filiales.
-- Fase 1: DROP ALL, crear SELECT para anon, ALL para authenticated (sin anon write)
-- Nota: si la app usa anon para cargar filiales → mantener INSERT temporalmente
-- =============================================================================

-- Eliminar política permisiva existente
DROP POLICY IF EXISTS "anon_anf_filiales_all" ON anf_filiales;

-- Fase 1: anon puede leer (necesario para UI con anon key)
CREATE POLICY "anf_filiales_anon_select" ON anf_filiales
  FOR SELECT TO anon USING (true);

-- INSERT/UPDATE para anon — TEMPORAL hasta que el guardia esté activo
-- REMOVER en Fase 2 cuando la app use authenticated
CREATE POLICY "anf_filiales_anon_insert" ON anf_filiales
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_filiales_anon_update" ON anf_filiales
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- DELETE: bloqueado para anon en Fase 1 (principal mejora de seguridad)
-- (Sin política DELETE → anon no puede eliminar)

-- authenticated puede todo
CREATE POLICY "anf_filiales_auth_all" ON anf_filiales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 2: anf_informes — Cabeceras de informes
-- Riesgo: MEDIO. La app necesita INSERT para cargar informes.
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_informes_all" ON anf_informes;

CREATE POLICY "anf_informes_anon_select" ON anf_informes
  FOR SELECT TO anon USING (true);

-- TEMPORAL — remover en Fase 2
CREATE POLICY "anf_informes_anon_insert" ON anf_informes
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_informes_anon_update" ON anf_informes
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Sin DELETE para anon

CREATE POLICY "anf_informes_auth_all" ON anf_informes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 3: anf_saldos_esf — Saldos del Balance (SENSIBLE)
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_saldos_esf_all" ON anf_saldos_esf;

CREATE POLICY "anf_saldos_esf_anon_select" ON anf_saldos_esf
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_saldos_esf_anon_insert" ON anf_saldos_esf
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_saldos_esf_anon_update" ON anf_saldos_esf
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_saldos_esf_auth_all" ON anf_saldos_esf
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 4: anf_movimientos_er — Movimientos P&L (SENSIBLE)
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_movimientos_er_all" ON anf_movimientos_er;

CREATE POLICY "anf_movimientos_er_anon_select" ON anf_movimientos_er
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_movimientos_er_anon_insert" ON anf_movimientos_er
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_movimientos_er_anon_update" ON anf_movimientos_er
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_movimientos_er_auth_all" ON anf_movimientos_er
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 5: anf_libro_mayor — Libro mayor (MUY SENSIBLE)
-- Contiene asientos contables detallados.
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_libro_mayor_all" ON anf_libro_mayor;

CREATE POLICY "anf_libro_mayor_anon_select" ON anf_libro_mayor
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_libro_mayor_anon_insert" ON anf_libro_mayor
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_libro_mayor_anon_update" ON anf_libro_mayor
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_libro_mayor_auth_all" ON anf_libro_mayor
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 6: anf_justificaciones — Narrativas de análisis (MUY SENSIBLE)
-- Contiene texto de análisis financiero — no debería ser accesible por anon.
-- En Fase 1 mantener anon_select por compatibilidad; evaluar restricción total en Fase 2.
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_justificaciones_all" ON anf_justificaciones;

-- DECISIÓN CFO REQUERIDA: ¿Se permite a anon leer justificaciones?
-- Si sí → mantener anon_select. Si no → omitir esta política.
-- Por defecto en Fase 1: mantener SELECT (compatible con UI actual).
CREATE POLICY "anf_justificaciones_anon_select" ON anf_justificaciones
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_justificaciones_anon_insert" ON anf_justificaciones
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_justificaciones_anon_update" ON anf_justificaciones
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Sin DELETE para anon

CREATE POLICY "anf_justificaciones_auth_all" ON anf_justificaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 7: anf_metricas_config — Configuración de KPIs
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_metricas_config_all" ON anf_metricas_config;

CREATE POLICY "anf_metricas_config_anon_select" ON anf_metricas_config
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_metricas_config_anon_insert" ON anf_metricas_config
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_metricas_config_anon_update" ON anf_metricas_config
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_metricas_config_auth_all" ON anf_metricas_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 8: anf_kpis_operacionales — KPIs operacionales (SENSIBLE)
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_kpis_operacionales_all" ON anf_kpis_operacionales;

CREATE POLICY "anf_kpis_operacionales_anon_select" ON anf_kpis_operacionales
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_kpis_operacionales_anon_insert" ON anf_kpis_operacionales
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_kpis_operacionales_anon_update" ON anf_kpis_operacionales
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_kpis_operacionales_auth_all" ON anf_kpis_operacionales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 9: anf_kpis_derivados — KPIs calculados (SENSIBLE)
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_kpis_derivados_all" ON anf_kpis_derivados;

CREATE POLICY "anf_kpis_derivados_anon_select" ON anf_kpis_derivados
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_kpis_derivados_anon_insert" ON anf_kpis_derivados
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_kpis_derivados_anon_update" ON anf_kpis_derivados
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_kpis_derivados_auth_all" ON anf_kpis_derivados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- BLOQUE 10: anf_tipos_cambio — Tipos de cambio ANF
-- Riesgo: BAJO. Datos de TC usados para cálculos de display.
-- =============================================================================

DROP POLICY IF EXISTS "anon_anf_tipos_cambio_all" ON anf_tipos_cambio;

CREATE POLICY "anf_tipos_cambio_anon_select" ON anf_tipos_cambio
  FOR SELECT TO anon USING (true);

CREATE POLICY "anf_tipos_cambio_anon_insert" ON anf_tipos_cambio
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anf_tipos_cambio_anon_update" ON anf_tipos_cambio
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anf_tipos_cambio_auth_all" ON anf_tipos_cambio
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- VERIFICACIÓN POST-DEPLOY (ejecutar como SELECT para confirmar aplicación)
-- =============================================================================

/*
-- Test 1: Verificar que no existen políticas ALL para anon
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename LIKE 'anf_%'
  AND 'anon' = ANY(roles)
  AND cmd = 'ALL';
-- Resultado esperado: 0 filas

-- Test 2: Verificar que existe SELECT para anon en anf_filiales
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'anf_filiales'
  AND 'anon' = ANY(roles)
  AND cmd = 'SELECT';
-- Resultado esperado: 1 fila (anf_filiales_anon_select)

-- Test 3: Verificar que no existe DELETE para anon en ninguna tabla
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename LIKE 'anf_%'
  AND 'anon' = ANY(roles)
  AND cmd = 'DELETE';
-- Resultado esperado: 0 filas

-- Test 4: Verificar que authenticated tiene acceso completo en anf_filiales
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'anf_filiales'
  AND 'authenticated' = ANY(roles)
  AND cmd = 'ALL';
-- Resultado esperado: 1 fila (anf_filiales_auth_all)

-- Test 5: Contar total de políticas ANF post-deploy
SELECT COUNT(*) FROM pg_policies WHERE tablename LIKE 'anf_%';
-- Resultado esperado: 40 filas (10 tablas × 4 políticas = 40)
-- Distribución: anon_select + anon_insert + anon_update + auth_all por tabla
-- Nota: anf_filiales puede tener solo auth_all en Fase 2

-- Test 6: Verificar que app puede hacer SELECT (simular como anon)
-- Ejecutar en cliente con anon key:
-- SELECT id, codigo FROM anf_filiales LIMIT 1;
-- Resultado esperado: 1 fila (no error de RLS)

-- Test 7: Verificar que app puede hacer INSERT (simular como anon)
-- En ambiente de test, no producción:
-- INSERT INTO anf_filiales (codigo, nombre, moneda) VALUES ('TEST', 'Test', 'USD');
-- Resultado esperado: INSERT exitoso (compatible con carga actual)

-- Test 8: Verificar que anon NO puede hacer DELETE
-- En ambiente de test, no producción:
-- DELETE FROM anf_filiales WHERE codigo = 'TEST';
-- Resultado esperado: ERROR - new row violates row-level security policy
-- (O: 0 rows deleted si la política no aplica — verificar con EXPLAIN)
*/

-- =============================================================================
-- FASE 2 — PLAN POST-GUARDIA (NO EJECUTAR AÚN)
-- =============================================================================

/*
Cuando el guardia/proxy esté activo y la app use JWT auth (authenticated role):

1. REMOVER todas las políticas anon_insert y anon_update de las 10 tablas
2. anf_filiales: solo SELECT para anon (lista de empresas en login screen)
3. Todas las demás tablas: sin acceso anon en ningún cmd
4. Agregar filtro por filial_id para authenticated:
   USING (filial_id IN (SELECT filial_id FROM user_filial_access WHERE user_id = auth.uid()))
5. anf_justificaciones: considerar acceso solo para rol 'cfos' o similar

Script Fase 2 (placeholder):
  DROP POLICY IF EXISTS "anf_*_anon_insert" ON anf_*;
  DROP POLICY IF EXISTS "anf_*_anon_update" ON anf_*;
  ALTER POLICY "anf_*_auth_all" → filtrar por filial_id
*/

-- =============================================================================
-- END — SEC-ANF-RLS-FIX-DRAFT.sql
-- NO EJECUTAR SIN GO EXPLÍCITO DEL CFO + TESTS COMPLETOS
-- Referencia: OA-024-03 SEC-1 / OA-024-04
-- =============================================================================
