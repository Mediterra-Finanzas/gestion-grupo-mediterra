-- ============================================================================
-- schema_core_identity_v1.sql — CORE IDENTITY MÍNIMO (prerequisite de Allegria Service).
--
-- NO es Contabilidad. Es el subconjunto Core de identidad que `proc_*` CONSUME por FK dura
-- (proc_vinculo.grupo_empresa_id → contab_empresas.id ; proc_vinculo.auxiliar_id → contab_auxiliares.id).
-- Allegria Service consume este Core; NO es owner. Fuente: contrato canónico observado en producción
-- (read-only) + schema_core_contable_fase0.sql. Idempotente (IF NOT EXISTS) → aditivo, no clobbea.
--
-- ALCANCE: solo contab_empresas + contab_auxiliares (mínimo). NO se copia el resto del ERP.
-- FIDELIDAD: se reproduce EXACTAMENTE lo evidenciado (PK/UNIQUE/FK/índices/policies + columnas de ALS
-- y las de fase0). Lo NO evidenciado con exactitud NO se inventa:
--   ⚠ GAP CORE-DEP-03: el contenido exacto de los CHECK de contab_empresas.tipo_contab y
--     contab_auxiliares.tipo NO estaba en la evidencia → NO se fabrican aquí (columnas planas).
--     La lista completa de columnas de contab_auxiliares tampoco → se incluye el subconjunto
--     evidenciado (id/empresa_id/tipo/rut/activo/nombre). La migración canónica de Contabilidad puede
--     ALTER-ADD columnas/CHECK después (idempotente) sin conflicto. proc_* solo depende del id (PK).
-- ============================================================================

-- ── contab_empresas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contab_empresas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                    text NOT NULL,
  nombre                    text NOT NULL,
  moneda_base               char(3),
  tipo_contab               text,                          -- ⚠ CHECK real en prod; contenido no evidenciado → no fabricado
  usa_temporada_agricola    boolean DEFAULT false,
  activa                    boolean NOT NULL DEFAULT true,
  -- columnas de schema_core_contable_fase0.sql (evidenciadas):
  moneda_funcional          char(3) DEFAULT 'USD',
  moneda_tributaria         char(3) DEFAULT 'CLP',
  moneda_presentacion       char(3) DEFAULT 'USD',
  regimen_tributario        text,
  usa_modulo_agricola       boolean DEFAULT false,
  usa_modulo_remuneraciones boolean DEFAULT false,
  usa_activo_fijo           boolean DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
-- UNIQUE observado: contab_empresas_codigo_key
CREATE UNIQUE INDEX IF NOT EXISTS contab_empresas_codigo_key ON contab_empresas (codigo);
-- Índice observado: idx_empresas_activas
CREATE INDEX IF NOT EXISTS idx_empresas_activas ON contab_empresas (activa) WHERE activa;

ALTER TABLE contab_empresas ENABLE ROW LEVEL SECURITY;   -- RLS ENABLED, FORCE=false (como prod)
-- Policies observadas en producción:
DROP POLICY IF EXISTS anon_contab_empresas_select ON contab_empresas;
CREATE POLICY anon_contab_empresas_select ON contab_empresas FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS rls_empresas_select ON contab_empresas;
CREATE POLICY rls_empresas_select ON contab_empresas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS rls_empresas_insert ON contab_empresas;
CREATE POLICY rls_empresas_insert ON contab_empresas FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT ON contab_empresas TO anon;
GRANT SELECT, INSERT, UPDATE ON contab_empresas TO authenticated;

-- ── contab_auxiliares ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contab_auxiliares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES contab_empresas(id),   -- FK observada
  tipo         text,                                            -- ⚠ CHECK real en prod; contenido no evidenciado → no fabricado
  nombre       text,
  rut          text,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Índices observados
CREATE INDEX IF NOT EXISTS idx_auxiliares_activos     ON contab_auxiliares (activo) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_auxiliares_empresa_tipo ON contab_auxiliares (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS idx_auxiliares_rut         ON contab_auxiliares (rut);

ALTER TABLE contab_auxiliares ENABLE ROW LEVEL SECURITY;   -- RLS ENABLED; en prod SIN policies (no anon-open)
GRANT SELECT, INSERT, UPDATE ON contab_auxiliares TO authenticated;
-- (Sin policy para anon: replica producción. El acceso anon de la UI en STAGING lo provee el bridge UAT,
--  archivo separado DEV_ONLY, nunca el contrato productivo.)
