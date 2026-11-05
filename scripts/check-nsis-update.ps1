$ErrorActionPreference = 'Stop'
$directory = Join-Path ([IO.Path]::GetTempPath()) "portal-nsis-$([guid]::NewGuid())"
$setup = Get-ChildItem -LiteralPath 'release' -Filter '*-setup.exe' | Select-Object -First 1
if (!$setup) { throw 'NSIS installer missing' }
try {
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    if ($attempt -eq 1) { $process = Start-Process -FilePath $setup.FullName -ArgumentList @('/S', "/D=$directory") -Wait -PassThru }
    else {
      $work = Join-Path ([IO.Path]::GetTempPath()) "portal-worker-$([guid]::NewGuid())"
      New-Item -ItemType Directory -Path $work | Out-Null
      $plan = @{ version='fixture'; parentPid=0; method='windows-nsis'; file=$setup.FullName; target=$directory; work=$work; logFile=(Join-Path $work 'update.log'); digest=(Get-FileHash -LiteralPath $setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
      $planFile = Join-Path $work 'plan.json'
      $plan | ConvertTo-Json | Set-Content -LiteralPath $planFile -Encoding UTF8
      $worker = Join-Path (Get-Location) 'src\update-runner.ps1'
      $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$worker`"", '-PlanFile', "`"$planFile`"", '-NonInteractive', '-NoRestart') -Wait -PassThru
    }
    if ($process.ExitCode -ne 0) { throw "NSIS installer failed: $($process.ExitCode)" }
    $record = Get-Content -LiteralPath (Join-Path $directory '.portal-console-install.json') -Raw | ConvertFrom-Json
    if ($record.method -ne 'windows-nsis') { throw 'NSIS install record missing or incorrect' }
    if (!(Test-Path -LiteralPath (Join-Path $directory 'pconsole.cmd'))) { throw 'pconsole launcher missing' }
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (!(@($userPath -split ';') -contains $directory)) { throw 'pconsole installation directory missing from user PATH' }
    if ($attempt -eq 2 -and ($record.previousMethod -ne 'windows-nsis' -or !$record.previousVersion)) { throw 'NSIS upgrade history missing' }
  }
  'NSIS installation and recorded upgrade verified'
} finally {
  $uninstaller = Get-ChildItem -LiteralPath $directory -Filter '*uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($uninstaller) { Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait }
}
