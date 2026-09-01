-- ============================================================================
-- 40_ms_g4_solape_exclude.sql
-- GAP-4 (B, hardening) — impide solape de rangos de temporada por empresa.
--
-- QUÉ HACE:
--   · CREATE EXTENSION btree_gist (necesaria para el '=' de uuid dentro del gist).
--   · Pre-check fail-closed: si YA existen rangos solapados por empresa, ABORTA y los lista
--     (no se puede crear la constraint sobre datos que ya la violan; corregir primero).
--   · Constraint de exclusión parcial: por empresa, dos temporadas no-anuladas/no-borradas
--     con fechas definidas no pueden tener rangos [fecha_inicio, fecha_fin] que se toquen.
--   Esto evita que temporadaDeFecha() reciba 'multiple' en runtime.
--
-- Rango: daterange(fecha_inicio, fecha_fin, '[]')  → ambos extremos inclusivos (una
--   temporada que termina el 30-jun y otra que empieza el 30-jun se consideran solapadas;
--   coherente con temporadaDeFecha que usa <= en ambos bordes).
-- Predicado: solo filas vivas y con fechas; 'anulada' y borradas se excluyen del chequeo.
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
  RAISE NOTICE 'GUARD OK (MS-G4): destino STAGING compatible.';
END $guard$;

-- ── PRE-CHECK: solapes existentes (fail-closed) ──────────────────────────────
DO $pre$
DECLARE v_dups int; v_ej text;
BEGIN
  SELECT count(*) INTO v_dups
    FROM proc_temporada a
    JOIN proc_temporada b
      ON a.empresa_id = b.empresa_id AND a.id < b.id
     AND a.deleted_at IS NULL AND b.deleted_at IS NULL
     AND a.estado <> 'anulada' AND b.estado <> 'anulada'
     AND a.fecha_inicio IS NOT NULL AND a.fecha_fin IS NOT NULL
     AND b.fecha_inicio IS NOT NULL AND b.fecha_fin IS NOT NULL
     AND daterange(a.fecha_inicio, a.fecha_fin, '[]') && daterange(b.fecha_inicio, b.fecha_fin, '[]');
  IF v_dups > 0 THEN
    SELECT string_agg(format('emp=%s [%s..%s]/%s ∩ [%s..%s]/%s', a.empresa_id, a.fecha_inicio, a.fecha_fin, a.codigo, b.fecha_inicio, b.fecha_fin, b.codigo), '; ')
      INTO v_ej
      FROM proc_temporada a JOIN proc_temporada b
        ON a.empresa_id=b.empresa_id AND a.id<b.id
       AND a.deleted_at IS NULL AND b.deleted_at IS NULL
       AND a.estado<>'anulada' AND b.estado<>'anulada'
       AND a.fecha_inicio IS NOT NULL AND a.fecha_fin IS NOT NULL
       AND b.fecha_inicio IS NOT NULL AND b.fecha_fin IS NOT NULL
       AND daterange(a.fecha_inicio,a.fecha_fin,'[]') && daterange(b.fecha_inicio,b.fecha_fin,'[]');
    RAISE EXCEPTION 'GUARD ABORT (MS-G4): % par(es) de temporadas solapadas. Corregir fechas/estados antes de crear la constraint. Ejemplos: %', v_dups, v_ej;
  END IF;
  RAISE NOTICE 'PRE-CHECK OK (MS-G4): sin solapes existentes.';
END $pre$;

-- ── EXTENSIÓN + CONSTRAINT ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE proc_temporada DROP CONSTRAINT IF EXISTS ex_proc_temporada_solape;
ALTER TABLE proc_temporada
  ADD CONSTRAINT ex_proc_temporada_solape
  EXCLUDE USING gist (
    empresa_id WITH =,
    daterange(fecha_inicio, fecha_fin, '[]') WITH &&
  )
  WHERE (deleted_at IS NULL AND estado <> 'anulada'
         AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL);

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ex_proc_temporada_solape' AND contype='x') THEN
    RAISE EXCEPTION 'POST-CHECK FAIL: constraint de exclusión ausente.';
  END IF;
  RAISE NOTICE 'POST-CHECK OK (MS-G4): ex_proc_temporada_solape activa.';
END $post$;

COMMIT;

-- ============================================================================
-- ROLLBACK EXACTO:
-- BEGIN;
--   ALTER TABLE proc_temporada DROP CONSTRAINT IF EXISTS ex_proc_temporada_solape;
--   -- btree_gist se deja instalada (inofensiva); si se quiere quitar y nada más la usa:
--   -- DROP EXTENSION IF EXISTS btree_gist;
-- COMMIT;
-- ============================================================================
-- NOTA DE REHEARSAL (Docker local):
--   1) Baseline + seed ALS/calendario_data.main.
--   2) Insertar 2 temporadas del MISMO empresa con rangos solapados → ejecutar este
--      script → debe ABORTAR en el PRE-CHECK listando el par.
--   3) Corregir fechas para que no solapen → ejecutar → GUARD/PRE/POST OK, COMMIT.
--   4) Intentar INSERT/UPDATE que genere solape → la constraint lo rechaza.
--   5) Borde inclusivo: fin=2026-06-30 y otra inicio=2026-06-30 → rechazado (esperado).
--   6) Revertir con ROLLBACK.
-- ============================================================================
