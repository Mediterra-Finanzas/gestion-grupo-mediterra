# ============================================================
# OA-012-03 / OA-011-07 - Prueba de seguridad RLS v2
# Valida por EFECTO REAL sobre la base de datos, no solo por HTTP status.
# Ejecutar DESPUES de que las tablas existan (post 002_currency_transactional_v3.sql).
#
# Estructura:
#   Parte 1: Operaciones con anon key (PowerShell)
#   Parte 2: SQL de verificacion de efecto real (para SQL Editor)
#
# El criterio de PASS requiere AMBAS partes.
# ============================================================

$SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co"

# IMPORTANTE: pegar el valor de SUPA_KEY (anon key) antes de ejecutar.
# No guardar este archivo con la key real; limpiar despues de usar.
$SUPA_KEY = "PEGAR_ANON_KEY_AQUI"

$BATCH_ID   = "f1000000-0000-0000-0000-000000000001"
# USD-CLP 2026-07-07 = 926.25 (el registro mas reciente)
$TEST_FECHA = "2026-07-07"
$TEST_VALOR = 926.25

$headers = @{
  "apikey"        = $SUPA_KEY
  "Authorization" = "Bearer $SUPA_KEY"
  "Content-Type"  = "application/json"
  "Prefer"        = "count=exact"
}

$resultados = @()

function Write-Section([string]$titulo) {
  Write-Host "`n--- $titulo ---" -ForegroundColor Cyan
}

# ----------------------------------------------------------
# PARTE 1-A: SELECT (anon)
# RLS sin policy -> 0 filas visibles (HTTP 200, body = [])
# ----------------------------------------------------------
Write-Section "PARTE 1-A: SELECT anon - currency_tc"

try {
  $uri1 = "$SUPA_URL/rest/v1/currency_tc?select=id,valor&limit=5"
  $resp = Invoke-RestMethod `
    -Uri     $uri1 `
    -Method  GET `
    -Headers $headers `
    -ErrorAction Stop

  if ($resp -is [System.Array] -and $resp.Count -eq 0) {
    $r = [PSCustomObject]@{ Test = "SELECT anon"; Resultado = "PASS"; Detalle = "200 OK - body=[] - 0 filas visibles (RLS activa)" }
  } else {
    $r = [PSCustomObject]@{ Test = "SELECT anon"; Resultado = "FAIL_SEGURIDAD"; Detalle = "Respondio $($resp.Count) filas - RLS no esta funcionando" }
  }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  $r = [PSCustomObject]@{ Test = "SELECT anon"; Resultado = "PASS"; Detalle = "HTTP $sc - acceso bloqueado" }
}
$resultados += $r
Write-Host "  $($r.Resultado): $($r.Detalle)"

# ----------------------------------------------------------
# PARTE 1-B: INSERT (anon)
# PostgREST con RLS sin policy INSERT -> 403 esperado.
# ----------------------------------------------------------
Write-Section "PARTE 1-B: INSERT anon - currency_tc"

$insertBody = @{
  moneda_origen     = "USD"
  moneda_destino    = "CLP"
  fecha             = "2026-12-31"
  rate_type         = "spot"
  rate_purpose      = "market"
  valor             = 12345.00
  fuente            = "rls_test_anon_DEBE_FALLAR"
  es_manual         = $false
  estado            = "activo"
  estado_aprobacion = "auto"
} | ConvertTo-Json

