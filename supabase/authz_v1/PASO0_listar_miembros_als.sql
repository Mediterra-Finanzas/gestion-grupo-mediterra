-- ============================================================================
-- PASO0_listar_miembros_als.sql — AUTHZ PASO 0 (READ-ONLY, NO muta nada).
-- Lista los miembros actuales de Allegria Service (ALS) en STAGING para armar la matriz
-- persona->rol (decisión CFO). NO despliega AUTHZ, NO siembra, NO cambia grants/RLS.
-- Ejecutar en Supabase SQL Editor de gestion-mediterra-staging. Solo SELECT.
-- Correr SOLO después de cerrar CONC70 (regla de orden del CFO: 1 carril remoto a la vez).
-- ============================================================================

-- (A) Miembros ALS: identidad + membership + auth binding + inconsistencias
SELECT
  u.id                                   AS usuario_id,
  u.nombre,
  u.email,
  u.activo                               AS usuario_activo,
  m.activo                               AS membership_activa,
  (u.auth_user_id IS NOT NULL)           AS auth_binding,       -- puede loguear (Option C)
  -- clasificación observable (NO es rol; el rol lo decide el CFO):
  CASE
    WHEN u.email IS NULL OR btrim(u.email)='' THEN 'SIN EMAIL'
    WHEN u.auth_user_id IS NULL             THEN 'SIN AUTH BINDING (no puede loguear)'
    WHEN NOT u.activo AND m.activo          THEN 'INCONSISTENTE: membership activa + usuario inactivo'
    WHEN NOT m.activo                       THEN 'membership inactiva'
    ELSE 'ok'
  END                                    AS observaciones,
  '[REQUIERE CONFIRMACION CFO]'          AS rol_propuesto
FROM iam_usuario u
JOIN iam_usuario_empresa m ON m.usuario_id = u.id
WHERE m.empresa_id = (SELECT id FROM contab_empresas WHERE codigo='ALS')
ORDER BY (m.activo) DESC, u.nombre;

-- (B) Resumen/diagnóstico (una fila) — para blockers de arranque AUTHZ
SELECT
  (SELECT count(*) FROM iam_usuario_empresa m
     WHERE m.empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS'))              AS memberships_totales,
  (SELECT count(*) FROM iam_usuario_empresa m
     WHERE m.empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS') AND m.activo) AS memberships_activas,
  (SELECT count(*) FROM iam_usuario u JOIN iam_usuario_empresa m ON m.usuario_id=u.id
     WHERE m.empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS')
       AND m.activo AND u.auth_user_id IS NULL)                                           AS activos_sin_auth_binding,
  (SELECT count(*) FROM iam_usuario u JOIN iam_usuario_empresa m ON m.usuario_id=u.id
     WHERE m.empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS')
       AND m.activo AND NOT u.activo)                                                     AS inconsistentes_memb_activa_usuario_inactivo,
  (SELECT count(*) FROM iam_usuario u JOIN iam_usuario_empresa m ON m.usuario_id=u.id
     WHERE m.empresa_id=(SELECT id FROM contab_empresas WHERE codigo='ALS')
       AND m.activo AND (u.email IS NULL OR btrim(u.email)=''))                           AS activos_sin_email;
