-- ============================================================================
-- 60_registrar_movimiento_fix.sql
-- CONC-B2 + idempotencia — reemplaza proc_fn_registrar_movimiento (schema_proc_v1).
-- DRAFT. Carril 3. NO EJECUTAR remoto. Prod bywovqayuzodbzwsriet = HANDS-OFF. Requiere 50_ aplicado.
--
-- CONC-B2 (lost-update en pallet/PT): la versión actual toma `FOR UPDATE` SOLO para objeto_tipo='lote'.
--   Para 'producto_terminado' y 'pallet' NO serializa → dos salidas concurrentes leen el mismo on_hand,
--   ambas pasan el chequeo de no-negativo y ambas insertan → sobreventa (on_hand < 0). FIX: tomar
--   `FOR UPDATE` de la fila objeto para lote, PT y pallet (misma disciplina de lock que ya usan
--   proc_fn_confirmar_despacho y proc_fn_repaletizar sobre proc_pallet → serializan entre sí).
--
-- Idempotencia retry-safe (opt-in, vía idempotency_key de 50_): si el caller pasa una clave estable,
--   un reintento devuelve el MISMO id sin duplicar ledger. El corto-circuito se evalúa DENTRO del lock
--   por objeto (un retry concurrente ve la fila ya confirmada) y hay ON CONFLICT DO NOTHING como backstop
--   de carrera. Con idempotency_key NULL el comportamiento es idéntico al actual (sin dedupe).
--
-- Firma: se AÑADE p_idempotency_key text DEFAULT NULL al final (16º parámetro). Todos los call-sites
--   existentes (ingresar_lote, registrar_consumo, reversar) pasan ≤15 args posicionales → resuelven al
--   default. Se DROPea la firma de 15 args y se recrea con 16 para evitar overload ambiguo.
--
-- ROLLBACK: ver 99_rollback.sql (recrea la definición original de 15 args).
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed; idéntico patrón a 50_) ───────────────────
DO $pre$
DECLARE v_reh text; v_marker int; v_proc int; v_als int; v_main int;
BEGIN
  v_reh := current_setting('conc.rehearsal', true);
  IF v_reh = '1' THEN
    v_marker := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_conc_rehearsal_ok');
    IF v_marker <> 1 THEN RAISE EXCEPTION 'CONC60 REHEARSAL ABORT (ROLLBACK): falta _conc_rehearsal_ok. HARD STOP.'; END IF;
    IF to_regclass('public.calendario_data') IS NOT NULL THEN
      RAISE EXCEPTION 'CONC60 REHEARSAL ABORT (ROLLBACK): calendario_data presente → parece prod/staging. HARD STOP.';
    END IF;
    RAISE NOTICE 'CONC60 preflight REHEARSAL OK.';
  ELSE
    v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
    IF v_proc < 30 THEN RAISE EXCEPTION 'CONC60 ABORT (ROLLBACK): proc_* = % (<30). No es staging. HARD STOP.', v_proc; END IF;
    v_als := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
    IF v_als <> 1 THEN RAISE EXCEPTION 'CONC60 ABORT (ROLLBACK): ALS no exacto. HARD STOP.'; END IF;
    v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
    IF v_main <> 1 THEN RAISE EXCEPTION 'CONC60 ABORT (ROLLBACK): calendario_data.main ausente. HARD STOP.'; END IF;
    RAISE NOTICE 'CONC60 preflight STAGING OK.';
  END IF;
  -- Dependencia dura: la columna idempotency_key debe existir (50_).
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key') <> 1 THEN
    RAISE EXCEPTION 'CONC60 ABORT (ROLLBACK): falta proc_movimiento.idempotency_key. Aplicar 50_ primero. HARD STOP.';
  END IF;
END
$pre$;

-- ── Reemplazo de firma (15 → 16 args) ────────────────────────────────────────
DROP FUNCTION IF EXISTS proc_fn_registrar_movimiento(
  uuid, uuid, text, text, text, text, uuid, numeric, text, uuid, uuid, text, uuid, boolean, uuid);

