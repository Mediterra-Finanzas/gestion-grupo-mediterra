-- ─────────────────────────────────────────────────────────────────────────
-- PROPUESTA — NO APLICADA. Requiere autorización explícita del CFO.
-- Diseño, compatibilidad, despliegue y riesgos: docs/nominas-version-obligatoria.md
-- Prueba local (Postgres 16 + PostgREST 12, datos de prueba):
--   POSTGREST_BIN=/ruta/postgrest node scripts/nominas-cas/prueba.mjs
--
-- QUÉ HACE
--   La base RECHAZA toda escritura de una fila de nóminas por empresa
--   (nominas_<empresa>) hecha con la llave pública (anon/authenticated) que no
--   pase por la función nominas_guardar(id, valor, versión leída). Esa función
--   escribe SOLO si la versión leída sigue siendo la vigente (o, para una fila
--   nueva, solo si la fila todavía no existe). Así:
--     · una pestaña con el código ANTIGUO (upsert sin condición) recibe un error
--       y no escribe nada, ni en filas existentes ni creando filas nuevas;
--     · una pestaña con el código de la rama ACTUAL (PATCH condicionado por
--       filtro) TAMBIÉN es rechazada: el filtro de la URL no es visible para la
--       base. Por eso el cliente debe pasar a llamar la función
--       (src/nominasTransporteRpc.js, aplicado en la rama 2026-10-05).
--   La fila antigua `nominas` (formato previo a la partición) queda de solo
--   lectura para la llave pública: nadie la debe escribir desde 2026.
--
-- QUÉ NO HACE
--   · No es una barrera de seguridad: quien tenga la llave pública puede leer la
--     versión y escribir a través de la función. Protege la CONSISTENCIA (nadie
--     pisa sin haber visto lo último), no el acceso. DELETE sigue abierto
--     (propuesta separada: docs/seguridad-quitar-delete-anon.md).
--   · No cambia el formato de las filas (texto JSON dentro del jsonb) ni el
--     esquema de la tabla. No toca nominas_correlativos, nominas_tipos_doc,
--     nominas_v2_done ni ninguna otra fila.
--   · No afecta al SQL Editor ni a service_role (restauraciones del
--     administrador): la regla aplica solo a los roles anon y authenticated.
--
-- PARTES (se ejecutan POR SEPARADO y en orden; ver el documento):
--   PARTE 0 — Comprobaciones previas (solo lectura).
--   PARTE 1 — Función nominas_guardar (inerte: nadie la usa hasta desplegar el cliente).
--   [desplegar el cliente que llama a la función]
--   PARTE 2 — Activación: trigger que exige pasar por la función.
--   PARTE 3 — Verificación (transacción que termina en ROLLBACK: no deja cambios).
--   Reversión: supabase/propuesta_nominas_version_obligatoria_reversion.sql
-- ─────────────────────────────────────────────────────────────────────────


-- PARTE 0 — COMPROBACIONES PREVIAS (solo lectura). Guardar los resultados.

-- 0.1 Triggers que ya existen en calendario_data, con su definición completa.
--     Debe revisarse que ninguno modifique id/value/updated_at de filas nominas_*
--     (hoy: trg_cd_scrub_main y trg_guard_main_no_user_shrink).
select t.tgname, pg_get_triggerdef(t.oid) as definicion, p.proname as funcion,
       pg_get_functiondef(p.oid) as codigo_funcion
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.calendario_data'::regclass and not t.tgisinternal
order by t.tgname;

-- 0.2 Los nombres que crea esta propuesta no deben existir (resultado: 0 filas).
select 'funcion' as tipo, proname as nombre from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('nominas_fila_protegida', 'nominas_guardar', 'nominas_exigir_version')
union all
select 'trigger', tgname from pg_trigger
 where tgrelid = 'public.calendario_data'::regclass and tgname = 'trg_nominas_exigir_version';

-- 0.3 id es clave primaria o única (la creación usa ON CONFLICT (id)). Debe dar 1 o más.
select count(*) as restricciones_unicas_sobre_id
from pg_constraint c
where c.conrelid = 'public.calendario_data'::regclass and c.contype in ('p', 'u')
  and c.conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.calendario_data'::regclass and attname = 'id')]::int2[];

