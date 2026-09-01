-- ============================================================================
-- 25_ms_g2_reapertura_rls_harden.sql — Hardening RLS de proc_temporada_reapertura_permiso.
-- DRAFT. Carril Temporadas. NO EJECUTAR remoto sin autorizacion. Prod = HANDS-OFF.
-- Correr DESPUES de 20_ms_g2_lifecycle_enforce.sql (que crea la tabla).
--
-- OBSERVACION (Carril C): la tabla se creo SIN RLS productiva. La otorga/consulta solo el RPC
-- proc_fn_reabrir_temporada (SECURITY DEFINER, bypassa RLS) y la administracion server-side; NINGUN
-- browser debe leerla/escribirla directo. Se endurece a deny-browser como el resto de tablas de
-- control (iam_*): ENABLE+FORCE RLS, REVOKE anon/authenticated, sin policy permisiva => deny-by-default
-- (service_role bypassa; el RPC DEFINER la lee como owner). Aditivo/reversible.
-- ============================================================================
BEGIN;
DO $pre$
DECLARE v_als int;
BEGIN
  -- tripwire staging (mismo patron que 20_): ALS con UUID exacto de staging
  v_als := (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  IF v_als <> 1 THEN RAISE EXCEPTION 'G2-RLS ABORT (ROLLBACK): ALS no exacto (no staging). HARD STOP.'; END IF;
  IF to_regclass('public.proc_temporada_reapertura_permiso') IS NULL THEN
    RAISE EXCEPTION 'G2-RLS ABORT (ROLLBACK): proc_temporada_reapertura_permiso ausente. Aplicar 20_ primero. HARD STOP.';
  END IF;
END $pre$;

ALTER TABLE proc_temporada_reapertura_permiso ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_temporada_reapertura_permiso FORCE ROW LEVEL SECURITY;
REVOKE ALL ON proc_temporada_reapertura_permiso FROM anon, authenticated;
-- sin policy permisiva => deny-by-default para anon/authenticated; service_role (bypass) y el RPC
-- SECURITY DEFINER (owner) siguen accediendo. (Cuando exista la capa AUTHZ, el otorgamiento de este
-- permiso migra a proc_has_capability('temporada.reabrir'/'usuarios.administrar') via RPC admin.)

DO $post$
BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.proc_temporada_reapertura_permiso'::regclass) THEN
    RAISE EXCEPTION 'G2-RLS POST FAIL: RLS/FORCE no activo.'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='proc_temporada_reapertura_permiso'
               AND grantee IN ('anon','authenticated')) THEN
    RAISE EXCEPTION 'G2-RLS POST FAIL: quedan grants anon/authenticated.'; END IF;
  RAISE NOTICE 'G2-RLS OK: proc_temporada_reapertura_permiso deny-browser (RLS+FORCE, sin grants anon/auth).';
END $post$;
COMMIT;
-- ── ROLLBACK ──
-- BEGIN; ALTER TABLE proc_temporada_reapertura_permiso NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE proc_temporada_reapertura_permiso DISABLE ROW LEVEL SECURITY;
--   -- (los grants anon/auth NO se restauran: nunca debieron existir). COMMIT;
-- ============================================================================
