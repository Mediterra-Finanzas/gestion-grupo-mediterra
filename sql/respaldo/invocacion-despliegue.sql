-- Identidad del deployment que ejecutó cada invocación del respaldo.
--
-- Permite confirmar, después de un Run o de un disparo por horario, que corrió
-- exactamente el commit revisado y en el entorno esperado. Los valores vienen de
-- variables de sistema de Vercel (VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_REF,
-- VERCEL_ENV, VERCEL_DEPLOYMENT_ID); ninguno es secreto.
--
-- Solo agrega columnas nulas. No modifica ni borra filas: la tabla sigue siendo
-- append-only por trigger. Debe aplicarse ANTES de desplegar el handler que las
-- escribe; sin ellas, PostgREST rechaza el insert y la invocación queda sin registrar.
alter table public.respaldo_invocacion
  add column if not exists commit_sha    text,
  add column if not exists commit_ref    text,
  add column if not exists vercel_env    text,
  add column if not exists deployment_id text;

-- Mínimo privilegio en las dos funciones auxiliares que hoy tienen EXECUTE para anon
-- y authenticated. service_role conserva respaldo_veredicto porque lee la vista
-- respaldo_salud, y una vista exige EXECUTE sobre sus funciones a quien la consulta.
-- Un trigger no necesita EXECUTE en el momento de dispararse.
revoke execute on function public.respaldo_veredicto(timestamptz, integer, integer, integer, integer, timestamptz, timestamptz, interval)
  from public, anon, authenticated;
grant execute on function public.respaldo_veredicto(timestamptz, integer, integer, integer, integer, timestamptz, timestamptz, interval)
  to service_role;
revoke execute on function public.respaldo_invocacion_inmutable() from public, anon, authenticated;

notify pgrst, 'reload schema';

select 'respaldo_invocacion · columnas=' || string_agg(column_name, ',' order by ordinal_position)
  from information_schema.columns where table_schema = 'public' and table_name = 'respaldo_invocacion';
