param([string]$ReleaseDirectory = 'release-current')

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$payload = Join-Path $root "$ReleaseDirectory\win-unpacked"
$output = Join-Path $root "$ReleaseDirectory\installer"
$archive = Join-Path $output 'Portal-Console-win-x64.zip'

if (!(Test-Path -LiteralPath (Join-Path $payload 'portal-console.exe'))) {
  throw 'Packaged application was not found.'
}

New-Item -ItemType Directory -Path $output -Force | Out-Null
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
$installerFiles = @('install.cmd', 'install.ps1', 'uninstall.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archived = $false
for ($attempt = 1; $attempt -le 5 -and !$archived; $attempt++) {
  try {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    [IO.Compression.ZipFile]::CreateFromDirectory($payload, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
    $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Update)
    try {
      foreach ($name in $installerFiles) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $root "installer\$name"), $name) | Out-Null
      }
    } finally {
      $zip.Dispose()
    }
    $archived = $true
  } catch {
    if ($attempt -eq 5) { throw }
    Write-Warning "Payload is temporarily locked; retrying archive creation ($attempt/5)."
    Start-Sleep -Seconds (2 * $attempt)
  }
}
foreach ($name in $installerFiles) {
  Copy-Item -LiteralPath (Join-Path $root "installer\$name") -Destination $output -Force
}
Write-Host "Installer bundle created at $output"
