-- ============================================================================
-- schema_proc_reporting_daily_v1.sql · PROC-REPORTING-DAILY-001
-- Informe Diario de Operación de Allegria Service. Agrupa por CLIENTE del servicio
-- (nunca por productor). Kg desde el LEDGER (SoT), nunca del frontend.
-- Componentes: config (tenant-scoped) + destinatarios (separados del cliente reportado)
-- + read-model desde el ledger + motor de ejecución con snapshot INMUTABLE +
-- idempotencia + estados + historial/retry. RLS estricta.
-- NO crea scheduler ni envía email (server-side; ver contrato). Aditivo. NO producción.
-- Depende de: F2 (ledger), F7.3 (orden), T6-T8 (cliente/ficha/gate). No toca esas tablas.
-- ============================================================================

-- ── 1. Configuración del reporte (tenant-scoped; nada hardcodeado) ──────────
CREATE TABLE IF NOT EXISTS proc_reporte_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  tipo_reporte text NOT NULL DEFAULT 'diario_operacion' CHECK (tipo_reporte IN ('diario_operacion')),
  nombre text,
  activo boolean NOT NULL DEFAULT true,
  planta_id uuid REFERENCES proc_planta(id),                 -- null = todas las plantas
  timezone text NOT NULL DEFAULT 'America/Santiago',          -- corte diario determinístico
  hora_envio time NOT NULL DEFAULT '18:00',
  enviar_sin_movimiento boolean NOT NULL DEFAULT false,       -- default: NO enviar si no hubo movimiento
  incluir_alertas boolean NOT NULL DEFAULT false,
  alcance text NOT NULL DEFAULT 'general' CHECK (alcance IN ('general','cliente')),
  alcance_cliente_vinculo_id uuid REFERENCES proc_vinculo(id),  -- aislamiento por cliente (backend)
  asunto_prefijo text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  CHECK (alcance = 'general' OR alcance_cliente_vinculo_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_proc_reporte_config_emp ON proc_reporte_config(empresa_id) WHERE deleted_at IS NULL;

-- ── 2. Destinatarios del email (SEPARADOS del cliente reportado) ────────────
--    El alcance de la config define QUÉ datos salen; el destinatario define A QUIÉN.
--    Un destinatario externo atado a una config alcance='cliente' sólo recibe ese cliente.
CREATE TABLE IF NOT EXISTS proc_reporte_destinatario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES proc_reporte_config(id),
  nombre text, email text NOT NULL,
  tipo text NOT NULL DEFAULT 'interno' CHECK (tipo IN ('interno','externo')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_proc_reporte_dest_cfg ON proc_reporte_destinatario(config_id) WHERE deleted_at IS NULL;

-- ── 3. Ejecución + snapshot inmutable (historial auditable) ─────────────────
CREATE TABLE IF NOT EXISTS proc_reporte_ejecucion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES proc_reporte_config(id),
  tipo_reporte text NOT NULL DEFAULT 'diario_operacion',
  fecha_operacional date NOT NULL,
  planta_id uuid, timezone text NOT NULL,
  alcance text NOT NULL, alcance_cliente_vinculo_id uuid,
  asunto text,
  snapshot jsonb NOT NULL,                       -- dataset congelado (clientes[], totales, meta)
  destinatarios_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_kg_recibido numeric(16,3) NOT NULL DEFAULT 0,
  total_kg_procesado numeric(16,3) NOT NULL DEFAULT 0,
  cantidad_clientes int NOT NULL DEFAULT 0,
  con_movimiento boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','enviado','error','omitido')),
  proveedor text, message_id text, error text, intentos int NOT NULL DEFAULT 0,
  generado_en timestamptz NOT NULL DEFAULT now(), enviado_en timestamptz,
  created_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
-- Idempotencia tenant-safe: UNA ejecución por (empresa, config, fecha_operacional).
CREATE UNIQUE INDEX IF NOT EXISTS uq_proc_reporte_ejec ON proc_reporte_ejecucion(empresa_id, config_id, fecha_operacional);
CREATE INDEX IF NOT EXISTS ix_proc_reporte_ejec_emp ON proc_reporte_ejecucion(empresa_id, fecha_operacional);

-- Guard de inmutabilidad del snapshot (los datos enviados NO se recalculan).
CREATE OR REPLACE FUNCTION proc_fn_reporte_ejec_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.fecha_operacional IS DISTINCT FROM OLD.fecha_operacional
     OR NEW.total_kg_recibido IS DISTINCT FROM OLD.total_kg_recibido
     OR NEW.total_kg_procesado IS DISTINCT FROM OLD.total_kg_procesado
     OR NEW.destinatarios_snapshot IS DISTINCT FROM OLD.destinatarios_snapshot
     OR NEW.config_id IS DISTINCT FROM OLD.config_id THEN
    RAISE EXCEPTION 'snapshot de ejecución es inmutable (no se recalcula un informe histórico)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reporte_ejec_guard ON proc_reporte_ejecucion;
CREATE TRIGGER trg_reporte_ejec_guard BEFORE UPDATE ON proc_reporte_ejecucion FOR EACH ROW EXECUTE FUNCTION proc_fn_reporte_ejec_guard();

-- ── 4. Read-model del dataset diario desde el LEDGER (fecha operacional + tz) ─
--    Kg recibidos = entradas de recepción del ledger; Kg procesados = consumo real
--    de órdenes (proc_orden_insumo). Fecha operacional = (fecha AT TIME ZONE tz)::date.
--    Agrupa por CLIENTE del servicio. NUNCA usa kg programados/estimados/frontend.
CREATE OR REPLACE FUNCTION proc_fn_informe_diario_operacion(
  p_empresa uuid, p_fecha date, p_planta uuid DEFAULT NULL,
  p_cliente uuid DEFAULT NULL, p_tz text DEFAULT 'America/Santiago'
) RETURNS TABLE(cliente_vinculo_id uuid, cliente_nombre text,
                kg_recibido numeric, kg_procesado numeric,
                cantidad_recepciones int, cantidad_ordenes int)
LANGUAGE sql STABLE AS $$
  WITH recib AS (
    SELECT r.cliente_servicio_vinculo_id AS cli,
           SUM(m.cantidad) AS kg, COUNT(DISTINCT r.id) AS n_rec
    FROM proc_movimiento m
    JOIN proc_recepcion r ON r.id = m.ref_id AND r.empresa_id = m.empresa_id
    WHERE m.empresa_id = p_empresa
      AND m.ref_tipo = 'recepcion' AND m.objeto_tipo = 'lote' AND m.naturaleza = 'entrada'
      AND (m.fecha AT TIME ZONE p_tz)::date = p_fecha
      AND (p_planta IS NULL OR r.planta_id = p_planta)
      AND (p_cliente IS NULL OR r.cliente_servicio_vinculo_id = p_cliente)
      AND r.deleted_at IS NULL
    GROUP BY r.cliente_servicio_vinculo_id
  ),
  proc AS (
    SELECT o.cliente_servicio_vinculo_id AS cli,
           SUM(i.kg) AS kg, COUNT(DISTINCT o.id) AS n_ord
    FROM proc_orden_insumo i
    JOIN proc_movimiento m ON m.id = i.movimiento_id AND m.empresa_id = i.empresa_id
    JOIN proc_orden_proceso o ON o.id = i.orden_id AND o.empresa_id = i.empresa_id
    WHERE i.empresa_id = p_empresa
      AND (m.fecha AT TIME ZONE p_tz)::date = p_fecha
      AND (p_planta IS NULL OR o.planta_id = p_planta)
      AND (p_cliente IS NULL OR o.cliente_servicio_vinculo_id = p_cliente)
    GROUP BY o.cliente_servicio_vinculo_id
  ),
  clientes AS (
    SELECT cli FROM recib UNION SELECT cli FROM proc
  )
  SELECT c.cli,
         COALESCE(v.nombre_provisional, '(sin cliente asignado)') AS cliente_nombre,
         COALESCE(r.kg, 0) AS kg_recibido, COALESCE(p.kg, 0) AS kg_procesado,
         COALESCE(r.n_rec, 0)::int AS cantidad_recepciones,
         COALESCE(p.n_ord, 0)::int AS cantidad_ordenes
  FROM clientes c
  LEFT JOIN recib r ON r.cli IS NOT DISTINCT FROM c.cli
  LEFT JOIN proc  p ON p.cli IS NOT DISTINCT FROM c.cli
  LEFT JOIN proc_vinculo v ON v.id = c.cli
  ORDER BY cliente_nombre;
$$;

-- ── 5. Motor de ejecución: genera/retorna la ejecución idempotente + snapshot ─
--    MISMO motor que usa el preview (proc_fn_informe_diario_operacion). Congela el
--    dataset. Idempotente por (empresa, config, fecha). Política sin-movimiento → 'omitido'.
CREATE OR REPLACE FUNCTION proc_fn_reporte_generar_ejecucion(
  p_empresa uuid, p_config uuid, p_fecha date, p_actor uuid DEFAULT NULL
) RETURNS proc_reporte_ejecucion LANGUAGE plpgsql AS $$
DECLARE cfg proc_reporte_config; ej proc_reporte_ejecucion;
  v_rows jsonb; v_tot_r numeric; v_tot_p numeric; v_n int; v_dest jsonb; v_asunto text; v_con_mov boolean;
BEGIN
  SELECT * INTO cfg FROM proc_reporte_config WHERE id = p_config AND empresa_id = p_empresa AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'configuración de reporte no encontrada o de otra empresa'; END IF;

  -- Idempotencia: si ya existe la ejecución del día, se devuelve (no se recalcula ni duplica).
  SELECT * INTO ej FROM proc_reporte_ejecucion
    WHERE empresa_id = p_empresa AND config_id = p_config AND fecha_operacional = p_fecha;
  IF FOUND THEN RETURN ej; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.cliente_nombre), '[]'::jsonb),
         COALESCE(SUM(x.kg_recibido), 0), COALESCE(SUM(x.kg_procesado), 0), COUNT(*)
    INTO v_rows, v_tot_r, v_tot_p, v_n
    FROM proc_fn_informe_diario_operacion(
      p_empresa, p_fecha, cfg.planta_id,
      CASE WHEN cfg.alcance = 'cliente' THEN cfg.alcance_cliente_vinculo_id ELSE NULL END,
      cfg.timezone) x;

  v_con_mov := (v_tot_r > 0 OR v_tot_p > 0);
  v_dest := COALESCE((SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'email', email, 'tipo', tipo))
                      FROM proc_reporte_destinatario
                      WHERE config_id = p_config AND empresa_id = p_empresa AND activo AND deleted_at IS NULL), '[]'::jsonb);
  v_asunto := COALESCE(NULLIF(cfg.asunto_prefijo, ''), 'Allegria Service · Informe Diario de Operación')
              || ' · ' || to_char(p_fecha, 'DD-MM-YYYY');

  INSERT INTO proc_reporte_ejecucion(
      empresa_id, config_id, tipo_reporte, fecha_operacional, planta_id, timezone,
      alcance, alcance_cliente_vinculo_id, asunto, snapshot, destinatarios_snapshot,
      total_kg_recibido, total_kg_procesado, cantidad_clientes, con_movimiento, estado, created_by)
  VALUES (
      p_empresa, p_config, cfg.tipo_reporte, p_fecha, cfg.planta_id, cfg.timezone,
      cfg.alcance, cfg.alcance_cliente_vinculo_id, v_asunto,
      jsonb_build_object('fecha', p_fecha, 'planta_id', cfg.planta_id, 'timezone', cfg.timezone,
                         'alcance', cfg.alcance, 'clientes', v_rows,
                         'total_kg_recibido', v_tot_r, 'total_kg_procesado', v_tot_p, 'cantidad_clientes', v_n),
      v_dest, v_tot_r, v_tot_p, v_n, v_con_mov,
      CASE WHEN NOT v_con_mov AND NOT cfg.enviar_sin_movimiento THEN 'omitido' ELSE 'pendiente' END, p_actor)
  ON CONFLICT (empresa_id, config_id, fecha_operacional) DO NOTHING
  RETURNING * INTO ej;

  IF ej.id IS NULL THEN  -- carrera: otra transacción la creó primero → devolver la existente
    SELECT * INTO ej FROM proc_reporte_ejecucion
      WHERE empresa_id = p_empresa AND config_id = p_config AND fecha_operacional = p_fecha;
  END IF;
  RETURN ej;
