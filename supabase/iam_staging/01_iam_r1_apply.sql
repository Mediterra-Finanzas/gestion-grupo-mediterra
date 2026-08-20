-- ============================================================================
-- 01_iam_r1_apply.sql — IAM-R1: materializa el schema IAM. Micro-gate 2 de 5.
-- PROC-IDENTITY-PROD-001 · TARGET: gestion-mediterra-staging (nlvfjpwiecgrosjnwwik).
--
-- BLINDAJE ANTI-INCIDENTE: todo corre dentro de UNA transacción (BEGIN…COMMIT) y
-- arranca con un PREFLIGHT EMBEBIDO fail-closed. Si el target no es inequívocamente
-- el staging esperado en estado PRE-IAM, el bloque hace RAISE → la transacción entera
-- ROLLBACK → NO se crea ninguna tabla. Correr esto en Producción NO materializa nada.
--
-- Contenido idéntico a supabase/schema_iam_v1.sql (schema autoritativo), envuelto en
-- la transacción con guardia. Antes de Run: verificá que la URL contiene nlvfjpwiecgrosjnwwik.
-- ============================================================================

BEGIN;

-- ── PREFLIGHT EMBEBIDO (fail-closed). Mismo fingerprint estructural del micro-gate 1. ──
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
             OR to_regclass('public.iam_usuario_empresa') IS NOT NULL;

  IF v_anchors <> v_anchtot THEN
    RAISE EXCEPTION 'IAM-R1 ABORT (ROLLBACK): baseline proc_* incompleto (% de %). Target NO es staging. HARD STOP.', v_anchors, v_anchtot;
  END IF;
  IF v_proc_tot < 30 THEN
    RAISE EXCEPTION 'IAM-R1 ABORT (ROLLBACK): solo % tablas proc_* (esperado >=30). HARD STOP.', v_proc_tot;
  END IF;
  IF v_bgrant < 1 THEN
    RAISE EXCEPTION 'IAM-R1 ABORT (ROLLBACK): bridge DEV_ONLY ausente (anon_grants proc_*=%). Producción no lo tiene. HARD STOP.', v_bgrant;
  END IF;
  IF v_als <> 1 THEN
    RAISE EXCEPTION 'IAM-R1 ABORT (ROLLBACK): ALS no exacto (count=%). HARD STOP.', v_als;
  END IF;
  IF v_main <> 1 THEN
    RAISE EXCEPTION 'IAM-R1 ABORT (ROLLBACK): calendario_data.main ausente (count=%). HARD STOP.', v_main;
  END IF;
  IF v_iam THEN
    RAISE EXCEPTION 'IAM-R1 ABORT (ROLLBACK): iam_* YA existen. No estamos en PRE-IAM. HARD STOP y revisar.';
  END IF;

  RAISE NOTICE 'IAM-R1 preflight OK: staging PRE-IAM confirmado (ALS=1, anchors=%/%, proc_*=%, anon_grants=%, main=1). Materializando IAM…',
               v_anchors, v_anchtot, v_proc_tot, v_bgrant;
END
$preflight$;

-- ── touch propio del contexto IAM (no cross-depende de proc_fn_touch) ─────────
CREATE OR REPLACE FUNCTION iam_fn_touch() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END $fn$;

-- ── iam_usuario — identidad estable (fuente de verdad del user_id) ────────────
CREATE TABLE IF NOT EXISTS iam_usuario (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  email       text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_iam_usuario_email_norm
  ON iam_usuario (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE INDEX IF NOT EXISTS ix_iam_usuario_activo ON iam_usuario (activo) WHERE activo;

DROP TRIGGER IF EXISTS trg_touch_iam_usuario ON iam_usuario;
CREATE TRIGGER trg_touch_iam_usuario BEFORE UPDATE ON iam_usuario
  FOR EACH ROW EXECUTE FUNCTION iam_fn_touch();

-- ── iam_usuario_empresa — membresía autoritativa ─────────────────────────────
CREATE TABLE IF NOT EXISTS iam_usuario_empresa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES iam_usuario(id),
  empresa_id  uuid NOT NULL REFERENCES contab_empresas(id),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_iam_usuario_empresa UNIQUE (usuario_id, empresa_id)
);
CREATE INDEX IF NOT EXISTS ix_iam_ue_usuario ON iam_usuario_empresa (usuario_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_iam_ue_empresa ON iam_usuario_empresa (empresa_id) WHERE activo;

DROP TRIGGER IF EXISTS trg_touch_iam_usuario_empresa ON iam_usuario_empresa;
CREATE TRIGGER trg_touch_iam_usuario_empresa BEFORE UPDATE ON iam_usuario_empresa
  FOR EACH ROW EXECUTE FUNCTION iam_fn_touch();

-- ── RLS: iam_* es server-only (deny browser). service_role (server) bypassa RLS. ──
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['iam_usuario','iam_usuario_empresa'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON %I FROM authenticated;', t);
  END LOOP;
  RAISE NOTICE 'IAM-R1 OK: iam_usuario + iam_usuario_empresa creadas, RLS ENABLE+FORCE, deny-browser. Commit.';
END
$rls$;

COMMIT;
