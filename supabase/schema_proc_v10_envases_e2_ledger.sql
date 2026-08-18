-- ============================================================================
-- schema_proc_v10_envases_e2_ledger.sql
-- PROC-ENVASES-001 · E2 — Ledger append-only de movimientos de envase + RPC de registro.
--
-- Modelo (simple y matemáticamente consistente): cada movimiento transfiere `cantidad` de un tipo,
-- para un `owner`, DESDE una posición (holder_desde, ubicacion_desde, condicion_desde) HACIA otra
-- (holder_hacia, ubicacion_hacia, condicion_hacia). Un lado NULL = exterior/no-rastreado.
--   Saldo(tipo, owner, holder, ubicacion, condicion) =
--     Σ(cantidad WHERE lado_hacia = posición) − Σ(cantidad WHERE lado_desde = posición).
--
-- Identidad (ENV-D3 + precisión CFO): owner/holder son proc_vinculo EXPLÍCITOS. Allegria Service se
-- representa con un vínculo de rol 'propietario_planta' (identidad Core ratificada) — NO se usa NULL
-- para "propiedad de Service". NULL = desconocido/exterior, inequívocamente distinto de Service.
-- owner NULL = propietario desconocido; holder NULL = exterior no rastreado (o baja/pérdida/ingreso).
--
-- Naturalezas (lean, sin sinónimos redundantes; dirección real la dan holder/owner):
--   apertura · ingreso · salida · transferencia · ajuste · dano · perdida · baja.
-- Append-only (reusa proc_fn_block_ledger_mutation). Saldo derivado (E3), nunca mutable.
-- Tenant-scoped, RLS strict, anon DENY en prod, auditado. Solo proc_*. Control por CANTIDAD.
-- ============================================================================

