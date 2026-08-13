# AutoSetup DPC (web-integrated)

Minimal Device Policy Controller for Android Enterprise QR/zero-touch
provisioning. Copied from `android_tool/AutoSetupDPC` (v2) and extended so the
app reports enrollment completion back to the `server/` web backend instead of
relying on ADB automation. The original projects (`Downloads/AutoSetupDPC`,
`Downloads/android_tool`) are untouched.

## What changed vs. upstream

- `AndroidManifest.xml`: added `INTERNET` + `ACCESS_NETWORK_STATE`.
- `AdminReceiver.kt`: `onProfileProvisioningComplete` now reads the
  `enrollment_token` / `callback_url` keys out of
  `EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE` (set by the backend's QR payload,
  see `server/src/services/qr.service.ts`) and forwards them to
  `ProvisioningActivity`.
- `ProvisioningActivity.kt`: `completeCompliance()` fires
  `CallbackClient.notifyEnrollmentComplete()` once `isDeviceOwnerApp` is
  confirmed, before returning `RESULT_OK`.
- New `CallbackClient.kt`: plain `HttpURLConnection` POST on a background
  thread, 5s timeout, swallows all errors — never blocks or fails
  provisioning even if the backend is unreachable.
- Everything else (device owner retained after enrollment, `GET_PROVISIONING_MODE`
  handling, `minSdk = 26` for Android 8+) is unchanged from upstream v2.

`onProfileProvisioningComplete` is used as the callback hook (rather than only
the OS-invoked `ADMIN_POLICY_COMPLIANCE` action) because it fires on every
supported Android version — the OS only drives `GET_PROVISIONING_MODE`/
`ADMIN_POLICY_COMPLIANCE` itself on Android 12+; on 8–11 provisioning
completes straight to this receiver.

## Building a release APK

1. Generate a **new** keystore (do not reuse the one committed in the old
   `Downloads/AutoSetupDPC` repo — its password is hardcoded in that repo's
   `build.gradle.kts`, so anyone with access to it could re-sign a spoofed DPC
   matching the same trusted checksum):

   ```sh
   keytool -genkeypair -v -keystore autosetup-release.keystore \
     -alias autosetup -keyalg RSA -keysize 2048 -validity 10000
   ```

   Store the keystore file and password outside git (e.g. on the VPS under
   `/etc/autosetup/`).

2. Build:

   ```sh
   ./gradlew assembleRelease \
     -PAUTOS_SETUP_KEYSTORE=/absolute/path/to/autosetup-release.keystore \
     -PAUTOS_SETUP_STORE_PASSWORD=... \
     -PAUTOS_SETUP_KEY_ALIAS=autosetup \
     -PAUTOS_SETUP_KEY_PASSWORD=...
   ```

   Output: `app/build/outputs/apk/release/app-release.apk`.

3. Compute the checksum the QR payload needs
   (`android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM`):

   ```sh
   ./scripts/compute-checksum.sh app/build/outputs/apk/release/app-release.apk \
     "$ANDROID_HOME/build-tools/<version>/apksigner"
   ```

4. Copy the APK into `../releases/`, and set in `server/.env`:

   ```
   DPC_APK_PATH=../releases/autosetup-dpc-<version>.apk
   DPC_APK_VERSION=<version>
   DPC_APK_CHECKSUM=<output of step 3>
   ```

## Local build/debug

```sh
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # not committed
./gradlew assembleDebug
```

Debug builds use the auto-generated debug keystore and are for local
compile-checking only — never point a QR payload's checksum at a debug build.
