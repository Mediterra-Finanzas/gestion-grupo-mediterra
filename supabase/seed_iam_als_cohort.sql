-- ============================================================================
-- seed_iam_als_cohort.sql — Seed IAM cohorte ALS. TRANSACCIONAL · IDEMPOTENTE · FAIL-CLOSED.
--
-- Diseño staging-aware: en staging solo 6 usuarios legados existen en calendario_data y solo 1 de
-- los 6 aprobados (Angelo) está presente. Por eso la identidad se crea de DOS fuentes, ambas sin
-- credenciales:
--   (1) DATA-DRIVEN: iam_usuario para los usuarios ACTIVOS presentes en calendario_data.main.
--   (2) EXPLÍCITA: iam_usuario para los 6 CFO-approved (cubre los ausentes en staging) con identidad
--       PÚBLICA nombre+email — NO PIN/hash/salt/rol/módulos. (membership != role; identidad != login).
-- La membership ALS se crea SOLO para los 6 aprobados por EMAIL normalizado. Ausencia = DENY.
--
-- NO copia calendario_data de Production, NO inventa credenciales, NO modifica el roster legado.
-- Los 5 aprobados ausentes tendrán identidad IAM + membership pero NO podrán autenticarse en staging
-- hasta que exista una credencial válida (fuera de este gate).
--
-- Idempotente (ON CONFLICT DO NOTHING; UUID una sola vez). Fail-closed: PRE valida ALS; POST valida
-- 6 aprobados resolubles + 6 memberships + sin email duplicado, y ABORTA (rollback) si no se cumple.
-- PREREQUISITOS: schema_iam_v1.sql + contab_empresas con ALS (5aa10886-…-cd49).
-- ============================================================================
BEGIN;

-- ── PRE: ALS debe existir EXACTO (uuid + codigo). Si no, abortar todo. ────────
DO $$
BEGIN
  IF (SELECT count(*) FROM contab_empresas
        WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS') <> 1 THEN
    RAISE EXCEPTION 'PRE-CHECK FAIL: ALS (5aa10886-…-cd49 / codigo ALS) no existe exacto en contab_empresas. ABORT.';
  END IF;
END $$;

-- ── (1) Identidad DATA-DRIVEN de usuarios ACTIVOS presentes (sin credenciales) ─
INSERT INTO iam_usuario (nombre, email)
SELECT DISTINCT ON (lower(btrim(x->>'email')))
       btrim(x->>'nombre'), lower(btrim(x->>'email'))
FROM calendario_data cd
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof((cd.value)::jsonb->'usuarios')='array'
       THEN (cd.value)::jsonb->'usuarios' ELSE '[]'::jsonb END) AS x
WHERE cd.id='main'
  AND NOT COALESCE((x->>'desactivado')::boolean,false)
  AND btrim(x->>'email') <> ''
ON CONFLICT (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '' DO NOTHING;

-- ── (2) Identidad EXPLÍCITA de los 6 CFO-approved (nombre+email públicos; sin credencial) ──
INSERT INTO iam_usuario (nombre, email) VALUES
  ('Angelo Huerta',                    'ahuerta@grupomediterra.cl'),
  ('Jose Ignacio Parra Celis',         'iparra@allegriaservice.com'),
  ('Lucas Ramiro Vergara Ortiz',       'lvergara@allegriaservice.com'),
  ('Marcos Alfonso Gaete Perez',       'mgaete@allegriaservice.com'),
  ('Patricio Antonio Moreno Pizarro',  'pmoreno@allegriaservice.com'),
  ('Scarlett Kimberly Bustos Benitez', 'sbustos@allegriaservice.com')
ON CONFLICT (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '' DO NOTHING;

-- ── (3) Membership ALS SOLO para los 6 aprobados por EMAIL normalizado ────────
INSERT INTO iam_usuario_empresa (usuario_id, empresa_id)
SELECT iu.id, '5aa10886-2a76-4a9e-9bc3-303fb776cd49'::uuid
FROM iam_usuario iu
WHERE lower(btrim(iu.email)) IN (
  'ahuerta@grupomediterra.cl',
  'iparra@allegriaservice.com',
  'lvergara@allegriaservice.com',
  'mgaete@allegriaservice.com',
  'pmoreno@allegriaservice.com',
  'sbustos@allegriaservice.com'
)
ON CONFLICT (usuario_id, empresa_id) DO NOTHING;

-- ── POST: fail-closed. Debe quedar EXACTO: 6 aprobados en iam_usuario + 6 memberships + sin dup. ──
DO $$
DECLARE v_appr int; v_mem int; v_dup int;
BEGIN
  SELECT count(*) INTO v_appr FROM iam_usuario WHERE lower(btrim(email)) IN (
    'ahuerta@grupomediterra.cl','iparra@allegriaservice.com','lvergara@allegriaservice.com',
    'mgaete@allegriaservice.com','pmoreno@allegriaservice.com','sbustos@allegriaservice.com');
  SELECT count(*) INTO v_mem FROM iam_usuario_empresa
    WHERE empresa_id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND activo;
  SELECT count(*) INTO v_dup FROM (
    SELECT lower(btrim(email)) e, count(*) c FROM iam_usuario
    WHERE lower(btrim(email)) IN (
      'ahuerta@grupomediterra.cl','iparra@allegriaservice.com','lvergara@allegriaservice.com',
      'mgaete@allegriaservice.com','pmoreno@allegriaservice.com','sbustos@allegriaservice.com')
    GROUP BY 1 HAVING count(*) > 1) z;
  IF v_appr <> 6 THEN RAISE EXCEPTION 'POST FAIL: aprobados resolubles en iam_usuario = % (esperado 6). ABORT.', v_appr; END IF;
  IF v_mem  <> 6 THEN RAISE EXCEPTION 'POST FAIL: memberships ALS activas = % (esperado 6). ABORT.', v_mem; END IF;
  IF v_dup  <> 0 THEN RAISE EXCEPTION 'POST FAIL: email aprobado duplicado/ambiguo. ABORT.'; END IF;
  RAISE NOTICE 'seed_iam_als_cohort OK: 6 aprobados en iam_usuario + 6 memberships ALS. Transacción confirmada.';
END $$;

COMMIT;
