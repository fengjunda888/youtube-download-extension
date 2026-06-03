param(
  [string]$ExtensionId = "lgdfehfacdnpknkphkfmmollklciaaal",
  [string]$PublishDir = (Join-Path $PSScriptRoot "publish"),
  [string]$YtDlpPath = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PublishDir)) {
  throw "Publish directory not found: $PublishDir. Run build-host.ps1 first."
}

$exe = Get-ChildItem -LiteralPath $PublishDir -Filter "YouTubeYtDlpHost.exe" | Select-Object -First 1
if (-not $exe) {
  throw "YouTubeYtDlpHost.exe not found in $PublishDir. Build the host first."
}

if ([string]::IsNullOrWhiteSpace($YtDlpPath)) {
  $cmd = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if ($cmd) {
    $YtDlpPath = $cmd.Source
  }
}

$manifestPath = Join-Path $PublishDir "com.fengj.youtube_ytdlp.json"
$manifest = @{
  name = "com.fengj.youtube_ytdlp"
  description = "Native host for downloading YouTube videos with yt-dlp"
  path = $exe.FullName
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4

Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8

$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.fengj.youtube_ytdlp"
New-Item -Path $regPath -Force -Value $manifestPath | Out-Null
& reg.exe add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.fengj.youtube_ytdlp" /ve /t REG_SZ /d "$manifestPath" /f | Out-Null

if (-not [string]::IsNullOrWhiteSpace($YtDlpPath)) {
  [Environment]::SetEnvironmentVariable("YTDLP_PATH", $YtDlpPath, "User")
}

Write-Host "Installed native host manifest:"
Write-Host $manifestPath
Write-Host "Extension ID:"
Write-Host $ExtensionId
if (-not [string]::IsNullOrWhiteSpace($YtDlpPath)) {
  Write-Host "yt-dlp path:"
  Write-Host $YtDlpPath
}
Write-Host "Restart Chrome, then reload the extension."
