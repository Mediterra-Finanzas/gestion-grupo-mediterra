-- ─────────────────────────────────────────────────────────────────────────
-- PROPUESTA — NO APLICADA. Requiere autorización explícita del CFO.
-- Tema APARTE de la protección de Nóminas y de la propuesta DELETE.
-- Análisis: docs/revision-consultas-produccion-2026-10-05.md (U1–U8).
-- Prueba local: POSTGREST_BIN=/ruta/postgrest node scripts/nominas-cas/prueba-roles.mjs
--
-- PROBLEMA [Seguro, U1/U2/U8]
--   rbac_roles, rbac_usuarios_roles y usuarios_empresa tienen RLS APAGADO y la
--   llave pública (anon y authenticated) puede leer, crear, modificar, borrar y
--   vaciar. fn_mis_empresas() (SECURITY DEFINER) decide con rbac_usuarios_roles a
--   qué empresas accede un usuario, y de ella dependen las políticas de
--   contab_asientos, contab_asientos_lineas, contab_empresas, contab_plan_cuentas,
--   doc_lotes, cc_campos, cc_cuarteles y audit_log. Quien tenga una sesión
--   (authenticated) puede insertarse una fila "yo → empresa X" y leer/escribir la
--   contabilidad de X. Hoy rbac_usuarios_roles tiene 0 filas (U7).
--
-- QUÉ HACE
--   · Activa RLS en las tres tablas, SIN políticas para anon/authenticated:
--     la llave pública ya no las lee ni las escribe por la API.
--   · Retira a anon y authenticated los permisos de escritura y TRUNCATE
--     (doble barrera). Deja SELECT a authenticated solo en rbac_roles (catálogo)
--     con una política de lectura, por si alguna pantalla lo lista.
--   · Fija search_path en fn_mis_empresas (hoy no lo tiene).
--   fn_mis_empresas sigue funcionando: es SECURITY DEFINER de postgres, dueño de
--   la tabla, y RLS no aplica al dueño (las tablas no tienen FORCE RLS).
--   La administración de roles queda para service_role / SQL Editor
--   (la PARTE 0 muestra que service_role tenga permisos sobre las tablas).
--
-- QUÉ NO HACE
--   No toca las políticas de las tablas contables ni de Osiris, ni los datos.
--
-- PARTES (por separado y en orden): 0 lectura · 1 cambio · 2 verificación · 3 reversión.
-- ─────────────────────────────────────────────────────────────────────────


-- PARTE 0 — FOTO PREVIA (solo lectura). Guardar el resultado: es la base de la reversión.
select c.relname as tabla, c.relrowsecurity as rls_activo,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname
           and g.grantee in ('anon', 'authenticated')) as permisos_llave_publica,
       (select string_agg(privilege_type, ', ' order by privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname
           and g.grantee = 'service_role') as permisos_service_role,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa')
order by 1;
select pg_get_functiondef('public.fn_mis_empresas()'::regprocedure) as fn_mis_empresas_actual;


-- PARTE 1 — EL CAMBIO (una transacción; se aborta si algo no calza).
begin;
do $$
begin
  if (select count(*) from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa')) <> 3 then
    raise exception 'ABORTADO: falta alguna de las tres tablas';
  end if;
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa') and relforcerowsecurity) then
    raise exception 'ABORTADO: alguna tabla tiene FORCE RLS: fn_mis_empresas dejaría de leerla';
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.fn_mis_empresas()'::regprocedure)
     is distinct from (select pg_get_userbyid(relowner) from pg_class where oid = 'public.rbac_usuarios_roles'::regclass) then
    raise exception 'ABORTADO: fn_mis_empresas no pertenece al dueño de rbac_usuarios_roles';
  end if;
end $$;

alter table public.rbac_roles          enable row level security;
alter table public.rbac_usuarios_roles enable row level security;
alter table public.usuarios_empresa    enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.rbac_roles, public.rbac_usuarios_roles, public.usuarios_empresa
  from anon, authenticated;
revoke select on public.rbac_usuarios_roles, public.usuarios_empresa from anon, authenticated;
revoke select on public.rbac_roles from anon;

create policy rbac_roles_lectura on public.rbac_roles for select to authenticated using (true);

alter function public.fn_mis_empresas() set search_path = public, pg_temp;
commit;


-- PARTE 2 — VERIFICACIÓN (solo lectura). Esperado: rls_activo = true en las 3;
-- permisos_llave_publica = solo "authenticated:SELECT" en rbac_roles y vacío en las otras dos.
select c.relname as tabla, c.relrowsecurity as rls_activo,
       (select string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname
           and g.grantee in ('anon', 'authenticated')) as permisos_llave_publica
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa')
order by 1;


-- PARTE 3 — REVERSIÓN (vuelve exactamente a la foto de la PARTE 0 del 2026-10-05:
-- RLS apagado y todos los permisos para anon/authenticated). Solo si hiciera falta.
-- begin;
-- drop policy if exists rbac_roles_lectura on public.rbac_roles;
-- alter table public.rbac_roles          disable row level security;
-- alter table public.rbac_usuarios_roles disable row level security;
-- alter table public.usuarios_empresa    disable row level security;
-- grant select, insert, update, delete, truncate, references, trigger
--   on public.rbac_roles, public.rbac_usuarios_roles, public.usuarios_empresa to anon, authenticated;
-- alter function public.fn_mis_empresas() reset search_path;
-- commit;
