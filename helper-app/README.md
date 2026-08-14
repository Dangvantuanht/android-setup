# Giftly Device Assist

Standalone companion app (package `com.giftly.deviceassist`) — separate APK
from `dpc-app`, on purpose: it drives Google sign-in via an Accessibility
Service, which is inherently more crash-prone than the DPC's own code, and
must never be able to take down the Device Owner app it runs alongside on
the same phone. Also standalone from `Downloads/autoroll` (the TikTok
auto-scroll tool) it was forked from — same reasoning, plus this has no
license/activation gate since it only ever runs when handed a valid
enrollment token or claim code from the provisioning server.

## What it does

1. The DPC (`dpc-app`) silently installs this APK and launches it right
   after a device finishes activating, passing its enrollment token as an
   Intent extra (`enrollment_token`). For devices activated by hand instead
   of via QR, staff generate a short code on the dashboard ("Mã kích hoạt
   thủ công" tab) and type it into this app's UI instead.
2. Prompts to enable Accessibility if not already on (unavoidable manual
   step — no API lets a Device Owner or any other app skip this).
3. Calls `POST /api/provisioning/gmail-claim` on the provisioning server to
   get one unused company Gmail account, drives the Google sign-in flow via
   Accessibility (`SetupAssistService.kt`), then installs whatever's in
   `GET /api/provisioning/target-apps` (dashboard-managed list — changing
   which apps get installed never requires rebuilding this app).
4. Reports success/failure back via `gmail-report` so staff see it on the
   dashboard's Gmail accounts tab.

## Tuning the sign-in automation

`SetupAssistService.kt`'s Google-login step matching uses generic
view-id-suffix/text/structural heuristics, not exact IDs (Google doesn't
publish them and they shift by GMS Core version/locale) — expect to iterate
against `adb logcat -s DeviceAssist` on a real device the first several
times, same as tuning the DPC against real Samsung/Android quirks.

## Building a release APK

```sh
keytool -genkeypair -v -keystore secrets/deviceassist-release.keystore \
  -alias deviceassist -keyalg RSA -keysize 2048 -validity 10000
# store password/alias in secrets/keystore.env (STORE_PASS=... / KEY_PASS=...), gitignored

source secrets/keystore.env
./gradlew assembleRelease \
  -PDEVICEASSIST_KEYSTORE=secrets/deviceassist-release.keystore \
  -PDEVICEASSIST_STORE_PASSWORD="$STORE_PASS" \
  -PDEVICEASSIST_KEY_ALIAS=deviceassist \
  -PDEVICEASSIST_KEY_PASSWORD="$KEY_PASS"
```

Output: `app/build/outputs/apk/release/app-release.apk`. Host it wherever
the DPC's silent-install step is configured to fetch it from (same pattern
as `dpc-app`'s own release APK on GitHub raw).

## Local build/debug

```sh
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # not committed
./gradlew assembleDebug
```
