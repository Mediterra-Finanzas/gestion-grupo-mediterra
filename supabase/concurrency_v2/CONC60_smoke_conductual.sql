-- ============================================================================
-- CONC60_smoke_conductual.sql — SMOKE de CONC60. Ejecutar SOLO si 60 quedó aplicado.
-- Prueba: (1) la firma de 16 args es invocable; (2) idempotencia retry-safe: dos llamadas
-- con la MISMA idempotency_key devuelven el MISMO id y dejan UNA sola fila de ledger.
-- 100% transaccional (ROLLBACK) → no deja datos. Corre como el rol del SQL Editor.
-- Reporta por NOTICE; si algo falla lanza EXCEPTION (rojo) e igual revierte.
-- ============================================================================
BEGIN;
DO $s$
DECLARE
  v_emp  uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_lote uuid;
  v_tipo text;
  v_key  text := 'SMOKE-CONC60-'||gen_random_uuid()::text;
  v_id1 uuid; v_id2 uuid; v_cnt int;
BEGIN
  SELECT id INTO v_lote FROM proc_lote WHERE empresa_id=v_emp LIMIT 1;
  SELECT codigo INTO v_tipo FROM proc_tipo_movimiento WHERE codigo<>'ajuste' LIMIT 1;
  IF v_lote IS NULL THEN RAISE NOTICE 'SMOKE CONC60 SKIP: no hay proc_lote en ALS para la prueba (ok, sin datos).'; RETURN; END IF;
  IF v_tipo IS NULL THEN RAISE NOTICE 'SMOKE CONC60 SKIP: no hay proc_tipo_movimiento.'; RETURN; END IF;

  -- 1a llamada (entrada de 1 sobre un lote existente) con idempotency_key estable
  v_id1 := proc_fn_registrar_movimiento(
    v_emp, NULL, NULL, v_tipo, 'entrada', 'lote', v_lote, 1,
    NULL, NULL, gen_random_uuid(), 'smoke conc60', NULL, false, NULL, v_key);
  -- 2a llamada (retry) con la MISMA idempotency_key → debe devolver el mismo id, sin duplicar
  v_id2 := proc_fn_registrar_movimiento(
    v_emp, NULL, NULL, v_tipo, 'entrada', 'lote', v_lote, 1,
    NULL, NULL, gen_random_uuid(), 'smoke conc60 retry', NULL, false, NULL, v_key);

  SELECT count(*) INTO v_cnt FROM proc_movimiento WHERE empresa_id=v_emp AND idempotency_key=v_key;

  IF v_id1 IS NOT NULL AND v_id1 = v_id2 AND v_cnt = 1 THEN
    RAISE NOTICE 'SMOKE CONC60 PASS: firma(16) invocable + idempotente (id1=id2, 1 fila de ledger).';
  ELSE
    RAISE EXCEPTION 'SMOKE CONC60 FAIL: id1=% id2=% filas=% (esperado id1=id2 y filas=1).', v_id1, v_id2, v_cnt;
  END IF;
END
$s$;
ROLLBACK;
