-- =============================================================================
-- 020_posting_write_rls.sql
-- OA-024-09 — Write RLS para acc_source_batch y acc_account_balance
-- Fecha   : 2026-08-19
-- Estado  : EJECUTAR DESPUÉS de 016 (OA-024-08 infra) y 019 (period seed)
-- =============================================================================
-- SCOPE:
--   Agrega políticas INSERT/UPDATE para 'authenticated' en:
--     - acc_source_batch: permite crear batches y transicionar status desde UI
--     - acc_account_balance: permite upsert de saldos canónicos desde UI
--   Esto habilita el PostingPipeline.js desde el frontend (React app).
--
-- SEGURIDAD:
--   - anon sigue DENEGADO para ambas tablas (fail-closed no cambia)
--   - service_role ya tenía ALL desde 009 (no cambia)
--   - El cambio es: authenticated pasa de SELECT → SELECT + INSERT + UPDATE
--   - Consistent con V1 broad pattern de 014/016 (acc_source_batch_issue,
--     acc_source_adapter_profile, acc_source_balance_detail ya tienen ALL)
--   - DT-007-01: granularización a roles importer/approver/auditor → post-piloto
--
-- IDEMPOTENCIA:
--   Usa DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL END $$
--   para manejar el caso en que la política ya exista (re-ejecución segura).
-- =============================================================================
-- NO MODIFICA:
--   - RLS anon (sigue fail-closed en todas las tablas acc_*)
--   - service_role (sigue con ALL)
--   - Otras tablas acc_* (solo source_batch y account_balance)
--   - acc_account_balance UNIQUE constraint
--   - Triggers T10/T11/lifecycle (no se tocan)
-- =============================================================================


-- ============================================================
-- PARTE 1: acc_source_batch — INSERT + UPDATE para authenticated
-- ============================================================

-- INSERT: permite crear batches desde la UI (PostingPipeline.runIngest)
DO $$
BEGIN
  CREATE POLICY "asb_authenticated_insert"
    ON acc_source_batch
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy asb_authenticated_insert ya existe — omitiendo.';
END;
$$;

-- UPDATE: permite transicionar status (lifecycle trigger valida transiciones)
DO $$
BEGIN
  CREATE POLICY "asb_authenticated_update"
    ON acc_source_batch
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy asb_authenticated_update ya existe — omitiendo.';
END;
$$;


-- ============================================================
-- PARTE 2: acc_account_balance — INSERT + UPDATE para authenticated
-- ============================================================

-- INSERT: permite postear saldos canónicos (trigger T10 verifica período abierto)
-- NOTA: T10 es BEFORE INSERT, no BEFORE UPDATE — el upsert ON CONFLICT DO UPDATE
--       pasa por T10 en el INSERT attempt. Con período 'open', T10 pasa siempre.
DO $$
BEGIN
  CREATE POLICY "aab_authenticated_insert"
    ON acc_account_balance
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy aab_authenticated_insert ya existe — omitiendo.';
END;
$$;

-- UPDATE: permite re-posting (SUPERSEDED pattern — actualiza saldos existentes)
DO $$
BEGIN
  CREATE POLICY "aab_authenticated_update"
    ON acc_account_balance
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy aab_authenticated_update ya existe — omitiendo.';
END;
$$;


-- ============================================================
-- PARTE 3: Verificación post-deploy
-- ============================================================

-- V1: Confirmar políticas nuevas en acc_source_batch
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_source_batch'
ORDER BY policyname;
-- Esperado: incluye asb_authenticated_insert + asb_authenticated_update

-- V2: Confirmar políticas nuevas en acc_account_balance
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_account_balance'
ORDER BY policyname;
-- Esperado: incluye aab_authenticated_insert + aab_authenticated_update

-- V3: Confirmar que anon sigue denegado (fail-closed intacto)
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('acc_source_batch', 'acc_account_balance')
  AND qual = 'false'
ORDER BY tablename, policyname;
-- Esperado: al menos 2 filas (una deny anon por tabla)
-- Si 009 tenía deny_anon para estas tablas, aparecerán aquí.
