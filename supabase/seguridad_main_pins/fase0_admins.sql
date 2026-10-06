-- =============================================================================
-- FASE 0 — Tabla public.seg_administradores (quién es ADMIN para el servidor)
-- Estado: PROPUESTA. NO aplicada en producción. Probada solo en local
--         (scripts/seguridad-main-pins/prueba-servidor.mjs).
-- Ejecutar: SQL Editor de Supabase (rol postgres), el archivo COMPLETO tal cual.
-- -----------------------------------------------------------------------------
-- REQUIERE ANTES: nada. No cambia ningún permiso de calendario_data; la app
--   actual no la lee. Los endpoints /api/auth/* y /api/datos/* la leen con la
--   llave de servicio en CADA petición (admin-reset-pin, PUT usuarios, config).
-- SI SE APLICA ANTES DE TIEMPO: no rompe nada (tabla nueva, sin acceso anon).
-- SI NO SE APLICA: los endpoints de admin responden 503 (fallo cerrado).
-- VERIFICAR: supabase/seguridad_main_pins/verificacion.sql (fila "seg_administradores").
-- REVERTIR: reversion.sql, sección FASE 0 (comentada a propósito: borra la lista).
-- -----------------------------------------------------------------------------
-- Diseño: ADMIN = fila con activo=true. Nunca se usa el rol de main/usuarios, la
-- cookie ni metadata. RLS activo SIN políticas + sin privilegios para anon/
-- authenticated: solo service_role (SELECT) y el SQL Editor la ven. Se revoca
-- (activo=false con revocado_*), no se borra, para conservar la trazabilidad.
-- Re-ejecutable: si la tabla ya existe con la forma esperada, solo re-aplica
-- los privilegios; si existe con otra forma, ABORTA sin tocar nada.
-- =============================================================================

BEGIN;

DO $fase0$
DECLARE
  v_cols text;
  v_esperadas text := 'activo:boolean,email:text,motivo:text,otorgado_en:timestamp with time zone,otorgado_por:text,revocado_en:timestamp with time zone,revocado_motivo:text,revocado_por:text';
BEGIN
  IF to_regclass('public.seg_administradores') IS NOT NULL THEN
    SELECT string_agg(column_name || ':' || data_type, ',' ORDER BY column_name) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'seg_administradores';
    IF v_cols IS DISTINCT FROM v_esperadas THEN
      RAISE EXCEPTION 'FASE 0 ABORTADA: public.seg_administradores ya existe con otra forma (%). Revisar a mano.', v_cols;
    END IF;
    RAISE NOTICE 'FASE 0: la tabla ya existía con la forma esperada; solo se re-aplican privilegios.';
  ELSE
    CREATE TABLE public.seg_administradores (
      email           text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
      activo          boolean NOT NULL DEFAULT true,
      motivo          text NOT NULL CHECK (btrim(motivo) <> ''),
      otorgado_por    text NOT NULL CHECK (btrim(otorgado_por) <> ''),
      otorgado_en     timestamptz NOT NULL DEFAULT now(),
      revocado_por    text,
      revocado_en     timestamptz,
      revocado_motivo text,
      -- Inactiva solo con revocación registrada (quién, cuándo, por qué).
      CONSTRAINT seg_admin_revocacion CHECK (activo OR (revocado_por IS NOT NULL AND revocado_en IS NOT NULL AND revocado_motivo IS NOT NULL))
    );
    COMMENT ON TABLE public.seg_administradores IS
      'ADMIN de la app para el servidor (api/auth, api/datos). Fila activa = admin. Solo service_role lee; se administra desde el SQL Editor.';
    RAISE NOTICE 'FASE 0: tabla public.seg_administradores creada.';
  END IF;

  EXECUTE 'ALTER TABLE public.seg_administradores ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE public.seg_administradores FROM PUBLIC, anon, authenticated';
  EXECUTE 'REVOKE ALL ON TABLE public.seg_administradores FROM service_role';
  EXECUTE 'GRANT SELECT ON TABLE public.seg_administradores TO service_role';

  -- Verificación posterior (aborta y deshace si algo no quedó como se espera).
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema = 'public' AND table_name = 'seg_administradores'
                AND grantee IN ('anon', 'authenticated', 'PUBLIC')) THEN
    RAISE EXCEPTION 'FASE 0: anon/authenticated/PUBLIC conservan privilegios en seg_administradores.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seg_administradores') THEN
    RAISE EXCEPTION 'FASE 0: seg_administradores tiene políticas (se esperaba ninguna).';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seg_administradores'::regclass) THEN
    RAISE EXCEPTION 'FASE 0: RLS no quedó activo en seg_administradores.';
  END IF;
  RAISE NOTICE 'FASE 0 OK: seg_administradores con RLS, sin políticas, solo SELECT para service_role. Admins activos: %',
    (SELECT count(*) FROM public.seg_administradores WHERE activo);
END
$fase0$;

COMMIT;

-- -----------------------------------------------------------------------------
-- ALTA INICIAL (plantilla; ejecutar a mano en el SQL Editor, con el correo real
-- y en minúsculas, ANTES de aplicar la Fase A):
--
-- INSERT INTO public.seg_administradores (email, motivo, otorgado_por)
-- VALUES ('correo.del.cfo@dominio.cl', 'Administrador inicial (CFO)', 'SQL Editor — <quien ejecuta>');
--
-- REVOCAR (nunca borrar):
-- UPDATE public.seg_administradores
--    SET activo = false, revocado_por = '<quien>', revocado_en = now(), revocado_motivo = '<motivo>'
--  WHERE email = 'correo@dominio.cl';
-- -----------------------------------------------------------------------------
