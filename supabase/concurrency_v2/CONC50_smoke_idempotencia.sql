-- ============================================================================
-- CONC50_smoke_idempotencia.sql — PASO 5 (SMOKE). Ejecutar SOLO si 50 quedó aplicado.
-- Prueba de comportamiento: los 2 índices UNIQUE parciales RECHAZAN duplicados.
-- 100% transaccional: TODO se revierte con ROLLBACK (no deja datos de prueba).
-- Devuelve una grilla; ambas filas deben decir PASS.
-- No usa \set. Corre como el rol del SQL Editor (prueba el índice, no la RLS).
-- ============================================================================
BEGIN;

CREATE TEMP TABLE _smoke_conc50(test text, resultado text) ON COMMIT DROP;

DO $smoke$
DECLARE
  v_emp  uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';  -- ALS (staging)
  v_tipo text;
  v_orig uuid;
  v_key  text := 'SMOKE-CONC50-IDEM';
  v_ok_idem boolean := false;
  v_ok_rev  boolean := false;
BEGIN
  -- tipo_movimiento válido (FK), distinto de 'ajuste' para no exigir motivo en el alta simple
  SELECT codigo INTO v_tipo FROM proc_tipo_movimiento WHERE codigo <> 'ajuste' LIMIT 1;
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'SMOKE ABORT: no hay filas en proc_tipo_movimiento para la prueba.';
  END IF;

  -- (A) IDEMPOTENCIA: misma (empresa_id, idempotency_key) dos veces => la 2a debe fallar
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,idempotency_key)
    VALUES (v_emp,v_tipo,'entrada','lote',gen_random_uuid(),1,v_key);
  BEGIN
    INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,idempotency_key)
      VALUES (v_emp,v_tipo,'entrada','lote',gen_random_uuid(),1,v_key);
    v_ok_idem := false;                       -- llegó aquí => NO rechazó => FAIL
  EXCEPTION WHEN unique_violation THEN
    v_ok_idem := true;                        -- rechazó => PASS
  END;

  -- (B) REVERSA ÚNICA: dos reversas del MISMO movimiento => la 2a debe fallar
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad)
    VALUES (v_emp,v_tipo,'entrada','lote',gen_random_uuid(),1)
    RETURNING id INTO v_orig;
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,es_reversa,revierte_movimiento_id,motivo)
    VALUES (v_emp,v_tipo,'salida','lote',gen_random_uuid(),1,true,v_orig,'smoke reversa 1');
  BEGIN
    INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,es_reversa,revierte_movimiento_id,motivo)
      VALUES (v_emp,v_tipo,'salida','lote',gen_random_uuid(),1,true,v_orig,'smoke reversa 2');
    v_ok_rev := false;                        -- NO rechazó => FAIL
  EXCEPTION WHEN unique_violation THEN
    v_ok_rev := true;                         -- rechazó => PASS
  END;

  INSERT INTO _smoke_conc50 VALUES
    ('(A) idempotencia rechaza (empresa,key) duplicada', CASE WHEN v_ok_idem THEN 'PASS' ELSE 'FAIL' END),
    ('(B) reversa única rechaza 2a reversa del original', CASE WHEN v_ok_rev  THEN 'PASS' ELSE 'FAIL' END);
END
$smoke$;

SELECT test, resultado FROM _smoke_conc50 ORDER BY test;

ROLLBACK;
