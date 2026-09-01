-- ============================================================================
-- 70_reversar_fix.sql
-- CONC-B3 (doble reversa) — reemplaza proc_fn_reversar_movimiento (schema_proc_v1).
-- DRAFT. Carril 3. NO EJECUTAR remoto. Prod bywovqayuzodbzwsriet = HANDS-OFF. Requiere 50_ y 60_.
--
-- CONC-B3: la versión actual no impide reversar dos veces el mismo movimiento. Dos llamadas
--   (retry de red o doble click, secuenciales o concurrentes) pasan ambas el chequeo `NOT es_reversa`
--   e insertan cada una un contramovimiento → el efecto se DUPLICA (la reversa se aplica dos veces).
--
-- FIX (tres capas, defensa en profundidad):
--   1) `SELECT ... FOR UPDATE` sobre el movimiento ORIGINAL → serializa dos reversas concurrentes:
--      la 2ª espera a que la 1ª haga commit y recién entonces evalúa el estado real.
--   2) Corto-circuito idempotente: si YA existe la reversa de este movimiento, se DEVUELVE su id
--      (no se crea otra). Un retry es seguro y NO duplica; la intención ("revertir este movimiento")
--      queda satisfecha exactamente una vez.
--   3) Backstop a nivel DB: ux_proc_mov_reversa_unica (creado en 50_) → si dos escrituras llegaran a
--      colar simultáneamente, la 2ª choca con unique_violation (conflicto VISIBLE, no silencioso).
--   Además la reversa se registra con idempotency_key='REV:'||orig.id → dedupe también en la capa 60.
--
-- Nota: SELECT FOR UPDATE sobre proc_movimiento NO dispara el trigger append-only
--   (trg_block_proc_movimiento es BEFORE UPDATE OR DELETE; un lock de fila no es UPDATE).
--
-- ROLLBACK: ver 99_rollback.sql (recrea la definición original sin guardas).
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed) ─────────────────────────────────────────
DO $pre$
DECLARE v_reh text; v_marker int; v_proc int; v_als int; v_main int;
BEGIN
  v_reh := current_setting('conc.rehearsal', true);
  IF v_reh = '1' THEN
    v_marker := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_conc_rehearsal_ok');
    IF v_marker <> 1 THEN RAISE EXCEPTION 'CONC70 REHEARSAL ABORT (ROLLBACK): falta _conc_rehearsal_ok. HARD STOP.'; END IF;
    IF to_regclass('public.calendario_data') IS NOT NULL THEN
      RAISE EXCEPTION 'CONC70 REHEARSAL ABORT (ROLLBACK): calendario_data presente → parece prod/staging. HARD STOP.';
    END IF;
    RAISE NOTICE 'CONC70 preflight REHEARSAL OK.';
  ELSE
    v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
    IF v_proc < 30 THEN RAISE EXCEPTION 'CONC70 ABORT (ROLLBACK): proc_* = % (<30). No es staging. HARD STOP.', v_proc; END IF;
    v_als := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
    IF v_als <> 1 THEN RAISE EXCEPTION 'CONC70 ABORT (ROLLBACK): ALS no exacto. HARD STOP.'; END IF;
    v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
    IF v_main <> 1 THEN RAISE EXCEPTION 'CONC70 ABORT (ROLLBACK): calendario_data.main ausente. HARD STOP.'; END IF;
    RAISE NOTICE 'CONC70 preflight STAGING OK.';
  END IF;
  -- Dependencia dura: el backstop unique de reversa debe existir (50_).
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica') <> 1 THEN
    RAISE EXCEPTION 'CONC70 ABORT (ROLLBACK): falta ux_proc_mov_reversa_unica. Aplicar 50_ primero. HARD STOP.';
  END IF;
  -- Dependencia dura EXPLICITA (fix 2026-08-30): 70 invoca proc_fn_registrar_movimiento(16 args)
  -- con idempotency_key='REV:'||id → esa firma solo existe tras 60_. Verificar, no asumir por orden.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
                 AND proname='proc_fn_registrar_movimiento' AND pronargs=16) THEN
    RAISE EXCEPTION 'CONC70 ABORT (ROLLBACK): falta proc_fn_registrar_movimiento(16 args). Aplicar 60_ primero. HARD STOP.';
  END IF;
