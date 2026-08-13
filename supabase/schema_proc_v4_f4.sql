-- ============================================================================
-- schema_proc_v4_f4.sql · proc_* FASE 4 (Despacho y salida física)
-- INCREMENTAL sobre F1+F2+F3. Ver docs/proceso-f4-diseno.md.
--
-- Despacho ≠ exportación: salida física de Allegria Service (destinatario puede ser
-- Foods, otra exportadora, productor, otra planta, CD, tercero). NO usa exp_shipments.
-- SoT física = proc_movimiento. proc_despacho_linea explica qué/bajo qué documento salió.
-- Reserva = proc_hold existente (no segundo sistema). Invariante: Σ líneas = Σ salidas.
-- ============================================================================

-- ── Extender saldo de pallet con holds → disponible (reserva reduce libre, no físico) ─
CREATE OR REPLACE VIEW proc_v_pallet_saldos AS
SELECT p.id AS pallet_id, p.empresa_id,
  COALESCE(mov.kg_fisico,0) AS kg_fisico,
  COALESCE(h.bloqueado,0) AS bloqueado, COALESCE(h.reservado,0) AS reservado,
  COALESCE(mov.kg_fisico,0) - COALESCE(h.bloqueado,0) - COALESCE(h.reservado,0) AS disponible
FROM proc_pallet p
LEFT JOIN (
  SELECT objeto_id, empresa_id,
    SUM(CASE WHEN naturaleza='entrada' THEN cantidad WHEN naturaleza='salida' THEN -cantidad ELSE 0 END) AS kg_fisico
  FROM proc_movimiento WHERE objeto_tipo='pallet' GROUP BY objeto_id, empresa_id
) mov ON mov.objeto_id=p.id AND mov.empresa_id=p.empresa_id
LEFT JOIN (
  SELECT objeto_id, empresa_id,
    SUM(CASE WHEN tipo='bloqueo' THEN cantidad ELSE 0 END) AS bloqueado,
    SUM(CASE WHEN tipo='reserva' THEN cantidad ELSE 0 END) AS reservado
  FROM proc_hold WHERE objeto_tipo='pallet' AND estado='activo' GROUP BY objeto_id, empresa_id
) h ON h.objeto_id=p.id AND h.empresa_id=p.empresa_id
WHERE p.deleted_at IS NULL;
ALTER VIEW proc_v_pallet_saldos SET (security_invoker = on);

-- ── Cabecera de despacho ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_despacho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  folio text NOT NULL, temporada_codigo text,
  planta_origen_id uuid REFERENCES proc_planta(id),
  cliente_servicio_vinculo_id uuid REFERENCES proc_vinculo(id),
  dueno_fruta_vinculo_id uuid REFERENCES proc_vinculo(id),
  exportadora_vinculo_id uuid REFERENCES proc_vinculo(id),
  destinatario_vinculo_id uuid REFERENCES proc_vinculo(id),   -- recibe físicamente (≠ cliente)
  destino_texto text,
  transportista_vinculo_id uuid REFERENCES proc_vinculo(id),
  vehiculo_patente text, conductor text,
  fecha_prevista timestamptz, fecha_efectiva timestamptz,
  peso_cargado numeric(14,3), peso_bascula numeric(14,3),   -- Regla 13 (≠ saldo pallet)
  correlacion_externa text,                                  -- Regla 17 (Foods↔Service)
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','preparando','listo','cargando','despachado','cancelado')),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, folio)
);
CREATE INDEX IF NOT EXISTS ix_proc_desp_emp ON proc_despacho(empresa_id) WHERE deleted_at IS NULL;

-- ── Líneas de despacho (pallet+PT; movimiento obligatorio) ───────────────────
CREATE TABLE IF NOT EXISTS proc_despacho_linea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  despacho_id uuid NOT NULL REFERENCES proc_despacho(id),
  pallet_id uuid NOT NULL REFERENCES proc_pallet(id),
  pt_id uuid REFERENCES proc_producto_terminado(id),      -- genealogía
  cajas integer NOT NULL DEFAULT 0, kg numeric(14,3) NOT NULL CHECK (kg > 0),
  ubicacion_origen_id uuid REFERENCES proc_ubicaciones(id),   -- salió desde (Regla 9)
  movimiento_id uuid NOT NULL REFERENCES proc_movimiento(id), -- SoT física (obligatorio)
  estado text NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada','reversada')),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_proc_dl_desp ON proc_despacho_linea(despacho_id);
CREATE INDEX IF NOT EXISTS ix_proc_dl_pallet ON proc_despacho_linea(pallet_id);

-- ── Documentos del despacho (Regla 11; storage privado, sólo path) ───────────
CREATE TABLE IF NOT EXISTS proc_despacho_doc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  despacho_id uuid NOT NULL REFERENCES proc_despacho(id),
  tipo text NOT NULL, folio text, archivo_path text, version int NOT NULL DEFAULT 1,
  fecha timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);

