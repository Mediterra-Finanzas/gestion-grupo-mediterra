-- ============================================================================
--  schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql
--  ========================================================================
--  ⚠️  DEV / LOCAL UAT ONLY  —  NEVER APPLY TO PRODUCTION
--  ⚠️  NEVER INCLUDE IN PROD DEPLOY  —  NEVER RUN ON THE PROD SUPABASE PROJECT
--  ========================================================================
--
--  Puente de acceso DEV/UAT (F7.8.1-D). Única finalidad: permitir que la app
--  CURRENT, que opera como rol `anon` (no hay Supabase Auth — ver
--  docs/proceso-f7-8-1-identity-rls-gate.md), pueda LEER/ESCRIBIR proc_* durante
--  una sesión LOCAL controlada de revisión visual.
--
--  NO es seguridad real. NO resuelve el IDENTITY-STRUCTURAL-GAP. Es un bridge de
--  testing. La arquitectura TARGET (auth.uid + membership + tenant enforcement)
--  queda pendiente como CORE-IDENTITY-TENANCY-001, transversal a Mediterra One.
--
--  Reutiliza el patrón de los schema_proc_*_DEV_ONLY_rls.sql (política permisiva
--  + GRANT a anon), pero acotado con `TO anon`: la política estricta productiva
--  (empresa_id=proc_current_empresa(), aplicable a authenticated) NO se toca; se
--  AÑADE una política permisiva solo para el rol anon. Aplicar esto sobre una base
--  con la RLS estricta NO la elimina — solo abre anon en ESTE entorno.
--
--  ROLLBACK: correr la sección "-- ROLLBACK" del final (DROP policies pol_*_DEV_UAT
--  + REVOKE ... FROM anon). Deja la base exactamente como el schema productivo.
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  -- 1) Tablas base proc_*: política permisiva SOLO para anon + GRANT DML a anon.
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_UAT ON public.%1$s;', r.tablename);
    EXECUTE format('CREATE POLICY pol_%1$s_DEV_UAT ON public.%1$s AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);', r.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon;', r.tablename);
  END LOOP;

  -- 2) Read-models proc_v_* (security_invoker → basta GRANT SELECT a anon; la RLS
  --    de las tablas base ya la abre el paso 1 para anon en este entorno).
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname LIKE 'proc_v_%' LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon;', r.viewname);
  END LOOP;

  -- 3) RPC operacionales proc_fn_*: EXECUTE a anon (son SECURITY INVOKER → corren
  --    como anon, que ya tiene los grants del paso 1).
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname LIKE 'proc_fn_%' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon;', r.sig);
  END LOOP;
END $$;

-- Verificación rápida (debe imprimir >0 en las tres):
--   SELECT count(*) FROM pg_policies WHERE policyname LIKE 'pol_%_DEV_UAT';
--   SELECT has_table_privilege('anon','proc_recepcion','SELECT');
--   SELECT has_function_privilege('anon','proc_fn_centro_operaciones(uuid,uuid,text,date)','EXECUTE');

-- ============================================================================
-- ROLLBACK (deja la base idéntica al schema productivo):
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%' LOOP
--     EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_UAT ON public.%1$s;', r.tablename);
--     EXECUTE format('REVOKE ALL ON public.%I FROM anon;', r.tablename);
--   END LOOP;
--   FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname LIKE 'proc_v_%' LOOP
--     EXECUTE format('REVOKE ALL ON public.%I FROM anon;', r.viewname);
--   END LOOP;
--   FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' AND p.proname LIKE 'proc_fn_%' LOOP
--     EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;', r.sig);
--   END LOOP;
-- END $$;
-- ============================================================================
