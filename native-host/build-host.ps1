param(
  [string]$PublishDir = (Join-Path $PSScriptRoot "publish")
)

$ErrorActionPreference = "Stop"

dotnet publish (Join-Path $PSScriptRoot "native-host.csproj") -c Release -r win-x64 --self-contained false -o $PublishDir

Write-Host "Published host to $PublishDir"
