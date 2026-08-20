-- ============================================================================
-- schema_proc_v7_f7_1.sql · F7.1 — BACKEND MENOR (aditivo, no destructivo)
--   1) Correlativos humanos concurrency-safe (proc_correlativo + RPC)
--   2) Severidad QC configurable (ALTER proc_qc_parametro + RPC registrar_qc)
--   3) Read-models del Centro de Operaciones (RPC centro + excepciones)
-- NO altera ledger/SoT/genealogía/tarifario/base. Requiere schema_proc_v1..v6.
-- ============================================================================

-- ── 1. CORRELATIVOS HUMANOS ─────────────────────────────────────────────────
-- Identificador humano operacional; UUID sigue siendo PK técnica de cada entidad.
-- Concurrency-safe: INSERT ... ON CONFLICT DO UPDATE ... RETURNING (sin MAX()+1).
CREATE TABLE IF NOT EXISTS proc_correlativo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  temporada_codigo  text NOT NULL,
  tipo_documento    text NOT NULL,            -- REC/LOT/ORD/PAL/DES/INF/BCO...
  prefijo           text NOT NULL,            -- configurable por tipo
  ultimo            int  NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid,
  UNIQUE (empresa_id, temporada_codigo, tipo_documento)
);

-- Reserva atómica del siguiente número y devuelve el código formateado TIPO-TEMP-NNNNNN.
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
  -- temporada compacta: "2026/2027" -> "2627"; "2526" -> "2526"
  v_short := regexp_replace(p_temporada, '[^0-9]', '', 'g');
  IF length(v_short) = 8 THEN v_short := substr(v_short,3,2) || substr(v_short,7,2); END IF;
  RETURN v_pref || '-' || v_short || '-' || lpad(v_n::text, 6, '0');
END $$;

-- ── 2. QC CONFIGURABLE (severidad) ──────────────────────────────────────────
-- Cada parámetro decide su efecto en el gate. Rango/tipo/especie/activo ya existían.
ALTER TABLE proc_qc_parametro
  ADD COLUMN IF NOT EXISTS severidad text NOT NULL DEFAULT 'informativo'
  CHECK (severidad IN ('informativo','advertencia','bloqueante'));

