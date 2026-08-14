import { prisma } from "../db/prisma.js";

export async function listGmailAccounts() {
  return prisma.gmailAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: { assignedToSession: { select: { id: true, note: true, deviceModel: true } } },
  });
}

/** Parses "email|password" lines (one per line), skipping blanks. Duplicate
 * emails against existing rows are skipped rather than erroring, so pasting
 * the same batch twice is harmless. */
export async function bulkAddGmailAccounts(
  raw: string,
): Promise<{ added: number; skipped: number }> {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let added = 0;
  let skipped = 0;
  for (const line of lines) {
    const [email, password] = line.split("|").map((s) => s?.trim());
    if (!email || !password) {
      skipped++;
      continue;
    }
    const existing = await prisma.gmailAccount.findUnique({ where: { email } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.gmailAccount.create({ data: { email, password } });
    added++;
  }
  return { added, skipped };
}

export async function deleteGmailAccounts(ids: string[]): Promise<number> {
  const result = await prisma.gmailAccount.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

/** Atomically hands out one AVAILABLE account to a device and marks it
 * ASSIGNED so no other device can claim the same one. */
export async function claimGmailAccount(
  sessionId: string,
): Promise<{ email: string; password: string } | null> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.gmailAccount.findFirst({
      where: { status: "AVAILABLE" },
      orderBy: { createdAt: "asc" },
    });
    if (!account) return null;

    const updated = await tx.gmailAccount.updateMany({
      where: { id: account.id, status: "AVAILABLE" },
      data: { status: "ASSIGNED", assignedToSessionId: sessionId, assignedAt: new Date() },
    });
    if (updated.count === 0) return null; // lost a race to another claim

    return { email: account.email, password: account.password };
  });
}
