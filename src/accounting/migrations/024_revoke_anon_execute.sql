-- =============================================================================
-- 024_revoke_anon_execute.sql
-- OA-024-10 — Defense-in-depth: revocar EXECUTE de `anon` en las RPC de posting/approval.
-- Fecha  : 2026-08-20
-- Estado : EJECUTAR DESPUÉS de 022 + 023
-- =============================================================================
-- Root cause: Supabase define `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ...
-- TO anon` → toda función nueva recibe EXECUTE para `anon` automáticamente. El `REVOKE ... FROM
-- PUBLIC` de 022/023 (correcto y ya aplicado) NO quita ese grant explícito de `anon`.
-- Runtime ya es fail-closed por el guard P000A (auth.uid() NULL → RAISE), pero el nivel de grant
-- también debe negar `anon` (tests 021: CAT-17/1704, CAT-19/1911, CAT-20/2006).
--
-- NO se modifica 020/022/023. NO se toca `authenticated` (mantiene EXECUTE — modelo C).
-- Idempotente: REVOKE de un privilegio ausente es NO-OP.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_acc_post_batch(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_acc_approve_batch(uuid) FROM anon;

-- Cinturón + tirantes: reafirmar el REVOKE de PUBLIC (idempotente; ya aplicado por 022/023).
REVOKE EXECUTE ON FUNCTION public.fn_acc_post_batch(uuid)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_acc_approve_batch(uuid) FROM PUBLIC;

-- Verificación POST (read-only): abortar si `anon` conserva EXECUTE en alguna de las dos.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('fn_acc_post_batch','fn_acc_approve_batch')
    AND grantee = 'anon'
    AND privilege_type = 'EXECUTE';
  IF n <> 0 THEN
    RAISE EXCEPTION '024: anon aún tiene EXECUTE en % función(es) de posting/approval. Revisar.', n;
  END IF;
  RAISE NOTICE '024 OK: anon sin EXECUTE en fn_acc_post_batch ni fn_acc_approve_batch.';
END $$;
