-- ============================================================================
-- authz_v1/01_schema_authz.sql — Capa AUTHZ (roles+capabilities) para Allegria Service (PROC).
-- DISENO/LOCAL. No aplicar remoto sin autorizacion. Producción HANDS-OFF.
--
-- DECISION DE OPTIMIZACION (B3.1): 4 tablas (no 6). Se DIFIERE overrides por usuario a post-go-live
-- (los roles cubren el go-live) y el AUDIT de grants REUTILIZA proc_audit_log via trigger (no tabla
-- nueva). Se mantiene: auditabilidad, SoD, extensibilidad, tenant isolation, revocacion next-request.
--
-- REUTILIZA: iam_usuario, iam_usuario_empresa, resolvers Option C (proc_current_iam_user/empresa),
-- JWT authenticated, RLS por tenant, proc_audit_log. NO duplica identidad/membership/tenant.
-- ============================================================================

-- (1) Catalogo de capabilities (vocabulario de autoridad). Derivado de operaciones REALES existentes.
CREATE TABLE IF NOT EXISTS iam_capability (
  codigo      text PRIMARY KEY,                 -- p.ej. 'recepcion.crear'
  dominio     text NOT NULL,                    -- recepcion|lotes|qc|proceso|inventario|repaletizaje|despacho|tarifas|contratos|temporada|reporting|usuarios
  descripcion text NOT NULL,
  critico     boolean NOT NULL DEFAULT false    -- operaciones elevadas (cerrar/reabrir/anular/aprobar/administrar)
);

-- (2) Catalogo de roles (paquetes de capabilities).
CREATE TABLE IF NOT EXISTS iam_rol (
  codigo      text PRIMARY KEY,                 -- PROC_ADMIN, PROC_JEFE_PLANTA, ...
  nombre      text NOT NULL,
  descripcion text NOT NULL DEFAULT ''
);

-- (3) Bridge rol -> capability (N:M).
CREATE TABLE IF NOT EXISTS iam_rol_capability (
  rol        text NOT NULL REFERENCES iam_rol(codigo) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES iam_capability(codigo) ON DELETE CASCADE,
  PRIMARY KEY (rol, capability)
);

-- (4) Asignacion de roles POR USUARIO Y EMPRESA (tenant-aware: un rol en ALS no vale en otra empresa).
CREATE TABLE IF NOT EXISTS iam_usuario_empresa_rol (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES iam_usuario(id),
  empresa_id   uuid NOT NULL REFERENCES contab_empresas(id),
  rol          text NOT NULL REFERENCES iam_rol(codigo),
  activo       boolean NOT NULL DEFAULT true,   -- soft-disable => revocacion next-request (ausencia/inactivo = sin ese rol)
  otorgado_por uuid REFERENCES iam_usuario(id), -- actor que asigno (auditoria)
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, empresa_id, rol)
);
CREATE INDEX IF NOT EXISTS ix_uer_lookup ON iam_usuario_empresa_rol (usuario_id, empresa_id) WHERE activo;

-- Deny-browser: server-only como el resto de iam_* (service_role bypassa; anon/authenticated sin acceso).
DO $g$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iam_capability','iam_rol','iam_rol_capability','iam_usuario_empresa_rol'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    -- sin policy permisiva => deny-by-default; solo service_role (bypass) y las funciones SECURITY DEFINER leen.
  END LOOP;
END $g$;

