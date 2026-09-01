-- ============================================================================
-- 10_optimistic_token.sql — Capa 1: token de concurrencia optimista monotónico.
-- DRAFT. NO EJECUTAR. Carril B (diseño). Producción bywovqayuzodbzwsriet = HANDS-OFF.
-- TARGET de validación: STAGING gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik).
--
-- Agrega `row_version bigint NOT NULL DEFAULT 1` a las 6 superficies Class-B y un trigger
-- BEFORE UPDATE (`proc_fn_bump_version`) que hace NEW.row_version := OLD.row_version + 1 en
-- CADA update. Es el token que el frontend reenvía en el PATCH (&row_version=eq.<leido>) y que
-- los RPC de estado devuelven. Aditivo, con DEFAULT constante (metadata-only en PG11+),
-- backfillea filas existentes a 1. Idempotente (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE).
--
-- Alternativa cero-migración: NO aplicar este archivo y usar `updated_at` como token (ya rota vía
-- trg_touch). Ver README §Token. Los RPC 20/30 aceptan ambos (p_expected_version es bigint del
-- row_version; si se opta por updated_at, usar la variante comentada dentro de cada RPC).
--
-- ROLLBACK (no destructivo; columna aditiva sin semántica de negocio):
--   BEGIN;
--   DO $r$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['proc_orden_proceso','proc_despacho','proc_tarifa',
--                              'proc_base_cobro','proc_cliente_contrato'] LOOP
--       EXECUTE format('DROP TRIGGER IF EXISTS trg_bumpver_%1$s ON %1$s;', t);
--       EXECUTE format('ALTER TABLE %1$s DROP COLUMN IF EXISTS row_version;', t);
--     END LOOP; END $r$;
--   DROP FUNCTION IF EXISTS proc_fn_bump_version();
--   COMMIT;
-- ============================================================================
BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed; fingerprint staging con proc_* presente) ─
DO $pre$
DECLARE v_proc int; v_als int; v_main int; v_prod boolean;
BEGIN
  v_proc := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_als  := (SELECT count(*) FROM contab_empresas
               WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_main := (SELECT count(*) FROM calendario_data WHERE id='main');
  -- Producción NO tiene proc_* materializado; si faltara, el destino no es el staging esperado.
  IF v_proc < 30 THEN
    RAISE EXCEPTION 'TOKEN ABORT (ROLLBACK): proc_* = % (<30). Target NO es staging con proc_* (Producción no tiene proc_*). HARD STOP.', v_proc;
  END IF;
  IF v_als <> 1 THEN
    RAISE EXCEPTION 'TOKEN ABORT (ROLLBACK): ALS no exacto (% filas). Fingerprint staging no confirmado. HARD STOP.', v_als;
  END IF;
  IF v_main <> 1 THEN
    RAISE EXCEPTION 'TOKEN ABORT (ROLLBACK): calendario_data.main ausente. Destino sospechoso. HARD STOP.';
  END IF;
  -- Las 6 tablas Class-B deben existir para que la migración tenga sentido.
  IF to_regclass('public.proc_orden_proceso')   IS NULL
     OR to_regclass('public.proc_despacho')     IS NULL
     OR to_regclass('public.proc_tarifa')       IS NULL
     OR to_regclass('public.proc_base_cobro')   IS NULL
     OR to_regclass('public.proc_cliente_contrato') IS NULL THEN
    RAISE EXCEPTION 'TOKEN ABORT (ROLLBACK): falta alguna tabla Class-B. Aplicar schema_proc_v2..v8 antes. HARD STOP.';
  END IF;
  RAISE NOTICE 'TOKEN preflight OK: staging con proc_* + ALS + main confirmado. Materializando row_version…';
END
$pre$;

-- ── Función de bump (monotónica; corre además del trg_touch existente) ───────
CREATE OR REPLACE FUNCTION proc_fn_bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Blindaje: el cliente NO puede fijar row_version; lo controla el servidor (autoritativo).
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END $$;

-- ── Columna + trigger en cada superficie Class-B ─────────────────────────────
-- (proc_orden_proceso, proc_despacho: además cubiertas por RPC 20/30.
--  proc_tarifa, proc_base_cobro, proc_cliente_contrato: cubiertas por PATCH optimista.)
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_orden_proceso','proc_despacho','proc_tarifa','proc_base_cobro','proc_cliente_contrato'
  ] LOOP
    EXECUTE format('ALTER TABLE %1$s ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;', t);
    -- El trigger de bump debe correr DESPUÉS del touch por orden alfabético de nombre no importa
    -- (ambos BEFORE UPDATE, independientes: uno toca updated_at, otro row_version). Sin dependencia.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_bumpver_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_bumpver_%1$s BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION proc_fn_bump_version();', t);
  END LOOP;
END
$mig$;

-- ── POST-CHECK (fail-closed) ─────────────────────────────────────────────────
DO $post$
DECLARE t text; v_col int; v_trg int;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_orden_proceso','proc_despacho','proc_tarifa','proc_base_cobro','proc_cliente_contrato'
  ] LOOP
    v_col := (SELECT count(*) FROM information_schema.columns
                WHERE table_schema='public' AND table_name=t AND column_name='row_version');
    v_trg := (SELECT count(*) FROM pg_trigger
                WHERE tgname = format('trg_bumpver_%s', t) AND NOT tgisinternal);
    IF v_col <> 1 THEN RAISE EXCEPTION 'TOKEN POST FAIL: %.row_version ausente. ABORT.', t; END IF;
    IF v_trg <> 1 THEN RAISE EXCEPTION 'TOKEN POST FAIL: trg_bumpver_% ausente. ABORT.', t; END IF;
  END LOOP;
  RAISE NOTICE 'TOKEN POST OK: row_version + trg_bumpver en las 5 tablas. (La 6ª superficie, maestros vía actualizarMaestro, usa updated_at o su propio row_version según la tabla concreta.)';
END
$post$;

COMMIT;
