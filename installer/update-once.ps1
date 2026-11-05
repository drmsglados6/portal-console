param([string]$InstallDir, [switch]$CheckOnly, [switch]$Yes)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + $env:PSModulePath
if (!$InstallDir) {
  $InstallDir = [Environment]::GetEnvironmentVariable('PORTAL_CONSOLE_HOME', 'User')
  if (!$InstallDir) {
    $installed = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -like 'Portal Console*' -and $_.InstallLocation } | Select-Object -First 1
    if ($installed) { $InstallDir = $installed.InstallLocation }
  }
  if (!$InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\portal-console' }
}
$executable = Join-Path $InstallDir 'portal-console.exe'
if (!(Test-Path -LiteralPath $executable)) { throw 'Installed Portal Console not found. Pass -InstallDir with its directory.' }
$running = Get-Process -Name 'portal-console','Portal Console' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$($InstallDir.TrimEnd('\'))\*" }
if ($running -and !$CheckOnly) { throw 'Close the installed Portal Console first, then run this script from an external PowerShell window.' }
$work = Join-Path ([IO.Path]::GetTempPath()) "portal-update-bootstrap-$([guid]::NewGuid())"
$savedRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
  New-Item -ItemType Directory -Path $work | Out-Null
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/drmsglados6/portal-console/releases/tags/v0.1.8' -Headers @{ 'User-Agent' = 'Portal-Console-Updater' }
  $asset = @($release.assets | Where-Object { $_.name -eq 'update-once.cjs' })
  $expectedUrl = 'https://github.com/drmsglados6/portal-console/releases/download/v0.1.8/update-once.cjs'
  if ($release.draft -or $release.prerelease -or $asset.Count -ne 1 -or $asset[0].browser_download_url -ne $expectedUrl -or $asset[0].digest -notmatch '^sha256:[a-f0-9]{64}$' -or $asset[0].size -le 0 -or $asset[0].size -gt 4194304) { throw 'Invalid updater release metadata.' }
  $script = Join-Path $work 'update-once.cjs'
  Invoke-WebRequest -UseBasicParsing -Uri $expectedUrl -OutFile $script
  if ((Get-Item -LiteralPath $script).Length -ne $asset[0].size -or (Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset[0].digest.Substring(7)) { throw 'Updater SHA-256/size verification failed.' }
  $env:ELECTRON_RUN_AS_NODE = '1'
  $arguments = @($script)
  if ($CheckOnly) { $arguments += '--check' }
  if ($Yes) { $arguments += '--yes' }
  & $executable @arguments
  if ($LASTEXITCODE -ne 0) { throw "Updater exited with $LASTEXITCODE." }
} finally {
  $env:ELECTRON_RUN_AS_NODE = $savedRunAsNode
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
