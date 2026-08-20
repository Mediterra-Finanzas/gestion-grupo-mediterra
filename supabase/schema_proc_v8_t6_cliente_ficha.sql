-- ============================================================================
-- schema_proc_v8_t6_cliente_ficha.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T6
-- Ficha Cliente Service (D9): tabla 1:1 con el proc_vinculo de rol cliente_servicio.
-- Core = identidad (razón social/RUT vía el vínculo); Proc = relación Service.
-- No duplica identidad. Aditivo, RLS estricta.
-- ============================================================================

CREATE TABLE IF NOT EXISTS proc_cliente_ficha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  cliente_vinculo_id uuid NOT NULL REFERENCES proc_vinculo(id),
  contacto_principal text, email text, telefono text, direccion text,
  responsable_comercial text, condiciones_recepcion_proceso text,
  datos_facturacion_ref text,
  -- política contractual del cliente (D11): autoridad backend del gate (T8)
  politica_contrato text NOT NULL DEFAULT 'no_requerido'
    CHECK (politica_contrato IN ('no_requerido','informativo','advertencia','bloqueante')),
  notas_internas text,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, cliente_vinculo_id)   -- 1:1 por tenant
);
CREATE INDEX IF NOT EXISTS ix_proc_cliente_ficha_cli ON proc_cliente_ficha(empresa_id, cliente_vinculo_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_proc_cliente_ficha ON proc_cliente_ficha;
CREATE TRIGGER trg_touch_proc_cliente_ficha BEFORE UPDATE ON proc_cliente_ficha FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_audit_proc_cliente_ficha ON proc_cliente_ficha;
CREATE TRIGGER trg_audit_proc_cliente_ficha AFTER INSERT OR UPDATE OR DELETE ON proc_cliente_ficha FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

ALTER TABLE proc_cliente_ficha ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_cliente_ficha FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_proc_cliente_ficha_empresa ON proc_cliente_ficha;
CREATE POLICY pol_proc_cliente_ficha_empresa ON proc_cliente_ficha USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());
REVOKE ALL ON proc_cliente_ficha FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON proc_cliente_ficha TO authenticated;

-- FIN T6. Aditivo. NO producción.
