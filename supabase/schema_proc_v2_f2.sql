-- ============================================================================
-- schema_proc_v2_f2.sql · proc_* FASE 2 (ejecución de proceso) — INCREMENTAL sobre F1
-- Requiere schema_proc_v1.sql aplicado (F1 VALIDATED). NO reescribe F1; extiende.
-- Ver docs/proceso-f2-diseno.md (gate F2 ratificado 2026-08-13).
--
-- Alcance: QC recepción configurable · inventario pre-proceso por ubicación ·
-- programa · orden de proceso · consumo con genealogía (N:M, vía ledger F1) ·
-- resultado + descarte/merma + conciliación de masa. NO crea PT/cajas/pallets (F3).
--
-- Invariantes duras (CFO):
--   · Traslado interno = naturaleza 'transferencia' → NO cambia stock físico total,
--     solo la distribución por ubicación (vista total lo excluye).
--   · Consumo genera movimiento (ledger) Y lineage (proc_orden_insumo) atómicamente.
--   · Ledger sigue siendo la única SoT del saldo físico. Sin doble conteo.
--   · Orden no cierra sin conciliar (enforcement en trigger).
-- ============================================================================

-- ── 1. Extensión del ledger F1: transferencia interna + ubicaciones ──────────
-- Añade 'transferencia' a la naturaleza (F1: entrada/salida). Idempotente.
ALTER TABLE proc_movimiento DROP CONSTRAINT IF EXISTS proc_movimiento_naturaleza_check;
ALTER TABLE proc_movimiento
  ADD CONSTRAINT proc_movimiento_naturaleza_check
  CHECK (naturaleza IN ('entrada','salida','transferencia'));

ALTER TABLE proc_tipo_movimiento DROP CONSTRAINT IF EXISTS proc_tipo_movimiento_naturaleza_default_check;
ALTER TABLE proc_tipo_movimiento
  ADD CONSTRAINT proc_tipo_movimiento_naturaleza_default_check
  CHECK (naturaleza_default IN ('entrada','salida','transferencia'));

ALTER TABLE proc_movimiento ADD COLUMN IF NOT EXISTS ubicacion_origen_id  uuid;
ALTER TABLE proc_movimiento ADD COLUMN IF NOT EXISTS ubicacion_destino_id uuid;

INSERT INTO proc_tipo_movimiento(codigo, nombre, naturaleza_default, permite_ambos, orden) VALUES
  ('traslado', 'Traslado interno (transferencia)', 'transferencia', false, 50)
ON CONFLICT (codigo) DO NOTHING;

-- ── 2. Maestros F2 (del backlog; patrón F1 estándar) ─────────────────────────
CREATE TABLE IF NOT EXISTS proc_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  planta_id uuid NOT NULL REFERENCES proc_planta(id),
  parent_id uuid REFERENCES proc_ubicaciones(id),
  codigo text NOT NULL, nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'ubicacion' CHECK (tipo IN ('camara','zona','ubicacion','patio')),
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, planta_id, codigo)
);
CREATE INDEX IF NOT EXISTS ix_proc_ubic_emp ON proc_ubicaciones(empresa_id) WHERE deleted_at IS NULL;

-- FK de las columnas de ubicación del ledger (ahora que existe proc_ubicaciones)
ALTER TABLE proc_movimiento DROP CONSTRAINT IF EXISTS fk_proc_mov_ubic_ori;
ALTER TABLE proc_movimiento DROP CONSTRAINT IF EXISTS fk_proc_mov_ubic_des;
ALTER TABLE proc_movimiento
  ADD CONSTRAINT fk_proc_mov_ubic_ori FOREIGN KEY (ubicacion_origen_id)  REFERENCES proc_ubicaciones(id),
  ADD CONSTRAINT fk_proc_mov_ubic_des FOREIGN KEY (ubicacion_destino_id) REFERENCES proc_ubicaciones(id);
