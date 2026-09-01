-- ============================================================================
-- rehearsal/10_ms_g1_before.sql — REPRODUCE el GAP-1 con la función ORIGINAL.
-- Cada probe registra en reh_res si el BUG está presente (passed=true => bug
-- reproducido, es lo esperado ANTES del fix).
-- ============================================================================
\set ALS '5aa10886-2a76-4a9e-9bc3-303fb776cd49'

-- G1.b1 — 's-t' emite folio SIN temporada (double-dash) → bug presente.
DO $t$
DECLARE v text;
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','s-t','ORD');
  IF v LIKE 'ORD--%' THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.b1_st_emite_folio_sin_temp','BEFORE',true,'emitió '||v||' (folio sin temporada)');
  ELSE
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.b1_st_emite_folio_sin_temp','BEFORE',false,'inesperado: '||v);
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.b1_st_emite_folio_sin_temp','BEFORE',false,'la original ya rechaza s-t? '||SQLERRM);
END $t$;

-- G1.b2 — temporada vacía tambien pasa (original solo chequea NOT NULL).
DO $t$
DECLARE v text;
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','','ORD');
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.b2_vacio_emite_folio','BEFORE',true,'emitió '||v||' con temporada vacía');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.b2_vacio_emite_folio','BEFORE',false,'rechazó vacío: '||SQLERRM);
END $t$;

-- G1.b3 — código inexistente en catálogo igual emite folio (sin validar autoridad).
DO $t$
DECLARE v text;
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','9999','ORD');
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.b3_no_catalogo_emite_folio','BEFORE',true,'emitió '||v||' sin proc_temporada 9999');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.b3_no_catalogo_emite_folio','BEFORE',false,'rechazó no-catálogo: '||SQLERRM);
END $t$;
