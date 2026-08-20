-- ============================================================================
-- 00_preflight_staging_hardened.sql — PRE-FLIGHT STAGING (READ-ONLY, fail-closed).
-- PROC-IDENTITY-PROD-001 · IAM · micro-gate 1 de 5.
--
-- Objetivo: confirmar INEQUÍVOCAMENTE que el target es el staging correcto
-- (gestion-mediterra-staging / nlvfjpwiecgrosjnwwik) y que seguimos en estado PRE-IAM.
-- NO crea, NO altera, NO borra nada. Solo lee + un DO block que ABORTA si algo no cuadra.
--
-- NO usa current_database() como gate (Supabase devuelve 'postgres' en ambos entornos).
-- Gate = fingerprints ESTRUCTURALES que Producción (bywovqayuzodbzwsriet) NO tiene:
--   · baseline proc_* materializado (anchors + piso de conteo)
--   · bridge DEV_ONLY presente (políticas pol_proc_%_DEV_ONLY + grants a anon sobre proc_*)
--   · ALS exacto (UUID + codigo)
--   · calendario_data.main presente
--   · iam_* AÚN ausente (etapa PRE-IAM)
--
-- INVARIANTE: GUARD ABORT = HARD STOP. Si este preflight aborta, DETENER. No correr R1/R2.
-- Antes de ejecutar: confirmá en la barra del navegador que la URL contiene
-- nlvfjpwiecgrosjnwwik y NO bywovqayuzodbzwsriet.
-- ============================================================================

-- ── Q1 · Fingerprint visible (una fila) ─────────────────────────────────────
WITH anchors(t) AS (
  VALUES ('proc_recepcion'),('proc_lote'),('proc_movimiento'),('proc_audit_log'),
         ('proc_planta'),('proc_temporada'),('proc_empresa_config'),
         ('proc_pallet'),('proc_despacho'),('proc_correlativo'),
         ('proc_especie'),('proc_cliente_contrato')
)
SELECT
  current_database()                                                              AS db_info_no_es_gate,
  (SELECT count(*) FROM contab_empresas
     WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS')            AS als_exacto,            -- esperado 1
  (SELECT count(*) FROM anchors a
     WHERE to_regclass('public.'||a.t) IS NOT NULL)                              AS proc_anchors_presentes, -- esperado 12
  (SELECT count(*) FROM anchors)                                                  AS proc_anchors_totales,   -- 12
  (SELECT count(*) FROM pg_tables
     WHERE schemaname='public' AND tablename LIKE 'proc_%')                       AS proc_tablas_totales,    -- >= 30 en staging; 0 en prod
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND policyname LIKE 'pol_proc_%_DEV_ONLY')         AS bridge_policies,        -- > 0 en staging
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon') AS bridge_anon_grants,     -- > 0 en staging
  (SELECT count(*) FROM calendario_data WHERE id='main')                          AS main_presente,          -- esperado 1
  (SELECT count(*) FROM calendario_data)                                          AS calendario_filas,       -- baseline (informativo)
  (to_regclass('public.iam_usuario')         IS NOT NULL)                         AS iam_usuario_ya_existe,   -- esperado false (PRE-IAM)
  (to_regclass('public.iam_usuario_empresa') IS NOT NULL)                         AS iam_ue_ya_existe;        -- esperado false (PRE-IAM)

-- ── Q2 · Preflight fail-closed. Aborta con motivo si CUALQUIER condición no cuadra. ──
DO $preflight$
DECLARE
  v_als       int;
  v_anchors   int;
  v_anchtot   int;
  v_proc_tot  int;
  v_bpol      int;
  v_bgrant    int;
  v_main      int;
  v_iam       boolean;
BEGIN
  v_als := (SELECT count(*) FROM contab_empresas
              WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');

  SELECT
    count(*) FILTER (WHERE to_regclass('public.'||t) IS NOT NULL),
    count(*)
  INTO v_anchors, v_anchtot
  FROM (VALUES ('proc_recepcion'),('proc_lote'),('proc_movimiento'),('proc_audit_log'),
               ('proc_planta'),('proc_temporada'),('proc_empresa_config'),
               ('proc_pallet'),('proc_despacho'),('proc_correlativo'),
               ('proc_especie'),('proc_cliente_contrato')) AS a(t);

  v_proc_tot := (SELECT count(*) FROM pg_tables
                   WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bpol     := (SELECT count(*) FROM pg_policies
                   WHERE schemaname='public' AND policyname LIKE 'pol_proc_%_DEV_ONLY');
  v_bgrant   := (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_main     := (SELECT count(*) FROM calendario_data WHERE id='main');
  v_iam      := to_regclass('public.iam_usuario') IS NOT NULL
             OR to_regclass('public.iam_usuario_empresa') IS NOT NULL;

  -- Anti-Producción estructural (prod no tiene proc_*): si faltan anchors o el bridge, NO es staging.
  IF v_anchors <> v_anchtot THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: baseline proc_* incompleto (% de % anchors). Target NO es el staging esperado (Producción no tiene proc_*). HARD STOP.', v_anchors, v_anchtot;
  END IF;
  IF v_proc_tot < 30 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: solo % tablas proc_* (esperado >=30). Baseline sospechoso. HARD STOP.', v_proc_tot;
  END IF;
  -- Bridge DEV_ONLY: la señal confiable son los GRANTS a anon sobre proc_* (las políticas
  -- pol_proc_%_DEV_ONLY pueden no existir con ese nombre en staging → informativas, no gate).
  -- Producción no tiene tablas proc_* → cero grants a anon sobre proc_* necesariamente.
  IF v_bgrant < 1 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: bridge DEV_ONLY ausente (anon_grants sobre proc_*=%, policies=%). Producción no lo tiene → target sospechoso. HARD STOP.', v_bgrant, v_bpol;
  END IF;
  IF v_als <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: ALS (5aa10886-…cd49 / codigo ALS) no exacto (count=%). Core no listo o target incorrecto. HARD STOP.', v_als;
  END IF;
  IF v_main <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: calendario_data.main ausente (count=%). El seed R2 lo necesita. HARD STOP.', v_main;
  END IF;
  -- Etapa PRE-IAM: iam_* debe estar AÚN ausente. Si ya existe, no reejecutar R1 sobre él.
  IF v_iam THEN
    RAISE EXCEPTION 'PREFLIGHT ABORT: iam_usuario/iam_usuario_empresa YA existen. No estamos en PRE-IAM (rollback prod incompleto o R1 ya corrido). HARD STOP y revisar.';
  END IF;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'STAGING TARGET VERIFIED (preflight) = YES';
  RAISE NOTICE '  ALS exacto=1 · proc anchors=%/% · proc_* tablas=% · bridge(pol=%, anon=%) · main=1 · iam_* ausente',
               v_anchors, v_anchtot, v_proc_tot, v_bpol, v_bgrant;
  RAISE NOTICE '  Estado PRE-IAM confirmado. Próximo micro-gate: IAM-R1 (esperar autorización).';
  RAISE NOTICE '===========================================================';
END
$preflight$;