-- Registra QC de una recepción, valida cada valor contra su parámetro y determina
-- el resultado de forma ENFORCEABLE en backend (la UI solo pre-valida):
--   bloqueante fuera de rango  -> 'rechazado'
--   advertencia fuera de rango -> 'condicional'
--   informativo / dentro rango -> no afecta el gate
CREATE OR REPLACE FUNCTION proc_fn_registrar_qc(
  p_empresa uuid, p_recepcion uuid, p_valores jsonb, p_actor uuid
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_esp text; p record; v_val text; v_num numeric; v_out boolean; v_res text := 'aprobado'; v_id uuid;
BEGIN
  SELECT especie_codigo INTO v_esp FROM proc_recepcion WHERE id=p_recepcion AND empresa_id=p_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'recepción % no existe', p_recepcion; END IF;
  FOR p IN SELECT * FROM proc_qc_parametro
      WHERE empresa_id=p_empresa AND especie_codigo=v_esp AND activo AND deleted_at IS NULL
        AND (vigencia_desde IS NULL OR vigencia_desde <= current_date)
        AND (vigencia_hasta IS NULL OR vigencia_hasta >= current_date)
  LOOP
    v_val := p_valores ->> p.codigo;
    v_out := false;
    IF v_val IS NULL OR v_val = '' THEN
      IF p.obligatorio THEN v_out := true; END IF;                 -- faltante obligatorio = fuera
    ELSIF p.tipo_dato = 'numero' THEN
      BEGIN v_num := v_val::numeric; EXCEPTION WHEN others THEN v_num := NULL; END;
      IF v_num IS NULL THEN v_out := true;
      ELSIF (p.rango_min IS NOT NULL AND v_num < p.rango_min)
         OR (p.rango_max IS NOT NULL AND v_num > p.rango_max) THEN v_out := true;
      END IF;
    END IF;
    IF v_out THEN
      IF p.severidad = 'bloqueante' THEN v_res := 'rechazado';
      ELSIF p.severidad = 'advertencia' AND v_res <> 'rechazado' THEN v_res := 'condicional';
      END IF;
    END IF;
  END LOOP;
  INSERT INTO proc_qc_recepcion(empresa_id, recepcion_id, valores, resultado, created_by)
    VALUES (p_empresa, p_recepcion, COALESCE(p_valores,'{}'::jsonb), v_res, p_actor)
  ON CONFLICT (empresa_id, recepcion_id)
    DO UPDATE SET valores=EXCLUDED.valores, resultado=EXCLUDED.resultado, updated_at=now(), updated_by=p_actor
  RETURNING id INTO v_id;
  RETURN v_res;
END $$;

-- ── 3. READ-MODELS DEL CENTRO DE OPERACIONES (solo lectura, RLS aplica) ──────
-- Agregados del día por (empresa, planta?, temporada?, fecha). No cache, no 2a SoT.
-- Nota de scoping: recepción usa temporada_id (join proc_temporada); orden no lleva
-- temporada; pallet/despacho usan temporada_codigo. Se aplica el filtro donde existe.
CREATE OR REPLACE FUNCTION proc_fn_centro_operaciones(
  p_empresa uuid, p_planta uuid, p_temporada text, p_fecha date
) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'recepcion', jsonb_build_object(
      'recepciones_dia', (SELECT count(*) FROM proc_recepcion r
         WHERE r.empresa_id=p_empresa AND r.deleted_at IS NULL AND r.fecha::date=p_fecha
           AND (p_planta IS NULL OR r.planta_id=p_planta)),
      'kg_recibido_dia', (SELECT COALESCE(SUM(r.kg_neto),0) FROM proc_recepcion r
         WHERE r.empresa_id=p_empresa AND r.deleted_at IS NULL AND r.fecha::date=p_fecha
           AND (p_planta IS NULL OR r.planta_id=p_planta)),
      'recepciones_pendientes', (SELECT count(*) FROM proc_recepcion r
         WHERE r.empresa_id=p_empresa AND r.deleted_at IS NULL AND r.estado='borrador'
           AND (p_planta IS NULL OR r.planta_id=p_planta))
    ),
    'produccion', jsonb_build_object(
      'programa_dia', (SELECT count(*) FROM proc_programa_proceso pg
         WHERE pg.empresa_id=p_empresa AND pg.fecha=p_fecha AND pg.estado IN ('borrador','publicado')
           AND (p_planta IS NULL OR pg.planta_id=p_planta)),
      'ordenes_en_proceso', (SELECT count(*) FROM proc_orden_proceso o
         WHERE o.empresa_id=p_empresa AND o.deleted_at IS NULL AND o.estado='en_proceso'
           AND (p_planta IS NULL OR o.planta_id=p_planta)),
      'ordenes_pendientes_conciliacion', (SELECT count(*) FROM proc_orden_proceso o
         WHERE o.empresa_id=p_empresa AND o.deleted_at IS NULL AND o.estado='pendiente_conciliacion'
           AND (p_planta IS NULL OR o.planta_id=p_planta)),
      'kg_procesado_dia', (SELECT COALESCE(SUM(i.kg),0) FROM proc_orden_insumo i
         JOIN proc_orden_proceso o ON o.id=i.orden_id
         WHERE o.empresa_id=p_empresa AND o.fecha=p_fecha
           AND (p_planta IS NULL OR o.planta_id=p_planta))
    ),
    'producto_terminado', jsonb_build_object(
      'kg_pt_disponible', (SELECT COALESCE(SUM(s.on_hand),0) FROM proc_v_pt_saldos s
         JOIN proc_producto_terminado pt ON pt.id=s.pt_id
         WHERE pt.empresa_id=p_empresa AND (p_planta IS NULL OR pt.planta_id=p_planta)
           AND (p_temporada IS NULL OR pt.temporada_codigo=p_temporada)),
      'pallets_disponibles', (SELECT count(*) FROM proc_v_pallet_saldos s
         JOIN proc_pallet pl ON pl.id=s.pallet_id
         WHERE pl.empresa_id=p_empresa AND s.disponible>0
           AND (p_planta IS NULL OR pl.planta_id=p_planta)
           AND (p_temporada IS NULL OR pl.temporada_codigo=p_temporada)),
      'pallets_reservados', (SELECT count(*) FROM proc_v_pallet_saldos s
         JOIN proc_pallet pl ON pl.id=s.pallet_id
         WHERE pl.empresa_id=p_empresa AND s.reservado>0
           AND (p_planta IS NULL OR pl.planta_id=p_planta)),
      'pallets_bloqueados', (SELECT count(*) FROM proc_v_pallet_saldos s
         JOIN proc_pallet pl ON pl.id=s.pallet_id
         WHERE pl.empresa_id=p_empresa AND s.bloqueado>0
           AND (p_planta IS NULL OR pl.planta_id=p_planta))
    ),
    'despacho', jsonb_build_object(
      'preparados', (SELECT count(*) FROM proc_despacho d
         WHERE d.empresa_id=p_empresa AND d.deleted_at IS NULL AND d.estado IN ('preparando','listo')
           AND (p_planta IS NULL OR d.planta_origen_id=p_planta)),
      'cargando', (SELECT count(*) FROM proc_despacho d
         WHERE d.empresa_id=p_empresa AND d.deleted_at IS NULL AND d.estado='cargando'
           AND (p_planta IS NULL OR d.planta_origen_id=p_planta)),
      'despachados_dia', (SELECT count(*) FROM proc_despacho d
         WHERE d.empresa_id=p_empresa AND d.deleted_at IS NULL AND d.estado='despachado'
           AND d.fecha_efectiva::date=p_fecha AND (p_planta IS NULL OR d.planta_origen_id=p_planta))
    ),
    'excepciones', jsonb_build_object(
      'conciliaciones_pendientes', (SELECT count(*) FROM proc_orden_proceso o
         WHERE o.empresa_id=p_empresa AND o.deleted_at IS NULL AND o.estado='pendiente_conciliacion'
           AND (p_planta IS NULL OR o.planta_id=p_planta)),
      'qc_rechazado', (SELECT count(*) FROM proc_qc_recepcion q JOIN proc_recepcion r ON r.id=q.recepcion_id
         WHERE q.empresa_id=p_empresa AND q.deleted_at IS NULL AND q.resultado='rechazado'
           AND (p_planta IS NULL OR r.planta_id=p_planta)),
      'pendiente_tarifa', (SELECT count(*) FROM proc_servicio_facturable sf
         WHERE sf.empresa_id=p_empresa AND sf.deleted_at IS NULL AND sf.estado='pendiente_tarifa'),
      'pallets_bloqueados', (SELECT count(*) FROM proc_v_pallet_saldos s
         JOIN proc_pallet pl ON pl.id=s.pallet_id
         WHERE pl.empresa_id=p_empresa AND s.bloqueado>0 AND (p_planta IS NULL OR pl.planta_id=p_planta)),
      'informes_sin_emitir', (SELECT count(*) FROM proc_informe_version v JOIN proc_informe inf ON inf.id=v.informe_id
         WHERE v.empresa_id=p_empresa AND v.estado='generada')
    )
  )
