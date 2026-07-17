[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $repoRoot ".codex-local\recovery-drill"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logDirectory "drill-$timestamp.log"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Push-Location $repoRoot
try {
  & npm.cmd run drill:d1-recovery 2>&1 | Tee-Object -FilePath $logPath
  if ($LASTEXITCODE -ne 0) {
    throw "D1 recovery drill завершился с кодом $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
