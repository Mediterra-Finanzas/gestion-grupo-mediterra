-- ============================================================================
-- H2-B_envases_force.sql — Hardening de las 2 tablas envases v10 que rompen la
-- convención FORCE. Objetivo H2-B (seguro, sin tocar grants/bridge): FORCE ROW LEVEL
-- SECURITY en proc_tipo_envase y proc_envase_movimiento (hoy solo ENABLE). Su policy
-- pol_<t>_empresa ya es estricta; FORCE cierra el owner-bypass y unifica la postura de F1-F6.
-- NO forzar proc_tipo_movimiento (catálogo GLOBAL read-only, USING(true) intencional, anon ya revocado).
--
-- FORCE es INOCUO para la app: los RPC son SECURITY INVOKER (corren como authenticated, no owner),
-- así que ya estaban sujetos a RLS; FORCE solo afecta al OWNER (postgres) en DML directo, que la app
-- no hace. Reversible. TARGET: staging. Producción HANDS-OFF.
--
-- ── NO INCLUIDO AQUÍ (sub-gate H2-B2, decisión aparte) ──
-- El REVOKE anon de estos 2 objetos NO va en H2-B porque el bridge _DEV_UAT (visual_uat) TAMBIÉN
-- otorga anon sobre TODAS las proc_% (incl. estas 2). En Postgres los grants no se atribuyen a su
-- origen → un REVOKE ALL ... FROM anon borraría tanto el grant del schema v10 (e1:35/e2:57) como el
-- del bridge → adelantaría R4 para estas 2 tablas. Se difiere al gate R4 (limpieza anon global).
-- El REVOKE queda documentado abajo, NO ejecutado.
--
-- ROLLBACK H2-B: ALTER TABLE ... NO FORCE ROW LEVEL SECURITY (ver al final).
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
DO $b$
DECLARE v_te boolean; v_em boolean; v_tm_anon int;
BEGIN
  IF to_regclass('public.proc_tipo_envase') IS NULL OR to_regclass('public.proc_envase_movimiento') IS NULL
     THEN RAISE EXCEPTION 'H2-B ABORT: tablas envases ausentes (no staging).'; END IF;
  -- confirmar que ya tienen su _empresa estricta antes de forzar
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='proc_tipo_envase' AND policyname='pol_proc_tipo_envase_empresa')
     THEN RAISE EXCEPTION 'H2-B ABORT: proc_tipo_envase sin _empresa.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='proc_envase_movimiento' AND policyname='pol_proc_envase_movimiento_empresa')
     THEN RAISE EXCEPTION 'H2-B ABORT: proc_envase_movimiento sin _empresa.'; END IF;

  ALTER TABLE public.proc_tipo_envase       FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.proc_envase_movimiento FORCE ROW LEVEL SECURITY;

  -- POST
  v_te := (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_tipo_envase'::regclass);
  v_em := (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.proc_envase_movimiento'::regclass);
  IF NOT (v_te AND v_em) THEN RAISE EXCEPTION 'H2-B POST FAIL: FORCE no aplicado (te=%, em=%).', v_te, v_em; END IF;
  RAISE NOTICE 'H2-B OK: FORCE RLS en proc_tipo_envase y proc_envase_movimiento. (REVOKE anon → R4, no aquí.)';
END $b$;
COMMIT;

-- ── H2-B2 (SUB-GATE, NO EJECUTAR AQUÍ — decisión + R4) ──────────────────────
-- Justificación: toca el bridge anon para estas 2 tablas. Correr solo dentro de R4.
--   REVOKE ALL ON public.proc_tipo_envase       FROM anon;
--   REVOKE ALL ON public.proc_envase_movimiento FROM anon;

-- ── ROLLBACK H2-B ──
--   BEGIN;
--   ALTER TABLE public.proc_tipo_envase       NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.proc_envase_movimiento NO FORCE ROW LEVEL SECURITY;
--   COMMIT;