$$;

-- Lista accionable de excepciones (una fila por incidencia).
CREATE OR REPLACE FUNCTION proc_fn_excepciones(
  p_empresa uuid, p_planta uuid, p_temporada text
) RETURNS TABLE(tipo text, referencia_id uuid, folio text, detalle text, severidad text)
LANGUAGE sql STABLE AS $$
  -- Conciliación pendiente
  SELECT 'conciliacion_pendiente', o.id, o.folio,
         'Orden pendiente de conciliar', 'advertencia'
    FROM proc_orden_proceso o
    WHERE o.empresa_id=p_empresa AND o.deleted_at IS NULL AND o.estado='pendiente_conciliacion'
      AND (p_planta IS NULL OR o.planta_id=p_planta)
  UNION ALL
  -- Diferencia de masa fuera de tolerancia (orden pendiente con |diff|>tolerancia)
  SELECT 'diferencia_masa', o.id, o.folio,
         'Diferencia de masa fuera de tolerancia', 'bloqueante'
    FROM proc_orden_proceso o JOIN proc_v_orden_conciliacion c ON c.orden_id=o.id
    WHERE o.empresa_id=p_empresa AND o.deleted_at IS NULL AND o.estado='pendiente_conciliacion'
      AND abs(c.diff) > c.tolerancia AND (p_planta IS NULL OR o.planta_id=p_planta)
  UNION ALL
  -- QC rechazado
  SELECT 'qc_rechazado', r.id, r.folio,
         'QC de recepción rechazado', 'bloqueante'
    FROM proc_qc_recepcion q JOIN proc_recepcion r ON r.id=q.recepcion_id
    WHERE q.empresa_id=p_empresa AND q.deleted_at IS NULL AND q.resultado='rechazado'
      AND (p_planta IS NULL OR r.planta_id=p_planta)
  UNION ALL
  -- Pallet bloqueado
  SELECT 'pallet_bloqueado', pl.id, pl.codigo,
         'Pallet con bloqueo activo', 'advertencia'
    FROM proc_v_pallet_saldos s JOIN proc_pallet pl ON pl.id=s.pallet_id
    WHERE pl.empresa_id=p_empresa AND s.bloqueado>0
      AND (p_planta IS NULL OR pl.planta_id=p_planta)
      AND (p_temporada IS NULL OR pl.temporada_codigo=p_temporada)
  UNION ALL
  -- Servicio pendiente de tarifa (nunca $0)
  SELECT 'pendiente_tarifa', sf.id, NULL,
         'Servicio facturable sin tarifa vigente', 'advertencia'
    FROM proc_servicio_facturable sf
    WHERE sf.empresa_id=p_empresa AND sf.deleted_at IS NULL AND sf.estado='pendiente_tarifa'
  UNION ALL
  -- Informe generado sin emitir
  SELECT 'informe_sin_emitir', v.id, inf.folio,
         'Versión de informe generada, pendiente de emitir', 'informativo'
    FROM proc_informe_version v JOIN proc_informe inf ON inf.id=v.informe_id
    WHERE v.empresa_id=p_empresa AND v.estado='generada'
$$;

-- ── Triggers touch + auditoría (proc_correlativo) ───────────────────────────
DROP TRIGGER IF EXISTS trg_touch_proc_correlativo ON proc_correlativo;
CREATE TRIGGER trg_touch_proc_correlativo BEFORE UPDATE ON proc_correlativo
  FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_audit_proc_correlativo ON proc_correlativo;
CREATE TRIGGER trg_audit_proc_correlativo AFTER INSERT OR UPDATE OR DELETE ON proc_correlativo
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

-- ── RLS productiva (proc_correlativo) ───────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_correlativo'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;
