-- =============================================================================
-- 020_preflight_readonly.sql
-- OA-024-09 — Preflight READ-ONLY antes de ejecutar 020_posting_write_rls.sql
-- NO escribe nada. Ejecutar como postgres en SQL Editor Supabase.
-- =============================================================================

-- P1: ¿Existen ya las políticas de 020?
--     Esperado: 0 filas (020 no ejecutado) o 2 filas (ya ejecutado — idempotente)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
  AND policyname IN ('asb_authenticated_insert', 'asb_authenticated_update')
ORDER BY policyname;

-- P2: Estado actual COMPLETO de RLS en acc_source_batch
--     Baseline para confirmar qué existía ANTES de 020
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
ORDER BY policyname;

-- P3: Estado actual de RLS en acc_account_balance
--     NO debe tener INSERT/UPDATE para authenticated — confirmar baseline
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_account_balance'
ORDER BY cmd, policyname;

-- P4: ¿Existe fn_acc_post_batch ya?
--     Esperado: 0 filas (022 no ejecutado todavía)
SELECT routine_name, security_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'fn_acc_post_batch';

-- P5: Confirmar lifecycle trigger activo en acc_source_batch (014 desplegado)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table  = 'acc_source_batch'
ORDER BY trigger_name;

-- P6: Confirmar status CHECK de acc_source_batch (debe ser lifecycle nuevo de 014)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'acc_source_batch'::regclass
  AND contype  = 'c'
ORDER BY conname;

-- P7: Confirmar anon deny intacto en ambas tablas (de 009)
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('acc_source_batch', 'acc_account_balance')
  AND qual = 'false'
ORDER BY tablename, policyname;
