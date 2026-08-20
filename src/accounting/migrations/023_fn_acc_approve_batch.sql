-- =============================================================================
-- 023_fn_acc_approve_batch.sql
-- OA-024-09 — B17/B18 — Segregación de funciones en aprobación de batch
-- Decisión CFO: 2026-08-20 — OPCIÓN A (SoD light via SECURITY DEFINER RPC)
-- =============================================================================
--
-- SCOPE — QUÉ HACE ESTE ARCHIVO:
--
--   PARTE 1: fn_acc_approve_batch(UUID) — SECURITY DEFINER
--     Aprueba un batch contable con SoD light: el usuario autenticado que llama
--     el RPC NO puede ser el mismo que importó el batch (imported_by ≠ auth.uid()).
--     approved_by = auth.uid()::TEXT (server-side, nunca desde el frontend).
--     Realiza UPDATE acc_source_batch SET status='APPROVED' solo si todos los
--     guards pasan. Es la ÚNICA ruta autorizada para este cambio de status.
--
--   PARTE 2: asb_authenticated_update — refuerzo de política RLS (B17)
--     Recrea la policy de UPDATE para authenticated (de 020) añadiendo:
--       WITH CHECK (... AND status <> 'APPROVED')
--     Bloquea que authenticated escriba status='APPROVED' directamente.
--     fn_acc_approve_batch (SECURITY DEFINER, corre como postgres) bypasea RLS
--     y puede setear 'APPROVED' legítimamente.
--
-- SCOPE — QUÉ NO HACE ESTE ARCHIVO (INTENCIONAL):
--   * NO modifica fn_acc_post_batch (022 queda intacto).
--   * NO modifica la tabla acc_source_batch ni su schema.
--   * NO implementa core_user_entity_access (SEC-ENTITY-SCOPE-001 sigue OPEN).
--   * NO hardcodea UUIDs personales de usuarios.
--   * NO acepta approved_by ni actor desde el frontend.
--
-- GUARDS DE fn_acc_approve_batch:
--   P000A  auth.uid() IS NULL → RAISE (nunca un actor anónimo)
--   P0000  entity_id ≠ ALF UUID → RAISE (pilot scope)
--   P0001  batch no existe → RAISE
--   P0002  status ≠ PENDING_APPROVAL → RAISE
--   P0003  issues FATAL no resueltos → RAISE
--   P0004  imported_by IS NULL → RAISE (prerequisito SoD)
--   P0005  auth.uid()::TEXT = imported_by → RAISE (SoD light)
--
-- MODELO DE SEGURIDAD V3 (post-023):
--   ┌──────────────────────────────────────┬───────────────────────────────┐
--   │ Operación                            │ Actor / Resultado             │
--   ├──────────────────────────────────────┼───────────────────────────────┤
--   │ INSERT batch (entity = ALF)          │ authenticated ✓ PERMITIDO     │
--   │ INSERT batch (entity ≠ ALF)          │ authenticated ✗ BLOQUEADO     │
--   │ UPDATE batch ALF (lifecycle ≠ APROB) │ authenticated ✓ PERMITIDO     │
--   │ UPDATE batch SET status='APPROVED'   │ authenticated ✗ BLOQUEADO RLS │
--   │ APPROVED vía fn_acc_approve_batch    │ RPC SECURITY DEFINER ✓        │
--   │ APPROVED: importer = approver        │ fn_acc_approve_batch ✗ SoD    │
--   │ POSTING / POSTED transitions         │ fn_acc_post_batch RPC ONLY    │
--   │ Cualquier operación                  │ anon ✗ fail-closed (009)      │
--   │ Admin / migrations                   │ service_role ✓ ALL (009)      │
--   └──────────────────────────────────────┴───────────────────────────────┘
--
-- PILOT ENTITY SCOPE (TEMPORAL — SEC-ENTITY-SCOPE-001):
--   UUID hardcodeado: Allegria Foods = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
--   Criterio de retiro: NO SECOND ENTITY ONBOARDING mientras SEC-ENTITY-SCOPE-001 esté OPEN.
--
-- IDEMPOTENCIA:
--   CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS + CREATE POLICY.
--   Seguro de re-ejecutar.
-- =============================================================================


