#!/usr/bin/env bash
# ============================================================================
# rehearsal/run_rehearsal.sh — Rehearsal LOCAL de concurrencia (CONC-B2/B3/idempotencia).
# DEV-ONLY. Se ejecuta DENTRO del contenedor Docker proc_uat. Crea la DB conc_reh, prueba
# ANTES (bug) y DESPUÉS (fix), rollback + re-apply, y DROP de conc_reh. No toca prod/staging.
#   uso (desde host):
#     docker cp supabase/concurrency_v2 proc_uat:/tmp/cv2
#     docker exec proc_uat bash /tmp/cv2/rehearsal/run_rehearsal.sh
# ============================================================================
set -u
CV2=/tmp/cv2
DB=conc_reh
PSQL_ADMIN="psql -v ON_ERROR_STOP=1 -X -q -d postgres"
Q(){ psql -tA -X -q -d "$DB" -c "$1"; }        # query escalar
RUN(){ psql -v ON_ERROR_STOP=1 -X -q -d "$DB" -c "$1"; }  # exec con stop
PASSES=0; FAILS=0
assert_eq(){ if [ "$2" = "$3" ]; then echo "  PASS | $1 (=$3)"; PASSES=$((PASSES+1)); else echo "  FAIL | $1 (esperado=$2 obtuvo=$3)"; FAILS=$((FAILS+1)); fi; }

echo "== (re)crear DB aislada $DB =="
$PSQL_ADMIN -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);" >/dev/null
$PSQL_ADMIN -c "CREATE DATABASE $DB;" >/dev/null

echo "== bootstrap (esquema mínimo + funciones ORIGINALES buggy) =="
psql -v ON_ERROR_STOP=1 -X -q -d "$DB" -f "$CV2/rehearsal/00_bootstrap_conc_reh.sql" >/dev/null

# ── fixtures ────────────────────────────────────────────────────────────────
EMP=$(Q "SELECT gen_random_uuid()")
mkobj(){ # $1 tabla → devuelve id de un objeto nuevo de esa empresa
  Q "INSERT INTO $1(empresa_id, codigo) VALUES ('$EMP','x') RETURNING id"; }
seed_entrada(){ # $1 objeto_tipo $2 objeto_id $3 kg   (entrada 'recepcion')
  RUN "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'recepcion','entrada','$1','$2',$3,'recepcion',NULL,NULL,NULL,NULL)" >/dev/null; }

# ── helper 2-sesiones (interleave determinista por FIFO) ─────────────────────
# duo <s1a> <s2a> <s1b> <s2b> : S1 abre y ejecuta s1a; S2 abre y ejecuta s2a (puede bloquear);
#                               luego s1b (commit) libera; luego s2b (commit/rollback).
duo(){
  local s1a="$1" s2a="$2" s1b="$3" s2b="$4"
  rm -f /tmp/s1in /tmp/s2in /tmp/s1out /tmp/s2out
  mkfifo /tmp/s1in /tmp/s2in
  ( psql -X -q -A -t -v ON_ERROR_STOP=0 -d "$DB" < /tmp/s1in > /tmp/s1out 2>&1 ) & local p1=$!
  ( psql -X -q -A -t -v ON_ERROR_STOP=0 -d "$DB" < /tmp/s2in > /tmp/s2out 2>&1 ) & local p2=$!
  exec 3>/tmp/s1in; exec 4>/tmp/s2in
  { echo "BEGIN;"; echo "$s1a"; } >&3; sleep 1.5
  { echo "BEGIN;"; echo "$s2a"; } >&4; sleep 1.8
  echo "$s1b" >&3; sleep 1.8
  echo "$s2b" >&4; sleep 1.0
  exec 3>&-; exec 4>&-
  wait $p1 $p2 2>/dev/null
}

