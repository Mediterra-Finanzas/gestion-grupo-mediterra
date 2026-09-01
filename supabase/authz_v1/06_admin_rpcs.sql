-- ============================================================================
-- authz_v1/06_admin_rpcs.sql — RPCs de lectura para la Admin UI (Usuarios y permisos). DISENO/LOCAL.
-- Todas gated por usuarios.administrar (server-side), SECURITY DEFINER, tenant del contexto.
-- Complementan iam_fn_asignar_rol / iam_fn_revocar_rol (02_engine).
-- ============================================================================

-- Lista los usuarios de la empresa actual con membership, roles y capabilities efectivas.
CREATE OR REPLACE FUNCTION iam_fn_listar_usuarios_roles()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_emp uuid; v_out jsonb;
BEGIN
  IF NOT proc_has_capability('usuarios.administrar') THEN RAISE EXCEPTION 'no_autorizado: usuarios.administrar' USING ERRCODE='42501'; END IF;
  v_emp := proc_current_empresa();
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'nombre'), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'usuario_id', u.id, 'nombre', u.nombre, 'email', u.email,
      'membership_activa', m.activo,
      'roles', (SELECT coalesce(jsonb_agg(r.rol ORDER BY r.rol),'[]'::jsonb)
                FROM iam_usuario_empresa_rol r WHERE r.usuario_id=u.id AND r.empresa_id=v_emp AND r.activo),
      'capabilities', (SELECT coalesce(jsonb_agg(DISTINCT rc.capability),'[]'::jsonb)
                FROM iam_usuario_empresa_rol r JOIN iam_rol_capability rc ON rc.rol=r.rol
                WHERE r.usuario_id=u.id AND r.empresa_id=v_emp AND r.activo)
    ) AS x
    FROM iam_usuario u JOIN iam_usuario_empresa m ON m.usuario_id=u.id AND m.empresa_id=v_emp
  ) s;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION iam_fn_listar_usuarios_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iam_fn_listar_usuarios_roles() TO authenticated, service_role;

-- Catalogo de roles (codigo+nombre) para los selectores de la UI.
CREATE OR REPLACE FUNCTION iam_fn_catalogo_roles()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT proc_has_capability('usuarios.administrar') THEN RAISE EXCEPTION 'no_autorizado: usuarios.administrar' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'nombre',nombre) ORDER BY codigo),'[]'::jsonb) FROM iam_rol);
END $$;
REVOKE ALL ON FUNCTION iam_fn_catalogo_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iam_fn_catalogo_roles() TO authenticated, service_role;

-- Historial auditado de cambios de rol de un usuario (desde proc_audit_log). Solo la empresa actual.
CREATE OR REPLACE FUNCTION iam_fn_historial_roles(p_usuario uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_emp uuid;
BEGIN
  IF NOT proc_has_capability('usuarios.administrar') THEN RAISE EXCEPTION 'no_autorizado: usuarios.administrar' USING ERRCODE='42501'; END IF;
  v_emp := proc_current_empresa();
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'fecha', al.created_at, 'accion', al.accion,
      'rol', coalesce(al.valor_nue->>'rol', al.valor_ant->>'rol'),
      'activo_antes', al.valor_ant->>'activo', 'activo_despues', al.valor_nue->>'activo',
      'actor_id', al.usuario_id,
      'actor_nombre', (SELECT nombre FROM iam_usuario WHERE id=al.usuario_id),
      'motivo', al.motivo
    ) ORDER BY al.created_at DESC), '[]'::jsonb)
    FROM proc_audit_log al
    WHERE al.tabla='iam_usuario_empresa_rol' AND al.empresa_id=v_emp
      AND (al.valor_nue->>'usuario_id'=p_usuario::text OR al.valor_ant->>'usuario_id'=p_usuario::text)
  );
END $$;
REVOKE ALL ON FUNCTION iam_fn_historial_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iam_fn_historial_roles(uuid) TO authenticated, service_role;