-- ─── Audit trail ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '023 — OA-024-09 — B17/B18 — fn_acc_approve_batch + RLS block APPROVED — 2026-08-20';
  RAISE NOTICE 'ALF entity_id = 3df93d9d-cbc6-446f-b9a5-0a3840692fd8';
  RAISE NOTICE 'SEC-ENTITY-SCOPE-001 OPEN: SoD light activo; no hardcode UUID personal.';
END;
$$;


-- ============================================================
-- PARTE 1: fn_acc_approve_batch(UUID) — SECURITY DEFINER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_acc_approve_batch(p_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_actor TEXT;
  v_batch RECORD;
BEGIN

  -- P000A: auth.uid() obligatorio — nunca anónimo
  -- SEC-MODEL-C-001: SECURITY DEFINER es la única ruta para status='APPROVED'.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'P000A: auth.uid() IS NULL — sesión no autenticada. '
      'fn_acc_approve_batch requiere JWT válido con rol authenticated.'
      USING ERRCODE = 'P0001';
  END IF;
  v_actor := auth.uid()::TEXT;

  -- P0001: batch existe — lock exclusivo para atomicidad
  SELECT * INTO v_batch
  FROM acc_source_batch
  WHERE id = p_batch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P0001: batch % no existe en acc_source_batch.', p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- P0000: entity scope — piloto ALF únicamente (SEC-ENTITY-SCOPE-001)
  -- Hardcode temporal autorizado solo server-side; NO mover a JS ni adapters.
  IF v_batch.entity_id <> '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid THEN
    RAISE EXCEPTION 'P0000: PILOT_SCOPE — fn_acc_approve_batch restringida a ALF (%). '
      'Entidad % rechazada.',
      '3df93d9d-cbc6-446f-b9a5-0a3840692fd8', v_batch.entity_id
      USING ERRCODE = 'P0001';
  END IF;

  -- P0002: status debe ser PENDING_APPROVAL
  IF v_batch.status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'P0002: batch % requiere status PENDING_APPROVAL para aprobación '
      '(status actual: %).',
      p_batch_id, v_batch.status
      USING ERRCODE = 'P0001';
  END IF;

  -- P0003: sin issues FATAL no resueltos
  IF EXISTS (
    SELECT 1 FROM acc_source_batch_issue
    WHERE batch_id = p_batch_id
      AND severity  = 'FATAL'
      AND status NOT IN ('RESOLVED', 'IGNORED')
  ) THEN
    RAISE EXCEPTION 'P0003: batch % tiene issues FATAL no resueltos. '
      'Resolver o ignorar explícitamente antes de aprobar.',
      p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- P0004: imported_by debe existir (prerequisito para SoD)
  IF v_batch.imported_by IS NULL THEN
    RAISE EXCEPTION 'P0004: batch % no tiene imported_by. '
      'El batch debe haber sido importado por un usuario autenticado '
      'para poder validar SoD.',
      p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- P0005: SoD light — aprobador ≠ importador
  -- Compara auth.uid()::TEXT vs imported_by (ambos son UUIDs como TEXT desde 023).
  IF v_actor = v_batch.imported_by THEN
    RAISE EXCEPTION 'P0005: SoD violation — el usuario que importó (imported_by=%) '
      'no puede aprobar el mismo batch. Se requiere un aprobador distinto.',
      v_batch.imported_by
      USING ERRCODE = 'P0001';
  END IF;

  -- APROBACIÓN: approved_by = auth.uid()::TEXT server-side
  -- El trigger trg_acc_source_batch_lifecycle (014) valida PENDING_APPROVAL → APPROVED
  -- y requiere approved_by IS NOT NULL — condición satisfecha por v_actor.
  -- RLS asb_authenticated_update (023) bloquea status='APPROVED' para authenticated directo;
  -- este UPDATE corre como postgres (SECURITY DEFINER) y bypasea RLS legítimamente.
  UPDATE acc_source_batch
  SET
    status      = 'APPROVED',
    approved_by = v_actor,
    approved_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'approved',    true,
    'batch_id',    p_batch_id,
    'approved_by', v_actor,
    'approved_at', now(),
    'entity_id',   v_batch.entity_id,
    'period_id',   v_batch.period_id
  );

EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'P0001B: batch % está siendo procesado por otro proceso (NOWAIT lock failed).',
      p_batch_id
      USING ERRCODE = 'P0001';
END;
$$;

-- Permisos: solo authenticated puede llamar este RPC
REVOKE ALL ON FUNCTION fn_acc_approve_batch(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_acc_approve_batch(UUID) TO authenticated;


-- ============================================================
-- PARTE 2: acc_source_batch UPDATE — bloquear status='APPROVED' directo (B17)
-- ============================================================
-- Recrea la policy asb_authenticated_update de 020 añadiendo:
--   AND status <> 'APPROVED'   en WITH CHECK
-- Esto bloquea que authenticated haga directamente:
--   UPDATE acc_source_batch SET status='APPROVED' WHERE ...
-- fn_acc_approve_batch (postgres / SECURITY DEFINER) bypasea RLS → puede setear APPROVED.
-- Otras transiciones del lifecycle (VALIDATING, PARSED, VALIDATED, PENDING_APPROVAL,
-- FAILED, REJECTED) siguen siendo accesibles para authenticated — no están bloqueadas.

-- TRANSACCIÓN ATÓMICA: si CREATE POLICY falla, DROP se revierte.
BEGIN;

DROP POLICY IF EXISTS "asb_authenticated_update" ON acc_source_batch;

CREATE POLICY "asb_authenticated_update"
  ON  acc_source_batch
  FOR UPDATE
  TO  authenticated
  USING      (entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid)
  WITH CHECK (
    entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid
    AND status <> 'APPROVED'
  );

COMMIT;


-- ============================================================
-- PARTE 3: Verificaciones READ-ONLY post-deploy
-- ============================================================

-- V1: fn_acc_approve_batch existe, SECURITY DEFINER, 1 parámetro
--     Esperado: prosecdef=true, pronargs=1
SELECT
  proname,
  pronargs,
  prosecdef,
  array_to_string(proconfig, ',') AS search_path_config
FROM pg_proc
WHERE proname = 'fn_acc_approve_batch';

-- V2: PUBLIC no tiene EXECUTE (REVOKE efectivo)
--     Esperado: 0 filas
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_name LIKE 'fn_acc_approve_batch%'
  AND grantee IN ('PUBLIC', 'anon')
  AND privilege_type = 'EXECUTE';

-- V3: authenticated tiene EXECUTE
--     Esperado: 1 fila
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_name LIKE 'fn_acc_approve_batch%'
  AND grantee = 'authenticated'
  AND privilege_type = 'EXECUTE';

-- V4: asb_authenticated_update tiene AND status <> 'APPROVED' en with_check
--     Esperado: with_check_expr contiene 'APPROVED'
SELECT policyname, cmd, with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
  AND policyname = 'asb_authenticated_update';

-- V5: fn_acc_approve_batch prosrc contiene guards esperados
--     Esperado: todos true
SELECT
  (prosrc LIKE '%auth.uid() IS NULL%')                                AS has_p000a,
  (prosrc LIKE '%3df93d9d%' AND prosrc LIKE '%P0000%')               AS has_p0000,
  (prosrc LIKE '%PENDING_APPROVAL%')                                  AS has_p0002,
  (prosrc LIKE '%P0005%' AND prosrc LIKE '%imported_by%')            AS has_sod_p0005,
  (prosrc LIKE '%auth.uid()::TEXT%' AND prosrc LIKE '%approved_by%') AS has_auth_uid_approved_by,
  (prosrc NOT LIKE '%''system''%')                                    AS no_system_fallback
FROM pg_proc
WHERE proname = 'fn_acc_approve_batch';