apply_fixes(){
  for f in 50_ledger_idempotencia_schema 60_registrar_movimiento_fix 70_reversar_fix; do
    psql -v ON_ERROR_STOP=1 -X -q -d "$DB" -c "SET conc.rehearsal='1';" -f "$CV2/$f.sql" >/tmp/apply_$f.log 2>&1 \
      || { echo "  FAIL | apply $f"; cat /tmp/apply_$f.log; FAILS=$((FAILS+1)); }
  done
}
apply_rollback(){ psql -v ON_ERROR_STOP=1 -X -q -d "$DB" -c "SET conc.rehearsal='1';" -f "$CV2/99_rollback.sql" >/tmp/rb.log 2>&1 \
  || { echo "  FAIL | rollback"; cat /tmp/rb.log; FAILS=$((FAILS+1)); }; }

echo
echo "################  FASE ANTES (funciones buggy)  ################"

echo "-- A1: lost-update en PT (2 salidas concurrentes de 80 sobre on_hand=100) --"
PT_A=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_A" 100
duo "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_A',80,'despacho',NULL,NULL,NULL,NULL);" \
    "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_A',80,'despacho',NULL,NULL,NULL,NULL);" \
    "COMMIT;" "COMMIT;"
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_A')")
assert_eq "A1 bug reproducido: on_hand negativo (sobreventa)" "-60.000" "$OH"

echo "-- A2: doble reversa de una SALIDA (secuencial) → contra-entrada duplicada --"
# Se reversa una SALIDA (su contra-movimiento es una entrada, que el chequeo de saldo nunca bloquea):
# on_hand parte en 100, salida 40 → 60; dos reversas inflan +40 +40 → 140 (debería ser 100).
PT_B=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_B" 100
MOV_B=$(Q "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_B',40,'despacho',NULL,NULL,NULL,NULL)")
RUN "SELECT proc_fn_reversar_movimiento('$EMP','$MOV_B','err1',NULL)" >/dev/null
RUN "SELECT proc_fn_reversar_movimiento('$EMP','$MOV_B','err2',NULL)" >/dev/null
NREV=$(Q "SELECT count(*) FROM proc_movimiento WHERE revierte_movimiento_id='$MOV_B' AND es_reversa")
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_B')")
assert_eq "A2 bug reproducido: 2 reversas de la misma salida" "2" "$NREV"
assert_eq "A2 bug reproducido: on_hand inflado por doble reversa" "140.000" "$OH"

echo "-- A3: retry duplica ledger (mismo transaccion_id, sin UNIQUE) --"
PT_C=$(mkobj proc_producto_terminado); TX=$(Q "SELECT gen_random_uuid()")
RUN "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'recepcion','entrada','producto_terminado','$PT_C',50,'recepcion',NULL,'$TX',NULL,NULL)" >/dev/null
RUN "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'recepcion','entrada','producto_terminado','$PT_C',50,'recepcion',NULL,'$TX',NULL,NULL)" >/dev/null
NDUP=$(Q "SELECT count(*) FROM proc_movimiento WHERE transaccion_id='$TX'")
assert_eq "A3 bug reproducido: retry duplicó fila de ledger" "2" "$NDUP"

echo
echo "== reset del ledger: limpia la corrupción DELIBERADA de la fase ANTES =="
echo "   (en STAGING/PROD el pre-check de 50_ es fail-closed y EXIGE conciliar los dobles-reversa"
echo "    y duplicados previos antes de crear los UNIQUE; aquí los generamos a propósito) =="
RUN "TRUNCATE proc_movimiento"

echo
echo "################  APLICAR FIXES 50/60/70  ################"
apply_fixes
HASCOL=$(Q "SELECT count(*) FROM information_schema.columns WHERE table_name='proc_movimiento' AND column_name='idempotency_key'")
NARGS=$(Q "SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16")
assert_eq "FIX aplicado: columna idempotency_key" "1" "$HASCOL"
assert_eq "FIX aplicado: registrar_movimiento(16)" "1" "$NARGS"

echo
echo "################  FASE DESPUES (funciones fixed)  ################"