END
$pre$;

-- ── Reversar endurecido ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_reversar_movimiento(
  p_empresa_id uuid, p_mov_id uuid, p_motivo text, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE o proc_movimiento%ROWTYPE; v_rev uuid;
BEGIN
  -- (1) Lockear el original → serializa dobles reversas concurrentes.
  SELECT * INTO o FROM proc_movimiento
   WHERE id = p_mov_id AND empresa_id = p_empresa_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movimiento % no existe', p_mov_id; END IF;
  IF o.es_reversa THEN RAISE EXCEPTION 'no se reversa una reversa (%)', p_mov_id; END IF;
  IF p_motivo IS NULL THEN RAISE EXCEPTION 'la reversa exige motivo'; END IF;

  -- (2) Idempotencia: si ya fue reversado, devolver la reversa existente (sin duplicar).
  SELECT id INTO v_rev FROM proc_movimiento
   WHERE empresa_id = p_empresa_id AND revierte_movimiento_id = p_mov_id AND es_reversa = true;
  IF FOUND THEN RETURN v_rev; END IF;

  -- Contramovimiento append-only (idempotency_key propia → dedupe en capa 60 + backstop unique).
  RETURN proc_fn_registrar_movimiento(
    o.empresa_id, o.planta_id, o.temporada_codigo, o.tipo_movimiento,
    CASE WHEN o.naturaleza='entrada' THEN 'salida' ELSE 'entrada' END,
    o.objeto_tipo, o.objeto_id, o.cantidad, o.ref_tipo, o.ref_id,
    o.transaccion_id, p_motivo, p_actor, true, o.id, 'REV:'||o.id::text);
END $$;

-- GRANTS: preservar baseline R4-B (authenticated + service_role; NUNCA anon/PUBLIC).
-- (La version original hacia `GRANT ... TO anon, authenticated` => REGRESION de R4-B: reabria anon.
--  Corregido 2026-09-01 para no reintroducir el hueco. Es CREATE OR REPLACE => la ACL previa se
--  conserva; el REVOKE explicito deja el intent claro e idempotente.)
REVOKE ALL ON FUNCTION proc_fn_reversar_movimiento(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION proc_fn_reversar_movimiento(uuid, uuid, text, uuid) TO authenticated, service_role;

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_reversar_movimiento') <> 1 THEN
    RAISE EXCEPTION 'CONC70 POST FAIL: reversar_movimiento no está exactamente 1 vez. ABORT.';
  END IF;
  -- Baseline R4-B: la funcion NO debe tener anon ni PUBLIC; si authenticated+service_role.
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.proname='proc_fn_reversar_movimiento' AND p.pronargs=4
      AND a.privilege_type='EXECUTE'
      AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))
  ) THEN
    RAISE EXCEPTION 'CONC70 POST FAIL: reversar tiene EXECUTE para anon/PUBLIC (regresion R4-B). ABORT.';
  END IF;
  IF (SELECT count(DISTINCT r.rolname) FROM pg_proc p, aclexplode(p.proacl) a
        JOIN pg_roles r ON r.oid=a.grantee
       WHERE p.proname='proc_fn_reversar_movimiento' AND p.pronargs=4
         AND a.privilege_type='EXECUTE' AND r.rolname IN ('authenticated','service_role')) <> 2 THEN
    RAISE EXCEPTION 'CONC70 POST FAIL: faltan grants a authenticated/service_role. ABORT.';
  END IF;
  RAISE NOTICE 'CONC70 POST OK: reversar endurecido (FOR UPDATE + idempotente + backstop unique) + grants R4-B intactos.';
END
$post$;

COMMIT;
