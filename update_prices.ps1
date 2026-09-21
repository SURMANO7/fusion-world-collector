# ============================================================
#  Actualizador diario — Dragon Ball Fusion World Collector
#  1) Descarga el listado de sets (detecta líneas nuevas)
#  2) Descarga productos y precios de TODOS los sets
#     (asi las cartas/cajas/sobres NUEVOS entran al catalogo)
#  3) Regenera js/data.js (catalogo completo con precios)
#     y js/prices_latest.js (snapshot fechado para el historial)
#  Despues, abre o recarga la app (F5) y veras lo nuevo.
#
#  Uso: clic derecho > "Ejecutar con PowerShell"
#  (la tarea programada "FusionWorld Precios Diarios" lo ejecuta sola cada dia a las 9:30)
# ============================================================
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = Join-Path $root 'data\raw'
if (-not (Test-Path $raw)) { New-Item -ItemType Directory -Path $raw -Force | Out-Null }
$dataFile = Join-Path $root 'js\data.js'

# recuento anterior para informar de novedades
$oldCount = 0
if (Test-Path $dataFile) {
  $oldCount = ([regex]::Matches((Get-Content $dataFile -Raw), '"i":')).Count
}

function Get-Json($url, $outFile) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $outFile -TimeoutSec 60 | Out-Null
    return $true
  } catch { Write-Host ("  fallo: " + $url) -ForegroundColor Yellow; return $false }
}

Write-Host '[1/4] Descargando lista de sets (lineas)...' -ForegroundColor Cyan
if (-not (Get-Json 'https://tcgcsv.com/tcgplayer/80/groups' (Join-Path $raw 'groups.json'))) {
  if (-not (Test-Path (Join-Path $raw 'groups.json'))) { Write-Host 'Sin groups.json ni conexion: no se puede actualizar.' -ForegroundColor Red; exit 1 }
  Write-Host '  (uso la lista de sets guardada)' -ForegroundColor Yellow
}
$groups = (Get-Content (Join-Path $raw 'groups.json') -Raw | ConvertFrom-Json).results

Write-Host ('[2/4] Descargando productos y precios de {0} sets...' -f $groups.Count) -ForegroundColor Cyan
$okSets = 0
foreach ($g in $groups) {
  $gid = $g.groupId
  $p1 = Get-Json "https://tcgcsv.com/tcgplayer/80/$gid/products" (Join-Path $raw "products_$gid.json")
  Start-Sleep -Milliseconds 400
  $p2 = Get-Json "https://tcgcsv.com/tcgplayer/80/$gid/prices" (Join-Path $raw "prices_$gid.json")
  Start-Sleep -Milliseconds 400
  if ($p1 -and $p2) { $okSets++ }
}
Write-Host ("  sets actualizados: $okSets / " + $groups.Count)

Write-Host '[3/4] Regenerando catalogo js/data.js (cartas + cajas/sobres, con precios)...' -ForegroundColor Cyan
& (Join-Path $root 'data\build_data.ps1')

Write-Host '[4/4] Generando snapshot de precios js/prices_latest.js...' -ForegroundColor Cyan
$all = @{}
foreach ($g in $groups) {
  $pricePath = Join-Path $raw ("prices_" + $g.groupId + ".json")
  if (-not (Test-Path $pricePath)) { continue }
  try { $json = Get-Content $pricePath -Raw | ConvertFrom-Json } catch { continue }
  foreach ($pr in $json.results) {
    if ($null -eq $pr.marketPrice) { continue }
    $arr = @([math]::Round([double]$pr.lowPrice,2), [math]::Round([double]$pr.midPrice,2), [math]::Round([double]$pr.marketPrice,2), [math]::Round([double]$pr.highPrice,2))
    $k = 'N'; if ($pr.subTypeName -eq 'Holofoil') { $k = 'H' }
    $pidKey = [string]$pr.productId
    if (-not $all.ContainsKey($pidKey)) { $all[$pidKey] = @{} }
    $all[$pidKey][$k] = $arr
  }
}
$date = (Get-Date).ToString('yyyy-MM-dd')
try { $lu = (Invoke-WebRequest -UseBasicParsing -Uri 'https://tcgcsv.com/last-updated.txt' -TimeoutSec 30).Content.Trim(); if ($lu -match '\d{4}-\d{2}-\d{2}') { $date = $Matches[0] } } catch {}

$snapshot = @{ date = $date; prices = $all }
$jsonOut = $snapshot | ConvertTo-Json -Depth 5 -Compress
$js = "/* Snapshot real (TCGplayer via TCGCSV) generado el $(Get-Date -Format 'yyyy-MM-dd HH:mm') por update_prices.ps1 */`nwindow.FW_PRICES=$jsonOut;"
[System.IO.File]::WriteAllText((Join-Path $root 'js\prices_latest.js'), $js, (New-Object System.Text.UTF8Encoding($false)))

$newCount = ([regex]::Matches((Get-Content $dataFile -Raw), '"i":')).Count
$diff = $newCount - $oldCount
Write-Host ""
Write-Host ("Listo: $okSets sets - $newCount productos con precio (fecha de datos $date).") -ForegroundColor Green
if ($diff -gt 0) { Write-Host ("Novedades: +$diff productos nuevos anadidos al catalogo.") -ForegroundColor Green }
elseif ($diff -eq 0) { Write-Host 'Sin productos nuevos en esta pasada.' -ForegroundColor DarkGray }
else { Write-Host ("Diferencia de catalogo: $diff productos (algunos ya no tienen precio publicado).") -ForegroundColor DarkGray }

# Publicar al enlace web (solo si la carpeta es un repositorio git conectado, p. ej. GitHub Pages)
if (Test-Path (Join-Path $root '.git')) {
  $pushed = $false
  try {
    $toolsDir = Join-Path $root 'tools'
    $gitExe = Join-Path $toolsDir 'MinGit\cmd\git.exe'
    if (-not (Test-Path $gitExe)) { $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source }
    if ($gitExe -and (Test-Path $gitExe)) {
      if (Test-Path (Join-Path $toolsDir 'gh.exe')) { $env:Path = "$toolsDir;$env:Path" }
      Push-Location $root
      $pushed = $true
      & $gitExe add js/data.js js/prices_latest.js index.html css js/app.js js/scan.js README.md COMO-PUBLICAR.md fusion-world-portable.html 2>$null
      $pending = & $gitExe status --porcelain
      if ($pending) {
        & $gitExe commit -m ("Actualizacion automatica de catalogo y precios " + (Get-Date -Format 'yyyy-MM-dd HH:mm')) | Out-Null
        & $gitExe push 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Host 'Publicada en el enlace web (git push OK).' -ForegroundColor Green }
        else { Write-Host 'No se pudo hacer push (revisa gh auth login / conexion).' -ForegroundColor Yellow }
      } else {
        Write-Host 'Sin cambios que publicar al enlace web.' -ForegroundColor DarkGray
      }
    }
  } catch { Write-Host 'Aviso: no se pudo publicar en git.' -ForegroundColor Yellow }
  finally { if ($pushed) { Pop-Location } }
}Write-Host 'Abre o recarga la app (F5) para verlo.'
