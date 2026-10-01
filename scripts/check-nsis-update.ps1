$ErrorActionPreference = 'Stop'
$directory = Join-Path ([IO.Path]::GetTempPath()) "portal-nsis-$([guid]::NewGuid())"
$setup = Get-ChildItem -LiteralPath 'release' -Filter '*-setup.exe' | Select-Object -First 1
if (!$setup) { throw 'NSIS installer missing' }
try {
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    $process = Start-Process -FilePath $setup.FullName -ArgumentList @('/S', "/D=$directory") -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "NSIS installer failed: $($process.ExitCode)" }
    $record = Get-Content -LiteralPath (Join-Path $directory '.portal-console-install.json') -Raw | ConvertFrom-Json
    if ($record.method -ne 'windows-nsis') { throw 'NSIS install record missing or incorrect' }
    if ($attempt -eq 2 -and ($record.previousMethod -ne 'windows-nsis' -or !$record.previousVersion)) { throw 'NSIS upgrade history missing' }
  }
  'NSIS installation and recorded upgrade verified'
} finally {
  $uninstaller = Get-ChildItem -LiteralPath $directory -Filter '*uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($uninstaller) { Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait }
}