-- ── Conciliación de despacho: Σ líneas = Σ movimientos de salida ─────────────
CREATE OR REPLACE VIEW proc_v_despacho_conciliacion AS
SELECT d.id AS despacho_id, d.empresa_id,
  COALESCE(SUM(l.kg) FILTER (WHERE l.estado='confirmada'),0) AS kg_lineas,
  COALESCE(SUM(m.cantidad) FILTER (WHERE m.naturaleza='salida' AND NOT m.es_reversa),0) AS kg_movimientos
FROM proc_despacho d
LEFT JOIN proc_despacho_linea l ON l.despacho_id=d.id
LEFT JOIN proc_movimiento m ON m.id=l.movimiento_id
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.empresa_id;
ALTER VIEW proc_v_despacho_conciliacion SET (security_invoker = on);

-- ── Máquina de estados del despacho (Regla 7) ────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_despacho_transicion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado='cancelado' THEN RAISE EXCEPTION 'despacho % cancelado: no editable', OLD.folio; END IF;
  IF OLD.estado='despachado' THEN
    IF NEW.estado='cancelado' THEN RETURN NEW;   -- única edición permitida: reversa formal
    ELSE RAISE EXCEPTION 'despacho % despachado: no editable (solo reversa→cancelado)', OLD.folio; END IF;
  END IF;
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.estado='borrador'   AND NEW.estado IN ('preparando','cancelado')) OR
    (OLD.estado='preparando' AND NEW.estado IN ('listo','cancelado')) OR
    (OLD.estado='listo'      AND NEW.estado IN ('cargando','cancelado')) OR
    (OLD.estado='cargando'   AND NEW.estado IN ('despachado','cancelado')) OR
    (OLD.estado='despachado' AND NEW.estado = 'cancelado')
  ) THEN RAISE EXCEPTION 'transición de despacho inválida: % → %', OLD.estado, NEW.estado; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_desp_transicion ON proc_despacho;
CREATE TRIGGER trg_desp_transicion BEFORE UPDATE ON proc_despacho
  FOR EACH ROW EXECUTE FUNCTION proc_fn_despacho_transicion();

