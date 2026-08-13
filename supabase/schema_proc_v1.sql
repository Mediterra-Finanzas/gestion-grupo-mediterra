-- ============================================================================
-- schema_proc_v1.sql  ·  Capability proc_* — Servicio de Proceso de Fruta Fresca
-- FASE 1 (fundaciones). Tenant piloto: Allegria Service. Bounded context propio,
-- paralelo a exp_* (NO derivado). Diseño para REVISIÓN — NO aplicar a la DB
-- hasta visto bueno del contrato de columnas (los nombres son el contrato).
--
-- Alcance F1 (fundaciones, no pantallas): tenancy + seguridad (RLS) + auditoría +
-- config por empresa + temporada operacional + partes/relaciones de negocio +
-- planta/packing + raíz de trazabilidad (recepción + lote) + máquinas de estado.
-- F2+ agregan: QC, inventario pre-proceso, orden de proceso, consumo de lote,
-- resultado/conciliación de masa, PT, pallets, repaletizaje, ledger, despacho,
-- tarifario/servicios facturables. NO se incluyen aquí.
--
-- Convenciones (heredadas de exp_* / contab_*):
--   · PK id UUID DEFAULT gen_random_uuid()
--   · empresa_id UUID NOT NULL, SIN FK físico todavía (excepción tipo EXP-TENANCY-001;
--     el UUID viene del contexto de tenant, NO se hardcodea). FK a Core cuando ratifique padrón.
--   · Soft-delete: deleted_at timestamptz (nunca DELETE físico — Regla 9 / soft delete).
--   · Auditoría: created_by/updated_by uuid, created_at/updated_at timestamptz + proc_audit_log.
--   · Catálogos corporativos (especies/variedades/unidades/monedas): por CÓDIGO neutral, NO FK.
--   · RLS por empresa_id desde el día 1. Política PRODUCTIVA por empresa (abajo).
--     Política permisiva de desarrollo => archivo SEPARADO schema_proc_v1_DEV_ONLY_rls.sql.
-- ============================================================================

-- ── Helpers de tenant/seguridad ─────────────────────────────────────────────
-- empresa_id del tenant leído del claim JWT (patrón exp_current_empresa).
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'empresa_id','')::uuid
$$;

-- Usuario del claim (para created_by/updated_by cuando aplique a nivel DB).
CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;

-- Touch de updated_at.
CREATE OR REPLACE FUNCTION proc_fn_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ── Auditoría append-only ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  tabla        text NOT NULL,
  registro_id  uuid,
  accion       text NOT NULL CHECK (accion IN ('insert','update','delete','estado')),
  valor_ant    jsonb,
  valor_nue    jsonb,
  motivo       text,
  usuario_id   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_proc_audit_empresa ON proc_audit_log(empresa_id, created_at DESC);

-- Trigger genérico de auditoría (registra cambios de las tablas de negocio).
CREATE OR REPLACE FUNCTION proc_fn_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN v_emp := OLD.empresa_id; v_id := OLD.id;
  ELSE v_emp := NEW.empresa_id; v_id := NEW.id; END IF;
  INSERT INTO proc_audit_log(empresa_id, tabla, registro_id, accion, valor_ant, valor_nue, usuario_id)
  VALUES (v_emp, TG_TABLE_NAME, v_id, lower(TG_OP),
          CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,
          proc_current_user());
  RETURN NULL;
END $$;

-- ── Config específica de proceso por empresa (NO duplica Core) ───────────────
-- Solo lo propio de la capability de proceso; monedas/temporada/flags de negocio
-- corporativos viven en Core y se consumen por código neutral.
CREATE TABLE IF NOT EXISTS proc_empresa_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL UNIQUE,
  moneda_operacion      text NOT NULL DEFAULT 'USD',   -- código neutral (Core)
  unidad_masa_default   text NOT NULL DEFAULT 'kg',    -- código neutral (Core)
  tolerancia_masa_pct   numeric(5,2) NOT NULL DEFAULT 0.50 CHECK (tolerancia_masa_pct >= 0),
  usa_temporada_agricola boolean NOT NULL DEFAULT true,
  observaciones         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,
  deleted_at            timestamptz
);

