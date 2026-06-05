param(
  [string]$Version = "0.1.0",
  [string]$OutDir = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseName = "youtube-yt-dlp-downloader-$Version"
$staging = Join-Path $OutDir $releaseName
$zipPath = Join-Path $OutDir "$releaseName.zip"

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

if (Test-Path $staging) {
  throw "Staging directory already exists: $staging. Remove it manually before packaging again."
}

New-Item -ItemType Directory -Path $staging | Out-Null

dotnet publish (Join-Path $root "native-host\native-host.csproj") -c Release -o (Join-Path $staging "native-host\publish")

Copy-Item -LiteralPath (Join-Path $root "extension") -Destination (Join-Path $staging "extension") -Recurse
Copy-Item -LiteralPath (Join-Path $root "native-host\build-host.ps1") -Destination (Join-Path $staging "native-host\build-host.ps1")
Copy-Item -LiteralPath (Join-Path $root "native-host\build-host.sh") -Destination (Join-Path $staging "native-host\build-host.sh")
Copy-Item -LiteralPath (Join-Path $root "native-host\install-native-host.ps1") -Destination (Join-Path $staging "native-host\install-native-host.ps1")
Copy-Item -LiteralPath (Join-Path $root "native-host\install-native-host.sh") -Destination (Join-Path $staging "native-host\install-native-host.sh")
Copy-Item -LiteralPath (Join-Path $root "native-host\native-host.csproj") -Destination (Join-Path $staging "native-host\native-host.csproj")
Copy-Item -LiteralPath (Join-Path $root "native-host\Program.cs") -Destination (Join-Path $staging "native-host\Program.cs")
Copy-Item -LiteralPath (Join-Path $root "Install-NativeHost.bat") -Destination (Join-Path $staging "Install-NativeHost.bat")
Copy-Item -LiteralPath (Join-Path $root "Install-NativeHost.sh") -Destination (Join-Path $staging "Install-NativeHost.sh")
Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination (Join-Path $staging "README.md")
Copy-Item -LiteralPath (Join-Path $root "LICENSE") -Destination (Join-Path $staging "LICENSE")

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -LiteralPath (Join-Path $staging "*") -DestinationPath $zipPath -Force

Write-Host "Created release zip:"
Write-Host $zipPath
