-- ============================================================================
-- rehearsal/11_ms_g1_after.sql — VERIFICA que el fix (10_*) cierra el GAP-1.
-- passed=true => comportamiento correcto tras el fix.
-- La fase (AFTER | REAPPLY) se toma del GUC de sesión reh.phase (default AFTER).
-- (No se usa :'PHASE' de psql porque no interpola dentro de bloques DO $$).
-- ============================================================================

-- G1.a1 — temporada válida del catálogo emite folio bien formado.
DO $t$
DECLARE v text; ph text := COALESCE(current_setting('reh.phase', true), 'AFTER');
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','2526','ORD');
  IF v LIKE 'ORD-2526-%' THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.a1_valida_emite_bien',ph,true,'emitió '||v);
  ELSE
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.a1_valida_emite_bien',ph,false,'formato inesperado: '||v);
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a1_valida_emite_bien',COALESCE(current_setting('reh.phase', true),'AFTER'),false,'rechazó temporada válida: '||SQLERRM);
END $t$;

-- G1.a2 — 's-t' ahora RECHAZADA.
DO $t$
DECLARE v text; ph text := COALESCE(current_setting('reh.phase', true), 'AFTER');
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','s-t','ORD');
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a2_st_rechazada',ph,false,'ACEPTÓ s-t: '||v);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a2_st_rechazada',COALESCE(current_setting('reh.phase', true),'AFTER'),true,'rechazó s-t: '||SQLERRM);
END $t$;

-- G1.a3 — vacío RECHAZADO.
DO $t$
DECLARE v text; ph text := COALESCE(current_setting('reh.phase', true), 'AFTER');
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','','ORD');
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a3_vacio_rechazado',ph,false,'ACEPTÓ vacío: '||v);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a3_vacio_rechazado',COALESCE(current_setting('reh.phase', true),'AFTER'),true,'rechazó vacío: '||SQLERRM);
END $t$;

-- G1.a4 — código fuera del catálogo RECHAZADO.
DO $t$
DECLARE v text; ph text := COALESCE(current_setting('reh.phase', true), 'AFTER');
BEGIN
  v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','9999','ORD');
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a4_no_catalogo_rechazado',ph,false,'ACEPTÓ 9999: '||v);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G1.a4_no_catalogo_rechazado',COALESCE(current_setting('reh.phase', true),'AFTER'),true,'rechazó 9999: '||SQLERRM);
END $t$;

-- G1.a5 — temporada 'cerrada' (no activa/planificada) RECHAZADA (autoridad de estado).
DO $t$
DECLARE v text; ph text := COALESCE(current_setting('reh.phase', true), 'AFTER');
BEGIN
  INSERT INTO proc_temporada(empresa_id,codigo,estado)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','CERRG1','cerrada')
    ON CONFLICT (empresa_id,codigo) DO UPDATE SET estado='cerrada';
  BEGIN
    v := proc_fn_siguiente_correlativo('5aa10886-2a76-4a9e-9bc3-303fb776cd49','CERRG1','ORD');
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.a5_cerrada_rechazada',ph,false,'ACEPTÓ cerrada: '||v);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G1.a5_cerrada_rechazada',ph,true,'rechazó cerrada: '||SQLERRM);
  END;
END $t$;
