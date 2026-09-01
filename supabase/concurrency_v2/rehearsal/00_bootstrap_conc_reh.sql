-- ============================================================================
-- rehearsal/00_bootstrap_conc_reh.sql
-- DEV-ONLY. Bootstrap del rehearsal LOCAL de concurrencia (DB conc_reh en Docker proc_uat).
-- Reproduce, MÍNIMO PERO FIEL, el subsistema de ledger de schema_proc_v1 necesario para ejercitar
-- CONC-B2 / CONC-B3 / idempotencia, con las funciones ORIGINALES (buggy) para la fase ANTES.
-- Los fixes (50/60/70) se aplican encima con SET conc.rehearsal='1'.
-- Este archivo NO representa esquema de producción; es un banco de pruebas aislado.
-- ============================================================================

-- Marcador que habilita el modo REHEARSAL en el preflight de 50/60/70/99.
CREATE TABLE IF NOT EXISTS _conc_rehearsal_ok (ok boolean NOT NULL DEFAULT true);
INSERT INTO _conc_rehearsal_ok DEFAULT VALUES;

-- ── Stubs de identidad/auditoría (fieles en comportamiento append-only) ──────
CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS proc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid, tabla text, registro_id uuid, accion text,
  valor_ant jsonb, valor_nue jsonb, usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION proc_fn_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_emp uuid; v_id uuid;
BEGIN
  IF (TG_OP='DELETE') THEN v_emp:=OLD.empresa_id; v_id:=OLD.id;
  ELSE v_emp:=NEW.empresa_id; v_id:=NEW.id; END IF;
  INSERT INTO proc_audit_log(empresa_id, tabla, registro_id, accion, valor_ant, valor_nue, usuario_id)
  VALUES (v_emp, TG_TABLE_NAME, v_id, lower(TG_OP),
          CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END, proc_current_user());
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION proc_fn_block_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'proc_movimiento es append-only: use reversa/contramovimiento, no %', TG_OP; END $$;

-- ── Objetos mínimos (para FOR UPDATE) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_lote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, codigo text, deleted_at timestamptz);
CREATE TABLE IF NOT EXISTS proc_producto_terminado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, codigo text, deleted_at timestamptz);
CREATE TABLE IF NOT EXISTS proc_pallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, codigo text, deleted_at timestamptz);

CREATE TABLE IF NOT EXISTS proc_tipo_movimiento (
  codigo text PRIMARY KEY, nombre text, naturaleza_default text, permite_ambos boolean, orden int);
INSERT INTO proc_tipo_movimiento(codigo, nombre, naturaleza_default, permite_ambos, orden) VALUES
  ('recepcion','Recepción','entrada',false,10),
  ('consumo_proceso','Consumo a proceso','salida',false,20),
  ('despacho','Despacho','salida',false,30),
  ('ajuste','Ajuste de inventario','entrada',true,40),
  ('repaletizaje','Repaletizaje','entrada',true,50),
  ('traslado','Traslado','entrada',true,60)
ON CONFLICT (codigo) DO NOTHING;

-- ── proc_movimiento (subset FIEL de schema_proc_v1, sin idempotency_key: como PROD hoy) ──
CREATE TABLE IF NOT EXISTS proc_movimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  planta_id uuid,
  temporada_codigo text,
  fecha timestamptz NOT NULL DEFAULT now(),
  tipo_movimiento text NOT NULL REFERENCES proc_tipo_movimiento(codigo),
  naturaleza text NOT NULL CHECK (naturaleza IN ('entrada','salida')),
  objeto_tipo text NOT NULL CHECK (objeto_tipo IN ('lote','producto_terminado','pallet')),
  objeto_id uuid NOT NULL,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad > 0),
  unidad text NOT NULL DEFAULT 'kg',
  ref_tipo text CHECK (ref_tipo IN ('recepcion','consumo_proceso','despacho','ajuste','repaletizaje')),
  ref_id uuid,
  es_reversa boolean NOT NULL DEFAULT false,
  revierte_movimiento_id uuid REFERENCES proc_movimiento(id),
  motivo text,
  transaccion_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_proc_mov_motivo  CHECK ((es_reversa = false AND tipo_movimiento <> 'ajuste') OR motivo IS NOT NULL),
  CONSTRAINT ck_proc_mov_reversa CHECK ((es_reversa = false) OR (revierte_movimiento_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_proc_mov_objeto ON proc_movimiento(objeto_tipo, objeto_id);
CREATE INDEX IF NOT EXISTS ix_proc_mov_tx     ON proc_movimiento(transaccion_id);

DROP TRIGGER IF EXISTS trg_audit_proc_movimiento ON proc_movimiento;
CREATE TRIGGER trg_audit_proc_movimiento AFTER INSERT ON proc_movimiento
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();
DROP TRIGGER IF EXISTS trg_block_proc_movimiento ON proc_movimiento;
CREATE TRIGGER trg_block_proc_movimiento BEFORE UPDATE OR DELETE ON proc_movimiento
  FOR EACH ROW EXECUTE FUNCTION proc_fn_block_ledger_mutation();

-- Helper de saldo on_hand para asserts del harness.
CREATE OR REPLACE FUNCTION reh_on_hand(p_emp uuid, p_tipo text, p_obj uuid) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(CASE WHEN naturaleza='entrada' THEN cantidad ELSE -cantidad END),0)
  FROM proc_movimiento WHERE empresa_id=p_emp AND objeto_tipo=p_tipo AND objeto_id=p_obj;
$$;

-- ============================================================================
-- Funciones ORIGINALES (buggy) — copia VERBATIM de schema_proc_v1 (fase ANTES).
-- 60_/70_ las reemplazan en la fase DESPUÉS.
-- ============================================================================
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
  -- (BUG CONC-B2) FOR UPDATE solo para lote; PT y pallet sin serializar.
  IF p_objeto_tipo = 'lote' THEN
    PERFORM 1 FROM proc_lote WHERE id = p_objeto_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe para empresa %', p_objeto_id, p_empresa_id; END IF;
  END IF;
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

CREATE OR REPLACE FUNCTION proc_fn_reversar_movimiento(
  p_empresa_id uuid, p_mov_id uuid, p_motivo text, p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE o proc_movimiento%ROWTYPE;
BEGIN
  -- (BUG CONC-B3) sin lock ni guarda de reversa previa.
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