-- ── SEED capabilities (operaciones reales; critico=true en elevadas) ──
INSERT INTO iam_capability(codigo,dominio,descripcion,critico) VALUES
 ('recepcion.ver','recepcion','Ver recepciones',false),
 ('recepcion.crear','recepcion','Crear recepcion',false),
 ('recepcion.editar','recepcion','Editar recepcion',false),
 ('recepcion.cerrar','recepcion','Cerrar recepcion',true),
 ('recepcion.anular','recepcion','Anular recepcion',true),
 ('lotes.ver','lotes','Ver lotes',false),
 ('lotes.crear','lotes','Crear lote',false),
 ('lotes.editar','lotes','Editar lote',false),
 ('lotes.ajustar','lotes','Ajustar lote',true),
 ('qc.ver','qc','Ver QC',false),
 ('qc.registrar','qc','Registrar QC',false),
 ('qc.hold','qc','Poner hold de calidad',true),
 ('qc.liberar','qc','Liberar hold de calidad',true),
 ('proceso.ver','proceso','Ver proceso/ordenes',false),
 ('proceso.crear','proceso','Crear orden de proceso',false),
 ('proceso.programar','proceso','Programar proceso',false),
 ('proceso.ejecutar','proceso','Iniciar/registrar produccion',false),
 ('proceso.cerrar','proceso','Cerrar proceso',true),
 ('proceso.reabrir','proceso','Reabrir proceso',true),
 ('proceso.anular','proceso','Anular proceso',true),
 ('inventario.ver','inventario','Ver inventario',false),
 ('inventario.mover','inventario','Mover/transferir/ajustar inventario (via movimiento)',false),
 ('repaletizaje.ver','repaletizaje','Ver repaletizaje',false),
 ('repaletizaje.ejecutar','repaletizaje','Ejecutar repaletizaje',false),
 ('despacho.ver','despacho','Ver despachos',false),
 ('despacho.crear','despacho','Crear despacho',false),
 ('despacho.confirmar','despacho','Confirmar despacho',true),
 ('despacho.anular','despacho','Anular despacho',true),
 ('tarifas.ver','tarifas','Ver tarifas',false),
 ('tarifas.editar','tarifas','Editar tarifa',false),
 ('tarifas.aprobar','tarifas','Aprobar/cerrar tarifa (SoD)',true),
 ('contratos.ver','contratos','Ver contratos',false),
 ('contratos.editar','contratos','Editar contrato',false),
 ('contratos.aprobar','contratos','Aprobar/cerrar contrato (SoD)',true),
 ('temporada.ver','temporada','Ver temporadas',false),
 ('temporada.crear','temporada','Crear temporada',false),
 ('temporada.abrir','temporada','Abrir temporada',true),
 ('temporada.cerrar','temporada','Cerrar temporada',true),
 ('temporada.reabrir','temporada','Reabrir temporada (SoD)',true),
 ('reporting.ver','reporting','Ver reportes',false),
 ('reporting.exportar','reporting','Exportar reportes',false),
 ('reporting.enviar','reporting','Enviar reportes',false),
 ('reporting.destinatarios','reporting','Administrar destinatarios',true),
 ('usuarios.administrar','usuarios','Administrar usuarios/roles/capabilities',true)
ON CONFLICT (codigo) DO NOTHING;

-- ── SEED roles ──
INSERT INTO iam_rol(codigo,nombre,descripcion) VALUES
 ('PROC_VIEWER','Solo lectura','Ve todo, no muta'),
 ('PROC_RECEPCION','Recepcion','Recepcion + lotes basicos'),
 ('PROC_CALIDAD','Calidad/QC','QC hold/liberar'),
 ('PROC_PRODUCCION','Produccion','Proceso + inventario mover'),
 ('PROC_BODEGA','Bodega','Inventario + repaletizaje + despacho'),
 ('PROC_DESPACHO','Despacho','Despachos'),
 ('PROC_COMERCIAL','Comercial','Tarifas/contratos editar (no aprobar) + reporting'),
 ('PROC_REPORTING','Reporting','Reportes'),
 ('PROC_JEFE_PLANTA','Jefe de planta','Operacion elevada: cerrar/reabrir/anular/aprobar'),
 ('PROC_ADMIN','Administrador','Todo + administrar usuarios')
ON CONFLICT (codigo) DO NOTHING;

-- ── SEED rol -> capability (matriz). VIEWER = todas las *.ver ──
INSERT INTO iam_rol_capability(rol,capability)
  SELECT 'PROC_VIEWER', codigo FROM iam_capability WHERE codigo LIKE '%.ver'
