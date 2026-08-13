#!/usr/bin/env bash
# Computes the value for android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM
# from a signed APK: base64url(sha256(signing certificate)), no padding.
#
# Usage: ./scripts/compute-checksum.sh <path-to-signed-apk> [path-to-apksigner]
#
# Run this once per release build, then put the result in the server's
# DPC_APK_CHECKSUM env var (see server/.env.example).

set -euo pipefail

APK_PATH="${1:?Usage: compute-checksum.sh <apk> [apksigner]}"
APKSIGNER="${2:-apksigner}"

HEX_DIGEST=$("$APKSIGNER" verify --print-certs "$APK_PATH" \
  | grep "SHA-256 digest" \
  | head -1 \
  | awk '{print $NF}')

if [ -z "$HEX_DIGEST" ]; then
  echo "Could not extract SHA-256 digest from apksigner output" >&2
  exit 1
fi

python3 -c "
import base64, sys
digest = bytes.fromhex('$HEX_DIGEST')
print(base64.urlsafe_b64encode(digest).rstrip(b'=').decode())
"
