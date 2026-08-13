-- ============================================================================
-- schema_proc_v1.sql  ·  Capability proc_* — Servicio de Proceso de Fruta Fresca
-- FASE 1 (fundaciones). Tenant piloto: Allegria Service. Bounded context propio,
-- paralelo a exp_* (NO derivado). Diseño para REVISIÓN — NO aplicar a la DB hasta
-- visto bueno del contrato de columnas (los nombres son el contrato).
--
-- VERSIÓN RECONCILIADA (2026-08-13): fusiona el canónico 55dc61a con las 17
-- precisiones ratificadas por el CFO. Ver docs/proceso-f1-reconciliacion.md.
--   · Identidad: proc_vinculo (XOR de FK reales a contab_empresas | contab_auxiliares),
--     NO party master. Se retiran proc_partes / proc_parte_roles.
--   · Inventario: proc_movimiento (LEDGER append-only, SoT del saldo físico) + proc_hold
--     (reserva/bloqueo, NO masa física) + vista proc_v_lote_saldos (derivación, sin cache).
--     Se retira proc_lote.kg_disponible mutable (era 2ª fuente de verdad).
--   · Custodia: se retira el booleano; el hecho es dueno_fruta (mandante). Presencia en
--     inventario = custodia operacional.
--   · Calibres/colores: propios de proc_* por especie + mapping (no catálogo corporativo).
--   · RLS FORCE + REVOKE anon (del canónico); GO-LIVE blocker explícito.
--
-- PREREQUISITO: contab_empresas y contab_auxiliares deben existir (proc_vinculo las
--   referencia con FK reales). NO se hardcodea el UUID de ninguna empresa.
--
-- Convenciones: PK id UUID; empresa_id UUID NOT NULL SIN FK físico (EXP-TENANCY-001;
--   tenant desde contexto, no hardcode); soft-delete deleted_at (salvo ledger, append-only);
--   created_by/updated_by/created_at/updated_at + proc_audit_log; catálogos corporativos
--   (especie/variedad/unidad) por CÓDIGO neutral; NUMERIC para kilos (nunca float).
-- ============================================================================

-- ── Helpers de tenant/seguridad ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'empresa_id','')::uuid
$$;

CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;

CREATE OR REPLACE FUNCTION proc_fn_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ── Auditoría administrativa (quién/qué). DISTINTA del ledger (kilos). ────────
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

-- Bloqueo de mutación del ledger (append-only estricto — ajuste #7).
CREATE OR REPLACE FUNCTION proc_fn_block_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'proc_movimiento es append-only: use reversa/contramovimiento, no %', TG_OP;
END $$;

-- ── Config específica de proceso por empresa (NO duplica Core) ───────────────
CREATE TABLE IF NOT EXISTS proc_empresa_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL UNIQUE,
  moneda_operacion      text NOT NULL DEFAULT 'USD',   -- código neutral (Core)
  unidad_masa_default   text NOT NULL DEFAULT 'kg',
  tolerancia_masa_pct   numeric(5,2) NOT NULL DEFAULT 0.50 CHECK (tolerancia_masa_pct >= 0),
  usa_temporada_agricola boolean NOT NULL DEFAULT true,
  observaciones         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid, updated_by uuid, deleted_at timestamptz
);

-- Activación de catálogos CORPORATIVOS por empresa (especie/variedad/unidad).
-- (Calibre/color son propios de proc_* — ver proc_calibre/proc_color.)
CREATE TABLE IF NOT EXISTS proc_catalogo_activacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  catalogo     text NOT NULL CHECK (catalogo IN ('especie','variedad','unidad')),
  codigo       text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (empresa_id, catalogo, codigo)
);

-- ── Temporada operacional (estados + fechas; referencia código corporativo) ──
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
  created_by     uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo),
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