-- ── Activación de catálogos corporativos por empresa (sin contaminar Core) ────
-- Qué especies/variedades/unidades corporativas están activas para esta empresa
-- de proceso. Referencia por CÓDIGO neutral, sin FK a tablas de otro dominio.
CREATE TABLE IF NOT EXISTS proc_catalogo_activacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  catalogo     text NOT NULL CHECK (catalogo IN ('especie','variedad','unidad','calibre','embalaje')),
  codigo       text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (empresa_id, catalogo, codigo)
);

-- ── Temporada operacional de proceso ────────────────────────────────────────
-- DECISIÓN ABIERTA (§ doc): reusar maestro corporativo vs relación propia. Aquí se
-- modela una temporada operacional propia que REFERENCIA la corporativa por código
-- (neutral), con su propia máquina de estados operacional.
CREATE TABLE IF NOT EXISTS proc_temporada (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  codigo         text NOT NULL,                 -- ej. "2026/2027" (código corporativo neutral)
  nombre         text,
  fecha_inicio   date,
  fecha_fin      date,
  estado         text NOT NULL DEFAULT 'planificada'
                 CHECK (estado IN ('planificada','activa','cerrada','anulada')),
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_by     uuid,
  deleted_at     timestamptz,
  UNIQUE (empresa_id, codigo),
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

-- ── Planta / Packing (instalación física) ───────────────────────────────────
-- Soporta: múltiples plantas, packing de terceros (regla 66), propietario ≠ operador
-- (Allegria Service operando en infraestructura ajena).
CREATE TABLE IF NOT EXISTS proc_planta (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL,             -- tenant OPERADOR (quien registra/usa el sistema)
  codigo              text NOT NULL,
  nombre              text NOT NULL,
  es_terceros         boolean NOT NULL DEFAULT false,  -- packing de un tercero (regla 66)
  propietario_parte_id uuid,                      -- dueño de la infraestructura (FK proc_partes) — puede diferir del operador
  operador_parte_id   uuid,                       -- operador físico (FK proc_partes) — puede diferir del tenant
  pais_codigo         text,                        -- código neutral (Core geo)
  region              text,
  direccion           text,
  estado              text NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa','inactiva','archivada')),
  observaciones       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,
  deleted_at          timestamptz,
  UNIQUE (empresa_id, codigo)
);

-- ── Partes / contrapartes de negocio (roles explícitos, no asumir que coinciden) ─
-- Una parte (persona jurídica/natural) puede desempeñar varios ROLES. Modelamos
-- la parte + sus roles, en vez de duplicar entidades por rol.
-- Roles: cliente_servicio · mandante (dueño de la fruta) · productor · exportadora ·
--        operador · propietario_infra.
CREATE TABLE IF NOT EXISTS proc_partes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  codigo        text,
  nombre        text NOT NULL,
  tax_id        text,
  pais_codigo   text,                             -- código neutral (Core geo)
  -- Identidad corporativa cuando la parte es un Productor del maestro corporativo:
  productor_ref text,                             -- código/id neutral del maestro corporativo (no FK cross-domain)
  estado        text NOT NULL DEFAULT 'activa'
                CHECK (estado IN ('activa','inactiva','archivada')),
  observaciones text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_by    uuid,
  deleted_at    timestamptz,
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS proc_parte_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  parte_id    uuid NOT NULL REFERENCES proc_partes(id),
  rol         text NOT NULL CHECK (rol IN
              ('cliente_servicio','mandante','productor','exportadora','operador','propietario_infra')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (empresa_id, parte_id, rol)
);

-- FKs de planta a partes (una vez existe proc_partes).
ALTER TABLE proc_planta
  ADD CONSTRAINT fk_proc_planta_prop FOREIGN KEY (propietario_parte_id) REFERENCES proc_partes(id),
  ADD CONSTRAINT fk_proc_planta_oper FOREIGN KEY (operador_parte_id)    REFERENCES proc_partes(id);

-- ── Predio / origen (identidad de trazabilidad) ─────────────────────────────
-- Identidad de origen para trazabilidad SAG/CSG. Referencia al productor (parte).
CREATE TABLE IF NOT EXISTS proc_predios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  productor_id  uuid REFERENCES proc_partes(id),
  codigo        text,                             -- CSG/código de predio
  nombre        text NOT NULL,
  pais_codigo   text,
  region        text,
  observaciones text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_by    uuid,
  deleted_at    timestamptz,
  UNIQUE (empresa_id, codigo)
);

