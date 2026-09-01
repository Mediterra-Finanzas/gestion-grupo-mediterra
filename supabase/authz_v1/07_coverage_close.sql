-- ============================================================================
-- authz_v1/07_coverage_close.sql — CIERRE DE COBERTURA (P0=0 + config no tenant-only).
-- DISENO/LOCAL. No aplicar remoto sin autorizacion. Producción HANDS-OFF.
--
-- Cierra el gap del audit full-schema (2026-08-31):
--   P0 (3): proc_resultado_descarte, proc_resultado_merma (direct-client-write sin cap) +
--           proc_informe_version (emision de informe oficial solo requeria membership).
--   P1 hijas (bypass directo latente): informe_fuente/destinatario/envio, base_cobro_linea,
--           pallet_linea, repaletizaje_origen/destino, despacho_doc, cliente_ficha, envase_movimiento.
--   CONFIG (regla CFO: modificacion material/operacional NO puede quedar tenant-only):
--           Clase B (reglas/tarifas/trazabilidad) -> config.administrar ; Clase A (catalogos
--           operacionales) -> config.editar. LECTURA de catalogos queda abierta al tenant (no rompe
--           dropdowns); solo se gatilla la ESCRITURA.
--
-- Patron: reutiliza proc_has_capability (02). SIEMPRE capability AND tenant. Aditivo/idempotente.
-- Rollback inline al pie (restaura pol_<t>_empresa tenant-only y quita el trigger nuevo).
-- ============================================================================

-- ── (1) CATALOGO: dominio 'config' (Clase A operacional / Clase B administrativa) ──
INSERT INTO iam_capability(codigo,dominio,descripcion,critico) VALUES
 ('config.ver','config','Ver configuracion/catalogos',false),
 ('config.editar','config','Editar catalogos OPERACIONALES (lineas/ubicaciones/planta/calibre/...)',false),
 ('config.administrar','config','Administrar catalogos que alteran reglas/tarifas/trazabilidad (especie/vinculo/qc_parametro/...)',true)
ON CONFLICT (codigo) DO NOTHING;

-- Grants de rol (explicitos; NO se re-corre el seed blanket de JEFE/ADMIN para no darle
-- config.administrar a JEFE por accidente). config.administrar = SOLO PROC_ADMIN (SoD).
INSERT INTO iam_rol_capability(rol,capability) VALUES
 ('PROC_VIEWER','config.ver'),
 ('PROC_JEFE_PLANTA','config.ver'),('PROC_JEFE_PLANTA','config.editar'),
 ('PROC_ADMIN','config.ver'),('PROC_ADMIN','config.editar'),('PROC_ADMIN','config.administrar')
ON CONFLICT DO NOTHING;

-- ── (2) HIJAS OPERACIONALES (P0 + P1): full 03-style (SELECT dom.ver + escritura write_cap) ──
--     Hereda la capability del AGREGADO padre (regla de agregados): no inventa cap por tabla.
DO $child$
DECLARE
  rows text[][] := ARRAY[
    ['proc_resultado_descarte','proceso','proceso.ejecutar'],        -- P0
    ['proc_resultado_merma','proceso','proceso.ejecutar'],           -- P0
    ['proc_informe_version','reporting','reporting.enviar'],         -- P0 (+ trigger emit, seccion 4)
    ['proc_informe_fuente','reporting','reporting.enviar'],          -- P1
    ['proc_informe_destinatario','reporting','reporting.enviar'],    -- P1
    ['proc_informe_envio','reporting','reporting.enviar'],           -- P1
    ['proc_base_cobro_linea','tarifas','tarifas.editar'],            -- P1
    ['proc_pallet_linea','inventario','inventario.mover'],           -- P1
    ['proc_repaletizaje_origen','repaletizaje','repaletizaje.ejecutar'], -- P1
    ['proc_repaletizaje_destino','repaletizaje','repaletizaje.ejecutar'],-- P1
    ['proc_despacho_doc','despacho','despacho.crear'],               -- P1
    ['proc_cliente_ficha','contratos','contratos.editar'],           -- P1
    ['proc_envase_movimiento','inventario','inventario.mover']       -- P1 (ledger; reutiliza inventario.mover)
  ];
  i int; t text; dom text; wcap text; n int := 0;
