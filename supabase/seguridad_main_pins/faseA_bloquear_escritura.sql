-- =============================================================================
-- FASE A — anon/authenticated ya NO pueden ESCRIBIR 'pins' ni 'usuarios' (ni borrar 'main')
-- Estado: PROPUESTA. NO aplicada en producción. Probada solo en local
--         (scripts/seguridad-main-pins/prueba-servidor.mjs). Ejecutar el archivo COMPLETO tal cual.
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA (sobre las políticas actuales cd_anon_auth_*):
--   INSERT/UPDATE: además excluyen id 'pins' y 'usuarios'.
--   DELETE: además excluye 'pins', 'usuarios' y 'main'.
--   REVOKE TRUNCATE, REFERENCES, TRIGGER de anon y authenticated (TRUNCATE salta RLS).
--   La LECTURA no cambia (sigue abierta: eso es la Fase B).
-- APLICAR A Y B EN LA MISMA VENTANA: con A sola, la llave pública sigue LEYENDO pins, y un
--   código pedido por "¿Olvidaste tu PIN?" para cualquier cuenta (también la del admin) es
--   atacable fuera de línea desde su hash. A sola no cierra la toma de cuentas.
-- REQUIERE ANTES:
--   1. fase0_admins.sql aplicada y al menos 1 admin ACTIVO (el archivo lo exige).
--   2. Variables de Vercel configuradas (ver docs/seguridad-main-pins-servidor.md) y
--      api/auth/[op].js + api/datos/[fila].js desplegados y probados (login, cambiar-pin,
--      recuperar, admin-reset-pin, PUT /api/datos/usuarios).
--   3. Cliente con REACT_APP_AUTH_SERVER=true desplegado y las pestañas abiertas recargadas
--      (el cliente con el flag apagado escribe 'pins'/'usuarios' con la llave pública).
--   4. RPC frisku_sp_rl_consumir (api/sql/frisku_sp_ratelimit.sql) aplicada: el login la usa.
-- SI SE APLICA ANTES DE TIEMPO: con el cliente antiguo, cambiar PIN, "¿Olvidaste tu PIN?",
--   reseteo por admin y la edición de permisos/usuarios FALLAN (la escritura es rechazada).
--   El login antiguo sigue funcionando (solo lee). "📤 Restaurar" ya no puede reponer
--   'pins'/'usuarios' con la llave pública (informa RESTAURACIÓN PARCIAL).
-- VERIFICAR: verificacion.sql → estado detectado "A" y las comprobaciones de anon.
-- REVERTIR: reversion.sql (sección FASE A; re-ejecutable, deja la foto de hoy).
-- Guardas: aborta sin tocar nada si la foto actual no es EXACTAMENTE la de hoy; si ya
-- estaba aplicada, no hace nada.
-- =============================================================================

BEGIN;

DO $fase_a$
DECLARE
  b   text := $e$(id !~~ 'backup%'::text) AND (id !~~ 'main_pre_restore%'::text)$e$;
  pu  text := $e$(id <> ALL (ARRAY['pins'::text, 'usuarios'::text]))$e$;
  pum text := $e$(id <> ALL (ARRAY['pins'::text, 'usuarios'::text, 'main'::text]))$e$;
  e_base text; e_pu text; e_pum text;
  f_hoy text; f_a text; f_b text; f_c text;
  v_actual text; v_extra int; v_basicos int; v_rls boolean; v_estado text;
  v_admins int;