-- Coherencia de ubicaciones por naturaleza (transferencia exige ambas y distintas)
ALTER TABLE proc_movimiento DROP CONSTRAINT IF EXISTS ck_proc_mov_transfer;
ALTER TABLE proc_movimiento
  ADD CONSTRAINT ck_proc_mov_transfer CHECK (
    naturaleza <> 'transferencia'
    OR (ubicacion_origen_id IS NOT NULL AND ubicacion_destino_id IS NOT NULL
        AND ubicacion_origen_id <> ubicacion_destino_id)
  );

CREATE TABLE IF NOT EXISTS proc_condiciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  ambito text NOT NULL DEFAULT 'recepcion' CHECK (ambito IN ('recepcion','qc','proceso')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, codigo)
);
CREATE TABLE IF NOT EXISTS proc_lineas_proceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  planta_id uuid NOT NULL REFERENCES proc_planta(id),
  codigo text NOT NULL, nombre text NOT NULL, activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, planta_id, codigo)
);
CREATE TABLE IF NOT EXISTS proc_categorias_calidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  es_comercial boolean NOT NULL DEFAULT true, orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, codigo)
);
CREATE TABLE IF NOT EXISTS proc_motivos_descarte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, codigo)
);
CREATE TABLE IF NOT EXISTS proc_motivos_merma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, codigo)
);

-- ── 3. QC de recepción configurable (DF2-1) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_qc_parametro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  especie_codigo text NOT NULL,
  codigo text NOT NULL, nombre text NOT NULL,
  tipo_dato text NOT NULL CHECK (tipo_dato IN ('numero','texto','booleano')),
  unidad text, rango_min numeric(14,4), rango_max numeric(14,4),
  obligatorio boolean NOT NULL DEFAULT false, orden int NOT NULL DEFAULT 0,
  -- scope opcional para extensión futura sin rediseño (cliente/temporada):
  cliente_vinculo_id uuid REFERENCES proc_vinculo(id), temporada_codigo text,
  vigencia_desde date, vigencia_hasta date, activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, especie_codigo, codigo),
  CHECK (rango_min IS NULL OR rango_max IS NULL OR rango_min <= rango_max)
);
CREATE TABLE IF NOT EXISTS proc_qc_recepcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  recepcion_id uuid NOT NULL REFERENCES proc_recepcion(id),
  fecha timestamptz NOT NULL DEFAULT now(),
  valores jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {param_codigo: valor}; validación de tipo/rango en dominio+RPC
  resultado text NOT NULL DEFAULT 'condicional' CHECK (resultado IN ('aprobado','rechazado','condicional')),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, recepcion_id)
);

-- ── 4. Programa (planifica) y Orden (ejecuta) — DF2-4 ────────────────────────
CREATE TABLE IF NOT EXISTS proc_programa_proceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  folio text NOT NULL, fecha date NOT NULL, turno text,
  planta_id uuid REFERENCES proc_planta(id), linea_id uuid REFERENCES proc_lineas_proceso(id),
  cliente_servicio_vinculo_id uuid REFERENCES proc_vinculo(id),
  especie_codigo text, variedad_codigo text,
  lotes_previstos jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array de lote_id previstos
  kg_estimado numeric(14,3) CHECK (kg_estimado >= 0), prioridad int NOT NULL DEFAULT 0,
  instrucciones text,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado','cerrado')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, folio)
);
CREATE TABLE IF NOT EXISTS proc_orden_proceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  folio text NOT NULL, fecha date NOT NULL DEFAULT current_date,
  programa_id uuid REFERENCES proc_programa_proceso(id),
  planta_id uuid REFERENCES proc_planta(id), linea_id uuid REFERENCES proc_lineas_proceso(id),
  turno text, cliente_servicio_vinculo_id uuid REFERENCES proc_vinculo(id),
  especie_codigo text, variedad_codigo text,
  hora_inicio timestamptz, hora_fin timestamptz,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','en_proceso','pendiente_conciliacion','conciliado','cerrado','anulado')),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, UNIQUE (empresa_id, folio)
);
CREATE INDEX IF NOT EXISTS ix_proc_orden_emp ON proc_orden_proceso(empresa_id) WHERE deleted_at IS NULL;

