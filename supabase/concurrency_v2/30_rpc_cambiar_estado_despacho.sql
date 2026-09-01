-- ============================================================================
-- 30_rpc_cambiar_estado_despacho.sql — Capa 2: transición de despacho serializada + no-stale.
-- DRAFT. NO EJECUTAR. Carril B. Producción bywovqayuzodbzwsriet = HANDS-OFF. TARGET staging.
--
-- Reemplaza el PATCH client-side de cambiarEstadoDespacho (procesoF7DB.js ~L195). Misma mecánica
-- que la RPC de orden: SELECT … FOR UPDATE, validar desde el estado real bloqueado, rechazar stale,
-- devolver nuevo token. Respeta la máquina de estados de trg_desp_transicion (v4_f4), incluida la
-- regla de que 'despachado' solo admite pasar a 'cancelado' (reversa formal) y 'cancelado' es terminal.
-- El trigger sigue corriendo dentro del UPDATE (defensa en profundidad).
--
-- NOTA: 'cancelado' desde 'despachado' es una reversa FÍSICA que hoy va por proc_fn_cancelar_despacho
-- (RPC que además revierte reservas/movimientos). Esta RPC NO reemplaza esa reversa: para 'despachado'
-- → 'cancelado' delega/deja al flujo de cancelar_despacho. Cubre las transiciones administrativas
-- borrador→…→cargando y cualquier →cancelado ANTES de 'despachado'. Ver guard interno.
--
-- Requiere 10_optimistic_token.sql. SECURITY INVOKER. Idempotente (CREATE OR REPLACE).
-- ROLLBACK: DROP FUNCTION IF EXISTS proc_fn_cambiar_estado_despacho(uuid,uuid,text,bigint,uuid);
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
               WHERE table_schema='public' AND table_name='proc_despacho' AND column_name='row_version');
  IF v_proc < 30 THEN RAISE EXCEPTION 'RPC-DESP ABORT: proc_* = % (<30). Target no es staging. HARD STOP.', v_proc; END IF;
  IF v_als <> 1 THEN RAISE EXCEPTION 'RPC-DESP ABORT: ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF v_rv <> 1 THEN RAISE EXCEPTION 'RPC-DESP ABORT: proc_despacho.row_version ausente. Aplicar 10_optimistic_token.sql antes. HARD STOP.'; END IF;
  RAISE NOTICE 'RPC-DESP preflight OK. Creando proc_fn_cambiar_estado_despacho…';
END
$pre$;

-- ── RPC ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_cambiar_estado_despacho(
  p_empresa_id      uuid,
  p_despacho_id     uuid,
  p_nuevo_estado    text,
  p_expected_version bigint,
  p_actor           uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_estado_actual text;
  v_version_actual bigint;
  v_folio text;
  v_nueva_version bigint;
BEGIN
  -- 1) Lock + re-lectura autoritativa.
  SELECT estado, row_version, folio
    INTO v_estado_actual, v_version_actual, v_folio
    FROM proc_despacho
   WHERE id = p_despacho_id AND empresa_id = p_empresa_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROC_NOT_FOUND: despacho % (empresa %) no existe o fue eliminado', p_despacho_id, p_empresa_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 2) Guardia optimista (stale read → CONFLICT).
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_version_actual THEN
    RAISE EXCEPTION 'PROC_STALE: el despacho % cambió desde que lo leíste (tu versión=%, actual=%). Recarga y reintenta.',
      v_folio, p_expected_version, v_version_actual
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 3) La reversa física (despachado → cancelado) NO va por acá: usa proc_fn_cancelar_despacho
  --    (revierte reservas/movimientos del ledger). Bloqueamos para no dejar el despacho "cancelado"
  --    sin revertir lo físico.
  IF v_estado_actual = 'despachado' THEN
    RAISE EXCEPTION 'PROC_USE_CANCELAR: despacho % ya despachado; para revertir usa proc_fn_cancelar_despacho (revierte movimientos).', v_folio
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4) No-op explícito (visible, no silencioso).
  IF p_nuevo_estado = v_estado_actual THEN
    RAISE EXCEPTION 'PROC_NOOP: el despacho % ya está en estado % (nada que hacer)', v_folio, v_estado_actual
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 5) Transición válida desde el estado real bloqueado (espejo de trg_desp_transicion, salvo la rama
  --    'despachado' ya interceptada arriba).
  IF NOT (
    (v_estado_actual='borrador'   AND p_nuevo_estado IN ('preparando','cancelado')) OR
    (v_estado_actual='preparando' AND p_nuevo_estado IN ('listo','cancelado')) OR
    (v_estado_actual='listo'      AND p_nuevo_estado IN ('cargando','cancelado')) OR
    (v_estado_actual='cargando'   AND p_nuevo_estado IN ('despachado','cancelado'))
  ) THEN
    RAISE EXCEPTION 'PROC_TRANSICION_INVALIDA: despacho % no puede pasar de % a %', v_folio, v_estado_actual, p_nuevo_estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- 6) UPDATE con doble red (row_version en el WHERE) + triggers de dominio/audit/token.
  UPDATE proc_despacho
     SET estado = p_nuevo_estado, updated_by = p_actor
   WHERE id = p_despacho_id AND empresa_id = p_empresa_id
     AND row_version = v_version_actual
   RETURNING row_version INTO v_nueva_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROC_STALE: el despacho % cambió durante la escritura. Recarga y reintenta.', v_folio
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'id', p_despacho_id, 'estado', p_nuevo_estado, 'row_version', v_nueva_version
  );
END $$;

COMMIT;
