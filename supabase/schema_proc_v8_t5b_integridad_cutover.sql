-- ============================================================================
-- schema_proc_v8_t5b_integridad_cutover.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T5b
-- CUTOVER de integridad Especie→Variedad en el Lote (D7).
-- ⚠️ Aplicar SÓLO DESPUÉS de sembrar el catálogo proc_especie/proc_variedad desde
-- los DISTINCT especie/variedad vivos (migration-plan Fase 3). Si quedan lotes con
-- códigos no catalogados, VALIDATE fallará → limpiar/catalogar antes.
--
-- NO forma parte de la cadena de regresión estándar (rompería fixtures que no
-- siembran catálogo). Es el paso final que congela "no más texto libre" (D7).
-- MATCH SIMPLE: si variedad_codigo es NULL, no se exige (lote sólo con especie).
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_proc_lote_variedad') THEN
    ALTER TABLE proc_lote ADD CONSTRAINT fk_proc_lote_variedad
      FOREIGN KEY (empresa_id, especie_codigo, variedad_codigo)
      REFERENCES proc_variedad (empresa_id, especie_codigo, codigo) NOT VALID;   -- no revalida legacy
  END IF;
END $$;
-- Opcional tras limpiar/catalogar todo lo vivo (revalida el histórico):
--   ALTER TABLE proc_lote VALIDATE CONSTRAINT fk_proc_lote_variedad;

-- ROLLBACK: ALTER TABLE proc_lote DROP CONSTRAINT fk_proc_lote_variedad;
-- FIN T5b cutover. NO producción.
