param(
  [string]$PublishDir = (Join-Path $PSScriptRoot "publish")
)

$ErrorActionPreference = "Stop"

dotnet publish (Join-Path $PSScriptRoot "native-host.csproj") -c Release -o $PublishDir

Write-Host "Published host to $PublishDir"