BEGIN
  e_base := '(' || b || ')';
  e_pu   := '(' || b || ' AND ' || pu || ')';
  e_pum  := '(' || b || ' AND ' || pum || ')';
  -- Foto = las 5 políticas de calendario_data (nombre|comando|roles|tipo|USING|WITH CHECK).
  f_hoy := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_base, e_base, e_base, e_base, e_base);
  f_a   := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pu, e_base, e_pu, e_pu);
  f_b   := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pu, e_pu, e_pu, e_pu);
  f_c   := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pum, e_pum, e_pum, e_pum);
  SELECT string_agg(format('%s|%s|%s|%s|%s|%s', policyname, cmd,
           (SELECT string_agg(rol, ',' ORDER BY rol) FROM unnest(roles) rol), permissive,
           coalesce(qual, ''), coalesce(with_check, '')), ';' ORDER BY policyname)
    INTO v_actual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendario_data';
  SELECT count(*) FILTER (WHERE privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
         count(*) FILTER (WHERE privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    INTO v_extra, v_basicos
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'calendario_data' AND grantee IN ('anon', 'authenticated');
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.calendario_data'::regclass;
  v_actual := regexp_replace(coalesce(v_actual, ''), '\s+', '', 'g');
  v_estado := CASE
    WHEN NOT v_rls OR v_basicos <> 8 THEN 'DESCONOCIDO'
    WHEN v_actual = regexp_replace(f_hoy, '\s+', '', 'g') AND v_extra = 6 THEN 'HOY'
    WHEN v_actual = regexp_replace(f_a,   '\s+', '', 'g') AND v_extra = 0 THEN 'A'
    WHEN v_actual = regexp_replace(f_b,   '\s+', '', 'g') AND v_extra = 0 THEN 'B'
    WHEN v_actual = regexp_replace(f_c,   '\s+', '', 'g') AND v_extra = 0 THEN 'C'
    ELSE 'DESCONOCIDO' END;
  RAISE NOTICE 'FASE A: estado detectado = %', v_estado;
  IF v_estado = 'A' OR v_estado = 'B' OR v_estado = 'C' THEN
    RAISE NOTICE 'FASE A: no corresponde (estado %); no se cambia nada.', v_estado;
    RETURN;
  END IF;
  IF v_estado <> 'HOY' THEN
    RAISE EXCEPTION 'FASE A ABORTADA: se esperaba el estado HOY y la foto actual es % (políticas: %, privilegios extra anon/authenticated: %). No se cambió nada.', v_estado, v_actual, v_extra;
  END IF;
  IF to_regclass('public.seg_administradores') IS NULL THEN
    RAISE EXCEPTION 'FASE A ABORTADA: falta public.seg_administradores (aplicar fase0_admins.sql). No se cambió nada.';
  END IF;
  EXECUTE 'SELECT count(*) FROM public.seg_administradores WHERE activo' INTO v_admins;
  IF v_admins < 1 THEN
    RAISE EXCEPTION 'FASE A ABORTADA: no hay ningún administrador activo en seg_administradores (sin admin nadie podría resetear PIN). No se cambió nada.';
  END IF;
  EXECUTE 'ALTER POLICY cd_anon_auth_insert ON public.calendario_data WITH CHECK ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text])))';
  EXECUTE 'ALTER POLICY cd_anon_auth_update ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text]))) WITH CHECK ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text])))';
  EXECUTE 'ALTER POLICY cd_anon_auth_delete ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text, ''main''::text])))';
  EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calendario_data FROM anon, authenticated';
  -- Verificación posterior: la foto debe ser exactamente la del estado A.
  e_base := '(' || b || ')';
  e_pu   := '(' || b || ' AND ' || pu || ')';
  e_pum  := '(' || b || ' AND ' || pum || ')';
  -- Foto = las 5 políticas de calendario_data (nombre|comando|roles|tipo|USING|WITH CHECK).
  f_hoy := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_base, e_base, e_base, e_base, e_base);
  f_a   := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pu, e_base, e_pu, e_pu);
  f_b   := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pu, e_pu, e_pu, e_pu);
  f_c   := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pum, e_pum, e_pum, e_pum);
  SELECT string_agg(format('%s|%s|%s|%s|%s|%s', policyname, cmd,
           (SELECT string_agg(rol, ',' ORDER BY rol) FROM unnest(roles) rol), permissive,
           coalesce(qual, ''), coalesce(with_check, '')), ';' ORDER BY policyname)
    INTO v_actual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendario_data';
  SELECT count(*) FILTER (WHERE privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
         count(*) FILTER (WHERE privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
    INTO v_extra, v_basicos
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'calendario_data' AND grantee IN ('anon', 'authenticated');
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.calendario_data'::regclass;
  v_actual := regexp_replace(coalesce(v_actual, ''), '\s+', '', 'g');
  v_estado := CASE
    WHEN NOT v_rls OR v_basicos <> 8 THEN 'DESCONOCIDO'
    WHEN v_actual = regexp_replace(f_hoy, '\s+', '', 'g') AND v_extra = 6 THEN 'HOY'
    WHEN v_actual = regexp_replace(f_a,   '\s+', '', 'g') AND v_extra = 0 THEN 'A'
    WHEN v_actual = regexp_replace(f_b,   '\s+', '', 'g') AND v_extra = 0 THEN 'B'
    WHEN v_actual = regexp_replace(f_c,   '\s+', '', 'g') AND v_extra = 0 THEN 'C'
    ELSE 'DESCONOCIDO' END;
  IF v_estado <> 'A' THEN
    RAISE EXCEPTION 'FASE A: tras aplicar, el estado es % (se esperaba A). Se deshace todo.', v_estado;
  END IF;
  RAISE NOTICE 'FASE A OK: estado A.';
END
$fase_a$;

COMMIT;
