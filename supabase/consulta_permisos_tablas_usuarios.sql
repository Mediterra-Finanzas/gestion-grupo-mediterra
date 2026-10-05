-- ─────────────────────────────────────────────────────────────────────────
-- PERMISOS DE LAS TABLAS DE USUARIOS Y ROLES — SOLO LECTURA. Código: U.
-- Tema APARTE: no es parte de la protección de Nóminas ni de la propuesta de
-- retirar DELETE. No modifica nada y NO muestra el contenido de las tablas
-- (ni usuarios, ni correos, ni claves): solo configuración y permisos.
--
-- Dónde: Supabase → proyecto mediterra-calendario → SQL Editor → "+" (consulta
-- nueva). Pegar UN bloque (U1, U2…), Run, y Export → Copy as JSON. Enviar cada
-- resultado con su código.
-- Probada localmente: scripts/nominas-cas/prueba-permisos-usuarios.mjs
-- ─────────────────────────────────────────────────────────────────────────

-- U1. ¿Existe cada tabla, tiene RLS activo/forzado y cuántas filas aproxima?
--     (filas_aprox es la estadística del planificador, no lee los datos)
select t.nombre as tabla,
       c.oid is not null       as existe,
       c.relrowsecurity        as rls_activo,
       c.relforcerowsecurity   as rls_forzado,
       c.reltuples::bigint     as filas_aprox,
       pg_get_userbyid(c.relowner) as dueno
from (values ('osi_auth_rate_limit'), ('osi_user_empresa'), ('rbac_roles'),
             ('rbac_usuarios_roles'), ('user_osiris_accounts'), ('usuarios_empresa')) t(nombre)
left join pg_class c on c.relname = t.nombre and c.relnamespace = 'public'::regnamespace
order by 1;

-- U2. Qué puede hacer la llave pública en cada tabla (anon = sin sesión;
--     authenticated = con sesión). TRUNCATE ignora RLS.
select c.relname as tabla, r.rolname as rol,
       has_table_privilege(r.rolname, c.oid, 'select')   as leer,
       has_table_privilege(r.rolname, c.oid, 'insert')   as crear,
       has_table_privilege(r.rolname, c.oid, 'update')   as modificar,
       has_table_privilege(r.rolname, c.oid, 'delete')   as borrar,
       has_table_privilege(r.rolname, c.oid, 'truncate') as vaciar
from pg_class c
cross join pg_roles r
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('osi_auth_rate_limit', 'osi_user_empresa', 'rbac_roles',
                    'rbac_usuarios_roles', 'user_osiris_accounts', 'usuarios_empresa')
  and r.rolname in ('anon', 'authenticated')
order by 1, 2;

-- U3. Políticas RLS de cada tabla: a quién aplican, para qué operación y con
--     qué condición (la condición es código, no datos).
select tablename as tabla, policyname as politica, permissive, roles, cmd as operacion,
       qual as condicion_usando, with_check as condicion_al_escribir
from pg_policies
where schemaname = 'public'
  and tablename in ('osi_auth_rate_limit', 'osi_user_empresa', 'rbac_roles',
                    'rbac_usuarios_roles', 'user_osiris_accounts', 'usuarios_empresa')
order by 1, 2;

-- U4. Columnas de cada tabla (nombre y tipo; sin valores), para ver si hay
--     columnas sensibles (correo, hash, token) expuestas por U2/U3.
select table_name as tabla, column_name as columna, data_type as tipo
from information_schema.columns
where table_schema = 'public'
  and table_name in ('osi_auth_rate_limit', 'osi_user_empresa', 'rbac_roles',
                     'rbac_usuarios_roles', 'user_osiris_accounts', 'usuarios_empresa')
order by 1, ordinal_position;

-- U5. Funciones que mencionan estas tablas y si la llave pública las puede
--     ejecutar (posibles funciones de apoyo de roles). Es una lista de
--     CANDIDATAS: el código de cada una se pide aparte.
select n.nspname as esquema, p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute')          as anon_ejecuta,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_ejecuta
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prokind in ('f', 'p')
  and p.prosrc ~* '(osi_auth_rate_limit|osi_user_empresa|rbac_roles|rbac_usuarios_roles|user_osiris_accounts|usuarios_empresa)'
order by 1, 2;