END $$;

-- ── 6. Transiciones de envío (la confirmación viene del proveedor real) ─────
-- Marcar 'enviado' SOLO con confirmación del proveedor (message_id). No fabricar.
CREATE OR REPLACE FUNCTION proc_fn_reporte_marcar_enviado(
  p_empresa uuid, p_ejecucion uuid, p_proveedor text, p_message_id text, p_actor uuid DEFAULT NULL
) RETURNS proc_reporte_ejecucion LANGUAGE plpgsql AS $$
DECLARE ej proc_reporte_ejecucion;
BEGIN
  UPDATE proc_reporte_ejecucion
    SET estado = 'enviado', proveedor = p_proveedor, message_id = p_message_id,
        enviado_en = now(), intentos = intentos + 1, updated_by = p_actor, updated_at = now()
    WHERE id = p_ejecucion AND empresa_id = p_empresa AND estado IN ('pendiente', 'procesando', 'error')
    RETURNING * INTO ej;
  IF NOT FOUND THEN RAISE EXCEPTION 'ejecución no encontrada o en estado no enviable'; END IF;
  RETURN ej;
END $$;

CREATE OR REPLACE FUNCTION proc_fn_reporte_marcar_error(
  p_empresa uuid, p_ejecucion uuid, p_error text, p_actor uuid DEFAULT NULL
) RETURNS proc_reporte_ejecucion LANGUAGE plpgsql AS $$
DECLARE ej proc_reporte_ejecucion;
BEGIN
  UPDATE proc_reporte_ejecucion
    SET estado = 'error', error = p_error, intentos = intentos + 1, updated_by = p_actor, updated_at = now()
    WHERE id = p_ejecucion AND empresa_id = p_empresa AND estado IN ('pendiente', 'procesando', 'error')
    RETURNING * INTO ej;
  IF NOT FOUND THEN RAISE EXCEPTION 'ejecución no encontrada o en estado no marcable'; END IF;
  RETURN ej;
