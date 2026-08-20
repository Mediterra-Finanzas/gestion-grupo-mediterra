-- ============================================================================
-- schema_proc_v3_f3_DEV_ONLY_rls.sql · ⚠️ DEV / STAGING ONLY · NUNCA PRODUCCIÓN
-- Política permisiva de desarrollo para las tablas F3. Mismas reglas que F1/F2.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea',
    'proc_repaletizaje','proc_repaletizaje_origen','proc_repaletizaje_destino'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;
-- ROLLBACK: DROP POLICY pol_<t>_DEV_ONLY + REVOKE ALL ... FROM anon (al proveer claim).
