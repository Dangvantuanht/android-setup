import QRCode from "qrcode";
import { config } from "../config.js";
import type { EnrollmentSession } from "@prisma/client";

const LOCALE_TZ_HINT: Record<string, string> = {
  vi_VN: "Asia/Ho_Chi_Minh",
  en_US: "America/Los_Angeles",
  ja_JP: "Asia/Tokyo",
};

export function buildProvisioningPayload(session: EnrollmentSession): Record<string, unknown> {
  const apkUrl = `${config.publicBaseUrl}/download/dpc.apk`;
  const callbackUrl = `${config.publicBaseUrl}/api/provisioning/callback`;

  const payload: Record<string, unknown> = {
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": config.dpc.componentName,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": apkUrl,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": config.dpc.checksumBase64Url,
    "android.app.extra.PROVISIONING_LOCALE": session.locale,
    "android.app.extra.PROVISIONING_TIME_ZONE": session.timezone || LOCALE_TZ_HINT[session.locale] || "Asia/Ho_Chi_Minh",
    "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
    "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
    "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
      enrollment_token: session.token,
      callback_url: callbackUrl,
    },
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
