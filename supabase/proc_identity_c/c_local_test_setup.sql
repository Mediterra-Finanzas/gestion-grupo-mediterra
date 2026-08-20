-- Setup local para probar Option C (RLS resolution v2). Scratch DB.
DROP TABLE IF EXISTS proc_lote CASCADE;
DROP TABLE IF EXISTS iam_usuario_empresa CASCADE;
DROP TABLE IF EXISTS iam_usuario CASCADE;
DROP TABLE IF EXISTS contab_empresas CASCADE;

CREATE TABLE contab_empresas (id uuid PRIMARY KEY, codigo text, nombre text);
INSERT INTO contab_empresas VALUES
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ALS','Allegria Service'),
 ('11111111-1111-1111-1111-111111111111','BET','Empresa B'),
 ('22222222-2222-2222-2222-222222222222','CET','Empresa C');

CREATE TABLE iam_usuario (
  id uuid PRIMARY KEY, nombre text, email text, activo boolean NOT NULL DEFAULT true,
  auth_user_id uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE iam_usuario_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES iam_usuario(id),
  empresa_id uuid NOT NULL REFERENCES contab_empresas(id),
  activo boolean NOT NULL DEFAULT true,
  CONSTRAINT ux UNIQUE (usuario_id, empresa_id)
);

-- Actores (iam id / auth_user_id):
--  Angelo  GA/AUA  single ALS
--  Multi   GM/AUM  ALS + B (dos activas)
--  Carol   GC/AUC  sin membership
--  Inact   GI/AUI  iam inactivo, membership ALS
--  Revoked GR/AUR  membership ALS inactiva
INSERT INTO iam_usuario (id,nombre,email,activo,auth_user_id) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Angelo','ahuerta@grupomediterra.cl',true,'a0000000-0000-0000-0000-0000000000a1'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Multi','multi@allegriaservice.com',true,'b0000000-0000-0000-0000-0000000000b1'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','Carol','cmachuca@grupomediterra.cl',true,'c0000000-0000-0000-0000-0000000000c1'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','Inact','inact@allegriaservice.com',false,'d0000000-0000-0000-0000-0000000000d1'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Revoked','rev@allegriaservice.com',true,'e0000000-0000-0000-0000-0000000000e1');

INSERT INTO iam_usuario_empresa (usuario_id,empresa_id,activo) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5aa10886-2a76-4a9e-9bc3-303fb776cd49',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','5aa10886-2a76-4a9e-9bc3-303fb776cd49',true),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111',true),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','5aa10886-2a76-4a9e-9bc3-303fb776cd49',true),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','5aa10886-2a76-4a9e-9bc3-303fb776cd49',false);

-- Tabla de negocio con RLS productiva (empresa_id = proc_current_empresa()).
CREATE TABLE proc_lote (id serial PRIMARY KEY, empresa_id uuid NOT NULL, dato text);
INSERT INTO proc_lote (empresa_id,dato) VALUES
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ALS-1'),
 ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','ALS-2'),
 ('11111111-1111-1111-1111-111111111111','B-1'),
 ('22222222-2222-2222-2222-222222222222','C-1');

-- role authenticated (como Supabase). anon revocado.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT ON proc_lote TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE proc_lote_id_seq TO authenticated;
REVOKE ALL ON proc_lote FROM anon;

ALTER TABLE proc_lote ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_lote FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_proc_lote_empresa ON proc_lote;
CREATE POLICY pol_proc_lote_empresa ON proc_lote
  USING (empresa_id = proc_current_empresa())
  WITH CHECK (empresa_id = proc_current_empresa());
