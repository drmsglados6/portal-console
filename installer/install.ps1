param(
  [string]$Source,
  [string]$InstallDir = "$env:LOCALAPPDATA\Programs\Portal Console",
  [string]$LogDir = "$env:APPDATA\portal-console\logs",
  [switch]$SkipEnvironment
)

$ErrorActionPreference = 'Stop'
$temporaryDirectory = $null

function Get-InstallMethod([string]$Directory) {
  $recordFile = Join-Path $Directory '.portal-console-install.json'
  if (Test-Path -LiteralPath $recordFile) {
    $record = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
    if ($record.appId -ne 'science.aperture.portalconsole' -or $record.schemaVersion -ne 1) { throw 'Invalid installation record.' }
    return $record
  }
  if ((Test-Path -LiteralPath (Join-Path $Directory 'uninstall.ps1')) -and (Test-Path -LiteralPath (Join-Path $Directory 'portal-console.cmd'))) {
    if ((Test-Path -LiteralPath (Join-Path $Directory 'portal-console.exe')) -or (Test-Path -LiteralPath (Join-Path $Directory 'Portal Console.exe'))) {
      return [pscustomobject]@{ method = 'windows-simple-legacy'; version = $null }
    }
  }
  if (Get-ChildItem -LiteralPath $Directory -Filter '*uninstall*.exe' -ErrorAction SilentlyContinue) {
    return [pscustomobject]@{ method = 'windows-nsis'; version = $null }
  }
  return [pscustomobject]@{ method = 'unknown'; version = $null }
}

function Write-InstallLog([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      [IO.File]::AppendAllText((Join-Path $LogDir 'install.log'), "$line`r`n", [Text.UTF8Encoding]::new($false))
      break
    } catch [System.IO.IOException] {
      if ($attempt -eq 5) { Write-Warning "Could not write install log: $($_.Exception.Message)" }
      else { Start-Sleep -Milliseconds (200 * $attempt) }
    }
  }
  Write-Host $Message
}

try {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  Write-InstallLog 'Portal Console installation started.'

  if (!$Source) {
    $bundledArchive = Join-Path $PSScriptRoot 'Portal-Console-win-x64.zip'
    $developmentPayload = Join-Path (Split-Path $PSScriptRoot -Parent) 'release-current\win-unpacked'
    if (Test-Path -LiteralPath $bundledArchive) { $Source = $bundledArchive }
    elseif (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'portal-console.exe')) { $Source = $PSScriptRoot }
    elseif (Test-Path -LiteralPath $developmentPayload) { $Source = $developmentPayload }
    else { throw 'Payload was not found. Pass -Source with a ZIP or win-unpacked directory.' }
  }

  $Source = (Resolve-Path -LiteralPath $Source).Path
  if ((Get-Item -LiteralPath $Source).PSIsContainer) {
    $payloadDirectory = $Source
  } elseif ([IO.Path]::GetExtension($Source) -eq '.zip') {
    $temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) "portal-console-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
    Expand-Archive -LiteralPath $Source -DestinationPath $temporaryDirectory -Force
    $executable = Get-ChildItem -LiteralPath $temporaryDirectory -Filter 'portal-console.exe' -Recurse | Select-Object -First 1
    if (!$executable) { throw 'portal-console.exe was not found in the archive.' }
    $payloadDirectory = $executable.DirectoryName
  } else {
    throw 'Only a ZIP archive or an unpacked directory is supported.'
  }

  if (!(Test-Path -LiteralPath (Join-Path $payloadDirectory 'portal-console.exe'))) {
    throw 'portal-console.exe was not found in the payload directory.'
  }

  # Follow the location registered by older simple installers unless explicitly overridden.
  if (!$PSBoundParameters.ContainsKey('InstallDir')) {
    $registeredHome = [Environment]::GetEnvironmentVariable('PORTAL_CONSOLE_HOME', 'User')
    if ($registeredHome -and (Test-Path -LiteralPath $registeredHome)) { $InstallDir = $registeredHome }
    else {
      $nsis = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'Portal Console*' -and $_.InstallLocation -and (Test-Path -LiteralPath (Join-Path $_.InstallLocation 'portal-console.exe')) } | Select-Object -First 1
      if ($nsis) { throw "An NSIS installation was found at $($nsis.InstallLocation). Update it with setup.exe instead of the simple installer." }
    }
  }
  $previous = Get-InstallMethod $InstallDir
  Write-InstallLog "Installer method: windows-simple; previous method: $($previous.method); previous version: $($previous.version)"
  if ($previous.method -notin @('unknown', 'windows-simple', 'windows-simple-legacy')) {
    throw "Existing installation uses $($previous.method). Update with its installer instead of mixing installation methods."
  }
  $buildFile = Join-Path $payloadDirectory 'resources\build-info.json'
  if (!(Test-Path -LiteralPath $buildFile)) { throw 'Build metadata is missing from the new payload.' }
  $buildInfo = Get-Content -LiteralPath $buildFile -Raw | ConvertFrom-Json
  if ($buildInfo.appId -ne 'science.aperture.portalconsole') { throw 'Invalid application payload.' }

  $running = Get-Process -Name 'portal-console','Portal Console' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$($InstallDir.TrimEnd('\'))\*" }
  if ($running) { throw 'Close the installed Portal Console before updating it.' }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item -Path (Join-Path $payloadDirectory '*') -Destination $InstallDir -Recurse -Force
  Set-Content -LiteralPath (Join-Path $InstallDir 'portal-console.cmd') -Value '@"%~dp0portal-console.exe" %*' -Encoding ASCII
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination (Join-Path $InstallDir 'uninstall.ps1') -Force
  $record = [ordered]@{
    schemaVersion = 1; appId = 'science.aperture.portalconsole'; method = 'windows-simple'; version = $buildInfo.version
    installedAt = (Get-Date).ToUniversalTime().ToString('o'); previousMethod = $previous.method; previousVersion = $previous.version
  }
  $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir '.portal-console-install.json') -Encoding UTF8
  Write-InstallLog "Installation record written: windows-simple $($buildInfo.version)"
  Write-InstallLog "Files installed to $InstallDir"

  if (!$SkipEnvironment) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    if (!($entries | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
      $entries += $InstallDir
      [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
    }
    [Environment]::SetEnvironmentVariable('PORTAL_CONSOLE_HOME', $InstallDir, 'User')
    [Environment]::SetEnvironmentVariable('PORTAL_CONSOLE_LOG_DIR', $LogDir, 'User')
    $env:PORTAL_CONSOLE_HOME = $InstallDir
    $env:PORTAL_CONSOLE_LOG_DIR = $LogDir
    Write-InstallLog 'User PATH and Portal Console environment variables registered.'
  }

  Write-InstallLog 'Installation completed successfully.'
  Write-Host "Run 'portal-console' from a new terminal, or launch '$InstallDir\portal-console.exe'."
} catch {
  try { Write-InstallLog "INSTALLATION FAILED: $($_.Exception.Message)" } catch {}
  throw
} finally {
  if ($temporaryDirectory -and (Test-Path -LiteralPath $temporaryDirectory)) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}
