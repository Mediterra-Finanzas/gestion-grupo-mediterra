-- ============================================================================
-- schema_iam_v1.sql — IAM (Identity & Access Management). Bounded context transversal.
--
-- Provee la IDENTIDAD ESTABLE de usuario (iam_usuario.id = UUID persistente = JWT `sub` = actor
-- de auditoría) y la MEMBRESÍA autoritativa usuario↔empresa (iam_usuario_empresa), que el endpoint
-- de minteo (server-side, service_role) consulta para decidir si emite un JWT authenticated con
-- un empresa_id dado. NO es Contabilidad (por eso prefijo iam_, no contab_). La empresa autoritativa
-- sigue siendo contab_empresas (FK); NO se duplican empresas.
--
-- Seguridad: iam_* NO se expone al browser. RLS ENABLE+FORCE, REVOKE anon Y authenticated →
-- sólo el server (service_role, que bypassa RLS) lee/escribe. La identidad se resuelve server-side.
-- PREREQUISITO: contab_empresas (Company Source of Truth) debe existir.
-- ============================================================================

-- touch propio del contexto IAM (no cross-depende de proc_fn_touch)
CREATE OR REPLACE FUNCTION iam_fn_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ── iam_usuario — identidad estable (fuente de verdad del user_id) ────────────
CREATE TABLE IF NOT EXISTS iam_usuario (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  email       text,                                   -- natural key de migración; puede faltar en legado
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Unicidad de email case/space-insensitive SIN depender de citext (no asumir la extensión).
-- Sólo aplica a emails presentes/no vacíos (usuarios legados sin email no colisionan entre sí).
CREATE UNIQUE INDEX IF NOT EXISTS ux_iam_usuario_email_norm
  ON iam_usuario (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE INDEX IF NOT EXISTS ix_iam_usuario_activo ON iam_usuario (activo) WHERE activo;

DROP TRIGGER IF EXISTS trg_touch_iam_usuario ON iam_usuario;
CREATE TRIGGER trg_touch_iam_usuario BEFORE UPDATE ON iam_usuario
  FOR EACH ROW EXECUTE FUNCTION iam_fn_touch();

-- ── iam_usuario_empresa — membresía autoritativa (¿puede el usuario actuar en la empresa?) ──
CREATE TABLE IF NOT EXISTS iam_usuario_empresa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES iam_usuario(id),
  empresa_id  uuid NOT NULL REFERENCES contab_empresas(id),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_iam_usuario_empresa UNIQUE (usuario_id, empresa_id)   -- no duplicados; soft-disable vía activo
);
CREATE INDEX IF NOT EXISTS ix_iam_ue_usuario ON iam_usuario_empresa (usuario_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_iam_ue_empresa ON iam_usuario_empresa (empresa_id) WHERE activo;

DROP TRIGGER IF EXISTS trg_touch_iam_usuario_empresa ON iam_usuario_empresa;
CREATE TRIGGER trg_touch_iam_usuario_empresa BEFORE UPDATE ON iam_usuario_empresa
  FOR EACH ROW EXECUTE FUNCTION iam_fn_touch();

-- ── RLS: iam_* es server-only (deny browser). service_role (server) bypassa RLS. ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iam_usuario','iam_usuario_empresa'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    -- Sin policy permisiva → deny-all para roles no-superuser. Y revocamos grants explícitos.
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON %I FROM authenticated;', t);
  END LOOP;
END $$;