echo "-- D1: lost-update PT prevenido (S2 bloquea y rechaza stale) --"
PT_D=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_D" 100
duo "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_D',80,'despacho',NULL,NULL,NULL,NULL);" \
    "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_D',80,'despacho',NULL,NULL,NULL,NULL);" \
    "COMMIT;" "COMMIT;"
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_D')")
NSAL=$(Q "SELECT count(*) FROM proc_movimiento WHERE objeto_id='$PT_D' AND naturaleza='salida'")
S2ERR=$(grep -c "excede on_hand" /tmp/s2out)
assert_eq "D1 fixed: on_hand no negativo (1 sola salida aplicada)" "20.000" "$OH"
assert_eq "D1 fixed: exactamente 1 salida persistida" "1" "$NSAL"
assert_eq "D1 fixed: conflicto VISIBLE en S2 (excede on_hand)" "1" "$S2ERR"

echo "-- D2: doble reversa de una SALIDA (retry secuencial) → idempotente --"
PT_E=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_E" 100
MOV_E=$(Q "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_E',40,'despacho',NULL,NULL,NULL,NULL)")
R1=$(Q "SELECT proc_fn_reversar_movimiento('$EMP','$MOV_E','fix1',NULL)")
R2=$(Q "SELECT proc_fn_reversar_movimiento('$EMP','$MOV_E','fix2',NULL)")
NREV=$(Q "SELECT count(*) FROM proc_movimiento WHERE revierte_movimiento_id='$MOV_E' AND es_reversa")
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_E')")
assert_eq "D2 fixed: 1 sola reversa" "1" "$NREV"
assert_eq "D2 fixed: retry devuelve el MISMO id" "$R1" "$R2"
assert_eq "D2 fixed: on_hand revertido exactamente una vez (100)" "100.000" "$OH"

echo "-- D3: doble reversa concurrente de una SALIDA (2 sesiones) → 1 sola --"
PT_F=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_F" 100
MOV_F=$(Q "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_F',40,'despacho',NULL,NULL,NULL,NULL)")
duo "SELECT proc_fn_reversar_movimiento('$EMP','$MOV_F','c1',NULL);" \
    "SELECT proc_fn_reversar_movimiento('$EMP','$MOV_F','c2',NULL);" \
    "COMMIT;" "COMMIT;"
NREV=$(Q "SELECT count(*) FROM proc_movimiento WHERE revierte_movimiento_id='$MOV_F' AND es_reversa")
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_F')")
assert_eq "D3 fixed: 1 sola reversa bajo concurrencia" "1" "$NREV"
assert_eq "D3 fixed: on_hand=100 (no doble revertido)" "100.000" "$OH"

echo "-- D4: idempotencia retry secuencial (misma idempotency_key) → 1 fila --"
PT_G=$(mkobj proc_producto_terminado)
K1=$(Q "SELECT proc_fn_registrar_movimiento(p_empresa_id=>'$EMP',p_planta_id=>NULL,p_temporada=>NULL,p_tipo=>'recepcion',p_naturaleza=>'entrada',p_objeto_tipo=>'producto_terminado',p_objeto_id=>'$PT_G',p_cantidad=>50,p_ref_tipo=>'recepcion',p_ref_id=>NULL,p_transaccion_id=>NULL,p_motivo=>NULL,p_actor=>NULL,p_idempotency_key=>'IDEM-1')")
K2=$(Q "SELECT proc_fn_registrar_movimiento(p_empresa_id=>'$EMP',p_planta_id=>NULL,p_temporada=>NULL,p_tipo=>'recepcion',p_naturaleza=>'entrada',p_objeto_tipo=>'producto_terminado',p_objeto_id=>'$PT_G',p_cantidad=>50,p_ref_tipo=>'recepcion',p_ref_id=>NULL,p_transaccion_id=>NULL,p_motivo=>NULL,p_actor=>NULL,p_idempotency_key=>'IDEM-1')")
NROW=$(Q "SELECT count(*) FROM proc_movimiento WHERE idempotency_key='IDEM-1'")
assert_eq "D4 fixed: retry no duplica (1 fila)" "1" "$NROW"
assert_eq "D4 fixed: retry devuelve el MISMO id" "$K1" "$K2"

