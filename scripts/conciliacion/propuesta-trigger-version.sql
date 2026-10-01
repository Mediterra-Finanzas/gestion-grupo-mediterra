-- ─────────────────────────────────────────────────────────────────────────
-- PROPUESTA — NO APLICADA. Requiere autorización explícita del CFO.
--
-- Cierra el único hueco del control de concurrencia: una edición de
-- calendario_data que no cambie updated_at (p. ej. desde el editor de tablas
-- o el SQL Editor de Supabase) no sería detectada por la escritura
-- condicionada. Con este trigger, el servidor fija updated_at en TODA
-- actualización.
--
-- Compatibilidad (probado en local con Postgres 16 + PostgREST 12, ver
-- scripts/conciliacion/prueba.mjs, escenario 8): los escritores de la app
-- (persistContract, friskuHelpers, Osiris) toman la versión nueva de la
-- respuesta del servidor, no del reloj del navegador, así que siguen
-- funcionando. Las inserciones no se tocan (sigue el valor enviado o el default).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.calendario_data_version()
returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger calendario_data_version
before update on public.calendario_data
for each row execute function public.calendario_data_version();

-- Reversión:
--   drop trigger calendario_data_version on public.calendario_data;
--   drop function public.calendario_data_version();
