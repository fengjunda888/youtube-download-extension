# Changelog

## 0.2.2

- Added task bulk actions in the popup for completed, failed, and active downloads.
- Added per-task copy-link and retry actions without changing the download path.
- Added recent task memory in the popup and a small author credit in the header.

## 0.2.1

- Polished the popup with a cleaner YouTube-style layout.
- Enlarged video thumbnails for clearer previews.
- Refined the detect, task, and account screens for GitHub screenshots.
- Improved README presentation for public release.

## 0.2.0

- Added Windows and macOS native host install flows.
- Changed native host target to cross-platform `.NET 8`.
- Added URL resolve flow before downloading.
- Added multi-select and select-all downloads.
- Added optional Google OAuth account tab for playlists, liked videos, and local YouTube browsing history.
- Added `fengjunda888` author branding in the extension and documentation.
- Removed generated native host publish binaries from source control.

## 0.1.0

- Initial public release.
- Chrome extension popup for YouTube downloads.
- Windows native messaging host powered by `yt-dlp`.
- Multiple concurrent tasks with progress, speed, ETA, and latest log line.
- Single video and playlist modes.
- Quality selection for MP4, capped resolution, and audio-only downloads.
