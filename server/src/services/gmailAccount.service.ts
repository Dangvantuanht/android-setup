import { prisma } from "../db/prisma.js";

// Silo'd per staff (see schema.prisma doc comment on GmailAccount) —
// ownerStaffId=undefined (admin) returns every staffer's pool for oversight,
// scoped otherwise so staff only manage their own accounts.
export async function listGmailAccounts(ownerStaffId?: string) {
  return prisma.gmailAccount.findMany({
    where: ownerStaffId ? { ownerStaffId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, email: true } },
      assignedToSession: { select: { id: true, note: true, deviceModel: true } },
      assignedToClaimCode: { select: { id: true, code: true, note: true } },
    },
  });
}

/** Parses "email|password" lines (one per line), skipping blanks. Duplicate
 * emails against existing rows are skipped rather than erroring, so pasting
 * the same batch twice is harmless. */
export async function bulkAddGmailAccounts(
  raw: string,
  ownerStaffId: string,
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
    await prisma.gmailAccount.create({ data: { email, password, ownerStaffId } });
    added++;
  }
  return { added, skipped };
}

// Staff may only delete their own accounts — ids outside their pool are
// silently excluded rather than erroring (matches deleteSessions' pattern).
export async function deleteGmailAccounts(ids: string[], ownerStaffId?: string): Promise<number> {
  const result = await prisma.gmailAccount.deleteMany({
    where: { id: { in: ids }, ...(ownerStaffId ? { ownerStaffId } : {}) },
  });
  return result.count;
}

export type Claimant = { sessionId: string } | { claimCodeId: string };

function claimantWhere(claimant: Claimant) {
  return "sessionId" in claimant
    ? { assignedToSessionId: claimant.sessionId }
    : { assignedToClaimCodeId: claimant.claimCodeId };
}

/** Atomically hands out one AVAILABLE account to a device and marks it
 * ASSIGNED so no other device can claim the same one. Idempotent: a claimant
 * (session or claim code) that already has an account assigned gets that
 * SAME one back instead of draining a second account from the pool — a
 * helper app retrying the request (network hiccup, user reopening the app)
 * must not silently consume extra accounts.
 *
 * ownerStaffId is whoever created the claiming session/claim code (resolved
 * by the caller) — only that staffer's own pool is drawn from, never
 * borrowed across staff. null (no resolvable creator — shouldn't happen for
 * anything created after staff login was required) fails closed rather than
 * silently pulling from an unowned/wrong pool. */
export async function claimGmailAccount(
  claimant: Claimant,
  ownerStaffId: string | null,
): Promise<{ email: string; password: string } | null> {
  if (!ownerStaffId) return null;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.gmailAccount.findFirst({ where: claimantWhere(claimant) });
    if (existing) return { email: existing.email, password: existing.password };

    const account = await tx.gmailAccount.findFirst({
      where: { status: "AVAILABLE", ownerStaffId },
      orderBy: { createdAt: "asc" },
    });
    if (!account) return null;

    const updated = await tx.gmailAccount.updateMany({
      where: { id: account.id, status: "AVAILABLE" },
      data: { status: "ASSIGNED", assignedAt: new Date(), ...claimantWhere(claimant) },
    });
    if (updated.count === 0) return null; // lost a race to another claim

    return { email: account.email, password: account.password };
  });
}

/** Records whether the helper app actually managed to sign in with the
 * account it was handed. Only lets the device that was actually assigned
 * this email report on it — the claimant must match what claim recorded. */
export async function reportGmailOutcome(
  email: string,
  outcome: "SUCCESS" | "FAILED",
  claimant: Claimant,
): Promise<boolean> {
  const account = await prisma.gmailAccount.findUnique({ where: { email } });
  if (!account) return false;

  const matches =
    "sessionId" in claimant
      ? account.assignedToSessionId === claimant.sessionId
      : account.assignedToClaimCodeId === claimant.claimCodeId;
  if (!matches) return false;

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: { status: outcome === "SUCCESS" ? "ASSIGNED" : "FAILED" },
  });
  return true;
}

/** Staff-initiated: puts an account back in the pool (e.g. the device it was
 * handed to never finished setup) so it isn't stuck "assigned" forever. */
export async function releaseGmailAccount(id: string): Promise<boolean> {
  const account = await prisma.gmailAccount.findUnique({ where: { id } });
  if (!account || account.status === "AVAILABLE") return false;

  await prisma.gmailAccount.update({
    where: { id },
    data: {
      status: "AVAILABLE",
      assignedToSessionId: null,
      assignedToClaimCodeId: null,
      assignedAt: null,
    },
  });
  return true;
}
