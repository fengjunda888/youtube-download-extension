# Contributing

Thanks for helping improve YouTube yt-dlp Downloader.

## Local development

1. Load `extension/` as an unpacked Chrome extension.
2. Build the native host with `native-host/build-host.ps1`.
3. Register the native host with `native-host/install-native-host.ps1`.
4. Reload the Chrome extension after changing frontend files.

## Guidelines

- Keep the extension small and dependency-light.
- Do not add code intended to bypass YouTube access controls.
- Keep generated build outputs out of git.
- Test Native Messaging protocol changes with a local message before release.
