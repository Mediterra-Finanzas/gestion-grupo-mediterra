-- =============================================================================
-- 020_posting_write_rls.sql  (REWRITE — v3, 2026-08-20)
-- OA-024-09 — Write RLS para acc_source_batch — PILOT ALF SCOPE
-- Decisión CFO: 2026-08-20 — OPCIÓN B (entity_id hardcodeado ALF para piloto)
-- =============================================================================
--
-- SCOPE — QUÉ HACE ESTE ARCHIVO:
--   Agrega políticas INSERT y UPDATE para 'authenticated' en acc_source_batch,
--   RESTRINGIDAS al UUID de Allegria Foods (piloto ALF solamente).
--   Permite que PostingPipeline.js cree batches y transite status hasta APPROVED
--   para la entidad ALF únicamente.
--   Las transiciones APPROVED→POSTING→POSTED son ejecutadas EXCLUSIVAMENTE
--   por fn_acc_post_batch (022, SECURITY DEFINER) — no por la UI.
--
-- SCOPE — QUÉ NO HACE ESTE ARCHIVO (INTENCIONAL):
--   * NO toca acc_account_balance (ledger solo accesible vía fn_acc_post_batch).
--   * NO permite batches de otras entidades — cross-company write bloqueado.
--   * NO toca acc_source_batch_issue (ALL desde 014).
--   * NO toca acc_source_balance_detail (ALL desde 016).
--   * NO elimina ni debilita RLS existente de 009 (anon fail-closed intacto).
--   * NO agrega SELECT ni otras operaciones — solo INSERT + UPDATE.
--
-- PILOT ENTITY SCOPE (TEMPORAL — SEC-ENTITY-SCOPE-001):
--   UUID hardcodeado: Allegria Foods = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
--   Fuente autoritativa: 018_alf_accounting_profile.sql + 019 PRODUCTION PASS.
--
--   CRITERIO DE RETIRO OBLIGATORIO:
--   NO SECOND ENTITY ONBOARDING mientras SEC-ENTITY-SCOPE-001 siga abierto.
--   Ver: docs/accounting/sec-entity-scope-001.md
--
-- MODELO DE SEGURIDAD V2 (piloto ALF):
--   ┌─────────────────────────────────┬─────────────────────────────┐
--   │ Operación                       │ Actor / Resultado           │
--   ├─────────────────────────────────┼─────────────────────────────┤
--   │ INSERT batch (entity = ALF)     │ authenticated ✓ PERMITIDO   │
--   │ INSERT batch (entity ≠ ALF)     │ authenticated ✗ BLOQUEADO   │
--   │ UPDATE batch ALF (lifecycle)    │ authenticated ✓ PERMITIDO   │
--   │ UPDATE batch (entity ≠ ALF)     │ authenticated ✗ BLOQUEADO   │
--   │ Cambiar entity_id ALF → otra    │ authenticated ✗ BLOQUEADO   │
--   │ INSERT acc_account_balance      │ authenticated ✗ BLOQUEADO   │
--   │ POSTING / POSTED transitions    │ fn_acc_post_batch RPC ONLY  │
--   │ Cualquier operación             │ anon ✗ fail-closed (009)    │
--   │ Admin / migrations              │ service_role ✓ ALL (009)    │
--   └─────────────────────────────────┴─────────────────────────────┘
--
-- IDEMPOTENCIA:
--   DROP POLICY IF EXISTS + CREATE POLICY.
--   Seguro de re-ejecutar: si políticas ya existían con expresiones anteriores
--   (ej. WITH CHECK (true) de v2), se reemplazan por la expresión ALF-scoped.
-- =============================================================================


-- ─── Audit trail ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '020 v3 — OA-024-09 — PILOT ALF SCOPE — 2026-08-20';
  RAISE NOTICE 'ALF entity_id = 3df93d9d-cbc6-446f-b9a5-0a3840692fd8';
  RAISE NOTICE 'SEC-ENTITY-SCOPE-001 OPEN: no second entity onboarding while this file is in force.';
