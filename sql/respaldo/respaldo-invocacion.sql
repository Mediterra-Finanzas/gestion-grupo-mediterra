-- Registro de CADA invocacion del handler del respaldo, para separar despues cuatro
-- estados que no se deben confundir: Run manual, disparo automatico por horario,
-- restauracion del lote resultante y entrega real del correo de prueba.
-- Append-only: una invocacion registrada no se edita ni se borra.
create table if not exists public.respaldo_invocacion (
  id              bigserial primary key,
  recibido_at     timestamptz not null default now(),
  user_agent      text,
  cron_schedule   text,          -- encabezado x-vercel-cron-schedule, si vino
  vercel_id       text,          -- encabezado x-vercel-id, si vino
  origen_declarado text,         -- 'manual' si la llamada trae ?origen=manual
  lote_id         text,
  estado          text,
  correo_prueba   jsonb          -- resultado del envio de prueba: aceptado/rechazado, sin direcciones
);
alter table public.respaldo_invocacion enable row level security;
alter table public.respaldo_invocacion force row level security;
revoke all on public.respaldo_invocacion from anon, authenticated;
grant select, insert on public.respaldo_invocacion to service_role;
grant usage, select on sequence public.respaldo_invocacion_id_seq to service_role;

create or replace function public.respaldo_invocacion_inmutable() returns trigger language plpgsql as $$
begin raise exception 'respaldo_invocacion es append-only'; end $$;
drop trigger if exists respaldo_invocacion_no_mutar on public.respaldo_invocacion;
create trigger respaldo_invocacion_no_mutar before update or delete on public.respaldo_invocacion
  for each row execute function public.respaldo_invocacion_inmutable();
notify pgrst, 'reload schema';

-- prueba de inmutabilidad dentro de una transaccion que se revierte: no deja filas
do $$
declare v_id bigint; v_ok boolean := false;
begin
  insert into public.respaldo_invocacion(user_agent, origen_declarado, estado) values ('prueba-sql','manual','prueba') returning id into v_id;
  begin
    update public.respaldo_invocacion set estado='alterado' where id=v_id;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALLA: se pudo modificar una invocacion'; end if;
  raise notice 'PASS inmutabilidad: update rechazado';
  raise exception 'revertir_prueba';
exception when others then
  if sqlerrm <> 'revertir_prueba' then raise; end if;
end $$;
select 'respaldo_invocacion lista · filas=' || count(*) from public.respaldo_invocacion;
