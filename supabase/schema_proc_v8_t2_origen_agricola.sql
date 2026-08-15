-- ============================================================================
-- schema_proc_v8_t2_origen_agricola.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T2
-- Productor (extensión) + Predio (extensión) + Cuartel (nuevo). Aditivo.
-- D2: productor sigue en proc_vinculo; se agregan rut/csg_sag (identidad).
-- D5: proc_cuartel pertenece a predio; especie/variedad default con integridad.
-- ============================================================================

-- ── Productor: atributos de identidad en proc_vinculo (nullable, aditivo) ────
ALTER TABLE proc_vinculo ADD COLUMN IF NOT EXISTS rut text;
ALTER TABLE proc_vinculo ADD COLUMN IF NOT EXISTS csg_sag text;

-- ── Predio: extender proc_predios (nullable, aditivo) ───────────────────────
ALTER TABLE proc_predios ADD COLUMN IF NOT EXISTS csg_sag text;
ALTER TABLE proc_predios ADD COLUMN IF NOT EXISTS comuna text;
ALTER TABLE proc_predios ADD COLUMN IF NOT EXISTS superficie_ha numeric(10,2);
ALTER TABLE proc_predios ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- ── Cuartel (nuevo): pertenece a Predio; especie/variedad con integridad ────
CREATE TABLE IF NOT EXISTS proc_cuartel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  predio_id uuid NOT NULL REFERENCES proc_predios(id),
  codigo text NOT NULL, nombre text, superficie_ha numeric(10,2),
  especie_codigo text, variedad_codigo text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, predio_id, codigo),
  -- integridad: (especie,variedad) del cuartel debe existir en el catálogo T1
  CONSTRAINT fk_proc_cuartel_variedad FOREIGN KEY (empresa_id, especie_codigo, variedad_codigo)
    REFERENCES proc_variedad (empresa_id, especie_codigo, codigo)
);
CREATE INDEX IF NOT EXISTS ix_proc_cuartel_predio ON proc_cuartel(empresa_id, predio_id) WHERE deleted_at IS NULL;

-- ── Triggers touch + auditoría (solo la tabla nueva) ────────────────────────
DROP TRIGGER IF EXISTS trg_touch_proc_cuartel ON proc_cuartel;
CREATE TRIGGER trg_touch_proc_cuartel BEFORE UPDATE ON proc_cuartel FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_audit_proc_cuartel ON proc_cuartel;
CREATE TRIGGER trg_audit_proc_cuartel AFTER INSERT OR UPDATE OR DELETE ON proc_cuartel FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

-- ── RLS productiva estricta (tabla nueva) ───────────────────────────────────
ALTER TABLE proc_cuartel ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_cuartel FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_proc_cuartel_empresa ON proc_cuartel;
CREATE POLICY pol_proc_cuartel_empresa ON proc_cuartel USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());
REVOKE ALL ON proc_cuartel FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON proc_cuartel TO authenticated;

-- FIN T2. Aditivo. NO producción.
