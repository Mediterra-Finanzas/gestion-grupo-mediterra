-- ─────────────────────────────────────────────────────────────────────────
-- RESPALDOS EXISTENTES EN calendario_data — SOLO LECTURA.
-- Ejecutar en Supabase → SQL Editor (como postgres: las políticas RLS ocultan
-- estas filas a la llave pública de la app).
--
-- NO muestra el contenido: nunca selecciona la columna value (los respaldos
-- automáticos auto-v3 copiaban también `main` y `pins`, con credenciales).
-- Solo id, fecha, tamaño y tipo de dato. Cada consulta se puede ejecutar sola.
-- Probada localmente: scripts/nominas-cas/prueba.mjs (caso J).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Detalle: una fila por respaldo, del más reciente al más antiguo.
select id,
       case when id like 'backup%' then 'backup_*'
            else 'main_pre_restore*' end   as tipo,
       updated_at                          as fecha_guardado,
       pg_size_pretty(pg_column_size(value)::bigint) as tamano,
       jsonb_typeof(value)                 as formato
from public.calendario_data
where id like 'backup%' or id like 'main_pre_restore%'
order by updated_at desc nulls last, id;

-- 2. Resumen por tipo: cuántos hay, el primero y el último.
select case when id like 'backup%' then 'backup_*' else 'main_pre_restore*' end as tipo,
       count(*)                                 as cantidad,
       min(updated_at)                          as mas_antiguo,
       max(updated_at)                          as mas_reciente,
       pg_size_pretty(sum(pg_column_size(value))::bigint) as tamano_total
from public.calendario_data
where id like 'backup%' or id like 'main_pre_restore%'
group by 1
order by 1;

-- 3. Qué contiene el respaldo MÁS RECIENTE (solo los nombres de sus claves y
--    el tamaño de cada una; NO el contenido). Sirve para saber si incluye las
--    filas de nóminas y finanzas.
select k as clave, pg_size_pretty(pg_column_size(c.value -> k)::bigint) as tamano
from public.calendario_data c, jsonb_object_keys(c.value) k
where c.id = (select max(id) from public.calendario_data where id like 'backup\_%' and pg_column_size(value) > 1000)
order by k;

-- 4. Si el respaldo más reciente guarda las filas dentro de "tablas": qué filas
--    trae y el tamaño de cada una (sin contenido). Si da 0 filas, usar solo la 3.
select k as fila_respaldada, pg_size_pretty(pg_column_size(c.value -> 'tablas' -> k)::bigint) as tamano
from public.calendario_data c, jsonb_object_keys(case when jsonb_typeof(c.value -> 'tablas') = 'object' then c.value -> 'tablas' else '{}'::jsonb end) k
where c.id = (select max(id) from public.calendario_data where id like 'backup\_%' and pg_column_size(value) > 1000)
order by k;
