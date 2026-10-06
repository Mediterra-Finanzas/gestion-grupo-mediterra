-- =============================================================================
-- VERIFICACIÓN (solo lectura) del estado de seguridad de calendario_data
-- Estado: PROPUESTA. Probada solo en local. Ejecutar COMPLETO tal cual en el SQL Editor.
-- -----------------------------------------------------------------------------
-- No modifica datos: las pruebas de escritura como anon se hacen dentro de
-- subtransacciones que SIEMPRE se deshacen (cada una termina con un error forzado).
-- Crea solo una tabla TEMPORAL de resultados (desaparece al cerrar la sesión).
-- Muestra: el estado detectado (HOY, A, B, C o DESCONOCIDO), la lista de
-- administradores activos y, por comprobación, el resultado y lo esperado en cada fase.
-- Nota: los UPDATE de prueba toman un bloqueo de fila breve; ejecutarlo fuera de horas
-- de uso intenso. Requiere poder hacer SET ROLE anon (rol postgres de Supabase).
-- =============================================================================

DROP TABLE IF EXISTS pg_temp._verif_seg;
CREATE TEMP TABLE _verif_seg (n int, comprobacion text, resultado text,
  esperado_hoy text, esperado_a text, esperado_b text, esperado_c text, estado_detectado text, coincide text);

DO $verif$
DECLARE
  b   text := $e$(id !~~ 'backup%'::text) AND (id !~~ 'main_pre_restore%'::text)$e$;
  pu  text := $e$(id <> ALL (ARRAY['pins'::text, 'usuarios'::text]))$e$;
  pum text := $e$(id <> ALL (ARRAY['pins'::text, 'usuarios'::text, 'main'::text]))$e$;
  e_base text; e_pu text; e_pum text;
  f_hoy text; f_a text; f_b text; f_c text;
  v_actual text; v_extra int; v_basicos int; v_rls boolean; v_estado text;
  v_n int; v_err text; r record;
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
  INSERT INTO _verif_seg VALUES (1, 'estado detectado (políticas + privilegios)', v_estado, 'HOY', 'A', 'B', 'C', v_estado, NULL);
  INSERT INTO _verif_seg VALUES (2, 'privilegios TRUNCATE/REFERENCES/TRIGGER de anon+authenticated', v_extra::text, '6', '0', '0', '0', v_estado, NULL);
  IF to_regclass('public.seg_administradores') IS NULL THEN
    INSERT INTO _verif_seg VALUES (3, 'seg_administradores: admins activos', 'tabla ausente', 'ausente o >=1', '>=1', '>=1', '>=1', v_estado, NULL);
  ELSE
    EXECUTE 'SELECT count(*) FROM public.seg_administradores WHERE activo' INTO v_n;
    INSERT INTO _verif_seg VALUES (3, 'seg_administradores: admins activos', v_n::text, 'ausente o >=1', '>=1', '>=1', '>=1', v_estado, NULL);
    SELECT count(*) INTO v_n FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'seg_administradores' AND grantee IN ('anon', 'authenticated', 'PUBLIC');
    INSERT INTO _verif_seg VALUES (4, 'seg_administradores: privilegios de anon/authenticated', v_n::text, '0', '0', '0', '0', v_estado, NULL);
  END IF;

  -- Pruebas como anon. Cada una en su subtransacción, deshecha siempre.
  FOR r IN SELECT * FROM (VALUES
      (10, 'anon LEE pins',       $q$SELECT count(*) FROM public.calendario_data WHERE id = 'pins'$q$,      'si', 'si', 'no', 'no'),
      (11, 'anon LEE usuarios',   $q$SELECT count(*) FROM public.calendario_data WHERE id = 'usuarios'$q$,  'si', 'si', 'no', 'no'),
      (12, 'anon LEE main',       $q$SELECT count(*) FROM public.calendario_data WHERE id = 'main'$q$,      'si', 'si', 'si', 'no'),
      (13, 'anon MODIFICA pins',  $q$WITH u AS (UPDATE public.calendario_data SET value = value WHERE id = 'pins' RETURNING 1) SELECT count(*) FROM u$q$, 'si', 'no', 'no', 'no'),
      (14, 'anon MODIFICA usuarios', $q$WITH u AS (UPDATE public.calendario_data SET value = value WHERE id = 'usuarios' RETURNING 1) SELECT count(*) FROM u$q$, 'si', 'no', 'no', 'no'),
      (15, 'anon MODIFICA main',  $q$WITH u AS (UPDATE public.calendario_data SET value = value WHERE id = 'main' RETURNING 1) SELECT count(*) FROM u$q$, 'si', 'si', 'si', 'no'),
      (16, 'anon UPSERT pins',    $q$WITH u AS (INSERT INTO public.calendario_data (id, value) VALUES ('pins', '{}'::jsonb) ON CONFLICT (id) DO UPDATE SET value = public.calendario_data.value RETURNING 1) SELECT count(*) FROM u$q$, 'si', 'no', 'no', 'no'),
      (17, 'anon BORRA main',     $q$WITH u AS (DELETE FROM public.calendario_data WHERE id = 'main' RETURNING 1) SELECT count(*) FROM u$q$, 'si', 'no', 'no', 'no'),
      (18, 'anon MODIFICA otra fila (finanzas)', $q$WITH u AS (UPDATE public.calendario_data SET value = value WHERE id = 'finanzas' RETURNING 1) SELECT count(*) FROM u$q$, 'si*', 'si*', 'si*', 'si*')
    ) AS t(n, nombre, consulta, e_hoy, e_a, e_b, e_c)
  LOOP
    v_n := NULL; v_err := NULL;
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      EXECUTE r.consulta INTO v_n;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__deshacer__';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> '__deshacer__' THEN v_err := SQLERRM; END IF;
    END;
    INSERT INTO _verif_seg VALUES (r.n, r.nombre,
      CASE WHEN v_err IS NOT NULL THEN 'no (' || left(v_err, 80) || ')' WHEN v_n > 0 THEN 'si' ELSE 'no (0 filas)' END,
      r.e_hoy, r.e_a, r.e_b, r.e_c, v_estado, NULL);
  END LOOP;

  UPDATE _verif_seg SET coincide = CASE
      WHEN estado_detectado = 'DESCONOCIDO' THEN 'REVISAR (estado desconocido)'
      WHEN n = 3 THEN CASE WHEN resultado ~ '^[0-9]+$' AND resultado::int >= 1 THEN 'ok'
                           WHEN resultado = 'tabla ausente' AND estado_detectado = 'HOY' THEN 'ok (falta aplicar fase 0)'
                           ELSE 'REVISAR' END
      WHEN n = 18 AND resultado = 'no (0 filas)' THEN 'ok (la fila no existe)'
      WHEN split_part(resultado, ' ', 1) = rtrim(CASE estado_detectado WHEN 'HOY' THEN esperado_hoy WHEN 'A' THEN esperado_a WHEN 'B' THEN esperado_b ELSE esperado_c END, '*') THEN 'ok'
      ELSE 'REVISAR' END;
END
$verif$;

-- (*) 'finanzas': si la fila no existe en este proyecto el resultado es "no (0 filas)".
SELECT n, comprobacion, resultado, estado_detectado, coincide,
       esperado_hoy, esperado_a, esperado_b, esperado_c
  FROM _verif_seg ORDER BY n;