try {
  $respI = Invoke-RestMethod `
    -Uri     "$SUPA_URL/rest/v1/currency_tc" `
    -Method  POST `
    -Headers $headers `
    -Body    $insertBody `
    -ErrorAction Stop

  $r = [PSCustomObject]@{
    Test      = "INSERT anon"
    Resultado = "VERIFICAR_PARTE2"
    Detalle   = "HTTP 2xx - verificar en SQL Editor que fecha=2026-12-31/fuente=rls_test_anon_DEBE_FALLAR NO existe"
  }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  if ($sc -eq 403 -or $sc -eq 401) {
    $r = [PSCustomObject]@{ Test = "INSERT anon"; Resultado = "PASS"; Detalle = "HTTP $sc - insercion bloqueada por RLS" }
  } else {
    $r = [PSCustomObject]@{ Test = "INSERT anon"; Resultado = "VERIFICAR_PARTE2"; Detalle = "HTTP $sc - verificar en SQL Editor que el registro no existe" }
  }
}
$resultados += $r
Write-Host "  $($r.Resultado): $($r.Detalle)"

# ----------------------------------------------------------
# PARTE 1-C: UPDATE (anon)
# Con RLS sin policy, el WHERE ve 0 filas -> 0 filas modificadas.
# ----------------------------------------------------------
Write-Section "PARTE 1-C: UPDATE anon - currency_tc"

$patchBody = @{ valor = 1.0 } | ConvertTo-Json

try {
  $uri2 = "$SUPA_URL/rest/v1/currency_tc?estado=eq.activo&moneda_origen=eq.USD&fecha=eq.$TEST_FECHA"
  $respU = Invoke-WebRequest `
    -Uri             $uri2 `
    -Method          PATCH `
    -Headers         ($headers + @{ "Content-Type" = "application/json" }) `
    -Body            $patchBody `
    -ErrorAction     Stop `
    -UseBasicParsing

  $sc = $respU.StatusCode
  $contentRange = $respU.Headers["Content-Range"]
  if ($contentRange -like "*/0" -or $contentRange -like "0-0/0") {
    $r = [PSCustomObject]@{ Test = "UPDATE anon"; Resultado = "PASS"; Detalle = "HTTP $sc - Content-Range=$contentRange - 0 filas modificadas" }
  } else {
    $r = [PSCustomObject]@{ Test = "UPDATE anon"; Resultado = "VERIFICAR_PARTE2"; Detalle = "HTTP $sc Content-Range=$contentRange - verificar en SQL Editor que USD-CLP $TEST_FECHA vale $TEST_VALOR" }
  }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  if ($sc -eq 403 -or $sc -eq 401) {
    $r = [PSCustomObject]@{ Test = "UPDATE anon"; Resultado = "PASS"; Detalle = "HTTP $sc - actualizacion bloqueada por RLS" }
  } else {
    $r = [PSCustomObject]@{ Test = "UPDATE anon"; Resultado = "VERIFICAR_PARTE2"; Detalle = "HTTP $sc - verificar en SQL Editor que USD-CLP $TEST_FECHA vale $TEST_VALOR" }
  }
}
$resultados += $r
Write-Host "  $($r.Resultado): $($r.Detalle)"

# ----------------------------------------------------------
# PARTE 1-D: DELETE (anon)
# Con RLS sin policy, el WHERE ve 0 filas -> 0 deletadas.
# ----------------------------------------------------------
Write-Section "PARTE 1-D: DELETE anon - currency_tc"

try {
  $respD = Invoke-WebRequest `
    -Uri             "$SUPA_URL/rest/v1/currency_tc?estado=eq.activo" `
    -Method          DELETE `
    -Headers         $headers `
    -ErrorAction     Stop `
    -UseBasicParsing

  $sc = $respD.StatusCode
  $contentRange = $respD.Headers["Content-Range"]
  if ($contentRange -like "*/0" -or $contentRange -like "0-0/0") {
    $r = [PSCustomObject]@{ Test = "DELETE anon"; Resultado = "PASS"; Detalle = "HTTP $sc - Content-Range=$contentRange - 0 filas eliminadas" }
  } else {
    $r = [PSCustomObject]@{ Test = "DELETE anon"; Resultado = "VERIFICAR_PARTE2"; Detalle = "HTTP $sc Content-Range=$contentRange - verificar en SQL Editor que COUNT = 48" }
  }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  if ($sc -eq 403 -or $sc -eq 401) {
    $r = [PSCustomObject]@{ Test = "DELETE anon"; Resultado = "PASS"; Detalle = "HTTP $sc - eliminacion bloqueada por RLS" }
  } else {
    $r = [PSCustomObject]@{ Test = "DELETE anon"; Resultado = "VERIFICAR_PARTE2"; Detalle = "HTTP $sc - verificar en SQL Editor que COUNT = 48" }
  }
}
$resultados += $r
Write-Host "  $($r.Resultado): $($r.Detalle)"

# ----------------------------------------------------------
# PARTE 1-E: SELECT anon - currency_migration_batch
# ----------------------------------------------------------
Write-Section "PARTE 1-E: SELECT anon - currency_migration_batch"

