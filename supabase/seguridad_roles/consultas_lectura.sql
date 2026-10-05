-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD — ROLES Y EMPRESAS. Consultas de SOLO LECTURA. Código: S.
-- Tema separado del PR de Créditos/Nóminas. No modifica nada.
-- No muestran correos, claves ni contenido: solo conteos, nombres de
-- objetos y código de funciones/políticas.
--
-- Dónde: Supabase → proyecto mediterra-calendario → SQL Editor → "+".
-- Pegar UN bloque (S1, S2…), Run, Export → Copy as JSON, y enviar con su código.
-- Probadas localmente: scripts/seguridad-roles/prueba.mjs
-- ─────────────────────────────────────────────────────────────────────────

-- S1. Usuarios de Supabase Auth en este proyecto: cuántos hay, cómo se crearon y
--     si alguno trae en sus metadatos claves que parezcan de autorización
--     (empresa, rol). Solo conteos. Los metadatos de usuario (user_metadata)
--     los puede editar el propio usuario: no deben decidir permisos.
select count(*)                                                        as usuarios,
       count(*) filter (where email_confirmed_at is not null)          as con_correo_confirmado,
       count(*) filter (where is_anonymous)                            as anonimos,
       count(*) filter (where created_at > now() - interval '30 days') as creados_ult_30_dias,
       count(*) filter (where last_sign_in_at > now() - interval '30 days') as con_ingreso_ult_30_dias,
       count(*) filter (where raw_user_meta_data ?| array['empresa_id','empresa','osiris_rol','rol','role']) as user_metadata_con_claves_de_permiso,
       count(*) filter (where raw_app_meta_data  ?| array['empresa_id','empresa','osiris_rol','rol'])        as app_metadata_con_claves_de_permiso
from auth.users;

-- S2. Proveedores con que se registraron (correo, magic link, Google…): solo conteo.
select provider as proveedor, count(*) as identidades
from auth.identities
group by 1 order by 2 desc;

-- S3. Funciones que leen o fabrican "claims" del JWT o que parecen ganchos de
--     autenticación (custom access token hook): su código. osi_current_empresa y
--     osi_current_rol confían en los claims empresa_id / osiris_rol; hay que saber
--     de dónde salen.
select n.nspname as esquema, p.proname as funcion, p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as codigo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'graphql', 'graphql_public', 'extensions', 'pgsodium', 'vault', 'net', 'supabase_functions', 'cron', 'pgbouncer')
  and p.prokind = 'f'
  and (p.prosrc ~* 'claims|jwt' or p.proname ~* 'hook|claim|token')
order by 1, 2;

-- S4. Quién tiene acceso hoy por cada mecanismo (solo conteos, sin identidades).
select 'osi_user_empresa (activos)'      as mecanismo, count(*) filter (where activo) as filas from public.osi_user_empresa
union all select 'user_osiris_accounts (activos)', count(*) filter (where activo) from public.user_osiris_accounts
union all select 'rbac_usuarios_roles (activos)',  count(*) filter (where activo and deleted_at is null) from public.rbac_usuarios_roles
union all select 'usuarios_empresa (activos)',     count(*) filter (where activo) from public.usuarios_empresa;

-- S5. Barrido amplio: TODA tabla de los esquemas publicados con RLS apagado en la
--     que la llave pública pueda escribir (otros "rbac_usuarios_roles" posibles).
select n.nspname as esquema, c.relname as tabla, c.relrowsecurity as rls_activo,
       has_table_privilege('anon', c.oid, 'select') as anon_lee,
       has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') as anon_escribe,
       has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete') as authenticated_escribe
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'graphql_public') and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by 1, 2;

-- S6. Políticas que dejan pasar a la llave pública SIN condición (USING true o
--     WITH CHECK true) en operaciones de escritura, fuera de calendario_data (ya revisada).
select tablename as tabla, policyname as politica, cmd as operacion, roles, qual as usando, with_check as al_escribir
from pg_policies
where schemaname = 'public' and tablename <> 'calendario_data'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (roles && array['anon', 'authenticated', 'public']::name[])
  and (coalesce(qual, '') ~* '^\(?true\)?$' or coalesce(with_check, '') ~* '^\(?true\)?$')
order by 1, 2;

-- S7. Permisos por defecto: qué reciben anon/authenticated en cada tabla NUEVA
--     que se cree en public (si es "todo", el problema se repite en cada tabla nueva).
select pg_get_userbyid(d.defaclrole) as creador, n.nspname as esquema,
       case d.defaclobjtype when 'r' then 'tablas' when 'f' then 'funciones' when 'S' then 'secuencias' else d.defaclobjtype::text end as objeto,
       d.defaclacl::text as permisos_por_defecto
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' or d.defaclnamespace = 0
order by 1, 2, 3;
