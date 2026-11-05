param([Parameter(Mandatory=$true)][string]$PlanFile, [switch]$NonInteractive, [switch]$NoRestart, [switch]$SkipEnvironment)
$ErrorActionPreference = 'Stop'
# A caller running pwsh can otherwise make Windows PowerShell load pwsh modules.
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + $env:PSModulePath
$plan = Get-Content -LiteralPath $PlanFile -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Path (Split-Path -Parent $plan.logFile) -Force | Out-Null
function Log([string]$Message) { Add-Content -LiteralPath $plan.logFile -Value "$(Get-Date -Format o) $Message" -Encoding UTF8 }
try {
  Log "Updating Portal Console to $($plan.version) ($($plan.method))"
  Set-Content -LiteralPath (Join-Path $plan.work 'started') -Value 'ready' -Encoding ASCII
  $parent = if ($plan.parentPid -gt 0) { Get-Process -Id $plan.parentPid -ErrorAction SilentlyContinue } else { $null }
  if ($parent -and !$parent.WaitForExit(120000)) { throw 'Application did not close; update cancelled.' }
  if ((Get-FileHash -LiteralPath $plan.file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.digest) { throw 'SHA-256 verification failed.' }
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  switch ($plan.method) {
    'windows-nsis' {
      # NSIS requires /D= to be the last, unquoted argument, including spaces.
      $installer = Start-Process -FilePath $plan.file -ArgumentList "/S /D=$($plan.target)" -Wait -PassThru
      if ($installer.ExitCode -ne 0) { throw "Installer exited with $($installer.ExitCode)." }
      if (!$NoRestart) { Start-Process -FilePath (Join-Path $plan.target 'portal-console.exe') }
    }
    'windows-simple' {
      $unpacked = Join-Path $plan.work 'unpacked'
      Expand-Archive -LiteralPath $plan.file -DestinationPath $unpacked
      $installer = Join-Path $unpacked 'installer\install.ps1'
      $source = Join-Path $unpacked 'installer\Portal-Console-win-x64.zip'
      & $installer -Source $source -InstallDir $plan.target -LogDir (Split-Path -Parent $plan.logFile) -SkipEnvironment:$SkipEnvironment *>> $plan.logFile
      if (!$NoRestart) { Start-Process -FilePath (Join-Path $plan.target 'portal-console.exe') }
    }
    'windows-portable' {
      $stage = "$($plan.target).update-$PID.exe"
      Copy-Item -LiteralPath $plan.file -Destination $stage
      try {
        # The portable launcher can outlive its Electron child briefly.
        for ($attempt = 0; ; $attempt++) {
          try { [IO.File]::Replace($stage, $plan.target, [NullString]::Value); break }
          catch { if ($attempt -ge 39) { throw }; Start-Sleep -Milliseconds 250 }
        }
      }
      finally { if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force } }
      if (!$NoRestart) { Start-Process -FilePath $plan.target }
    }
    default { throw "Unsupported update method: $($plan.method)" }
  }
  Log 'Update completed.'
  try { Remove-Item -LiteralPath $plan.work -Recurse -Force }
  catch { Log "Update succeeded; temporary cleanup deferred: $($plan.work)" }
} catch {
  Log "UPDATE FAILED: $($_.Exception.Message)"
  if ($NonInteractive) { [Console]::Error.WriteLine("$($_.Exception.Message) Log: $($plan.logFile)") }
  else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("$($_.Exception.Message)`nLog: $($plan.logFile)", 'Portal Console update failed') | Out-Null
  }
  exit 1
}
