-- ============================================================================
-- authz_v1/03_enforcement_rls.sql — Retrofit de enforcement por CAPABILITY en las policies RLS
-- de escritura de los dominios operacionales proc_*. DISENO/LOCAL. No aplicar remoto sin autorizacion.
--
-- Patron (ya probado 28/28 en 02/rehearsal): reemplaza la policy unica pol_<t>_empresa (tenant-only)
-- por SELECT (tenant AND <dom>.ver) + INSERT/UPDATE/DELETE (tenant AND <write_cap>).
-- SIEMPRE capability AND tenant (nunca OR). Aditivo/reversible (rollback restaura pol_<t>_empresa).
-- Defensivo: solo toca tablas con columna empresa_id y con la policy tenant previa; salta el resto.
--
-- COBERTURA: gate COARSE de escritura por dominio (P1 + P0 base). Las transiciones elevadas
-- per-operacion (cerrar/reabrir/anular/aprobar) van en 04_enforcement_transitions.sql (triggers por
-- estado), porque RLS no distingue el estado destino de un UPDATE.
-- ============================================================================
DO $enf$
DECLARE
  -- (tabla, dominio, capability de escritura)
  rows text[][] := ARRAY[
    ['proc_recepcion','recepcion','recepcion.crear'],
    ['proc_lote','lotes','lotes.crear'],
    ['proc_qc_recepcion','qc','qc.registrar'],
    ['proc_hold','qc','qc.hold'],
    ['proc_orden_proceso','proceso','proceso.ejecutar'],
    ['proc_programa_proceso','proceso','proceso.programar'],
    ['proc_orden_insumo','proceso','proceso.ejecutar'],
    ['proc_resultado','proceso','proceso.ejecutar'],
    ['proc_movimiento','inventario','inventario.mover'],
    ['proc_pallet','inventario','inventario.mover'],
    ['proc_producto_terminado','inventario','inventario.mover'],
    ['proc_repaletizaje','repaletizaje','repaletizaje.ejecutar'],
    ['proc_despacho','despacho','despacho.crear'],
    ['proc_despacho_linea','despacho','despacho.crear'],
    ['proc_tarifa','tarifas','tarifas.editar'],
    ['proc_servicio_facturable','tarifas','tarifas.editar'],
    ['proc_base_cobro','tarifas','tarifas.editar'],
    ['proc_cliente_contrato','contratos','contratos.editar'],
    ['proc_informe','reporting','reporting.enviar'],
    ['proc_reporte_destinatario','reporting','reporting.destinatarios'],
    ['proc_temporada','temporada','temporada.crear']
  ];
  i int; t text; dom text; wcap text; n int := 0;
BEGIN
  FOR i IN 1..array_length(rows,1) LOOP
    t := rows[i][1]; dom := rows[i][2]; wcap := rows[i][3];
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;                       -- tabla ausente => salta
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='empresa_id') THEN
      CONTINUE;                                                                        -- sin empresa_id => no aplica este patron
    END IF;
    -- retira la policy tenant-only previa y las nuevas (idempotente)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_empresa', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_del', t);
    -- SELECT: tenant AND <dom>.ver
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_sel', t, dom||'.ver');
    -- INSERT/UPDATE/DELETE: tenant AND <write_cap>
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_ins', t, wcap);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_upd', t, wcap);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_del', t, wcap);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'authz enforcement RLS aplicado a % tablas operacionales (capability AND tenant).', n;
END $enf$;

-- ── ROLLBACK (restaura la policy tenant-only original por tabla) ──
-- DO $r$ DECLARE t text; tabs text[] := ARRAY['proc_recepcion','proc_lote','proc_qc_recepcion','proc_hold',
--   'proc_orden_proceso','proc_programa_proceso','proc_orden_insumo','proc_resultado','proc_movimiento',
--   'proc_pallet','proc_producto_terminado','proc_repaletizaje','proc_despacho','proc_despacho_linea',
--   'proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_cliente_contrato','proc_informe',
--   'proc_reporte_destinatario','proc_temporada'];
-- BEGIN FOREACH t IN ARRAY tabs LOOP IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_sel',t);
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_ins',t);
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_upd',t);
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_del',t);
--   EXECUTE format('CREATE POLICY %I ON public.%I USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa())','pol_'||t||'_empresa',t);
-- END LOOP; END $r$;
-- ============================================================================
