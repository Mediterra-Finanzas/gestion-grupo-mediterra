-- ============================================================================
-- seed_iam_als_cohort.sql — Seed IAM idempotente. Cohorte inicial ALS (decisión CFO).
--
-- DATA-DRIVEN desde calendario_data (id='main') → NO hardcodea emails ni PINs. Idempotente:
-- reejecutar NO duplica usuarios ni memberships, y NO regenera UUIDs (ON CONFLICT DO NOTHING).
--
-- (1) iam_usuario para la COHORTE = usuarios ACTIVOS con email del grupo
--     (@allegriaservice.com / @grupomediterra.cl). UUID asignado UNA vez (gen_random_uuid).
-- (2) iam_usuario_empresa (ALS) SOLO para los 6 APROBADOS por el CFO (whitelist de nombre
--     normalizado). Ausencia de membership = DENY (no es baja de usuario).
--
-- membership != role: NO se copian rol/módulos/permisos (eso es RBAC futuro).
-- PREREQUISITOS: schema_iam_v1.sql + contab_empresas con ALS (5aa10886-…-cd49).
-- ============================================================================

-- (1) iam_usuario para la cohorte (idempotente por email normalizado). No toca PIN.
INSERT INTO iam_usuario (nombre, email)
SELECT DISTINCT ON (lower(btrim(u->>'email')))
       btrim(u->>'nombre'), lower(btrim(u->>'email'))
FROM calendario_data cd
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof((cd.value)::jsonb->'usuarios')='array'
       THEN (cd.value)::jsonb->'usuarios' ELSE '[]'::jsonb END) AS u
WHERE cd.id='main'
  AND NOT COALESCE((u->>'desactivado')::boolean,false)
  AND lower(btrim(u->>'email')) ~ '@(allegriaservice\.com|grupomediterra\.cl)$'
ON CONFLICT (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '' DO NOTHING;

-- (2) membership ALS SOLO para los 6 aprobados (whitelist de nombre normalizado — lista del CFO).
--     Empresa autoritativa: ALS = 5aa10886-2a76-4a9e-9bc3-303fb776cd49.
INSERT INTO iam_usuario_empresa (usuario_id, empresa_id)
SELECT iu.id, '5aa10886-2a76-4a9e-9bc3-303fb776cd49'::uuid
FROM iam_usuario iu
WHERE lower(regexp_replace(btrim(iu.nombre), '\s+', ' ', 'g')) IN (
  'angelo huerta',
  'jose ignacio parra celis',
  'lucas ramiro vergara ortiz',
  'marcos alfonso gaete perez',
  'patricio antonio moreno pizarro',
  'scarlett kimberly bustos benitez'
)
ON CONFLICT (usuario_id, empresa_id) DO NOTHING;

-- (3) Red de seguridad: si no quedaron exactamente 6 memberships ALS activas, avisar
--     (un nombre aprobado que no resolvió → esa persona queda en DENY; NO se inventa membership).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM iam_usuario_empresa
    WHERE empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND activo;
  IF n <> 6 THEN
    RAISE WARNING 'seed_iam_als_cohort: memberships ALS activas = % (esperado 6). Revisar coincidencia de nombres aprobados vs calendario_data.', n;
  ELSE
    RAISE NOTICE 'seed_iam_als_cohort OK: 6 memberships ALS activas (cohorte aprobada).';
  END IF;
END $$;
