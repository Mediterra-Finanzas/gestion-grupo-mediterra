-- =============================================================================
-- FASE C — 'main' cerrada para anon/authenticated (ni leer, ni insertar, ni modificar)
-- Estado: PROPUESTA. NO aplicada en producción. Probada solo en local. Ejecutar COMPLETO tal cual.
-- Orden: 0 → D → A → B → C.
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA: SELECT, INSERT y UPDATE excluyen además 'main' (el BORRADO de cualquier fila
--   ya no existe para anon/authenticated desde la Fase D).
-- REQUIERE ANTES:
--   1. Fase B aplicada (el archivo lo exige).
--   2. Cliente que lee y guarda Tareas SOLO por GET/PATCH /api/datos/main (sin lecturas
--      directas de 'main', sin suscripción realtime a 'main' como fuente de datos).
--   3. Recuperación de acceso probada: "¿Olvidaste tu PIN?" con correo real y reseteo por
--      un admin de seg_administradores (ver docs, "Recuperar acceso").
-- SI SE APLICA ANTES DE TIEMPO: el módulo Tareas del cliente que lee 'main' directo queda
--   vacío/sin guardar (la carga falla y el auto-guardado se bloquea por cargaOkRef).
-- VERIFICAR: verificacion.sql → estado "C".
-- REVERTIR: reversion.sql (sección FASE C → B).
-- =============================================================================

BEGIN;

DO $fase_c$
DECLARE
  b   text := $e$(id !~~ 'backup%'::text) AND (id !~~ 'main_pre_restore%'::text)$e$;
  pu  text := $e$(id <> ALL (ARRAY['pins'::text, 'usuarios'::text]))$e$;
  pum text := $e$(id <> ALL (ARRAY['pins'::text, 'usuarios'::text, 'main'::text]))$e$;
  e_base text; e_pu text; e_pum text;
  f_hoy text; f_d text; f_a text; f_b text; f_c text;
  v_actual text; v_extra int; v_del int; v_basicos int; v_rls boolean; v_estado text;
  v_admins int;