-- ── 5. Consumo con genealogía (N:M orden↔lote) ───────────────────────────────
-- Cada fila = un consumo respaldado por un movimiento de ledger (movimiento_id).
CREATE TABLE IF NOT EXISTS proc_orden_insumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  orden_id uuid NOT NULL REFERENCES proc_orden_proceso(id),
  lote_id uuid NOT NULL REFERENCES proc_lote(id),
  kg numeric(14,3) NOT NULL CHECK (kg > 0),
  pct numeric(7,4),  -- kg / kg_inicial del lote (derivado)
  movimiento_id uuid NOT NULL REFERENCES proc_movimiento(id),  -- respaldo físico (obligatorio)
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_proc_ins_orden ON proc_orden_insumo(orden_id);
CREATE INDEX IF NOT EXISTS ix_proc_ins_lote  ON proc_orden_insumo(lote_id);

-- ── 6. Resultado de proceso (kg por dimensiones; SIN cajas/pallets — DF2-2) ───
CREATE TABLE IF NOT EXISTS proc_resultado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  orden_id uuid NOT NULL REFERENCES proc_orden_proceso(id),
  categoria_id uuid REFERENCES proc_categorias_calidad(id),
  calibre_id uuid REFERENCES proc_calibre(id), color_id uuid REFERENCES proc_color(id),
  calidad text, formato_conceptual text,
  kg numeric(14,3) NOT NULL CHECK (kg > 0), pct numeric(7,4),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_proc_res_orden ON proc_resultado(orden_id) WHERE deleted_at IS NULL;