BEGIN
  FOR i IN 1..array_length(rows,1) LOOP
    t := rows[i][1]; dom := rows[i][2]; wcap := rows[i][3];
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='empresa_id') THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_empresa', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_del', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_sel', t, dom||'.ver');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_ins', t, wcap);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_upd', t, wcap);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_del', t, wcap);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'authz cobertura HIJAS aplicada a % tablas (capability AND tenant).', n;
END $child$;

-- ── (3) CONFIG / MAESTROS: solo ESCRITURA gateada; LECTURA queda tenant-only (no rompe la app) ──
DO $cfg$
DECLARE
  -- Clase A (operacional -> config.editar) y Clase B (reglas/tarifas/trazabilidad -> config.administrar)
  claseA text[] := ARRAY['proc_lineas_proceso','proc_ubicaciones','proc_planta','proc_calibre','proc_color',
                         'proc_categorias_calidad','proc_condiciones','proc_motivos_descarte','proc_motivos_merma'];
  claseB text[] := ARRAY['proc_qc_parametro','proc_vinculo','proc_especie','proc_variedad','proc_tipo_servicio',
                         'proc_predios','proc_cuartel','proc_cliente_productor','proc_tipo_documento_contractual',
                         'proc_tipo_envase','proc_formato','proc_reporte_config','proc_empresa_config','proc_catalogo_activacion'];
  t text; wcap text; n int := 0;
BEGIN
  FOREACH t IN ARRAY (claseA || claseB) LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='empresa_id') THEN CONTINUE; END IF;
    wcap := CASE WHEN t = ANY(claseA) THEN 'config.editar' ELSE 'config.administrar' END;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_empresa', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_del', t);
    -- LECTURA: tenant-only (cualquier miembro lee catalogos para operar; sin cap)
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (empresa_id=proc_current_empresa())', 'pol_'||t||'_sel', t);
    -- ESCRITURA: tenant AND config cap
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_ins', t, wcap);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_upd', t, wcap);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (empresa_id=proc_current_empresa() AND proc_has_capability(%L))', 'pol_'||t||'_del', t, wcap);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'authz cobertura CONFIG (escritura) aplicada a % catalogos (lectura tenant-only).', n;
END $cfg$;

-- ── (4) TRANSICION ELEVADA: emision de informe oficial (proc_informe_version.estado -> emitida) ──
CREATE OR REPLACE FUNCTION proc_authz_tr_informe_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NEW.estado IN ('emitida','reemplazada')
     THEN PERFORM proc_require_capability('reporting.enviar');
  END IF;
  RETURN NEW;
END $$;
DO $inst$
BEGIN
  IF to_regclass('public.proc_informe_version') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_authz_proc_informe_version ON public.proc_informe_version;
    CREATE TRIGGER trg_authz_proc_informe_version BEFORE UPDATE OF estado ON public.proc_informe_version
      FOR EACH ROW EXECUTE FUNCTION proc_authz_tr_informe_version();
    RAISE NOTICE 'authz trigger emit informe_version instalado.';
  END IF;
END $inst$;

-- ============================================================================
-- ROLLBACK (restaura tenant-only en las 27 tablas de 07 + quita el trigger nuevo):
-- DO $r$ DECLARE t text; tabs text[] := ARRAY[
--   'proc_resultado_descarte','proc_resultado_merma','proc_informe_version','proc_informe_fuente',
--   'proc_informe_destinatario','proc_informe_envio','proc_base_cobro_linea','proc_pallet_linea',
--   'proc_repaletizaje_origen','proc_repaletizaje_destino','proc_despacho_doc','proc_cliente_ficha',
--   'proc_envase_movimiento','proc_lineas_proceso','proc_ubicaciones','proc_planta','proc_calibre',
--   'proc_color','proc_categorias_calidad','proc_condiciones','proc_motivos_descarte','proc_motivos_merma',
--   'proc_qc_parametro','proc_vinculo','proc_especie','proc_variedad','proc_tipo_servicio','proc_predios',
--   'proc_cuartel','proc_cliente_productor','proc_tipo_documento_contractual','proc_tipo_envase','proc_formato',
--   'proc_reporte_config','proc_empresa_config','proc_catalogo_activacion'];
-- BEGIN FOREACH t IN ARRAY tabs LOOP IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_sel',t);
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_ins',t);
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_upd',t);
--   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_del',t);
--   EXECUTE format('CREATE POLICY %I ON public.%I USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa())','pol_'||t||'_empresa',t);
-- END LOOP;
-- IF to_regclass('public.proc_informe_version') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_authz_proc_informe_version ON public.proc_informe_version; END IF; END $r$;
-- ============================================================================
