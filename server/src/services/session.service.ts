import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import { emitSessionChange } from "./eventBus.js";
import type { EnrollmentSession } from "@prisma/client";

export type CreateSessionInput = {
  wifiSsid?: string;
  wifiPassword?: string;
  wifiSecurityType?: string;
  locale?: string;
  timezone?: string;
  note?: string;
  createdByStaffId?: string;
};

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(input: CreateSessionInput): Promise<EnrollmentSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlMinutes * 60_000);

  const session = await prisma.enrollmentSession.create({
    data: {
      token,
      expiresAt,
      wifiSsid: input.wifiSsid || null,
      wifiPassword: input.wifiPassword || null,
      wifiSecurityType: input.wifiSecurityType || null,
      locale: input.locale || "vi_VN",
      timezone: input.timezone || "Asia/Ho_Chi_Minh",
      note: input.note || null,
      createdByStaffId: input.createdByStaffId || null,
      apkVersion: config.dpc.apkVersion,
    },
  });

  await prisma.enrollmentEvent.create({
    data: { sessionId: session.id, type: "QR_GENERATED" },
  });

  emitSessionChange({ sessionId: session.id, status: session.status });
  return session;
}

export async function listSessions(status?: string) {
  return prisma.enrollmentSession.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getSessionDetail(id: string) {
  return prisma.enrollmentSession.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getSessionByToken(token: string) {
  return prisma.enrollmentSession.findUnique({ where: { token } });
}

export async function revokeSession(id: string): Promise<EnrollmentSession | null> {
  const session = await prisma.enrollmentSession.findUnique({ where: { id } });
  if (!session || session.status !== "PENDING") return null;

  const updated = await prisma.enrollmentSession.update({
    where: { id },
    data: { status: "REVOKED" },
  });
  await prisma.enrollmentEvent.create({ data: { sessionId: id, type: "REVOKED" } });
  emitSessionChange({ sessionId: id, status: updated.status });
  return updated;
}

export async function completeSessionFromCallback(
  token: string,
  deviceModel: string | undefined,
  androidRelease: string | undefined,
): Promise<{ accepted: boolean }> {
  const session = await prisma.enrollmentSession.findUnique({ where: { token } });

  if (!session) return { accepted: false };

  if (session.status !== "PENDING" || session.expiresAt.getTime() < Date.now()) {
    await prisma.enrollmentEvent.create({
      data: {
        sessionId: session.id,
        type: "CALLBACK_REJECTED",
        payloadJson: JSON.stringify({ reason: "not-pending-or-expired", status: session.status }),
      },
    });
    return { accepted: false };
  }

  const updated = await prisma.enrollmentSession.update({
    where: { id: session.id },
    data: {
      status: "ENROLLED",
      enrolledAt: new Date(),
      deviceModel: deviceModel || null,
      androidRelease: androidRelease || null,
    },
  });

  await prisma.enrollmentEvent.create({
    data: {
      sessionId: session.id,
      type: "CALLBACK_OK",
      payloadJson: JSON.stringify({ deviceModel, androidRelease }),
    },
  });

  emitSessionChange({ sessionId: session.id, status: updated.status });
  return { accepted: true };
}

export async function expireStaleSessions(): Promise<number> {
  const stale = await prisma.enrollmentSession.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true },
  });

  for (const { id } of stale) {
    const updated = await prisma.enrollmentSession.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
    await prisma.enrollmentEvent.create({ data: { sessionId: id, type: "EXPIRED" } });
    emitSessionChange({ sessionId: id, status: updated.status });
  }

  return stale.length;
}

export async function modelReliabilityReport() {
  const sessions = await prisma.enrollmentSession.findMany({
    where: { deviceModel: { not: null } },
    select: { deviceModel: true, androidRelease: true, status: true },
  });

  const byModel = new Map<string, { total: number; enrolled: number; failed: number }>();
  for (const s of sessions) {
    const key = `${s.deviceModel} (Android ${s.androidRelease ?? "?"})`;
    const entry = byModel.get(key) ?? { total: 0, enrolled: 0, failed: 0 };
    entry.total += 1;
    if (s.status === "ENROLLED") entry.enrolled += 1;
    if (s.status === "FAILED") entry.failed += 1;
    byModel.set(key, entry);
  }

  return Array.from(byModel.entries()).map(([model, stats]) => ({ model, ...stats }));
}
