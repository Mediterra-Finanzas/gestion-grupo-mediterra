-- ============================================================================
-- 20_ms_g2_lifecycle_enforce.sql
-- GAP-2 (C, blocker) — enforcea el lifecycle de temporada.
--
-- QUÉ HACE (aditivo, reversible):
--   (a) TRIGGER BEFORE INSERT en entidades operativas: rechaza escribir si la
--       temporada objetivo de la fila está 'cerrada' o 'anulada'.
--   (b) ÍNDICE ÚNICO PARCIAL: máximo UNA temporada 'activa' por empresa.
--   (c) RPC de reapertura controlada (permiso + proc_audit_log), único camino para
--       reabrir; nunca PATCH directo. + tabla de permisos gestionable desde la app.
--
-- Preservación histórica: el cierre solo BLOQUEA nuevas escrituras. No toca ni borra
--   filas existentes (ledger append-only, snapshots inmutables siguen intactos).
--
-- Entidades cubiertas por (a): las que llevan la temporada EN LA FILA —
--   proc_recepcion (temporada_id uuid), proc_movimiento, proc_producto_terminado,
--   proc_pallet, proc_despacho, proc_informe, proc_base_cobro (temporada_codigo text).
--   NO cubiertas (sin columna de temporada en la fila): proc_orden_proceso,
--   proc_programa_proceso — su temporada vive solo en el folio. Se guardan una vez que
--   MS-G3 (30_*) les agregue temporada_codigo; hasta entonces la línea de defensa es
--   MS-G1 (el correlativo ya exige temporada válida para emitir su folio).
--
-- ⚠ NO EJECUTAR EN ESTA SESIÓN. Draft para revisión del integrador.
-- ============================================================================

BEGIN;

-- ── PREFLIGHT (fingerprint STAGING, fail-closed) ─────────────────────────────
DO $guard$
DECLARE
  v_als_id CONSTANT uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_baseline_ok boolean; v_calendario_ok boolean; v_als_ok boolean;
BEGIN
  v_baseline_ok := to_regclass('public.proc_temporada') IS NOT NULL
    AND to_regclass('public.proc_correlativo') IS NOT NULL
    AND to_regclass('public.proc_movimiento') IS NOT NULL;
  IF NOT v_baseline_ok THEN RAISE EXCEPTION 'GUARD ABORT: baseline proc_* incompleto.'; END IF;
  v_calendario_ok := (to_regclass('public.calendario_data') IS NOT NULL);
  IF v_calendario_ok THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.calendario_data WHERE id=''main'')' INTO v_calendario_ok; END IF;
  IF NOT v_calendario_ok THEN RAISE EXCEPTION 'GUARD ABORT: falta calendario_data.main.'; END IF;
  IF to_regclass('public.contab_empresas') IS NULL THEN RAISE EXCEPTION 'GUARD ABORT: sin contab_empresas.'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.contab_empresas WHERE id=%L AND codigo=%L)', v_als_id, 'ALS') INTO v_als_ok;
  IF NOT v_als_ok THEN RAISE EXCEPTION 'GUARD ABORT: tenant ALS % ausente (posible PRODUCCIÓN).', v_als_id; END IF;
  RAISE NOTICE 'GUARD OK (MS-G2): destino STAGING compatible.';
END $guard$;

-- ── PRE-CHECK para (b): no puede haber ya >1 activa por empresa (fail-closed) ─
DO $pre$
DECLARE v_dups int;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT empresa_id FROM proc_temporada
    WHERE estado='activa' AND deleted_at IS NULL
    GROUP BY empresa_id HAVING count(*) > 1
  ) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'GUARD ABORT (MS-G2.b): % empresa(s) ya tienen >1 temporada activa. Corregir estados antes de crear el índice único parcial. (Ver: SELECT empresa_id,count(*) FROM proc_temporada WHERE estado=''activa'' AND deleted_at IS NULL GROUP BY 1 HAVING count(*)>1;)', v_dups;
  END IF;
END $pre$;

-- ── (a) GUARD DE ESCRITURA POR LIFECYCLE ─────────────────────────────────────
-- Resuelve la temporada de la fila (por temporada_id uuid o temporada_codigo text)
-- y rechaza el INSERT si está cerrada/anulada. Si no resuelve o es NULL, NO decide
-- aquí (eso es dominio de MS-G1/MS-G3): este guard es SOLO lifecycle.
CREATE OR REPLACE FUNCTION proc_fn_guard_temporada_escritura() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  j jsonb := to_jsonb(NEW);
  v_temp_id uuid;
  v_cod text;
  v_estado text;
