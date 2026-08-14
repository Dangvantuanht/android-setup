import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import type { ManualClaimCode } from "@prisma/client";

// Avoids visually ambiguous characters (0/O, 1/I/L) since this gets typed by
// hand on a phone keyboard.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export async function createClaimCode(
  note: string | undefined,
  createdByStaffId: string | undefined,
): Promise<ManualClaimCode> {
  const expiresAt = new Date(Date.now() + config.sessionTtlMinutes * 60_000);
  // Extremely unlikely to collide (31^6 ≈ 887M combinations), but retry once
  // on the off chance since `code` is unique.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.manualClaimCode.create({
        data: { code: generateCode(), note: note || null, createdByStaffId: createdByStaffId || null, expiresAt },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }
  throw new Error("Could not generate a unique claim code");
}

// Silo'd per staff, same as sessions and Gmail accounts — ownerStaffId
// undefined (admin) returns every staffer's codes for oversight.
export async function listClaimCodes(ownerStaffId?: string) {
  return prisma.manualClaimCode.findMany({
    where: ownerStaffId ? { createdByStaffId: ownerStaffId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      gmailAccounts: { select: { email: true, status: true } },
      createdBy: { select: { id: true, email: true } },
    },
  });
}

export async function getClaimCodeByCode(code: string) {
  return prisma.manualClaimCode.findUnique({ where: { code: code.toUpperCase() } });
}

export async function revokeClaimCode(id: string): Promise<boolean> {
  const code = await prisma.manualClaimCode.findUnique({ where: { id } });
  if (!code || code.status !== "PENDING") return false;
  await prisma.manualClaimCode.update({ where: { id }, data: { status: "REVOKED" } });
  return true;
}

export async function markClaimCodeClaimed(id: string): Promise<void> {
  await prisma.manualClaimCode.update({
    where: { id },
    data: { status: "CLAIMED", claimedAt: new Date() },
  });
}

export async function expireStaleClaimCodes(): Promise<number> {
  const result = await prisma.manualClaimCode.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
