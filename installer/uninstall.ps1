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
$running = Get-Process -Name 'portal-console','Portal Console' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$($InstallDir.TrimEnd('\'))\*" }
if ($running) { throw 'Close Portal Console before uninstalling it.' }

# File locks may outlive the window briefly while renderer/GPU processes exit.
# Keep environment registration intact until the application files are removed.
for ($attempt = 1; $attempt -le 6; $attempt++) {
  if (!(Test-Path -LiteralPath $InstallDir)) { break }
  try {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    break
  } catch {
    if ($attempt -eq 6) {
      throw "Could not remove Portal Console. Close its remaining processes and retry from an external PowerShell window. Environment registration was preserved. Details: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds (500 * $attempt)
  }
}

if (!$SkipEnvironment) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($userPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ine $InstallDir.TrimEnd('\') })
  [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
  [Environment]::SetEnvironmentVariable('PORTAL_CONSOLE_HOME', $null, 'User')
  [Environment]::SetEnvironmentVariable('PORTAL_CONSOLE_LOG_DIR', $null, 'User')
}

if ($RemoveLogs -and (Test-Path -LiteralPath $LogDir)) { Remove-Item -LiteralPath $LogDir -Recurse -Force }
Write-Host 'Portal Console was uninstalled. Logs were preserved unless -RemoveLogs was specified.'
