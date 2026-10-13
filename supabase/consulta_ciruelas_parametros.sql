-- SOLO LECTURA. Parámetros PROPIOS de ciruelas de Allegria Foods, todas las temporadas.
-- Sirve para ver qué hay cargado antes de publicar la conexión de sus egresos al flujo.
with f as (
  select updated_at,
         case when jsonb_typeof(value::jsonb)='string' then (value::jsonb #>> '{}')::jsonb else value::jsonb end as v
  from calendario_data where id = 'finanzas'
)
select t.key as temporada,
       c->>'kg' as kg, c->>'fob_usd_kg' as fob, c->>'desc_exp_pct' as desc_pct,
       c->>'mat_usd_kg' as mat_usd_kg, c->>'srv_usd_kg' as srv_usd_kg,
       nullif(c->>'mes_liquidacion','') as mes_liq_cliente,
       nullif(c->>'mes_saldo_productor','') as mes_saldo_productor,
       (select string_agg(coalesce(a->>'mes','sin mes')||' '||coalesce(a->>'usd_kg','')||(case when a->>'cerrado'='true' then ' cerrado' else '' end), ' | ')
          from jsonb_array_elements((case when jsonb_typeof(c->'anticipos_cliente')='array' then c->'anticipos_cliente' else '[]'::jsonb end)) a) as anticipos_cliente,
       (select string_agg(coalesce(a->>'mes','sin mes')||' '||coalesce(a->>'usd_kg','')||(case when a->>'cerrado'='true' then ' cerrado' else '' end), ' | ')
          from jsonb_array_elements((case when jsonb_typeof(c->'anticipos_productor')='array' then c->'anticipos_productor' else '[]'::jsonb end)) a) as anticipos_productor,
       (select string_agg(coalesce(d->>'mes','')||' '||coalesce(d->>'pct','')||'%', ' | ')
          from jsonb_array_elements((case when jsonb_typeof(c->'dist_mat')='array' then c->'dist_mat' else '[]'::jsonb end)) d) as dist_mat,
       (select string_agg(coalesce(d->>'mes','')||' '||coalesce(d->>'pct','')||'%', ' | ')
          from jsonb_array_elements((case when jsonb_typeof(c->'dist_srv')='array' then c->'dist_srv' else '[]'::jsonb end)) d) as dist_srv,
       jsonb_array_length((case when jsonb_typeof(c->'programas')='array' then c->'programas' else '[]'::jsonb end)) as n_programas,
       jsonb_array_length((case when jsonb_typeof(c->'saldos_favor')='array' then c->'saldos_favor' else '[]'::jsonb end)) as n_saldos_favor,
       f.updated_at
from f
cross join lateral jsonb_each(coalesce(f.v->'allegria_params','{}'::jsonb)) t
cross join lateral (select t.value->'ciruelas' as c) x
where c is not null and jsonb_typeof(c) = 'object'
  and (coalesce(case when (c->>'kg') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (c->>'kg')::numeric end, 0) <> 0
       or coalesce(case when (c->>'fob_usd_kg') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (c->>'fob_usd_kg')::numeric end, 0) <> 0
       or nullif(c->>'kg','') is not null or nullif(c->>'fob_usd_kg','') is not null
       or jsonb_array_length((case when jsonb_typeof(c->'programas')='array' then c->'programas' else '[]'::jsonb end)) > 0
       or jsonb_array_length((case when jsonb_typeof(c->'anticipos_cliente')='array' then c->'anticipos_cliente' else '[]'::jsonb end)) > 0
       or jsonb_array_length((case when jsonb_typeof(c->'anticipos_productor')='array' then c->'anticipos_productor' else '[]'::jsonb end)) > 0
       or jsonb_array_length((case when jsonb_typeof(c->'dist_mat')='array' then c->'dist_mat' else '[]'::jsonb end)) > 0
       or jsonb_array_length((case when jsonb_typeof(c->'dist_srv')='array' then c->'dist_srv' else '[]'::jsonb end)) > 0)
order by t.key;

-- Para CUANTIFICAR el efecto (costo de fruta, materiales y servicios de ciruelas
-- que antes no llegaban al flujo, por mes): exportar la fila con
--   select updated_at, value from calendario_data where id = 'finanzas';
-- y correr
--   FINANZAS_JSON=<archivo> OUT_DIR=<carpeta> MSYS_NO_PATHCONV=1 CI=true npx react-scripts test \
--     --watchAll=false --testMatch "**/src/__tests__/ciruelasFlujo.test.js" \
--     --testPathIgnorePatterns "/node_modules/" "/build/"
-- → <carpeta>/efecto-ciruelas.csv. El archivo de datos no se versiona.
