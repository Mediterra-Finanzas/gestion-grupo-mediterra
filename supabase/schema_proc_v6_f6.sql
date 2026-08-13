-- ============================================================================
-- schema_proc_v6_f6.sql · proc_* FASE 6 (Tarifario + Servicios Facturables + Base de Cobro)
-- INCREMENTAL sobre F1-F5. Ver docs/proceso-f6-diseno.md.
--
-- F6 = revenue/base de cobro. NO factura legal, NO CxC, NO contabilidad, NO pagos,
-- NO exp_*. El servicio facturable nace de HECHO OPERACIONAL REAL + REGLA TARIFARIA.
-- SoT: operación física (F1-F4) → información (F5) → tarifario (F6) → ERP (futuro).
--
-- Referencia del hecho facturable = XOR de FK REALES (patrón proc_vinculo), no
-- polimórfica falsa. Tarifa por vigencia + SNAPSHOT congelado. Idempotencia por
-- clave única. Cliente desde proc_vinculo (regla Frisku != Service).
-- ============================================================================

-- ── Maestro de tipos de servicio (del backlog F2) ───────────────────────────
CREATE TABLE IF NOT EXISTS proc_tipo_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  unidad_default text NOT NULL DEFAULT 'kg_procesado',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, codigo)
);

-- Unidades de cobro válidas (compatibilidad servicio↔unidad; no strings libres)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='proc_unidad_cobro') THEN
    CREATE DOMAIN proc_unidad_cobro AS text CHECK (VALUE IN
      ('kg_procesado','caja','pallet','evento','dia','pallet_dia','kg_dia','camara_dia','hora','unidad','monto_fijo'));
  END IF;
END $$;

-- ── Tarifa versionable por vigencia (no hardcode; cliente vía proc_vinculo) ──
CREATE TABLE IF NOT EXISTS proc_tarifa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  tipo_servicio_id uuid NOT NULL REFERENCES proc_tipo_servicio(id),
  cliente_vinculo_id uuid REFERENCES proc_vinculo(id),   -- null = tarifa general
  temporada_codigo text, especie_codigo text,            -- null = cualquiera
  unidad proc_unidad_cobro NOT NULL,
  tarifa numeric(14,4) NOT NULL CHECK (tarifa >= 0),
  moneda text NOT NULL DEFAULT 'USD',
  vigencia_desde date NOT NULL, vigencia_hasta date,
  prioridad int NOT NULL DEFAULT 0,
  condiciones jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','cerrada','anulada')),
  observaciones text, version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);
CREATE INDEX IF NOT EXISTS ix_proc_tarifa_res ON proc_tarifa(empresa_id, tipo_servicio_id, estado) WHERE deleted_at IS NULL;