BEGIN
  -- Caso FK uuid (proc_recepcion).
  IF j ? 'temporada_id' AND (j->>'temporada_id') IS NOT NULL THEN
    v_temp_id := (j->>'temporada_id')::uuid;
    SELECT estado INTO v_estado FROM proc_temporada WHERE id = v_temp_id;
  -- Caso código texto (resto).
  ELSIF j ? 'temporada_codigo' AND btrim(COALESCE(j->>'temporada_codigo','')) <> ''
        AND lower(btrim(j->>'temporada_codigo')) <> 's-t' THEN
    v_cod := btrim(j->>'temporada_codigo');
    SELECT estado INTO v_estado FROM proc_temporada
      WHERE empresa_id = NEW.empresa_id AND codigo = v_cod AND deleted_at IS NULL;
  ELSE
    RETURN NEW;  -- sin temporada resoluble en la fila → no es asunto de este guard
  END IF;

  IF v_estado IN ('cerrada','anulada') THEN
    RAISE EXCEPTION 'Temporada % está %; no se admiten nuevas escrituras en % (empresa %). Reabrí la temporada por el RPC controlado si corresponde.',
      COALESCE(v_cod, v_temp_id::text), v_estado, TG_TABLE_NAME, NEW.empresa_id;
  END IF;
  RETURN NEW;
END $fn$;

DO $attach$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_recepcion','proc_movimiento','proc_producto_terminado',
    'proc_pallet','proc_despacho','proc_informe','proc_base_cobro'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_lifecycle_temporada_%1$s ON %1$s;', t);
      EXECUTE format('CREATE TRIGGER trg_lifecycle_temporada_%1$s BEFORE INSERT ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_guard_temporada_escritura();', t);
    END IF;
  END LOOP;
END $attach$;

-- ── (b) ÍNDICE ÚNICO PARCIAL: una sola activa por empresa ─────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_proc_temporada_una_activa
  ON proc_temporada (empresa_id)
  WHERE estado = 'activa' AND deleted_at IS NULL;

-- ── (c) REAPERTURA CONTROLADA (permiso + auditoría) ──────────────────────────
-- Tabla de permisos (gestionable desde la app; no hardcodea usuarios).
CREATE TABLE IF NOT EXISTS proc_temporada_reapertura_permiso (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  usuario_id   uuid NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  otorgado_por uuid,
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, usuario_id)
);
-- touch + auditoría reutilizando la infra existente.
DROP TRIGGER IF EXISTS trg_touch_proc_temporada_reapertura_permiso ON proc_temporada_reapertura_permiso;
CREATE TRIGGER trg_touch_proc_temporada_reapertura_permiso BEFORE UPDATE ON proc_temporada_reapertura_permiso
  FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_audit_proc_temporada_reapertura_permiso ON proc_temporada_reapertura_permiso;
CREATE TRIGGER trg_audit_proc_temporada_reapertura_permiso AFTER INSERT OR UPDATE OR DELETE ON proc_temporada_reapertura_permiso
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

-- RPC: único camino para reabrir. SECURITY DEFINER para escribir auditoría/estado
-- de forma controlada; valida permiso del actor. 'anulada' es terminal (no se reabre).
CREATE OR REPLACE FUNCTION proc_fn_reabrir_temporada(
  p_temporada_id uuid, p_nuevo_estado text, p_motivo text
) RETURNS proc_temporada
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor uuid := proc_current_user();
  v_row proc_temporada;
  v_ant jsonb;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'reapertura: motivo obligatorio (queda en auditoría).';
  END IF;
  IF p_nuevo_estado NOT IN ('activa','planificada') THEN
    RAISE EXCEPTION 'reapertura: nuevo estado debe ser activa|planificada (recibido %).', p_nuevo_estado;
  END IF;

  SELECT * INTO v_row FROM proc_temporada WHERE id = p_temporada_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reapertura: temporada % inexistente.', p_temporada_id; END IF;
  IF v_row.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'reapertura: temporada % borrada.', p_temporada_id; END IF;
  IF v_row.estado = 'anulada' THEN
    RAISE EXCEPTION 'reapertura: temporada % está anulada (estado terminal); no se reabre.', p_temporada_id;
  END IF;
  IF v_row.estado <> 'cerrada' THEN
    RAISE EXCEPTION 'reapertura: temporada % no está cerrada (estado actual %); nada que reabrir.', p_temporada_id, v_row.estado;
  END IF;

  -- Permiso del actor sobre el empresa de la temporada.
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM proc_temporada_reapertura_permiso
    WHERE empresa_id = v_row.empresa_id AND usuario_id = v_actor AND activo
  ) THEN
    RAISE EXCEPTION 'reapertura: usuario % sin permiso de reapertura para empresa %.', v_actor, v_row.empresa_id;
  END IF;

  -- Si reabre a 'activa', respetar una-sola-activa (el índice también lo enforcea).
  IF p_nuevo_estado = 'activa' AND EXISTS (
    SELECT 1 FROM proc_temporada
    WHERE empresa_id = v_row.empresa_id AND estado='activa' AND deleted_at IS NULL AND id <> v_row.id
  ) THEN
    RAISE EXCEPTION 'reapertura: ya existe una temporada activa para empresa %; cerrala o reabrí a planificada.', v_row.empresa_id;
  END IF;

  v_ant := to_jsonb(v_row);
  UPDATE proc_temporada
     SET estado = p_nuevo_estado, updated_at = now(), updated_by = v_actor
   WHERE id = p_temporada_id
   RETURNING * INTO v_row;

  INSERT INTO proc_audit_log(empresa_id, tabla, registro_id, accion, valor_ant, valor_nue, motivo, usuario_id)
  VALUES (v_row.empresa_id, 'proc_temporada', v_row.id, 'estado', v_ant, to_jsonb(v_row),
          'REAPERTURA: '||p_motivo, v_actor);

  RETURN v_row;
