#!/usr/bin/env bash
# ============================================================================
# authz_coverage_test.sh — Test de integracion FULL-SCHEMA de la capa AUTHZ (01..07)
# contra el esquema REAL proc_* (61 tablas) en Docker (contenedor proc_uat, postgres:16).
# Clona la DB `proc` (schema real) -> `authz_cov`, agrega identidad iam_* minima + resolvers
# Option C (mock por claims), carga 01..04 + 06 + 07, siembra usuarios/roles y corre la matriz.
#
# Clasificador de autorizacion (aisla la decision de authz del ruido de datos):
#   SQLSTATE 42501 (insufficient_privilege = RLS/capability)  -> DENY
#   exito  o  23xxx (FK/NOT NULL: la RLS PASO, fallo la forma)  -> ALLOW (a nivel authz)
# Todo en transacciones con ROLLBACK => DATA LOSS = 0.
# ============================================================================
set -u
C=proc_uat
DB=authz_cov
ALS='5aa10886-2a76-4a9e-9bc3-303fb776cd49'
OTHER='11111111-1111-1111-1111-111111111111'
U_VIEW='a0000000-0000-0000-0000-000000000001'
U_PROD='a0000000-0000-0000-0000-000000000002'
U_COM='a0000000-0000-0000-0000-000000000003'
U_JEFE='a0000000-0000-0000-0000-000000000004'
U_ADMIN='a0000000-0000-0000-0000-000000000005'
U_NONE='a0000000-0000-0000-0000-000000000006'
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # supabase/authz_v1

