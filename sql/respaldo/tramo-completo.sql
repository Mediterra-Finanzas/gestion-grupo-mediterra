-- Snapshot transaccional en UNA sentencia. Un solo SELECT ve un solo estado de
-- la base, asi que el respaldo no puede quedar a caballo entre dos escrituras
-- del equipo. Por PostgREST no hay transacciones de varias sentencias, y por eso
-- el snapshot vive aca y no en el cliente.
create or replace function public.respaldo_snapshot()
returns jsonb
language sql
stable                     -- no escribe: una escritura aqui rompe la garantia
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tomado_at', now(),
    'filas', coalesce((select count(*) from public.calendario_data), 0),
    'datos', coalesce((select jsonb_agg(jsonb_build_object(
                'id', d.id, 'value', d.value,
                'updated_at', to_char(d.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
              order by d.id) from public.calendario_data d), '[]'::jsonb)
  );
$$;

revoke all on function public.respaldo_snapshot() from public, anon, authenticated;

-- Reserva atomica invocable por PostgREST. La carrera la resuelve la clave
-- primaria, no un if en el handler: dos crones simultaneos, una sola creacion.
create or replace function public.respaldo_reservar(p_lote text, p_correlation uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int; v_estado text; v_intento int;
begin
  insert into public.respaldo_lote(lote_id, correlation, tomado_at)
  values (p_lote, p_correlation, now())
  on conflict (lote_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    select intento into v_intento from public.respaldo_lote where lote_id = p_lote;
    return jsonb_build_object('reservado', true, 'intento', v_intento);
  end if;
  -- No reservo. Puede que el lote anterior haya quedado colgado: se toma solo si
  -- realmente esta abandonado, y subiendo el intento para que el proceso viejo
  -- ya no pueda publicar.
  update public.respaldo_lote
     set intento = intento + 1, tomado_at = now(), correlation = p_correlation
   where lote_id = p_lote
     and (estado = 'FAILED' or (estado = 'CREATING' and tomado_at < now() - interval '15 minutes'))
  returning intento into v_intento;
  if v_intento is not null then
    return jsonb_build_object('reservado', true, 'intento', v_intento, 'retomado', true);
  end if;
  select estado into v_estado from public.respaldo_lote where lote_id = p_lote;
  return jsonb_build_object('reservado', false, 'estado', v_estado);
end $$;

revoke all on function public.respaldo_reservar(text, uuid) from public, anon, authenticated;

-- Publicacion con testigo: solo publica el intento vigente. Un proceso viejo que
-- despierta tarde no puede pisar el lote que otro ya esta armando.
create or replace function public.respaldo_publicar(
  p_lote text, p_intento int, p_objeto_a text, p_objeto_b text,
  p_sha_a text, p_sha_b text, p_objeto_c text default null, p_sha_c text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.respaldo_lote
     set estado='READY', listo_at=now(), objeto_a=p_objeto_a, objeto_b=p_objeto_b,
         sha_a=p_sha_a, sha_b=p_sha_b
   where lote_id=p_lote and intento=p_intento and estado='CREATING';
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('publicado', false, 'motivo', 'intento_superado'); end if;
  return jsonb_build_object('publicado', true);
end $$;
revoke all on function public.respaldo_publicar(text,int,text,text,text,text,text,text) from public, anon, authenticated;

create or replace function public.respaldo_marcar(p_lote text, p_estado text, p_verificacion text default null)
returns void language sql security definer set search_path = public as $$
  update public.respaldo_lote
     set estado = case when p_estado in ('FAILED') then p_estado else estado end,
         verificado_at = case when p_estado='VERIFICADO' then now() else verificado_at end,
         verificacion = coalesce(p_verificacion, verificacion)
   where lote_id = p_lote;
$$;
revoke all on function public.respaldo_marcar(text,text,text) from public, anon, authenticated;

select 'funciones creadas: ' || string_agg(proname, ', ' order by proname)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname like 'respaldo_%';
grant usage on schema public to service_role;
grant select, insert, update on public.respaldo_lote to service_role;
grant select on public.respaldo_salud to service_role;
grant execute on function public.respaldo_snapshot() to service_role;
grant execute on function public.respaldo_reservar(text,uuid) to service_role;
grant execute on function public.respaldo_publicar(text,int,text,text,text,text,text,text) to service_role;
grant execute on function public.respaldo_marcar(text,text,text) to service_role;
-- anon y authenticated siguen fuera, a proposito
revoke all on public.respaldo_lote from anon, authenticated;
revoke all on public.respaldo_salud from anon, authenticated;
notify pgrst, 'reload schema';
select 'grants a service_role: ' || string_agg(distinct privilege_type, ',') from information_schema.role_table_grants
 where grantee='service_role' and table_name='respaldo_lote';
select 'anon sobre respaldo_lote: ' || coalesce(string_agg(distinct privilege_type, ','),'ninguno') from information_schema.role_table_grants
 where grantee in ('anon','authenticated') and table_name='respaldo_lote';
-- El respaldo necesita saber a que identidad pertenece cada credencial, y nada
-- mas. Se expone SOLO el par (llave_hash -> identity_id), que no revela nombres,
-- correos ni material de credencial. Las tablas sec_* siguen denegadas: abrirlas
-- para que el respaldo funcione seria pagar el respaldo con la boveda.
create or replace function public.respaldo_identidades()
returns table (llave_hash text, identity_id uuid)
language sql stable security definer set search_path = public as $$
  select a.llave_hash, a.identity_id
    from public.sec_identidad_alias a
    join public.sec_identidad i on i.identity_id = a.identity_id
   where a.origen = 'calendario_data_main'
     and a.vigente_hasta is null
     and i.estado = 'activa';
$$;
revoke all on function public.respaldo_identidades() from public, anon, authenticated;
grant execute on function public.respaldo_identidades() to service_role;
notify pgrst, 'reload schema';
select 'pares expuestos: ' || count(*) from public.respaldo_identidades();
-- El programador ya no reserva el lote por su cuenta: el dueño del tramo es el
-- handler de Vercel. pg_cron queda como respaldo del disparo, llamando al
-- endpoint por HTTPS con el mismo CRON_SECRET. Se deja INACTIVO hasta que exista
-- la URL, para no dejar un job que falla todas las noches.

select cron.unschedule('respaldo-osiris-staging-diario');
drop function if exists public.respaldo_cron_tick();

create or replace function public.respaldo_disparar(p_url text, p_secreto text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response;
begin
  select * into r from extensions.http((
    'GET', p_url, array[extensions.http_header('Authorization','Bearer '||p_secreto)], null, null)::extensions.http_request);
  insert into public.respaldo_disparo(lote_id, resultado, backend_pid, cliente_ip, usuario, aplicacion)
  values ('http', 'HTTP '||r.status, pg_backend_pid(), inet_client_addr()::text, current_user,
          current_setting('application_name', true));
  return 'HTTP ' || r.status;
end $$;
revoke all on function public.respaldo_disparar(text,text) from public, anon, authenticated;

select 'extension http: ' || (case when exists(select 1 from pg_extension where extname='http') then 'instalada' else 'NO' end);
select 'jobs vigentes: ' || coalesce(string_agg(jobname||' ('||schedule||')', ', '), 'ninguno') from cron.job;
select 'salud: ' || veredicto from public.respaldo_salud;
