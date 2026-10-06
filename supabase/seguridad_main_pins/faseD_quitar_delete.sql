-- =============================================================================
-- FASE D — anon/authenticated ya NO pueden BORRAR filas (ni TRUNCATE) de calendario_data
-- Estado: PROPUESTA. NO aplicada en producción. Probada solo en local
--         (scripts/seguridad-main-pins/prueba-servidor.mjs). Ejecutar el archivo COMPLETO tal cual.
-- Orden decidido por el CFO: 0 → D → A → B → C (D es la PRIMERA que cambia permisos).
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA:
--   DROP POLICY cd_anon_auth_delete (sin política de borrado, RLS deniega todo DELETE).
--   REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER de anon y authenticated (segunda barrera
--   si RLS se desactivara; TRUNCATE salta RLS; REFERENCES/TRIGGER no los usa nadie).
--   NO cambia: políticas SELECT/INSERT/UPDATE, sus privilegios, ni cd_service_all.
-- REQUIERE ANTES: nada (no depende de fase0_admins.sql ni del modo servidor). La app no
--   borra filas de calendario_data con la llave pública: "📤 Restaurar" usa POST con
--   Prefer: resolution=merge-duplicates (INSERT … ON CONFLICT DO UPDATE, sin DELETE) y
--   TRUNCATE no es alcanzable por PostgREST. Revisar antes en producción las funciones/vistas
--   que anon pueda usar sobre calendario_data y la versión de Postgres (consultas M6, M7 y
--   M8 de consultas_previas.sql; reemplaza la propuesta anterior docs/seguridad-quitar-delete-anon.md).
--   Ya leído en producción el 2026-10-05 (D4/D5/D2): 0 vistas, 0 funciones que mencionen
--   calendario_data, y privilegios sin MAINTAIN. El día de aplicar se repiten como control.
-- SI SE APLICA ANTES DE TIEMPO: no hay "antes de tiempo" conocido. Un script o herramienta
--   externa que borrara filas con la llave pública recibiría "permission denied".
-- VERIFICAR: verificacion.sql → estado detectado "D" (anon BORRA … = "no").
-- REVERTIR: reversion.sql (sección FASE D → HOY; reabre el borrado público).
-- Guardas: aborta sin tocar nada si la foto (texto exacto de las políticas, roles y
--   privilegios) no es EXACTAMENTE la de HOY; si D ya está aplicada (o A/B/C, que la
--   contienen), no hace nada. Una sola transacción.
-- =============================================================================

BEGIN;

DO $fase_d$
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
  RAISE NOTICE 'FASE D: estado detectado = %', v_estado;
  IF v_estado IN ('D', 'A', 'B', 'C') THEN
    RAISE NOTICE 'FASE D: no corresponde (estado %); no se cambia nada.', v_estado;
    RETURN;
  END IF;
  IF v_estado <> 'HOY' THEN
    RAISE EXCEPTION 'FASE D ABORTADA: se esperaba el estado HOY y la foto actual es % (políticas: %, privilegios DELETE: %, TRUNCATE/REFERENCES/TRIGGER: %). No se cambió nada.', v_estado, v_actual, v_del, v_extra;
  END IF;
  EXECUTE 'DROP POLICY cd_anon_auth_delete ON public.calendario_data';
  EXECUTE 'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calendario_data FROM anon, authenticated';
  -- Verificación posterior: la foto debe ser exactamente la del estado D.
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
  IF v_estado <> 'D' THEN
    RAISE EXCEPTION 'FASE D: tras aplicar, el estado es % (se esperaba D). Se deshace todo.', v_estado;
  END IF;
  -- Barrera adicional: ningún privilegio DELETE/TRUNCATE efectivo (tampoco heredado de otro rol)
  -- y lo que la app SÍ usa (SELECT/INSERT/UPDATE: leer, PATCH y "Restaurar" por upsert) intacto.
  IF has_table_privilege('anon', 'public.calendario_data', 'DELETE')
     OR has_table_privilege('authenticated', 'public.calendario_data', 'DELETE')
     OR has_table_privilege('anon', 'public.calendario_data', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.calendario_data', 'TRUNCATE') THEN
    RAISE EXCEPTION 'FASE D: anon/authenticated conservan DELETE o TRUNCATE efectivo (¿heredado de otro rol?). Se deshace todo.';
  END IF;
  IF NOT (has_table_privilege('anon', 'public.calendario_data', 'SELECT')
      AND has_table_privilege('anon', 'public.calendario_data', 'INSERT')
      AND has_table_privilege('anon', 'public.calendario_data', 'UPDATE')) THEN
    RAISE EXCEPTION 'FASE D: anon perdió SELECT/INSERT/UPDATE (la app dejaría de funcionar). Se deshace todo.';
  END IF;
  RAISE NOTICE 'FASE D OK: estado D.';
END
$fase_d$;

COMMIT;
