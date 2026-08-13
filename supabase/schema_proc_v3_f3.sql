-- ============================================================================
-- schema_proc_v3_f3.sql · proc_* FASE 3 (Producto Terminado · Pallets · Repaletizaje)
-- INCREMENTAL sobre F1+F2. Requiere schema_proc_v1.sql + schema_proc_v2_f2.sql.
-- Ver docs/proceso-f3-diseno.md (Opción A ratificada 2026-08-13).
--
-- SEPARACIÓN DE FUENTES DE VERDAD (CFO):
--   proc_movimiento      = SoT de existencia física, movimientos, ubicación,
--                          saldo/disponibilidad e historia (PT y pallet como objetos).
--   proc_pallet_linea    = SoT de composición y genealogía interna del pallet
--                          (PT/resultado de procedencia, cajas/kg atribuibles).
-- INVARIANTE: para un pallet activo, Σ proc_pallet_linea.kg = saldo físico del pallet
--   (ledger), dentro de tolerancia. Una línea por sí sola NO crea stock. Enforcement
--   por CONSTRAINT TRIGGER diferido (falla al commit si se descuadra).
-- Genealogía relacional (no % autoritativo; cantidades absolutas kg/cajas).
-- ============================================================================

-- ── Config: tolerancias + reglas de compatibilidad de pallet (Reglas 5,14) ───
ALTER TABLE proc_empresa_config ADD COLUMN IF NOT EXISTS tolerancia_pallet_pct numeric(5,2) NOT NULL DEFAULT 0.10;
ALTER TABLE proc_empresa_config ADD COLUMN IF NOT EXISTS tolerancia_repal_pct  numeric(5,2) NOT NULL DEFAULT 0.10;
ALTER TABLE proc_empresa_config ADD COLUMN IF NOT EXISTS pallet_compat_keys    jsonb NOT NULL DEFAULT '["especie_codigo","formato_id"]'::jsonb;

-- ── Tipos de movimiento F3 (ledger extiende) ─────────────────────────────────
INSERT INTO proc_tipo_movimiento(codigo, nombre, naturaleza_default, permite_ambos, orden) VALUES
  ('produccion',    'Producción de PT',       'entrada', false, 60),
  ('palletizacion', 'Palletización',          'entrada', true,  70),
  ('repaletizaje',  'Repaletizaje',           'entrada', true,  80),
  ('desarme',       'Desarme de pallet',      'entrada', true,  90),
  ('ajuste_pt',     'Ajuste de PT/pallet',    'entrada', true,  95)
ON CONFLICT (codigo) DO NOTHING;

-- ── Maestro de formatos (Regla 3; no hardcode cereza) ────────────────────────
CREATE TABLE IF NOT EXISTS proc_formato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  especie_codigo text NOT NULL, codigo text NOT NULL, descripcion text NOT NULL,
  kg_nominal_caja numeric(14,3) CHECK (kg_nominal_caja > 0),
  tipo_embalaje text, activo boolean NOT NULL DEFAULT true,
  vigencia_desde date, vigencia_hasta date, mapping_externo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, especie_codigo, codigo)
);

