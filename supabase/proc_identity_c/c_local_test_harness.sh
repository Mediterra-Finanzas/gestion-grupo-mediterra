set -u
DB="docker exec -i proc_uat psql -U postgres -d c_test -tAq"
AUA=a0000000-0000-0000-0000-0000000000a1
AUM=b0000000-0000-0000-0000-0000000000b1
AUC=c0000000-0000-0000-0000-0000000000c1
AUI=d0000000-0000-0000-0000-0000000000d1
AUR=e0000000-0000-0000-0000-0000000000e1
ALS=5aa10886-2a76-4a9e-9bc3-303fb776cd49
B=11111111-1111-1111-1111-111111111111
PASS=0; FAIL=0
run(){ # auth hdr query
  printf "BEGIN;\nSET LOCAL role authenticated;\nDO \$h\$ BEGIN PERFORM set_config('request.jwt.claims','{\"sub\":\"%s\",\"role\":\"authenticated\"}',true); PERFORM set_config('request.headers','{\"x-proc-empresa\":\"%s\"}',true); END \$h\$;\n%s;\nROLLBACK;\n" "$1" "$2" "$3" | $DB 2>&1 | grep -v -E '^$' | tail -1
}
chk(){ # label expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "PASS %-10s exp=%s got=%s\n" "$1" "$2" "$3";
  else FAIL=$((FAIL+1)); printf "FAIL %-10s exp=%s got=%s\n" "$1" "$2" "$3"; fi
}
chk AUTH-C-01 "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" "$(run $AUA '' 'SELECT proc_current_iam_user()')"
chk AUTH-C-07 "a0000000-0000-0000-0000-0000000000a1" "$(run $AUA '' 'SELECT proc_current_auth_user()')"
chk AUTH-C-08 "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" "$(run $AUA '' 'SELECT proc_current_user()')"
chk AUTH-C-03 "2" "$(run $AUA '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-09 "2" "$(run $AUA '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-10 "0" "$(run $AUA '' "SELECT count(*) FROM proc_lote WHERE dato LIKE 'B-%' OR dato LIKE 'C-%'")"
chk AUTH-C-02 "0" "$(run $AUC '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-04 "" "$(run $AUC '' 'SELECT proc_current_empresa()')"
chk AUTH-C-05a "0" "$(run $AUM '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-05b "2" "$(run $AUM $ALS 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-05c "1" "$(run $AUM $B 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-06 "0" "$(run $AUA $B 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-06b "" "$(run $AUA $B 'SELECT proc_current_empresa()')"
chk AUTH-C-12 "" "$(run $AUI '' 'SELECT proc_current_iam_user()')"
chk AUTH-C-12b "0" "$(run $AUI '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-11 "0" "$(run $AUR '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-13 "0" "$(run 99999999-9999-9999-9999-999999999999 '' 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-17 "2" "$(run $AUM $ALS 'SELECT count(*) FROM proc_lote')"
chk AUTH-C-18 "1" "$(run $AUM $B 'SELECT count(*) FROM proc_lote')"
# AUTH-C-20 write: Multi header B inserta B -> ok(1 fila devuelta), inserta ALS -> WITH CHECK falla
chk AUTH-C-20a "1" "$(run $AUM $B "INSERT INTO proc_lote(empresa_id,dato) VALUES('$B','w') RETURNING 1")"
chk AUTH-C-20b "ERR" "$(run $AUM $B "INSERT INTO proc_lote(empresa_id,dato) VALUES('$ALS','x') RETURNING 1" | grep -qi 'violates\|check' && echo ERR || echo NO)"
# AUTH-C-10w cross-tenant write: Multi header ALS inserta B -> falla
chk AUTH-C-10w "ERR" "$(run $AUM $ALS "INSERT INTO proc_lote(empresa_id,dato) VALUES('$B','y') RETURNING 1" | grep -qi 'violates\|check' && echo ERR || echo NO)"
# AUTH-C-11d revocacion inmediata: desactivar membership B de Multi -> header B pasa a DENY sin nuevo token
docker exec -i proc_uat psql -U postgres -d c_test -tAq -c "UPDATE iam_usuario_empresa SET activo=false WHERE usuario_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND empresa_id='$B';" >/dev/null
chk AUTH-C-11d "0" "$(run $AUM $B 'SELECT count(*) FROM proc_lote')"
docker exec -i proc_uat psql -U postgres -d c_test -tAq -c "UPDATE iam_usuario_empresa SET activo=true WHERE usuario_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND empresa_id='$B';" >/dev/null
# anon no puede leer proc_lote (deny-browser sin token authenticated)
chk AUTH-C-14 "ERR" "$(printf 'BEGIN; SET LOCAL role anon; SELECT count(*) FROM proc_lote; ROLLBACK;' | $DB 2>&1 | grep -qi 'permission denied' && echo ERR || echo NO)"
echo "-----------------------------"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
