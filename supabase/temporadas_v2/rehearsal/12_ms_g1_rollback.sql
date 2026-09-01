-- ============================================================================
-- rehearsal/12_ms_g1_rollback.sql — aplica el ROLLBACK EXACTO documentado en
-- 10_ms_g1_correlativo_temporada_enforce.sql (restaura la función original v7 f7_1)
-- y verifica que el gap REAPARECE (prueba de reversibilidad).
-- ============================================================================
BEGIN;
CREATE OR REPLACE FUNCTION proc_fn_siguiente_correlativo(
  p_empresa uuid, p_temporada text, p_tipo text, p_prefijo text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_n int; v_pref text; v_short text;
BEGIN
  IF p_empresa IS NULL OR p_temporada IS NULL OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'correlativo exige empresa, temporada y tipo';
  END IF;
  INSERT INTO proc_correlativo(empresa_id, temporada_codigo, tipo_documento, prefijo, ultimo)
    VALUES (p_empresa, p_temporada, p_tipo, COALESCE(NULLIF(p_prefijo,''), p_tipo), 1)
  ON CONFLICT (empresa_id, temporada_codigo, tipo_documento)
    DO UPDATE SET ultimo = proc_correlativo.ultimo + 1, updated_at = now()
  RETURNING ultimo, prefijo INTO v_n, v_pref;
  v_short := regexp_replace(p_temporada, '[^0-9]', '', 'g');
  IF length(v_short) = 8 THEN v_short := substr(v_short,3,2) || substr(v_short,7,2); END IF;
  RETURN v_pref || '-' || v_short || '-' || lpad(v_n::text, 6, '0');
END $$;
COMMIT;

-- Verifica reversibilidad: 's-t' vuelve a emitir folio sin temporada.
DO $t$
DECLARE v text;
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','s-t','ORD');
  IF v LIKE 'ORD--%' THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.rb_reversible','ROLLBACK',true,'tras rollback s-t vuelve a emitir '||v);
  ELSE
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.rb_reversible','ROLLBACK',false,'rollback no restauró bug: '||v);
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.rb_reversible','ROLLBACK',false,'rollback no restauró (siguió rechazando): '||SQLERRM);
END $t$;
