-- ============================================================================
-- schema_proc_v1_DEV_ONLY_rls.sql   ·   ⚠️  DEV / STAGING ONLY  ·  NUNCA PRODUCCIÓN
-- ----------------------------------------------------------------------------
-- Política PERMISIVA de desarrollo para probar proc_* en dev/staging MIENTRAS Core
-- no emite el claim `empresa_id` en el JWT (EXP-SECURITY-001).
--
-- REGLAS:
--   1. DEV-ONLY. NO forma parte del deploy productivo ni del gate.
--   2. Vive SEPARADO del schema productivo (schema_proc_v1.sql), a propósito.
--   3. NO ejecutar en producción bajo ninguna circunstancia (ver GO-LIVE BLOCKER).
--   4. Se REVIERTE (rollback al final) apenas Core provea identidad + claim.
--
-- Nota: proc_movimiento sigue siendo append-only aun en DEV — el trigger
-- proc_fn_block_ledger_mutation bloquea UPDATE/DELETE también aquí (correcto).
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
    'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
    'proc_recepcion','proc_lote','proc_movimiento','proc_hold'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
    EXECUTE format($f$
      CREATE POLICY pol_%1$s_DEV_ONLY ON %1$s
        USING (true) WITH CHECK (true);
    $f$, t);
  END LOOP;
  -- Ledger: solo SELECT+INSERT a anon en dev (append-only se mantiene).
  EXECUTE 'GRANT SELECT, INSERT ON proc_movimiento TO anon;';
  FOREACH t IN ARRAY ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
    'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
    'proc_recepcion','proc_lote','proc_hold'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;

-- ── ROLLBACK (ejecutar cuando Core provea claim empresa_id) ──────────────────
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
--     'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
--     'proc_recepcion','proc_lote','proc_movimiento','proc_hold'
--   ] LOOP
--     EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
--     EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
--   END LOOP;
-- END $$;
