-- ═══════════════════════════════════════════════════════════════════
-- OSIRIS · AJUSTES (notas de crédito y anulaciones) con separación de funciones
-- STAGING. No concede la capacidad a nadie: las pruebas crean usuarios y roles
-- sintéticos dentro de una transacción que se revierte.
-- ═══════════════════════════════════════════════════════════════════
--  - Un ajuste se registra y después se resuelve (aprobado o rechazado).
--  - Quien registra no aprueba: ni con dos capacidades, ni con un rol que tenga ambas.
--  - Nada se borra ni se reescribe: el ajuste es inmutable y su historia vive en
--    eventos append-only. Un ajuste equivocado se compensa con otro (revierte_a).
--  - Una nota de crédito exige respaldo documental (ruta + SHA-256).
--  - Una anulación exige motivo, actor y fecha, y queda visible.
--  - Una sola resolución por ajuste, garantizada por índice único (resiste carreras).
-- Capacidades: osiris.ajuste.registrar · osiris.ajuste.aprobar

create table if not exists public.osi_ajuste (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.contab_empresas(id),
  contrato_id      text not null check (length(contrato_id) between 1 and 80),
  concepto         text not null check (concepto in ('contract_fee','royalty_planta','royalty_comercial')),
  factura_ref      text not null check (length(trim(factura_ref)) > 0),
  tipo             text not null check (tipo in ('nota_credito','anulacion')),
  documento        text not null check (length(trim(documento)) > 0),
  respaldo_ruta    text,
  respaldo_sha256  text check (respaldo_sha256 is null or respaldo_sha256 ~ '^[0-9a-f]{64}$'),
  moneda           text not null check (moneda ~ '^[A-Z]{3}$'),
  monto            numeric(14,2) not null check (monto > 0),
  fecha_documento  date not null,
  motivo           text not null check (length(trim(motivo)) >= 5),
  revierte_a       uuid references public.osi_ajuste(id),
  registrado_por   uuid not null references public.iam_usuario(id),
  registrado_at    timestamptz not null default now(),
  constraint osi_ajuste_nc_con_respaldo check (tipo <> 'nota_credito' or (respaldo_ruta is not null and respaldo_sha256 is not null))
);

create table if not exists public.osi_ajuste_evento (
  id         bigserial primary key,
  ajuste_id  uuid not null references public.osi_ajuste(id),
  evento     text not null check (evento in ('registrado','aprobado','rechazado')),
  actor      uuid not null references public.iam_usuario(id),
  motivo     text,
  at         timestamptz not null default now()
);
create unique index if not exists osi_ajuste_una_resolucion on public.osi_ajuste_evento(ajuste_id) where evento in ('aprobado','rechazado');

create or replace function public.osi_ajuste_inmutable() returns trigger language plpgsql as $$
begin raise exception 'osi_ajuste_append_only: % no se modifica ni se borra', tg_table_name; end $$;
drop trigger if exists osi_ajuste_no_mutar on public.osi_ajuste;
create trigger osi_ajuste_no_mutar before update or delete on public.osi_ajuste for each row execute function public.osi_ajuste_inmutable();
drop trigger if exists osi_ajuste_evento_no_mutar on public.osi_ajuste_evento;
create trigger osi_ajuste_evento_no_mutar before update or delete on public.osi_ajuste_evento for each row execute function public.osi_ajuste_inmutable();

alter table public.osi_ajuste enable row level security;  alter table public.osi_ajuste force row level security;
alter table public.osi_ajuste_evento enable row level security;  alter table public.osi_ajuste_evento force row level security;
revoke all on public.osi_ajuste, public.osi_ajuste_evento from public, anon, authenticated;

create or replace view public.osi_ajuste_estado as
select a.*, coalesce(r.evento, 'registrado') as estado, r.actor as resuelto_por, r.at as resuelto_at, r.motivo as motivo_resolucion
  from public.osi_ajuste a
  left join public.osi_ajuste_evento r on r.ajuste_id = a.id and r.evento in ('aprobado','rechazado');
revoke all on public.osi_ajuste_estado from public, anon, authenticated;

create or replace function public.osi_ajuste_registrar(
  p_empresa uuid, p_contrato text, p_concepto text, p_factura text, p_tipo text, p_documento text,
  p_ruta text, p_sha text, p_moneda text, p_monto numeric, p_fecha date, p_motivo text, p_revierte uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_actor uuid := proc_current_iam_user(); v_id uuid;
begin
  if v_actor is null then raise exception 'sin_identidad' using errcode = '42501'; end if;
  if not proc_has_capability(p_empresa, 'osiris.ajuste.registrar') then raise exception 'sin_capacidad_registrar' using errcode = '42501'; end if;
  if p_revierte is not null and not exists (select 1 from osi_ajuste where id = p_revierte and empresa_id = p_empresa and contrato_id = p_contrato)
    then raise exception 'revierte_a_invalido'; end if;
  insert into osi_ajuste(empresa_id, contrato_id, concepto, factura_ref, tipo, documento, respaldo_ruta, respaldo_sha256,
                         moneda, monto, fecha_documento, motivo, revierte_a, registrado_por)
  values (p_empresa, p_contrato, p_concepto, p_factura, p_tipo, p_documento, p_ruta, p_sha, p_moneda, p_monto, p_fecha, p_motivo, p_revierte, v_actor)
  returning id into v_id;
  insert into osi_ajuste_evento(ajuste_id, evento, actor, motivo) values (v_id, 'registrado', v_actor, p_motivo);
  return v_id;
end $$;

create or replace function public.osi_ajuste_resolver(p_ajuste uuid, p_decision text, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare v_actor uuid := proc_current_iam_user(); v_aj osi_ajuste%rowtype;
begin
  if p_decision not in ('aprobado','rechazado') then raise exception 'decision_invalida'; end if;
  if v_actor is null then raise exception 'sin_identidad' using errcode = '42501'; end if;
  select * into v_aj from osi_ajuste where id = p_ajuste;
  if not found then raise exception 'ajuste_inexistente'; end if;
  if not proc_has_capability(v_aj.empresa_id, 'osiris.ajuste.aprobar') then raise exception 'sin_capacidad_aprobar' using errcode = '42501'; end if;
  if v_aj.registrado_por = v_actor then raise exception 'autoaprobacion_prohibida' using errcode = '42501'; end if;
  if p_decision = 'rechazado' and (p_motivo is null or length(trim(p_motivo)) < 5) then raise exception 'motivo_obligatorio'; end if;
  begin
    insert into osi_ajuste_evento(ajuste_id, evento, actor, motivo) values (p_ajuste, p_decision, v_actor, p_motivo);
  exception when unique_violation then raise exception 'ajuste_ya_resuelto';
  end;
  return p_decision;
end $$;

revoke all on function public.osi_ajuste_registrar(uuid,text,text,text,text,text,text,text,text,numeric,date,text,uuid) from public, anon;
revoke all on function public.osi_ajuste_resolver(uuid,text,text) from public, anon;
grant execute on function public.osi_ajuste_registrar(uuid,text,text,text,text,text,text,text,text,numeric,date,text,uuid) to authenticated;
grant execute on function public.osi_ajuste_resolver(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';

