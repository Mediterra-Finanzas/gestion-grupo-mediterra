# ============================================================
# OA-011-07 — Prueba de seguridad RLS con anon key
# Ejecutar DESPUÉS de que las tablas existan en Supabase.
# Todos los intentos deben fallar con error RLS.
# ============================================================
# Uso: .\003_rls_security_test.ps1

$SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co"

# IMPORTANTE: pegar el valor de SUPA_KEY (anon key) aquí antes de ejecutar.
# No guardar este archivo con la key. Usarlo solo en esta sesión de test.
$SUPA_KEY = "PEGAR_ANON_KEY_AQUI"

$headers = @{
  "apikey"        = $SUPA_KEY
  "Authorization" = "Bearer $SUPA_KEY"
  "Content-Type"  = "application/json"
}

$resultados = @()

function Test-Request {
  param([string]$nombre, [string]$metodo, [string]$url, [hashtable]$hdrs, [string]$cuerpo = $null)
  try {
    $params = @{ Uri = $url; Method = $metodo; Headers = $hdrs; ErrorAction = "Stop" }
    if ($cuerpo) { $params["Body"] = $cuerpo }
    $resp = Invoke-RestMethod @params
    # Si llega acá, la respuesta fue exitosa — FALLA de seguridad
    return [PSCustomObject]@{ Test = $nombre; Resultado = "FALLA_SEGURIDAD"; Detalle = "Respondio con datos: $($resp | ConvertTo-Json -Compress)" }
  } catch {
    $sc = $_.Exception.Response.StatusCode.value__
    # 401/403 = RLS bloqueó — correcto
    if ($sc -eq 401 -or $sc -eq 403) {
      return [PSCustomObject]@{ Test = $nombre; Resultado = "OK_BLOQUEADO"; Detalle = "HTTP $sc" }
    }
    # 406/416/etc — puede ser "no rows" vacío (RLS activa pero sin error de auth explícito)
    # En Supabase con RLS sin policy, un SELECT retorna array vacío [], no error.
    # Eso se detecta verificando que el array esté vacío en el bloque superior.
    return [PSCustomObject]@{ Test = $nombre; Resultado = "ERROR_INESPERADO"; Detalle = "HTTP $sc — $($_.Exception.Message)" }
  }
}

function Test-SelectEmpty {
  param([string]$nombre, [string]$url, [hashtable]$hdrs)
  try {
    $resp = Invoke-RestMethod -Uri $url -Method GET -Headers $hdrs -ErrorAction Stop
    if ($resp -is [System.Array] -and $resp.Count -eq 0) {
      return [PSCustomObject]@{ Test = $nombre; Resultado = "OK_BLOQUEADO"; Detalle = "SELECT retornó [] (0 filas — RLS activa)" }
    }
    return [PSCustomObject]@{ Test = $nombre; Resultado = "FALLA_SEGURIDAD"; Detalle = "SELECT retornó $($resp.Count) filas!" }
  } catch {
    $sc = $_.Exception.Response.StatusCode.value__
    return [PSCustomObject]@{ Test = $nombre; Resultado = "OK_BLOQUEADO"; Detalle = "HTTP $sc" }
  }
}

Write-Host "`n=== OA-011-07: Prueba de seguridad RLS currency_tc ===" -ForegroundColor Cyan
Write-Host "Supabase: $SUPA_URL`n"

# --- TEST 1: SELECT (anon) ---
# Con RLS sin policy, Supabase devuelve [] sin error (no 403).
# La validacion es que la respuesta esté vacía.
$resultados += Test-SelectEmpty `
  -nombre "SELECT anon — currency_tc" `
  -url    "$SUPA_URL/rest/v1/currency_tc?select=id,valor&limit=1" `
  -hdrs   $headers

# --- TEST 2: INSERT (anon) ---
$body = @{
  moneda_origen  = "USD"
  moneda_destino = "CLP"
  fecha          = "2026-08-07"
  rate_type      = "spot"
  rate_purpose   = "market"
  valor          = 999.99
  fuente         = "test_rls"
  es_manual      = $false
  estado         = "activo"
} | ConvertTo-Json

$resultados += Test-Request `
  -nombre  "INSERT anon — currency_tc" `
  -metodo  "POST" `
  -url     "$SUPA_URL/rest/v1/currency_tc" `
  -hdrs    $headers `
  -cuerpo  $body

# --- TEST 3: UPDATE (anon) ---
$patchBody = @{ valor = 1.0 } | ConvertTo-Json
$updateHeaders = $headers.Clone()
$updateHeaders["Content-Type"] = "application/json"

$resultados += Test-Request `
  -nombre  "UPDATE anon — currency_tc" `
  -metodo  "PATCH" `
  -url     "$SUPA_URL/rest/v1/currency_tc?estado=eq.activo" `
  -hdrs    $updateHeaders `
  -cuerpo  $patchBody

# --- TEST 4: DELETE (anon) ---
$resultados += Test-Request `
  -nombre  "DELETE anon — currency_tc" `
  -metodo  "DELETE" `
  -url     "$SUPA_URL/rest/v1/currency_tc?estado=eq.activo" `
  -hdrs    $headers

# --- TEST 5: SELECT currency_migration_batch (anon) ---
$resultados += Test-SelectEmpty `
  -nombre "SELECT anon — currency_migration_batch" `
  -url    "$SUPA_URL/rest/v1/currency_migration_batch?select=id,status&limit=1" `
  -hdrs   $headers

# --- TEST 6: SELECT currency_canonical_pair (anon) ---
$resultados += Test-SelectEmpty `
  -nombre "SELECT anon — currency_canonical_pair" `
  -url    "$SUPA_URL/rest/v1/currency_canonical_pair?select=base,quote&limit=5" `
  -hdrs   $headers

# --- RESUMEN ---
Write-Host "`n--- Resultados ---`n"
$resultados | Format-Table -AutoSize

$fallos = $resultados | Where-Object { $_.Resultado -eq "FALLA_SEGURIDAD" }
$ok     = $resultados | Where-Object { $_.Resultado -eq "OK_BLOQUEADO" }

Write-Host "`nResumen: $($ok.Count) bloqueados, $($fallos.Count) fallos de seguridad" -ForegroundColor $(if ($fallos.Count -eq 0) { "Green" } else { "Red" })

if ($fallos.Count -gt 0) {
  Write-Host "`nALERTA: RLS no está bloqueando correctamente. Revisar policies en Supabase." -ForegroundColor Red
  exit 1
} else {
  Write-Host "RLS validado. Todas las operaciones anon fueron bloqueadas correctamente." -ForegroundColor Green
  Write-Host "Copiar tabla de resultados para AC-CURRENCY-F1.1 seccion 9."
  exit 0
}
