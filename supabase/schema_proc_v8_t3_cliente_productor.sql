-- ============================================================================
-- schema_proc_v8_t3_cliente_productor.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T3
-- Relación N:M Cliente del servicio ↔ Productor (D8). SIN ownership: el productor
-- es una entidad reutilizable referenciada por varios clientes. Aditivo, RLS.
-- No se infieren relaciones históricas (se pueblan hacia adelante).
-- ============================================================================

CREATE TABLE IF NOT EXISTS proc_cliente_productor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  cliente_vinculo_id uuid NOT NULL REFERENCES proc_vinculo(id),
  productor_vinculo_id uuid NOT NULL REFERENCES proc_vinculo(id),
  vigencia_desde date, vigencia_hasta date, temporada_codigo text,
  activo boolean NOT NULL DEFAULT true, observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, cliente_vinculo_id, productor_vinculo_id),
  CHECK (cliente_vinculo_id <> productor_vinculo_id),
  CHECK (vigencia_hasta IS NULL OR vigencia_desde IS NULL OR vigencia_hasta >= vigencia_desde)
);
CREATE INDEX IF NOT EXISTS ix_proc_clipro_cli ON proc_cliente_productor(empresa_id, cliente_vinculo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_clipro_pro ON proc_cliente_productor(empresa_id, productor_vinculo_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_proc_cliente_productor ON proc_cliente_productor;
CREATE TRIGGER trg_touch_proc_cliente_productor BEFORE UPDATE ON proc_cliente_productor FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_audit_proc_cliente_productor ON proc_cliente_productor;
CREATE TRIGGER trg_audit_proc_cliente_productor AFTER INSERT OR UPDATE OR DELETE ON proc_cliente_productor FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

ALTER TABLE proc_cliente_productor ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_cliente_productor FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_proc_cliente_productor_empresa ON proc_cliente_productor;
CREATE POLICY pol_proc_cliente_productor_empresa ON proc_cliente_productor USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());
REVOKE ALL ON proc_cliente_productor FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON proc_cliente_productor TO authenticated;

-- FIN T3. Aditivo. NO producción.