END;
$$;


-- ============================================================
-- PARTE 1: acc_source_batch — INSERT para authenticated (ALF only)
-- ============================================================
-- Permite crear batches solo para Allegria Foods.
-- WITH CHECK (entity_id = ALF_UUID):
--   - Rechaza INSERT con cualquier otro entity_id.
--   - authenticated no puede crear batches de Frisku, Osiris, ni otra empresa.
-- El lifecycle trigger (trg_acc_source_batch_lifecycle, 014) sigue siendo
-- la única guardia de transiciones de status válidas.

-- TRANSACCIÓN ATÓMICA: si CREATE POLICY UPDATE falla, DROP INSERT se revierte.
-- Sin esto: podría quedar asb_authenticated_insert eliminada y su reemplazo sin crear.
BEGIN;

DROP POLICY IF EXISTS "asb_authenticated_insert" ON acc_source_batch;

CREATE POLICY "asb_authenticated_insert"
  ON  acc_source_batch
  FOR INSERT
  TO  authenticated
  WITH CHECK (entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid);


-- ============================================================
-- PARTE 2: acc_source_batch — UPDATE para authenticated (ALF only)
-- ============================================================
-- Permite transicionar batches de ALF a través del lifecycle.
-- USING (entity_id = ALF_UUID):
--   Restringe qué filas son actualizables — solo batches de Allegria Foods.
--   Nota: SELECT sigue usando rls_acc_source_batch_auth_select de 009 (USING(true)),
--   por lo que authenticated puede LEER batches de cualquier entidad.
--   La invisibilidad de UPDATE no implica invisibilidad en SELECT.
--   Brecha de scope registrada en SEC-ENTITY-SCOPE-001.
-- WITH CHECK (entity_id = ALF_UUID):
--   El entity_id no puede cambiarse a otro valor durante el UPDATE.
--   Bloquea intentos de: UPDATE SET entity_id = 'otra-empresa-uuid' WHERE ...

DROP POLICY IF EXISTS "asb_authenticated_update" ON acc_source_batch;

CREATE POLICY "asb_authenticated_update"
  ON  acc_source_batch
  FOR UPDATE
  TO  authenticated
  USING      (entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid)
  WITH CHECK (entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid);

COMMIT;


-- ============================================================
-- PARTE 3: acc_account_balance — SIN CAMBIOS (decisión arquitectónica)
-- ============================================================
-- authenticated NO tiene INSERT ni UPDATE en esta tabla.
-- Única ruta de escritura al ledger: fn_acc_post_batch (SECURITY DEFINER, 022).
-- Cualquier política INSERT/UPDATE aquí para authenticated viola el modelo C.


-- ============================================================
-- PARTE 4: Verificaciones READ-ONLY post-deploy
-- ============================================================

-- V1: Confirmar ambas políticas con UUID ALF en with_check (y qual para UPDATE)
--     Esperado: 2 filas con UUID 3df93d9d en with_check_expr
SELECT
  policyname,
  cmd,
  roles,
  qual       AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
  AND policyname IN ('asb_authenticated_insert', 'asb_authenticated_update')
ORDER BY policyname;

-- V2: Confirmar que acc_account_balance no tiene INSERT/UPDATE para authenticated
--     Esperado: 0 filas
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_account_balance'
  AND cmd        IN ('INSERT', 'UPDATE', 'ALL')
  AND 'authenticated' = ANY(roles)
ORDER BY policyname;

-- V3: Confirmar service_role sigue con ALL en acc_source_batch (de 009, intacto)
--     Esperado: ≥1 fila
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
  AND 'service_role' = ANY(roles)
  AND cmd = 'ALL'
ORDER BY policyname;

-- V4: Confirmar SELECT de authenticated sigue activo (de 009, no afectado)
--     Esperado: ≥1 fila
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
  AND 'authenticated' = ANY(roles)
  AND cmd = 'SELECT'
ORDER BY policyname;
