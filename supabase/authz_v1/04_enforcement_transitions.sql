-- ============================================================================
-- authz_v1/04_enforcement_transitions.sql — Guards de AUTORIZACION por transicion elevada (P0/SoD).
-- DISENO/LOCAL. No aplicar remoto sin autorizacion. Producción HANDS-OFF.
--
-- Estados y transiciones REALES (auditados; NO inventados). Se enforca via triggers BEFORE UPDATE
-- sobre la columna `estado`: cubren AMBOS write-paths reales (el PATCH directo del cliente Y los RPCs
-- SECURITY INVOKER que tambien hacen UPDATE del estado; el trigger corre bajo el contexto del caller).
-- proc_require_capability(...) lanza 42501 => fail-closed, la transaccion revierte (sin parcial).
-- Es ADITIVO a los triggers de legalidad existentes (validan estado; estos validan AUTORIDAD). SoD:
-- el RLS write-cap (03) permite tocar la fila; ESTE trigger exige la capability de la transicion.
--
-- PHANTOMS EXCLUIDOS (no existen como operacion => sin capability/guard, confirmado por el mapa):
--   repaletizaje revertir/anular ; inventario "aprobar ajuste" ; pallet/PT estado manual
--   (saldo-derivado) ; proc_fn_cerrar_orden/cerrar_temporada/cerrar_base/aprobar_contrato (son PATCH,
--   no RPCs) ; orden reabrir-desde-cerrado (terminal) ; temporada anulada->cualquiera (terminal).
-- ============================================================================

-- Helper: crea el trigger BEFORE UPDATE OF estado (idempotente) para una tabla.
-- (se llama al pie por cada entidad)

-- 1) PROCESO — proc_orden_proceso: borrador·en_proceso·pendiente_conciliacion·conciliado·cerrado·anulado
CREATE OR REPLACE FUNCTION proc_authz_tr_orden() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF    NEW.estado='cerrado' THEN PERFORM proc_require_capability('proceso.cerrar');
    ELSIF NEW.estado='anulado' THEN PERFORM proc_require_capability('proceso.anular');
    ELSIF NEW.estado='en_proceso' AND OLD.estado IN ('conciliado','pendiente_conciliacion')
          THEN PERFORM proc_require_capability('proceso.reabrir');  -- soft reopen real
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2) DESPACHO — proc_despacho: borrador·preparando·listo·cargando·despachado·cancelado
CREATE OR REPLACE FUNCTION proc_authz_tr_despacho() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF    NEW.estado='despachado' THEN PERFORM proc_require_capability('despacho.confirmar');
    ELSIF NEW.estado='cancelado'  THEN PERFORM proc_require_capability('despacho.anular');
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 3) TEMPORADA — proc_temporada: planificada·activa·cerrada·anulada (cerrar hoy es CRUD sin guard)
CREATE OR REPLACE FUNCTION proc_authz_tr_temporada() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF    NEW.estado IN ('cerrada','anulada') THEN PERFORM proc_require_capability('temporada.cerrar');
    ELSIF OLD.estado='planificada' AND NEW.estado='activa' THEN PERFORM proc_require_capability('temporada.abrir');
    ELSIF OLD.estado='cerrada' AND NEW.estado IN ('activa','planificada') THEN PERFORM proc_require_capability('temporada.reabrir');
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 4) TARIFA — proc_tarifa: vigente·cerrada·anulada (cualquier cambio de estado = elevado / SoD)
CREATE OR REPLACE FUNCTION proc_authz_tr_tarifa() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN PERFORM proc_require_capability('tarifas.aprobar'); END IF;
  RETURN NEW;
END $$;

-- 5) BASE DE COBRO — proc_base_cobro: borrador·en_revision·aprobada·enviada_a_facturacion·cerrada·anulada
CREATE OR REPLACE FUNCTION proc_authz_tr_base() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NEW.estado IN ('aprobada','enviada_a_facturacion','cerrada','anulada')
     THEN PERFORM proc_require_capability('tarifas.aprobar');
  END IF;
  RETURN NEW;
END $$;

-- 6) CONTRATO — proc_cliente_contrato: borrador·pendiente_firma·vigente·vencido·reemplazado·terminado·anulado
CREATE OR REPLACE FUNCTION proc_authz_tr_contrato() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NEW.estado IN ('vigente','terminado','reemplazado','anulado')
     THEN PERFORM proc_require_capability('contratos.aprobar');
  END IF;   -- borrador<->pendiente_firma = edicion (cubierto por contratos.editar en RLS write, 03)
  RETURN NEW;
END $$;

-- Instalar triggers (idempotente) solo si la tabla existe.
DO $inst$
DECLARE
  m text[][] := ARRAY[
    ['proc_orden_proceso','proc_authz_tr_orden'],
    ['proc_despacho','proc_authz_tr_despacho'],
    ['proc_temporada','proc_authz_tr_temporada'],
    ['proc_tarifa','proc_authz_tr_tarifa'],
    ['proc_base_cobro','proc_authz_tr_base'],
    ['proc_cliente_contrato','proc_authz_tr_contrato']
  ];
  i int; t text; fn text; n int := 0;
BEGIN
  FOR i IN 1..array_length(m,1) LOOP
    t := m[i][1]; fn := m[i][2];
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_authz_'||t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF estado ON public.%I FOR EACH ROW EXECUTE FUNCTION %I()', 'trg_authz_'||t, t, fn);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'authz transition guards instalados en % entidades.', n;
END $inst$;

-- ── ROLLBACK ──  (quita solo los guards de autorizacion; deja los triggers de legalidad intactos)
-- DO $r$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['proc_orden_proceso','proc_despacho','proc_temporada','proc_tarifa','proc_base_cobro','proc_cliente_contrato'] LOOP
--   IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I','trg_authz_'||t,t); END IF; END LOOP; END $r$;
-- ============================================================================
