-- ============================================================================
-- CONC50_smoke_conductual.sql — SMOKE (conductual, sin tabla TEMP).
-- Inserta duplicados reales y verifica que el índice los RECHAZA. Reporta por
-- RAISE NOTICE (ver pestaña de mensajes) y hace ROLLBACK: no deja datos de prueba.
-- Si algún índice NO rechaza, lanza EXCEPTION (rojo) — igual revierte todo.
-- No usa \set. Corre como el rol del SQL Editor (prueba el índice, no la RLS).
-- ============================================================================
BEGIN;
DO $smoke$
DECLARE
  v_emp  uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';  -- ALS (staging)
  v_tipo text;
  v_orig uuid;
  v_key  text := 'SMOKE-CONC50-IDEM';
  v_ok_idem boolean := false;
  v_ok_rev  boolean := false;
BEGIN
  SELECT codigo INTO v_tipo FROM proc_tipo_movimiento WHERE codigo <> 'ajuste' LIMIT 1;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'SMOKE ABORT: no hay proc_tipo_movimiento.'; END IF;

  -- (A) IDEMPOTENCIA
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,idempotency_key)
    VALUES (v_emp,v_tipo,'entrada','lote',gen_random_uuid(),1,v_key);
  BEGIN
    INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,idempotency_key)
      VALUES (v_emp,v_tipo,'entrada','lote',gen_random_uuid(),1,v_key);
    v_ok_idem := false;
  EXCEPTION WHEN unique_violation THEN v_ok_idem := true; END;

  -- (B) REVERSA ÚNICA
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad)
    VALUES (v_emp,v_tipo,'entrada','lote',gen_random_uuid(),1) RETURNING id INTO v_orig;
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,es_reversa,revierte_movimiento_id,motivo)
    VALUES (v_emp,v_tipo,'salida','lote',gen_random_uuid(),1,true,v_orig,'smoke reversa 1');
  BEGIN
    INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,es_reversa,revierte_movimiento_id,motivo)
      VALUES (v_emp,v_tipo,'salida','lote',gen_random_uuid(),1,true,v_orig,'smoke reversa 2');
    v_ok_rev := false;
  EXCEPTION WHEN unique_violation THEN v_ok_rev := true; END;

  RAISE NOTICE 'SMOKE (A) idempotencia rechaza duplicado = %', CASE WHEN v_ok_idem THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'SMOKE (B) reversa unica rechaza 2a reversa = %', CASE WHEN v_ok_rev THEN 'PASS' ELSE 'FAIL' END;
  IF NOT (v_ok_idem AND v_ok_rev) THEN
    RAISE EXCEPTION 'SMOKE FAIL: A=% B=% (algun indice no rechazo el duplicado).', v_ok_idem, v_ok_rev;
  END IF;
  RAISE NOTICE 'SMOKE CONC50 OK — ambos indices UNIQUE parciales rechazan duplicados (todo revertido).';
END
$smoke$;
ROLLBACK;
