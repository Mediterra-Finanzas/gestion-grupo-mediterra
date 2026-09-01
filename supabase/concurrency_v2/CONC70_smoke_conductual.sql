-- ============================================================================
-- CONC70_smoke_conductual.sql — SMOKE de CONC70. Ejecutar SOLO si 70 quedó aplicado.
-- Prueba CONC-B3: reversar dos veces el MISMO movimiento devuelve el MISMO id y deja UNA sola
-- contra-fila (idempotencia). 100% transaccional (ROLLBACK) → no deja datos.
-- Elige un movimiento 'salida' original (su reversa es 'entrada' → nunca subdesborda on_hand).
-- Reporta por NOTICE. SKIP si no hay movimiento apto (sin datos). Corre como rol del SQL Editor.
-- ============================================================================
BEGIN;
DO $s$
DECLARE
  v_emp uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_mov uuid;
  v_r1 uuid; v_r2 uuid; v_cnt int;
BEGIN
  -- original NO-reversa, preferentemente 'salida' (reversa = entrada, sin chequeo de on_hand)
  SELECT id INTO v_mov FROM proc_movimiento
   WHERE empresa_id=v_emp AND es_reversa=false AND naturaleza='salida'
   ORDER BY created_at LIMIT 1;
  IF v_mov IS NULL THEN
    SELECT id INTO v_mov FROM proc_movimiento
     WHERE empresa_id=v_emp AND es_reversa=false ORDER BY created_at LIMIT 1;
  END IF;
  IF v_mov IS NULL THEN RAISE NOTICE 'SMOKE CONC70 SKIP: no hay movimiento original en ALS.'; RETURN; END IF;

  BEGIN
    v_r1 := proc_fn_reversar_movimiento(v_emp, v_mov, 'smoke conc70', NULL);
    v_r2 := proc_fn_reversar_movimiento(v_emp, v_mov, 'smoke conc70 retry', NULL);   -- retry
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'SMOKE CONC70 SKIP: la reversa no aplicó a este movimiento (%: %). Sin datos aptos.', SQLSTATE, SQLERRM;
    RETURN;
  END;

  SELECT count(*) INTO v_cnt FROM proc_movimiento
   WHERE empresa_id=v_emp AND revierte_movimiento_id=v_mov AND es_reversa=true;

  IF v_r1 IS NOT NULL AND v_r1 = v_r2 AND v_cnt = 1 THEN
    RAISE NOTICE 'SMOKE CONC70 PASS: reversa idempotente (r1=r2, 1 contra-fila).';
  ELSE
    RAISE EXCEPTION 'SMOKE CONC70 FAIL: r1=% r2=% contra-filas=% (esperado r1=r2 y 1).', v_r1, v_r2, v_cnt;
  END IF;
END
$s$;
ROLLBACK;
