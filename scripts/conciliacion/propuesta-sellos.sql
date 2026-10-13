-- ─────────────────────────────────────────────────────────────────────────
-- PROPUESTA — NO APLICADA. Requiere autorización explícita del CFO.
--
-- PROBLEMA QUE RESUELVE
--   Una pestaña abierta con datos ANTIGUOS (cargados antes de aplicar la
--   conciliación) puede volver a guardar y deshacer lo aplicado. Las nóminas se
--   guardan hoy con upsert SIN condición (la fila completa, gana el último), así
--   que la escritura condicionada del script no las protege después de aplicar.
--   Cerrar la app y repetir el ensayo reduce el riesgo, pero no lo impide.
--
-- MECANISMO: "sellos"
--   Por cada operación aplicada, el script registra un sello: fila + ruta
--   SQL/JSON (jsonpath) + condición ("existe", "igual" a un valor o "ausente").
--   Un trigger en calendario_data RECHAZA cualquier UPDATE (incluidos los
--   upsert) que haga pasar un sello vigente de cumplido a no cumplido, es decir,
--   que DESHAGA un dato aplicado. Todo lo demás de la fila se guarda normal.
--     · Un sello es inerte hasta que la fila tiene el dato: por eso el script
--       los crea ANTES de escribir; si la escritura no ocurre, los levanta.
--     · Funciona con la app tal como está hoy (y con pestañas que tengan una
--       versión vieja del código cargada): no requiere cambios en el navegador.
--     · La pestaña antigua recibe un error HTTP 400 "MEDITERRA_SELLO…". La app
--       (rama del PR) lo muestra: "No se guardó: tus datos están
--       desactualizados", conserva la edición y pide recargar. Una sesión al
--       día (recargada) guarda normal. Con el código de producción ACTUAL el
--       error no se muestra (guardado "dispara y olvida").
--     · Un cambio LEGÍTIMO que deshaga un dato sellado (p. ej. desvincular una
--       línea vinculada por la conciliación) también se rechaza mientras el
--       sello esté vigente. Anular un pago aplicado SÍ se puede (el sello de un
--       pago agregado exige que el pago exista, no que esté vigente).
--     · Vigencia: hasta vence_en (el script usa 30 días) o hasta levantarlo.
--       EL VENCIMIENTO NO ES UNA SOLUCIÓN PERMANENTE: al vencer o levantarse un
--       sello, una pestaña que siga abierta con datos anteriores a la
--       conciliación puede volver a sobrescribir lo conciliado, porque las
--       nóminas se siguen guardando sin condición. Lo permanente sería que la
--       escritura de nóminas sea condicionada a la versión leída (cambio en la
--       app, no hecho ni autorizado).
--
-- PERMISOS
--   La tabla de sellos queda SIN acceso para anon/authenticated (la llave
--   pública de la app no puede crearlos ni levantarlos); solo service_role. El
--   trigger corre como dueño de la función (security definer) para leerla.
--   Con RLS hoy desactivado en calendario_data, esto protege contra sesiones
--   antiguas (accidente), no contra alguien que actúe de mala fe con la llave.
--
-- REVERSIÓN (al final del archivo).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.calendario_data_sellos (
  id                    text primary key,
  fila                  text not null,
  ruta                  jsonpath not null,
  modo                  text not null check (modo in ('existe', 'igual', 'ausente')),
  valor                 jsonb,
  operacion             text not null,
  conciliacion          text not null,          -- SHA-256 del resultado aplicado
  creado_en             timestamptz not null default clock_timestamp(),
  creado_por            text,
  vence_en              timestamptz not null,
  levantado_en          timestamptz,
  levantado_por         text,
  motivo_levantamiento  text
);
create index if not exists calendario_data_sellos_vigentes
  on public.calendario_data_sellos (fila) where levantado_en is null;

revoke all on public.calendario_data_sellos from public;
revoke all on public.calendario_data_sellos from anon, authenticated;
grant select, insert, update on public.calendario_data_sellos to service_role;

-- value puede venir como objeto jsonb o como TEXTO JSON dentro del jsonb (así se
-- guardan hoy las nóminas): se normaliza antes de evaluar la ruta.
create or replace function public.calendario_data_json(v jsonb)
returns jsonb
language plpgsql immutable
as $$
begin
  if jsonb_typeof(v) = 'string' then
    begin
      return (v #>> '{}')::jsonb;
    exception when others then
      return null;
    end;
  end if;
  return v;
end
$$;

create or replace function public.calendario_data_respetar_sellos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  vo jsonb := public.calendario_data_json(old.value);
  vn jsonb := public.calendario_data_json(new.value);
  antes boolean;
  despues boolean;
begin
  for s in
    select * from public.calendario_data_sellos
     where fila = new.id and levantado_en is null and vence_en > clock_timestamp()
  loop
    if s.modo = 'existe' then
      antes   := coalesce(jsonb_path_exists(vo, s.ruta), false);
      despues := coalesce(jsonb_path_exists(vn, s.ruta), false);
    elsif s.modo = 'ausente' then
      antes   := not coalesce(jsonb_path_exists(vo, s.ruta), false);
      despues := not coalesce(jsonb_path_exists(vn, s.ruta), false);
    else
      antes   := jsonb_path_query_first(vo, s.ruta) is not distinct from s.valor;
      despues := jsonb_path_query_first(vn, s.ruta) is not distinct from s.valor;
    end if;
    if antes and not despues then
      raise exception 'MEDITERRA_SELLO: esta escritura deshace un dato aplicado por la conciliación (fila %, operación %). Recarga la página: tus datos están desactualizados.', new.id, s.operacion
        using errcode = 'P0001',
              hint = 'Protección contra sesiones con datos antiguos. Para cambiar este dato a propósito, primero hay que levantar el sello.';
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists calendario_data_respetar_sellos on public.calendario_data;
create trigger calendario_data_respetar_sellos
before update on public.calendario_data
for each row execute function public.calendario_data_respetar_sellos();

-- Que la API (PostgREST) vea la tabla nueva sin esperar. En Supabase es inocuo.
notify pgrst, 'reload schema';

-- ── Consultas útiles (solo lectura / administración) ─────────────────────
-- Sellos vigentes de una conciliación:
--   select id, fila, operacion, modo, vence_en from public.calendario_data_sellos
--    where conciliacion = '<sha256>' and levantado_en is null;
-- Levantar los sellos de una conciliación (deja constancia de quién y por qué):
--   update public.calendario_data_sellos
--      set levantado_en = now(), levantado_por = '<nombre>', motivo_levantamiento = '<motivo>'
--    where conciliacion = '<sha256>' and levantado_en is null;
--
-- ── REVERSIÓN ─────────────────────────────────────────────────────────────
--   drop trigger if exists calendario_data_respetar_sellos on public.calendario_data;
--   drop function if exists public.calendario_data_respetar_sellos();
--   drop function if exists public.calendario_data_json(jsonb);
--   -- la tabla puede conservarse como registro; para eliminarla:
--   -- drop table if exists public.calendario_data_sellos;
