-- ============================================================================
-- 40_trg_tarifa_guard.sql — Trigger de estado-máquina FALTANTE para proc_tarifa.
-- DRAFT. NO EJECUTAR. Carril B. Producción bywovqayuzodbzwsriet = HANDS-OFF. TARGET staging.
--
-- Hueco detectado: cambiarEstadoTarifa (procesoF7DB.js ~L232) hace PATCH directo de `estado`
-- sobre proc_tarifa, pero proc_tarifa NO tiene trigger de transición (a diferencia de orden/
-- despacho/base/contrato). Hoy cualquier estado→cualquier estado pasa. Esto crea:
--   - transiciones ilegales (p.ej. 'anulada' → 'vigente', revivir una tarifa anulada);
--   - edición de una tarifa terminal (cerrada/anulada) que ya fue snapshoteada en servicios.
--
-- Estados de proc_tarifa (v6_f6): 'vigente' | 'cerrada' | 'anulada'.
-- Máquina de estados propuesta (espejo del resto del dominio; simple y auditable):
--     vigente  → cerrada | anulada
--     cerrada  → anulada            (permite anular una tarifa ya cerrada; NO revivir a vigente)
--     anulada  → (terminal)
-- Además: una tarifa 'anulada' es inmutable (ningún campo editable). 'cerrada' solo admite pasar a
-- 'anulada' o edición de metadatos no económicos (observaciones) — el guard NO congela columnas
-- económicas acá (eso es otra capability); su alcance es la transición de estado.
--
-- Idempotente (CREATE OR REPLACE + DROP/CREATE TRIGGER). Sin backfill.
-- ROLLBACK: BEGIN; DROP TRIGGER IF EXISTS trg_tarifa_guard ON proc_tarifa;
--           DROP FUNCTION IF EXISTS proc_fn_tarifa_guard(); COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed) ─────────────────────────────────────────
DO $pre$
DECLARE v_proc int; v_als int; v_tar boolean;
BEGIN
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_als  := (SELECT count(*) FROM contab_empresas
               WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_tar  := to_regclass('public.proc_tarifa') IS NOT NULL;
  IF v_proc < 30 THEN RAISE EXCEPTION 'TARIFA-GUARD ABORT: proc_* = % (<30). Target no es staging. HARD STOP.', v_proc; END IF;
  IF v_als <> 1 THEN RAISE EXCEPTION 'TARIFA-GUARD ABORT: ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF NOT v_tar THEN RAISE EXCEPTION 'TARIFA-GUARD ABORT: proc_tarifa ausente. Aplicar schema_proc_v6_f6 antes. HARD STOP.'; END IF;
  RAISE NOTICE 'TARIFA-GUARD preflight OK. Creando trg_tarifa_guard…';
END
$pre$;

-- ── Trigger de estado-máquina ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_tarifa_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Tarifa anulada: inmutable (ningún campo editable).
  IF OLD.estado = 'anulada' THEN
    RAISE EXCEPTION 'tarifa % anulada: no editable', OLD.id;
  END IF;
  -- Sin cambio de estado → se permite (edición de metadatos no cubierta acá).
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
  -- Transiciones permitidas.
  IF NOT (
    (OLD.estado='vigente' AND NEW.estado IN ('cerrada','anulada')) OR
    (OLD.estado='cerrada' AND NEW.estado = 'anulada')
  ) THEN
    RAISE EXCEPTION 'transición de tarifa inválida: % → %', OLD.estado, NEW.estado;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tarifa_guard ON proc_tarifa;
CREATE TRIGGER trg_tarifa_guard BEFORE UPDATE ON proc_tarifa
  FOR EACH ROW EXECUTE FUNCTION proc_fn_tarifa_guard();

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
DECLARE v int;
BEGIN
  v := (SELECT count(*) FROM pg_trigger WHERE tgname='trg_tarifa_guard' AND NOT tgisinternal);
  IF v <> 1 THEN RAISE EXCEPTION 'TARIFA-GUARD POST FAIL: trigger ausente. ABORT.'; END IF;
  RAISE NOTICE 'TARIFA-GUARD POST OK: trg_tarifa_guard activo.';
END
$post$;

COMMIT;

-- ── NOTA de optimistic concurrency para cambiarEstadoTarifa ──────────────────
-- El trigger de arriba cierra las transiciones ILEGALES. Para cerrar además la decisión STALE
-- (dos usuarios sobre la misma tarifa), el PATCH del frontend debe llevar el token optimista:
--   procUpdate("proc_tarifa",
--     `?id=eq.${id}&empresa_id=eq.${e}&row_version=eq.${expected}`,
--     { estado, updated_by })   // + tratar 0 filas como CONFLICT (ver docs/frontend-plan)
-- No hace falta RPC dedicada acá: tarifa es de bajo volumen de contención y sin efectos
-- colaterales en el ledger. El PATCH optimista + el guard bastan.
