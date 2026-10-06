-- =============================================================================
-- Contadores de intentos combinados (D4) — PROPUESTA, NO aplicada en producción.
-- Probada solo en local (scripts/seguridad-main-pins/prueba-intentos.mjs).
-- -----------------------------------------------------------------------------
-- Cuentan FALLOS con demora progresiva y tope, de forma atómica (FOR UPDATE) y
-- compartida por todas las instancias del servidor. Un ingreso correcto libera el
-- contador de su origen. Ningún bloqueo es indefinido: todo bloqueo tiene tope y vence.
-- Los nombres de los contadores llegan ya como HMAC opaco: aquí no hay correos ni IP.
-- Solo service_role (el servidor) puede usar la tabla y las funciones.
-- =============================================================================
begin;

create table if not exists public.seg_intentos (
  bucket          text primary key,
  tipo            text not null,
  fallos          integer not null default 0,
  escalon         integer not null default 0,
  bloqueado_hasta timestamptz,
  ultimo_fallo    timestamptz,
  actualizado     timestamptz not null default now()
);
alter table public.seg_intentos enable row level security;
revoke all on public.seg_intentos from public, anon, authenticated;
grant select, insert, update, delete on public.seg_intentos to service_role;

-- Reserva un intento ANTES de evaluar la credencial (cuenta como fallo provisional; si
-- resulta correcto, el servidor llama a seg_intento_liberar). Con `p_libres` fallos se
-- activa una demora base·2^(escalón−1), con tope `p_tope_seg`. Sin fallos durante
-- `p_reinicio_seg`, el contador vuelve a cero.
create or replace function public.seg_intento_tomar(
  p_bucket text, p_tipo text, p_libres integer, p_base_seg integer, p_tope_seg integer, p_reinicio_seg integer)
returns table (permitido boolean, retry_seg integer, fallos integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.seg_intentos%rowtype;
  v_ahora timestamptz := clock_timestamp();
  v_bloqueo integer;
begin
  if p_bucket is null or length(p_bucket) < 16 or p_libres < 1 or p_base_seg < 1 or p_tope_seg < p_base_seg then
    raise exception 'seg_intento_tomar: parámetros inválidos';
  end if;
  insert into public.seg_intentos (bucket, tipo) values (p_bucket, p_tipo) on conflict (bucket) do nothing;
  select * into r from public.seg_intentos s where s.bucket = p_bucket for update;
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > v_ahora then
    return query select false, greatest(1, ceil(extract(epoch from (r.bloqueado_hasta - v_ahora))))::integer, r.fallos;
    return;
  end if;
  if r.ultimo_fallo is not null and v_ahora - r.ultimo_fallo > make_interval(secs => p_reinicio_seg) then
    r.fallos := 0; r.escalon := 0;
  end if;
  r.fallos := r.fallos + 1;
  if r.fallos >= p_libres then
    r.escalon := r.escalon + 1;
    v_bloqueo := least(p_tope_seg::numeric, p_base_seg::numeric * power(2::numeric, least(r.escalon - 1, 30)))::integer;
    r.bloqueado_hasta := v_ahora + make_interval(secs => v_bloqueo);
  end if;
  update public.seg_intentos s
     set fallos = r.fallos, escalon = r.escalon, bloqueado_hasta = r.bloqueado_hasta,
         ultimo_fallo = v_ahora, actualizado = v_ahora
   where s.bucket = p_bucket;
  return query select true, 0, r.fallos;
end $$;

-- Consulta sin consumir: ¿está bloqueado ahora?
create or replace function public.seg_intento_estado(p_bucket text)
returns table (bloqueado boolean, retry_seg integer, fallos integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(s.bloqueado_hasta > clock_timestamp(), false),
         coalesce(greatest(0, ceil(extract(epoch from (s.bloqueado_hasta - clock_timestamp()))))::integer, 0),
         coalesce(s.fallos, 0)
    from (select 1) uno
    left join public.seg_intentos s on s.bucket = p_bucket;
$$;

-- Libera contadores (ingreso correcto o desbloqueo por un administrador).
create or replace function public.seg_intento_liberar(p_buckets text[])
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from public.seg_intentos where bucket = any (p_buckets);
  get diagnostics n = row_count;
  return n;
end $$;

-- Descuenta el intento provisional de un contador SIN borrar los fallos previos ni el
-- bloqueo vigente (contador por origen K2: un ingreso correcto no debe contar, pero
-- tampoco puede "reiniciar" el contador de quien prueba PINs sobre otras cuentas).
-- Si al descontar el contador queda bajo el umbral, también se deshace la demora que
-- ese mismo intento (correcto) había activado.
create or replace function public.seg_intento_descontar(p_buckets text[], p_libres integer)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  update public.seg_intentos
     set escalon = case when fallos - 1 < p_libres then greatest(0, escalon - 1) else escalon end,
         bloqueado_hasta = case when fallos - 1 < p_libres then null else bloqueado_hasta end,
         fallos = greatest(0, fallos - 1),
         actualizado = clock_timestamp()
   where bucket = any (p_buckets);
  get diagnostics n = row_count;
  return n;
end $$;

-- Limpieza de filas vencidas (opcional, para un cron): no afecta bloqueos vigentes.
create or replace function public.seg_intento_limpiar(p_dias integer default 31)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from public.seg_intentos
   where (bloqueado_hasta is null or bloqueado_hasta < clock_timestamp())
     and coalesce(ultimo_fallo, actualizado) < clock_timestamp() - make_interval(days => p_dias);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.seg_intento_tomar(text, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.seg_intento_estado(text) from public, anon, authenticated;
revoke all on function public.seg_intento_liberar(text[]) from public, anon, authenticated;
revoke all on function public.seg_intento_limpiar(integer) from public, anon, authenticated;
revoke all on function public.seg_intento_descontar(text[], integer) from public, anon, authenticated;
grant execute on function public.seg_intento_descontar(text[], integer) to service_role;
grant execute on function public.seg_intento_tomar(text, text, integer, integer, integer, integer) to service_role;
grant execute on function public.seg_intento_estado(text) to service_role;
grant execute on function public.seg_intento_liberar(text[]) to service_role;
grant execute on function public.seg_intento_limpiar(integer) to service_role;

commit;
