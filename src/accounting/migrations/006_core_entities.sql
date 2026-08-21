-- =============================================================================
-- 006_core_entities.sql
-- OA-024-05 ETAPA 0 — Corporate Entity Master + External References Bridge
-- Fecha   : 2026-08-14
-- Autor   : Claude Code / Angelo Huerta CFO
-- Estado  : READY TO EXECUTE — sujeto a GO tras 007_security_final_preflight.sql
-- Ambiente: DEV/STAGING únicamente
-- =============================================================================
-- PREREQUISITO: Ejecutar 007_security_final_preflight.sql y confirmar GO.
-- ORDEN: Este script debe ejecutarse ANTES de 008_accounting_tables_apply.sql.
-- ROLLBACK: Ver 013_rollback.sql — DROP en orden inverso.
-- =============================================================================
-- DECISIONES APLICADAS:
--   D10-B: UUID canonical (no BIGINT). IDs explícitos = IDs de empresas/contab_empresas.
--   CFO-1: No source_anf_id en core_entities. Bridges via core_entity_external_refs.
--   CFO-2: core_entities corporativamente neutro. Sin accounting/ownership/currency.
--   CFO-3: entity_type 'unresolved' para entidades sin evidencia jurídica confirmada.
--   CFO-4: D7 abierto. Ownership no se infiere de nci_pct legacy.
--   CFO-5: D8 abierto. moneda_func legacy no se migra automáticamente.
--   T11:   updated_at trigger en core_entities.
--   RLS:   Fail-closed desde creación. anon denegado.
-- =============================================================================

-- ===========================================================================
-- SECCIÓN 1: CORPORATE ENTITY MASTER
-- ===========================================================================

CREATE TABLE IF NOT EXISTS core_entities (
  id               UUID          NOT NULL,
  -- ^ EXPLICIT INSERT ONLY. Debe coincidir con empresas.id / contab_empresas.id.
  -- ^ NO usar DEFAULT gen_random_uuid() — los UUIDs ya son canónicos.
  code             TEXT          NOT NULL,
  legal_name       TEXT          NOT NULL,
  display_name     TEXT          NOT NULL,
  country          CHAR(2),
  -- ^ ISO 3166-1 alpha-2. NULL si no hay evidencia de DB. No inferir de RUT format.
  tax_identifier   TEXT,
  -- ^ RUT/EIN/NIF. NULL si no está en DB. ALF tiene RUT confirmado de contab_empresas.
  entity_type      TEXT          NOT NULL DEFAULT 'unresolved',
  -- ^ holding|subsidiary|jv|associate|related|branch|other|unresolved
  -- ^ 'unresolved' para APC/APP/ARR/MON/MES hasta evidencia jurídica.
  -- ^ Separado de consolidation method (acc_ownership). Una entidad puede existir
  -- ^ en el master sin pertenecer al perímetro de consolidación.
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  effective_from   DATE,
  effective_to     DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pk_core_entities
    PRIMARY KEY (id),
  CONSTRAINT uq_core_entity_code
    UNIQUE (code),
  CONSTRAINT ck_entity_type CHECK (entity_type IN (
    'holding','subsidiary','jv','associate','related','branch','other','unresolved'
  )),
  CONSTRAINT ck_effective_dates CHECK (
    effective_to IS NULL
    OR effective_from IS NULL
    OR effective_to >= effective_from
  )
);

COMMENT ON TABLE  core_entities IS
  'Corporate Entity Master — identidad transversal. '
  'Sin campos de accounting, ownership ni moneda funcional. '
  'Todos los dominios (Accounting, ANF, Frisku) referencian este master.';
COMMENT ON COLUMN core_entities.id IS
  'UUID canónico. Coincide exactamente con empresas.id / contab_empresas.id. '
  'Usar INSERT explícito — no DEFAULT gen_random_uuid().';
