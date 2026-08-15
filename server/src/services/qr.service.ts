import QRCode from "qrcode";
import { config } from "../config.js";
import type { EnrollmentSession } from "@prisma/client";

// All devices are Japan-based regardless of display language selected —
// timezone is always Asia/Tokyo unless staff explicitly override it.
const DEFAULT_TIMEZONE = "Asia/Tokyo";

export function buildProvisioningPayload(session: EnrollmentSession): Record<string, unknown> {
  // Session-scoped by default so the download endpoint can refuse a second
  // device re-using an already-enrolled QR (see provisioning.routes.ts). A
  // static override URL (e.g. a public raw-file host) can't be gated this
  // way — only use it when the local server genuinely isn't reachable.
  const apkUrl =
    config.dpc.apkDownloadUrlOverride ??
    `${config.publicBaseUrl}/download/dpc.apk?token=${session.token}`;
  const callbackUrl = `${config.publicBaseUrl}/api/provisioning/callback`;
  const heartbeatUrl = `${config.publicBaseUrl}/api/provisioning/heartbeat`;
  const logUrl = `${config.publicBaseUrl}/api/provisioning/log`;

  const adminExtras: Record<string, string> = {
    enrollment_token: session.token,
    callback_url: callbackUrl,
    heartbeat_url: heartbeatUrl,
    log_url: logUrl,
  };
  if (config.helperApp.apkDownloadUrl) {
    adminExtras.helper_apk_url = config.helperApp.apkDownloadUrl;
  }

  const payload: Record<string, unknown> = {
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": config.dpc.componentName,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apkUrl,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": config.dpc.checksumBase64Url,
    "android.app.extra.PROVISIONING_LOCALE": session.locale,
    "android.app.extra.PROVISIONING_TIME_ZONE": session.timezone || DEFAULT_TIMEZONE,
    "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
    "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
    "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": adminExtras,
  };

  if (session.wifiSsid) {
    payload["android.app.extra.PROVISIONING_WIFI_SSID"] = session.wifiSsid;
    payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = session.wifiSecurityType || "WPA";
    if (session.wifiPassword) {
      payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = session.wifiPassword;
    }
  }

  return payload;
}

export async function renderProvisioningQrPng(session: EnrollmentSession): Promise<Buffer> {
  const payload = buildProvisioningPayload(session);
  const json = JSON.stringify(payload);
  return QRCode.toBuffer(json, {
    errorCorrectionLevel: "M",
    type: "png",
    margin: 2,
    width: 480,
  });
}