-- ── Vínculo: relación operacional con una identidad CORPORATIVA ──────────────
-- NO es party master. La identidad (nombre/RUT/dirección) vive en Core:
--   grupo_empresa_id -> contab_empresas (empresa del grupo)
--   auxiliar_id      -> contab_auxiliares (tercero externo)
-- XOR exactamente-uno (o modo pendiente con nombre provisional señalizado).
CREATE TABLE IF NOT EXISTS proc_vinculo (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL,            -- operador (tenant)
  grupo_empresa_id          uuid REFERENCES contab_empresas(id),
  auxiliar_id               uuid REFERENCES contab_auxiliares(id),
  pendiente_alta_corporativa boolean NOT NULL DEFAULT false,
  nombre_provisional        text,
  rol_operacional           text NOT NULL CHECK (rol_operacional IN
                              ('cliente_servicio','productor','dueno_fruta','exportadora',
                               'propietario_planta','operador','transportista','otro')),
  codigo_externo            text,
  contacto_operacional      jsonb NOT NULL DEFAULT '{}'::jsonb,
  condiciones_comerciales   jsonb NOT NULL DEFAULT '{}'::jsonb,
  instrucciones             text,
  vigencia_desde            date,
  vigencia_hasta            date,
  estado                    text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  observaciones             text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid, updated_by uuid, deleted_at timestamptz,
  CONSTRAINT ck_proc_vinculo_ref_xor CHECK (
    ( (grupo_empresa_id IS NOT NULL)::int
    + (auxiliar_id IS NOT NULL)::int
    + (pendiente_alta_corporativa)::int ) = 1
  ),
  CONSTRAINT ck_proc_vinculo_pendiente CHECK (
    (pendiente_alta_corporativa = false) OR (nombre_provisional IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_proc_vinculo_emp  ON proc_vinculo(empresa_id, rol_operacional) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_vinculo_grp  ON proc_vinculo(grupo_empresa_id) WHERE grupo_empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_proc_vinculo_aux  ON proc_vinculo(auxiliar_id) WHERE auxiliar_id IS NOT NULL;

-- ── Planta / Packing (operador ≠ propietario ≠ tenant) ───────────────────────
CREATE TABLE IF NOT EXISTS proc_planta (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL,             -- tenant OPERADOR
  codigo                text NOT NULL,
  nombre                text NOT NULL,
  es_terceros           boolean NOT NULL DEFAULT false,  -- packing de un tercero (regla 66)
  propietario_vinculo_id uuid REFERENCES proc_vinculo(id),  -- dueño infraestructura
  operador_vinculo_id   uuid REFERENCES proc_vinculo(id),   -- operador físico (puede ≠ tenant)
  pais_codigo           text,
  region                text,
  direccion             text,
  estado                text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','inactiva','archivada')),
  observaciones         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo),
  CONSTRAINT ck_proc_planta_terceros CHECK (es_terceros = false OR propietario_vinculo_id IS NOT NULL)
);

-- ── Predio / origen (trazabilidad SAG/CSG; dato operacional, no identidad) ────
CREATE TABLE IF NOT EXISTS proc_predios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL,
  productor_vinculo_id uuid REFERENCES proc_vinculo(id),  -- identidad = Core (vía vínculo)
  codigo              text,                                -- CSG / código de predio
  nombre              text NOT NULL,
  pais_codigo         text,
  region              text,
  observaciones       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo)
);

-- ── Calibres / Colores PROPIOS de proc_* (por especie + mapping externo) ──────
CREATE TABLE IF NOT EXISTS proc_calibre (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  especie_codigo  text NOT NULL,
  codigo          text NOT NULL,
  nombre          text NOT NULL,
  orden           int NOT NULL DEFAULT 0,
  mapping_estandar jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, especie_codigo, codigo)
);

CREATE TABLE IF NOT EXISTS proc_color (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  especie_codigo  text NOT NULL,
  codigo          text NOT NULL,
  nombre          text NOT NULL,
  mapping_estandar jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, especie_codigo, codigo)
);

