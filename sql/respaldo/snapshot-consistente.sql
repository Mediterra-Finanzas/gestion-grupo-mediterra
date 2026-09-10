-- Snapshot consistente de TODO lo que el respaldo lee, con el modo de identidad declarado.
--
-- Antes: `respaldo_snapshot()` leía calendario_data y `respaldo_identidades()` leía los
-- alias de la bóveda en OTRA llamada RPC, es decir en otra transacción. Una alta o una
-- baja de alias entre las dos llamadas ligaba las credenciales de `pins` a un estado de
-- la bóveda distinto del respaldado.
--
-- CONSISTENCIA. La función es STABLE. En PostgreSQL una función STABLE ejecuta todas sus
-- consultas, incluidas las de EXECUTE, con la instantánea de la sentencia que la invoca; una
-- VOLATILE tomaría una instantánea nueva por consulta. Datos, conteo e identidades salen del
-- mismo estado. Se DEMUESTRA frente a escrituras concurrentes, no se da por supuesto:
-- scripts/respaldo/prueba-snapshot-portable-local.mjs (Postgres local desechable) y
-- scripts/respaldo/prueba-snapshot-consistencia.mjs (staging).
--
-- PORTABLE. La versión anterior era `language sql` y nombraba sec_identidad_alias, así que en
-- un origen sin bóveda (hoy producción) ni siquiera se podía crear. Ahora la bóveda se consulta
-- con SQL dinámico solo si existe, y el resultado declara `modo_identidad`:
--   'boveda'             existen sec_identidad y sec_identidad_alias. `identidades` es un
--                        arreglo; vacío es un error de datos y lo rechaza el handler.
--   'legacy'             no existe ninguna de las dos: ausencia por arquitectura.
--                        `identidades` es null. El handler solo lo acepta con
--                        RESPALDO_MODO_IDENTIDAD=legacy.
--   'boveda_incompleta'  existe solo una: error de esquema. Nunca se trata como legacy.
--
-- `respaldo_identidades()` se conserva sin cambios por compatibilidad; el handler nuevo
-- ya no la usa.
--
-- Aplicación: staging primero. Que ahora se pueda crear en producción no autoriza aplicarla
-- allí: eso requiere la decisión de identidad con su dueño.

create or replace function public.respaldo_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_identidad boolean := to_regclass('public.sec_identidad') is not null;
  v_alias     boolean := to_regclass('public.sec_identidad_alias') is not null;
  v_modo      text;
  v_datos     jsonb;
  v_filas     bigint;
  v_ident     jsonb := null;
begin
  v_modo := case when v_identidad and v_alias then 'boveda'
                 when not v_identidad and not v_alias then 'legacy'
                 else 'boveda_incompleta' end;

  -- Filas y conteo en el mismo recorrido.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'value', d.value,
           'updated_at', to_char(d.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
         order by d.id), '[]'::jsonb),
         count(*)
    into v_datos, v_filas
    from public.calendario_data d;

  if v_modo = 'boveda' then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('llave_hash', a.llave_hash, 'identity_id', a.identity_id)
                      order by a.llave_hash), '[]'::jsonb)
        from public.sec_identidad_alias a
        join public.sec_identidad i on i.identity_id = a.identity_id
       where a.origen = 'calendario_data_main'
         and a.vigente_hasta is null
         and i.estado = 'activa'
    $q$ into v_ident;
  end if;

  return jsonb_build_object(
    'tomado_at', now(),
    'filas', v_filas,
    'datos', v_datos,
    'modo_identidad', v_modo,
    'identidades', v_ident);
end
$$;

revoke all on function public.respaldo_snapshot() from public, anon, authenticated;
grant execute on function public.respaldo_snapshot() to service_role;
notify pgrst, 'reload schema';

-- Privilegios EFECTIVOS sobre la función (incluye lo heredado de PUBLIC). Una denegación
-- sobre calendario_data no dice nada de esta función, que es SECURITY DEFINER.
select r.rol,
       has_function_privilege(r.rol, 'public.respaldo_snapshot()', 'EXECUTE') as puede_ejecutar
  from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(rol);

select p.proname, p.prosecdef as security_definer, p.provolatile as volatilidad,
       p.proconfig as configuracion, pg_get_userbyid(p.proowner) as dueno, p.proacl::text as acl,
       (select count(*) from pg_proc q join pg_namespace m on m.oid = q.pronamespace
         where m.nspname = 'public' and q.proname = 'respaldo_snapshot') as sobrecargas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'respaldo_snapshot';

select (public.respaldo_snapshot())->>'modo_identidad' as modo_identidad;
