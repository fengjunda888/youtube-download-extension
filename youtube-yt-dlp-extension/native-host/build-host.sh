#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLISH_DIR="${PUBLISH_DIR:-"$SCRIPT_DIR/publish"}"

dotnet publish "$SCRIPT_DIR/native-host.csproj" -c Release -o "$PUBLISH_DIR"
chmod +x "$PUBLISH_DIR/YouTubeYtDlpHost"

echo "Published host to $PUBLISH_DIR"