-- ── Producto Terminado (Regla 4). Objeto de ledger (objeto_tipo='producto_terminado') ─
CREATE TABLE IF NOT EXISTS proc_producto_terminado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  temporada_codigo text, planta_id uuid REFERENCES proc_planta(id),
  orden_id uuid NOT NULL REFERENCES proc_orden_proceso(id),
  resultado_id uuid NOT NULL REFERENCES proc_resultado(id),   -- Regla 1: origen
  especie_codigo text, variedad_codigo text,                  -- snapshot (historia)
  categoria_id uuid REFERENCES proc_categorias_calidad(id),
  calibre_id uuid REFERENCES proc_calibre(id), color_id uuid REFERENCES proc_color(id),
  formato_id uuid REFERENCES proc_formato(id),
  cajas integer CHECK (cajas >= 0), kg numeric(14,3) NOT NULL CHECK (kg > 0),
  estado text NOT NULL DEFAULT 'disponible' CHECK (estado IN ('generado','disponible','agotado','anulado')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_proc_pt_result ON proc_producto_terminado(resultado_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_pt_emp ON proc_producto_terminado(empresa_id) WHERE deleted_at IS NULL;

-- ── Pallet: cabecera física (Regla 5) + líneas de composición (Regla 6) ──────
CREATE TABLE IF NOT EXISTS proc_pallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  codigo text NOT NULL,                       -- barcode operacional; NO es PK (Regla 10/13)
  temporada_codigo text, planta_id uuid REFERENCES proc_planta(id),
  formato_id uuid REFERENCES proc_formato(id),
  cajas integer NOT NULL DEFAULT 0,           -- cache (SoT física = ledger)
  kg numeric(14,3) NOT NULL DEFAULT 0,        -- cache
  estado text NOT NULL DEFAULT 'armando'
    CHECK (estado IN ('armando','disponible','reservado','parcialmente_consumido','agotado','anulado')),
  ubicacion_id uuid REFERENCES proc_ubicaciones(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, temporada_codigo, codigo)   -- barcode único por empresa+temporada (Regla 13)
);
CREATE INDEX IF NOT EXISTS ix_proc_pallet_emp ON proc_pallet(empresa_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS proc_pallet_linea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  pallet_id uuid NOT NULL REFERENCES proc_pallet(id),
  pt_id uuid NOT NULL REFERENCES proc_producto_terminado(id),   -- genealogía PT→pallet
  formato_id uuid REFERENCES proc_formato(id),
  cajas integer NOT NULL DEFAULT 0 CHECK (cajas >= 0),
  kg numeric(14,3) NOT NULL CHECK (kg >= 0),                    -- cantidades ABSOLUTAS (Regla 13)
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','consumida')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid
);
CREATE INDEX IF NOT EXISTS ix_proc_pl_pallet ON proc_pallet_linea(pallet_id) WHERE estado='activa';
CREATE INDEX IF NOT EXISTS ix_proc_pl_pt ON proc_pallet_linea(pt_id);

-- ── Repaletizaje: evento formal N:M (Reglas 9,10,14) ─────────────────────────
CREATE TABLE IF NOT EXISTS proc_repaletizaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(), motivo text,
  tipo text NOT NULL DEFAULT 'repaletizaje' CHECK (tipo IN ('repaletizaje','split','merge','desarme')),
  transaccion_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_repaletizaje_origen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  repaletizaje_id uuid NOT NULL REFERENCES proc_repaletizaje(id),
  pallet_id uuid NOT NULL REFERENCES proc_pallet(id),
  pt_id uuid REFERENCES proc_producto_terminado(id),
  cajas integer NOT NULL DEFAULT 0, kg numeric(14,3) NOT NULL CHECK (kg > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proc_repaletizaje_destino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  repaletizaje_id uuid NOT NULL REFERENCES proc_repaletizaje(id),
  pallet_id uuid NOT NULL REFERENCES proc_pallet(id),
  pt_id uuid REFERENCES proc_producto_terminado(id),
  cajas integer NOT NULL DEFAULT 0, kg numeric(14,3) NOT NULL CHECK (kg > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Vistas derivadas (SoT = ledger) ──────────────────────────────────────────
-- Disponibilidad de una línea de resultado F2 para materializar PT (Regla 2).
CREATE OR REPLACE VIEW proc_v_resultado_disponible AS
SELECT r.id AS resultado_id, r.empresa_id, r.kg AS kg_resultado,
  COALESCE(SUM(pt.kg),0) AS kg_materializado,
  r.kg - COALESCE(SUM(pt.kg),0) AS kg_disponible
FROM proc_resultado r
LEFT JOIN proc_producto_terminado pt
  ON pt.resultado_id=r.id AND pt.deleted_at IS NULL AND pt.estado<>'anulado'
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.empresa_id, r.kg;
ALTER VIEW proc_v_resultado_disponible SET (security_invoker = on);

-- Saldo físico de un PT (ledger): produccion − palletizacion ± ajuste.
CREATE OR REPLACE VIEW proc_v_pt_saldos AS
SELECT pt.id AS pt_id, pt.empresa_id,
  COALESCE(SUM(CASE WHEN m.naturaleza='entrada' THEN m.cantidad
                    WHEN m.naturaleza='salida'  THEN -m.cantidad ELSE 0 END),0) AS on_hand
FROM proc_producto_terminado pt
LEFT JOIN proc_movimiento m ON m.objeto_tipo='producto_terminado' AND m.objeto_id=pt.id AND m.empresa_id=pt.empresa_id
WHERE pt.deleted_at IS NULL
GROUP BY pt.id, pt.empresa_id;
ALTER VIEW proc_v_pt_saldos SET (security_invoker = on);

-- Saldo físico de un pallet (ledger). Transferencia (traslado) NO afecta total.
CREATE OR REPLACE VIEW proc_v_pallet_saldos AS
SELECT p.id AS pallet_id, p.empresa_id,
  COALESCE(SUM(CASE WHEN m.naturaleza='entrada' THEN m.cantidad
                    WHEN m.naturaleza='salida'  THEN -m.cantidad ELSE 0 END),0) AS kg_fisico
FROM proc_pallet p
LEFT JOIN proc_movimiento m ON m.objeto_tipo='pallet' AND m.objeto_id=p.id AND m.empresa_id=p.empresa_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.empresa_id;
ALTER VIEW proc_v_pallet_saldos SET (security_invoker = on);

-- Composición (SoT líneas): Σ líneas activas por pallet.
CREATE OR REPLACE VIEW proc_v_pallet_composicion AS
SELECT pallet_id, empresa_id, SUM(kg) AS kg_lineas, SUM(cajas) AS cajas_lineas
FROM proc_pallet_linea WHERE estado='activa' GROUP BY pallet_id, empresa_id;
ALTER VIEW proc_v_pallet_composicion SET (security_invoker = on);

-- ── INVARIANTE de integridad: Σ líneas activas = saldo físico del pallet ─────
-- CONSTRAINT TRIGGER diferido: se valida AL COMMIT (permite que un RPC inserte
-- línea + movimiento en la misma transacción). Falla si se descuadra.
CREATE OR REPLACE FUNCTION proc_fn_reconciliar_pallet() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_pallet uuid; v_emp uuid; v_lines numeric; v_ledger numeric; v_tol numeric;
BEGIN
  IF TG_TABLE_NAME='proc_pallet_linea' THEN
    v_pallet := COALESCE(NEW.pallet_id, OLD.pallet_id); v_emp := COALESCE(NEW.empresa_id, OLD.empresa_id);
  ELSE
    v_pallet := COALESCE(NEW.objeto_id, OLD.objeto_id); v_emp := COALESCE(NEW.empresa_id, OLD.empresa_id);
    IF COALESCE(NEW.objeto_tipo, OLD.objeto_tipo) <> 'pallet' THEN RETURN NULL; END IF;
  END IF;
  SELECT COALESCE(SUM(kg),0) INTO v_lines FROM proc_pallet_linea WHERE pallet_id=v_pallet AND estado='activa';
  SELECT COALESCE(SUM(CASE WHEN naturaleza='entrada' THEN cantidad WHEN naturaleza='salida' THEN -cantidad ELSE 0 END),0)
    INTO v_ledger FROM proc_movimiento WHERE objeto_tipo='pallet' AND objeto_id=v_pallet;
  SELECT COALESCE(tolerancia_pallet_pct,0) INTO v_tol FROM proc_empresa_config WHERE empresa_id=v_emp;
  IF abs(v_lines - v_ledger) > GREATEST(abs(v_ledger),abs(v_lines))*COALESCE(v_tol,0)/100 + 0.001 THEN
    RAISE EXCEPTION 'pallet %: Σ líneas activas (%) != saldo físico ledger (%) — invariante rota', v_pallet, v_lines, v_ledger;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_recon_pallet_linea ON proc_pallet_linea;
CREATE CONSTRAINT TRIGGER trg_recon_pallet_linea AFTER INSERT OR UPDATE OR DELETE ON proc_pallet_linea
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION proc_fn_reconciliar_pallet();
DROP TRIGGER IF EXISTS trg_recon_pallet_mov ON proc_movimiento;
CREATE CONSTRAINT TRIGGER trg_recon_pallet_mov AFTER INSERT ON proc_movimiento
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION proc_fn_reconciliar_pallet();

-- Deriva el estado de un pallet desde su saldo físico (Regla 11).
CREATE OR REPLACE FUNCTION proc_fn_pallet_estado_por_saldo(p_pallet uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_kg numeric; v_orig numeric; v_est text;
BEGIN
  SELECT kg_fisico INTO v_kg FROM proc_v_pallet_saldos WHERE pallet_id=p_pallet;
  SELECT COALESCE(SUM(cantidad),0) INTO v_orig FROM proc_movimiento
    WHERE objeto_tipo='pallet' AND objeto_id=p_pallet AND naturaleza='entrada';
  SELECT estado INTO v_est FROM proc_pallet WHERE id=p_pallet;
  IF v_est IN ('anulado') THEN RETURN; END IF;
  UPDATE proc_pallet SET
    cajas = COALESCE((SELECT cajas_lineas FROM proc_v_pallet_composicion WHERE pallet_id=p_pallet),0),
    kg = COALESCE(v_kg,0),
    estado = CASE
      WHEN COALESCE(v_kg,0) <= 0 THEN 'agotado'
      WHEN v_kg < v_orig THEN 'parcialmente_consumido'
      WHEN estado='armando' THEN 'disponible'
      ELSE estado END
  WHERE id=p_pallet;
END $$;

-- ── RPC: materializar PT desde una línea de resultado (Reglas 1,2) ───────────
CREATE OR REPLACE FUNCTION proc_fn_materializar_pt(
  p_empresa_id uuid, p_resultado_id uuid, p_formato_id uuid, p_cajas integer, p_kg numeric, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_disp numeric; v_pt uuid; r proc_resultado%ROWTYPE; v_orden uuid; v_tx uuid := gen_random_uuid();
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg de PT debe ser > 0'; END IF;
  SELECT * INTO r FROM proc_resultado WHERE id=p_resultado_id AND empresa_id=p_empresa_id FOR UPDATE;  -- serializa
  IF NOT FOUND THEN RAISE EXCEPTION 'resultado % no existe', p_resultado_id; END IF;
  SELECT kg_disponible INTO v_disp FROM proc_v_resultado_disponible WHERE resultado_id=p_resultado_id;
  IF p_kg > COALESCE(v_disp,0) THEN
    RAISE EXCEPTION 'materialización % excede kg disponible % del resultado', p_kg, COALESCE(v_disp,0);
  END IF;
  SELECT orden_id INTO v_orden FROM proc_resultado WHERE id=p_resultado_id;
  INSERT INTO proc_producto_terminado(empresa_id, orden_id, resultado_id, categoria_id, calibre_id, color_id,
    formato_id, cajas, kg, estado, created_by)
  SELECT p_empresa_id, v_orden, p_resultado_id, r.categoria_id, r.calibre_id, r.color_id,
    p_formato_id, p_cajas, p_kg, 'disponible', p_actor RETURNING id INTO v_pt;
  INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id,
    cantidad, ref_tipo, ref_id, transaccion_id, created_by)
  VALUES (p_empresa_id, 'produccion', 'entrada', 'producto_terminado', v_pt, p_kg, 'ajuste', p_resultado_id, v_tx, p_actor);
  RETURN v_pt;
END $$;

-- ── RPC: crear pallet vacío (armando) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_crear_pallet(
  p_empresa_id uuid, p_codigo text, p_temporada text, p_planta_id uuid, p_formato_id uuid, p_ubicacion_id uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_pallet uuid;
BEGIN
  INSERT INTO proc_pallet(empresa_id, codigo, temporada_codigo, planta_id, formato_id, ubicacion_id, estado, created_by)
  VALUES (p_empresa_id, p_codigo, p_temporada, p_planta_id, p_formato_id, p_ubicacion_id, 'armando', p_actor)
  RETURNING id INTO v_pallet;
  RETURN v_pallet;
END $$;

-- ── RPC: palletizar PT → pallet (Regla 6, compatibilidad Regla 5) ────────────
CREATE OR REPLACE FUNCTION proc_fn_palletizar(
  p_empresa_id uuid, p_pt_id uuid, p_pallet_id uuid, p_cajas integer, p_kg numeric, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_disp numeric; v_line uuid; v_tx uuid := gen_random_uuid();
  v_keys jsonb; v_key text; v_new_val text; v_exist_val text;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg a palletizar debe ser > 0'; END IF;
  PERFORM 1 FROM proc_producto_terminado WHERE id=p_pt_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PT % no existe', p_pt_id; END IF;
  PERFORM 1 FROM proc_pallet WHERE id=p_pallet_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pallet % no existe', p_pallet_id; END IF;
  SELECT on_hand INTO v_disp FROM proc_v_pt_saldos WHERE pt_id=p_pt_id;
  IF p_kg > COALESCE(v_disp,0) THEN RAISE EXCEPTION 'palletiza % excede PT disponible %', p_kg, COALESCE(v_disp,0); END IF;

  -- Compatibilidad (Regla 5): dims configurables deben coincidir con líneas existentes
  SELECT COALESCE(pallet_compat_keys,'[]'::jsonb) INTO v_keys FROM proc_empresa_config WHERE empresa_id=p_empresa_id;
  FOR v_key IN SELECT jsonb_array_elements_text(v_keys) LOOP
    EXECUTE format('SELECT (to_jsonb(pt) ->> %L) FROM proc_producto_terminado pt WHERE id=$1', v_key)
      INTO v_new_val USING p_pt_id;
    EXECUTE format('SELECT DISTINCT (to_jsonb(pt) ->> %L) FROM proc_pallet_linea l JOIN proc_producto_terminado pt ON pt.id=l.pt_id WHERE l.pallet_id=$1 AND l.estado=''activa'' LIMIT 1', v_key)
      INTO v_exist_val USING p_pallet_id;
    IF v_exist_val IS NOT NULL AND v_exist_val IS DISTINCT FROM v_new_val THEN
      RAISE EXCEPTION 'pallet incompatible en %: existente=% nuevo=%', v_key, v_exist_val, v_new_val;
    END IF;
  END LOOP;

  -- Composición (SoT líneas) + movimientos (SoT física): PT salida + pallet entrada
  INSERT INTO proc_pallet_linea(empresa_id, pallet_id, pt_id, formato_id, cajas, kg, created_by)
  SELECT p_empresa_id, p_pallet_id, p_pt_id, formato_id, p_cajas, p_kg, p_actor
  FROM proc_producto_terminado WHERE id=p_pt_id RETURNING id INTO v_line;
  INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad, ref_tipo, ref_id, transaccion_id, created_by)
  VALUES (p_empresa_id, 'palletizacion', 'salida', 'producto_terminado', p_pt_id, p_kg, 'repaletizaje', p_pallet_id, v_tx, p_actor);
  INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad, ref_tipo, ref_id, transaccion_id, created_by)
  VALUES (p_empresa_id, 'palletizacion', 'entrada', 'pallet', p_pallet_id, p_kg, 'repaletizaje', p_pt_id, v_tx, p_actor);
  PERFORM proc_fn_pallet_estado_por_saldo(p_pallet_id);
  RETURN v_line;
END $$;

-- ── RPC: repaletizar N:M (Reglas 7,8,9,10,13,14). moves = jsonb array ────────
-- Cada move: {origen_pallet_id, pt_id, cajas, kg, destino_pallet_id}. Cantidades absolutas.
CREATE OR REPLACE FUNCTION proc_fn_repaletizar(
  p_empresa_id uuid, p_motivo text, p_tipo text, p_moves jsonb, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_rep uuid; v_tx uuid := gen_random_uuid(); mv record; v_line_kg numeric;
BEGIN
  INSERT INTO proc_repaletizaje(empresa_id, motivo, tipo, transaccion_id, created_by)
  VALUES (p_empresa_id, p_motivo, COALESCE(p_tipo,'repaletizaje'), v_tx, p_actor) RETURNING id INTO v_rep;

  -- Lock de todos los pallets involucrados (serializa; evita doble consumo)
  PERFORM 1 FROM proc_pallet WHERE empresa_id=p_empresa_id AND id IN (
    SELECT (x->>'origen_pallet_id')::uuid FROM jsonb_array_elements(p_moves) x
    UNION SELECT (x->>'destino_pallet_id')::uuid FROM jsonb_array_elements(p_moves) x
  ) FOR UPDATE;

  FOR mv IN SELECT * FROM jsonb_to_recordset(p_moves)
    AS x(origen_pallet_id uuid, pt_id uuid, cajas integer, kg numeric, destino_pallet_id uuid)
  LOOP
    IF mv.kg IS NULL OR mv.kg <= 0 THEN RAISE EXCEPTION 'kg de repaletizaje debe ser > 0'; END IF;
    -- línea origen (pallet+pt) debe tener kg suficiente
    SELECT COALESCE(SUM(kg),0) INTO v_line_kg FROM proc_pallet_linea
      WHERE pallet_id=mv.origen_pallet_id AND pt_id=mv.pt_id AND estado='activa';
    IF mv.kg > v_line_kg THEN
      RAISE EXCEPTION 'repaletizaje % excede kg % de la línea origen (pallet % pt %)', mv.kg, v_line_kg, mv.origen_pallet_id, mv.pt_id;
    END IF;
    -- reducir composición origen (preserva historia en repaletizaje/ledger)
    UPDATE proc_pallet_linea SET kg = kg - mv.kg, cajas = GREATEST(cajas - COALESCE(mv.cajas,0),0),
      estado = CASE WHEN (kg - mv.kg) <= 0 THEN 'consumida' ELSE 'activa' END, updated_by=p_actor
      WHERE id = (SELECT id FROM proc_pallet_linea WHERE pallet_id=mv.origen_pallet_id AND pt_id=mv.pt_id AND estado='activa' ORDER BY kg DESC LIMIT 1);
    -- aumentar composición destino (misma genealogía PT)
    INSERT INTO proc_pallet_linea(empresa_id, pallet_id, pt_id, formato_id, cajas, kg, created_by)
    SELECT p_empresa_id, mv.destino_pallet_id, mv.pt_id, formato_id, COALESCE(mv.cajas,0), mv.kg, p_actor
    FROM proc_producto_terminado WHERE id=mv.pt_id;
    -- movimientos físicos: salida origen + entrada destino
    INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad, ref_tipo, ref_id, transaccion_id, created_by)
    VALUES (p_empresa_id, 'repaletizaje', 'salida', 'pallet', mv.origen_pallet_id, mv.kg, 'repaletizaje', v_rep, v_tx, p_actor);
    INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad, ref_tipo, ref_id, transaccion_id, created_by)
    VALUES (p_empresa_id, 'repaletizaje', 'entrada', 'pallet', mv.destino_pallet_id, mv.kg, 'repaletizaje', v_rep, v_tx, p_actor);
    -- detalle del evento (N:M, cantidades absolutas)
    INSERT INTO proc_repaletizaje_origen(empresa_id, repaletizaje_id, pallet_id, pt_id, cajas, kg)
    VALUES (p_empresa_id, v_rep, mv.origen_pallet_id, mv.pt_id, COALESCE(mv.cajas,0), mv.kg);
    INSERT INTO proc_repaletizaje_destino(empresa_id, repaletizaje_id, pallet_id, pt_id, cajas, kg)
    VALUES (p_empresa_id, v_rep, mv.destino_pallet_id, mv.pt_id, COALESCE(mv.cajas,0), mv.kg);
  END LOOP;

  -- recalcular estados/caches de todos los pallets tocados
  PERFORM proc_fn_pallet_estado_por_saldo(pid) FROM (
    SELECT (x->>'origen_pallet_id')::uuid pid FROM jsonb_array_elements(p_moves) x
    UNION SELECT (x->>'destino_pallet_id')::uuid FROM jsonb_array_elements(p_moves) x
  ) s;
  RETURN v_rep;
END $$;

-- ── RPC: trasladar pallet entre ubicaciones (Regla 12; no cambia stock total) ─
CREATE OR REPLACE FUNCTION proc_fn_trasladar_pallet(
  p_empresa_id uuid, p_pallet_id uuid, p_ubic_destino uuid, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_ori uuid;
BEGIN
  SELECT ubicacion_id INTO v_ori FROM proc_pallet WHERE id=p_pallet_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pallet % no existe', p_pallet_id; END IF;
  INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad,
    ubicacion_origen_id, ubicacion_destino_id, ref_tipo, created_by)
  VALUES (p_empresa_id, 'traslado', 'transferencia', 'pallet', p_pallet_id,
    COALESCE((SELECT kg_fisico FROM proc_v_pallet_saldos WHERE pallet_id=p_pallet_id),0),
    v_ori, p_ubic_destino, 'ajuste', p_actor);
  UPDATE proc_pallet SET ubicacion_id=p_ubic_destino, updated_by=p_actor WHERE id=p_pallet_id;
END $$;

-- ── Triggers touch + auditoría (tablas F3) ───────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea',
    'proc_repaletizaje','proc_repaletizaje_origen','proc_repaletizaje_destino'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- ── RLS productiva (FORCE, deny-by-default, REVOKE anon) ──────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea',
    'proc_repaletizaje','proc_repaletizaje_origen','proc_repaletizaje_destino'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN schema_proc_v3_f3.sql — INCREMENTAL. NO aplicado a producción. GO-LIVE blocker hereda de F1.
