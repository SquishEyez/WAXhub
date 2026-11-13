#!/usr/bin/env bash
# Align and sign the Android build (v1 + v2 + v3). Needs Android build-tools
# (zipalign, apksigner) on PATH.
#   ./sign.sh /path/to/waxhub-release.jks
# You'll be asked for the keystore password. Never commit the keystore.
set -euo pipefail
KS="${1:?usage: ./sign.sh /path/to/keystore.jks [alias]}"; ALIAS="${2:-waxhub}"
DIR="$(cd "$(dirname "$0")" && pwd)"
IN="$DIR/dist/wax-hub-2.1-unsigned.apk"
OUT="$DIR/dist/wax-hub-2.1.0.apk"
zipalign -f -p 4 "$IN" "$DIR/dist/aligned.apk"
apksigner sign --ks "$KS" --ks-key-alias "$ALIAS" --out "$OUT" "$DIR/dist/aligned.apk"
rm "$DIR/dist/aligned.apk"
apksigner verify --verbose --print-certs "$OUT"
echo "Signed: $OUT"