-- ── RAÍZ DE TRAZABILIDAD: Recepción (custodia, NO compra — regla 67) ──────────
-- Roles separados vía vínculos; NO se asume que coinciden. Sin booleano custodia:
-- el hecho es dueno_fruta (propiedad económica); la custodia es la presencia en inventario.
CREATE TABLE IF NOT EXISTS proc_recepcion (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL,
  folio                     text NOT NULL,
  fecha                     timestamptz NOT NULL DEFAULT now(),
  temporada_id              uuid REFERENCES proc_temporada(id),
  planta_id                 uuid REFERENCES proc_planta(id),
  cliente_servicio_vinculo_id uuid REFERENCES proc_vinculo(id),  -- quién contrata
  dueno_fruta_vinculo_id    uuid REFERENCES proc_vinculo(id),     -- propiedad económica
  productor_vinculo_id      uuid REFERENCES proc_vinculo(id),     -- origen (identidad Core)
  exportadora_vinculo_id    uuid REFERENCES proc_vinculo(id),
  transportista_vinculo_id  uuid REFERENCES proc_vinculo(id),
  predio_id                 uuid REFERENCES proc_predios(id),
  -- origen operacional / snapshot (no identidad):
  lote_productor            text,
  cuartel                   text,
  especie_codigo            text,                               -- código neutral (Core)
  variedad_codigo           text,
  guia_despacho             text,
  patente                   text,
  kg_bruto                  numeric(14,3) CHECK (kg_bruto  >= 0),
  tara                      numeric(14,3) CHECK (tara >= 0),
  kg_neto                   numeric(14,3) NOT NULL CHECK (kg_neto > 0),
  n_bins                    integer CHECK (n_bins >= 0),
  temperatura               numeric(6,2),
  estado                    text NOT NULL DEFAULT 'recibida'
                            CHECK (estado IN ('borrador','recibida','en_proceso','procesada','despachada','anulada')),
  observaciones             text,
  documentos                jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, folio),
  CHECK (kg_neto IS NULL OR kg_bruto IS NULL OR kg_neto <= kg_bruto)
);
CREATE INDEX IF NOT EXISTS ix_proc_recepcion_emp ON proc_recepcion(empresa_id, fecha DESC) WHERE deleted_at IS NULL;

