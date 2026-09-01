-- ============================================================================
-- r4_rehearsal_setup.sql — Mock 1:1 del estado PRE-R4 para ensayo local (Docker proc_uat,
-- base r4_reh). Reproduce, sobre N tablas mock proc_*, la coexistencia:
--   · pol_<t>_empresa  (estricta: empresa_id = proc_current_empresa())  [tenant]
--   · pol_<t>_dev_uat  (AS PERMISSIVE FOR ALL TO anon USING(true) WITH CHECK(true))  [bridge R4]
--   · pol_proc_tipo_movimiento_cat (global read: FOR SELECT TO authenticated USING(true))
--   · GRANT anon (DML) + GRANT authenticated (SELECT,INSERT)  [bridge grants]
-- Replica proc_current_empresa()/iam resolver v2. NO toca staging/prod. Base scratch = r4_reh.
-- ============================================================================
\set ON_ERROR_STOP on

-- ── Identidad / membership (idéntico patrón a c_local_test_setup) ────────────
DROP TABLE IF EXISTS proc_lote CASCADE;
DROP TABLE IF EXISTS proc_recepcion CASCADE;
DROP TABLE IF EXISTS proc_tipo_movimiento CASCADE;
DROP TABLE IF EXISTS iam_usuario_empresa CASCADE;
DROP TABLE IF EXISTS iam_usuario CASCADE;
DROP TABLE IF EXISTS contab_empresas CASCADE;

CREATE TABLE contab_empresas (id uuid PRIMARY KEY, codigo text, nombre text);
INSERT INTO contab_empresas VALUES
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ALS','Allegria Service'),
 ('11111111-1111-1111-1111-111111111111','BET','Empresa B');

CREATE TABLE iam_usuario (
  id uuid PRIMARY KEY, nombre text, email text, activo boolean NOT NULL DEFAULT true,
  auth_user_id uuid);
CREATE UNIQUE INDEX ux_iam_usuario_auth_user_id ON iam_usuario(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE TABLE iam_usuario_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES iam_usuario(id),
  empresa_id uuid NOT NULL REFERENCES contab_empresas(id),
  activo boolean NOT NULL DEFAULT true,
  CONSTRAINT ux UNIQUE (usuario_id, empresa_id));

INSERT INTO iam_usuario (id,nombre,email,activo,auth_user_id) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Angelo','ahuerta@grupomediterra.cl',true,'a0000000-0000-0000-0000-0000000000a1'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','Carol','cmachuca@grupomediterra.cl',true,'c0000000-0000-0000-0000-0000000000c1');
INSERT INTO iam_usuario_empresa (usuario_id,empresa_id,activo) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5aa10886-2a76-4a9e-9bc3-303fb776cd49',true);  -- Angelo: single ALS

-- ── Resolver v2 (copia fiel de proc_rls_resolution_v2.sql) ───────────────────
CREATE OR REPLACE FUNCTION proc_current_iam_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT iu.id FROM iam_usuario iu
  WHERE iu.activo AND iu.auth_user_id = NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_iam uuid; v_req uuid; v_cnt int; v_one uuid;
BEGIN
  v_iam := proc_current_iam_user();
  IF v_iam IS NULL THEN RETURN NULL; END IF;
  v_req := NULLIF((current_setting('request.headers', true)::jsonb ->> 'x-proc-empresa'), '')::uuid;
  IF v_req IS NOT NULL THEN
    PERFORM 1 FROM iam_usuario_empresa m WHERE m.usuario_id=v_iam AND m.empresa_id=v_req AND m.activo;
    IF FOUND THEN RETURN v_req; ELSE RETURN NULL; END IF;
  END IF;
  SELECT count(*) INTO v_cnt FROM iam_usuario_empresa WHERE usuario_id=v_iam AND activo;
  IF v_cnt=1 THEN SELECT empresa_id INTO v_one FROM iam_usuario_empresa WHERE usuario_id=v_iam AND activo LIMIT 1; RETURN v_one; END IF;
  RETURN NULL;
END $$;

-- ── Roles ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- ── N tablas mock proc_* con AMBAS policies + grants (estado PRE-R4) ──────────
-- (a) tenant table proc_lote
CREATE TABLE proc_lote (id serial PRIMARY KEY, empresa_id uuid NOT NULL, dato text);
INSERT INTO proc_lote (empresa_id,dato) VALUES
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ALS-1'),
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ALS-2'),
 ('11111111-1111-1111-1111-111111111111','B-1');
-- (b) tenant table proc_recepcion
CREATE TABLE proc_recepcion (id serial PRIMARY KEY, empresa_id uuid NOT NULL, dato text);
INSERT INTO proc_recepcion (empresa_id,dato) VALUES
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','REC-ALS'),
 ('11111111-1111-1111-1111-111111111111','REC-B');
-- (c) global catalog proc_tipo_movimiento (estricta = _cat, no _empresa)
CREATE TABLE proc_tipo_movimiento (codigo text PRIMARY KEY, descripcion text);
INSERT INTO proc_tipo_movimiento VALUES ('entrada','Entrada'),('salida','Salida');

DO $s$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_lote','proc_recepcion'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    -- estricta tenant
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_empresa', t);
    EXECUTE format('CREATE POLICY %I ON public.%I USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa())', 'pol_'||t||'_empresa', t);
    -- bridge anon (lo que R4-A dropea)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true)', 'pol_'||t||'_dev_uat', t);
    -- grants: authenticated (productivo) + anon (bridge, lo que R4-B revoca)
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon;', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I_id_seq TO authenticated, anon;', t);
  END LOOP;
  -- global catalog
  ALTER TABLE public.proc_tipo_movimiento ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.proc_tipo_movimiento FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS pol_proc_tipo_movimiento_cat ON public.proc_tipo_movimiento;
  CREATE POLICY pol_proc_tipo_movimiento_cat ON public.proc_tipo_movimiento FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS pol_proc_tipo_movimiento_dev_uat ON public.proc_tipo_movimiento;
  CREATE POLICY pol_proc_tipo_movimiento_dev_uat ON public.proc_tipo_movimiento AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
  GRANT SELECT ON public.proc_tipo_movimiento TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.proc_tipo_movimiento TO anon;
END $s$;

-- Simula la app LEGADA: anon debe conservar acceso a calendario_data (NO-REGRESIÓN R4-B).
DROP TABLE IF EXISTS calendario_data CASCADE;
CREATE TABLE calendario_data (id text PRIMARY KEY, value jsonb);
INSERT INTO calendario_data VALUES ('main','{"usuarios":[]}'::jsonb);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendario_data TO anon;  -- app legada usa anon key

SELECT 'SETUP OK' AS status,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE '%_dev_uat') AS dev_uat,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_name LIKE 'proc\_%' ESCAPE '\') AS anon_proc_grants;
