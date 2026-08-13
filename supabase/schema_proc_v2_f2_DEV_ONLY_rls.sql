-- ============================================================================
-- schema_proc_v2_f2_DEV_ONLY_rls.sql · ⚠️ DEV / STAGING ONLY · NUNCA PRODUCCIÓN
-- Política permisiva de desarrollo para las tablas F2 (incremental sobre F1).
-- Mismas reglas que el DEV-ONLY de F1. NO forma parte del deploy ni del gate.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad',
    'proc_motivos_descarte','proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion',
    'proc_programa_proceso','proc_orden_proceso','proc_orden_insumo','proc_resultado',
    'proc_resultado_descarte','proc_resultado_merma'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s USING (true) WITH CHECK (true);', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;
-- ROLLBACK: DROP POLICY pol_<t>_DEV_ONLY + REVOKE ALL ... FROM anon (cuando Core provea claim).