BEGIN
  e_base := '(' || b || ')';
  e_pu   := '(' || b || ' AND ' || pu || ')';
  e_pum  := '(' || b || ' AND ' || pum || ')';
  -- Foto = las políticas de calendario_data (nombre|comando|roles|tipo|USING|WITH CHECK).
  -- HOY: 5 políticas. D, A, B y C: sin cd_anon_auth_delete (la Fase D la elimina).
  f_hoy := format('cd_anon_auth_delete|DELETE|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_base, e_base, e_base, e_base, e_base);
  f_d   := format('cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_base, e_base, e_base, e_base);
  f_a   := format('cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pu, e_base, e_pu, e_pu);
  f_b   := format('cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pu, e_pu, e_pu, e_pu);
  f_c   := format('cd_anon_auth_insert|INSERT|anon,authenticated|PERMISSIVE||%s;cd_anon_auth_select|SELECT|anon,authenticated|PERMISSIVE|%s|;cd_anon_auth_update|UPDATE|anon,authenticated|PERMISSIVE|%s|%s;cd_service_all|ALL|service_role|PERMISSIVE|true|true', e_pum, e_pum, e_pum, e_pum);
  SELECT string_agg(format('%s|%s|%s|%s|%s|%s', policyname, cmd,
           (SELECT string_agg(rol, ',' ORDER BY rol) FROM unnest(roles) rol), permissive,
           coalesce(qual, ''), coalesce(with_check, '')), ';' ORDER BY policyname)
    INTO v_actual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendario_data';
  -- Privilegios de anon+authenticated: SELECT/INSERT/UPDATE (6 en todo estado conocido),
  -- DELETE (2 en HOY, 0 desde D) y TRUNCATE/REFERENCES/TRIGGER (6 en HOY, 0 desde D).
  SELECT count(*) FILTER (WHERE privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
         count(*) FILTER (WHERE privilege_type = 'DELETE'),
         count(*) FILTER (WHERE privilege_type IN ('SELECT', 'INSERT', 'UPDATE'))
    INTO v_extra, v_del, v_basicos
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'calendario_data' AND grantee IN ('anon', 'authenticated');
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.calendario_data'::regclass;
  v_actual := regexp_replace(coalesce(v_actual, ''), '\s+', '', 'g');
  v_estado := CASE
    WHEN NOT v_rls OR v_basicos <> 6 THEN 'DESCONOCIDO'
    WHEN v_actual = regexp_replace(f_hoy, '\s+', '', 'g') AND v_del = 2 AND v_extra = 6 THEN 'HOY'
    WHEN v_del <> 0 OR v_extra <> 0 THEN 'DESCONOCIDO'
    WHEN v_actual = regexp_replace(f_d,   '\s+', '', 'g') THEN 'D'
    WHEN v_actual = regexp_replace(f_a,   '\s+', '', 'g') THEN 'A'
    WHEN v_actual = regexp_replace(f_b,   '\s+', '', 'g') THEN 'B'
    WHEN v_actual = regexp_replace(f_c,   '\s+', '', 'g') THEN 'C'
    ELSE 'DESCONOCIDO' END;
  RAISE NOTICE 'FASE C: estado detectado = %', v_estado;
  IF v_estado IN ('C') THEN
    RAISE NOTICE 'FASE C: no corresponde (estado %); no se cambia nada.', v_estado;
    RETURN;
  END IF;
  IF v_estado <> 'B' THEN
    RAISE EXCEPTION 'FASE C ABORTADA: se esperaba el estado B y la foto actual es % (políticas: %, privilegios DELETE: %, TRUNCATE/REFERENCES/TRIGGER: %). No se cambió nada.', v_estado, v_actual, v_del, v_extra;
  END IF;
  EXECUTE 'ALTER POLICY cd_anon_auth_select ON public.calendario_data USING (((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text, ''main''::text]))))';
  EXECUTE 'ALTER POLICY cd_anon_auth_insert ON public.calendario_data WITH CHECK (((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text, ''main''::text]))))';
  EXECUTE 'ALTER POLICY cd_anon_auth_update ON public.calendario_data USING (((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text, ''main''::text])))) WITH CHECK (((id !~~ ''backup%''::text) AND (id !~~ ''main_pre_restore%''::text) AND (id <> ALL (ARRAY[''pins''::text, ''usuarios''::text, ''main''::text]))))';
  -- Verificación posterior: la foto debe ser exactamente la del estado C.
  SELECT string_agg(format('%s|%s|%s|%s|%s|%s', policyname, cmd,
           (SELECT string_agg(rol, ',' ORDER BY rol) FROM unnest(roles) rol), permissive,
           coalesce(qual, ''), coalesce(with_check, '')), ';' ORDER BY policyname)
    INTO v_actual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendario_data';
  -- Privilegios de anon+authenticated: SELECT/INSERT/UPDATE (6 en todo estado conocido),
  -- DELETE (2 en HOY, 0 desde D) y TRUNCATE/REFERENCES/TRIGGER (6 en HOY, 0 desde D).
  SELECT count(*) FILTER (WHERE privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
         count(*) FILTER (WHERE privilege_type = 'DELETE'),
         count(*) FILTER (WHERE privilege_type IN ('SELECT', 'INSERT', 'UPDATE'))
    INTO v_extra, v_del, v_basicos
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'calendario_data' AND grantee IN ('anon', 'authenticated');
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.calendario_data'::regclass;
  v_actual := regexp_replace(coalesce(v_actual, ''), '\s+', '', 'g');
  v_estado := CASE
    WHEN NOT v_rls OR v_basicos <> 6 THEN 'DESCONOCIDO'
    WHEN v_actual = regexp_replace(f_hoy, '\s+', '', 'g') AND v_del = 2 AND v_extra = 6 THEN 'HOY'
    WHEN v_del <> 0 OR v_extra <> 0 THEN 'DESCONOCIDO'
    WHEN v_actual = regexp_replace(f_d,   '\s+', '', 'g') THEN 'D'
    WHEN v_actual = regexp_replace(f_a,   '\s+', '', 'g') THEN 'A'
    WHEN v_actual = regexp_replace(f_b,   '\s+', '', 'g') THEN 'B'
    WHEN v_actual = regexp_replace(f_c,   '\s+', '', 'g') THEN 'C'
    ELSE 'DESCONOCIDO' END;
  IF v_estado <> 'C' THEN
    RAISE EXCEPTION 'FASE C: tras aplicar, el estado es % (se esperaba C). Se deshace todo.', v_estado;
  END IF;
  RAISE NOTICE 'FASE C OK: estado C.';
END
$fase_c$;

COMMIT;
