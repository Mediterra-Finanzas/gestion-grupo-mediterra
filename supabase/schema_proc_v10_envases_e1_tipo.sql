-- ============================================================================
-- schema_proc_v10_envases_e1_tipo.sql
-- PROC-ENVASES-001 · E1 — Catálogo de Tipos de Envase retornable.
-- Tenant-scoped, RLS strict (empresa_id = proc_current_empresa()), auditado, soft-delete.
-- Configurable: no hardcodea BIN/TOTE/REJILLA (seeds DEV aparte). Control por CANTIDAD (ENV-D1);
-- el modelo puede evolucionar a serialización futura sin romper el ledger, pero NO serializa ahora.
-- Alcance: Allegria Service / proc_*. No toca Frisku/frisku_*, Foods/exp_*, Osiris, main.
-- ============================================================================

CREATE TABLE IF NOT EXISTS proc_tipo_envase (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL,
  codigo                 text NOT NULL,
  nombre                 text NOT NULL,
  categoria              text,                              -- opcional (agrupación libre)
  unidad                 text NOT NULL DEFAULT 'unidad',    -- unidad de control (cantidad)
  capacidad_referencial  numeric CHECK (capacidad_referencial IS NULL OR capacidad_referencial > 0),
  retornable             boolean NOT NULL DEFAULT true,
  activo                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  deleted_at             timestamptz,
  CONSTRAINT proc_tipo_envase_empresa_id_codigo_key UNIQUE (empresa_id, codigo)
);

ALTER TABLE proc_tipo_envase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_proc_tipo_envase_empresa ON proc_tipo_envase;
CREATE POLICY pol_proc_tipo_envase_empresa ON proc_tipo_envase FOR ALL
  USING (empresa_id = proc_current_empresa())
  WITH CHECK (empresa_id = proc_current_empresa());

GRANT SELECT, INSERT, UPDATE, DELETE ON proc_tipo_envase TO anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_proc_tipo_envase ON proc_tipo_envase;
CREATE TRIGGER trg_touch_proc_tipo_envase BEFORE UPDATE ON proc_tipo_envase
  FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();

DROP TRIGGER IF EXISTS trg_audit_proc_tipo_envase ON proc_tipo_envase;
CREATE TRIGGER trg_audit_proc_tipo_envase AFTER INSERT OR DELETE OR UPDATE ON proc_tipo_envase
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();
