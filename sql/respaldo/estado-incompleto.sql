-- Un lote con credenciales sin dueño no es un respaldo fallido ni un respaldo
-- bueno: es EVIDENCIA INCOMPLETA. Los bytes cifrados existen y sirven para una
-- recuperación manual, pero nadie debe restaurar desde ahí, y la salud no puede
-- contarlo como respaldo recuperable. Por eso tiene estado propio.
alter table public.respaldo_lote drop constraint if exists respaldo_lote_estado_check;
alter table public.respaldo_lote add constraint respaldo_lote_estado_check
  check (estado in ('CREATING','READY','FAILED','INCOMPLETO'));

create or replace function public.respaldo_marcar(p_lote text, p_estado text, p_verificacion text default null)
returns void language sql security definer set search_path = public as $$
  update public.respaldo_lote
     set estado = case when p_estado in ('FAILED','INCOMPLETO') then p_estado else estado end,
         verificado_at = case when p_estado='VERIFICADO' then now() else verificado_at end,
         verificacion = coalesce(p_verificacion, verificacion)
   where lote_id = p_lote;
$$;
revoke all on function public.respaldo_marcar(text,text,text) from public, anon, authenticated;
grant execute on function public.respaldo_marcar(text,text,text) to service_role;

drop view if exists public.respaldo_salud;
drop function if exists public.respaldo_veredicto(timestamptz,int,int,int,timestamptz,timestamptz,interval);

create or replace function public.respaldo_veredicto(
  p_ultimo_verificado timestamptz, p_fallidos int, p_colgados int, p_corridas_fallidas int,
  p_incompletos int default 0, p_ultimo_ready timestamptz default null,
  p_ahora timestamptz default now(), p_vence interval default interval '26 hours')
returns text language sql immutable as $$
  select case
    when p_ultimo_verificado is null and p_ultimo_ready is null then 'ALERTA: nunca hubo un lote publicado'
    when p_ultimo_verificado is null                            then 'ALERTA: hay lotes publicados pero ninguno verificado'
    when p_ahora - p_ultimo_verificado > p_vence                then 'ALERTA: respaldo verificado vencido'
    -- Un lote incompleto manda por sobre un FAILED comun: dice que hay
    -- credenciales que hoy no se pueden restaurar a nadie.
    when p_incompletos > 0                                      then 'ALERTA: evidencia incompleta, credenciales sin identidad'
    when p_corridas_fallidas > 0                                then 'ALERTA: el programador fallo en las ultimas 24 h'
    when p_fallidos > 0                                         then 'ALERTA: lotes FAILED en las ultimas 24 h'
    when p_colgados > 0                                         then 'ALERTA: lotes CREATING colgados'
    else 'OK' end $$;

create view public.respaldo_salud as
with ver as (select max(verificado_at) as ultimo_verificado from public.respaldo_lote
              where estado='READY' and verificado_at is not null),
     ult as (select max(listo_at) as ultimo_ready from public.respaldo_lote where estado='READY'),
     fal as (select count(*)::int as fallidos_24h from public.respaldo_lote
              where estado='FAILED' and creado_at > now() - interval '24 hours'),
     inc as (select count(*)::int as incompletos from public.respaldo_lote where estado='INCOMPLETO'),
     col as (select count(*)::int as colgados from public.respaldo_lote
              where estado='CREATING' and creado_at < now() - interval '15 minutes'),
     prog as (select count(*) filter (where d.status <> 'succeeded' and d.start_time > now() - interval '24 hours')::int as corridas_fallidas_24h,
                     max(d.start_time) as ultima_corrida
                from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname like 'respaldo-%')
select ver.ultimo_verificado, ult.ultimo_ready,
       round(extract(epoch from (now()-ver.ultimo_verificado))/3600.0,2) as horas_desde_verificado,
       fal.fallidos_24h, inc.incompletos, col.colgados, prog.corridas_fallidas_24h, prog.ultima_corrida,
       public.respaldo_veredicto(ver.ultimo_verificado, fal.fallidos_24h, col.colgados,
                                 prog.corridas_fallidas_24h, inc.incompletos, ult.ultimo_ready) as veredicto
from ver, ult, fal, inc, col, prog;
revoke all on public.respaldo_salud from anon, authenticated;
grant select on public.respaldo_salud to service_role;
notify pgrst, 'reload schema';

