-- ─────────────────────────────────────────────────────────────────────────
-- PROPUESTA DE SEGURIDAD — NO APLICADA. Requiere autorización explícita del CFO.
-- Impedir que un usuario se asigne o modifique sus propios roles y empresas.
-- Separada del PR de Créditos/Nóminas. Documento: docs/seguridad-roles-empresas.md
-- Prueba local: POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-roles/prueba.mjs
--
-- MECANISMOS DE AUTORIZACIÓN QUE CUBRE (leídos en producción, U1–U9, 2026-10-05)
--   1. rbac_usuarios_roles → fn_mis_empresas() → políticas de contab_*, doc_lotes,
--      cc_campos, cc_cuarteles, audit_log. HOY: RLS apagado y la llave pública
--      puede escribir → cualquiera con sesión se asigna una empresa. SE CIERRA.
--   2. rbac_roles (catálogo) y usuarios_empresa (sin uso en políticas). HOY:
--      RLS apagado y escritura abierta. SE CIERRAN.
--   3. osi_user_empresa → osi_current_empresa()/osi_current_rol() → políticas osi_*.
--      HOY: RLS activo con solo lectura de la propia fila: un usuario NO puede
--      asignarse (ya protegido). Se retiran igual los permisos de escritura a la
--      llave pública como segunda barrera (si mañana alguien agrega una política
--      amplia, no se abriría).
--   4. user_osiris_accounts (habilita el ingreso a Osiris; la lee la Edge Function
--      con service_role). HOY: RLS activo sin políticas (protegido). Se retiran
--      los permisos de la llave pública como segunda barrera.
--   5. Claims del JWT (empresa_id / osiris_rol) que leen osi_current_*: NO se tocan
--      aquí. Dependen de quién los emite (consulta S3 y Auth → Hooks); ver documento.
--   6. Registro abierto en Supabase Auth: configuración de consola, no SQL; ver documento.
--
-- "ADMINISTRADOR" = identidad autorizada por el SERVIDOR: la llave service_role (solo
-- en Vercel/Edge Functions) o el SQL Editor (postgres). NUNCA el campo rol de
-- main.usuarios (editable hoy con la llave pública) ni user_metadata (editable por el
-- propio usuario). Ver docs/seguridad-roles-empresas.md.
--
-- QUIÉN MANTIENE SU ACCESO
--   · Lo asignado por el administrador (service_role / SQL Editor) sigue igual.
--   · fn_mis_empresas, osi_current_empresa y osi_current_rol son SECURITY DEFINER de
--     postgres, dueño de las tablas: RLS no les aplica (no hay FORCE RLS), así que
--     siguen leyendo todas las asignaciones.
--   · Cada usuario con sesión puede seguir leyendo SUS PROPIAS filas de
--     rbac_usuarios_roles y osi_user_empresa, y el catálogo rbac_roles.
--
-- PARTES (por separado y en orden): 0 lectura · 1 cambio · 2 verificación · 3 reversión.
-- ─────────────────────────────────────────────────────────────────────────


-- PARTE 0 — FOTO PREVIA (solo lectura). Guardar el resultado (Export → JSON):
-- es la referencia exacta para la reversión.
select c.relname as tabla, c.relrowsecurity as rls_activo, c.relforcerowsecurity as rls_forzado,
       pg_get_userbyid(c.relowner) as dueno,
       (select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname
           and g.grantee in ('anon', 'authenticated', 'service_role')) as permisos,
       (select string_agg(p.policyname || ' [' || p.cmd || ' ' || array_to_string(p.roles, ',') || ']', '; ' order by p.policyname)
          from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa',
                    'osi_user_empresa', 'user_osiris_accounts', 'osi_auth_rate_limit')
order by 1;
select p.proname as funcion, pg_get_userbyid(p.proowner) as dueno, p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '') as configuracion,
       array_to_string(p.proacl, ', ') as permisos_ejecucion
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('fn_mis_empresas', 'osi_current_empresa', 'osi_current_rol')
order by 1;


