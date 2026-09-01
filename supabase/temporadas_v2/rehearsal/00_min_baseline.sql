-- ============================================================================
-- rehearsal/00_min_baseline.sql — SCHEMA MÍNIMO FIEL para rehearsal LOCAL (Docker).
--
-- NO es el schema real. Reproduce SOLO las estructuras que tocan MS-G1..MS-G4,
-- con los NOMBRES y TIPOS de columna EXACTOS del baseline (el contrato):
--   · helpers proc_current_empresa/user, proc_fn_touch, proc_fn_audit, proc_audit_log
--   · proc_temporada (idéntica a schema_proc_v1)
--   · proc_correlativo + proc_fn_siguiente_correlativo ORIGINAL (buggy: acepta 's-t')
--   · tablas operativas con temporada (uuid en proc_recepcion; texto en el resto)
--   · proc_orden_proceso/proc_programa_proceso (temporada solo en el folio)
--   · contab_empresas + calendario_data para que el GUARD fail-closed de los scripts
--     10/20/30/40 pase EN LOCAL sembrando el fingerprint de STAGING a propósito.
--
-- El UUID de ALS (5aa10886-...) se siembra aquí SOLO para pasar el guard en Docker.
-- Esto es exactamente lo que documentan las "NOTA DE REHEARSAL" de cada script.
-- La defensa anti-producción real es que PROD tiene OTRO UUID para ALS.
-- ============================================================================

-- ── Helpers de tenant/seguridad (verbatim de schema_proc_v1) ─────────────────
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

-- ── Core stubs mínimos para el guard fail-closed ─────────────────────────────
CREATE TABLE IF NOT EXISTS contab_empresas (
  id     uuid PRIMARY KEY,
  codigo text NOT NULL
);
CREATE TABLE IF NOT EXISTS calendario_data (
  id         text PRIMARY KEY,
  value      jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── proc_temporada (verbatim de schema_proc_v1) ──────────────────────────────
CREATE TABLE IF NOT EXISTS proc_temporada (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  codigo         text NOT NULL,
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

-- ── proc_correlativo + función ORIGINAL (buggy) — verbatim de schema_proc_v7_f7_1 ─
CREATE TABLE IF NOT EXISTS proc_correlativo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  temporada_codigo  text NOT NULL,
  tipo_documento    text NOT NULL,
  prefijo           text NOT NULL,
  ultimo            int  NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid,
  UNIQUE (empresa_id, temporada_codigo, tipo_documento)
);
CREATE OR REPLACE FUNCTION proc_fn_siguiente_correlativo(
  p_empresa uuid, p_temporada text, p_tipo text, p_prefijo text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_n int; v_pref text; v_short text;
BEGIN
  IF p_empresa IS NULL OR p_temporada IS NULL OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'correlativo exige empresa, temporada y tipo';
  END IF;
  INSERT INTO proc_correlativo(empresa_id, temporada_codigo, tipo_documento, prefijo, ultimo)
    VALUES (p_empresa, p_temporada, p_tipo, COALESCE(NULLIF(p_prefijo,''), p_tipo), 1)
  ON CONFLICT (empresa_id, temporada_codigo, tipo_documento)
    DO UPDATE SET ultimo = proc_correlativo.ultimo + 1, updated_at = now()
  RETURNING ultimo, prefijo INTO v_n, v_pref;
  v_short := regexp_replace(p_temporada, '[^0-9]', '', 'g');
  IF length(v_short) = 8 THEN v_short := substr(v_short,3,2) || substr(v_short,7,2); END IF;
  RETURN v_pref || '-' || v_short || '-' || lpad(v_n::text, 6, '0');
END $$;

-- ── Ledger (temporada_codigo text) — columnas relevantes de schema_proc_v1 ────
CREATE TABLE IF NOT EXISTS proc_movimiento (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  temporada_codigo  text,
  objeto_tipo       text,
  objeto_id         uuid,
  cantidad          numeric(14,3),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── proc_recepcion: temporada por FK uuid (camino uuid del guard MS-G2) ───────
CREATE TABLE IF NOT EXISTS proc_recepcion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  folio         text NOT NULL,
  temporada_id  uuid REFERENCES proc_temporada(id),
  kg_neto       numeric(14,3),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, folio)
);

-- ── Resto de tablas operativas de texto (temporada_codigo text) ──────────────
CREATE TABLE IF NOT EXISTS proc_producto_terminado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, temporada_codigo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_pallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, temporada_codigo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_despacho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, temporada_codigo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_informe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, temporada_codigo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_base_cobro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, temporada_codigo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Orden/Programa: temporada SOLO en el folio (MS-G3 les agrega columna) ─────
CREATE TABLE IF NOT EXISTS proc_orden_proceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, folio text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_programa_proceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL, folio text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Tabla de resultados del rehearsal (agrega todas las fases) ───────────────
CREATE TABLE IF NOT EXISTS reh_res (
  seq        serial PRIMARY KEY,
  check_id   text NOT NULL,
  phase      text NOT NULL,       -- BEFORE | AFTER | ROLLBACK | REAPPLY
  passed     boolean NOT NULL,
  detail     text,
  at         timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- SEED de fingerprint STAGING (para que el GUARD fail-closed pase en LOCAL)
-- ============================================================================
INSERT INTO contab_empresas(id, codigo)
VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49', 'ALS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendario_data(id, value)
VALUES ('main', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Temporada ACTIVA para ALS (código '2526').
INSERT INTO proc_temporada(empresa_id, codigo, nombre, fecha_inicio, fecha_fin, estado)
VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49', '2526', 'Temporada 2025/2026',
        '2025-07-01', '2026-06-30', 'activa')
ON CONFLICT (empresa_id, codigo) DO NOTHING;
