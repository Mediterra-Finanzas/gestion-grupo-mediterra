-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA — NO APLICADA. Retirar el permiso de BORRAR filas de
-- public.calendario_data a la llave pública (roles anon y authenticated).
-- Requiere autorización explícita del CFO. Documento: docs/seguridad-quitar-delete-anon.md
--
-- Estado verificado en producción (consultas de solo lectura, 2026-10-01/02):
--   · RLS ACTIVO en calendario_data (no forzado).
--   · Política cd_anon_auth_delete: FOR DELETE TO authenticated, anon
--       USING ((id !~~ 'backup%') AND (id !~~ 'main_pre_restore%'))
--     → con la llave pública se puede borrar CUALQUIER fila salvo backup* y
--       main_pre_restore*, incluso todas a la vez (DELETE …?id=neq.x).
--   · cd_service_all: FOR ALL TO service_role → no se toca.
--   · El código de la app NO borra filas de calendario_data (ver el documento).
--
-- El archivo tiene 4 partes. Se ejecutan POR SEPARADO, en orden:
--   PARTE 0 — Comprobaciones previas (solo lectura). Guardar los resultados:
--             son la "foto" para revertir.
--   PARTE 1 — El cambio (una transacción; se aborta sola si algo no calza).
--   PARTE 2 — Verificación (solo lectura).
--   PARTE 3 — Reversión (solo si hiciera falta).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 0 — COMPROBACIONES PREVIAS (solo lectura). Ejecutar cada una aparte
-- y guardar el resultado (Export → Copy as JSON).
-- ───────────────────────────────────────────────────────────────────────────

-- 0.1 Políticas completas (definición exacta para poder recrearlas)
select policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'calendario_data'
 order by policyname;

-- 0.2 Permisos de tabla por rol (DELETE y TRUNCATE incluidos)
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'calendario_data'
 order by grantee, privilege_type;

-- 0.3 ¿anon / authenticated heredan permisos de otro rol o saltan RLS?
select r.rolname, r.rolbypassrls, r.rolsuper,
       array(select b.rolname from pg_auth_members m join pg_roles b on b.oid = m.roleid
              where m.member = r.oid) as miembro_de
  from pg_roles r
 where r.rolname in ('anon', 'authenticated');

-- 0.4 Vistas construidas sobre calendario_data (una vista "actualizable"
--     podría permitir borrar a través de ella)
select view_schema, view_name
  from information_schema.view_table_usage
 where table_schema = 'public' and table_name = 'calendario_data';

-- 0.5 Funciones que anon puede ejecutar y que mencionan calendario_data.
--     Es una LISTA DE CANDIDATAS para revisar su código, no una confirmación:
--     cada fila que aparezca hay que leerla (0.6) antes de aplicar.
select n.nspname as esquema, p.proname as funcion, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede_ejecutar
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where p.prokind = 'f'
   and n.nspname not in ('pg_catalog', 'information_schema')
   and pg_get_functiondef(p.oid) ilike '%calendario_data%'
 order by 1, 2;

-- 0.6 Código de una función de la lista anterior (reemplazar el nombre)
-- select pg_get_functiondef('public.NOMBRE_FUNCION'::regproc);


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — EL CAMBIO (ejecutar el bloque completo de una vez).
-- Si la política de borrado no es exactamente la verificada, o si después del
-- cambio anon/authenticated conservan DELETE, la transacción se aborta y NO
-- queda nada a medias.
-- ───────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  p record;
begin
  select * into p from pg_policies
   where schemaname = 'public' and tablename = 'calendario_data' and policyname = 'cd_anon_auth_delete';
  if not found then
    raise exception 'ABORTADO: no existe la política cd_anon_auth_delete (el estado no es el verificado).';
  end if;
  if p.cmd <> 'DELETE' or p.permissive <> 'PERMISSIVE'
     or not (p.roles @> array['anon','authenticated']::name[] and array['anon','authenticated']::name[] @> p.roles) then
    raise exception 'ABORTADO: cd_anon_auth_delete no es la verificada (cmd %, permissive %, roles %).', p.cmd, p.permissive, p.roles;
  end if;
end
$$;

-- a) Sin política que lo permita, RLS deniega el borrado a estos roles.
drop policy cd_anon_auth_delete on public.calendario_data;

-- b) Segunda barrera, por si algún día se desactiva RLS (la auditoría de junio
--    lo encontró desactivado): sin el permiso de tabla, el borrado falla con
--    "permission denied". TRUNCATE no pasa por RLS: también se retira.
revoke delete, truncate on public.calendario_data from anon, authenticated;

-- c) Comprobación dentro de la misma transacción.
do $$
begin
  if has_table_privilege('anon', 'public.calendario_data', 'DELETE')
     or has_table_privilege('authenticated', 'public.calendario_data', 'DELETE')
     or has_table_privilege('anon', 'public.calendario_data', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.calendario_data', 'TRUNCATE') then
    raise exception 'ABORTADO: anon/authenticated siguen con DELETE o TRUNCATE (¿heredado de otro rol? ver 0.3).';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendario_data'
              and cmd in ('DELETE', 'ALL') and (roles && array['anon','authenticated','public']::name[])) then
    raise exception 'ABORTADO: queda otra política que permite borrar a anon/authenticated.';
  end if;
  -- Lo que la app SÍ necesita sigue intacto:
  if not (has_table_privilege('anon', 'public.calendario_data', 'SELECT')
      and has_table_privilege('anon', 'public.calendario_data', 'INSERT')
      and has_table_privilege('anon', 'public.calendario_data', 'UPDATE')) then
    raise exception 'ABORTADO: anon perdió SELECT/INSERT/UPDATE (la app dejaría de funcionar).';
  end if;
end
$$;

commit;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — VERIFICACIÓN (solo lectura)
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 Debe dar: anon_delete=false, auth_delete=false, anon_truncate=false,
--     auth_truncate=false, y anon_select/insert/update = true.
select has_table_privilege('anon', 'public.calendario_data', 'DELETE')            as anon_delete,
       has_table_privilege('authenticated', 'public.calendario_data', 'DELETE')   as auth_delete,
       has_table_privilege('anon', 'public.calendario_data', 'TRUNCATE')          as anon_truncate,
       has_table_privilege('authenticated', 'public.calendario_data', 'TRUNCATE') as auth_truncate,
       has_table_privilege('anon', 'public.calendario_data', 'SELECT')            as anon_select,
       has_table_privilege('anon', 'public.calendario_data', 'INSERT')            as anon_insert,
       has_table_privilege('anon', 'public.calendario_data', 'UPDATE')            as anon_update;

-- 2.2 Deben quedar 4 políticas (sin cd_anon_auth_delete)
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'calendario_data'
 order by policyname;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — REVERSIÓN (deja exactamente lo de antes). Comparar con lo
-- guardado en 0.1 y 0.2 antes de ejecutarla. Si 0.2 mostraba que anon o
-- authenticated NO tenían TRUNCATE, quitar "truncate" del grant.
-- ───────────────────────────────────────────────────────────────────────────
-- begin;
-- grant delete, truncate on public.calendario_data to anon, authenticated;
-- create policy cd_anon_auth_delete on public.calendario_data
--   as permissive for delete to authenticated, anon
--   using ((id !~~ 'backup%'::text) and (id !~~ 'main_pre_restore%'::text));
-- commit;
