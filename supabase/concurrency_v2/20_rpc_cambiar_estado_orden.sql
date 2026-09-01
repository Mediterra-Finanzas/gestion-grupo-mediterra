-- ============================================================================
-- 20_rpc_cambiar_estado_orden.sql — Capa 2: transición de orden serializada + no-stale.
-- DRAFT. NO EJECUTAR. Carril B. Producción bywovqayuzodbzwsriet = HANDS-OFF. TARGET staging.
--
-- Reemplaza el PATCH client-side de cambiarEstadoOrden (procesoF7DB.js ~L109) por una RPC que:
--   1. Bloquea la fila con SELECT … FOR UPDATE (serializa transiciones concurrentes).
--   2. Valida la transición DESDE EL ESTADO ACTUAL bloqueado (no el que trae stale el cliente).
--   3. Rechaza como CONFLICT si el token que trae el cliente (p_expected_version) ya no coincide
--      → la fila cambió desde que la leyó. Nunca pisa el cambio ajeno; nunca no-op silencioso.
--   4. Devuelve el nuevo estado + row_version para que el cliente refresque su token.
-- El trigger trg_orden_transicion (v2_f2) SIGUE corriendo dentro del UPDATE (defensa en profundidad:
-- transición legal + conciliación obligatoria para 'conciliado'). Esta RPC añade el control de
-- concurrencia que el trigger por diseño no puede dar.
--
-- SECURITY INVOKER (default): corre con los privilegios/RLS del llamador (deny-by-default por empresa).
-- Requiere 10_optimistic_token.sql (usa proc_orden_proceso.row_version). Variante updated_at comentada.
-- Idempotente (CREATE OR REPLACE FUNCTION). ROLLBACK: DROP FUNCTION IF EXISTS proc_fn_cambiar_estado_orden(uuid,uuid,text,bigint,uuid);
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed) ─────────────────────────────────────────
DO $pre$
DECLARE v_proc int; v_als int; v_rv int;
BEGIN
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_als  := (SELECT count(*) FROM contab_empresas
               WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_rv   := (SELECT count(*) FROM information_schema.columns
               WHERE table_schema='public' AND table_name='proc_orden_proceso' AND column_name='row_version');
  IF v_proc < 30 THEN RAISE EXCEPTION 'RPC-ORDEN ABORT: proc_* = % (<30). Target no es staging. HARD STOP.', v_proc; END IF;
  IF v_als <> 1 THEN RAISE EXCEPTION 'RPC-ORDEN ABORT: ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_rv <> 1 THEN RAISE EXCEPTION 'RPC-ORDEN ABORT: proc_orden_proceso.row_version ausente. Aplicar 10_optimistic_token.sql antes. HARD STOP.'; END IF;
  RAISE NOTICE 'RPC-ORDEN preflight OK. Creando proc_fn_cambiar_estado_orden…';
END
$pre$;

-- ── RPC ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_cambiar_estado_orden(
  p_empresa_id      uuid,
  p_orden_id        uuid,
  p_nuevo_estado    text,
  p_expected_version bigint,   -- token que el cliente leyó (row_version). NULL = no verificar (NO recomendado).
  p_actor           uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_estado_actual text;
  v_version_actual bigint;
  v_folio text;
  v_nueva_version bigint;
BEGIN
  -- 1) Lock + re-lectura autoritativa del estado ACTUAL (no el stale del cliente).
  SELECT estado, row_version, folio
    INTO v_estado_actual, v_version_actual, v_folio
    FROM proc_orden_proceso
   WHERE id = p_orden_id AND empresa_id = p_empresa_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROC_NOT_FOUND: orden % (empresa %) no existe o fue eliminada', p_orden_id, p_empresa_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 2) Guardia optimista: si el cliente trajo un token y ya no coincide → CONFLICT (stale read).
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version_actual THEN
    RAISE EXCEPTION 'PROC_STALE: la orden % cambió desde que la leíste (tu versión=%, actual=%). Recarga y reintenta.',
      v_folio, p_expected_version, v_version_actual
      USING ERRCODE = 'serialization_failure';   -- 40001 → el frontend lo mapea a "conflicto, recarga"
  END IF;

  -- 3) Sin cambio real de estado → no es un éxito silencioso: es un no-op explícito y visible.
  IF p_nuevo_estado = v_estado_actual THEN
    RAISE EXCEPTION 'PROC_NOOP: la orden % ya está en estado % (nada que hacer)', v_folio, v_estado_actual
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 4) Validación de transición DESDE EL ESTADO REAL BLOQUEADO (espejo de trg_orden_transicion;
  --    redundante a propósito para dar un error de dominio limpio antes del trigger).
  IF NOT (
    (v_estado_actual='borrador'               AND p_nuevo_estado IN ('en_proceso','anulado')) OR
    (v_estado_actual='en_proceso'             AND p_nuevo_estado IN ('pendiente_conciliacion','anulado')) OR
    (v_estado_actual='pendiente_conciliacion' AND p_nuevo_estado IN ('conciliado','en_proceso','anulado')) OR
    (v_estado_actual='conciliado'             AND p_nuevo_estado IN ('cerrado','en_proceso','anulado'))
  ) THEN
    RAISE EXCEPTION 'PROC_TRANSICION_INVALIDA: orden % no puede pasar de % a %', v_folio, v_estado_actual, p_nuevo_estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5) UPDATE. Doble red: WHERE incluye row_version (aunque el FOR UPDATE ya nos serializó).
  --    trg_orden_transicion valida de nuevo + conciliación; trg_bumpver sube row_version; trg_touch
  --    sube updated_at; trg_audit deja rastro. Si algo falla → EXCEPTION → ROLLBACK de la RPC.
  UPDATE proc_orden_proceso
     SET estado = p_nuevo_estado, updated_by = p_actor
   WHERE id = p_orden_id AND empresa_id = p_empresa_id
     AND row_version = v_version_actual
   RETURNING row_version INTO v_nueva_version;

  IF NOT FOUND THEN
    -- Inalcanzable con el lock tomado, pero fail-closed por si acaso.
    RAISE EXCEPTION 'PROC_STALE: la orden % cambió durante la escritura. Recarga y reintenta.', v_folio
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'id', p_orden_id, 'estado', p_nuevo_estado, 'row_version', v_nueva_version
  );
END $$;

COMMIT;

-- ── VARIANTE updated_at (si NO se aplica 10_optimistic_token.sql) ────────────
-- Cambiar la firma a (…, p_expected_updated_at timestamptz, …); SELECT … updated_at INTO v_ts_actual;
-- comparar p_expected_updated_at <> v_ts_actual; y el UPDATE devuelve updated_at. El resto es idéntico.
-- Recomendado usar row_version por robustez de formato (ver README §Token).