-- ── Servicio facturable (hecho + regla). Origen = XOR de FK reales. ──────────
CREATE TABLE IF NOT EXISTS proc_servicio_facturable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  tipo_servicio_id uuid NOT NULL REFERENCES proc_tipo_servicio(id),
  cliente_vinculo_id uuid REFERENCES proc_vinculo(id),
  -- Origen del hecho (XOR real; automático = exactamente uno; manual = ninguno)
  origen_tipo text NOT NULL CHECK (origen_tipo IN ('orden','repaletizaje','pallet','manual')),
  orden_id uuid REFERENCES proc_orden_proceso(id),
  repaletizaje_id uuid REFERENCES proc_repaletizaje(id),
  pallet_id uuid REFERENCES proc_pallet(id),
  fecha_hecho date NOT NULL,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad >= 0),
  unidad proc_unidad_cobro NOT NULL,
  -- Snapshot de tarifa (congelado; el cambio posterior del tarifario no lo altera)
  tarifa_id uuid REFERENCES proc_tarifa(id),
  tarifa_aplicada numeric(14,4), moneda text, unidad_tarifa proc_unidad_cobro, vigencia_usada date,
  subtotal numeric(14,2),
  estado text NOT NULL DEFAULT 'generado'
    CHECK (estado IN ('generado','pendiente_tarifa','valorizado','revisado','facturable','anulado')),
  es_manual boolean NOT NULL DEFAULT false, motivo text, autorizado_por uuid,
  clave_idempotencia text,   -- único cuando no null (evita doble cobro del mismo hecho+servicio)
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  -- XOR de origen (automático = una FK que coincide con origen_tipo; manual = ninguna)
  CONSTRAINT ck_proc_sf_origen CHECK (
    (origen_tipo='manual'      AND orden_id IS NULL AND repaletizaje_id IS NULL AND pallet_id IS NULL) OR
    (origen_tipo='orden'       AND orden_id IS NOT NULL AND repaletizaje_id IS NULL AND pallet_id IS NULL) OR
    (origen_tipo='repaletizaje'AND repaletizaje_id IS NOT NULL AND orden_id IS NULL AND pallet_id IS NULL) OR
    (origen_tipo='pallet'      AND pallet_id IS NOT NULL AND orden_id IS NULL AND repaletizaje_id IS NULL)
  ),
  -- manual exige motivo + autorización (punto 11)
  CONSTRAINT ck_proc_sf_manual CHECK (es_manual=false OR (motivo IS NOT NULL AND autorizado_por IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_sf_idem ON proc_servicio_facturable(empresa_id, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_proc_sf_emp ON proc_servicio_facturable(empresa_id) WHERE deleted_at IS NULL;

-- ── Base de cobro (agrupación; aún NO factura) ──────────────────────────────
CREATE TABLE IF NOT EXISTS proc_base_cobro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  folio text NOT NULL, cliente_vinculo_id uuid REFERENCES proc_vinculo(id),
  temporada_codigo text, periodo_desde date, periodo_hasta date, moneda text NOT NULL DEFAULT 'USD',
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','en_revision','aprobada','enviada_a_facturacion','cerrada','anulada')),
  total numeric(14,2) NOT NULL DEFAULT 0,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, folio)
);
CREATE TABLE IF NOT EXISTS proc_base_cobro_linea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  base_cobro_id uuid NOT NULL REFERENCES proc_base_cobro(id),
  servicio_facturable_id uuid NOT NULL REFERENCES proc_servicio_facturable(id),
  subtotal numeric(14,2),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (servicio_facturable_id)   -- un servicio en una sola base
);
CREATE INDEX IF NOT EXISTS ix_proc_bcl_base ON proc_base_cobro_linea(base_cobro_id);

-- ── Guards de inmutabilidad ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_base_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IN ('aprobada','enviada_a_facturacion','cerrada','anulada') THEN
    IF NEW.estado = OLD.estado THEN RAISE EXCEPTION 'base % en estado % no editable', OLD.folio, OLD.estado; END IF;
    IF NOT (
      (OLD.estado='aprobada' AND NEW.estado IN ('enviada_a_facturacion','anulada')) OR
      (OLD.estado='enviada_a_facturacion' AND NEW.estado IN ('cerrada','anulada'))
    ) THEN RAISE EXCEPTION 'transición de base inválida: % → %', OLD.estado, NEW.estado; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_base_guard ON proc_base_cobro;
CREATE TRIGGER trg_base_guard BEFORE UPDATE ON proc_base_cobro FOR EACH ROW EXECUTE FUNCTION proc_fn_base_guard();

-- No agregar/quitar líneas de una base aprobada+
CREATE OR REPLACE FUNCTION proc_fn_base_linea_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM proc_base_cobro WHERE id = COALESCE(NEW.base_cobro_id, OLD.base_cobro_id);
  IF v_estado IN ('aprobada','enviada_a_facturacion','cerrada','anulada') THEN
    RAISE EXCEPTION 'base en estado % no admite cambios de líneas', v_estado;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_base_linea_guard ON proc_base_cobro_linea;
CREATE TRIGGER trg_base_linea_guard BEFORE INSERT OR UPDATE OR DELETE ON proc_base_cobro_linea FOR EACH ROW EXECUTE FUNCTION proc_fn_base_linea_guard();

-- Servicio incluido en una base aprobada+ no editable (punto 21)
CREATE OR REPLACE FUNCTION proc_fn_servicio_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM proc_base_cobro_linea l JOIN proc_base_cobro b ON b.id=l.base_cobro_id
             WHERE l.servicio_facturable_id=OLD.id AND b.estado IN ('aprobada','enviada_a_facturacion','cerrada')) THEN
    RAISE EXCEPTION 'servicio facturable en base aprobada: no editable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_servicio_guard ON proc_servicio_facturable;
CREATE TRIGGER trg_servicio_guard BEFORE UPDATE ON proc_servicio_facturable FOR EACH ROW EXECUTE FUNCTION proc_fn_servicio_guard();