-- ── RPC ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_crear_despacho(
  p_empresa_id uuid, p_folio text, p_planta uuid, p_cliente uuid, p_destinatario uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_despacho(empresa_id, folio, planta_origen_id, cliente_servicio_vinculo_id, destinatario_vinculo_id, created_by)
  VALUES (p_empresa_id, p_folio, p_planta, p_cliente, p_destinatario, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Reservar pallet para un despacho (hold; reduce disponible, no físico — Regla 6)
CREATE OR REPLACE FUNCTION proc_fn_reservar_pallet(
  p_empresa_id uuid, p_despacho_id uuid, p_pallet_id uuid, p_kg numeric, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_disp numeric; v_hold uuid;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg a reservar debe ser > 0'; END IF;
  PERFORM 1 FROM proc_pallet WHERE id=p_pallet_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pallet % no existe', p_pallet_id; END IF;
  SELECT disponible INTO v_disp FROM proc_v_pallet_saldos WHERE pallet_id=p_pallet_id;
  IF p_kg > COALESCE(v_disp,0) THEN RAISE EXCEPTION 'reserva % excede disponible % del pallet', p_kg, COALESCE(v_disp,0); END IF;
  INSERT INTO proc_hold(empresa_id, objeto_tipo, objeto_id, tipo, cantidad, ref_tipo, ref_id, created_by)
  VALUES (p_empresa_id, 'pallet', p_pallet_id, 'reserva', p_kg, 'despacho', p_despacho_id, p_actor) RETURNING id INTO v_hold;
  RETURN v_hold;
END $$;

CREATE OR REPLACE FUNCTION proc_fn_liberar_reserva(
  p_empresa_id uuid, p_despacho_id uuid, p_pallet_id uuid, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE proc_hold SET estado='liberado', liberado_por=p_actor, liberado_at=now()
   WHERE empresa_id=p_empresa_id AND objeto_tipo='pallet' AND objeto_id=p_pallet_id
     AND tipo='reserva' AND ref_tipo='despacho' AND ref_id=p_despacho_id AND estado='activo';
END $$;

-- Confirmar despacho: por cada línea (pallet+pt+kg) → libera su reserva + valida disponible
-- + salida ledger (desde la ubicación del pallet) + reduce composición + crea línea. Atómico.
CREATE OR REPLACE FUNCTION proc_fn_confirmar_despacho(
  p_empresa_id uuid, p_despacho_id uuid, p_lineas jsonb, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_estado text; ln record; v_ubic uuid; v_disp numeric; v_line_kg numeric; v_mov uuid; v_tx uuid := gen_random_uuid();
BEGIN
  SELECT estado INTO v_estado FROM proc_despacho WHERE id=p_despacho_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'despacho % no existe', p_despacho_id; END IF;
  IF v_estado NOT IN ('listo','cargando') THEN RAISE EXCEPTION 'despacho debe estar listo/cargando para confirmar (está %)', v_estado; END IF;
  IF v_estado='listo' THEN UPDATE proc_despacho SET estado='cargando' WHERE id=p_despacho_id; END IF;

  FOR ln IN SELECT * FROM jsonb_to_recordset(p_lineas) AS x(pallet_id uuid, pt_id uuid, cajas integer, kg numeric) LOOP
    IF ln.kg IS NULL OR ln.kg <= 0 THEN RAISE EXCEPTION 'kg de despacho debe ser > 0'; END IF;
    SELECT ubicacion_id INTO v_ubic FROM proc_pallet WHERE id=ln.pallet_id AND empresa_id=p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'pallet % no existe', ln.pallet_id; END IF;
    -- liberar reserva propia de este despacho sobre el pallet (si existe)
    UPDATE proc_hold SET estado='liberado', liberado_por=p_actor, liberado_at=now()
      WHERE empresa_id=p_empresa_id AND objeto_tipo='pallet' AND objeto_id=ln.pallet_id
        AND tipo='reserva' AND ref_tipo='despacho' AND ref_id=p_despacho_id AND estado='activo';
    -- disponible tras liberar la reserva propia (excluye holds de OTROS)
    SELECT disponible INTO v_disp FROM proc_v_pallet_saldos WHERE pallet_id=ln.pallet_id;
    IF ln.kg > COALESCE(v_disp,0) THEN RAISE EXCEPTION 'despacho % excede disponible % del pallet %', ln.kg, COALESCE(v_disp,0), ln.pallet_id; END IF;
    -- salida física (desde la ubicación del pallet — Regla 9)
    INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad,
      ubicacion_origen_id, ref_tipo, ref_id, transaccion_id, created_by)
    VALUES (p_empresa_id, 'despacho', 'salida', 'pallet', ln.pallet_id, ln.kg, v_ubic, 'despacho', p_despacho_id, v_tx, p_actor)
    RETURNING id INTO v_mov;
    -- reducir composición distribuyendo entre líneas activas (valida suficiencia; preserva historia en línea de despacho + ledger)
    PERFORM proc_fn_reducir_composicion_pallet(p_empresa_id, ln.pallet_id, ln.pt_id, ln.kg, ln.cajas, p_actor);
    -- línea de despacho (con movimiento obligatorio)
    INSERT INTO proc_despacho_linea(empresa_id, despacho_id, pallet_id, pt_id, cajas, kg, ubicacion_origen_id, movimiento_id, created_by)
    VALUES (p_empresa_id, p_despacho_id, ln.pallet_id, ln.pt_id, COALESCE(ln.cajas,0), ln.kg, v_ubic, v_mov, p_actor);
    PERFORM proc_fn_pallet_estado_por_saldo(ln.pallet_id);
  END LOOP;

  UPDATE proc_despacho SET estado='despachado', fecha_efectiva=now(), updated_by=p_actor WHERE id=p_despacho_id;
END $$;

-- Reversar despacho: contramovimientos que restituyen físico + restauran composición.
CREATE OR REPLACE FUNCTION proc_fn_reversar_despacho(
  p_empresa_id uuid, p_despacho_id uuid, p_motivo text, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_estado text; ln record;
BEGIN
  IF p_motivo IS NULL THEN RAISE EXCEPTION 'la reversa exige motivo'; END IF;
  SELECT estado INTO v_estado FROM proc_despacho WHERE id=p_despacho_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'despacho % no existe', p_despacho_id; END IF;
  IF v_estado <> 'despachado' THEN RAISE EXCEPTION 'solo se reversa un despacho despachado (está %)', v_estado; END IF;
  FOR ln IN SELECT * FROM proc_despacho_linea WHERE despacho_id=p_despacho_id AND estado='confirmada' LOOP
    PERFORM proc_fn_reversar_movimiento(p_empresa_id, ln.movimiento_id, p_motivo, p_actor);  -- restituye físico
    INSERT INTO proc_pallet_linea(empresa_id, pallet_id, pt_id, cajas, kg, created_by)   -- restaura composición
    VALUES (p_empresa_id, ln.pallet_id, ln.pt_id, ln.cajas, ln.kg, p_actor);
    UPDATE proc_despacho_linea SET estado='reversada' WHERE id=ln.id;
    PERFORM proc_fn_pallet_estado_por_saldo(ln.pallet_id);
  END LOOP;
  UPDATE proc_despacho SET estado='cancelado', updated_by=p_actor WHERE id=p_despacho_id;
END $$;

-- ── Triggers touch + auditoría ───────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_despacho','proc_despacho_doc'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proc_despacho','proc_despacho_linea','proc_despacho_doc'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- ── RLS productiva ───────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_despacho','proc_despacho_linea','proc_despacho_doc'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN schema_proc_v4_f4.sql — INCREMENTAL. NO aplicado a producción. GO-LIVE blocker hereda de F1.
