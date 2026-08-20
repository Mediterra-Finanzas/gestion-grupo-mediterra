-- ============================================================================
-- 00_guard_precheck.sql — IAM-R1/R2 · GUARD FAIL-CLOSED + precheck (READ-ONLY).
-- Correr PRIMERO en el SQL Editor de gestion-mediterra-staging (ref nlvfjpwiecgrosjnwwik).
-- Si aborta, DETENER: no ejecutar R1/R2.
--
-- Fingerprint de target: en STAGING existe proc_* (materializado) y NO existe iam_*; en PRODUCCIÓN
-- (mediterra-calendario / bywovqayuzodbzwsriet) NO existe proc_*. ALS debe existir exacto en ambos,
-- pero proc_* presente + iam_* ausente identifica el staging limpio para IAM. Defensa en profundidad
-- (lado operador): confirmar en la barra que la URL contiene nlvfjpwiecgrosjnwwik y NO bywovqayuzodbzwsriet.
-- ============================================================================

-- Fingerprint visible
SELECT
  current_database()                                                             AS db,
  (SELECT count(*) FROM contab_empresas
     WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS')           AS als_exacto,
  (to_regclass('public.proc_recepcion')       IS NOT NULL)                       AS proc_presente_staging,
  (to_regclass('public.iam_usuario')          IS NOT NULL)                       AS iam_usuario_ya_existe,
  (to_regclass('public.iam_usuario_empresa')  IS NOT NULL)                       AS iam_ue_ya_existe,
  (SELECT count(*) FROM calendario_data WHERE id='main')                         AS main_presente,
  (SELECT count(*) FROM calendario_data)                                         AS calendario_filas;

-- Guard fail-closed
DO $$
DECLARE v_als int; v_proc boolean; v_iam boolean; v_main int;
BEGIN
  v_als  := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  v_proc := to_regclass('public.proc_recepcion') IS NOT NULL;
  v_iam  := to_regclass('public.iam_usuario') IS NOT NULL OR to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_main := (SELECT count(*) FROM calendario_data WHERE id='main');

  IF v_als <> 1 THEN
    RAISE EXCEPTION 'GUARD ABORT: ALS (5aa10886-…cd49 / codigo ALS) no existe exacto (count=%). Target incorrecto o Core no listo.', v_als;
  END IF;
  IF NOT v_proc THEN
    RAISE EXCEPTION 'GUARD ABORT: proc_* ausente (proc_recepcion). STAGING debe tener proc_*; PRODUCCIÓN no. Target sospechoso — verificar ref nlvfjpwiecgrosjnwwik.';
  END IF;
  IF v_iam THEN
    RAISE EXCEPTION 'GUARD ABORT: iam_usuario / iam_usuario_empresa ya existen. IAM ya materializado (inesperado antes de R1). STOP y revisar.';
  END IF;
  IF v_main <> 1 THEN
    RAISE EXCEPTION 'GUARD ABORT: calendario_data.main ausente (count=%). El seed R2 lo necesita.', v_main;
  END IF;

  RAISE NOTICE 'GUARD OK: ALS exacto=1, proc_* presente (staging), iam_* ausente, main presente. Proceder con IAM-R1.';
END $$;
