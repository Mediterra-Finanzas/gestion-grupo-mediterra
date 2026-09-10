-- Historial de avisos de cobranza (STAGING). Deduplica por clave de envio y deja
-- trazado cada cierre. Sin datos personales: el destinatario se guarda como hash.
create table if not exists public.osiris_aviso_envio (
  clave            text primary key,          -- fecha|destinatario|contrato|concepto|clase, o fecha|cierre|contrato|concepto
  fecha_civil      date        not null,
  destinatario_sha text,
  contrato_id      text,
  concepto         text,
  clase            text,
  tipo             text        not null check (tipo in ('linea','cierre')),
  modo             text        not null check (modo in ('prueba','real')),
  registrado_at    timestamptz not null default now()
);
alter table public.osiris_aviso_envio enable row level security;
alter table public.osiris_aviso_envio force row level security;
revoke all on public.osiris_aviso_envio from anon, authenticated;
grant select, insert on public.osiris_aviso_envio to service_role;
notify pgrst, 'reload schema';
select 'tabla osiris_aviso_envio lista · filas=' || count(*) from public.osiris_aviso_envio;