CREATE TABLE IF NOT EXISTS proc_envase_movimiento (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL,
  tipo_envase_id           uuid NOT NULL REFERENCES proc_tipo_envase(id),
  cantidad                 numeric NOT NULL CHECK (cantidad > 0),
  naturaleza               text NOT NULL CHECK (naturaleza = ANY (ARRAY[
                             'apertura','ingreso','salida','transferencia','ajuste','dano','perdida','baja'])),
  owner_vinculo_id         uuid REFERENCES proc_vinculo(id),        -- NULL = desconocido; Service = vínculo explícito
  holder_desde_vinculo_id  uuid REFERENCES proc_vinculo(id),        -- NULL = exterior/no rastreado
  holder_hacia_vinculo_id  uuid REFERENCES proc_vinculo(id),        -- NULL = exterior/baja/pérdida
  ubicacion_desde_id       uuid REFERENCES proc_ubicaciones(id),
  ubicacion_hacia_id       uuid REFERENCES proc_ubicaciones(id),
  condicion_desde          text NOT NULL DEFAULT 'normal' CHECK (condicion_desde IN ('normal','danado')),
  condicion_hacia          text NOT NULL DEFAULT 'normal' CHECK (condicion_hacia IN ('normal','danado')),
  ref_tipo                 text CHECK (ref_tipo IS NULL OR ref_tipo = ANY (ARRAY[
                             'recepcion','despacho','manual','apertura','conciliacion'])),
  ref_id                   uuid,
  motivo                   text,
  fecha                    timestamptz NOT NULL DEFAULT now(),      -- fecha operacional (tz backend, ver T10C)
  transaccion_id           uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- Al menos un lado debe existir (no un movimiento vacío).
  CONSTRAINT ck_envase_mov_lado CHECK (holder_desde_vinculo_id IS NOT NULL OR holder_hacia_vinculo_id IS NOT NULL
                                        OR ref_tipo = 'apertura'),
  -- Ajuste y baja exigen motivo (auditoría).
  CONSTRAINT ck_envase_mov_motivo CHECK (naturaleza NOT IN ('ajuste','baja','perdida','dano') OR motivo IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_envase_mov_saldo ON proc_envase_movimiento (empresa_id, tipo_envase_id, owner_vinculo_id);

ALTER TABLE proc_envase_movimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pol_proc_envase_movimiento_empresa ON proc_envase_movimiento;
CREATE POLICY pol_proc_envase_movimiento_empresa ON proc_envase_movimiento FOR ALL
  USING (empresa_id = proc_current_empresa()) WITH CHECK (empresa_id = proc_current_empresa());
GRANT SELECT, INSERT ON proc_envase_movimiento TO anon, authenticated;   -- append-only: sin UPDATE/DELETE

DROP TRIGGER IF EXISTS trg_audit_proc_envase_movimiento ON proc_envase_movimiento;
CREATE TRIGGER trg_audit_proc_envase_movimiento AFTER INSERT OR DELETE OR UPDATE ON proc_envase_movimiento
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();
DROP TRIGGER IF EXISTS trg_block_proc_envase_movimiento ON proc_envase_movimiento;
CREATE TRIGGER trg_block_proc_envase_movimiento BEFORE UPDATE OR DELETE ON proc_envase_movimiento
  FOR EACH ROW EXECUTE FUNCTION proc_fn_block_ledger_mutation();

-- ── Saldo de una posición (helper interno, autoridad = ledger) ────────────────
CREATE OR REPLACE FUNCTION proc_fn_envase_saldo_posicion(
  p_empresa uuid, p_tipo uuid, p_owner uuid, p_holder uuid, p_ubicacion uuid, p_condicion text)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(CASE
      WHEN holder_hacia_vinculo_id IS NOT DISTINCT FROM p_holder
       AND ubicacion_hacia_id      IS NOT DISTINCT FROM p_ubicacion
       AND condicion_hacia = p_condicion THEN cantidad ELSE 0 END)
    - SUM(CASE
      WHEN holder_desde_vinculo_id IS NOT DISTINCT FROM p_holder
       AND ubicacion_desde_id      IS NOT DISTINCT FROM p_ubicacion
       AND condicion_desde = p_condicion THEN cantidad ELSE 0 END), 0)
  FROM proc_envase_movimiento
  WHERE empresa_id = p_empresa AND tipo_envase_id = p_tipo
    AND owner_vinculo_id IS NOT DISTINCT FROM p_owner;
$$;

-- ── RPC de registro (valida saldo + lockea concurrencia; ENV-D7/ENV-11) ───────
CREATE OR REPLACE FUNCTION proc_fn_envase_registrar_movimiento(
  p_empresa uuid, p_tipo uuid, p_cantidad numeric, p_naturaleza text,
  p_owner uuid DEFAULT NULL, p_holder_desde uuid DEFAULT NULL, p_holder_hacia uuid DEFAULT NULL,
  p_ubic_desde uuid DEFAULT NULL, p_ubic_hacia uuid DEFAULT NULL,
  p_condicion_desde text DEFAULT 'normal', p_condicion_hacia text DEFAULT 'normal',
  p_ref_tipo text DEFAULT 'manual', p_ref_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_fecha timestamp DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_disp numeric; v_fecha timestamptz;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'cantidad de envases debe ser > 0'; END IF;
  v_fecha := COALESCE(p_fecha AT TIME ZONE 'America/Santiago', now());
  IF v_fecha > now() + interval '10 minutes' THEN RAISE EXCEPTION 'La fecha operacional no puede ser futura'; END IF;
  -- Transferencia interna: mismo holder, ubicaciones distintas.
  IF p_naturaleza = 'transferencia' AND (p_holder_desde IS DISTINCT FROM p_holder_hacia
      OR p_ubic_desde IS NULL OR p_ubic_hacia IS NULL OR p_ubic_desde = p_ubic_hacia) THEN
    RAISE EXCEPTION 'transferencia exige mismo tenedor y ubicaciones origen/destino distintas';
  END IF;
  -- Si consume una posición (hay lado 'desde'), lockear y validar saldo disponible (no negativo).
  IF p_holder_desde IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_empresa::text||p_tipo::text||coalesce(p_owner::text,'∅')||p_holder_desde::text||
      coalesce(p_ubic_desde::text,'∅')||p_condicion_desde, 0));
    v_disp := proc_fn_envase_saldo_posicion(p_empresa, p_tipo, p_owner, p_holder_desde, p_ubic_desde, p_condicion_desde);
    IF p_cantidad > v_disp THEN
      RAISE EXCEPTION 'saldo insuficiente: disponible % en la posición de origen, se intentó mover %', v_disp, p_cantidad;
    END IF;
  END IF;
  INSERT INTO proc_envase_movimiento(empresa_id, tipo_envase_id, cantidad, naturaleza, owner_vinculo_id,
    holder_desde_vinculo_id, holder_hacia_vinculo_id, ubicacion_desde_id, ubicacion_hacia_id,
    condicion_desde, condicion_hacia, ref_tipo, ref_id, motivo, fecha, created_by)
  VALUES (p_empresa, p_tipo, p_cantidad, p_naturaleza, p_owner,
    p_holder_desde, p_holder_hacia, p_ubic_desde, p_ubic_hacia,
    COALESCE(p_condicion_desde,'normal'), COALESCE(p_condicion_hacia,'normal'), p_ref_tipo, p_ref_id, p_motivo, v_fecha, p_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION proc_fn_envase_saldo_posicion(uuid,uuid,uuid,uuid,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION proc_fn_envase_registrar_movimiento(uuid,uuid,numeric,text,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,text,timestamp,uuid) TO anon, authenticated;
