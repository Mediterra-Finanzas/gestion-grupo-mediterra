-- ─────────────────────────────────────────────────────────────────────────
-- PROPUESTA — NO APLICADA. Requiere autorización explícita del CFO y el
-- resultado previo de verificar-supabase.sql (debe mostrar updated_at de tipo
-- "timestamp with time zone"; si es otro tipo, NO ejecutar: hay que ajustarla).
--
-- QUÉ HACE
--   La versión de cada fila (updated_at) pasa a generarla la BASE, no el
--   navegador:
--     · INSERT  → updated_at = clock_timestamp()
--     · UPDATE  → updated_at = el mayor entre clock_timestamp() y la versión
--                 anterior + 1 microsegundo. Cambia SIEMPRE, aunque el reloj
--                 del servidor retroceda o dos escrituras caigan en el mismo
--                 microsegundo.
--   Se ignora el updated_at que envíe el cliente. Esto incluye los upsert
--   (POST con merge-duplicates), que en Postgres son INSERT … ON CONFLICT DO
--   UPDATE y disparan el trigger de UPDATE.
--
-- ALCANCE: solo la tabla public.calendario_data, todas sus filas (main, pins,
--   finanzas, nóminas, osiris, maestros, backups…). No toca otras tablas ni
--   cambia permisos. No hace nada ante un DELETE.
--
-- POR QUÉ: cierra el hueco de la escritura condicionada. Hoy una edición que no
--   cambia updated_at (editor de tablas o SQL Editor de Supabase, un script
--   externo) no la detecta nadie. Con el trigger, toda actualización cambia la
--   versión y cualquier guardado condicionado posterior basado en la versión
--   anterior se rechaza.
--
-- COMPATIBILIDAD con los guardados actuales (revisado en el código y probado en
-- local con los módulos REALES, scripts/conciliacion/prueba.mjs, escenario T):
--   · persistContract (finanzas, main, pins, allegria, escenarios, tipos de
--     documento de nóminas), friskuHelpers (maestros, Frisku, rendiciones) y
--     Osiris: escriben con PATCH …&updated_at=eq.<versión> y toman la versión
--     NUEVA de la respuesta del servidor (return=representation), nunca de su
--     propio reloj. Con el trigger siguen funcionando; la versión pasa a tener
--     microsegundos y se usa tal cual vuelve.
--   · Upsert sin condición (nóminas, audit_log, respaldo diario, "Restaurar",
--     EEFF): no usan la versión; con el trigger el valor guardado es el del
--     servidor en vez del del navegador.
--   · Tiempo real: entrega el updated_at que quedó guardado (el del servidor).
--   · El proxy /api/db está retirado (responde 410): la app escribe directo.
--
-- REVERSIÓN (deja todo como antes; los updated_at ya guardados quedan como
-- están y siguen sirviendo de versión):
--   drop trigger if exists calendario_data_version on public.calendario_data;
--   drop function if exists public.calendario_data_version();
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.calendario_data_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    new.updated_at := clock_timestamp();
  end if;
  return new;
end
$$;

drop trigger if exists calendario_data_version on public.calendario_data;
create trigger calendario_data_version
before insert or update on public.calendario_data
for each row execute function public.calendario_data_version();

-- Comprobación posterior (solo lectura): debe listar el trigger habilitado ('O').
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.calendario_data'::regclass and not tgisinternal;
