import { prisma } from "../db/prisma.js";

export async function listWifiProfiles() {
  return prisma.wifiProfile.findMany({ orderBy: { label: "asc" } });
}

export async function createWifiProfile(input: {
  label: string;
  ssid: string;
  password?: string;
  securityType?: string;
}) {
  return prisma.wifiProfile.create({
    data: {
      label: input.label,
      ssid: input.ssid,
      password: input.password || null,
      securityType: input.securityType || "WPA",
    },
  });
}

export async function deleteWifiProfile(id: string): Promise<void> {
  await prisma.wifiProfile.delete({ where: { id } });
}
