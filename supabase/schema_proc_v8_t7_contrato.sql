-- ============================================================================
-- schema_proc_v8_t7_contrato.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T7
-- Contrato del Cliente Service (D10) versionado + tipos configurables (D13) +
-- referencia histórica contrato_vigente_id en recepción/orden (D14). Aditivo, RLS.
-- Contrato ≠ tarifario. Storage = ruta a bucket privado (documento_path); el
-- upload/signed-URL se maneja con el patrón CURRENT (nominas-docs) desde la UI.
-- ============================================================================

-- ── Tipos de documento contractual configurables (D13) ──────────────────────
CREATE TABLE IF NOT EXISTS proc_tipo_documento_contractual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  satisface_requisito_contractual boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo)
);

-- ── Contrato versionado (D10) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_cliente_contrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  cliente_vinculo_id uuid NOT NULL REFERENCES proc_vinculo(id),
  codigo text NOT NULL,
  tipo_documento_id uuid REFERENCES proc_tipo_documento_contractual(id),
  tipo_vigencia text NOT NULL DEFAULT 'por_temporada'
    CHECK (tipo_vigencia IN ('por_temporada','multitemporada','indefinido')),
  temporada_codigo text, fecha_inicio date, fecha_termino date,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','pendiente_firma','vigente','vencido','reemplazado','terminado','anulado')),
  requiere_firma boolean NOT NULL DEFAULT true,
  fecha_firma date, firmado_por text,
  documento_path text,                              -- bucket privado; signed URL en runtime
  version int NOT NULL DEFAULT 1,
  reemplaza_contrato_id uuid REFERENCES proc_cliente_contrato(id),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, cliente_vinculo_id, codigo, version),
  CHECK (fecha_termino IS NULL OR fecha_inicio IS NULL OR fecha_termino >= fecha_inicio)
);
CREATE INDEX IF NOT EXISTS ix_proc_contrato_cli ON proc_cliente_contrato(empresa_id, cliente_vinculo_id) WHERE deleted_at IS NULL;

-- ── Guard de máquina de estados del contrato (§19) ──────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_contrato_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.estado='borrador'        AND NEW.estado IN ('pendiente_firma','anulado')) OR
    (OLD.estado='pendiente_firma' AND NEW.estado IN ('vigente','borrador','anulado')) OR
    (OLD.estado='vigente'         AND NEW.estado IN ('vencido','reemplazado','terminado','anulado')) OR
    (OLD.estado='vencido'         AND NEW.estado IN ('reemplazado','terminado'))
  ) THEN RAISE EXCEPTION 'transición de contrato inválida: % → %', OLD.estado, NEW.estado; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_contrato_guard ON proc_cliente_contrato;
CREATE TRIGGER trg_contrato_guard BEFORE UPDATE ON proc_cliente_contrato FOR EACH ROW EXECUTE FUNCTION proc_fn_contrato_guard();

-- ── Referencia histórica en recepción/orden (D14) ───────────────────────────
ALTER TABLE proc_recepcion ADD COLUMN IF NOT EXISTS contrato_vigente_id uuid REFERENCES proc_cliente_contrato(id);
ALTER TABLE proc_orden_proceso ADD COLUMN IF NOT EXISTS contrato_vigente_id uuid REFERENCES proc_cliente_contrato(id);

-- ── Triggers + RLS (tablas nuevas) ──────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['proc_tipo_documento_contractual','proc_cliente_contrato'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN T7. Aditivo. NO producción.