END $fn$;

-- Grants: la tabla de permisos y el RPC quedan disponibles a authenticated.
-- (RLS de proc_temporada_reapertura_permiso se define en el DEV_ONLY/productivo aparte;
--  aquí solo el objeto. El integrador aplica la política por empresa como el resto.)
GRANT EXECUTE ON FUNCTION proc_fn_reabrir_temporada(uuid, text, text) TO authenticated;

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
DECLARE v_cnt int;
BEGIN
  -- índice creado
  IF to_regclass('public.ux_proc_temporada_una_activa') IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: índice ux_proc_temporada_una_activa ausente.';
  END IF;
  -- triggers presentes en cada tabla objetivo existente
  SELECT count(*) INTO v_cnt FROM pg_trigger
    WHERE tgname LIKE 'trg_lifecycle_temporada_%' AND NOT tgisinternal;
  IF v_cnt = 0 THEN RAISE EXCEPTION 'POST-CHECK FAIL: no se adjuntó ningún trigger de lifecycle.'; END IF;
  -- RPC + tabla de permiso presentes
  IF to_regclass('public.proc_temporada_reapertura_permiso') IS NULL THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: tabla de permisos ausente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='proc_fn_reabrir_temporada') THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: RPC de reapertura ausente.';
  END IF;
  RAISE NOTICE 'POST-CHECK OK (MS-G2): guard + índice único + RPC/permiso presentes (% triggers).', v_cnt;
END $post$;

COMMIT;

-- ============================================================================
-- ROLLBACK EXACTO (revertir todo lo de MS-G2):
-- BEGIN;
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['proc_recepcion','proc_movimiento','proc_producto_terminado',
--       'proc_pallet','proc_despacho','proc_informe','proc_base_cobro'] LOOP
--       EXECUTE format('DROP TRIGGER IF EXISTS trg_lifecycle_temporada_%1$s ON %1$s;', t);
--     END LOOP; END $$;
--   DROP FUNCTION IF EXISTS proc_fn_guard_temporada_escritura();
--   DROP INDEX IF EXISTS ux_proc_temporada_una_activa;
--   DROP FUNCTION IF EXISTS proc_fn_reabrir_temporada(uuid, text, text);
--   DROP TABLE IF EXISTS proc_temporada_reapertura_permiso;   -- borra permisos + su auditoría de fila
-- COMMIT;
-- (La auditoría YA registrada en proc_audit_log por reaperturas NO se borra: es histórico.)
-- ============================================================================
-- NOTA DE REHEARSAL (Docker local):
--   1) Baseline proc_* + seed ALS/calendario_data.main + 1 proc_temporada 'activa'.
--   2) Ejecutar. Esperado GUARD OK + POST-CHECK OK.
--   3) Casos:
--      · UPDATE proc_temporada SET estado='cerrada' WHERE ... ; luego INSERT en
--        proc_movimiento con esa temporada_codigo → debe FALLAR (lifecycle).
--      · Intentar 2ª proc_temporada 'activa' para el mismo empresa → viola índice único.
--      · proc_fn_reabrir_temporada(id,'activa','test') SIN permiso → EXCEPTION;
--        insertar permiso y repetir → OK + fila en proc_audit_log accion='estado'.
--   4) Revertir con el bloque ROLLBACK.
-- ============================================================================