-- PARTE 1 — EL CAMBIO (una sola transacción; se aborta si algo no calza).
begin;
do $$
declare t text;
begin
  foreach t in array array['rbac_roles','rbac_usuarios_roles','usuarios_empresa','osi_user_empresa','user_osiris_accounts','osi_auth_rate_limit'] loop
    if not exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = t) then
      raise exception 'ABORTADO: falta la tabla %', t;
    end if;
    if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = t and relforcerowsecurity) then
      raise exception 'ABORTADO: % tiene FORCE RLS (las funciones de autorización dejarían de leerla)', t;
    end if;
    if not has_table_privilege('service_role', ('public.' || t)::regclass, 'insert') then
      raise exception 'ABORTADO: service_role no puede escribir %: el administrador perdería la forma de asignar', t;
    end if;
  end loop;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.fn_mis_empresas()'::regprocedure)
     is distinct from (select pg_get_userbyid(relowner) from pg_class where oid = 'public.rbac_usuarios_roles'::regclass) then
    raise exception 'ABORTADO: fn_mis_empresas no pertenece al dueño de rbac_usuarios_roles';
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.osi_current_empresa()'::regprocedure)
     is distinct from (select pg_get_userbyid(relowner) from pg_class where oid = 'public.osi_user_empresa'::regclass) then
    raise exception 'ABORTADO: osi_current_empresa no pertenece al dueño de osi_user_empresa';
  end if;
end $$;

-- 1. rbac_usuarios_roles: nadie con la llave pública escribe; cada uno ve solo lo suyo.
alter table public.rbac_usuarios_roles enable row level security;
revoke all on public.rbac_usuarios_roles from anon, authenticated;
grant select on public.rbac_usuarios_roles to authenticated;
create policy rbac_ur_propias on public.rbac_usuarios_roles
  for select to authenticated using (usuario_id = auth.uid());

-- 2. rbac_roles: catálogo de solo lectura para usuarios con sesión.
alter table public.rbac_roles enable row level security;
revoke all on public.rbac_roles from anon, authenticated;
grant select on public.rbac_roles to authenticated;
create policy rbac_roles_lectura on public.rbac_roles
  for select to authenticated using (true);

-- 3. usuarios_empresa: sin uso en políticas ni en la app → cerrada a la llave pública.
alter table public.usuarios_empresa enable row level security;
revoke all on public.usuarios_empresa from anon, authenticated;

-- 4. osi_user_empresa: ya protegida por RLS; se quita la escritura (segunda barrera).
--    Se conserva SELECT + la política existente pol_ue_sel (propia fila).
revoke insert, update, delete, truncate, references, trigger on public.osi_user_empresa from anon, authenticated;
revoke select on public.osi_user_empresa from anon;

-- 5. user_osiris_accounts y osi_auth_rate_limit: solo service_role (Edge Function).
revoke all on public.user_osiris_accounts, public.osi_auth_rate_limit from anon, authenticated;

-- 6. fn_mis_empresas: search_path fijo y solo para usuarios con sesión.
alter function public.fn_mis_empresas() set search_path = public, pg_temp;
revoke execute on function public.fn_mis_empresas() from public, anon;
grant execute on function public.fn_mis_empresas() to authenticated, service_role;
commit;


-- PARTE 2 — VERIFICACIÓN (solo lectura). Esperado:
--   rbac_roles            RLS t · authenticated:SELECT
--   rbac_usuarios_roles   RLS t · authenticated:SELECT
--   usuarios_empresa      RLS t · (sin permisos de la llave pública)
--   osi_user_empresa      RLS t · authenticated:SELECT
--   user_osiris_accounts  RLS t · (sin permisos de la llave pública)
--   osi_auth_rate_limit   RLS t · (sin permisos de la llave pública)
select c.relname as tabla, c.relrowsecurity as rls_activo,
       coalesce((select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema = 'public' and g.table_name = c.relname
           and g.grantee in ('anon', 'authenticated')), '(sin permisos de la llave pública)') as permisos_llave_publica
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('rbac_roles', 'rbac_usuarios_roles', 'usuarios_empresa',
                    'osi_user_empresa', 'user_osiris_accounts', 'osi_auth_rate_limit')
order by 1;


-- PARTE 3 — REVERSIÓN (deja los permisos como se leyeron el 2026-10-05 en U1/U2).
-- Antes de usarla, comparar con la PARTE 0 guardada: si REFERENCES/TRIGGER u
-- otro permiso difiere, ajustar a lo que diga la foto. Solo si hiciera falta.
-- begin;
-- drop policy if exists rbac_ur_propias on public.rbac_usuarios_roles;
-- drop policy if exists rbac_roles_lectura on public.rbac_roles;
-- alter table public.rbac_usuarios_roles disable row level security;
-- alter table public.rbac_roles disable row level security;
-- alter table public.usuarios_empresa disable row level security;
-- grant all on public.rbac_usuarios_roles, public.rbac_roles, public.usuarios_empresa to anon, authenticated;
-- grant select, insert, update, delete on public.osi_user_empresa to authenticated;
-- grant select, insert, update, delete on public.user_osiris_accounts to authenticated;
-- alter function public.fn_mis_empresas() reset search_path;
-- grant execute on function public.fn_mis_empresas() to public, anon;
-- commit;
