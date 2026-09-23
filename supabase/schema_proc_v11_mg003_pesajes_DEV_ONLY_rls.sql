-- ============================================================================
-- schema_proc_v11_mg003_pesajes_DEV_ONLY_rls.sql · ⚠️ DEV / STAGING ONLY · NUNCA PRODUCCIÓN
-- Política permisiva de desarrollo para las tablas MG-003 (pesajes). Incremental sobre
-- el DEV-ONLY de F1: abre anon con política true/true para permitir el flujo sin claim
-- empresa_id mientras Core no lo provee. NO forma parte del deploy ni del gate GO-LIVE.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_recepcion_pesaje','proc_recepcion_bin'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;
-- ROLLBACK: DROP POLICY pol_<t>_DEV_ONLY + REVOKE ALL ... FROM anon (cuando Core provea claim).
