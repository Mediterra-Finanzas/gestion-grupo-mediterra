#!/usr/bin/env bash
# ============================================================================
# smoke_g3_g4.sh — SMOKE de PREPARACIÓN para MS-G3 y MS-G4 (no es certificación
# completa; confirma que los drafts 30_/40_ aplican limpio y que su enforcement
# nuclear funciona). Solo Docker local, DB efímera ms_reh_g34.
#
# Nota: el baseline siembra la temporada '2526' (2025-07-01..2026-06-30) activa,
# así que los rangos de prueba se ubican en una ventana FUTURA que NO la toca.
# ============================================================================
set -uo pipefail
CTN="proc_uat"; DB="ms_reh_g34"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; V2="$(cd "$HERE/.." && pwd)"
ALS="5aa10886-2a76-4a9e-9bc3-303fb776cd49"
q(){ docker exec -i "$CTN" psql -v ON_ERROR_STOP=1 -q -U postgres -d "$DB" "$@"; }
scalar(){ docker exec -i "$CTN" psql -tA -U postgres -d "$DB" -c "$1" | tr -d '[:space:]'; }
PASS=0; FAIL=0
ok(){ echo "  PASS $1"; PASS=$((PASS+1)); }
no(){ echo "  FAIL $1 :: $2"; FAIL=$((FAIL+1)); }

docker exec -i "$CTN" psql -U postgres -c "DROP DATABASE IF EXISTS $DB (FORCE);" >/dev/null 2>&1
docker exec -i "$CTN" psql -U postgres -c "CREATE DATABASE $DB;" >/dev/null
q < "$HERE/00_min_baseline.sql"

echo "== G4: solape preexistente → el PRE-CHECK debe ABORTAR el apply =="
q -c "INSERT INTO proc_temporada(empresa_id,codigo,fecha_inicio,fecha_fin,estado) VALUES
        ('$ALS','SOLAPE-A','2026-07-01','2026-09-30','planificada'),
        ('$ALS','SOLAPE-B','2026-09-30','2026-12-31','planificada');" >/dev/null
OUT="$(q < "$V2/40_ms_g4_solape_exclude.sql" 2>&1)"
echo "$OUT" | grep -q "GUARD ABORT (MS-G4)" && ok "G4.pre aborta con solape" || no "G4.pre" "no abortó"

echo "== G4: corregir fechas → apply OK, luego INSERT solapado debe RECHAZARSE =="
q -c "UPDATE proc_temporada SET fecha_inicio='2026-10-01' WHERE codigo='SOLAPE-B';" >/dev/null
OUT="$(q < "$V2/40_ms_g4_solape_exclude.sql" 2>&1)"
echo "$OUT" | grep -q "POST-CHECK OK (MS-G4)" && ok "G4.apply constraint creada" || no "G4.apply" "$OUT"
OUT="$(q -c "INSERT INTO proc_temporada(empresa_id,codigo,fecha_inicio,fecha_fin,estado) VALUES ('$ALS','SOLAPE-C','2026-08-01','2026-08-15','planificada');" 2>&1)"
echo "$OUT" | grep -qi "ex_proc_temporada_solape\|conflicting key" && ok "G4.enforce rechaza solape nuevo" || no "G4.enforce" "$OUT"

echo "== G3: typo + s-t + NULL, aplicar, verificar materializa/sentinela/FK =="
q -c "INSERT INTO proc_pallet(empresa_id,temporada_codigo) VALUES
        ('$ALS','TYPO26'),('$ALS','s-t'),('$ALS',NULL);
      INSERT INTO proc_orden_proceso(empresa_id,folio) VALUES ('$ALS','ORD-2526-000001');" >/dev/null
OUT="$(q < "$V2/30_ms_g3_identidad_temporada.sql" 2>&1)"
echo "$OUT" | grep -q "POST-CHECK OK (MS-G3)" && ok "G3.apply backfill+FK ok" || no "G3.apply" "$(echo "$OUT" | grep -i error | head -1)"
[ "$(scalar "SELECT EXISTS(SELECT 1 FROM proc_temporada WHERE codigo='TYPO26' AND estado='cerrada')")" = "t" ] \
  && ok "G3.materializa typo→cerrada" || no "G3.materializa" "typo no materializado"
[ "$(scalar "SELECT EXISTS(SELECT 1 FROM proc_pallet WHERE temporada_codigo='HIST-SIN-TEMP') AND NOT EXISTS(SELECT 1 FROM proc_pallet WHERE lower(temporada_codigo)='s-t')")" = "t" ] \
  && ok "G3.sentinela s-t→HIST-SIN-TEMP" || no "G3.sentinela" "s-t no reetiquetado"
[ "$(scalar "SELECT EXISTS(SELECT 1 FROM proc_pallet WHERE temporada_codigo IS NULL)")" = "t" ] \
  && ok "G3.null_intacto" || no "G3.null_intacto" "NULL alterado"
[ "$(scalar "SELECT temporada_codigo FROM proc_orden_proceso WHERE folio='ORD-2526-000001'")" = "2526" ] \
  && ok "G3.orden_backfill folio→2526" || no "G3.orden_backfill" "no resolvió del folio"
OUT="$(q -c "INSERT INTO proc_pallet(empresa_id,temporada_codigo) VALUES ('$ALS','ZZZZ');" 2>&1)"
echo "$OUT" | grep -qi "violates foreign key\|fk_proc_pallet_temporada" && ok "G3.fk_enforce rechaza huérfano" || no "G3.fk_enforce" "$OUT"

docker exec -i "$CTN" psql -U postgres -c "DROP DATABASE IF EXISTS $DB (FORCE);" >/dev/null 2>&1
echo ""
echo "SMOKE G3/G4: $PASS/$((PASS+FAIL)) PASS$([ $FAIL -gt 0 ] && echo '  <<< HAY FAIL')"
