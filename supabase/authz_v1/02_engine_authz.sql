-- ============================================================================
-- authz_v1/02_engine_authz.sql — Motor de autorizacion (server-authoritative). DISENO/LOCAL.
-- Reutiliza resolvers Option C (proc_current_iam_user / proc_current_empresa). Fail-closed.
-- Revocacion next-request (STABLE, se re-evalua por statement; el header/claims se fijan por request).
-- ============================================================================

-- (1) AUTORIDAD: ¿el actor actual (en su empresa actual) tiene la capability p_cap?
--     SECURITY DEFINER (lee iam_* deny-browser como owner). NULL identidad/empresa => false.
CREATE OR REPLACE FUNCTION proc_has_capability(p_cap text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam_usuario_empresa_rol uer
    JOIN iam_rol_capability rc ON rc.rol = uer.rol
    WHERE uer.usuario_id = proc_current_iam_user()
      AND uer.empresa_id = proc_current_empresa()
      AND uer.activo
      AND rc.capability = p_cap
      AND proc_current_iam_user() IS NOT NULL
      AND proc_current_empresa() IS NOT NULL
  )
$$;
REVOKE ALL ON FUNCTION proc_has_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION proc_has_capability(text) TO authenticated, service_role;  -- lo usan RLS/RPC del caller

-- (2) Capabilities efectivas del actor actual (para hidratar la UI; la UI NO decide, solo refleja).
CREATE OR REPLACE FUNCTION proc_effective_caps() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT rc.capability
  FROM iam_usuario_empresa_rol uer
  JOIN iam_rol_capability rc ON rc.rol = uer.rol
  WHERE uer.usuario_id = proc_current_iam_user()
    AND uer.empresa_id = proc_current_empresa()
    AND uer.activo
$$;
REVOKE ALL ON FUNCTION proc_effective_caps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION proc_effective_caps() TO authenticated, service_role;

-- (3) Guard reutilizable para RPCs de mutacion: lanza 42501 si falta la capability.
CREATE OR REPLACE FUNCTION proc_require_capability(p_cap text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT proc_has_capability(p_cap) THEN
    RAISE EXCEPTION 'no_autorizado: falta capability %', p_cap USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION proc_require_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION proc_require_capability(text) TO authenticated, service_role;

-- ── ADMIN RPCs (asignar/revocar rol). SECURITY DEFINER; self-check usuarios.administrar; same-tenant. ──
-- Anti-escalacion: solo quien tiene usuarios.administrar EN esa empresa puede; no cross-tenant.
CREATE OR REPLACE FUNCTION iam_fn_asignar_rol(p_usuario uuid, p_empresa uuid, p_rol text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := proc_current_iam_user();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'no_autenticado' USING ERRCODE='42501'; END IF;
  -- solo sobre la empresa del contexto actual (no cross-tenant) y con capability de admin.
  IF p_empresa IS DISTINCT FROM proc_current_empresa() THEN
    RAISE EXCEPTION 'cross_tenant_denegado' USING ERRCODE='42501'; END IF;
  IF NOT proc_has_capability('usuarios.administrar') THEN
    RAISE EXCEPTION 'no_autorizado: usuarios.administrar' USING ERRCODE='42501'; END IF;
  -- el target debe ser miembro activo de esa empresa (no se crea membership aqui).
  IF NOT EXISTS (SELECT 1 FROM iam_usuario_empresa WHERE usuario_id=p_usuario AND empresa_id=p_empresa AND activo) THEN
    RAISE EXCEPTION 'target_sin_membership' USING ERRCODE='42501'; END IF;
  INSERT INTO iam_usuario_empresa_rol(usuario_id, empresa_id, rol, activo, otorgado_por, motivo)
  VALUES (p_usuario, p_empresa, p_rol, true, v_actor, p_motivo)
  ON CONFLICT (usuario_id, empresa_id, rol) DO UPDATE SET activo=true, otorgado_por=v_actor, motivo=p_motivo, updated_at=now();
END $$;
REVOKE ALL ON FUNCTION iam_fn_asignar_rol(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iam_fn_asignar_rol(uuid,uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION iam_fn_revocar_rol(p_usuario uuid, p_empresa uuid, p_rol text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor := proc_current_iam_user();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'no_autenticado' USING ERRCODE='42501'; END IF;
  IF p_empresa IS DISTINCT FROM proc_current_empresa() THEN
    RAISE EXCEPTION 'cross_tenant_denegado' USING ERRCODE='42501'; END IF;
  IF NOT proc_has_capability('usuarios.administrar') THEN
    RAISE EXCEPTION 'no_autorizado: usuarios.administrar' USING ERRCODE='42501'; END IF;
  UPDATE iam_usuario_empresa_rol SET activo=false, otorgado_por=v_actor, motivo=p_motivo, updated_at=now()
   WHERE usuario_id=p_usuario AND empresa_id=p_empresa AND rol=p_rol;  -- soft => revocacion next-request
END $$;
REVOKE ALL ON FUNCTION iam_fn_revocar_rol(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iam_fn_revocar_rol(uuid,uuid,text,text) TO authenticated, service_role;

-- Nota de wiring (B3.4, retrofit por dominio — ejemplos en 03_enforcement_examples.sql):
--   * RPCs de estado (proceso/despacho/temporada): agregar al inicio
--       PERFORM proc_require_capability('proceso.cerrar');  -- etc.
--   * Policies RLS de escritura por tabla:
--       CREATE POLICY pol_<t>_ins ON <t> FOR INSERT TO authenticated
--         WITH CHECK (empresa_id = proc_current_empresa() AND proc_has_capability('<dominio>.crear'));
--     (capability AND tenant; NUNCA OR).
