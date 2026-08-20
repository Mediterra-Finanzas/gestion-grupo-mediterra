-- ============================================================================
-- schema_proc_v8_t4_lote_origen.sql · PROC-MAESTROS-TRAZABILIDAD-001 · T4
-- CAMBIO CENTRAL: autoridad del origen agrícola en el LOTE (D1) + origen_snapshot
-- inmutable (D3) + ingreso atómico extendido (§11). Aditivo, nullable-first.
-- La integridad FK especie/variedad del lote se activa en T5 (tras seed/backfill).
-- ============================================================================

-- ── proc_lote: FKs de origen (navegación CURRENT) + snapshot (historia) ─────
ALTER TABLE proc_lote ADD COLUMN IF NOT EXISTS productor_vinculo_id uuid REFERENCES proc_vinculo(id);
ALTER TABLE proc_lote ADD COLUMN IF NOT EXISTS predio_id uuid REFERENCES proc_predios(id);
ALTER TABLE proc_lote ADD COLUMN IF NOT EXISTS cuartel_id uuid REFERENCES proc_cuartel(id);
ALTER TABLE proc_lote ADD COLUMN IF NOT EXISTS origen_snapshot jsonb;
ALTER TABLE proc_lote ADD COLUMN IF NOT EXISTS origen_reconstruido boolean NOT NULL DEFAULT false;

-- ── Builder del snapshot (BACKEND, no React) — congela nombres+CSG al ingreso ─
CREATE OR REPLACE FUNCTION proc_fn_build_origen_snapshot(
  p_empresa uuid, p_productor uuid, p_predio uuid, p_cuartel uuid, p_especie text, p_variedad text
) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'productor', (SELECT jsonb_build_object('nombre',nombre_provisional,'rut',rut,'csg_sag',csg_sag)
                    FROM proc_vinculo WHERE id=p_productor AND empresa_id=p_empresa),
    'predio',    (SELECT jsonb_build_object('nombre',nombre,'csg_sag',csg_sag,'comuna',comuna,'region',region)
                    FROM proc_predios WHERE id=p_predio AND empresa_id=p_empresa),
    'cuartel',   (SELECT jsonb_build_object('codigo',codigo,'nombre',nombre)
                    FROM proc_cuartel WHERE id=p_cuartel AND empresa_id=p_empresa),
    'especie',   (SELECT jsonb_build_object('codigo',codigo,'nombre',nombre)
                    FROM proc_especie WHERE codigo=p_especie AND empresa_id=p_empresa),
    'variedad',  (SELECT jsonb_build_object('codigo',codigo,'nombre',nombre)
                    FROM proc_variedad WHERE especie_codigo=p_especie AND codigo=p_variedad AND empresa_id=p_empresa)
  ));
$$;

-- ── Guard de inmutabilidad: origen_snapshot no cambia una vez congelado (D3/§10) ─
CREATE OR REPLACE FUNCTION proc_fn_lote_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origen_snapshot IS NOT NULL AND NEW.origen_snapshot IS DISTINCT FROM OLD.origen_snapshot THEN
    RAISE EXCEPTION 'origen_snapshot del lote % es inmutable una vez congelado', OLD.codigo;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lote_snapshot_guard ON proc_lote;
CREATE TRIGGER trg_lote_snapshot_guard BEFORE UPDATE ON proc_lote FOR EACH ROW EXECUTE FUNCTION proc_fn_lote_snapshot_guard();

-- ── Ingreso atómico extendido (compat: 10 args → params de origen = NULL) ────
DROP FUNCTION IF EXISTS proc_fn_ingresar_lote_ubicado(uuid,uuid,text,text,text,numeric,uuid,text,uuid,uuid);
CREATE OR REPLACE FUNCTION proc_fn_ingresar_lote_ubicado(
  p_empresa_id uuid, p_recepcion_id uuid, p_codigo text, p_especie text, p_variedad text,
  p_kg numeric, p_planta_id uuid, p_temporada text, p_ubicacion_id uuid, p_actor uuid,
  p_productor uuid DEFAULT NULL, p_predio uuid DEFAULT NULL, p_cuartel uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_lote uuid; v_tx uuid := gen_random_uuid(); v_snap jsonb;
BEGIN
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'kg del lote debe ser > 0'; END IF;
  v_snap := proc_fn_build_origen_snapshot(p_empresa_id, p_productor, p_predio, p_cuartel, p_especie, p_variedad);
  IF v_snap IS NULL OR v_snap = '{}'::jsonb THEN v_snap := NULL;
  ELSE v_snap := v_snap || jsonb_build_object('congelado_at', now()); END IF;
  INSERT INTO proc_lote(empresa_id, recepcion_id, codigo, especie_codigo, variedad_codigo, ubicacion,
    productor_vinculo_id, predio_id, cuartel_id, origen_snapshot, created_by)
  VALUES (p_empresa_id, p_recepcion_id, p_codigo, p_especie, p_variedad, NULL,
    p_productor, p_predio, p_cuartel, v_snap, p_actor) RETURNING id INTO v_lote;
  INSERT INTO proc_movimiento(empresa_id, planta_id, temporada_codigo, tipo_movimiento, naturaleza,
    objeto_tipo, objeto_id, cantidad, ubicacion_destino_id, ref_tipo, ref_id, transaccion_id, created_by)
  VALUES (p_empresa_id, p_planta_id, p_temporada, 'recepcion', 'entrada',
    'lote', v_lote, p_kg, p_ubicacion_id, 'recepcion', p_recepcion_id, v_tx, p_actor);
  RETURN v_lote;
END $$;

-- FIN T4. Cambio central aditivo. NO producción.
