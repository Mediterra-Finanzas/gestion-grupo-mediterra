-- Captura previa de respaldo_snapshot() en gestion-mediterra-staging (nlvfjpwiecgrosjnwwik).
-- Tomada: 2026-09-10T16:02:07.647Z · sha256 de la definición: 407f86465720f593b27bb5b1cd9672208575a654fcbaa22ba6178c545d20bbcc
-- Dueño: postgres · lenguaje: sql · volatilidad: s · security definer: true
-- Configuración: ["search_path=public"] · ACL: {postgres=X/postgres,service_role=X/postgres}
-- Privilegios efectivos: {"public":false,"anon":false,"authenticated":false,"service_role":true}
-- Recuperación: ejecutar este archivo en staging. Devuelve la definición y la ACL anteriores.
-- La ACL se reconstruye desde la línea anterior; revisar contra la ACL capturada antes de ejecutar.

CREATE OR REPLACE FUNCTION public.respaldo_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'tomado_at', now(),
    'filas', coalesce((select count(*) from public.calendario_data), 0),
    'datos', coalesce((select jsonb_agg(jsonb_build_object(
                'id', d.id, 'value', d.value,
                'updated_at', to_char(d.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
              order by d.id) from public.calendario_data d), '[]'::jsonb)
  );
$function$;

revoke all on function public.respaldo_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.respaldo_snapshot() to postgres;
grant execute on function public.respaldo_snapshot() to service_role;
notify pgrst, 'reload schema';
