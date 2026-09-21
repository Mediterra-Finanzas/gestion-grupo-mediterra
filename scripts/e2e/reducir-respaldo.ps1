# ─────────────────────────────────────────────────────────────────────────────
# Reduce el respaldo de la app (botón "💾 Respaldo") a las tres filas que
# necesita scripts/e2e/real.mjs, sin tocar el original.
#
#   .\reducir-respaldo.ps1 -Origen "$HOME\Downloads\backup_mediterra_2026-09-21.json"
#
# Qué NO hace: no incluye `pins` ni ningún otro módulo, no imprime datos ni
# credenciales, no sobrescribe un snapshot anterior sin confirmación y no deja
# un archivo "aparentemente correcto" si la fila finanzas viene vacía.
# ─────────────────────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $Origen,
  [string] $Destino = "$HOME\Downloads\snapshot-finanzas.json",
  [switch] $Forzar   # permite sobrescribir un snapshot existente sin preguntar
)

$ErrorActionPreference = 'Stop'
$FILAS = @('finanzas', 'finanzas_bancos', 'finanzas_esc_index')
# La fila `finanzas` debe traer, al menos, algunas de estas claves para ser
# reconocible como el módulo de flujo (si no, el formato cambió).
$CLAVES_FINANZAS = @('allegria_params', 'finanzas_real', 'params_emp', 'params_af',
                     'params_ap', 'params_osiris', 'sub_lines', 'added_lines')

function Salir($msg) { Write-Host $msg; exit 1 }

if (-not (Test-Path -LiteralPath $Origen)) { Salir "No encuentro el respaldo: $Origen" }

try   { $b = Get-Content -LiteralPath $Origen -Raw -Encoding UTF8 | ConvertFrom-Json }
catch { Salir "El archivo no es JSON válido. ¿Se descargó completo?" }

# ── estructura esperada del botón Respaldo ──────────────────────────────────
if ($null -eq $b.tablas) {
  Salir "Estructura inesperada: el archivo no tiene 'tablas'. Se esperaba el JSON del botón 💾 Respaldo (campos: fecha, usuario, version, tablas)."
}
if ($b.version -and $b.version -notlike 'Mediterra Hub Backup*') {
  Write-Host "Aviso: 'version' dice '$($b.version)'. Se esperaba 'Mediterra Hub Backup v1'; continúo, pero revisa el origen."
}

$out      = [ordered]@{}
$faltan   = @()
$vacias   = @()

foreach ($id in $FILAS) {
  $fila = $b.tablas.$id
  if ($null -eq $fila)      { $faltan += $id; continue }
  $val = $fila.data
  # el respaldo guarda `data` ya parseado; si vino como texto, se parsea acá
  if ($val -is [string]) {
    try   { $val = $val | ConvertFrom-Json }
    catch { Salir "La fila '$id' trae texto que no es JSON válido: estructura inesperada, me detengo." }
  }
  if ($null -eq $val)       { $vacias += $id; continue }
  if ($val.PSObject.Properties.Count -eq 0) { $vacias += $id; continue }
  $out[$id] = [ordered]@{ value = $val; updated_at = $fila.updated_at }
}

# ── la fila finanzas es obligatoria y tiene que ser reconocible ─────────────
if (-not $out.Contains('finanzas')) {
  Salir "La fila 'finanzas' falta o viene vacía en el respaldo. Sin ella no hay nada que validar: no genero el archivo."
}
$claves    = @($out['finanzas'].value.PSObject.Properties.Name)
$conocidas = @($claves | Where-Object { $CLAVES_FINANZAS -contains $_ })
if ($conocidas.Count -eq 0) {
  Salir ("La fila 'finanzas' no se parece al módulo de flujo (no trae ninguna de: " +
         ($CLAVES_FINANZAS -join ', ') + "). Estructura inesperada: me detengo.")
}
if (-not ($claves -contains 'allegria_params')) {
  Write-Host "Aviso: 'finanzas' no trae 'allegria_params' (los parámetros de Allegria Foods). La validación de anticipos quedará sin datos que comparar."
}

foreach ($f in $faltan) { Write-Host "Aviso: falta la fila '$f' en el respaldo; el snapshot sale sin ella." }
foreach ($v in $vacias) { Write-Host "Aviso: la fila '$v' viene vacía; no se incluye." }

# ── no pisar un snapshot anterior sin confirmación ──────────────────────────
if ((Test-Path -LiteralPath $Destino) -and -not $Forzar) {
  $prev = (Get-Item -LiteralPath $Destino)
  $r = Read-Host ("Ya existe {0} ({1:N0} KB, {2}). ¿Sobrescribir? [s/N]" -f $prev.Name, ($prev.Length/1KB), $prev.LastWriteTime)
  if ($r -notin @('s','S','si','Si','SI','y','Y')) { Salir "Cancelado: el snapshot anterior queda como estaba." }
}

$json = $out | ConvertTo-Json -Depth 100 -Compress
$json | Set-Content -LiteralPath $Destino -Encoding UTF8

$tam = (Get-Item -LiteralPath $Destino).Length
if ($tam -lt 1024) { Salir "El archivo generado pesa $tam bytes: demasiado poco, algo salió mal. Revísalo antes de enviarlo." }

Write-Host ("Listo: {0} fila(s) [{1}] -> {2} ({3:N0} KB). Original sin modificar." -f `
  $out.Count, ($out.Keys -join ', '), (Split-Path $Destino -Leaf), ($tam/1KB))
Write-Host "No incluye pins ni otros módulos."