psqlq(){ docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -tA "$@"; }
pass=0; fail=0
ok(){ printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
ko(){ printf "  FAIL  %s  -> %s\n" "$1" "$2"; fail=$((fail+1)); }

echo "== 0) (re)crear $DB desde template proc =="
docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL || { echo "no se pudo clonar"; exit 1; }
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('proc','$DB') AND pid<>pg_backend_pid();
DROP DATABASE IF EXISTS $DB;
CREATE DATABASE $DB TEMPLATE proc;
SQL

echo "== 1) identidad iam_* minima + resolvers Option C (mock por claims) =="
docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL || exit 1
-- empresas de prueba
INSERT INTO contab_empresas(id,nombre) VALUES ('$ALS','Allegria Service'),('$OTHER','Otra') ON CONFLICT (id) DO NOTHING;
-- identidad
CREATE TABLE IF NOT EXISTS iam_usuario (id uuid PRIMARY KEY, nombre text, email text, activo boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS iam_usuario_empresa (usuario_id uuid NOT NULL REFERENCES iam_usuario(id), empresa_id uuid NOT NULL REFERENCES contab_empresas(id), activo boolean NOT NULL DEFAULT true, PRIMARY KEY(usuario_id,empresa_id));
INSERT INTO iam_usuario(id,nombre,email) VALUES
 ('$U_VIEW','Viewer','v@x'),('$U_PROD','Prod','p@x'),('$U_COM','Comercial','c@x'),
 ('$U_JEFE','Jefe','j@x'),('$U_ADMIN','Admin','a@x'),('$U_NONE','SinRol','n@x') ON CONFLICT DO NOTHING;
INSERT INTO iam_usuario_empresa(usuario_id,empresa_id) VALUES
 ('$U_VIEW','$ALS'),('$U_PROD','$ALS'),('$U_COM','$ALS'),('$U_JEFE','$ALS'),('$U_ADMIN','$ALS'),('$U_NONE','$ALS') ON CONFLICT DO NOTHING;
-- resolvers Option C (mock: leen del claim; la identidad real ya esta certificada R1-R5)
CREATE OR REPLACE FUNCTION proc_current_iam_user() RETURNS uuid LANGUAGE sql STABLE AS \$f\$
  SELECT NULLIF(current_setting('request.jwt.claims',true)::jsonb->>'iam_user_id','')::uuid \$f\$;
CREATE OR REPLACE FUNCTION proc_current_user() RETURNS uuid LANGUAGE sql STABLE AS \$f\$
  SELECT NULLIF(current_setting('request.jwt.claims',true)::jsonb->>'iam_user_id','')::uuid \$f\$;
CREATE OR REPLACE FUNCTION proc_current_empresa() RETURNS uuid LANGUAGE sql STABLE AS \$f\$
  SELECT NULLIF(current_setting('request.jwt.claims',true)::jsonb->>'empresa_id','')::uuid \$f\$;
SQL
[ $? -eq 0 ] || { echo "setup identidad FALLO"; exit 1; }

echo "== 2) cargar capa authz 01..04 + 06 + 07 =="
for f in 01_schema_authz 02_engine_authz 03_enforcement_rls 04_enforcement_transitions 06_admin_rpcs 07_coverage_close; do
  docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < "$HERE/$f.sql" >/dev/null 2>/tmp/authz_load_err || { echo "carga $f FALLO:"; cat /tmp/authz_load_err; exit 1; }
  echo "  cargado $f"
done

echo "== 3) sembrar roles a usuarios (directo, como postgres) =="
docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL || exit 1
INSERT INTO iam_usuario_empresa_rol(usuario_id,empresa_id,rol) VALUES
 ('$U_VIEW','$ALS','PROC_VIEWER'),
 ('$U_PROD','$ALS','PROC_PRODUCCION'),
 ('$U_COM','$ALS','PROC_COMERCIAL'),
 ('$U_JEFE','$ALS','PROC_JEFE_PLANTA'),
 ('$U_ADMIN','$ALS','PROC_ADMIN') ON CONFLICT DO NOTHING;
-- fila para probar el trigger de emision de informe (informe padre + version 'aprobada')
DO \$s\$
DECLARE v_inf uuid;
BEGIN
  INSERT INTO proc_informe(empresa_id,folio) VALUES ('$ALS','TEST-0001') RETURNING id INTO v_inf;
  INSERT INTO proc_informe_version(empresa_id,informe_id,version,snapshot,estado)
  VALUES ('$ALS',v_inf,1,'{}'::jsonb,'aprobada');
END \$s\$;
SQL

# claims helper
claims(){ echo "{\"sub\":\"$1\",\"role\":\"authenticated\",\"empresa_id\":\"$2\",\"iam_user_id\":\"$1\"}"; }

# try LABEL CLAIMS SQL EXPECTED  (EXPECTED=ALLOW|DENY, a nivel authz)
try(){
  local label="$1" cl="$2" sql="$3" exp="$4" out res
  out=$(docker exec -i "$C" psql -U postgres -d "$DB" -tA 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '$cl', true);
DO \$t\$
DECLARE n int;
BEGIN
  BEGIN
    $sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- 0 filas afectadas (RLS filtro la fila / no visible) = accion bloqueada = DENY
    IF n = 0 THEN RAISE NOTICE 'RESULT=DENY'; ELSE RAISE NOTICE 'RESULT=ALLOW'; END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'RESULT=DENY';   -- 42501 = RLS/capability
    WHEN others THEN
      IF SQLSTATE='42501' THEN RAISE NOTICE 'RESULT=DENY';
      ELSE RAISE NOTICE 'RESULT=ALLOWc'; END IF;                   -- 23xxx (FK/NOTNULL): authz PASO
  END;
END
\$t\$;
ROLLBACK;
SQL
)
  if   echo "$out" | grep -q 'RESULT=DENY'; then res=DENY
  elif echo "$out" | grep -q 'RESULT=ALLOW'; then res=ALLOW
  else res="ERR($(echo "$out"|tr '\n' ' '|tail -c 120))"; fi
  if [ "$res" = "$exp" ]; then ok "$label [$res]"; else ko "$label" "esperado $exp, obtuvo $res"; fi
}

# read-open helper: viewer debe VER filas del catalogo (lectura tenant-only, sin cap)
readcount(){
  local label="$1" cl="$2" tbl="$3" min="$4" out
  out=$(docker exec -i "$C" psql -U postgres -d "$DB" -tA 2>&1 <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','$cl',true);
SELECT count(*) FROM $tbl; ROLLBACK;
SQL
)
  local n=$(echo "$out" | grep -E '^[0-9]+$' | head -1)
  if [ -n "$n" ] && [ "$n" -ge "$min" ]; then ok "$label [count=$n>=$min]"; else ko "$label" "count=$out"; fi
}

VIEW=$(claims $U_VIEW $ALS); PROD=$(claims $U_PROD $ALS); COM=$(claims $U_COM $ALS)
JEFE=$(claims $U_JEFE $ALS); ADMIN=$(claims $U_ADMIN $ALS); NONE=$(claims $U_NONE $ALS)
ADMIN_X=$(claims $U_ADMIN $OTHER)   # admin de ALS pero forjando otra empresa

I(){ echo "INSERT INTO $1(empresa_id$2) VALUES ('$ALS'$3)"; }

echo "== 4) MATRIZ DE COBERTURA =="
# --- P0: hijas de proceso (direct-client-write) ---
try "P0 produccion escribe resultado_descarte (agregado proceso.ejecutar)" "$PROD" "$(I proc_resultado_descarte ',orden_id,kg' ",gen_random_uuid(),1")" ALLOW
try "P0 comercial NO escribe resultado_descarte (bypass hijo)"            "$COM"  "$(I proc_resultado_descarte ',orden_id,kg' ",gen_random_uuid(),1")" DENY
try "P0 produccion escribe resultado_merma"                                "$PROD" "$(I proc_resultado_merma ',orden_id,kg' ",gen_random_uuid(),1")" ALLOW
try "P0 sin-rol NO escribe resultado_merma"                                "$NONE" "$(I proc_resultado_merma ',orden_id,kg' ",gen_random_uuid(),1")" DENY
# --- P0: emision de informe oficial (trigger) ---
try "P0 reporting/comercial EMITE informe_version (reporting.enviar)"      "$COM"  "UPDATE proc_informe_version SET estado='emitida' WHERE empresa_id='$ALS'" ALLOW
try "P0 produccion NO emite informe_version (trigger 42501)"               "$PROD" "UPDATE proc_informe_version SET estado='emitida' WHERE empresa_id='$ALS'" DENY
# --- CONFIG Clase B (config.administrar = solo ADMIN) ---
try "CFG-B admin escribe especie (config.administrar)"                     "$ADMIN" "$(I proc_especie ',codigo,nombre' ",'X','X'")" ALLOW
try "CFG-B produccion NO escribe especie (opera != administra)"            "$PROD"  "$(I proc_especie ',codigo,nombre' ",'X','X'")" DENY
try "CFG-B comercial NO escribe qc_parametro"                              "$COM"   "$(I proc_qc_parametro '' "")" DENY
try "CFG-B jefe NO escribe especie (config.editar != administrar)"         "$JEFE"  "$(I proc_especie ',codigo,nombre' ",'X','X'")" DENY
# --- CONFIG Clase A (config.editar = JEFE + ADMIN) ---
try "CFG-A jefe escribe lineas_proceso (config.editar)"                    "$JEFE"  "$(I proc_lineas_proceso ',nombre' ",'L1'")" ALLOW
try "CFG-A comercial NO modifica planta (config de planta)"                "$COM"   "$(I proc_planta ',nombre' ",'P1'")" DENY
try "CFG-A viewer NO configura lineas_proceso"                             "$VIEW"  "$(I proc_lineas_proceso ',nombre' ",'L1'")" DENY
try "CFG-A admin escribe qc_parametro (admin administra lo autorizado)"    "$ADMIN" "$(I proc_qc_parametro '' "")" ALLOW
# --- tenant / forged / membership ---
try "TENANT admin forja otra empresa -> DENY (cross-tenant)"               "$ADMIN_X" "$(I proc_especie ',codigo,nombre' ",'X','X'")" DENY
try "SIN-ROL no escribe catalogo"                                          "$NONE"  "$(I proc_lineas_proceso ',nombre' ",'L1'")" DENY
# --- lectura de catalogo abierta al tenant (no rompe la app) ---
readcount "READ viewer VE especie (lectura tenant-only)" "$VIEW" "proc_especie" 0
# --- regresion 03/04 (siguen vigentes) ---
try "REG comercial edita tarifa (03 tarifas.editar)"                       "$COM"  "$(I proc_tarifa '' "")" ALLOW
try "REG produccion NO edita tarifa"                                       "$PROD" "$(I proc_tarifa '' "")" DENY
try "REG produccion mueve inventario (03 inventario.mover)"                "$PROD" "$(I proc_movimiento '' "")" ALLOW

# --- revocacion next-request (config.editar del jefe) ---
echo "== 5) revocacion next-request =="
docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c \
 "UPDATE iam_usuario_empresa_rol SET activo=false WHERE usuario_id='$U_JEFE' AND empresa_id='$ALS';" >/dev/null
try "REVOCA jefe sin rol activo NO escribe lineas_proceso"                 "$JEFE" "$(I proc_lineas_proceso ',nombre' ",'L1'")" DENY
docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c \
 "UPDATE iam_usuario_empresa_rol SET activo=true WHERE usuario_id='$U_JEFE' AND empresa_id='$ALS';" >/dev/null

echo ""
echo "================= RESUMEN authz coverage ================="
echo "PASS=$pass  FAIL=$fail"
[ "$fail" -eq 0 ] && echo "OK — cobertura AUTHZ validada (DATA LOSS=0, todo ROLLBACK)." || echo "HAY FALLOS — revisar arriba."
exit $fail
