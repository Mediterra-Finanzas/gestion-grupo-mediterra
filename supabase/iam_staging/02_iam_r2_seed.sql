-- ============================================================================
-- 02_iam_r2_seed.sql — IAM-R2: seed cohorte ALS. Micro-gate 4 de 5.
-- TARGET: gestion-mediterra-staging (nlvfjpwiecgrosjnwwik). TRANSACCIONAL · IDEMPOTENTE · FAIL-CLOSED.
--
-- = seed_iam_als_cohort.sql + PREFLIGHT ESTRUCTURAL embebido (post-R1). El PRE ahora exige,
-- además de ALS exacto: baseline proc_* + bridge DEV_ONLY (staging) y que iam_* YA EXISTA (R1 corrido).
-- Producción no tiene proc_* ni iam_* → aborta (ROLLBACK) sin sembrar nada.
--
-- Diseño staging-aware: identidad de DOS fuentes (data-driven de calendario_data.main + explícita de
-- los 6 CFO-approved), SIN credenciales. Membership ALS SOLO para los 6 aprobados por email normalizado.
-- Ausencia de membership = DENY. NO copia credenciales, NO infiere por rol/dominio/empresas_permitidas.
-- POST fail-closed: exactamente 6 aprobados resolubles + 6 memberships ALS + sin email duplicado.
-- Antes de Run: verificá que la URL contiene nlvfjpwiecgrosjnwwik.
-- ============================================================================
BEGIN;

-- ── PRE (fail-closed): target = staging + estado POST-R1. Si no cuadra, abortar todo. ──
DO $preflight$
DECLARE
  v_als int; v_anchors int; v_anchtot int; v_proc_tot int; v_bgrant int; v_main int; v_iam boolean;
BEGIN
  v_als := (SELECT count(*) FROM contab_empresas
              WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS');
  SELECT count(*) FILTER (WHERE to_regclass('public.'||t) IS NOT NULL), count(*)
    INTO v_anchors, v_anchtot
  FROM (VALUES ('proc_recepcion'),('proc_lote'),('proc_movimiento'),('proc_audit_log'),
               ('proc_planta'),('proc_temporada'),('proc_empresa_config'),
               ('proc_pallet'),('proc_despacho'),('proc_correlativo'),
               ('proc_especie'),('proc_cliente_contrato')) AS a(t);
  v_proc_tot := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant   := (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_main     := (SELECT count(*) FROM calendario_data WHERE id='main');
  v_iam      := to_regclass('public.iam_usuario') IS NOT NULL
            AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;

  IF v_als <> 1 THEN
    RAISE EXCEPTION 'IAM-R2 ABORT (ROLLBACK): ALS no exacto (count=%). HARD STOP.', v_als;
  END IF;
  IF v_anchors <> v_anchtot THEN
    RAISE EXCEPTION 'IAM-R2 ABORT (ROLLBACK): baseline proc_* incompleto (% de %). Target NO es staging. HARD STOP.', v_anchors, v_anchtot;
  END IF;
  IF v_proc_tot < 30 THEN
    RAISE EXCEPTION 'IAM-R2 ABORT (ROLLBACK): solo % tablas proc_* (esperado >=30). HARD STOP.', v_proc_tot;
  END IF;
  IF v_bgrant < 1 THEN
    RAISE EXCEPTION 'IAM-R2 ABORT (ROLLBACK): bridge DEV_ONLY ausente (anon_grants proc_*=%). Produccion no lo tiene. HARD STOP.', v_bgrant;
  END IF;
  IF v_main <> 1 THEN
    RAISE EXCEPTION 'IAM-R2 ABORT (ROLLBACK): calendario_data.main ausente (count=%). HARD STOP.', v_main;
  END IF;
  IF NOT v_iam THEN
    RAISE EXCEPTION 'IAM-R2 ABORT (ROLLBACK): iam_* NO existe. Corré IAM-R1 primero. HARD STOP.';
  END IF;

  RAISE NOTICE 'IAM-R2 preflight OK: staging POST-R1 confirmado (ALS=1, anchors=%/%, proc_*=%, anon_grants=%, main=1, iam_* presente). Sembrando cohorte…',
               v_anchors, v_anchtot, v_proc_tot, v_bgrant;
END
$preflight$;

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
DO $post$
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
  RAISE NOTICE 'IAM-R2 OK: 6 aprobados en iam_usuario + 6 memberships ALS. Transacción confirmada.';
END
$post$;

COMMIT;
