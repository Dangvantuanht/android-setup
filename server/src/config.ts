import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: required("SESSION_SECRET"),
  publicBaseUrl: required("PUBLIC_BASE_URL"), // e.g. https://provisioning.example.com
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 20),

  dpc: {
    componentName: process.env.DPC_COMPONENT_NAME ?? "com.autosetup.dpc/com.autosetup.dpc.AdminReceiver",
    apkPath: required("DPC_APK_PATH"),
    apkVersion: required("DPC_APK_VERSION"),
    checksumBase64Url: required("DPC_APK_CHECKSUM"),
    // Optional: host the APK somewhere other than this server's own
    // /download/dpc.apk (e.g. a public raw-file URL) — useful for testing
    // before this server itself has a public HTTPS address.
    apkDownloadUrlOverride: process.env.DPC_APK_DOWNLOAD_URL || undefined,
  },

  helperApp: {
    // Optional: URL the DPC silently installs+launches shortly after a
    // device finishes activating (see dpc-app HelperAppAlarmReceiver.kt).
    // Left unset, the DPC just skips that step entirely. Defaults to this
    // server's own /download/helper.apk once apkPath is configured.
    apkPath: process.env.HELPER_APK_PATH || undefined,
    apkDownloadUrl: process.env.HELPER_APK_DOWNLOAD_URL || undefined,
  },

  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
};