-- 0.4 Qué filas quedarían protegidas (solo id, fecha y tamaño; sin contenido).
select id, updated_at, pg_column_size(value) as bytes,
       case when id = 'nominas' then 'solo lectura (formato antiguo)'
            when id like 'nominas\_%'
             and id not in ('nominas_v2_done', 'nominas_tipos_doc', 'nominas_correlativos')
             and id not like 'nominas\_respaldo%' then 'protegida: solo vía nominas_guardar'
            else 'sin cambio' end as efecto
from public.calendario_data
where id like 'nominas%'
order by id;


-- PARTE 1 — FUNCIÓN nominas_guardar (inerte hasta desplegar el cliente nuevo).
-- Ejecutar el bloque completo de una vez. Se aborta si algo no calza.
begin;

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('nominas_fila_protegida', 'nominas_guardar', 'nominas_exigir_version')) then
    raise exception 'ABORTADO: ya existe una función con el nombre de esta propuesta (revisar PARTE 0.2)';
  end if;
  if not exists (select 1 from pg_constraint c
                 where c.conrelid = 'public.calendario_data'::regclass and c.contype in ('p', 'u')
                   and c.conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.calendario_data'::regclass and attname = 'id')]::int2[]) then
    raise exception 'ABORTADO: calendario_data.id no es único (revisar PARTE 0.3)';
  end if;
end $$;

-- Filas de nóminas por empresa. Lista de EXCLUSIÓN explícita: una empresa nueva
-- queda protegida sola; una fila auxiliar nueva con prefijo nominas_ debe
-- agregarse aquí (si no, sus escrituras directas serían rechazadas: falla
-- visible, no silenciosa en el código nuevo).
create function public.nominas_fila_protegida(p_id text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_id like 'nominas\_%'
     and p_id not in ('nominas_v2_done', 'nominas_tipos_doc', 'nominas_correlativos')
     and p_id not like 'nominas\_respaldo%';
$$;

-- Escritura condicionada. SECURITY INVOKER: corre con los permisos y políticas
-- RLS de quien llama (no amplía nada).
--   p_version_leida = updated_at leído  → actualiza solo si sigue vigente;
--   p_version_leida = null              → crea la fila solo si no existe.
-- Devuelve {resultado: ok|conflicto|existe|no_existe, version, version_actual}.
-- "conflicto"/"existe"/"no_existe" no escriben nada: el cliente relee y combina.
create function public.nominas_guardar(p_id text, p_value jsonb, p_version_leida timestamptz default null)
returns jsonb language plpgsql security invoker
set search_path = public, pg_catalog
as $$
declare
  v_nueva timestamptz;
  v_actual timestamptz;
  v_contenido jsonb;
begin
  if not public.nominas_fila_protegida(p_id) then
    raise exception 'MEDITERRA_NOMINAS_FILA_NO_VALIDA: "%" no es una fila de nóminas por empresa', p_id;
  end if;
  -- Mismo formato que hoy: texto JSON {nominas:[…], empresa} guardado como string jsonb.
  if p_value is null or jsonb_typeof(p_value) <> 'string' then
    raise exception 'MEDITERRA_NOMINAS_FORMATO: el valor debe ser el texto JSON de la fila';
  end if;
  begin
    v_contenido := (p_value #>> '{}')::jsonb;
  exception when others then
    raise exception 'MEDITERRA_NOMINAS_FORMATO: el texto no es JSON válido';
  end;
  if jsonb_typeof(v_contenido -> 'nominas') is distinct from 'array' then
    raise exception 'MEDITERRA_NOMINAS_FORMATO: falta la lista "nominas"';
  end if;

  -- Autoriza SOLO esta fila y SOLO en esta transacción (lo lee el trigger).
  perform set_config('mediterra.nominas_cas', p_id, true);

  if p_version_leida is null then
    insert into public.calendario_data (id, value, updated_at)
    values (p_id, p_value, clock_timestamp())
    on conflict (id) do nothing
    returning updated_at into v_nueva;
    perform set_config('mediterra.nominas_cas', '', true);
    if v_nueva is null then
      return jsonb_build_object('resultado', 'existe');
    end if;
    return jsonb_build_object('resultado', 'ok', 'version', v_nueva);
  end if;

  -- La condición se evalúa con la fila bloqueada: dos guardados simultáneos con
  -- la misma versión no pueden ganar los dos.
  update public.calendario_data
     set value = p_value,
         updated_at = greatest(clock_timestamp(), p_version_leida + interval '1 millisecond')
   where id = p_id and updated_at = p_version_leida
  returning updated_at into v_nueva;
  perform set_config('mediterra.nominas_cas', '', true);
  if v_nueva is not null then
    return jsonb_build_object('resultado', 'ok', 'version', v_nueva);
  end if;
  select updated_at into v_actual from public.calendario_data where id = p_id;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  return jsonb_build_object('resultado', 'conflicto', 'version_actual', v_actual);
end $$;

revoke all on function public.nominas_guardar(text, jsonb, timestamptz) from public;
grant execute on function public.nominas_guardar(text, jsonb, timestamptz) to anon, authenticated, service_role;
grant execute on function public.nominas_fila_protegida(text) to anon, authenticated, service_role;

commit;
notify pgrst, 'reload schema';   -- PostgREST publica la función /rest/v1/rpc/nominas_guardar


-- PARTE 2 — ACTIVACIÓN (después de desplegar el cliente que usa nominas_guardar).
-- Desde aquí, la llave pública ya no puede escribir nominas_<empresa> sin la versión.
begin;

do $$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'nominas_guardar') then
    raise exception 'ABORTADO: falta la PARTE 1 (función nominas_guardar)';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.calendario_data'::regclass
             and tgname = 'trg_nominas_exigir_version') then
    raise exception 'ABORTADO: el trigger ya existe';
  end if;
end $$;

create function public.nominas_exigir_version()
returns trigger language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- SQL Editor (postgres) y service_role quedan fuera: restauraciones del administrador.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.id = 'nominas' or (tg_op = 'UPDATE' and old.id = 'nominas') then
    raise exception 'MEDITERRA_NOMINAS_LEGADO: la fila antigua "nominas" es de solo lectura. Recarga la página.';
  end if;
  if public.nominas_fila_protegida(new.id)
     or (tg_op = 'UPDATE' and public.nominas_fila_protegida(old.id)) then
    if coalesce(current_setting('mediterra.nominas_cas', true), '') is distinct from new.id
       or (tg_op = 'UPDATE' and old.id is distinct from new.id) then
      raise exception 'MEDITERRA_NOMINAS_SIN_VERSION: "%" solo se guarda indicando la versión leída. Tu página tiene una versión antigua de la app: recárgala.', new.id;
    end if;
  end if;
  return new;
end $$;

create trigger trg_nominas_exigir_version
  before insert or update on public.calendario_data
  for each row execute function public.nominas_exigir_version();

commit;


-- PARTE 3 — VERIFICACIÓN. Todo dentro de una transacción que termina en
-- ROLLBACK: no queda ningún cambio. Usa filas FICTICIAS (nominas_zz_verificacion,
-- zz_verificacion_libre); la única fila real que toca es la antigua `nominas`,
-- con un UPDATE que no cambia nada y que se revierte.
-- Resultado esperado: todas las filas con ok = true.
begin;
create temporary table verif (n int, prueba text, esperado text, obtenido text, ok boolean) on commit drop;
grant insert, select on verif to anon;
set local role anon;
do $$
declare r jsonb; v1 timestamptz; v2 timestamptz;
begin
  -- a) upsert como el código antiguo sobre una fila nueva → rechazado
  begin
    insert into calendario_data (id, value, updated_at) values ('nominas_zz_verificacion', to_jsonb('{"nominas":[]}'::text), now())
      on conflict (id) do update set value = excluded.value, updated_at = excluded.updated_at;
    insert into verif values (1, 'upsert antiguo, fila nueva', 'rechazado', 'aceptado', false);
  exception when others then
    insert into verif values (1, 'upsert antiguo, fila nueva', 'rechazado', 'rechazado: ' || left(sqlerrm, 40), sqlerrm like 'MEDITERRA_NOMINAS_SIN_VERSION%');
  end;
  -- b) crear vía función
  r := nominas_guardar('nominas_zz_verificacion', to_jsonb('{"nominas":[],"empresa":"ZZ"}'::text), null);
  v1 := (r ->> 'version')::timestamptz;
  insert into verif values (2, 'crear vía función', 'ok', r ->> 'resultado', r ->> 'resultado' = 'ok');
  -- c) crear otra vez → existe
  r := nominas_guardar('nominas_zz_verificacion', to_jsonb('{"nominas":[],"empresa":"ZZ"}'::text), null);
  insert into verif values (3, 'crear de nuevo', 'existe', r ->> 'resultado', r ->> 'resultado' = 'existe');
  -- d) actualizar con la versión leída → ok
  r := nominas_guardar('nominas_zz_verificacion', to_jsonb('{"nominas":[{"id":"x"}],"empresa":"ZZ"}'::text), v1);
  v2 := (r ->> 'version')::timestamptz;
  insert into verif values (4, 'actualizar con versión vigente', 'ok', r ->> 'resultado', r ->> 'resultado' = 'ok' and v2 > v1);
  -- e) actualizar con versión vieja → conflicto
  r := nominas_guardar('nominas_zz_verificacion', to_jsonb('{"nominas":[],"empresa":"ZZ"}'::text), v1);
  insert into verif values (5, 'actualizar con versión vieja', 'conflicto', r ->> 'resultado', r ->> 'resultado' = 'conflicto');
  -- f) upsert antiguo sobre fila existente → rechazado
  begin
    insert into calendario_data (id, value, updated_at) values ('nominas_zz_verificacion', to_jsonb('{"nominas":[]}'::text), now())
      on conflict (id) do update set value = excluded.value, updated_at = excluded.updated_at;
    insert into verif values (6, 'upsert antiguo, fila existente', 'rechazado', 'aceptado', false);
  exception when others then
    insert into verif values (6, 'upsert antiguo, fila existente', 'rechazado', 'rechazado: ' || left(sqlerrm, 40), sqlerrm like 'MEDITERRA_NOMINAS_SIN_VERSION%');
  end;
  -- g) PATCH directo (como la rama actual, con filtro de versión) → rechazado
  begin
    update calendario_data set value = to_jsonb('{"nominas":[]}'::text), updated_at = now()
     where id = 'nominas_zz_verificacion' and updated_at = v2;
    insert into verif values (7, 'PATCH directo con filtro', 'rechazado', 'aceptado', false);
  exception when others then
    insert into verif values (7, 'PATCH directo con filtro', 'rechazado', 'rechazado: ' || left(sqlerrm, 40), sqlerrm like 'MEDITERRA_NOMINAS_SIN_VERSION%');
  end;
  -- h) fila antigua `nominas` → solo lectura
  begin
    update calendario_data set value = value where id = 'nominas';
    insert into verif values (8, 'fila antigua nominas', 'rechazado (o no existe)', 'aceptado', not exists (select 1 from calendario_data where id = 'nominas'));
  exception when others then
    insert into verif values (8, 'fila antigua nominas', 'rechazado (o no existe)', 'rechazado: ' || left(sqlerrm, 40), sqlerrm like 'MEDITERRA_NOMINAS_LEGADO%');
  end;
  -- i) una fila que no es de nóminas por empresa se sigue guardando igual
  begin
    insert into calendario_data (id, value, updated_at) values ('zz_verificacion_libre', '{"a":1}', now())
      on conflict (id) do update set value = excluded.value;
    insert into verif values (9, 'otra fila, upsert normal', 'aceptado', 'aceptado', true);
  exception when others then
    insert into verif values (9, 'otra fila, upsert normal', 'aceptado', 'rechazado: ' || left(sqlerrm, 40), false);
  end;
end $$;
reset role;
select n, prueba, esperado, obtenido, ok from verif order by n;
rollback;
-- Además (solo lectura): el trigger y la función existen.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.calendario_data'::regclass and tgname = 'trg_nominas_exigir_version';
