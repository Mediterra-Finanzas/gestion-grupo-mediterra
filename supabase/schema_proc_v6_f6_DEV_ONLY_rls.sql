-- ============================================================================
-- schema_proc_v6_f6_DEV_ONLY_rls.sql · ⚠️ DEV / STAGING ONLY · NUNCA PRODUCCIÓN
-- Política permisiva de desarrollo para tablas F6. Mismas reglas que F1-F5.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;
-- ROLLBACK: DROP POLICY pol_<t>_DEV_ONLY + REVOKE ALL ... FROM anon.
