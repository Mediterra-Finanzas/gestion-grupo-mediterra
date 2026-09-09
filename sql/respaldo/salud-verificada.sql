-- La salud no puede medir el ultimo DISPARO. Un disparo exitoso que sube basura
-- deja la alarma en verde. Se mide el ultimo lote VERIFICADO: descargado,
-- descifrado y restaurado en aislamiento.
drop view if exists public.respaldo_salud;
drop function if exists public.respaldo_veredicto(timestamptz,int,int,int,timestamptz,interval);
drop function if exists public.respaldo_veredicto(timestamptz,int,int,int,timestamptz,timestamptz,interval);
alter table public.respaldo_lote add column if not exists verificado_at timestamptz;
alter table public.respaldo_lote add column if not exists verificacion text;

create or replace function public.respaldo_veredicto(
  p_ultimo_verificado timestamptz, p_fallidos int, p_colgados int, p_corridas_fallidas int,
  p_ultimo_ready timestamptz default null,
  p_ahora timestamptz default now(), p_vence interval default interval '26 hours')
returns text language sql immutable as $$
  select case
    when p_ultimo_verificado is null and p_ultimo_ready is null then 'ALERTA: nunca hubo un lote publicado'
    when p_ultimo_verificado is null                            then 'ALERTA: hay lotes publicados pero ninguno verificado'
    when p_ahora - p_ultimo_verificado > p_vence                then 'ALERTA: respaldo verificado vencido'
    when p_corridas_fallidas > 0                                then 'ALERTA: el programador fallo en las ultimas 24 h'
    when p_fallidos > 0                                         then 'ALERTA: lotes FAILED en las ultimas 24 h'
    when p_colgados > 0                                         then 'ALERTA: lotes CREATING colgados'
    else 'OK' end $$;

drop view if exists public.respaldo_salud;
create view public.respaldo_salud as
with ver as (select max(verificado_at) as ultimo_verificado from public.respaldo_lote
              where estado='READY' and verificado_at is not null),
     ult as (select max(listo_at) as ultimo_ready from public.respaldo_lote where estado='READY'),
     fal as (select count(*)::int as fallidos_24h from public.respaldo_lote where estado='FAILED' and creado_at > now() - interval '24 hours'),
     col as (select count(*)::int as colgados from public.respaldo_lote where estado='CREATING' and creado_at < now() - interval '15 minutes'),
     prog as (select count(*) filter (where d.status <> 'succeeded' and d.start_time > now() - interval '24 hours')::int as corridas_fallidas_24h,
                     max(d.start_time) as ultima_corrida
                from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname like 'respaldo-%')
select ver.ultimo_verificado, ult.ultimo_ready,
       round(extract(epoch from (now()-ver.ultimo_verificado))/3600.0,2) as horas_desde_verificado,
       fal.fallidos_24h, col.colgados, prog.corridas_fallidas_24h, prog.ultima_corrida,
       public.respaldo_veredicto(ver.ultimo_verificado, fal.fallidos_24h, col.colgados, prog.corridas_fallidas_24h, ult.ultimo_ready) as veredicto
from ver, ult, fal, col, prog;
revoke all on public.respaldo_salud from anon, authenticated;

-- las siete ramas, incluida la nueva: publicado pero no verificado
with casos(caso, esperado, got) as (values
 ('sano y verificado         ','OK',
   public.respaldo_veredicto(now()-interval '2 h',0,0,0, now()-interval '2 h')),
 ('nunca hubo lote           ','ALERTA: nunca hubo un lote publicado',
   public.respaldo_veredicto(null,0,0,0, null)),
 ('publicado pero NO verificado','ALERTA: hay lotes publicados pero ninguno verificado',
   public.respaldo_veredicto(null,0,0,0, now()-interval '1 h')),
 ('verificado vencido 27 h   ','ALERTA: respaldo verificado vencido',
   public.respaldo_veredicto(now()-interval '27 h',0,0,0, now()-interval '1 h')),
 ('dentro de ventana 25 h    ','OK',
   public.respaldo_veredicto(now()-interval '25 h',0,0,0, now()-interval '25 h')),
 ('programador fallo         ','ALERTA: el programador fallo en las ultimas 24 h',
   public.respaldo_veredicto(now()-interval '2 h',0,0,1, now()-interval '2 h')),
 ('lote FAILED               ','ALERTA: lotes FAILED en las ultimas 24 h',
   public.respaldo_veredicto(now()-interval '2 h',1,0,0, now()-interval '2 h')),
 ('CREATING colgado          ','ALERTA: lotes CREATING colgados',
   public.respaldo_veredicto(now()-interval '2 h',0,1,0, now()-interval '2 h'))
) select (case when esperado=got then 'PASS ' else 'FALLA' end) || ' ' || caso || ' -> ' || got from casos;
