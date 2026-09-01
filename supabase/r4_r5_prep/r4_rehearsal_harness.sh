#!/usr/bin/env bash
# r4_rehearsal_harness.sh — Ensayo LOCAL del cierre R4 (Docker proc_uat, base r4_reh).
# Prueba: PRE-R4 anon=ALLOW; aplica R4 (drop _dev_uat + revoke anon con preflight/post 1:1);
# POST-R4 anon=DENY, authenticated con membership=ALLOW, calendario_data anon intacto (no-regresión);
# ROLLBACK restaura anon=ALLOW. Al final DROP r4_reh. NO toca staging/prod.
set -u
C="docker exec -i proc_uat"
PSQL_POSTGRES="$C psql -U postgres -d postgres -tAq"
DB="$C psql -U postgres -d r4_reh -tAq"
AUA=a0000000-0000-0000-0000-0000000000a1   # Angelo (single ALS)
AUC=c0000000-0000-0000-0000-0000000000c1   # Carol (sin membership)
ALS=5aa10886-2a76-4a9e-9bc3-303fb776cd49
B=11111111-1111-1111-1111-111111111111
PASS=0; FAIL=0
HERE="$(cd "$(dirname "$0")" && pwd)"

# run_auth AUTH_SUB HEADER_EMPRESA SQL  → como authenticated
run_auth(){
  printf "BEGIN;\nSET LOCAL role authenticated;\nDO \$h\$ BEGIN PERFORM set_config('request.jwt.claims','{\"sub\":\"%s\",\"role\":\"authenticated\"}',true); PERFORM set_config('request.headers','{\"x-proc-empresa\":\"%s\"}',true); END \$h\$;\n%s;\nROLLBACK;\n" "$1" "$2" "$3" | $DB 2>&1 | grep -v -E '^$' | tail -1
}
# run_anon SQL  → como anon (sin token) ; captura permission-denied
run_anon(){
  printf "BEGIN; SET LOCAL role anon; %s; ROLLBACK;" "$1" | $DB 2>&1 | grep -v -E '^$' | tail -1
}
run_anon_denied(){  # ERR si permission denied / policy violation, NO si pasa
  printf "BEGIN; SET LOCAL role anon; %s; ROLLBACK;" "$1" | $DB 2>&1 | grep -qiE 'permission denied|violates|policy' && echo ERR || echo NO
}
chk(){ if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "PASS %-14s exp=%s got=%s\n" "$1" "$2" "$3";
       else FAIL=$((FAIL+1)); printf "FAIL %-14s exp=%s got=%s\n" "$1" "$2" "$3"; fi }

echo "=== [0] Crear base r4_reh y cargar setup ==="
$PSQL_POSTGRES -c "DROP DATABASE IF EXISTS r4_reh;" >/dev/null 2>&1
$PSQL_POSTGRES -c "CREATE DATABASE r4_reh;" >/dev/null 2>&1
$C psql -U postgres -d r4_reh -v ON_ERROR_STOP=1 -q < "$HERE/r4_rehearsal_setup.sql" | tail -2

echo "=== [1] PRE-R4 (bridge anon activo) ==="
chk PRE-anon-read   "3" "$(run_anon 'SELECT count(*) FROM proc_lote')"
chk PRE-anon-ins    "1" "$(run_anon "INSERT INTO proc_lote(empresa_id,dato) VALUES('$B','anon-w') RETURNING 1")"
chk PRE-auth-als    "2" "$(run_auth $AUA '' 'SELECT count(*) FROM proc_lote')"
chk PRE-auth-xtenant "0" "$(run_auth $AUA $B 'SELECT count(*) FROM proc_lote')"
chk PRE-cal-anon    "1" "$(run_anon 'SELECT count(*) FROM calendario_data')"
chk PRE-cat-anon    "2" "$(run_anon 'SELECT count(*) FROM proc_tipo_movimiento')"

echo "=== [2] APLICAR R4 (drop _dev_uat + revoke anon, con preflight/post 1:1) ==="
$DB <<'SQL' | grep -iE 'R4-REH|NOTICE|ERROR' | tail -6
\set ON_ERROR_STOP on
DO $r4$
DECLARE t text; tbls text[] := ARRAY['proc_lote','proc_recepcion','proc_tipo_movimiento'];
  v_estrictas int; v_uat_post int; v_anon_proc int; v_cal_pre int; v_cal_post int;
