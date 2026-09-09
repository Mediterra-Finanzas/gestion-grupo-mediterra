create or replace function public.respaldo_cron_tick() returns text
language plpgsql security definer set search_path = public as $$
declare v_lote text; v_ok int; v_res text;
begin
  v_lote := 'auto-' || to_char(now() at time zone 'UTC','YYYYMMDD-HH24MI');
  insert into public.respaldo_lote(lote_id, correlation)
  values (v_lote, gen_random_uuid())
  on conflict (lote_id) do nothing;
  get diagnostics v_ok = row_count;
  v_res := case when v_ok = 1 then 'reservado' else 'ya_existia' end;
  insert into public.respaldo_disparo(lote_id, resultado, backend_pid, cliente_ip, usuario, aplicacion)
  values (v_lote, v_res, pg_backend_pid(), inet_client_addr()::text, current_user,
          current_setting('application_name', true));
  return v_res;
end $$;
select 'funcion corregida · hora servidor UTC ' || to_char(now() at time zone 'UTC','HH24:MI:SS');
-- El veredicto se saca a una funcion pura para poder probar las seis ramas,
-- incluida la rama OK: una alarma que nunca dice OK no es una alarma.
create or replace function public.respaldo_veredicto(
  p_ultimo_ready timestamptz, p_fallidos int, p_colgados int, p_corridas_fallidas int,
  p_ahora timestamptz default now(), p_vence interval default interval '26 hours')
returns text language sql immutable as $$
  select case
    when p_ultimo_ready is null                 then 'ALERTA: nunca hubo un lote publicado'
    when p_ahora - p_ultimo_ready > p_vence     then 'ALERTA: respaldo vencido'
    when p_corridas_fallidas > 0                then 'ALERTA: el programador fallo en las ultimas 24 h'
    when p_fallidos > 0                         then 'ALERTA: lotes FAILED en las ultimas 24 h'
    when p_colgados > 0                         then 'ALERTA: lotes CREATING colgados'
    else 'OK' end $$;

drop view if exists public.respaldo_salud;
create view public.respaldo_salud as
with ult as (select max(listo_at) as ultimo_ready from public.respaldo_lote where estado='READY'),
     fal as (select count(*)::int as fallidos_24h from public.respaldo_lote where estado='FAILED' and creado_at > now() - interval '24 hours'),
     col as (select count(*)::int as colgados from public.respaldo_lote where estado='CREATING' and creado_at < now() - interval '15 minutes'),
     prog as (select count(*) filter (where d.status <> 'succeeded' and d.start_time > now() - interval '24 hours')::int as corridas_fallidas_24h,
                     max(d.start_time) as ultima_corrida
                from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname like 'respaldo-%')
select ult.ultimo_ready,
       round(extract(epoch from (now()-ult.ultimo_ready))/3600.0,2) as horas_desde_ultimo_ready,
       fal.fallidos_24h, col.colgados, prog.corridas_fallidas_24h, prog.ultima_corrida,
       public.respaldo_veredicto(ult.ultimo_ready, fal.fallidos_24h, col.colgados, prog.corridas_fallidas_24h) as veredicto
from ult, fal, col, prog;
revoke all on public.respaldo_salud from anon, authenticated;

-- las seis ramas
with casos(caso, esperado, got) as (values
  ('sano                      ', 'OK',                                                 public.respaldo_veredicto(now()-interval '2 h', 0,0,0)),
  ('nunca hubo lote           ', 'ALERTA: nunca hubo un lote publicado',                public.respaldo_veredicto(null,               0,0,0)),
  ('respaldo vencido 27 h     ', 'ALERTA: respaldo vencido',                            public.respaldo_veredicto(now()-interval '27 h',0,0,0)),
  ('justo dentro de ventana 25', 'OK',                                                  public.respaldo_veredicto(now()-interval '25 h',0,0,0)),
  ('programador fallo         ', 'ALERTA: el programador fallo en las ultimas 24 h',    public.respaldo_veredicto(now()-interval '2 h', 0,0,1)),
  ('lote FAILED               ', 'ALERTA: lotes FAILED en las ultimas 24 h',            public.respaldo_veredicto(now()-interval '2 h', 1,0,0)),
  ('CREATING colgado          ', 'ALERTA: lotes CREATING colgados',                     public.respaldo_veredicto(now()-interval '2 h', 0,1,0))
) select (case when esperado=got then 'PASS ' else 'FALLA' end) || ' ' || caso || ' -> ' || got from casos;
