#!/usr/bin/env bash
# Build everything: the Android APK (unsigned) and the Linux desktop app.
# Requirements: Node.js 20+, Python 3, unzip. Signing the APK: see android/sign.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/android" && npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
node build.mjs base/wax-hub-2.0.apk
cd "$ROOT/desktop" && npm install --no-audit --no-fund
npm run dist
echo
echo "Android (unsigned): android/dist/wax-hub-2.1-unsigned.apk  -> sign with android/sign.sh"
echo "Linux:              desktop/release/*.AppImage, desktop/release/*.deb"
