import { prisma } from "../db/prisma.js";

/** Fire-and-forget — a logging failure must never break the action being logged. */
export function logAction(staffId: string | undefined, action: string, detail?: string): void {
  prisma.auditLog
    .create({ data: { staffId: staffId || null, action, detail: detail || null } })
    .catch(() => {});
}

export async function listAuditLogs(limit = 200) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { staff: { select: { id: true, email: true } } },
  });
}
