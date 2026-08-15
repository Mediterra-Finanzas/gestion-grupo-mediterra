-- ============================================================================
-- schema_proc_v8_t1_especie_variedad.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T1
-- Catálogos canónicos Especie → Variedad (tenant-scoped, RLS estricta).
-- INCREMENTAL sobre F1-F7.7. Aditivo. Diseño: docs/proceso-maestros-trazabilidad-*.
--
-- D4/D7: catálogos propios de proc_* (0 dependencia Frisku/exp_*). Integridad
-- Especie→Variedad en BACKEND: la variedad referencia (empresa_id, especie_codigo)
-- de proc_especie por FK compuesta → imposible una variedad sin especie válida.
-- Se usa la clave `codigo` (texto) para linkear porque todas las tablas CURRENT
-- ya usan especie_codigo/variedad_codigo (texto); así se convierten en FK sin
-- renombrar columnas ni agregar uuid paralelos (nullable-first, no rompe F1-F7).
-- ============================================================================

-- ── Especie ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_especie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL, nombre_en text, icono text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS ix_proc_especie_emp ON proc_especie(empresa_id) WHERE deleted_at IS NULL;

-- ── Variedad (FK compuesta a especie: integridad especie→variedad) ───────────
CREATE TABLE IF NOT EXISTS proc_variedad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  especie_codigo text NOT NULL, codigo text NOT NULL, nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, especie_codigo, codigo),
  CONSTRAINT fk_proc_variedad_especie FOREIGN KEY (empresa_id, especie_codigo)
    REFERENCES proc_especie (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS ix_proc_variedad_emp ON proc_variedad(empresa_id, especie_codigo) WHERE deleted_at IS NULL;

-- ── Triggers touch + auditoría (patrón CURRENT) ─────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['proc_especie','proc_variedad'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- ── RLS productiva estricta (idéntico patrón a F6) ──────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['proc_especie','proc_variedad'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN T1 — catálogos Especie/Variedad. Aditivo. NO aplicado a producción.
