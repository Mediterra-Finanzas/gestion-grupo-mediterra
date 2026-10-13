-- ─────────────────────────────────────────────────────────────────────────
-- FOTO DE LAS FILAS DE NÓMINAS — SOLO LECTURA. Para el procedimiento de
-- activación (docs/nominas-activacion.md): comprobar que nadie está guardando
-- (dos fotos iguales con 2 minutos de diferencia) y comparar antes / después.
--
-- No muestra el contenido de las nóminas: por fila, la versión (updated_at),
-- cuántas nóminas tiene, el formato y una huella (md5) del contenido.
-- Probada localmente: scripts/nominas-cas/prueba.mjs (caso L).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Foto por fila.
select id,
       updated_at                                   as version,
       jsonb_typeof(value)                          as formato,
       case when jsonb_typeof(value) = 'string'
            then jsonb_array_length(((value #>> '{}')::jsonb) -> 'nominas') end as cantidad_nominas,
       md5(value::text)                             as huella
from public.calendario_data
where id like 'nominas\_%'
  and id not in ('nominas_v2_done', 'nominas_tipos_doc', 'nominas_correlativos')
  and id not like 'nominas\_respaldo%'
order by id;

-- 2. Resumen en una línea (para comparar dos fotos de un vistazo).
select count(*)                                    as filas,
       max(updated_at)                             as ultima_escritura,
       md5(string_agg(id || ':' || updated_at::text || ':' || md5(value::text), '|' order by id)) as huella_total
from public.calendario_data
where id like 'nominas\_%'
  and id not in ('nominas_v2_done', 'nominas_tipos_doc', 'nominas_correlativos')
  and id not like 'nominas\_respaldo%';

-- 3. Estado de la protección (después de la PARTE 2).
select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'nominas_guardar') as funcion_existe,
       (select tgenabled from pg_trigger where tgrelid = 'public.calendario_data'::regclass
          and tgname = 'trg_nominas_exigir_version') as trigger_estado;   -- 'O' = activo