-- ── Lote operacional (raíz de genealogía). SIN saldo persistido (SoT = ledger). ─
CREATE TABLE IF NOT EXISTS proc_lote (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  recepcion_id   uuid NOT NULL REFERENCES proc_recepcion(id),
  codigo         text NOT NULL,
  especie_codigo text,
  variedad_codigo text,
  ubicacion      text,                     -- ubicación textual F1 (proc_ubicaciones formal en F2)
  estado         text NOT NULL DEFAULT 'disponible'
                 CHECK (estado IN ('disponible','parcialmente_procesado','procesado','cerrado','rechazado','anulado')),
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS ix_proc_lote_recep ON proc_lote(recepcion_id) WHERE deleted_at IS NULL;

-- ── Catálogo GLOBAL de sistema: tipos de movimiento (la lógica de saldo depende
--    de naturaleza; por eso es de sistema, no per-tenant) ──────────────────────
CREATE TABLE IF NOT EXISTS proc_tipo_movimiento (
  codigo             text PRIMARY KEY,
  nombre             text NOT NULL,
  naturaleza_default text NOT NULL CHECK (naturaleza_default IN ('entrada','salida')),
  permite_ambos      boolean NOT NULL DEFAULT false,
  activo             boolean NOT NULL DEFAULT true,
  orden              int NOT NULL DEFAULT 0
);

-- ── LEDGER de inventario: proc_movimiento (SoT del saldo físico, APPEND-ONLY) ──
CREATE TABLE IF NOT EXISTS proc_movimiento (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL,
  planta_id             uuid REFERENCES proc_planta(id),
  temporada_codigo      text,
  fecha                 timestamptz NOT NULL DEFAULT now(),
  tipo_movimiento       text NOT NULL REFERENCES proc_tipo_movimiento(codigo),
  naturaleza            text NOT NULL CHECK (naturaleza IN ('entrada','salida')),
  objeto_tipo           text NOT NULL CHECK (objeto_tipo IN ('lote','producto_terminado','pallet')),
  objeto_id             uuid NOT NULL,
  cantidad              numeric(14,3) NOT NULL CHECK (cantidad > 0),  -- signo = naturaleza
  unidad                text NOT NULL DEFAULT 'kg',
  ref_tipo              text CHECK (ref_tipo IN ('recepcion','consumo_proceso','despacho','ajuste','repaletizaje')),
  ref_id                uuid,
  es_reversa            boolean NOT NULL DEFAULT false,
  revierte_movimiento_id uuid REFERENCES proc_movimiento(id),
  motivo                text,
  transaccion_id        uuid,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_proc_mov_motivo  CHECK ((es_reversa = false AND tipo_movimiento <> 'ajuste') OR motivo IS NOT NULL),
  CONSTRAINT ck_proc_mov_reversa CHECK ((es_reversa = false) OR (revierte_movimiento_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_proc_mov_objeto ON proc_movimiento(objeto_tipo, objeto_id);
CREATE INDEX IF NOT EXISTS ix_proc_mov_emp    ON proc_movimiento(empresa_id);
CREATE INDEX IF NOT EXISTS ix_proc_mov_tx     ON proc_movimiento(transaccion_id);

-- ── Holds: reserva / bloqueo (restringen disponibilidad, NO masa física) ──────
CREATE TABLE IF NOT EXISTS proc_hold (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  objeto_tipo   text NOT NULL CHECK (objeto_tipo IN ('lote','producto_terminado','pallet')),
  objeto_id     uuid NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('reserva','bloqueo')),
  cantidad      numeric(14,3) NOT NULL CHECK (cantidad > 0),
  estado        text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','liberado')),
  ref_tipo      text, ref_id uuid, motivo text,
  created_by    uuid, created_at timestamptz NOT NULL DEFAULT now(),
  liberado_por  uuid, liberado_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_proc_hold_objeto ON proc_hold(objeto_tipo, objeto_id) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS ix_proc_hold_emp    ON proc_hold(empresa_id);

-- ── Vista de saldos (derivación, NO autoridad — ajuste #10) ───────────────────
CREATE OR REPLACE VIEW proc_v_lote_saldos AS
SELECT
  l.id AS lote_id, l.empresa_id,
  COALESCE(m.on_hand, 0)                                           AS on_hand,
  COALESCE(h.bloqueado, 0)                                         AS bloqueado,
  COALESCE(h.reservado, 0)                                         AS reservado,
  COALESCE(m.on_hand,0) - COALESCE(h.bloqueado,0) - COALESCE(h.reservado,0) AS disponible
FROM proc_lote l
LEFT JOIN (
  SELECT objeto_id, empresa_id,
         SUM(CASE WHEN naturaleza='entrada' THEN cantidad ELSE -cantidad END) AS on_hand
  FROM proc_movimiento WHERE objeto_tipo='lote'
  GROUP BY objeto_id, empresa_id
) m ON m.objeto_id = l.id AND m.empresa_id = l.empresa_id
LEFT JOIN (
  SELECT objeto_id, empresa_id,
         SUM(CASE WHEN tipo='bloqueo' THEN cantidad ELSE 0 END) AS bloqueado,
         SUM(CASE WHEN tipo='reserva' THEN cantidad ELSE 0 END) AS reservado
  FROM proc_hold WHERE objeto_tipo='lote' AND estado='activo'
  GROUP BY objeto_id, empresa_id
) h ON h.objeto_id = l.id AND h.empresa_id = l.empresa_id
WHERE l.deleted_at IS NULL;
ALTER VIEW proc_v_lote_saldos SET (security_invoker = on);

-- ============================================================================
-- RPC transaccionales (operaciones multi-registro atómicas — ajustes #23/#24)
-- ============================================================================

-- Registro guardado de movimiento: serializa por objeto y prohíbe saldo negativo.
-- Único punto sancionado para escribir salidas físicas.
CREATE OR REPLACE FUNCTION proc_fn_registrar_movimiento(
  p_empresa_id uuid, p_planta_id uuid, p_temporada text,
  p_tipo text, p_naturaleza text, p_objeto_tipo text, p_objeto_id uuid,
  p_cantidad numeric, p_ref_tipo text, p_ref_id uuid,
  p_transaccion_id uuid, p_motivo text, p_actor uuid,
  p_es_reversa boolean DEFAULT false, p_revierte uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_on_hand numeric; v_mov uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad debe ser > 0 (recibido %)', p_cantidad;
  END IF;

  -- Serializar por objeto (evita doble consumo concurrente).
  IF p_objeto_tipo = 'lote' THEN
    PERFORM 1 FROM proc_lote WHERE id = p_objeto_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe para empresa %', p_objeto_id, p_empresa_id; END IF;
  END IF;

  -- Salida no puede dejar on_hand negativo.
  IF p_naturaleza = 'salida' THEN
    SELECT COALESCE(SUM(CASE WHEN naturaleza='entrada' THEN cantidad ELSE -cantidad END),0)
      INTO v_on_hand FROM proc_movimiento
     WHERE objeto_tipo = p_objeto_tipo AND objeto_id = p_objeto_id AND empresa_id = p_empresa_id;
    IF (v_on_hand - p_cantidad) < 0 THEN
      RAISE EXCEPTION 'salida % excede on_hand % del objeto %', p_cantidad, v_on_hand, p_objeto_id;
    END IF;
  END IF;

  INSERT INTO proc_movimiento(
    empresa_id, planta_id, temporada_codigo, tipo_movimiento, naturaleza,
    objeto_tipo, objeto_id, cantidad, ref_tipo, ref_id, es_reversa,
    revierte_movimiento_id, motivo, transaccion_id, created_by
  ) VALUES (
    p_empresa_id, p_planta_id, p_temporada, p_tipo, p_naturaleza,
    p_objeto_tipo, p_objeto_id, p_cantidad, p_ref_tipo, p_ref_id, p_es_reversa,
    p_revierte, p_motivo, p_transaccion_id, p_actor
  ) RETURNING id INTO v_mov;
  RETURN v_mov;
END $$;

-- Crear lote + su ingreso físico inicial, atómicamente.
CREATE OR REPLACE FUNCTION proc_fn_ingresar_lote(
  p_empresa_id uuid, p_recepcion_id uuid, p_codigo text,
  p_especie text, p_variedad text, p_kg numeric, p_planta_id uuid,
  p_temporada text, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_lote uuid; v_tx uuid := gen_random_uuid();
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg del lote debe ser > 0'; END IF;
  INSERT INTO proc_lote(empresa_id, recepcion_id, codigo, especie_codigo, variedad_codigo, created_by)
  VALUES (p_empresa_id, p_recepcion_id, p_codigo, p_especie, p_variedad, p_actor)
  RETURNING id INTO v_lote;
  PERFORM proc_fn_registrar_movimiento(
    p_empresa_id, p_planta_id, p_temporada, 'recepcion', 'entrada', 'lote', v_lote,
    p_kg, 'recepcion', p_recepcion_id, v_tx, NULL, p_actor);
  RETURN v_lote;
END $$;

-- Consumo de lote hacia una orden de proceso (F3): valida disponible + escribe salida.
CREATE OR REPLACE FUNCTION proc_fn_registrar_consumo(
  p_empresa_id uuid, p_lote_id uuid, p_kg numeric, p_ref_id uuid,
  p_transaccion_id uuid, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_disp numeric;
BEGIN
  PERFORM 1 FROM proc_lote WHERE id = p_lote_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe', p_lote_id; END IF;
  SELECT COALESCE(disponible,0) INTO v_disp FROM proc_v_lote_saldos
   WHERE lote_id = p_lote_id AND empresa_id = p_empresa_id;
  IF p_kg > v_disp THEN
    RAISE EXCEPTION 'consumo % excede disponible % del lote %', p_kg, v_disp, p_lote_id;
  END IF;
  RETURN proc_fn_registrar_movimiento(
    p_empresa_id, NULL, NULL, 'consumo_proceso', 'salida', 'lote', p_lote_id,
    p_kg, 'consumo_proceso', p_ref_id, p_transaccion_id, NULL, p_actor);
END $$;

-- Reversa append-only: inserta el contramovimiento (signo opuesto), nunca edita/borra.
CREATE OR REPLACE FUNCTION proc_fn_reversar_movimiento(
  p_empresa_id uuid, p_mov_id uuid, p_motivo text, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE o proc_movimiento%ROWTYPE;
BEGIN
  SELECT * INTO o FROM proc_movimiento WHERE id = p_mov_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'movimiento % no existe', p_mov_id; END IF;
  IF o.es_reversa THEN RAISE EXCEPTION 'no se reversa una reversa (%)', p_mov_id; END IF;
  IF p_motivo IS NULL THEN RAISE EXCEPTION 'la reversa exige motivo'; END IF;
  RETURN proc_fn_registrar_movimiento(
    o.empresa_id, o.planta_id, o.temporada_codigo, o.tipo_movimiento,
    CASE WHEN o.naturaleza='entrada' THEN 'salida' ELSE 'entrada' END,
    o.objeto_tipo, o.objeto_id, o.cantidad, o.ref_tipo, o.ref_id,
    o.transaccion_id, p_motivo, p_actor, true, o.id);
END $$;

-- ============================================================================
-- SEEDS de sistema (sin tenant) — tipos de movimiento estructurales
-- ============================================================================
INSERT INTO proc_tipo_movimiento(codigo, nombre, naturaleza_default, permite_ambos, orden) VALUES
  ('recepcion',       'Recepción',            'entrada', false, 10),
  ('consumo_proceso', 'Consumo a proceso',    'salida',  false, 20),
  ('despacho',        'Despacho',             'salida',  false, 30),
  ('ajuste',          'Ajuste de inventario', 'entrada', true,  40)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================================
-- Triggers: touch + auditoría + bloqueo de mutación del ledger
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  -- touch updated_at (tablas con updated_at)
  FOREACH t IN ARRAY ARRAY[
    'proc_empresa_config','proc_catalogo_activacion','proc_temporada','proc_vinculo',
    'proc_planta','proc_predios','proc_calibre','proc_color','proc_recepcion','proc_lote'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
  END LOOP;

  -- auditoría (tablas de negocio; incluye holds; el ledger se audita solo en INSERT abajo)
  FOREACH t IN ARRAY ARRAY[
    'proc_empresa_config','proc_catalogo_activacion','proc_temporada','proc_vinculo',
    'proc_planta','proc_predios','proc_calibre','proc_color','proc_recepcion','proc_lote','proc_hold'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- Ledger: auditar INSERT y BLOQUEAR UPDATE/DELETE (append-only estricto).
DROP TRIGGER IF EXISTS trg_audit_proc_movimiento ON proc_movimiento;
CREATE TRIGGER trg_audit_proc_movimiento AFTER INSERT ON proc_movimiento
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();
DROP TRIGGER IF EXISTS trg_block_proc_movimiento ON proc_movimiento;
CREATE TRIGGER trg_block_proc_movimiento BEFORE UPDATE OR DELETE ON proc_movimiento
  FOR EACH ROW EXECUTE FUNCTION proc_fn_block_ledger_mutation();

-- ============================================================================
-- RLS — PRODUCTIVA por empresa_id (deny-by-default; FORCE; REVOKE anon)
-- La política permisiva de desarrollo va en schema_proc_v1_DEV_ONLY_rls.sql (NUNCA prod).
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
    'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
    'proc_recepcion','proc_lote','proc_movimiento','proc_hold'
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
  END LOOP;

  -- Ledger: sin UPDATE/DELETE (append-only). Solo SELECT+INSERT a authenticated.
  EXECUTE 'GRANT SELECT, INSERT ON proc_movimiento TO authenticated;';
  -- Resto: CRUD a authenticated.
  FOREACH t IN ARRAY ARRAY[
    'proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
    'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
    'proc_recepcion','proc_lote','proc_hold'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;

  -- Catálogo GLOBAL de sistema: solo lectura.
  EXECUTE 'ALTER TABLE proc_tipo_movimiento ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'REVOKE ALL ON proc_tipo_movimiento FROM anon;';
  EXECUTE 'GRANT SELECT ON proc_tipo_movimiento TO authenticated;';
  EXECUTE 'DROP POLICY IF EXISTS pol_proc_tipo_movimiento_cat ON proc_tipo_movimiento;';
  EXECUTE 'CREATE POLICY pol_proc_tipo_movimiento_cat ON proc_tipo_movimiento FOR SELECT TO authenticated USING (true);';
END $$;

-- ============================================================================
-- ⛔ GO-LIVE BLOCKER (ajuste #14). proc_* NO opera en producción mientras el
-- acceso dependa de anon + política permisiva. Go-live exige: identidad
-- autenticada por request, tenant verificable (claim empresa_id), RLS efectiva,
-- aislamiento cross-tenant probado, permisos/RBAC efectivos. DEV-ONLY = solo dev/staging.
-- ============================================================================
-- FIN schema_proc_v1.sql (RECONCILIADO). NO ejecutado contra la DB por este proyecto.