CREATE OR REPLACE FUNCTION proc_fn_registrar_movimiento(
  p_empresa_id uuid, p_planta_id uuid, p_temporada text,
  p_tipo text, p_naturaleza text, p_objeto_tipo text, p_objeto_id uuid,
  p_cantidad numeric, p_ref_tipo text, p_ref_id uuid,
  p_transaccion_id uuid, p_motivo text, p_actor uuid,
  p_es_reversa boolean DEFAULT false, p_revierte uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_on_hand numeric; v_mov uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad debe ser > 0 (recibido %)', p_cantidad;
  END IF;

  -- ── CONC-B2: serializar por objeto para lote, PT y pallet (antes: solo lote) ──
  IF p_objeto_tipo = 'lote' THEN
    PERFORM 1 FROM proc_lote WHERE id = p_objeto_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe para empresa %', p_objeto_id, p_empresa_id; END IF;
  ELSIF p_objeto_tipo = 'producto_terminado' THEN
    PERFORM 1 FROM proc_producto_terminado WHERE id = p_objeto_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'producto_terminado % no existe para empresa %', p_objeto_id, p_empresa_id; END IF;
  ELSIF p_objeto_tipo = 'pallet' THEN
    PERFORM 1 FROM proc_pallet WHERE id = p_objeto_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'pallet % no existe para empresa %', p_objeto_id, p_empresa_id; END IF;
  END IF;

  -- ── Idempotencia (opt-in): corto-circuito DENTRO del lock por objeto ──────────
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_mov FROM proc_movimiento
     WHERE empresa_id = p_empresa_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_mov; END IF;   -- retry: devuelve la fila ya escrita, sin duplicar
  END IF;

  -- ── Salida no puede dejar on_hand negativo (ahora bajo lock del objeto) ───────
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
    revierte_movimiento_id, motivo, transaccion_id, created_by, idempotency_key
  ) VALUES (
    p_empresa_id, p_planta_id, p_temporada, p_tipo, p_naturaleza,
    p_objeto_tipo, p_objeto_id, p_cantidad, p_ref_tipo, p_ref_id, p_es_reversa,
    p_revierte, p_motivo, p_transaccion_id, p_actor, p_idempotency_key
  )
  ON CONFLICT (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_mov;

  -- Backstop de carrera: clave duplicada insertada por otra tx entre el corto-circuito y el INSERT.
  IF v_mov IS NULL THEN
    IF p_idempotency_key IS NULL THEN
      RAISE EXCEPTION 'INSERT de movimiento no devolvió id (inesperado, sin idempotency_key)';
    END IF;
    SELECT id INTO v_mov FROM proc_movimiento
     WHERE empresa_id = p_empresa_id AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN v_mov;
END $$;

-- GRANTS: preservar el baseline de R4-B (authenticated + service_role; NUNCA anon/PUBLIC).
-- OJO: DROP+CREATE de una funcion nueva reactiva el PUBLIC EXECUTE por default => hay que REVOCAR.
-- (La version original de este archivo hacia `GRANT ... TO anon, authenticated` sin revoke => REGRESION
--  de R4-B: re-abria anon y dejaba PUBLIC. Corregido 2026-08-31 para no reintroducir el hueco.)
REVOKE ALL ON FUNCTION proc_fn_registrar_movimiento(
  uuid, uuid, text, text, text, text, uuid, numeric, text, uuid, uuid, text, uuid, boolean, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION proc_fn_registrar_movimiento(
  uuid, uuid, text, text, text, text, uuid, numeric, text, uuid, uuid, text, uuid, boolean, uuid, text)
  TO authenticated, service_role;

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
DECLARE v_n int;
BEGIN
  v_n := (SELECT count(*) FROM pg_proc p
            WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16);
  IF v_n <> 1 THEN RAISE EXCEPTION 'CONC60 POST FAIL: no hay exactamente 1 registrar_movimiento de 16 args (hay %). ABORT.', v_n; END IF;
  -- La firma vieja de 15 args no debe seguir viva (evita overload ambiguo).
  IF (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15) <> 0 THEN
    RAISE EXCEPTION 'CONC60 POST FAIL: sobrevive la firma de 15 args. ABORT.';
  END IF;
  -- Baseline R4-B de grants: la funcion nueva NO debe tener anon ni PUBLIC; si authenticated+service_role.
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16
      AND a.privilege_type='EXECUTE'
      AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))
  ) THEN
    RAISE EXCEPTION 'CONC60 POST FAIL: la funcion(16) tiene EXECUTE para anon/PUBLIC (regresion R4-B). ABORT.';
  END IF;
  IF (SELECT count(DISTINCT r.rolname) FROM pg_proc p, aclexplode(p.proacl) a
        JOIN pg_roles r ON r.oid=a.grantee
       WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16
         AND a.privilege_type='EXECUTE' AND r.rolname IN ('authenticated','service_role')) <> 2 THEN
    RAISE EXCEPTION 'CONC60 POST FAIL: faltan grants a authenticated/service_role. ABORT.';
  END IF;
  RAISE NOTICE 'CONC60 POST OK: registrar_movimiento(16) + lock lote/PT/pallet + idempotencia + grants R4-B intactos.';
END
$post$;

COMMIT;
