#!/usr/bin/env bash
# ============================================================================
# run_rehearsal.sh — Rehearsal LOCAL de MS-G1 y MS-G2 (Temporadas v2).
# SOLO Docker local (container proc_uat, DB efímera ms_reh). NUNCA staging/prod.
#
# Flujo:
#   1) (re)crea DB ms_reh                       6) MS-G2 BEFORE (reproduce gap)
#   2) carga schema mínimo + seed               7) aplica fix real 20_*
#   3) MS-G1 BEFORE (reproduce gap)             8) MS-G2 AFTER (gap cerrado)
#   4) aplica fix real 10_*                      9) resumen X/Y PASS
#   5) MS-G1 AFTER + ROLLBACK + REAPPLY         10) DROP ms_reh
#
# Uso:  bash run_rehearsal.sh
# ============================================================================
set -uo pipefail

CTN="proc_uat"
DB="ms_reh"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V2="$(cd "$HERE/.." && pwd)"     # supabase/temporadas_v2

# psql en la DB de trabajo, fail-closed
psql_db() { docker exec -i "$CTN" psql -v ON_ERROR_STOP=1 -q -U postgres -d "$DB" "$@"; }
run_file() { echo ">>> $(basename "$1")"; psql_db < "$1"; }

echo "== 1) (re)crear DB $DB =="
docker exec -i "$CTN" psql -v ON_ERROR_STOP=1 -U postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
docker exec -i "$CTN" psql -v ON_ERROR_STOP=1 -U postgres -c "CREATE DATABASE $DB;" >/dev/null

echo "== 2) schema mínimo + seed =="
run_file "$HERE/00_min_baseline.sql"

echo "== 3) MS-G1 BEFORE (reproducir gap) =="
run_file "$HERE/10_ms_g1_before.sql"

echo "== 4) aplicar fix real 10_ms_g1_correlativo_temporada_enforce.sql =="
run_file "$V2/10_ms_g1_correlativo_temporada_enforce.sql"

echo "== 5a) MS-G1 AFTER =="
{ echo "SET reh.phase='AFTER';"; cat "$HERE/11_ms_g1_after.sql"; } | psql_db

echo "== 5b) MS-G1 ROLLBACK (reversibilidad) =="
run_file "$HERE/12_ms_g1_rollback.sql"

echo "== 5c) MS-G1 REAPPLY (idempotencia) =="
run_file "$V2/10_ms_g1_correlativo_temporada_enforce.sql"
{ echo "SET reh.phase='REAPPLY';"; cat "$HERE/11_ms_g1_after.sql"; } | psql_db

echo "== 6) MS-G2 BEFORE (reproducir gap) =="
run_file "$HERE/20_ms_g2_before.sql"

echo "== 7) aplicar fix real 20_ms_g2_lifecycle_enforce.sql =="
run_file "$V2/20_ms_g2_lifecycle_enforce.sql"

echo "== 8) MS-G2 AFTER =="
run_file "$HERE/21_ms_g2_after.sql"

echo ""
echo "== 9) RESUMEN =="
docker exec -i "$CTN" psql -U postgres -d "$DB" -c \
"SELECT phase, check_id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, detail FROM reh_res ORDER BY seq;"
docker exec -i "$CTN" psql -U postgres -d "$DB" -tA -c \
"SELECT 'TOTAL: '||count(*) FILTER (WHERE passed)||'/'||count(*)||' PASS'||CASE WHEN count(*) FILTER (WHERE NOT passed)>0 THEN '  <<< HAY FAIL' ELSE '' END FROM reh_res;"

echo ""
echo "== 10) DROP DB $DB =="
docker exec -i "$CTN" psql -U postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
echo "listo."
