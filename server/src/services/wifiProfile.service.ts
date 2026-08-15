import { prisma } from "../db/prisma.js";

// Fully silo'd per staff — treated as personal data, no admin bypass (unlike
// sessions/claim codes/gmail accounts) per explicit instruction.
export async function listWifiProfiles(ownerStaffId: string) {
  return prisma.wifiProfile.findMany({ where: { ownerStaffId }, orderBy: { label: "asc" } });
}

export async function createWifiProfile(input: {
  label: string;
  ssid: string;
  password?: string;
  securityType?: string;
  ownerStaffId: string;
}) {
  return prisma.wifiProfile.create({
    data: {
      label: input.label,
      ssid: input.ssid,
      password: input.password || null,
      securityType: input.securityType || "WPA",
      ownerStaffId: input.ownerStaffId,
    },
  });
}

export async function deleteWifiProfile(id: string, ownerStaffId: string): Promise<void> {
  await prisma.wifiProfile.deleteMany({ where: { id, ownerStaffId } });
}
