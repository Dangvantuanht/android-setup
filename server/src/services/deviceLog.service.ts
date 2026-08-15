import { prisma } from "../db/prisma.js";

// Trims obviously-runaway payloads (e.g. a stray stack trace) rather than
// rejecting the whole log line — logging must never be the reason a device
// report gets dropped.
const MAX_MESSAGE_LENGTH = 2000;

export type LogTarget = { sessionId: string } | { claimCodeId: string };

export async function recordDeviceLog(
  target: LogTarget,
  source: string,
  message: string,
  level?: string,
): Promise<void> {
  await prisma.deviceLog.create({
    data: {
      sessionId: "sessionId" in target ? target.sessionId : null,
      claimCodeId: "claimCodeId" in target ? target.claimCodeId : null,
      source,
      level: level || "info",
      message: message.slice(0, MAX_MESSAGE_LENGTH),
    },
  });
}

export async function listDeviceLogsForSession(sessionId: string) {
  return prisma.deviceLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
}