COMMENT ON COLUMN core_entities.entity_type IS
  '''unresolved'' cuando la estructura jurídica/corporativa no ha sido confirmada. '
  'Separado de method_consol (acc_ownership) y functional currency (acc_entity_config).';
COMMENT ON COLUMN core_entities.country IS
  'ISO 3166-1 alpha-2. Solo poblar cuando hay evidencia directa en DB (RUT → CL, EIN → US, etc.).';

-- ===========================================================================
-- SECCIÓN 2: EXTERNAL REFERENCES BRIDGE (mecanismo transversal)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS core_entity_external_refs (
  id                BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id         UUID          NOT NULL REFERENCES core_entities(id),
  source_system     TEXT          NOT NULL,
  -- ^ Identificador del sistema origen. Valores usados en esta migración:
  -- ^ 'anf'       → anf_filiales
  -- ^ 'contab_v1' → empresas (schema_contable_v1)
  -- ^ 'megasystem' → sistema ERP externo
  source_entity_id  UUID          NOT NULL,
  -- ^ PK del registro en el sistema origen (anf_filiales.id, empresas.id, etc.)
  source_code       TEXT,
  -- ^ Código del sistema origen (e.g., 'allegria_foods', 'ALF')
  effective_from    TIMESTAMPTZ,
  effective_to      TIMESTAMPTZ,
  active            BOOLEAN       NOT NULL DEFAULT TRUE,
  metadata          JSONB,
  -- ^ Información adicional del bridge (nombre en origen, moneda, etc.)
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_external_ref_source
    UNIQUE (source_system, source_entity_id),
  -- ^ Un source_entity_id de un sistema dado apunta a solo un core_entity.
  CONSTRAINT uq_external_ref_entity_system
    UNIQUE (entity_id, source_system),
  -- ^ Una core_entity tiene máximo un ref por source_system.
  -- ^ Si un sistema tiene múltiples IDs para la misma entidad, usar metadata.
  CONSTRAINT ck_external_ref_dates CHECK (
    effective_to IS NULL
    OR effective_from IS NULL
    OR effective_to >= effective_from
  )
);

COMMENT ON TABLE  core_entity_external_refs IS
  'Bridges de identidad entre core_entities y sistemas externos. '
  'Permite agregar nuevos sistemas sin alterar core_entities. '
  'UNIQUE(source_system, source_entity_id): un UUID externo → un core_entity.';
COMMENT ON COLUMN core_entity_external_refs.source_system IS
  'Sistema origen: ''anf'', ''contab_v1'', ''megasystem'', ''contec'', etc.';
COMMENT ON COLUMN core_entity_external_refs.source_entity_id IS
  'PK del registro en el sistema origen. UUID. '
  'Para ANF: anf_filiales.id. Para contab_v1: empresas.id (mismos que core_entities).';

-- ===========================================================================
-- SECCIÓN 3: INDEXES
-- ===========================================================================

CREATE INDEX IF NOT EXISTS ix_core_entities_active
  ON core_entities (is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_core_entities_type
  ON core_entities (entity_type);

CREATE INDEX IF NOT EXISTS ix_ceref_entity_id
  ON core_entity_external_refs (entity_id);

CREATE INDEX IF NOT EXISTS ix_ceref_source
  ON core_entity_external_refs (source_system, source_entity_id);

-- ===========================================================================
-- SECCIÓN 4: T11 — updated_at TRIGGER
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at_cem()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_core_entities_updated_at
  BEFORE UPDATE ON core_entities
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at_cem();

-- ===========================================================================
-- SECCIÓN 5: RLS — FAIL-CLOSED DESDE CREACIÓN
-- ===========================================================================
-- Principio: sin política explícita, el role no tiene acceso.
-- anon: denegado en todo. No hay política para anon → acceso cero.
-- service_role: acceso completo (administración, ingesta).
-- authenticated: solo SELECT (scope-filtered se añade en Fase posterior).
-- ===========================================================================

ALTER TABLE core_entities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_entity_external_refs  ENABLE ROW LEVEL SECURITY;

-- service_role: acceso total (no se puede bloquear en Supabase con service_role,
-- pero la policy explícita documenta la intención y cubre el rol 'service_role'
-- cuando se usa vía API con service key).
CREATE POLICY cem_service_all ON core_entities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY ceref_service_all ON core_entity_external_refs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- authenticated: solo lectura del master corporativo.
-- Sin filtro de empresa porque core_entities es transversal.
CREATE POLICY cem_auth_select ON core_entities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ceref_auth_select ON core_entity_external_refs
  FOR SELECT TO authenticated
  USING (true);

-- anon: SIN POLÍTICA EXPLÍCITA → acceso CERO (fail-closed).
-- No agregar política anon sin GO explícito del CFO.

-- ===========================================================================
-- SECCIÓN 6: SEED — 11 ENTIDADES CANÓNICAS
-- ===========================================================================
-- Evidencia utilizada para cada campo:
--   id          → empresas.id (DB real, confirmado preflight 2026-08-14)
--   code        → empresas.codigo (DB real)
--   legal_name  → empresas.nombre (DB real)
--   display_name → igual a legal_name (sin alias confirmado en DB)
--   country     → 'CL' solo para ALF (RUT en contab_empresas = evidencia chilena)
--   tax_id      → contab_empresas.rut (solo ALF tiene valor no-null)
--   entity_type → 'subsidiary' para ALF/ALS/FRI/INT/OSI (CLAUDE.md estructura)
--                 'holding'    para MED (CLAUDE.md estructura)
--                 'unresolved' para APC/APP/ARR/MON/MES (D7 abierto)
--   effective_from → NULL (fecha de constitución no en DB)
-- ===========================================================================

INSERT INTO core_entities
  (id, code, legal_name, display_name, country, tax_identifier, entity_type, is_active)
VALUES
  -- Holding
  ('ccaa4e1c-6c33-479b-bf7e-926efaf606d9',
   'MED', 'Mediterra Holding', 'Mediterra Holding',
   NULL, NULL, 'holding', true),

  -- Subsidiaries (evidencia: CLAUDE.md grupo estructura, % control confirmado)
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   'ALF', 'Allegria Foods', 'Allegria Foods',
   'CL', '77.026.047-7', 'subsidiary', true),
  -- ^ country='CL': RUT chileno en contab_empresas. tax_identifier: contab_empresas.rut

  ('5aa10886-2a76-4a9e-9bc3-303fb776cd49',
   'ALS', 'Allegria Service', 'Allegria Service',
   NULL, NULL, 'subsidiary', true),

  ('2cf3b44f-2bcb-46bd-8023-5fd8602cc96d',
   'FRI', 'Frisku Foods', 'Frisku Foods',
   NULL, NULL, 'subsidiary', true),

  ('37fa6572-66cd-4641-9979-150ed64e458e',
   'INT', 'Integrity Farms', 'Integrity Farms',
   NULL, NULL, 'subsidiary', true),

  ('072a6f8c-8467-4d35-b957-dadae469550f',
   'OSI', 'Osiris Plant Management', 'Osiris Plant Management',
   NULL, NULL, 'subsidiary', true),

  -- Unresolved (D7 abierto: tipo jurídico/estructura de propiedad no confirmada en DB)
  ('c2cac2d4-c6e2-41ce-a365-ca6ecffc4f55',
   'APC', 'Allpa Farms Chile', 'Allpa Farms Chile',
   NULL, NULL, 'unresolved', true),
  -- ^ D7: nci_pct=0.50 en empresas legacy. No inferir JV sin evidencia jurídica externa.

  ('88ec0f96-c91b-484c-a378-355f336b2f2c',
   'APP', 'Allpa Farms Peru', 'Allpa Farms Peru',
   NULL, NULL, 'unresolved', true),
  -- ^ D7: nci_pct=0.74 en empresas legacy. No inferir associate sin evidencia.
  -- ^ D8: moneda funcional PEN vs USD no resuelta.

  ('dc695f5c-6c31-4423-9a19-a5510f2875bc',
   'ARR', 'Arrayon', 'Arrayon',
   NULL, NULL, 'unresolved', true),
  -- ^ Entity limbo: no en perimetro CLAUDE.md core. Tipo jurídico no confirmado.

  ('8ce9b83b-aeda-4dd8-921d-c7ccac06367d',
   'MES', 'Mesain', 'Mesain',
   NULL, NULL, 'unresolved', true),
  -- ^ anf_filiales.sistema = 'tbd'. Tipo jurídico no confirmado.

  ('bd981d9d-843c-4a64-a8f5-938662d35a0a',
   'MON', 'Montejato', 'Montejato',
   NULL, NULL, 'unresolved', true)
  -- ^ Entity limbo: no en perimetro CLAUDE.md core. Tipo jurídico no confirmado.

ON CONFLICT (id) DO NOTHING;
-- ^ Idempotente: si el UUID ya existe, no falla ni sobreescribe.

-- ===========================================================================
-- SECCIÓN 7: BRIDGES ANF — 8 EQUIVALENCIAS INEQUÍVOCAS
-- ===========================================================================
-- Fuente: anf_filiales (confirmado deployed, preflight 2026-08-14).
-- Criterio: equivalencia por nombre y dominio de negocio — inequívoca.
-- APP, ARR, MON: no existen en anf_filiales → sin bridge.
-- ===========================================================================

INSERT INTO core_entity_external_refs
  (entity_id, source_system, source_entity_id, source_code, metadata)
VALUES
  -- MED ↔ anf_filiales.mediterra
  ('ccaa4e1c-6c33-479b-bf7e-926efaf606d9',
   'anf', '85f6a2d0-a8af-4b21-9983-e27377f7761c', 'mediterra',
   '{"anf_nombre": "Mediterra Holding", "anf_moneda": "USD", "anf_sistema": "megasystem"}'::jsonb),

  -- ALF ↔ anf_filiales.allegria_foods
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   'anf', '03b15fca-e99c-4f25-a289-821213084e82', 'allegria_foods',
   '{"anf_nombre": "Allegria Foods", "anf_moneda": "USD", "anf_sistema": "contec"}'::jsonb),

  -- ALS ↔ anf_filiales.allegria_service
  ('5aa10886-2a76-4a9e-9bc3-303fb776cd49',
   'anf', 'c022964f-f866-4998-aeaf-6e920706bb13', 'allegria_service',
   '{"anf_nombre": "Allegria Service", "anf_moneda": "USD", "anf_sistema": "contec"}'::jsonb),

  -- APC ↔ anf_filiales.allpa_chile
  ('c2cac2d4-c6e2-41ce-a365-ca6ecffc4f55',
   'anf', 'ca53a724-e738-4263-bad5-7db9bed25dcd', 'allpa_chile',
   '{"anf_nombre": "Allpa Farms Chile", "anf_moneda": "CLP", "anf_sistema": "megasystem", "nota": "D8: conflicto moneda ANF=CLP vs legacy=USD"}'::jsonb),
  -- ^ Moneda CLP en ANF vs USD en legacy: conflicto D8 documentado en metadata.
  -- ^ Bridge se crea pero D8 sigue abierto.

  -- FRI ↔ anf_filiales.frisku
  ('2cf3b44f-2bcb-46bd-8023-5fd8602cc96d',
   'anf', 'e9bad766-549f-4db1-8e54-2609bbcaf9d9', 'frisku',
   '{"anf_nombre": "Frisku Foods", "anf_moneda": "USD", "anf_sistema": "megasystem"}'::jsonb),

  -- INT ↔ anf_filiales.integrity
  ('37fa6572-66cd-4641-9979-150ed64e458e',
   'anf', 'b7e614a5-cf9e-4aa0-aa40-c59fe171bfe2', 'integrity',
   '{"anf_nombre": "Integrity Farms", "anf_moneda": "USD", "anf_sistema": "megasystem"}'::jsonb),

  -- MES ↔ anf_filiales.mesain
  ('8ce9b83b-aeda-4dd8-921d-c7ccac06367d',
   'anf', '1427c148-5446-44f3-8821-fd221d35a988', 'mesain',
   '{"anf_nombre": "Mesain", "anf_moneda": "USD", "anf_sistema": "tbd"}'::jsonb),

  -- OSI ↔ anf_filiales.osiris
  -- Nota: ANF = "Osiris" (corto), core = "Osiris Plant Management" — equivalencia inequívoca
  ('072a6f8c-8467-4d35-b957-dadae469550f',
   'anf', '333d8e35-39df-4f3c-99ba-28a3550756a6', 'osiris',
   '{"anf_nombre": "Osiris", "anf_moneda": "USD", "anf_sistema": "megasystem"}'::jsonb)

ON CONFLICT (source_system, source_entity_id) DO NOTHING;
-- ^ Idempotente.

-- ===========================================================================
-- SECCIÓN 8: VERIFICACIÓN POST-INSERT (ejecutar como SELECT para confirmar)
-- ===========================================================================

/*
-- V1: 11 entidades exactas
SELECT COUNT(*) AS entity_count FROM core_entities;
-- Esperado: 11

-- V2: 0 UUIDs duplicados
SELECT COUNT(*) FROM (SELECT id FROM core_entities GROUP BY id HAVING COUNT(*) > 1) dup;
-- Esperado: 0

-- V3: 0 códigos duplicados
SELECT COUNT(*) FROM (SELECT code FROM core_entities GROUP BY code HAVING COUNT(*) > 1) dup;
-- Esperado: 0

-- V4: UUID coinciden con empresas (los 11 deben coincidir)
SELECT e.codigo, e.id AS empresas_id, ce.id AS core_id,
       (e.id = ce.id) AS uuid_match
FROM empresas e
LEFT JOIN core_entities ce ON ce.id = e.id
ORDER BY e.codigo;
-- Esperado: 11 filas, uuid_match = true en todas.

-- V5: 8 bridges ANF exactos
SELECT COUNT(*) FROM core_entity_external_refs WHERE source_system = 'anf';
-- Esperado: 8

-- V6: Sin bridges para APP/ARR/MON (no están en anf_filiales)
SELECT ce.code, ceref.source_entity_id
FROM core_entities ce
LEFT JOIN core_entity_external_refs ceref ON ceref.entity_id = ce.id AND ceref.source_system = 'anf'
WHERE ce.code IN ('APP','ARR','MON');
-- Esperado: 3 filas, source_entity_id = NULL (sin bridge ANF)

-- V7: Bridges correctos — nombre match
SELECT ce.code, ce.legal_name, ceref.source_code, ceref.metadata->>'anf_nombre' AS anf_nombre
FROM core_entities ce
JOIN core_entity_external_refs ceref ON ceref.entity_id = ce.id AND ceref.source_system = 'anf'
ORDER BY ce.code;
-- Esperado: 8 filas, nombres coherentes

-- V8: RLS — anon no tiene acceso (ejecutar con anon key via REST)
-- GET /rest/v1/core_entities → esperar 0 rows o error 401
-- GET /rest/v1/core_entity_external_refs → esperar 0 rows o error 401

-- V9: Entidades unresolved
SELECT code, entity_type FROM core_entities WHERE entity_type = 'unresolved' ORDER BY code;
-- Esperado: APC, APP, ARR, MES, MON (5 entidades)

-- V10: Entidades con country evidenciado
SELECT code, country, tax_identifier FROM core_entities WHERE country IS NOT NULL;
-- Esperado: ALF (country='CL', tax_identifier='77.026.047-7')
*/

-- ===========================================================================
-- END — 006_core_entities.sql
-- Ejecutar ANTES de 008_accounting_tables_apply.sql
-- NO ejecutar sin GO confirmado de 007_security_final_preflight.sql
-- =============================================================================