ON CONFLICT DO NOTHING;
INSERT INTO iam_rol_capability(rol,capability) VALUES
 -- RECEPCION
 ('PROC_RECEPCION','recepcion.ver'),('PROC_RECEPCION','recepcion.crear'),('PROC_RECEPCION','recepcion.editar'),
 ('PROC_RECEPCION','lotes.ver'),('PROC_RECEPCION','lotes.crear'),('PROC_RECEPCION','qc.ver'),('PROC_RECEPCION','proceso.ver'),('PROC_RECEPCION','inventario.ver'),
 -- CALIDAD
 ('PROC_CALIDAD','qc.ver'),('PROC_CALIDAD','qc.registrar'),('PROC_CALIDAD','qc.hold'),('PROC_CALIDAD','qc.liberar'),
 ('PROC_CALIDAD','recepcion.ver'),('PROC_CALIDAD','lotes.ver'),
 -- PRODUCCION
 ('PROC_PRODUCCION','proceso.ver'),('PROC_PRODUCCION','proceso.crear'),('PROC_PRODUCCION','proceso.programar'),('PROC_PRODUCCION','proceso.ejecutar'),
 ('PROC_PRODUCCION','lotes.ver'),('PROC_PRODUCCION','lotes.crear'),('PROC_PRODUCCION','lotes.editar'),('PROC_PRODUCCION','inventario.ver'),('PROC_PRODUCCION','inventario.mover'),('PROC_PRODUCCION','recepcion.ver'),
 -- BODEGA
 ('PROC_BODEGA','inventario.ver'),('PROC_BODEGA','inventario.mover'),('PROC_BODEGA','repaletizaje.ver'),('PROC_BODEGA','repaletizaje.ejecutar'),
 ('PROC_BODEGA','despacho.ver'),('PROC_BODEGA','despacho.crear'),
 -- DESPACHO
 ('PROC_DESPACHO','despacho.ver'),('PROC_DESPACHO','despacho.crear'),('PROC_DESPACHO','despacho.confirmar'),('PROC_DESPACHO','inventario.ver'),
 -- COMERCIAL (editar, NO aprobar = SoD)
 ('PROC_COMERCIAL','tarifas.ver'),('PROC_COMERCIAL','tarifas.editar'),('PROC_COMERCIAL','contratos.ver'),('PROC_COMERCIAL','contratos.editar'),
 ('PROC_COMERCIAL','reporting.ver'),('PROC_COMERCIAL','reporting.exportar'),('PROC_COMERCIAL','reporting.enviar'),
 -- REPORTING
 ('PROC_REPORTING','reporting.ver'),('PROC_REPORTING','reporting.exportar'),('PROC_REPORTING','reporting.enviar'),('PROC_REPORTING','reporting.destinatarios')
ON CONFLICT DO NOTHING;
-- JEFE_PLANTA = todas las criticas operacionales (NO usuarios.administrar) + todas las no-criticas
INSERT INTO iam_rol_capability(rol,capability)
  SELECT 'PROC_JEFE_PLANTA', codigo FROM iam_capability WHERE codigo <> 'usuarios.administrar'
ON CONFLICT DO NOTHING;
-- ADMIN = TODO
INSERT INTO iam_rol_capability(rol,capability)
  SELECT 'PROC_ADMIN', codigo FROM iam_capability
ON CONFLICT DO NOTHING;

-- ── AUDIT de grants: REUTILIZA proc_audit_log via trigger (no tabla nueva) ──
--   Registra INSERT/UPDATE/DELETE sobre iam_usuario_empresa_rol con actor + before/after.
CREATE OR REPLACE FUNCTION iam_fn_audit_uer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_emp uuid; v_ant jsonb; v_nue jsonb;
BEGIN
  v_emp := COALESCE(NEW.empresa_id, OLD.empresa_id);
  v_ant := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_nue := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  INSERT INTO proc_audit_log(empresa_id, tabla, registro_id, accion, valor_ant, valor_nue, motivo, usuario_id)
  VALUES (v_emp, 'iam_usuario_empresa_rol', COALESCE(NEW.id, OLD.id), lower(TG_OP), v_ant, v_nue,
          COALESCE(NEW.motivo, OLD.motivo), proc_current_user());
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_audit_uer ON iam_usuario_empresa_rol;
CREATE TRIGGER trg_audit_uer AFTER INSERT OR UPDATE OR DELETE ON iam_usuario_empresa_rol
  FOR EACH ROW EXECUTE FUNCTION iam_fn_audit_uer();