BEGIN
  v_cal_pre := (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_name='calendario_data');
  -- R4-A: preflight ≥1 estricta + DROP _dev_uat
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE '%\_dev\_uat' ESCAPE '\' AND lower(policyname) NOT LIKE '%\_dev\_only' ESCAPE '\');
    IF v_estrictas<1 THEN RAISE EXCEPTION 'R4-REH ABORT: % sin estricta', t; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','pol_'||t||'_dev_uat',t);
  END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND lower(policyname) LIKE '%\_dev\_uat' ESCAPE '\');
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4-REH POST-A: quedan % _dev_uat', v_uat_post; END IF;
  -- R4-B: REVOKE anon SOLO proc_* (guard no-proc)
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t); END LOOP;
  v_anon_proc := (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_name LIKE 'proc\_%' ESCAPE '\');
  IF v_anon_proc<>0 THEN RAISE EXCEPTION 'R4-REH POST-B: quedan % grants anon proc_*', v_anon_proc; END IF;
  -- no-regresión calendario_data
  v_cal_post := (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_name='calendario_data');
  IF v_cal_post<>v_cal_pre THEN RAISE EXCEPTION 'R4-REH REGRESIÓN calendario_data % -> %', v_cal_pre, v_cal_post; END IF;
  RAISE NOTICE 'R4-REH OK: 0 _dev_uat, 0 grants anon proc_*, calendario_data anon intacto (%).', v_cal_post;
END $r4$;
SQL

echo "=== [3] POST-R4 (anon cerrado, authenticated intacto) ==="
chk POST-anon-read   "ERR" "$(run_anon_denied 'SELECT count(*) FROM proc_lote')"
chk POST-anon-ins    "ERR" "$(run_anon_denied "INSERT INTO proc_lote(empresa_id,dato) VALUES('$B','x') RETURNING 1")"
chk POST-anon-cat    "ERR" "$(run_anon_denied 'SELECT count(*) FROM proc_tipo_movimiento')"
chk POST-auth-als    "2" "$(run_auth $AUA '' 'SELECT count(*) FROM proc_lote')"
chk POST-auth-ins    "1" "$(run_auth $AUA '' "INSERT INTO proc_lote(empresa_id,dato) VALUES('$ALS','auth-w') RETURNING 1")"
chk POST-auth-xtenant "0" "$(run_auth $AUA $B 'SELECT count(*) FROM proc_lote')"
chk POST-auth-xwrite "ERR" "$(run_auth $AUA '' "INSERT INTO proc_lote(empresa_id,dato) VALUES('$B','y') RETURNING 1" | grep -qiE 'violates|check' && echo ERR || echo NO)"
chk POST-nomem       "0" "$(run_auth $AUC '' 'SELECT count(*) FROM proc_lote')"
chk POST-auth-cat    "2" "$(run_auth $AUA '' 'SELECT count(*) FROM proc_tipo_movimiento')"
chk POST-cal-anon    "1" "$(run_anon 'SELECT count(*) FROM calendario_data')"

echo "=== [4] ROLLBACK (restaura bridge anon) ==="
$DB <<'SQL' >/dev/null 2>&1
DO $rb$ DECLARE t text; tbls text[] := ARRAY['proc_lote','proc_recepcion','proc_tipo_movimiento'];
BEGIN FOREACH t IN ARRAY tbls LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true)','pol_'||t||'_dev_uat',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon;', t);
END LOOP; END $rb$;
SQL
chk RB-anon-read     "3" "$(run_anon 'SELECT count(*) FROM proc_lote')"  # inserts arriba hacen ROLLBACK → 3 filas committed
chk RB-anon-ins      "1" "$(run_anon "INSERT INTO proc_lote(empresa_id,dato) VALUES('$B','rb-w') RETURNING 1")"

echo "=== [5] Teardown ==="
$PSQL_POSTGRES -c "DROP DATABASE IF EXISTS r4_reh;" >/dev/null 2>&1 && echo "r4_reh dropped"

echo "-----------------------------"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
