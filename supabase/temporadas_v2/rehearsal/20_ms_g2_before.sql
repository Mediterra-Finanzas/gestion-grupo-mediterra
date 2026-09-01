-- ============================================================================
-- rehearsal/20_ms_g2_before.sql — REPRODUCE el GAP-2 (sin lifecycle enforce).
-- Los probes se AUTOLIMPIAN para dejar ALS con exactamente 1 activa ('2526'),
-- de modo que el pre-check de 20_* no aborte al aplicar el fix.
-- ============================================================================

-- G2.b1 — se puede escribir en temporada 'cerrada' (no hay guard).
DO $t$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_temporada(empresa_id,codigo,estado)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','CERRB','cerrada')
    RETURNING id INTO v_id;
  INSERT INTO proc_movimiento(empresa_id,temporada_codigo,objeto_tipo,objeto_id,cantidad)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','CERRB','lote',gen_random_uuid(),1);
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.b1_escribe_en_cerrada','BEFORE',true,'INSERT en temporada cerrada aceptado (bug)');
  -- cleanup
  DELETE FROM proc_movimiento WHERE temporada_codigo='CERRB';
  DELETE FROM proc_temporada  WHERE id=v_id;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.b1_escribe_en_cerrada','BEFORE',false,'inesperado: '||SQLERRM);
END $t$;

-- G2.b2 — se pueden tener 2 temporadas 'activa' del mismo empresa (sin índice único).
DO $t$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_temporada(empresa_id,codigo,estado)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','2627','activa')
    RETURNING id INTO v_id;
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.b2_dos_activas','BEFORE',true,'2a temporada activa aceptada (bug)');
  -- cleanup: dejar solo 2526 activa
  DELETE FROM proc_temporada WHERE id=v_id;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.b2_dos_activas','BEFORE',false,'inesperado: '||SQLERRM);
END $t$;
