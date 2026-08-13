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
  },

  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
};
