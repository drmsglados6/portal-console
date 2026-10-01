param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Programs\Portal Console",
  [string]$LogDir = "$env:APPDATA\portal-console\logs",
  [switch]$RemoveLogs,
  [switch]$SkipEnvironment
)

$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath (Join-Path $InstallDir '.portal-console-install.json')) {
  $record = Get-Content -LiteralPath (Join-Path $InstallDir '.portal-console-install.json') -Raw | ConvertFrom-Json
  if ($record.appId -ne 'science.aperture.portalconsole' -or $record.method -ne 'windows-simple') { throw 'Use the uninstaller for the recorded installation method.' }
}
$running = Get-Process -Name 'portal-console' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$InstallDir*" }
if ($running) { throw 'Close Portal Console before uninstalling it.' }

if (!$SkipEnvironment) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($userPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ine $InstallDir.TrimEnd('\') })
  [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
  [Environment]::SetEnvironmentVariable('PORTAL_CONSOLE_HOME', $null, 'User')
  [Environment]::SetEnvironmentVariable('PORTAL_CONSOLE_LOG_DIR', $null, 'User')
}

if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force }
if ($RemoveLogs -and (Test-Path -LiteralPath $LogDir)) { Remove-Item -LiteralPath $LogDir -Recurse -Force }
Write-Host 'Portal Console was uninstalled. Logs were preserved unless -RemoveLogs was specified.'
