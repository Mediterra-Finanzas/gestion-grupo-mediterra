-- =============================================================================
-- REVERSIÓN de las fases A, B y C (y plantilla comentada de la Fase 0)
-- EXCEPCIONAL — NO es la vía habitual de recuperación. Cada sección REABRE lo que su fase
-- cierra (C→B: main pública; B→A: lectura de pins/usuarios = hashes expuestos de nuevo;
-- A→HOY: escritura de pins/usuarios = toma de cuentas). Requiere autorización APARTE con
-- el riesgo aceptado por escrito. Vía habitual: docs/seguridad-main-pins-checklist.md §5.
-- Estado: PROPUESTA. Probada solo en local. Ejecutar el archivo COMPLETO tal cual.
-- -----------------------------------------------------------------------------
-- Cada sección revierte UNA fase y solo actúa si la foto actual es exactamente la de
-- esa fase; si la fase no está aplicada, la omite con un aviso. Ejecutado completo
-- desde cualquier estado conocido (C, B, A u HOY) deja la foto EXACTA de hoy:
--   cd_anon_auth_{select,insert,update,delete} para {anon,authenticated} con
--   ((id !~~ 'backup%') AND (id !~~ 'main_pre_restore%')), cd_service_all intacta y
--   TRUNCATE, REFERENCES, TRIGGER otorgados de nuevo a anon y authenticated.
-- Para volver solo un paso (p. ej. de C a B) ejecutar solo la sección de esa fase.
-- ORDEN: PRIMERO este SQL (vuelve a HOY) y DESPUÉS, solo si se quiere, desplegar el cliente
--   con el flag apagado. Al revés no: con B aplicada el cliente con el flag apagado no puede
--   iniciar sesión (lee pins/usuarios con la llave pública y ve 0 filas). El cliente con el
--   flag prendido funciona en cualquier fase (usa la llave de servicio en el servidor).
-- Lo que revertir REABRE: la lectura/escritura pública de pins/usuarios/main (las
--   vulnerabilidades que estas fases cierran).
-- VERIFICAR: verificacion.sql → estado "HOY".
-- Si la foto es DESCONOCIDO (alguien cambió las políticas a mano), ABORTA sin tocar nada.
-- =============================================================================

-- ── FASE C → B ───────────────────────────────────────────────────────────
BEGIN;

DO $revertir_fase_c$
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
  RAISE NOTICE 'REVERTIR FASE C: estado detectado = %', v_estado;
  IF v_estado = 'B' OR v_estado = 'A' OR v_estado = 'HOY' THEN
    RAISE NOTICE 'REVERTIR FASE C: no corresponde (estado %); no se cambia nada.', v_estado;
    RETURN;
  END IF;
  IF v_estado <> 'C' THEN
    RAISE EXCEPTION 'REVERTIR FASE C ABORTADA: se esperaba el estado C y la foto actual es % (políticas: %, privilegios extra anon/authenticated: %). No se cambió nada.', v_estado, v_actual, v_extra;
  END IF;

  EXECUTE 'ALTER POLICY cd_anon_auth_select ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text])))';
  EXECUTE 'ALTER POLICY cd_anon_auth_insert ON public.calendario_data WITH CHECK ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text])))';
  EXECUTE 'ALTER POLICY cd_anon_auth_update ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text]))) WITH CHECK ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text])))';
  -- Verificación posterior: la foto debe ser exactamente la del estado B.
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
  IF v_estado <> 'B' THEN
    RAISE EXCEPTION 'REVERTIR FASE C: tras aplicar, el estado es % (se esperaba B). Se deshace todo.', v_estado;
  END IF;
  RAISE NOTICE 'REVERTIR FASE C OK: estado B.';
END
$revertir_fase_c$;

COMMIT;

-- ── FASE B → A ───────────────────────────────────────────────────────────
BEGIN;

DO $revertir_fase_b$
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
  RAISE NOTICE 'REVERTIR FASE B: estado detectado = %', v_estado;
  IF v_estado = 'A' OR v_estado = 'HOY' THEN
    RAISE NOTICE 'REVERTIR FASE B: no corresponde (estado %); no se cambia nada.', v_estado;
    RETURN;
  END IF;
  IF v_estado <> 'B' THEN
    RAISE EXCEPTION 'REVERTIR FASE B ABORTADA: se esperaba el estado B y la foto actual es % (políticas: %, privilegios extra anon/authenticated: %). No se cambió nada.', v_estado, v_actual, v_extra;
  END IF;

  EXECUTE 'ALTER POLICY cd_anon_auth_select ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text))';
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
    RAISE EXCEPTION 'REVERTIR FASE B: tras aplicar, el estado es % (se esperaba A). Se deshace todo.', v_estado;
  END IF;
  RAISE NOTICE 'REVERTIR FASE B OK: estado A.';
END
$revertir_fase_b$;

COMMIT;

-- ── FASE A → HOY ─────────────────────────────────────────────────────────
BEGIN;

DO $revertir_fase_a$
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
  RAISE NOTICE 'REVERTIR FASE A: estado detectado = %', v_estado;
  IF v_estado = 'HOY' THEN
    RAISE NOTICE 'REVERTIR FASE A: no corresponde (estado %); no se cambia nada.', v_estado;
    RETURN;
  END IF;
  IF v_estado <> 'A' THEN
    RAISE EXCEPTION 'REVERTIR FASE A ABORTADA: se esperaba el estado A y la foto actual es % (políticas: %, privilegios extra anon/authenticated: %). No se cambió nada.', v_estado, v_actual, v_extra;
  END IF;

  EXECUTE 'ALTER POLICY cd_anon_auth_insert ON public.calendario_data WITH CHECK ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text))';
  EXECUTE 'ALTER POLICY cd_anon_auth_update ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text)) WITH CHECK ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text))';
  EXECUTE 'ALTER POLICY cd_anon_auth_delete ON public.calendario_data USING ((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text))';
  EXECUTE 'GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calendario_data TO anon, authenticated';
  -- Verificación posterior: la foto debe ser exactamente la del estado HOY.
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
  IF v_estado <> 'HOY' THEN
    RAISE EXCEPTION 'REVERTIR FASE A: tras aplicar, el estado es % (se esperaba HOY). Se deshace todo.', v_estado;
  END IF;
  RAISE NOTICE 'REVERTIR FASE A OK: estado HOY.';
END
$revertir_fase_a$;

COMMIT;

-- ── FASE 0 (NO se ejecuta: comentada a propósito) ───────────────────────────
-- Borrar la tabla elimina la lista de administradores y su trazabilidad; con la
-- tabla ausente los endpoints de admin responden 503 (fallo cerrado). Solo si se
-- abandona el modo servidor por completo:
--   DROP TABLE IF EXISTS public.seg_administradores;
