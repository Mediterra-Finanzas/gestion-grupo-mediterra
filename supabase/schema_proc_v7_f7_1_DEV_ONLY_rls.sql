-- ============================================================================
-- schema_proc_v7_f7_1_DEV_ONLY_rls.sql · ⚠️ DEV / STAGING ONLY · NUNCA PRODUCCIÓN
-- Política permisiva de desarrollo para tablas F7.1. Mismas reglas que F1-F6.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_correlativo'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;
-- ROLLBACK: DROP POLICY pol_<t>_DEV_ONLY + REVOKE ALL ... FROM anon.