try {
  $uri3 = "$SUPA_URL/rest/v1/currency_migration_batch?select=id,status&limit=1"
  $respB = Invoke-RestMethod `
    -Uri     $uri3 `
    -Method  GET `
    -Headers $headers `
    -ErrorAction Stop

  if ($respB -is [System.Array] -and $respB.Count -eq 0) {
    $r = [PSCustomObject]@{ Test = "SELECT anon batch"; Resultado = "PASS"; Detalle = "200 OK - body=[] - 0 filas visibles" }
  } else {
    $r = [PSCustomObject]@{ Test = "SELECT anon batch"; Resultado = "FAIL_SEGURIDAD"; Detalle = "Respondio $($respB.Count) filas - RLS no esta funcionando" }
  }
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  $r = [PSCustomObject]@{ Test = "SELECT anon batch"; Resultado = "PASS"; Detalle = "HTTP $sc - acceso bloqueado" }
}
$resultados += $r
Write-Host "  $($r.Resultado): $($r.Detalle)"

# ----------------------------------------------------------
# RESUMEN PARTE 1
# ----------------------------------------------------------
Write-Host "`n=== RESUMEN PARTE 1 (operaciones anon) ===" -ForegroundColor Yellow
$resultados | Format-Table -AutoSize

$fallos    = $resultados | Where-Object { $_.Resultado -eq "FAIL_SEGURIDAD" }
$verificar = $resultados | Where-Object { $_.Resultado -eq "VERIFICAR_PARTE2" }
$pass      = $resultados | Where-Object { $_.Resultado -eq "PASS" }

$color = if ($fallos.Count -gt 0) { "Red" } elseif ($verificar.Count -gt 0) { "Yellow" } else { "Green" }
Write-Host "PASS: $($pass.Count)  |  FAIL_SEGURIDAD: $($fallos.Count)  |  VERIFICAR_PARTE2: $($verificar.Count)" -ForegroundColor $color

if ($fallos.Count -gt 0) {
  Write-Host "`nALERTA CRITICA: RLS no esta bloqueando. Detener - no proceder con Parte 2." -ForegroundColor Red
  exit 1
}

# ----------------------------------------------------------
# PARTE 2: SQL DE VERIFICACION DE EFECTO REAL
# Pegar en SQL Editor de Supabase despues de Parte 1.
# ----------------------------------------------------------

Write-Host @"

=================================================================
PARTE 2 - SQL DE VERIFICACION DE EFECTO REAL (OA-012-03)
Pegar en SQL Editor de Supabase. Todas las queries deben pasar.
=================================================================

-- Verificacion 1: El total sigue siendo 48 (DELETE no borro nada)
SELECT COUNT(*) AS total_activos,
  CASE WHEN COUNT(*) = 48 THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM currency_tc
WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
  AND estado = 'activo';
-- Esperado: total_activos=48, resultado=PASS

-- Verificacion 2: USD-CLP 2026-07-07 sigue siendo 926.25 (UPDATE no modifico nada)
SELECT ROUND(valor, 2) AS valor_actual,
  CASE WHEN ROUND(valor, 2) = 926.25 THEN 'PASS' ELSE 'FAIL_UPDATE_APLICADO' END AS resultado
FROM currency_tc
WHERE moneda_origen = 'USD' AND moneda_destino = 'CLP'
  AND fecha = '2026-07-07' AND estado = 'activo';
-- Esperado: valor_actual=926.25, resultado=PASS

-- Verificacion 3: El INSERT de prueba (fecha=2026-12-31) no existe
SELECT COUNT(*) AS registros_test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL_INSERT_APLICADO' END AS resultado
FROM currency_tc
WHERE fecha = '2026-12-31'
  AND fuente = 'rls_test_anon_DEBE_FALLAR';
-- Esperado: registros_test=0, resultado=PASS

-- Verificacion 4: Politicas siguen siendo 0
SELECT COUNT(*) AS politicas,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS resultado
FROM pg_policies
WHERE tablename IN (
  'currency_tc','currency_rate_type','currency_rate_purpose',
  'currency_canonical_pair','currency_migration_batch'
);
-- Esperado: politicas=0, resultado=PASS

=================================================================
Copiar output de Parte 1 + Parte 2 al acta AC-CURRENCY-F1.1 seccion 11.
=================================================================
"@ -ForegroundColor Cyan