-- ── RAÍZ DE TRAZABILIDAD: Recepción (custodia, NO compra) ────────────────────
-- Regla 67: la fruta es de terceros; Service la recibe en CUSTODIA, no la compra.
-- Distinción explícita: mandante (dueño de la fruta) · cliente del servicio ·
-- productor/predio (origen). No se asume que coinciden.
CREATE TABLE IF NOT EXISTS proc_recepcion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  folio              text NOT NULL,
  fecha              timestamptz NOT NULL DEFAULT now(),
  temporada_id       uuid REFERENCES proc_temporada(id),
  planta_id          uuid REFERENCES proc_planta(id),
  cliente_servicio_id uuid REFERENCES proc_partes(id),  -- quién contrata el servicio (puede ser exportadora)
  mandante_id        uuid REFERENCES proc_partes(id),   -- dueño económico de la fruta (custodia)
  productor_id       uuid REFERENCES proc_partes(id),   -- origen (identidad)
  predio_id          uuid REFERENCES proc_predios(id),
  especie_codigo     text,                              -- código neutral (Core)
  variedad_codigo    text,                              -- código neutral (Core)
  kg_bruto           numeric(14,3) CHECK (kg_bruto  >= 0),
  kg_neto            numeric(14,3) CHECK (kg_neto   >= 0),
  n_bins             integer CHECK (n_bins >= 0),
  custodia           boolean NOT NULL DEFAULT true,      -- true = recepción en custodia (no compra)
  estado             text NOT NULL DEFAULT 'recibida'
                     CHECK (estado IN ('recibida','en_custodia','en_proceso','procesada','despachada','anulada')),
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid,
  deleted_at         timestamptz,
  UNIQUE (empresa_id, folio),
  CHECK (kg_neto IS NULL OR kg_bruto IS NULL OR kg_neto <= kg_bruto)
);
CREATE INDEX IF NOT EXISTS ix_proc_recepcion_emp ON proc_recepcion(empresa_id, fecha DESC) WHERE deleted_at IS NULL;

-- ── Lote operacional (unidad trazable consumida por el proceso en F3) ────────
-- Una recepción puede rendir 1..N lotes (split por variedad/calibre/cámara).
-- El lote es la unidad que el proceso consume (genealogía en F3).
CREATE TABLE IF NOT EXISTS proc_lote (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  recepcion_id   uuid NOT NULL REFERENCES proc_recepcion(id),
  codigo         text NOT NULL,
  especie_codigo text,
  variedad_codigo text,
  kg_inicial     numeric(14,3) CHECK (kg_inicial >= 0),
  kg_disponible  numeric(14,3) CHECK (kg_disponible >= 0),   -- se descuenta al consumir (F3); nunca negativo
  estado         text NOT NULL DEFAULT 'activo'
                 CHECK (estado IN ('activo','en_proceso','consumido','cerrado','anulado')),
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_by     uuid,
  deleted_at     timestamptz,
  UNIQUE (empresa_id, codigo),
  CHECK (kg_disponible IS NULL OR kg_inicial IS NULL OR kg_disponible <= kg_inicial)
);
CREATE INDEX IF NOT EXISTS ix_proc_lote_recep ON proc_lote(recepcion_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- Triggers touch + auditoría
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_empresa_config','proc_temporada','proc_planta','proc_partes',
    'proc_predios','proc_recepcion','proc_lote'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- ============================================================================
-- RLS — PRODUCTIVA por empresa_id (deny-by-default; requiere claim empresa_id)
-- La política permisiva de desarrollo va en schema_proc_v1_DEV_ONLY_rls.sql (NUNCA prod).
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
    'proc_planta','proc_partes','proc_parte_roles','proc_predios','proc_recepcion','proc_lote'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$
      CREATE POLICY pol_%1$s_empresa ON %1$s
        USING (empresa_id = proc_current_empresa())
        WITH CHECK (empresa_id = proc_current_empresa());
    $f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN schema_proc_v1.sql (fundaciones F1). Aplicar a DB: lo hace el admin de Supabase
-- tras revisión del contrato de columnas. NO ejecutado contra la base por este proyecto.