-- ── RPC ──────────────────────────────────────────────────────────────────────
-- Resolución determinística de tarifa por vigencia + especificidad + prioridad.
CREATE OR REPLACE FUNCTION proc_fn_resolver_tarifa(
  p_empresa_id uuid, p_cliente uuid, p_temporada text, p_especie text, p_tipo_servicio uuid, p_fecha date
) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM proc_tarifa
  WHERE empresa_id=p_empresa_id AND tipo_servicio_id=p_tipo_servicio AND estado='vigente' AND deleted_at IS NULL
    AND vigencia_desde <= p_fecha AND (vigencia_hasta IS NULL OR vigencia_hasta >= p_fecha)
    AND (cliente_vinculo_id IS NULL OR cliente_vinculo_id = p_cliente)
    AND (temporada_codigo IS NULL OR temporada_codigo = p_temporada)
    AND (especie_codigo IS NULL OR especie_codigo = p_especie)
  ORDER BY (cliente_vinculo_id IS NOT NULL)::int DESC, (temporada_codigo IS NOT NULL)::int DESC,
           (especie_codigo IS NOT NULL)::int DESC, prioridad DESC, vigencia_desde DESC
  LIMIT 1;
$$;

-- Servicio de proceso: cantidad = kg PROCESADOS de la orden cerrada/conciliada (no recibidos).
CREATE OR REPLACE FUNCTION proc_fn_generar_servicio_proceso(
  p_empresa_id uuid, p_orden_id uuid, p_cliente uuid, p_tipo_servicio uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_kg numeric; v_fecha date; v_esp text; v_temp text; v_estado text; v_clave text;
  v_tid uuid; v_tar numeric; v_mon text; v_uni proc_unidad_cobro; v_vd date; v_sub numeric; v_est text; v_id uuid;
BEGIN
  SELECT estado, fecha, especie_codigo INTO v_estado, v_fecha, v_esp
    FROM proc_orden_proceso WHERE id=p_orden_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden % no existe', p_orden_id; END IF;
  IF v_estado NOT IN ('conciliado','cerrado') THEN RAISE EXCEPTION 'orden no cerrada/conciliada (está %)', v_estado; END IF;
  SELECT COALESCE(SUM(kg),0) INTO v_kg FROM proc_orden_insumo WHERE orden_id=p_orden_id;  -- kg PROCESADOS
  -- temporada derivada del movimiento de entrada del lote consumido (la orden no la lleva)
  SELECT m.temporada_codigo INTO v_temp FROM proc_orden_insumo i
    JOIN proc_movimiento m ON m.objeto_tipo='lote' AND m.objeto_id=i.lote_id AND m.naturaleza='entrada'
    WHERE i.orden_id=p_orden_id LIMIT 1;
  v_clave := 'orden:'||p_orden_id||':srv:'||p_tipo_servicio;
  IF EXISTS (SELECT 1 FROM proc_servicio_facturable WHERE empresa_id=p_empresa_id AND clave_idempotencia=v_clave) THEN
    RAISE EXCEPTION 'ya existe servicio facturable para orden %/servicio (idempotencia)', p_orden_id;
  END IF;
  v_tid := proc_fn_resolver_tarifa(p_empresa_id, p_cliente, v_temp, v_esp, p_tipo_servicio, v_fecha);
  IF v_tid IS NOT NULL THEN
    SELECT tarifa, moneda, unidad, vigencia_desde INTO v_tar, v_mon, v_uni, v_vd FROM proc_tarifa WHERE id=v_tid;
    v_sub := round(v_kg * v_tar, 2); v_est := 'valorizado';
  ELSE v_est := 'pendiente_tarifa'; v_uni := (SELECT unidad_default FROM proc_tipo_servicio WHERE id=p_tipo_servicio); END IF;
  INSERT INTO proc_servicio_facturable(empresa_id, tipo_servicio_id, cliente_vinculo_id, origen_tipo, orden_id,
    fecha_hecho, cantidad, unidad, tarifa_id, tarifa_aplicada, moneda, unidad_tarifa, vigencia_usada, subtotal, estado, clave_idempotencia, created_by)
  VALUES (p_empresa_id, p_tipo_servicio, p_cliente, 'orden', p_orden_id, v_fecha, v_kg,
    COALESCE(v_uni,'kg_procesado'), v_tid, v_tar, v_mon, v_uni, v_vd, v_sub, v_est, v_clave, p_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Servicio manual (exige motivo + autorización)
CREATE OR REPLACE FUNCTION proc_fn_generar_servicio_manual(
  p_empresa_id uuid, p_cliente uuid, p_tipo_servicio uuid, p_cantidad numeric, p_unidad proc_unidad_cobro,
  p_tarifa numeric, p_moneda text, p_fecha date, p_motivo text, p_autorizado_por uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  IF p_motivo IS NULL OR p_autorizado_por IS NULL THEN RAISE EXCEPTION 'línea manual exige motivo y autorización'; END IF;
  INSERT INTO proc_servicio_facturable(empresa_id, tipo_servicio_id, cliente_vinculo_id, origen_tipo, fecha_hecho,
    cantidad, unidad, tarifa_aplicada, moneda, unidad_tarifa, subtotal, estado, es_manual, motivo, autorizado_por, created_by)
  VALUES (p_empresa_id, p_tipo_servicio, p_cliente, 'manual', p_fecha, p_cantidad, p_unidad, p_tarifa, p_moneda, p_unidad,
    round(p_cantidad*p_tarifa,2), 'valorizado', true, p_motivo, p_autorizado_por, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION proc_fn_crear_base_cobro(
  p_empresa_id uuid, p_folio text, p_cliente uuid, p_temporada text, p_desde date, p_hasta date, p_moneda text, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_base_cobro(empresa_id, folio, cliente_vinculo_id, temporada_codigo, periodo_desde, periodo_hasta, moneda, created_by)
  VALUES (p_empresa_id, p_folio, p_cliente, p_temporada, p_desde, p_hasta, COALESCE(p_moneda,'USD'), p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Agregar un servicio valorizado a una base (misma moneda; recalcula total)
CREATE OR REPLACE FUNCTION proc_fn_agregar_a_base(
  p_empresa_id uuid, p_base_id uuid, p_servicio_id uuid, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_sub numeric; v_mon_s text; v_est_s text; v_mon_b text; v_est_b text;
BEGIN
  SELECT estado, moneda INTO v_est_b, v_mon_b FROM proc_base_cobro WHERE id=p_base_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'base % no existe', p_base_id; END IF;
  IF v_est_b NOT IN ('borrador','en_revision') THEN RAISE EXCEPTION 'base en % no admite líneas', v_est_b; END IF;
  SELECT subtotal, moneda, estado INTO v_sub, v_mon_s, v_est_s FROM proc_servicio_facturable WHERE id=p_servicio_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'servicio % no existe', p_servicio_id; END IF;
  IF v_est_s NOT IN ('valorizado','revisado','facturable') THEN RAISE EXCEPTION 'servicio no valorizado (está %)', v_est_s; END IF;
  IF v_mon_s IS DISTINCT FROM v_mon_b THEN RAISE EXCEPTION 'moneda del servicio (%) != base (%)', v_mon_s, v_mon_b; END IF;
  INSERT INTO proc_base_cobro_linea(empresa_id, base_cobro_id, servicio_facturable_id, subtotal, created_by)
  VALUES (p_empresa_id, p_base_id, p_servicio_id, v_sub, p_actor);
  UPDATE proc_servicio_facturable SET estado='facturable', updated_by=p_actor WHERE id=p_servicio_id;
  UPDATE proc_base_cobro SET total=(SELECT COALESCE(SUM(subtotal),0) FROM proc_base_cobro_linea WHERE base_cobro_id=p_base_id), updated_by=p_actor WHERE id=p_base_id;
END $$;

CREATE OR REPLACE FUNCTION proc_fn_aprobar_base(p_empresa_id uuid, p_base_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_est text;
BEGIN
  SELECT estado INTO v_est FROM proc_base_cobro WHERE id=p_base_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF v_est NOT IN ('borrador','en_revision') THEN RAISE EXCEPTION 'solo se aprueba una base borrador/en_revision (está %)', v_est; END IF;
  UPDATE proc_base_cobro SET estado='aprobada', updated_by=p_actor WHERE id=p_base_id;
END $$;

-- ── Triggers touch + auditoría ───────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- ── RLS productiva ───────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN schema_proc_v6_f6.sql — INCREMENTAL. Revenue/base de cobro (F6). NO factura legal.
-- NO aplicado a producción. GO-LIVE blocker hereda de F1. Siguiente gate: UAT F1-F6.
