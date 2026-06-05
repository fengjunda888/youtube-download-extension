#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$ROOT_DIR/native-host/build-host.sh"
"$ROOT_DIR/native-host/install-native-host.sh"