-- las nueve ramas
with casos(caso, esperado, got) as (values
 ('sano y verificado         ','OK',
   public.respaldo_veredicto(now()-interval '2 h',0,0,0,0, now()-interval '2 h')),
 ('nunca hubo lote           ','ALERTA: nunca hubo un lote publicado',
   public.respaldo_veredicto(null,0,0,0,0, null)),
 ('publicado no verificado   ','ALERTA: hay lotes publicados pero ninguno verificado',
   public.respaldo_veredicto(null,0,0,0,0, now()-interval '1 h')),
 ('verificado vencido 27 h   ','ALERTA: respaldo verificado vencido',
   public.respaldo_veredicto(now()-interval '27 h',0,0,0,0, now()-interval '1 h')),
 ('dentro de ventana 25 h    ','OK',
   public.respaldo_veredicto(now()-interval '25 h',0,0,0,0, now()-interval '25 h')),
 ('evidencia incompleta      ','ALERTA: evidencia incompleta, credenciales sin identidad',
   public.respaldo_veredicto(now()-interval '2 h',0,0,0,1, now()-interval '2 h')),
 ('incompleto manda sobre failed','ALERTA: evidencia incompleta, credenciales sin identidad',
   public.respaldo_veredicto(now()-interval '2 h',3,0,0,1, now()-interval '2 h')),
 ('programador fallo         ','ALERTA: el programador fallo en las ultimas 24 h',
   public.respaldo_veredicto(now()-interval '2 h',0,0,1,0, now()-interval '2 h')),
 ('lote FAILED               ','ALERTA: lotes FAILED en las ultimas 24 h',
   public.respaldo_veredicto(now()-interval '2 h',1,0,0,0, now()-interval '2 h')),
 ('CREATING colgado          ','ALERTA: lotes CREATING colgados',
   public.respaldo_veredicto(now()-interval '2 h',0,1,0,0, now()-interval '2 h'))
) select (case when esperado=got then 'PASS ' else 'FALLA' end) || ' ' || caso || ' -> ' || got from casos;
-- DEFECTO 1: un lote INCOMPLETO no se retomaba nunca. Resuelta la identidad, el
-- reintento chocaba contra el mismo lote y el respaldo quedaba roto para siempre.
create or replace function public.respaldo_reservar(p_lote text, p_correlation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  update public.respaldo_lote
     set intento = intento + 1, tomado_at = now(), correlation = p_correlation, estado = 'CREATING'
   where lote_id = p_lote
     and (estado in ('FAILED','INCOMPLETO')
          or (estado = 'CREATING' and tomado_at < now() - interval '15 minutes'))
  returning intento into v_intento;
  if v_intento is not null then
    return jsonb_build_object('reservado', true, 'intento', v_intento, 'retomado', true);
  end if;
  select estado into v_estado from public.respaldo_lote where lote_id = p_lote;
  return jsonb_build_object('reservado', false, 'estado', v_estado);
end $$;
revoke all on function public.respaldo_reservar(text,uuid) from public, anon, authenticated;
grant execute on function public.respaldo_reservar(text,uuid) to service_role;

-- DEFECTO 2: con evidencia incompleta y ningun READY, la alarma decia "nunca hubo
-- un lote publicado". Es cierto, pero esconde la causa concreta y accionable.
create or replace function public.respaldo_veredicto(
  p_ultimo_verificado timestamptz, p_fallidos int, p_colgados int, p_corridas_fallidas int,
  p_incompletos int default 0, p_ultimo_ready timestamptz default null,
  p_ahora timestamptz default now(), p_vence interval default interval '26 hours')
returns text language sql immutable as $$
  select case
    when p_incompletos > 0                                      then 'ALERTA: evidencia incompleta, credenciales sin identidad'
    when p_ultimo_verificado is null and p_ultimo_ready is null then 'ALERTA: nunca hubo un lote publicado'
    when p_ultimo_verificado is null                            then 'ALERTA: hay lotes publicados pero ninguno verificado'
    when p_ahora - p_ultimo_verificado > p_vence                then 'ALERTA: respaldo verificado vencido'
    when p_corridas_fallidas > 0                                then 'ALERTA: el programador fallo en las ultimas 24 h'
    when p_fallidos > 0                                         then 'ALERTA: lotes FAILED en las ultimas 24 h'
    when p_colgados > 0                                         then 'ALERTA: lotes CREATING colgados'
    else 'OK' end $$;
notify pgrst, 'reload schema';

with casos(caso, esperado, got) as (values
 ('sano y verificado           ','OK', public.respaldo_veredicto(now()-interval '2 h',0,0,0,0, now()-interval '2 h')),
 ('nunca hubo lote             ','ALERTA: nunca hubo un lote publicado', public.respaldo_veredicto(null,0,0,0,0, null)),
 ('nunca hubo lote PERO incompleto','ALERTA: evidencia incompleta, credenciales sin identidad', public.respaldo_veredicto(null,0,0,0,1, null)),
 ('publicado no verificado     ','ALERTA: hay lotes publicados pero ninguno verificado', public.respaldo_veredicto(null,0,0,0,0, now()-interval '1 h')),
 ('verificado vencido 27 h     ','ALERTA: respaldo verificado vencido', public.respaldo_veredicto(now()-interval '27 h',0,0,0,0, now()-interval '1 h')),
 ('dentro de ventana 25 h      ','OK', public.respaldo_veredicto(now()-interval '25 h',0,0,0,0, now()-interval '25 h')),
 ('evidencia incompleta        ','ALERTA: evidencia incompleta, credenciales sin identidad', public.respaldo_veredicto(now()-interval '2 h',0,0,0,1, now()-interval '2 h')),
 ('incompleto manda sobre failed','ALERTA: evidencia incompleta, credenciales sin identidad', public.respaldo_veredicto(now()-interval '2 h',3,0,0,1, now()-interval '2 h')),
 ('programador fallo           ','ALERTA: el programador fallo en las ultimas 24 h', public.respaldo_veredicto(now()-interval '2 h',0,0,1,0, now()-interval '2 h')),
 ('lote FAILED                 ','ALERTA: lotes FAILED en las ultimas 24 h', public.respaldo_veredicto(now()-interval '2 h',1,0,0,0, now()-interval '2 h')),
 ('CREATING colgado            ','ALERTA: lotes CREATING colgados', public.respaldo_veredicto(now()-interval '2 h',0,1,0,0, now()-interval '2 h'))
) select (case when esperado=got then 'PASS ' else 'FALLA' end) || ' ' || caso || ' -> ' || got from casos;
