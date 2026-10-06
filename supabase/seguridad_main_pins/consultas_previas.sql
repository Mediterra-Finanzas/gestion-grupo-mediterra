-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD main/pins — consultas de SOLO LECTURA antes de activar. Código: M.
-- No modifican nada. No muestran PIN, hashes, correos ni nombres: solo conteos,
-- tipos y nombres de objetos.
-- Dónde: Supabase → proyecto mediterra-calendario → SQL Editor → "+".
-- Pegar UN bloque (M1, M2…), Run, Export → Copy as JSON, y enviar con su código.
-- M1, M4 y M5 se prueban en local (scripts/seguridad-main-pins/prueba-servidor.mjs).
-- ─────────────────────────────────────────────────────────────────────────

-- M1. Forma de las tres filas: tipo de la columna y de cada valor (objeto, arreglo
--     o texto con JSON adentro). El servidor y la recuperación por SQL lo suponen.
select c.id, pg_typeof(c.value)::text as tipo_columna, jsonb_typeof(c.value) as tipo_valor,
       pg_column_size(c.value) as bytes, c.updated_at
from calendario_data c
where c.id in ('main', 'pins', 'usuarios')
order by 1;

-- M2. Realtime: ¿calendario_data está publicada? (si lo está, los cambios de pins/usuarios
--     se difunden a cualquiera suscrito con la llave pública hasta la fase B).
select pubname, schemaname, tablename from pg_publication_tables where tablename = 'calendario_data';

-- M3. Storage: buckets (público o no) y políticas de storage.objects.
select id as bucket, public as publico from storage.buckets order by 1;
select policyname as politica, cmd as operacion, roles, qual as usando, with_check as al_escribir
from pg_policies where schemaname = 'storage' order by 1;

-- M4. Quién quedaría sin acceso con el login del servidor (solo conteos). El servidor
--     NO acepta PIN en texto plano ni correos/nombres repetidos, ni códigos en texto
--     plano sin vencimiento; con corte de credenciales, todo PIN sin sello `ts` debe
--     recuperarse por correo (y quien no tenga correo no puede).
with u as (
  select case jsonb_typeof(value) when 'string' then (value #>> '{}')::jsonb else value end as v
  from calendario_data where id = 'usuarios'
), p as (
  select case jsonb_typeof(value) when 'string' then (value #>> '{}')::jsonb else value end as v
  from calendario_data where id = 'pins'
), us as (
  select e->>'nombre' as nombre, lower(trim(coalesce(e->>'email', ''))) as email,
         coalesce((e->>'desactivado')::boolean, false) as desactivado
  from u, jsonb_array_elements(u.v) e
), cred as (
  select us.*, (p.v -> (us.nombre || '_h')) as h, (p.v -> (us.nombre || '_temp')) as t,
         (p.v ? (us.nombre || '_temp_exp')) as t_exp, (p.v ? (us.nombre || '_tel')) as tel
  from us, p
), hj as (
  select cred.*, case when jsonb_typeof(h) = 'string' and left(h #>> '{}', 1) = '{' then (h #>> '{}')::jsonb
                      when jsonb_typeof(h) = 'object' then h end as hc
  from cred
)
select count(*)                                                                as usuarios,
       count(*) filter (where desactivado)                                     as desactivados,
       count(*) filter (where not desactivado and email = '')                  as activos_sin_correo,
       count(*) filter (where not desactivado and email <> '' and email in (select email from us where email <> '' group by 1 having count(*) > 1)) as activos_correo_repetido,
       count(*) filter (where nombre in (select nombre from us group by 1 having count(*) > 1)) as nombre_repetido,
       count(*) filter (where not desactivado and h is null)                   as activos_sin_h,
       count(*) filter (where not desactivado and h is not null and coalesce(hc->>'pol', '') <> '6dig') as activos_h_sin_6dig,
       count(*) filter (where not desactivado and hc ? 'fecha' and (hc->>'fecha')::date < current_date - 60) as activos_h_vencido,
       count(*) filter (where not desactivado and h is not null and not (hc ? 'ts')) as activos_h_sin_sello_ts,
       count(*) filter (where t is not null and not (jsonb_typeof(t) = 'string' and left(t #>> '{}', 1) = '{') and not t_exp) as temp_plano_sin_vencimiento,
       count(*) filter (where t is not null and jsonb_typeof(t) = 'string' and left(t #>> '{}', 1) = '{') as temp_hasheado,
       count(*) filter (where tel)                                             as con_celular_registrado,
       (select count(*) from p, jsonb_object_keys(p.v) k
         where k not like '%\_h' and k not like '%\_temp' and k not like '%\_hist' and k not like '%\_tel'
           and k not like '%\_temp\_exp' and k not like '%\_epoca') as claves_pin_en_texto_plano
from hj;

-- M5. Infraestructura que el servidor necesita: RPC del rate limit y su tabla.
select (select count(*) from pg_proc where proname = 'frisku_sp_rl_consumir')       as rpc_rate_limit,
       (select count(*) from pg_class where relname = 'frisku_sp_ratelimit')        as tabla_rate_limit,
       (select count(*) from pg_class where relname = 'seg_administradores')        as tabla_admins;

-- M6. (Antes de la fase D) Vistas sobre calendario_data: una vista "actualizable" podría
--     permitir borrar a través de ella aunque la tabla ya no lo permita.
select view_schema, view_name
  from information_schema.view_table_usage
 where table_schema = 'public' and table_name = 'calendario_data';

-- M7. (Antes de la fase D) Funciones que anon puede ejecutar y que mencionan calendario_data.
--     Es una LISTA DE CANDIDATAS: cada una se lee con
--     select pg_get_functiondef('public.NOMBRE'::regproc);  antes de aplicar.
select n.nspname as esquema, p.proname as funcion, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede_ejecutar
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where p.prokind = 'f'
   and n.nspname not in ('pg_catalog', 'information_schema')
   and pg_get_functiondef(p.oid) ilike '%calendario_data%'
 order by 1, 2;

-- M8. Versión de Postgres y privilegios de la llave pública sobre calendario_data. En
--     Postgres 17 existe MAINTAIN (incluido en GRANT ALL); la fase D no lo cuenta ni lo
--     retira. Si aparece, se agrega a la fase D antes de aplicarla.
select current_setting('server_version') as version,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'calendario_data'
           and grantee in ('anon', 'authenticated')) as privilegios_llave_publica;
