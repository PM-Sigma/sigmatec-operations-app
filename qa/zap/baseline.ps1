<#
  OWASP ZAP baseline scan — QA gate 5 (passive only; a full active scan is release-time).
  Binding threshold: 0 High / 0 Medium.

  Usage:   pwsh -File qa/zap/baseline.ps1 [-Port 8124]
  Exit:    0 = clean · 1 = High/Medium findings · 2 = SKIPPED (no Docker on this machine)

  Exit code 2 is what scripts/qa.mjs reports as "SKIPPED (no Docker)" with a visible warning.
  It is NEVER silent, and it is the only gate allowed to skip.
#>
param([int]$Port = 8124)

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$target = "http://host.docker.internal:$Port/index.html?login=0&sb=0"
$outDir = Join-Path $PSScriptRoot '.cache'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host ''
  Write-Host 'ZAP baseline SKIPPED — Docker is not installed on this machine.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'To run this gate, install ONE of these, then re-run `npm run qa`:'
  Write-Host ''
  Write-Host '  A. Docker Desktop (what this script uses):'
  Write-Host '       winget install --id Docker.DockerDesktop -e'
  Write-Host '     then re-run:  pwsh -File qa/zap/baseline.ps1'
  Write-Host ''
  Write-Host '  B. ZAP itself, no Docker (the desktop package ships the same script):'
  Write-Host '       winget install --id ZAP.ZAP -e'
  Write-Host '     then, with the static server up (node qa/playwright/server.mjs 8124):'
  Write-Host ("       & `"$env:ProgramFiles\ZAP\Zed Attack Proxy\zap.bat`" -cmd -quickurl " +
              "`"http://127.0.0.1:$Port/index.html?login=0&sb=0`" -quickprogress " +
              "-quickout `"$outDir\zap-baseline.html`"")
  Write-Host ''
  Write-Host '  Read the report and treat any High or Medium as a gate failure.'
  Write-Host ''
  exit 2
}

# The server has to be reachable from INSIDE the container, hence host.docker.internal.
$server = $null
try {
  $up = $false
  try { $up = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $up = $false }
  if (-not $up) {
    $server = Start-Process -FilePath 'node' -ArgumentList @((Join-Path $root 'qa\playwright\server.mjs'), "$Port") -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }

  # -I = do not fail on warnings; the exit code we care about is the one -l MEDIUM produces.
  docker run --rm `
    -v "${outDir}:/zap/wrk:rw" `
    --add-host=host.docker.internal:host-gateway `
    zaproxy/zap-stable zap-baseline.py `
    -t $target `
    -r zap-baseline.html -J zap-baseline.json `
    -l MEDIUM
  $code = $LASTEXITCODE
  Write-Host "ZAP baseline exit=$code · report: $outDir\zap-baseline.html"
  exit $code
} finally {
  if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
