-- ─────────────────────────────────────────────────────────────────────────
-- SOLO LECTURA. Comprueba en Supabase (SQL Editor) que el control de
-- concurrencia del script de conciliación es atómico con la configuración
-- actual de la tabla calendario_data. No modifica nada.
--
-- Qué buscar:
--   1. updated_at existe y es timestamptz (o text): la condición compara su valor.
--   2. Triggers: si hay uno BEFORE UPDATE que fija updated_at, también quedan
--      cubiertas las ediciones hechas fuera de la app. Si no hay ninguno, el
--      control depende de que TODO escritor cambie updated_at (la app lo hace).
--   3. Reglas (RULE): no debe haber reglas que reescriban el UPDATE.
--   4. RLS y permisos: referencia para la auditoría de seguridad.
-- ─────────────────────────────────────────────────────────────────────────
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'calendario_data'
 order by ordinal_position;

select tgname, tgenabled, pg_get_triggerdef(t.oid) as definicion
  from pg_trigger t
 where tgrelid = 'public.calendario_data'::regclass and not tgisinternal;

select rulename, definition
  from pg_rules
 where schemaname = 'public' and tablename = 'calendario_data';

select relrowsecurity as rls_activo, relforcerowsecurity as rls_forzado
  from pg_class where oid = 'public.calendario_data'::regclass;

select polname, polcmd, pg_get_expr(polqual, polrelid) as usando, pg_get_expr(polwithcheck, polrelid) as con_check
  from pg_policy where polrelid = 'public.calendario_data'::regclass;

-- Versiones actuales de las filas que toca la conciliación (para comparar con el ensayo)
select id, updated_at, length(value::text) as bytes
  from public.calendario_data
 where id in ('finanzas', 'maestro_tc') or id like 'nominas\_%'
 order by id;
