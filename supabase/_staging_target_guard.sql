-- ============================================================================
-- _staging_target_guard.sql — GUARD FAIL-CLOSED de destino. Se ejecuta PRIMERO, antes de
-- cualquier migración. ABORTA la transacción si el destino NO parece el STAGING limpio esperado.
--
-- STAGING objetivo   = gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik)
-- PRODUCCIÓN prohibida = mediterra-calendario     (ref bywovqayuzodbzwsriet)  ← NUNCA
--
-- Fingerprint (evidencia del discovery del CFO): en STAGING limpio, contab_empresas = 0 filas
-- (de hecho la tabla aún no existe). En PRODUCCIÓN, contab_empresas EXISTE y está poblada
-- (contiene el tenant ALS y los demás). Por eso: si contab_empresas ya existe CON datos → es
-- producción (o un destino no-limpio) → ABORT. El nombre visible del proyecto NO se usa como
-- prueba (puede engañar); se usa el estado real del esquema.
--
-- Defensa en profundidad (lado operador, fuera de SQL): antes de pegar/ejecutar, confirmar en la
-- barra de Supabase que el proyecto es gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik) y que
-- la connection string NO contiene bywovqayuzodbzwsriet.
-- ============================================================================

DO $$
DECLARE
  v_contab_existe boolean;
  v_contab_filas  bigint := 0;
  v_proc_existe   boolean;
BEGIN
  v_contab_existe := to_regclass('public.contab_empresas') IS NOT NULL;
  v_proc_existe   := to_regclass('public.proc_recepcion')  IS NOT NULL;

  IF v_contab_existe THEN
    EXECUTE 'SELECT count(*) FROM public.contab_empresas' INTO v_contab_filas;
  END IF;

  -- 1) Producción tiene contab_empresas poblada → ABORT (fail-closed).
  IF v_contab_existe AND v_contab_filas > 0 THEN
    RAISE EXCEPTION
      'GUARD ABORT: contab_empresas ya existe con % fila(s). El STAGING limpio esperado tiene contab_empresas = 0. Destino sospechoso de ser PRODUCCIÓN u otro entorno no-limpio. Verifica el ref del proyecto (esperado nlvfjpwiecgrosjnwwik).',
      v_contab_filas;
  END IF;

  -- 2) proc_* ya materializado → este destino no está limpio para la cadena completa → ABORT.
  IF v_proc_existe THEN
    RAISE EXCEPTION
      'GUARD ABORT: proc_* ya existe en este destino (proc_recepcion presente). El manifest asume STAGING limpio (proc_* = 0). Revisar antes de reaplicar.';
  END IF;

  RAISE NOTICE 'GUARD OK: destino sin contab_empresas poblada y sin proc_* → compatible con STAGING limpio. Continuar.';
END $$;
