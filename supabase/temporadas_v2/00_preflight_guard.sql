-- ============================================================================
-- 00_preflight_guard.sql — GUARD FAIL-CLOSED de destino (Temporadas v2)
--
-- CANÓNICO / REFERENCIA. Este archivo NO muta nada: solo define el fingerprint
-- estructural de STAGING y aborta si no coincide. La MISMA lógica va EMBEBIDA al
-- inicio de cada script mutante (10/20/30/40) — no se depende de \i include.
--
-- Diferencia con _staging_target_guard.sql (identity bridge): aquel exigía STAGING
-- LIMPIO (proc_* = 0, contab_empresas = 0). Temporadas v2 corre SOBRE el baseline YA
-- materializado, así que el fingerprint es POSITIVO (exige que exista el baseline) y a
-- la vez ANTI-PRODUCCIÓN (exige el tenant ALS con el UUID exacto que solo existe en
-- STAGING nlvfjpwiecgrosjnwwik; en PRODUCCIÓN bywovqayuzodbzwsriet el id de ALS es otro).
--
-- STAGING objetivo    = gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik)
-- PRODUCCIÓN prohibida = mediterra-calendario     (ref bywovqayuzodbzwsriet)  ← NUNCA
--
-- Fingerprint estructural (TODAS deben cumplirse, si no → GUARD ABORT):
--   1) baseline proc_* materializado: proc_temporada + proc_correlativo + proc_movimiento
--   2) capa app presente: calendario_data con fila id='main'
--   3) tenant piloto ALS con UUID EXACTO de staging + codigo 'ALS'
--      (5aa10886-2a76-4a9e-9bc3-303fb776cd49)
--
-- No se usa current_database()/nombre de proyecto como prueba (engañable). Solo estado real.
-- Defensa en profundidad (operador): antes de ejecutar, confirmar en la barra de Supabase
-- ref = nlvfjpwiecgrosjnwwik y que la connection string NO contiene bywovqayuzodbzwsriet.
-- ============================================================================

DO $guard$
DECLARE
  v_als_id CONSTANT uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_baseline_ok boolean;
  v_calendario_ok boolean;
  v_als_ok boolean;
BEGIN
  v_baseline_ok :=
        to_regclass('public.proc_temporada')   IS NOT NULL
    AND to_regclass('public.proc_correlativo')  IS NOT NULL
    AND to_regclass('public.proc_movimiento')   IS NOT NULL;

  IF NOT v_baseline_ok THEN
    RAISE EXCEPTION 'GUARD ABORT: baseline proc_* incompleto (falta proc_temporada/proc_correlativo/proc_movimiento). Temporadas v2 exige el baseline materializado. Destino no compatible.';
  END IF;

  v_calendario_ok := (to_regclass('public.calendario_data') IS NOT NULL);
  IF v_calendario_ok THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.calendario_data WHERE id = ''main'')' INTO v_calendario_ok;
  END IF;
  IF NOT v_calendario_ok THEN
    RAISE EXCEPTION 'GUARD ABORT: no existe calendario_data.main. El fingerprint de STAGING no coincide. Abortando fail-closed.';
  END IF;

  IF to_regclass('public.contab_empresas') IS NULL THEN
    RAISE EXCEPTION 'GUARD ABORT: contab_empresas no existe; sin tenant ALS no se puede verificar STAGING. Abortando.';
  END IF;
  EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM public.contab_empresas WHERE id = %L AND codigo = %L)',
    v_als_id, 'ALS'
  ) INTO v_als_ok;
  IF NOT v_als_ok THEN
    RAISE EXCEPTION 'GUARD ABORT: no existe el tenant ALS con UUID % (codigo ALS). Ese UUID solo existe en STAGING nlvfjpwiecgrosjnwwik; su ausencia sugiere PRODUCCIÓN u otro entorno. Abortando fail-closed.', v_als_id;
  END IF;

  RAISE NOTICE 'GUARD OK (Temporadas v2): baseline proc_* + calendario_data.main + tenant ALS % presente → compatible con STAGING. Continuar.', v_als_id;
END $guard$;
