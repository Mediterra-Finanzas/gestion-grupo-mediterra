-- ============================================================================
-- 50_ledger_idempotencia_schema.sql
-- CONC-B (ledger append-only) · Cambios de ESQUEMA para idempotencia + guarda de reversa única.
-- DRAFT. Carril 3 (concurrencia). NO EJECUTAR remoto. Producción bywovqayuzodbzwsriet = HANDS-OFF.
-- TARGET real de validación: STAGING gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik).
-- Rehearsal LOCAL: DB aislada conc_reh (Docker proc_uat), con SET conc.rehearsal='1'.
--
-- Cierra dos huecos de concurrencia sobre proc_movimiento (ledger append-only, schema_proc_v1):
--
--   (I) IDEMPOTENCIA DE LEDGER — hoy transaccion_id NO es UNIQUE. Un retry de red re-inserta
--       la misma línea → filas de ledger duplicadas → efecto duplicado (doble consumo/ingreso).
--
--       DECISIÓN CLAVE (hallazgo del carril): NO se puede imponer UNIQUE(transaccion_id) ni
--       UNIQUE(transaccion_id, objeto_tipo, objeto_id, naturaleza). Motivo: proc_fn_confirmar_despacho
--       (v4_f4) y proc_fn_repaletizar (v3_f3) emiten VARIAS filas de ledger bajo UN transaccion_id
--       generado internamente, y el MISMO pallet puede aparecer 2+ veces como 'salida' en un mismo
--       despacho/repaletizaje (loop por línea). Esos índices rechazarían operaciones legítimas.
--       => Se adopta una clave de idempotencia EXPLÍCITA y OPT-IN: columna idempotency_key.
--          - Es NULL por defecto → comportamiento actual intacto (los loops NO la setean).
--          - El caller que quiera retry-safety pasa una clave estable (recepción/consumo/ajuste/reversa).
--          - Índice UNIQUE PARCIAL (WHERE idempotency_key IS NOT NULL) → cuida los NULL legacy.
--
--   (II) CONC-B3 (reversa única) — hoy proc_fn_reversar_movimiento no impide reversar dos veces el
--        mismo movimiento → doble contramovimiento → efecto duplicado. Backstop a nivel DB:
--        índice UNIQUE PARCIAL (empresa_id, revierte_movimiento_id) WHERE es_reversa → 1 reversa/orig.
--
-- Aditivo, idempotente y reversible. Pre-check fail-closed: si ya existieran datos que violan los
-- UNIQUE (dups de idempotency_key o de reversa), ABORTA antes de crear el índice (no rompe a ciegas).
--
-- ROLLBACK: ver 99_rollback.sql (DROP de índices + DROP COLUMN idempotency_key). No destructivo.
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed) ─────────────────────────────────────────
-- Dos modos: STAGING (fingerprint proc_*+ALS+main) o REHEARSAL (DB aislada, jamás prod/staging).
DO $pre$
DECLARE v_reh text; v_marker int; v_proc int; v_als int; v_main int;
BEGIN
  v_reh := current_setting('conc.rehearsal', true);
  IF v_reh = '1' THEN
    v_marker := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='_conc_rehearsal_ok');
    IF v_marker <> 1 THEN
      RAISE EXCEPTION 'CONC50 REHEARSAL ABORT (ROLLBACK): falta marcador _conc_rehearsal_ok. HARD STOP.';
    END IF;
    -- Cinturón anti-prod/staging: ambos tienen calendario_data; el rehearsal NO.
    IF to_regclass('public.calendario_data') IS NOT NULL THEN
      RAISE EXCEPTION 'CONC50 REHEARSAL ABORT (ROLLBACK): calendario_data presente → destino parece prod/staging. HARD STOP.';
    END IF;
    RAISE NOTICE 'CONC50 preflight REHEARSAL OK (DB aislada).';
  ELSE
    v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
    IF v_proc < 30 THEN
      RAISE EXCEPTION 'CONC50 ABORT (ROLLBACK): proc_* = % (<30). Target NO es staging con proc_*. HARD STOP.', v_proc;
    END IF;
    v_als := (SELECT count(*) FROM contab_empresas
                WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
    IF v_als <> 1 THEN
      RAISE EXCEPTION 'CONC50 ABORT (ROLLBACK): ALS no exacto (% filas). Fingerprint staging no confirmado. HARD STOP.', v_als;
    END IF;
    v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
    IF v_main <> 1 THEN
      RAISE EXCEPTION 'CONC50 ABORT (ROLLBACK): calendario_data.main ausente. Destino sospechoso. HARD STOP.';
    END IF;
    IF to_regclass('public.proc_movimiento') IS NULL THEN
      RAISE EXCEPTION 'CONC50 ABORT (ROLLBACK): falta proc_movimiento. Aplicar schema_proc_v1 antes. HARD STOP.';
    END IF;
    RAISE NOTICE 'CONC50 preflight STAGING OK: proc_* + ALS + main confirmados.';
  END IF;
END
$pre$;

-- ── (I) Columna idempotency_key (aditiva, NULL por defecto = no dedupe) ───────
ALTER TABLE proc_movimiento ADD COLUMN IF NOT EXISTS idempotency_key text;

-- ── Pre-check fail-closed: no crear UNIQUE sobre datos ya duplicados ──────────
DO $chk$
DECLARE v_dup_idem int; v_dup_rev int;
BEGIN
  v_dup_idem := (
    SELECT COALESCE(count(*),0) FROM (
      SELECT empresa_id, idempotency_key
      FROM proc_movimiento
      WHERE idempotency_key IS NOT NULL
      GROUP BY empresa_id, idempotency_key HAVING count(*) > 1
    ) d);
  IF v_dup_idem > 0 THEN
    RAISE EXCEPTION 'CONC50 ABORT (ROLLBACK): % clave(s) idempotency_key duplicadas ya presentes. Deduplicar antes de crear el UNIQUE. HARD STOP.', v_dup_idem;
  END IF;

  v_dup_rev := (
    SELECT COALESCE(count(*),0) FROM (
      SELECT empresa_id, revierte_movimiento_id
      FROM proc_movimiento
      WHERE es_reversa = true AND revierte_movimiento_id IS NOT NULL
      GROUP BY empresa_id, revierte_movimiento_id HAVING count(*) > 1
    ) d);
  IF v_dup_rev > 0 THEN
    RAISE EXCEPTION 'CONC50 ABORT (ROLLBACK): % movimiento(s) con doble reversa YA existentes (CONC-B3 histórico). Conciliar antes de crear el UNIQUE. HARD STOP.', v_dup_rev;
  END IF;
  RAISE NOTICE 'CONC50 pre-check OK: sin duplicados de idempotency_key ni de reversa.';
END
$chk$;

-- ── UNIQUE parciales (cuidan NULL) ───────────────────────────────────────────
-- (I) idempotencia retry-safe: una clave explícita = a lo más una fila de ledger por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_proc_mov_idem
  ON proc_movimiento (empresa_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- (II) CONC-B3 backstop: a lo más una reversa por movimiento original.
CREATE UNIQUE INDEX IF NOT EXISTS ux_proc_mov_reversa_unica
  ON proc_movimiento (empresa_id, revierte_movimiento_id)
  WHERE es_reversa = true;

-- ── POST-CHECK (fail-closed) ─────────────────────────────────────────────────
DO $post$
DECLARE v_col int; v_ix_idem int; v_ix_rev int;
BEGIN
  v_col := (SELECT count(*) FROM information_schema.columns
              WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key');
  v_ix_idem := (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_idem');
  v_ix_rev  := (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica');
  IF v_col <> 1 THEN RAISE EXCEPTION 'CONC50 POST FAIL: idempotency_key ausente. ABORT.'; END IF;
  IF v_ix_idem <> 1 THEN RAISE EXCEPTION 'CONC50 POST FAIL: ux_proc_mov_idem ausente. ABORT.'; END IF;
  IF v_ix_rev  <> 1 THEN RAISE EXCEPTION 'CONC50 POST FAIL: ux_proc_mov_reversa_unica ausente. ABORT.'; END IF;
  RAISE NOTICE 'CONC50 POST OK: columna + 2 índices UNIQUE parciales materializados.';
END
$post$;

COMMIT;
