-- ============================================================================
-- 20_validate_r2.sql — Validación POST IAM-R2 (seed_iam_als_cohort.sql). READ-ONLY.
-- Correr DESPUÉS de aplicar supabase/seed_iam_als_cohort.sql en staging.
-- ============================================================================

-- Q1 — invariantes (una fila)
SELECT
  (SELECT count(*) FROM iam_usuario)                                             AS iam_users,
  (SELECT count(*) FROM iam_usuario_empresa
     WHERE activo AND empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49')         AS als_memberships,     -- esperado 6
  (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
     WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo)      AS carol_membership,    -- esperado 0
  (SELECT count(*) FROM (SELECT lower(btrim(email)) e FROM iam_usuario
       WHERE email IS NOT NULL AND btrim(email)<>'' GROUP BY 1 HAVING count(*)>1) z) AS dup_emails,      -- 0
  (SELECT count(*) FROM iam_usuario_empresa m
     WHERE NOT EXISTS(SELECT 1 FROM iam_usuario u WHERE u.id=m.usuario_id))      AS orphan_users,        -- 0
  (SELECT count(*) FROM iam_usuario_empresa m
     WHERE NOT EXISTS(SELECT 1 FROM contab_empresas e WHERE e.id=m.empresa_id))  AS orphan_companies,    -- 0
  (SELECT count(*) FROM (SELECT usuario_id,empresa_id FROM iam_usuario_empresa
       GROUP BY 1,2 HAVING count(*)>1) z)                                        AS dup_memberships,     -- 0
  (SELECT count(*) FROM iam_usuario_empresa
     WHERE activo AND empresa_id<>'5aa10886-2a76-4a9e-9bc3-303fb776cd49')        AS memberships_no_als,  -- 0
  -- neighbors intactos
  (SELECT count(*) FROM calendario_data)                                         AS calendario_filas,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'proc_%' AND 'anon' = ANY(roles)) AS proc_bridge_anon_intacto;

-- Q2 — detalle de las 6 memberships (deben ser exactamente los 6 emails aprobados, todos a ALS)
SELECT lower(btrim(u.email)) AS email, u.id AS iam_usuario_id, m.empresa_id, m.activo
FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
WHERE m.activo AND m.empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49'
ORDER BY email;

-- Q3 — deny-browser en vivo: authenticated NO puede leer iam_usuario (esperado: permission denied)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT count(*) AS authenticated_ve_iam_usuario FROM iam_usuario;  -- DEBE dar: permission denied
ROLLBACK;
