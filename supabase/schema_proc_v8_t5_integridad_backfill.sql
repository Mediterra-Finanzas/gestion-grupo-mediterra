-- ============================================================================
-- schema_proc_v8_t5_integridad_backfill.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T5
-- Backfill conservador de lotes legacy (D6, no fabricar historia) + reporte de
-- migración. La ACTIVACIÓN de la integridad Especie→Variedad (D7) es un CUTOVER
-- posterior al seed del catálogo → vive en schema_proc_v8_t5b_integridad_cutover.sql
-- (se aplica sólo tras sembrar), para no romper flujos que aún usan códigos no
-- catalogados. Este archivo NO rompe la cadena de regresión.
-- ============================================================================

-- ── Backfill conservador de lotes legacy (D6) ───────────────────────────────
-- Para lotes sin origen_snapshot: copia productor/predio desde la CABECERA de su
-- recepción (mejor esfuerzo) y construye un snapshot RECONSTRUIDO (no capturado al
-- ingreso). cuartel = no informado (no existía). Nunca fabrica. Idempotente.
-- Devuelve conteos para el reporte de migración.
CREATE OR REPLACE FUNCTION proc_fn_backfill_lote_origen(p_empresa uuid, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_recon int := 0; v_incompleto int := 0; r record; v_snap jsonb;
BEGIN
  FOR r IN
    SELECT l.id, l.especie_codigo, l.variedad_codigo, rec.productor_vinculo_id AS prod, rec.predio_id AS pred
    FROM proc_lote l JOIN proc_recepcion rec ON rec.id = l.recepcion_id
    WHERE l.empresa_id = p_empresa AND l.origen_snapshot IS NULL AND l.deleted_at IS NULL
    FOR UPDATE OF l
  LOOP
    -- snapshot reconstruido desde maestros CURRENT (lo que se conozca)
    v_snap := proc_fn_build_origen_snapshot(p_empresa, r.prod, r.pred, NULL, r.especie_codigo, r.variedad_codigo);
    v_snap := COALESCE(v_snap, '{}'::jsonb)
              || jsonb_build_object('cuartel', 'no informado',
                                    'origen_reconstruido', true,
                                    'reconstruido_at', now());
    UPDATE proc_lote SET productor_vinculo_id = COALESCE(productor_vinculo_id, r.prod),
                         predio_id = COALESCE(predio_id, r.pred),
                         origen_snapshot = v_snap, origen_reconstruido = true, updated_by = p_actor
     WHERE id = r.id;
    v_recon := v_recon + 1;
    IF r.prod IS NULL OR r.pred IS NULL THEN v_incompleto := v_incompleto + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('reconstruidos', v_recon, 'incompletos', v_incompleto);
END $$;

-- Reporte de migración (lectura): estado de origen de los lotes del tenant.
CREATE OR REPLACE VIEW proc_v_lote_origen_migracion AS
SELECT empresa_id,
  count(*) FILTER (WHERE origen_snapshot IS NULL)                            AS sin_snapshot,
  count(*) FILTER (WHERE origen_reconstruido)                               AS reconstruidos,
  count(*) FILTER (WHERE origen_snapshot IS NOT NULL AND NOT origen_reconstruido) AS capturados_al_ingreso,
  count(*) FILTER (WHERE origen_snapshot->>'cuartel' = 'no informado')      AS cuartel_no_informado
FROM proc_lote WHERE deleted_at IS NULL GROUP BY empresa_id;
ALTER VIEW proc_v_lote_origen_migracion SET (security_invoker = on);

-- FIN T5. Integridad + backfill conservador. NO producción; el backfill se corre
-- explícitamente por tenant tras sembrar catálogos (no automático).
