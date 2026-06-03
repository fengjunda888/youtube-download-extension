# YouTube yt-dlp Downloader

A local Chrome extension for sending YouTube videos to `yt-dlp` from the browser popup. It uses Chrome Native Messaging to start a small Windows native host on demand, so there is no always-running local HTTP server and no PowerShell window to keep open.

![Popup screenshot](docs/screenshots/popup-ready.png)

## Features

- Start downloads directly from the current YouTube tab.
- Track multiple concurrent download tasks in the popup.
- Show task status, progress, speed, ETA, and recent `yt-dlp` output.
- Download the current video or an entire playlist.
- Choose quality presets: best single-file MP4, up to 1080p, 720p, 480p, or MP3 audio.
- Cancel running tasks.
- Store logs in a `yt-dlp-logs` folder inside the chosen download directory.

## Important limitations

This project does not bypass YouTube access controls. It can only download videos that your network, account, cookies, and `yt-dlp` are allowed to access. Members-only videos, private videos, deleted videos, region-blocked videos, or videos requiring a permission your account does not have will still fail.

Use this tool only for content you have the right to download.

## Requirements

- Windows 10 or later
- Google Chrome or another Chromium browser that supports Native Messaging
- .NET 8 SDK, used to build the native host
- `yt-dlp` available on `PATH`, or passed to the installer with `-YtDlpPath`

Install `yt-dlp` with Python:

```powershell
python -m pip install -U yt-dlp
```

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `extension` folder in this repository.
6. Double-click `Install-NativeHost.bat`.
7. Restart Chrome, then reload the extension from `chrome://extensions/`.

The extension uses a fixed development extension ID:

```text
lgdfehfacdnpknkphkfmmollklciaaal
```

The installer writes the Chrome Native Messaging manifest under the current Windows user:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.fengj.youtube_ytdlp
```

## Usage

1. Open a YouTube video or playlist page.
2. Open the extension popup.
3. Confirm the URL and download directory.
4. Choose a quality preset.
5. Choose `Current video` or `Entire playlist`.
6. Click `Add download`.

The default download directory is:

```text
%USERPROFILE%\Desktop\youtube videos
```

## Build manually

Build the native host:

```powershell
powershell -ExecutionPolicy Bypass -File .\native-host\build-host.ps1
```

Install the native host:

```powershell
powershell -ExecutionPolicy Bypass -File .\native-host\install-native-host.ps1
```

If `yt-dlp` is not on `PATH`, pass the executable path:

```powershell
powershell -ExecutionPolicy Bypass -File .\native-host\install-native-host.ps1 -YtDlpPath "C:\path\to\yt-dlp.exe"
```

## Release packaging

Create a release zip:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
```

The zip is written to `dist/`.

## Project layout

```text
extension/      Chrome extension UI and background script
native-host/    .NET Native Messaging host
scripts/        Release packaging scripts
docs/           Screenshots and documentation assets
```

## License

MIT
