-- ─────────────────────────────────────────────────────────────────────────
-- REPARTOS SEMANALES POSIBLEMENTE DUPLICADOS — SOLO LECTURA (no escribe nada).
-- Ejecutar en Supabase → SQL Editor. Cada consulta se puede ejecutar sola.
--
-- Contexto: la versión publicada 7492ca1 (13-10-2026, 11:38 UTC), al escribir
-- la PRIMERA semana de un mes, copiaba el valor del mes a una semana inventada
-- y sumaba encima lo escrito:
--   · mes con valor manual M  → { _sem3: M, _semK: escrito }   (S4 + otra)
--   · mes calculado B         → { _sem0: B, _semK: escrito }   (S1 + otra)
-- Antes (c9c5792) un clic en una semana vacía guardaba { _semK: 0 }: mes en 0.
-- No hay fecha por reparto ni respaldo diario desde 2026-09-03 (generador
-- suspendido), así que la consulta lista FIRMAS, no certezas. Nada se corrige
-- sin aprobar el antes y el después de cada fila.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Filas sospechosas: valor actual por semana, total actual, señal y
--    propuesta (qué semana quitar y cómo quedaría el mes).
with f as (
  select case when jsonb_typeof(value::jsonb) = 'string' then (value::jsonb #>> '{}')::jsonb else value::jsonb end as v
  from calendario_data where id = 'finanzas'
), o as (
  select e.key as empresa, c.key as clave, m.key::int as idx, m.value as reparto
  from f
  cross join lateral jsonb_each(coalesce(f.v->'finanzas_real', '{}'::jsonb)) e
  cross join lateral jsonb_each(case when jsonb_typeof(e.value->'_proyOverrides') = 'object' then e.value->'_proyOverrides' else '{}'::jsonb end) c
  cross join lateral jsonb_each(case when jsonb_typeof(c.value) = 'object' then c.value else '{}'::jsonb end) m
  where jsonb_typeof(m.value) = 'object' and m.key ~ '^\d+$'
), s as (
  select empresa, clave, idx, reparto,
         (reparto->>'_sem0')::numeric as s1, (reparto->>'_sem1')::numeric as s2,
         (reparto->>'_sem2')::numeric as s3, (reparto->>'_sem3')::numeric as s4
  from o
), x as (
  select s.*,
         coalesce(s1,0) + coalesce(s2,0) + coalesce(s3,0) + coalesce(s4,0) as total_actual,
         (coalesce(s1,0) <> 0)::int + (coalesce(s2,0) <> 0)::int + (coalesce(s3,0) <> 0)::int + (coalesce(s4,0) <> 0)::int as semanas_con_valor
  from s
)
select empresa, clave as linea,
       to_char(date '2026-04-01' + make_interval(months => idx), 'Mon-YY') as mes, idx,
       s1, s2, s3, s4, total_actual,
       case when semanas_con_valor = 0 then 'mes_en_cero (clic sin escribir, c9c5792)'
            when coalesce(s4,0) <> 0 then 'posible_semilla_manual: S4 = valor mensual anterior?'
            else 'posible_semilla_calculada: S1 = valor calculado?' end as senal,
       case when semanas_con_valor = 0 then 'quitar el reparto (vuelve al mensual o calculado)'
            when coalesce(s4,0) <> 0 then 'quitar S4'
            else 'quitar S1' end as propuesta,
       case when semanas_con_valor = 0 then null
            when coalesce(s4,0) <> 0 then total_actual - s4
            else total_actual - s1 end as total_si_se_aprueba,
       reparto ? '_sinFecha' as tiene_sinfecha_no_publicado
from x
where semanas_con_valor = 0
   or (semanas_con_valor >= 2 and (coalesce(s1,0) <> 0 or coalesce(s4,0) <> 0))
order by empresa, linea, idx;

-- 2. Todos los repartos semanales (para revisar también los no sospechosos).
with f as (
  select case when jsonb_typeof(value::jsonb) = 'string' then (value::jsonb #>> '{}')::jsonb else value::jsonb end as v
  from calendario_data where id = 'finanzas'
)
select e.key as empresa, c.key as linea, m.key::int as idx,
       to_char(date '2026-04-01' + make_interval(months => m.key::int), 'Mon-YY') as mes,
       m.value as reparto
from f
cross join lateral jsonb_each(coalesce(f.v->'finanzas_real', '{}'::jsonb)) e
cross join lateral jsonb_each(case when jsonb_typeof(e.value->'_proyOverrides') = 'object' then e.value->'_proyOverrides' else '{}'::jsonb end) c
cross join lateral jsonb_each(case when jsonb_typeof(c.value) = 'object' then c.value else '{}'::jsonb end) m
where jsonb_typeof(m.value) = 'object' and m.key ~ '^\d+$'
order by 1, 2, 3;

-- 3. Exportar la fila para comparar S1 con el valor CALCULADO del mes (no se
--    puede en SQL: lo hace el motor de la app). Guardar el resultado como
--    archivo JSON y correr:
--      FINANZAS_JSON=<archivo> OUT_DIR=<carpeta> MSYS_NO_PATHCONV=1 CI=true npx react-scripts test \
--        --watchAll=false --testMatch "**/src/__tests__/revisionRepartos.test.js" \
--        --testPathIgnorePatterns "/node_modules/" "/build/"
--    → <carpeta>/repartos-sospechosos.csv (tipo, antes, base calculada, propuesta).
--    El archivo contiene datos financieros reales: no se versiona ni se publica.
select updated_at, value from calendario_data where id = 'finanzas';
