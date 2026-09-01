-- ============================================================================
-- rehearsal/21_ms_g2_after.sql — VERIFICA que 20_* cierra el GAP-2.
-- Requiere un actor en el contexto para el RPC de reapertura.
-- ============================================================================
-- Simula el JWT: actor 'sub' + empresa ALS (proc_current_user lee de aquí).
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","empresa_id":"5aa10886-2a76-4a9e-9bc3-303fb776cd49"}';

-- G2.a0 — CONTROL: escribir en la temporada ACTIVA sigue permitido (no falso positivo).
DO $t$
BEGIN
  INSERT INTO proc_movimiento(empresa_id,temporada_codigo,objeto_tipo,objeto_id,cantidad)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','2526','lote',gen_random_uuid(),1);
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.a0_activa_permite','AFTER',true,'INSERT en activa aceptado (correcto)');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.a0_activa_permite','AFTER',false,'BLOQUEÓ escritura en activa: '||SQLERRM);
END $t$;

-- G2.a1 — escribir (código texto) en temporada 'cerrada' ahora RECHAZADO.
DO $t$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_temporada(empresa_id,codigo,estado)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','CERRA','cerrada')
    RETURNING id INTO v_id;
  BEGIN
    INSERT INTO proc_movimiento(empresa_id,temporada_codigo,objeto_tipo,objeto_id,cantidad)
      VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','CERRA','lote',gen_random_uuid(),1);
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a1_cerrada_texto_bloquea','AFTER',false,'ACEPTÓ escritura en cerrada (texto)');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a1_cerrada_texto_bloquea','AFTER',true,'bloqueó: '||SQLERRM);
  END;
END $t$;

-- G2.a2 — escribir (FK uuid, proc_recepcion) en temporada 'cerrada' RECHAZADO.
DO $t$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM proc_temporada
    WHERE empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='CERRA';
  BEGIN
    INSERT INTO proc_recepcion(empresa_id,folio,temporada_id,kg_neto)
      VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','REC-TEST-1',v_id,10);
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a2_cerrada_uuid_bloquea','AFTER',false,'ACEPTÓ recepción en cerrada (uuid)');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a2_cerrada_uuid_bloquea','AFTER',true,'bloqueó: '||SQLERRM);
  END;
END $t$;

-- G2.a3 — no se puede crear una 2a temporada 'activa' (índice único parcial).
DO $t$
BEGIN
  INSERT INTO proc_temporada(empresa_id,codigo,estado)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','2728','activa');
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.a3_una_activa','AFTER',false,'ACEPTÓ 2a activa');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.a3_una_activa','AFTER',true,'rechazó 2a activa: '||SQLERRM);
END $t$;

-- G2.a4 — reapertura SIN permiso RECHAZADA.
DO $t$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM proc_temporada
    WHERE empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='CERRA';
  BEGIN
    PERFORM proc_fn_reabrir_temporada(v_id,'planificada','prueba sin permiso');
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a4_reapertura_sin_permiso','AFTER',false,'REABRIÓ sin permiso');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a4_reapertura_sin_permiso','AFTER',true,'rechazó: '||SQLERRM);
  END;
END $t$;

-- G2.a5 — reapertura CON permiso a 'planificada' OK + auditoría accion='estado'.
DO $t$
DECLARE v_id uuid; v_aud int;
BEGIN
  SELECT id INTO v_id FROM proc_temporada
    WHERE empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='CERRA';
  INSERT INTO proc_temporada_reapertura_permiso(empresa_id,usuario_id,activo)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','11111111-1111-1111-1111-111111111111',true)
    ON CONFLICT (empresa_id,usuario_id) DO UPDATE SET activo=true;
  PERFORM proc_fn_reabrir_temporada(v_id,'planificada','reapertura autorizada rehearsal');
  SELECT count(*) INTO v_aud FROM proc_audit_log
    WHERE tabla='proc_temporada' AND registro_id=v_id AND accion='estado';
  IF (SELECT estado FROM proc_temporada WHERE id=v_id)='planificada' AND v_aud >= 1 THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a5_reapertura_con_permiso','AFTER',true,'reabrió a planificada + '||v_aud||' fila(s) audit');
  ELSE
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a5_reapertura_con_permiso','AFTER',false,'estado/audit inesperado (aud='||v_aud||')');
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO reh_res(check_id,phase,passed,detail)
    VALUES ('G2.a5_reapertura_con_permiso','AFTER',false,'error: '||SQLERRM);
END $t$;

-- G2.a6 — reabrir una 'anulada' RECHAZADO (estado terminal).
DO $t$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_temporada(empresa_id,codigo,estado)
    VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ANULX','anulada')
    RETURNING id INTO v_id;
  BEGIN
    PERFORM proc_fn_reabrir_temporada(v_id,'activa','intento reabrir anulada');
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a6_anulada_terminal','AFTER',false,'REABRIÓ una anulada');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO reh_res(check_id,phase,passed,detail)
      VALUES ('G2.a6_anulada_terminal','AFTER',true,'rechazó: '||SQLERRM);
  END;
END $t$;

RESET request.jwt.claims;
