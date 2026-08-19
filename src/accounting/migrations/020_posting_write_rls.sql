-- =============================================================================
-- 020_posting_write_rls.sql  (REWRITE — v2, 2026-08-19)
-- OA-024-09 — Write RLS para acc_source_batch ÚNICAMENTE
-- Autor   : OA-024 PostingPipeline
-- Estado  : EJECUTAR DESPUÉS de 016 (OA-024-08 infra) y 019 (period seed)
-- =============================================================================
--
-- SCOPE — QUÉ HACE ESTE ARCHIVO:
--   Agrega políticas INSERT y UPDATE para 'authenticated' en acc_source_batch.
--   Esto permite que el frontend (PostingPipeline.js) cree batches y
--   transite status hasta APPROVED.  Las transiciones APPROVED→POSTING→POSTED
--   son ejecutadas EXCLUSIVAMENTE por fn_acc_post_batch (022), no por la UI.
--
-- SCOPE — QUÉ NO HACE ESTE ARCHIVO (INTENCIONAL):
--   * NO toca acc_account_balance.  El ledger solo se escribe desde
--     fn_acc_post_batch, que es SECURITY DEFINER.  authenticated no tiene
--     INSERT ni UPDATE sobre esa tabla.  Esto es by-design y DEBE mantenerse.
--   * NO toca acc_source_batch_issue (ya tiene ALL desde 014).
--   * NO toca acc_source_balance_detail (ya tiene ALL desde 016).
--   * NO debilita los deny anon (permanecen fail-closed).
--
-- MODELO DE SEGURIDAD (V1, piloto ALF):
--   ┌───────────────────────────────┬────────────────────────────┐
--   │ Operación                     │ Quién la hace              │
--   ├───────────────────────────────┼────────────────────────────┤
--   │ Crear batch (PENDING)         │ authenticated (UI)         │
--   │ Upload balance_detail         │ authenticated (UI)         │
--   │ Marcar VALIDATED / APPROVED   │ authenticated (UI)         │
--   │ Escribir acc_account_balance  │ fn_acc_post_batch (RPC)    │
--   │ Transicionar POSTING → POSTED │ fn_acc_post_batch (RPC)    │
--   └───────────────────────────────┴────────────────────────────┘
--
-- BRECHA V1 (documentada, aceptada, revisión post-piloto):
--   Las políticas INSERT/UPDATE sobre acc_source_batch usan WITH CHECK (true) /
--   USING (true), lo que significa que un usuario authenticated podría en
--   principio crear batches de CUALQUIER entity_id, no solo de su entidad.
--   Para el piloto ALF (entidad única, usuarios de confianza) esto es aceptable.
--   Post-piloto → granularizar con columna user_id o claim JWT entity_id
--   (DT-007-01 en backlog de arquitectura).
--
-- IDEMPOTENCIA:
--   Usa DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL END $$
--   para que el bloque sea seguro de re-ejecutar sin error.
-- =============================================================================


-- ============================================================
-- PARTE 1: acc_source_batch — INSERT para authenticated
-- ============================================================
-- Permite que la UI cree nuevos batches (status inicial = 'PENDING').
-- El lifecycle trigger (trg_acc_source_batch_lifecycle) valida que la
-- transición de status sea válida; esta política no necesita restringirlo.

DO $$
BEGIN
  CREATE POLICY "asb_authenticated_insert"
    ON acc_source_batch
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
  RAISE NOTICE 'Policy asb_authenticated_insert creada.';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy asb_authenticated_insert ya existe — omitiendo.';
END;
$$;


-- ============================================================
-- PARTE 2: acc_source_batch — UPDATE para authenticated
-- ============================================================
-- Permite que la UI transite el status del batch:
--   CREATED → PARSING → PARSED → VALIDATING → VALIDATED → PENDING_APPROVAL → APPROVED
-- Las transiciones APPROVED → POSTING → POSTED son ejecutadas por
-- fn_acc_post_batch (SECURITY DEFINER) — la UI no llega hasta ahí.
-- El lifecycle trigger es la única guardia de transiciones válidas.

DO $$
BEGIN
  CREATE POLICY "asb_authenticated_update"
    ON acc_source_batch
    FOR UPDATE
    TO authenticated
    USING   (true)
    WITH CHECK (true);
  RAISE NOTICE 'Policy asb_authenticated_update creada.';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy asb_authenticated_update ya existe — omitiendo.';
END;
$$;


-- ============================================================
-- PARTE 3: acc_account_balance — SIN CAMBIOS (intencionalmente)
-- ============================================================
-- Esta tabla NO recibe políticas INSERT ni UPDATE para authenticated.
-- El único camino de escritura es fn_acc_post_batch (SECURITY DEFINER),
-- definido en 022_fn_acc_post_batch.sql.
-- Si en el futuro se agrega una política aquí, debe ser deliberada y
-- documentada en el CLAUDE.md del proyecto.
-- (No se agrega nada — este bloque es solo comentario de decisión arquitectónica.)


-- ============================================================
-- PARTE 4: Verificaciones READ-ONLY post-deploy
-- ============================================================
-- Ejecutar estas queries en Supabase SQL Editor para confirmar el estado.

-- V1: Confirmar políticas en acc_source_batch
--     Esperado: aparecen asb_authenticated_insert y asb_authenticated_update
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

-- V2: Confirmar que acc_account_balance NO tiene INSERT ni UPDATE para authenticated
--     Esperado: cero filas con roles @> ARRAY['authenticated'] y cmd IN ('INSERT','UPDATE')
--     (Solo debe haber SELECT para authenticated, más los deny de anon)
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_account_balance'
ORDER BY cmd, policyname;
-- Revisar manualmente: NO debe aparecer ninguna policy con
-- roles conteniendo 'authenticated' y cmd = 'INSERT' o 'UPDATE'.

-- V3: Confirmar EXECUTE grant en fn_acc_post_batch para authenticated
--     Esperado: al menos una fila con grantee = 'authenticated'
--     (Creado en 022_fn_acc_post_batch.sql)
SELECT
  grantee,
  routine_name,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name   = 'fn_acc_post_batch'
ORDER BY grantee;

-- V4: Confirmar que anon sigue denegado (fail-closed intacto)
SELECT
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('acc_source_batch', 'acc_account_balance')
  AND qual = 'false'
ORDER BY tablename, policyname;
-- Esperado: ≥ 1 fila por tabla (deny anon de 009 intacto)