END $$;

-- Reintento seguro: reusa el MISMO snapshot (no recalcula). error → pendiente.
CREATE OR REPLACE FUNCTION proc_fn_reporte_reintentar(
  p_empresa uuid, p_ejecucion uuid, p_actor uuid DEFAULT NULL
) RETURNS proc_reporte_ejecucion LANGUAGE plpgsql AS $$
DECLARE ej proc_reporte_ejecucion;
BEGIN
  UPDATE proc_reporte_ejecucion
    SET estado = 'pendiente', updated_by = p_actor, updated_at = now()
    WHERE id = p_ejecucion AND empresa_id = p_empresa AND estado = 'error'
    RETURNING * INTO ej;
  IF NOT FOUND THEN RAISE EXCEPTION 'sólo se puede reintentar una ejecución en error'; END IF;
  RETURN ej;
END $$;

-- ── 7. Read-model del historial (security_invoker → RLS por tenant) ─────────
CREATE OR REPLACE VIEW proc_v_reporte_ejecucion AS
SELECT e.*,
       c.nombre AS config_nombre,
       pl.nombre AS planta_nombre,
       v.nombre_provisional AS alcance_cliente_nombre
FROM proc_reporte_ejecucion e
LEFT JOIN proc_reporte_config c ON c.id = e.config_id
LEFT JOIN proc_planta pl ON pl.id = e.planta_id
LEFT JOIN proc_vinculo v ON v.id = e.alcance_cliente_vinculo_id;
ALTER VIEW proc_v_reporte_ejecucion SET (security_invoker = on);

-- ── 8. Triggers touch/audit + RLS estricta (anon DENY, tenant scoped) ───────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['proc_reporte_config','proc_reporte_destinatario','proc_reporte_ejecucion'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format('CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN PROC-REPORTING-DAILY-001 (motor). Aditivo. NO scheduler/email server-side. NO producción.
