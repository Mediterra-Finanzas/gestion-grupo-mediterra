-- ============================================================================
-- 99_rollback.sql — Reversa de 50_/60_/70_ (CONC-B2, CONC-B3, idempotencia ledger).
-- DRAFT. Carril 3. NO EJECUTAR remoto. No destructivo de datos (solo esquema + cuerpos de función).
-- Deja proc_movimiento y sus funciones EXACTAMENTE como antes del set 50/60/70.
-- Mismo preflight fail-closed (STAGING o REHEARSAL). Idempotente.
-- ============================================================================
BEGIN;

DO $pre$
DECLARE v_reh text; v_marker int; v_proc int; v_als int; v_main int;
BEGIN
  v_reh := current_setting('conc.rehearsal', true);
  IF v_reh = '1' THEN
    v_marker := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_conc_rehearsal_ok');
    IF v_marker <> 1 THEN RAISE EXCEPTION 'CONC99 REHEARSAL ABORT: falta _conc_rehearsal_ok. HARD STOP.'; END IF;
    IF to_regclass('public.calendario_data') IS NOT NULL THEN
      RAISE EXCEPTION 'CONC99 REHEARSAL ABORT: calendario_data presente → parece prod/staging. HARD STOP.';
    END IF;
    RAISE NOTICE 'CONC99 preflight REHEARSAL OK.';
  ELSE
    v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
    IF v_proc < 30 THEN RAISE EXCEPTION 'CONC99 ABORT: proc_* = % (<30). No es staging. HARD STOP.', v_proc; END IF;
    v_als := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
    IF v_als <> 1 THEN RAISE EXCEPTION 'CONC99 ABORT: ALS no exacto. HARD STOP.'; END IF;
    v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
    IF v_main <> 1 THEN RAISE EXCEPTION 'CONC99 ABORT: calendario_data.main ausente. HARD STOP.'; END IF;
    RAISE NOTICE 'CONC99 preflight STAGING OK.';
  END IF;
END
$pre$;

-- ── Restaurar reversar ORIGINAL (sin guardas) ────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_reversar_movimiento(
  p_empresa_id uuid, p_mov_id uuid, p_motivo text, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE o proc_movimiento%ROWTYPE;
BEGIN
  SELECT * INTO o FROM proc_movimiento WHERE id = p_mov_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'movimiento % no existe', p_mov_id; END IF;
  IF o.es_reversa THEN RAISE EXCEPTION 'no se reversa una reversa (%)', p_mov_id; END IF;
  IF p_motivo IS NULL THEN RAISE EXCEPTION 'la reversa exige motivo'; END IF;
  RETURN proc_fn_registrar_movimiento(
    o.empresa_id, o.planta_id, o.temporada_codigo, o.tipo_movimiento,
    CASE WHEN o.naturaleza='entrada' THEN 'salida' ELSE 'entrada' END,
    o.objeto_tipo, o.objeto_id, o.cantidad, o.ref_tipo, o.ref_id,
    o.transaccion_id, p_motivo, p_actor, true, o.id);
END $$;
GRANT EXECUTE ON FUNCTION proc_fn_reversar_movimiento(uuid, uuid, text, uuid) TO anon, authenticated;

-- ── Restaurar registrar_movimiento ORIGINAL (15 args, lock solo lote) ────────
DROP FUNCTION IF EXISTS proc_fn_registrar_movimiento(
  uuid, uuid, text, text, text, text, uuid, numeric, text, uuid, uuid, text, uuid, boolean, uuid, text);

CREATE OR REPLACE FUNCTION proc_fn_registrar_movimiento(
  p_empresa_id uuid, p_planta_id uuid, p_temporada text,
  p_tipo text, p_naturaleza text, p_objeto_tipo text, p_objeto_id uuid,
  p_cantidad numeric, p_ref_tipo text, p_ref_id uuid,
  p_transaccion_id uuid, p_motivo text, p_actor uuid,
  p_es_reversa boolean DEFAULT false, p_revierte uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_on_hand numeric; v_mov uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad debe ser > 0 (recibido %)', p_cantidad;
  END IF;
  IF p_objeto_tipo = 'lote' THEN
    PERFORM 1 FROM proc_lote WHERE id = p_objeto_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe para empresa %', p_objeto_id, p_empresa_id; END IF;
  END IF;
  IF p_naturaleza = 'salida' THEN
    SELECT COALESCE(SUM(CASE WHEN naturaleza='entrada' THEN cantidad ELSE -cantidad END),0)
      INTO v_on_hand FROM proc_movimiento
     WHERE objeto_tipo = p_objeto_tipo AND objeto_id = p_objeto_id AND empresa_id = p_empresa_id;
    IF (v_on_hand - p_cantidad) < 0 THEN
      RAISE EXCEPTION 'salida % excede on_hand % del objeto %', p_cantidad, v_on_hand, p_objeto_id;
    END IF;
  END IF;
  INSERT INTO proc_movimiento(
    empresa_id, planta_id, temporada_codigo, tipo_movimiento, naturaleza,
    objeto_tipo, objeto_id, cantidad, ref_tipo, ref_id, es_reversa,
    revierte_movimiento_id, motivo, transaccion_id, created_by
  ) VALUES (
    p_empresa_id, p_planta_id, p_temporada, p_tipo, p_naturaleza,
    p_objeto_tipo, p_objeto_id, p_cantidad, p_ref_tipo, p_ref_id, p_es_reversa,
    p_revierte, p_motivo, p_transaccion_id, p_actor
  ) RETURNING id INTO v_mov;
  RETURN v_mov;
END $$;
GRANT EXECUTE ON FUNCTION proc_fn_registrar_movimiento(
  uuid, uuid, text, text, text, text, uuid, numeric, text, uuid, uuid, text, uuid, boolean, uuid)
  TO anon, authenticated;

-- ── Drop de índices + columna (aditivos → reversibles) ───────────────────────
DROP INDEX IF EXISTS ux_proc_mov_reversa_unica;
DROP INDEX IF EXISTS ux_proc_mov_idem;
ALTER TABLE proc_movimiento DROP COLUMN IF EXISTS idempotency_key;

DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16) <> 0 THEN
    RAISE EXCEPTION 'CONC99 POST FAIL: sobrevive registrar_movimiento(16). ABORT.';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15) <> 1 THEN
    RAISE EXCEPTION 'CONC99 POST FAIL: no se restauró registrar_movimiento(15). ABORT.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key') <> 0 THEN
    RAISE EXCEPTION 'CONC99 POST FAIL: idempotency_key sigue presente. ABORT.';
  END IF;
  RAISE NOTICE 'CONC99 POST OK: estado restaurado (pre 50/60/70).';
END
$post$;

COMMIT;
