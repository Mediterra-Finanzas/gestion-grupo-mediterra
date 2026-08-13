-- ============================================================================
-- schema_proc_v1_DEV_ONLY_rls.sql   ·   ⚠️  DEV / STAGING ONLY  ·  NUNCA PRODUCCIÓN
-- ----------------------------------------------------------------------------
-- Política PERMISIVA de desarrollo para poder probar proc_* en dev/staging
-- MIENTRAS Core no emite el claim `empresa_id` en el JWT (EXP-SECURITY-001).
--
-- REGLAS:
--   1. Este archivo es DEV-ONLY. NO forma parte del deploy productivo ni del gate.
--   2. Vive SEPARADO del schema productivo (schema_proc_v1.sql), a propósito.
--   3. NO ejecutar en producción bajo ninguna circunstancia.
--   4. Se REVIERTE (bloque de rollback al final) apenas Core provea identidad+claim.
--
-- La postura productiva es RLS deny-by-default por empresa (ver schema_proc_v1.sql).
-- Aquí se abre temporalmente a `anon` SOLO para desarrollo, sin tocar el schema prod.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
    'proc_planta','proc_partes','proc_parte_roles','proc_predios','proc_recepcion','proc_lote'
  ] LOOP
    -- Política de desarrollo, claramente nombrada DEV_ONLY para poder dropearla en bloque.
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format($f$
      CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s
        USING (true) WITH CHECK (true);
    $f$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;

-- ── ROLLBACK (ejecutar cuando Core provea claim empresa_id) ──────────────────
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
--     'proc_planta','proc_partes','proc_parte_roles','proc_predios','proc_recepcion','proc_lote'
--   ] LOOP
--     EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
--     EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
--   END LOOP;
-- END $$;
