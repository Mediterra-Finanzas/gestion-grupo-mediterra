-- ============================================================================
-- proc_rls_resolution_v2.sql — Option C: resolución de identidad/tenant PROC
-- SIN Custom Access Token Hook. DISEÑO/LOCAL — NO aplicar en remoto sin autorización.
--
-- Contrato:
--   AUTHENTICATION = Supabase Auth (JWT: sub = auth.users.id)  [no se sobrescribe sub]
--   IDENTITY       = iam_usuario  (binding estable auth.users.id ↔ iam_usuario.auth_user_id)
--   AUTHORIZATION  = iam_usuario_empresa (única fuente; ausencia = DENY)
--   TENANT CONTEXT = request-scoped (header X-Proc-Empresa) o auto (single membership).
--                    NUNCA un mutable global (app_metadata.active_empresa) → evita carrera multi-tab.
--   REVOCACIÓN     = RLS re-valida membership por request → efecto inmediato (ventana = 1 request).
--
-- Todas las funciones de resolución son SECURITY DEFINER (leen iam_*, que es deny-browser) con
-- search_path fijo. Solo exponen el uuid resuelto; NO exponen filas de iam_*.
-- ============================================================================

-- (1) Binding estable auth.users ↔ iam_usuario (aditivo, 1:1, nullable, reversible).
--     No toca identidades ajenas (Osiris): solo se setea para usuarios PROC provisionados.
ALTER TABLE iam_usuario ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ux_iam_usuario_auth_user_id
  ON iam_usuario (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- (2) sub del JWT = auth.users.id (traza de autenticación; NO es el actor de negocio).
CREATE OR REPLACE FUNCTION proc_current_auth_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;

-- (3) actor IAM autoritativo: mapea sub → iam_usuario ACTIVO por binding. Inactivo/no-binding → NULL.
CREATE OR REPLACE FUNCTION proc_current_iam_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT iu.id FROM iam_usuario iu
  WHERE iu.activo
    AND iu.auth_user_id = NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;

-- (4) auditoría: actor = iam_usuario.id (NO el sub/auth.users.id).
CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT proc_current_iam_user()
$$;

-- (5) tenant efectivo. C1: autorización SIEMPRE desde iam_usuario_empresa. C2: request-scoped.
--   - selección explícita (header X-Proc-Empresa): se re-valida como membership ACTIVA del actor;
--   - sin selección: auto SOLO si el actor tiene exactamente 1 membership activa;
--   - 0 memberships, N sin selección, o selección no autorizada → NULL (DENY).
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_iam uuid;
  v_req uuid;
  v_cnt int;
  v_one uuid;
BEGIN
  v_iam := proc_current_iam_user();
  IF v_iam IS NULL THEN RETURN NULL; END IF;   -- sin identidad IAM activa → DENY

  -- contexto request-scoped (no mutable global): header de la request actual.
  v_req := NULLIF( (current_setting('request.headers', true)::jsonb ->> 'x-proc-empresa'), '' )::uuid;

  IF v_req IS NOT NULL THEN
    PERFORM 1 FROM iam_usuario_empresa m
      WHERE m.usuario_id = v_iam AND m.empresa_id = v_req AND m.activo;
    IF FOUND THEN RETURN v_req; ELSE RETURN NULL; END IF;   -- no autorizada/revocada → DENY inmediato
  END IF;

  SELECT count(*) INTO v_cnt
    FROM iam_usuario_empresa WHERE usuario_id = v_iam AND activo;
  IF v_cnt = 1 THEN                          -- single membership → auto
    SELECT empresa_id INTO v_one
      FROM iam_usuario_empresa WHERE usuario_id = v_iam AND activo LIMIT 1;
    RETURN v_one;
  END IF;
  RETURN NULL;                              -- 0 → DENY ; N sin selección → DENY (debe seleccionar)
END $$;

-- Nota: las funciones son STABLE (una evaluación por statement). El header/claims se fijan por
-- request (PostgREST: request.headers / request.jwt.claims), así que dos requests/tabs concurrentes
-- con distinto X-Proc-Empresa resuelven distinto SIN compartir estado. No hay valor mutable global.
