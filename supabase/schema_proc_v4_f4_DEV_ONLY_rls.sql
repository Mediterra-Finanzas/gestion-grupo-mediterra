-- ============================================================================
-- schema_proc_v4_f4_DEV_ONLY_rls.sql · ⚠️ DEV / STAGING ONLY · NUNCA PRODUCCIÓN
-- Política permisiva de desarrollo para tablas F4. Mismas reglas que F1-F3.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_despacho','proc_despacho_linea','proc_despacho_doc'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;
-- ROLLBACK: DROP POLICY pol_<t>_DEV_ONLY + REVOKE ALL ... FROM anon.