echo "-- D5: idempotencia concurrente (2 sesiones misma key) → 1 fila --"
PT_H=$(mkobj proc_producto_terminado)
duo "SELECT proc_fn_registrar_movimiento(p_empresa_id=>'$EMP',p_planta_id=>NULL,p_temporada=>NULL,p_tipo=>'recepcion',p_naturaleza=>'entrada',p_objeto_tipo=>'producto_terminado',p_objeto_id=>'$PT_H',p_cantidad=>50,p_ref_tipo=>'recepcion',p_ref_id=>NULL,p_transaccion_id=>NULL,p_motivo=>NULL,p_actor=>NULL,p_idempotency_key=>'IDEM-2');" \
    "SELECT proc_fn_registrar_movimiento(p_empresa_id=>'$EMP',p_planta_id=>NULL,p_temporada=>NULL,p_tipo=>'recepcion',p_naturaleza=>'entrada',p_objeto_tipo=>'producto_terminado',p_objeto_id=>'$PT_H',p_cantidad=>50,p_ref_tipo=>'recepcion',p_ref_id=>NULL,p_transaccion_id=>NULL,p_motivo=>NULL,p_actor=>NULL,p_idempotency_key=>'IDEM-2');" \
    "COMMIT;" "COMMIT;"
NROW=$(Q "SELECT count(*) FROM proc_movimiento WHERE idempotency_key='IDEM-2'")
assert_eq "D5 fixed: concurrente misma key → 1 fila" "1" "$NROW"

echo "-- D6: REGRESION — multi-linea legit (mismo pallet 2x salida, mismo tx, SIN key) NO se rompe --"
PAL=$(mkobj proc_pallet); seed_entrada pallet "$PAL" 100
TXD=$(Q "SELECT gen_random_uuid()")
RUN "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','pallet','$PAL',30,'despacho',NULL,'$TXD',NULL,NULL)" >/dev/null
RUN "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','pallet','$PAL',20,'despacho',NULL,'$TXD',NULL,NULL)" >/dev/null
NMULTI=$(Q "SELECT count(*) FROM proc_movimiento WHERE transaccion_id='$TXD'")
assert_eq "D6 fixed: multi-linea legit permitida (2 filas mismo tx)" "2" "$NMULTI"

echo
echo "################  ROLLBACK + RE-APPLY  ################"
apply_rollback
HASCOL=$(Q "SELECT count(*) FROM information_schema.columns WHERE table_name='proc_movimiento' AND column_name='idempotency_key'")
N15=$(Q "SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15")
N16=$(Q "SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16")
assert_eq "R1 rollback: columna idempotency_key eliminada" "0" "$HASCOL"
assert_eq "R1 rollback: registrar(15) restaurado" "1" "$N15"
assert_eq "R1 rollback: registrar(16) eliminado" "0" "$N16"
# el bug vuelve a reproducirse (prueba que el rollback es fiel):
PT_R=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_R" 100
duo "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_R',80,'despacho',NULL,NULL,NULL,NULL);" \
    "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_R',80,'despacho',NULL,NULL,NULL,NULL);" \
    "COMMIT;" "COMMIT;"
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_R')")
assert_eq "R1 rollback fiel: bug CONC-B2 reaparece (-60)" "-60.000" "$OH"

echo "-- re-apply fixes (idempotencia de scripts) --"
apply_fixes
PT_S=$(mkobj proc_producto_terminado); seed_entrada producto_terminado "$PT_S" 100
duo "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_S',80,'despacho',NULL,NULL,NULL,NULL);" \
    "SELECT proc_fn_registrar_movimiento('$EMP',NULL,NULL,'despacho','salida','producto_terminado','$PT_S',80,'despacho',NULL,NULL,NULL,NULL);" \
    "COMMIT;" "COMMIT;"
OH=$(Q "SELECT reh_on_hand('$EMP','producto_terminado','$PT_S')")
assert_eq "R2 re-apply: fix vuelve a proteger (on_hand=20)" "20.000" "$OH"

echo
echo "== DROP DB $DB =="
$PSQL_ADMIN -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);" >/dev/null

echo
echo "############################################################"
echo "RESULTADO REHEARSAL: PASS=$PASSES  FAIL=$FAILS  (TOTAL=$((PASSES+FAILS)))"
echo "############################################################"
[ "$FAILS" = "0" ] && exit 0 || exit 1