-- Descarte y merma SEPARADOS (no sinónimos).
CREATE TABLE IF NOT EXISTS proc_resultado_descarte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  orden_id uuid NOT NULL REFERENCES proc_orden_proceso(id),
  motivo_descarte_id uuid REFERENCES proc_motivos_descarte(id),
  kg numeric(14,3) NOT NULL CHECK (kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS proc_resultado_merma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  orden_id uuid NOT NULL REFERENCES proc_orden_proceso(id),
  motivo_merma_id uuid REFERENCES proc_motivos_merma(id),
  kg numeric(14,3) NOT NULL CHECK (kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);

-- ── 7. Vistas de saldo (total excluye transferencia; + saldo por ubicación) ──
-- Reemplaza la vista F1 para que 'transferencia' NO afecte el total físico.
CREATE OR REPLACE VIEW proc_v_lote_saldos AS
SELECT l.id AS lote_id, l.empresa_id,
  COALESCE(m.on_hand,0) AS on_hand,
  COALESCE(h.bloqueado,0) AS bloqueado, COALESCE(h.reservado,0) AS reservado,
  COALESCE(m.on_hand,0) - COALESCE(h.bloqueado,0) - COALESCE(h.reservado,0) AS disponible
FROM proc_lote l
LEFT JOIN (
  SELECT objeto_id, empresa_id,
         SUM(CASE WHEN naturaleza='entrada' THEN cantidad
                  WHEN naturaleza='salida'  THEN -cantidad
                  ELSE 0 END) AS on_hand           -- 'transferencia' NO afecta total
  FROM proc_movimiento WHERE objeto_tipo='lote' GROUP BY objeto_id, empresa_id
) m ON m.objeto_id = l.id AND m.empresa_id = l.empresa_id
LEFT JOIN (
  SELECT objeto_id, empresa_id,
         SUM(CASE WHEN tipo='bloqueo' THEN cantidad ELSE 0 END) AS bloqueado,
         SUM(CASE WHEN tipo='reserva' THEN cantidad ELSE 0 END) AS reservado
  FROM proc_hold WHERE objeto_tipo='lote' AND estado='activo' GROUP BY objeto_id, empresa_id
) h ON h.objeto_id = l.id AND h.empresa_id = l.empresa_id
WHERE l.deleted_at IS NULL;
ALTER VIEW proc_v_lote_saldos SET (security_invoker = on);

-- Saldo por ubicación: crédito (destino) − débito (origen), incluyendo transferencias.
CREATE OR REPLACE VIEW proc_v_lote_ubicacion AS
SELECT lote_id, empresa_id, ubicacion_id, SUM(delta) AS saldo FROM (
  SELECT objeto_id AS lote_id, empresa_id, ubicacion_destino_id AS ubicacion_id, cantidad AS delta
  FROM proc_movimiento
  WHERE objeto_tipo='lote' AND ubicacion_destino_id IS NOT NULL AND naturaleza IN ('entrada','transferencia')
  UNION ALL
  SELECT objeto_id, empresa_id, ubicacion_origen_id, -cantidad
  FROM proc_movimiento
  WHERE objeto_tipo='lote' AND ubicacion_origen_id IS NOT NULL AND naturaleza IN ('salida','transferencia')
) t GROUP BY lote_id, empresa_id, ubicacion_id;
ALTER VIEW proc_v_lote_ubicacion SET (security_invoker = on);

-- Conciliación por orden (derivada): entrada vs salidas + estado dentro de tolerancia.
CREATE OR REPLACE VIEW proc_v_orden_conciliacion AS
SELECT o.id AS orden_id, o.empresa_id,
  COALESCE(i.kg_entrada,0) AS kg_entrada,
  COALESCE(r.kg_resultado,0) AS kg_resultado,
  COALESCE(d.kg_descarte,0) AS kg_descarte,
  COALESCE(mm.kg_merma,0) AS kg_merma,
  COALESCE(i.kg_entrada,0) - (COALESCE(r.kg_resultado,0)+COALESCE(d.kg_descarte,0)+COALESCE(mm.kg_merma,0)) AS diff,
  COALESCE(i.kg_entrada,0) * COALESCE(c.tolerancia_masa_pct,0)/100 AS tolerancia
FROM proc_orden_proceso o
LEFT JOIN (SELECT orden_id, SUM(kg) kg_entrada FROM proc_orden_insumo GROUP BY orden_id) i ON i.orden_id=o.id
LEFT JOIN (SELECT orden_id, SUM(kg) kg_resultado FROM proc_resultado WHERE deleted_at IS NULL GROUP BY orden_id) r ON r.orden_id=o.id
LEFT JOIN (SELECT orden_id, SUM(kg) kg_descarte FROM proc_resultado_descarte WHERE deleted_at IS NULL GROUP BY orden_id) d ON d.orden_id=o.id
LEFT JOIN (SELECT orden_id, SUM(kg) kg_merma FROM proc_resultado_merma WHERE deleted_at IS NULL GROUP BY orden_id) mm ON mm.orden_id=o.id
LEFT JOIN proc_empresa_config c ON c.empresa_id = o.empresa_id
WHERE o.deleted_at IS NULL;
ALTER VIEW proc_v_orden_conciliacion SET (security_invoker = on);

-- ── 8. Máquina de estados de la orden (transiciones + conciliación obligatoria) ─
CREATE OR REPLACE FUNCTION proc_fn_orden_transicion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_diff numeric; v_tol numeric;
BEGIN
  -- Orden en estado terminal: NO editable (ningún campo) — CFO DF2/estados.
  IF OLD.estado IN ('cerrado','anulado') THEN
    RAISE EXCEPTION 'orden % en estado % no editable', OLD.folio, OLD.estado;
  END IF;
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
  -- transiciones permitidas
  IF NOT (
    (OLD.estado='borrador'               AND NEW.estado IN ('en_proceso','anulado')) OR
    (OLD.estado='en_proceso'             AND NEW.estado IN ('pendiente_conciliacion','anulado')) OR
    (OLD.estado='pendiente_conciliacion' AND NEW.estado IN ('conciliado','en_proceso','anulado')) OR
    (OLD.estado='conciliado'             AND NEW.estado IN ('cerrado','en_proceso','anulado'))
  ) THEN
    RAISE EXCEPTION 'transición de orden inválida: % → %', OLD.estado, NEW.estado;
  END IF;
  -- conciliación obligatoria: pasar a 'conciliado' exige cuadratura ≤ tolerancia
  IF NEW.estado = 'conciliado' THEN
    SELECT diff, tolerancia INTO v_diff, v_tol FROM proc_v_orden_conciliacion WHERE orden_id = NEW.id;
    IF abs(COALESCE(v_diff,0)) > COALESCE(v_tol,0) THEN
      RAISE EXCEPTION 'orden % no concilia: |diff|=% > tolerancia=%', NEW.folio, abs(v_diff), v_tol;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orden_transicion ON proc_orden_proceso;
CREATE TRIGGER trg_orden_transicion BEFORE UPDATE ON proc_orden_proceso
  FOR EACH ROW EXECUTE FUNCTION proc_fn_orden_transicion();

-- ── 9. RPC transaccionales F2 ────────────────────────────────────────────────
-- Ingreso de lote ubicado (F2): crea lote + movimiento recepción con ubicación destino.
CREATE OR REPLACE FUNCTION proc_fn_ingresar_lote_ubicado(
  p_empresa_id uuid, p_recepcion_id uuid, p_codigo text, p_especie text, p_variedad text,
  p_kg numeric, p_planta_id uuid, p_temporada text, p_ubicacion_id uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_lote uuid; v_tx uuid := gen_random_uuid();
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg del lote debe ser > 0'; END IF;
  INSERT INTO proc_lote(empresa_id, recepcion_id, codigo, especie_codigo, variedad_codigo, ubicacion, created_by)
  VALUES (p_empresa_id, p_recepcion_id, p_codigo, p_especie, p_variedad, NULL, p_actor) RETURNING id INTO v_lote;
  INSERT INTO proc_movimiento(empresa_id, planta_id, temporada_codigo, tipo_movimiento, naturaleza,
    objeto_tipo, objeto_id, cantidad, ubicacion_destino_id, ref_tipo, ref_id, transaccion_id, created_by)
  VALUES (p_empresa_id, p_planta_id, p_temporada, 'recepcion', 'entrada',
    'lote', v_lote, p_kg, p_ubicacion_id, 'recepcion', p_recepcion_id, v_tx, p_actor);
  RETURN v_lote;
END $$;

-- Traslado interno: transferencia entre ubicaciones (NO cambia stock total).
CREATE OR REPLACE FUNCTION proc_fn_trasladar(
  p_empresa_id uuid, p_lote_id uuid, p_ubic_origen uuid, p_ubic_destino uuid,
  p_kg numeric, p_motivo text, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_saldo_ori numeric; v_mov uuid;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg de traslado debe ser > 0'; END IF;
  IF p_ubic_origen = p_ubic_destino THEN RAISE EXCEPTION 'origen y destino no pueden ser iguales'; END IF;
  PERFORM 1 FROM proc_lote WHERE id=p_lote_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe', p_lote_id; END IF;
  SELECT COALESCE(saldo,0) INTO v_saldo_ori FROM proc_v_lote_ubicacion
   WHERE lote_id=p_lote_id AND empresa_id=p_empresa_id AND ubicacion_id=p_ubic_origen;
  IF p_kg > COALESCE(v_saldo_ori,0) THEN
    RAISE EXCEPTION 'traslado % excede saldo % en ubicación origen', p_kg, COALESCE(v_saldo_ori,0);
  END IF;
  INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id,
    cantidad, ubicacion_origen_id, ubicacion_destino_id, ref_tipo, motivo, created_by)
  VALUES (p_empresa_id, 'traslado', 'transferencia', 'lote', p_lote_id,
    p_kg, p_ubic_origen, p_ubic_destino, 'ajuste', p_motivo, p_actor) RETURNING id INTO v_mov;
  RETURN v_mov;
END $$;

-- Consumo de lote en orden: movimiento (ledger) + lineage (proc_orden_insumo) ATÓMICO.
-- Nunca uno sin el otro. Valida disponible dentro de la transacción (serializa por lote).
CREATE OR REPLACE FUNCTION proc_fn_consumir_lote_en_orden(
  p_empresa_id uuid, p_orden_id uuid, p_lote_id uuid, p_kg numeric,
  p_transaccion_id uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_disp numeric; v_inicial numeric; v_mov uuid; v_ins uuid; v_estado text; v_tx uuid;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg de consumo debe ser > 0'; END IF;
  v_tx := COALESCE(p_transaccion_id, gen_random_uuid());
  SELECT estado INTO v_estado FROM proc_orden_proceso WHERE id=p_orden_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'orden % no existe', p_orden_id; END IF;
  IF v_estado <> 'en_proceso' THEN RAISE EXCEPTION 'orden debe estar en_proceso para consumir (está %)', v_estado; END IF;
  PERFORM 1 FROM proc_lote WHERE id=p_lote_id AND empresa_id=p_empresa_id FOR UPDATE;  -- serializa
  IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe', p_lote_id; END IF;
  SELECT COALESCE(disponible,0) INTO v_disp FROM proc_v_lote_saldos WHERE lote_id=p_lote_id AND empresa_id=p_empresa_id;
  IF p_kg > v_disp THEN RAISE EXCEPTION 'consumo % excede disponible % del lote %', p_kg, v_disp, p_lote_id; END IF;
  -- movimiento físico (ledger)
  INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id,
    cantidad, ref_tipo, ref_id, transaccion_id, created_by)
  VALUES (p_empresa_id, 'consumo_proceso', 'salida', 'lote', p_lote_id,
    p_kg, 'consumo_proceso', p_orden_id, v_tx, p_actor) RETURNING id INTO v_mov;
  -- lineage (genealogía) — obligatorio, mismo tx
  SELECT COALESCE(SUM(CASE WHEN naturaleza='entrada' THEN cantidad ELSE 0 END),0) INTO v_inicial
    FROM proc_movimiento WHERE objeto_tipo='lote' AND objeto_id=p_lote_id AND empresa_id=p_empresa_id;
  INSERT INTO proc_orden_insumo(empresa_id, orden_id, lote_id, kg, pct, movimiento_id, created_by)
  VALUES (p_empresa_id, p_orden_id, p_lote_id, p_kg,
    CASE WHEN v_inicial>0 THEN round(p_kg/v_inicial,4) ELSE NULL END, v_mov, p_actor) RETURNING id INTO v_ins;
  RETURN v_ins;
END $$;

-- Conciliar orden: valida cuadratura y transita a 'conciliado' (el trigger revalida).
CREATE OR REPLACE FUNCTION proc_fn_conciliar_orden(
  p_empresa_id uuid, p_orden_id uuid, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE proc_orden_proceso SET estado='conciliado', updated_by=p_actor
   WHERE id=p_orden_id AND empresa_id=p_empresa_id AND estado='pendiente_conciliacion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden % no está en pendiente_conciliacion (o no existe)', p_orden_id;
  END IF;
END $$;

-- ── 10. Triggers touch + auditoría (tablas F2) ───────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad',
    'proc_motivos_descarte','proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion',
    'proc_programa_proceso','proc_orden_proceso','proc_resultado','proc_resultado_descarte','proc_resultado_merma'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
  -- proc_orden_insumo: append-only lineage (INSERT audit; sin updated_at)
  EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_proc_orden_insumo ON proc_orden_insumo;';
  EXECUTE 'CREATE TRIGGER trg_audit_proc_orden_insumo AFTER INSERT ON proc_orden_insumo FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();';
END $$;

-- ── 11. RLS productiva por empresa (FORCE, deny-by-default, REVOKE anon) ──────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad',
    'proc_motivos_descarte','proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion',
    'proc_programa_proceso','proc_orden_proceso','proc_orden_insumo','proc_resultado',
    'proc_resultado_descarte','proc_resultado_merma'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s
      USING (empresa_id = proc_current_empresa()) WITH CHECK (empresa_id = proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- ============================================================================
-- GO-LIVE BLOCKER (heredado F1): sin identidad autenticada + tenant efectivo,
-- proc_* no opera en producción. DEV-ONLY F2 en archivo aparte.
-- FIN schema_proc_v2_f2.sql — INCREMENTAL sobre F1. NO aplicado a producción.
-- ============================================================================
