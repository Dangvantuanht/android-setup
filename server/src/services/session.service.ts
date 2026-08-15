import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import { emitSessionChange } from "./eventBus.js";
import type { EnrollmentSession, Prisma } from "@prisma/client";

// Excludes `token` and `wifiPassword` — these must never leave the server
// outside the QR PNG itself and the one-time create response. Returning them
// in list/detail responses would leak every session's secrets to any staff
// member who opens devtools, not just the one who created it.
const SAFE_SESSION_SELECT = {
  id: true,
  status: true,
  wifiSsid: true,
  locale: true,
  timezone: true,
  note: true,
  createdAt: true,
  expiresAt: true,
  enrolledAt: true,
  downloadedAt: true,
  deviceModel: true,
  androidRelease: true,
  apkVersion: true,
  batteryLevel: true,
  lastSeenAt: true,
  createdByStaffId: true,
  createdBy: { select: { id: true, email: true } },
} satisfies Prisma.EnrollmentSessionSelect;

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
      // No hardcoded fallback here on purpose — leaving this null lets
      // qr.service.ts infer the timezone from the selected locale
      // (LOCALE_TZ_HINT) when staff didn't explicitly set one.
      timezone: input.timezone || null,
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

export async function createSessionsBulk(
  input: CreateSessionInput,
  count: number,
): Promise<EnrollmentSession[]> {
  const created: EnrollmentSession[] = [];
  for (let i = 0; i < count; i++) {
    created.push(await createSession(input));
  }
  return created;
}

// Each staff member's own scanned/created devices only — admin passes
// ownerStaffId=undefined to see everyone's (silo'd per-user, like claim
// codes and Gmail accounts, so tracking "who's managing what" isn't a mess
// of everyone's devices mixed together).
export async function listSessions(status?: string, ownerStaffId?: string) {
  return prisma.enrollmentSession.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(ownerStaffId ? { createdByStaffId: ownerStaffId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: SAFE_SESSION_SELECT,
  });
}

export async function getSessionDetail(id: string) {
  return prisma.enrollmentSession.findUnique({
    where: { id },
    select: { ...SAFE_SESSION_SELECT, events: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getSessionByToken(token: string) {
  return prisma.enrollmentSession.findUnique({ where: { token } });
}

export type RevokeResult =
  | { ok: true; session: EnrollmentSession }
  | { ok: false; reason: "not-found" | "not-pending" | "already-downloaded" };

export async function revokeSession(id: string): Promise<RevokeResult> {
  const session = await prisma.enrollmentSession.findUnique({ where: { id } });
  if (!session) return { ok: false, reason: "not-found" };
  if (session.status !== "PENDING") return { ok: false, reason: "not-pending" };
  // Once the device has the APK, it installs and finishes Device Owner setup
  // on its own — revoking the session server-side can no longer stop it. Keep
  // the session around so staff aren't misled into thinking "Thu hồi" worked.
  if (session.downloadedAt) return { ok: false, reason: "already-downloaded" };

  const updated = await prisma.enrollmentSession.update({
    where: { id },
    data: { status: "REVOKED" },
  });
  await prisma.enrollmentEvent.create({ data: { sessionId: id, type: "REVOKED" } });
  emitSessionChange({ sessionId: id, status: updated.status });
  return { ok: true, session: updated };
}

export async function markApkDownloaded(token: string): Promise<void> {
  const session = await prisma.enrollmentSession.findUnique({ where: { token } });
  if (!session || session.downloadedAt) return;

  await prisma.enrollmentSession.update({
    where: { id: session.id },
    data: { downloadedAt: new Date() },
  });
  await prisma.enrollmentEvent.create({ data: { sessionId: session.id, type: "APK_DOWNLOADED" } });
}

const STAFF_DELETABLE_STATUSES = ["EXPIRED", "REVOKED", "FAILED"];
const ADMIN_DELETABLE_STATUSES = [...STAFF_DELETABLE_STATUSES, "ENROLLED"];

/** Hard-deletes finished/dead sessions (history cleanup). Silently skips
 * anything still PENDING — that one's still active. Regular staff can only
 * clear out junk (expired/revoked/failed); deleting a real successful
 * activation record is admin-only. */
export async function deleteSessions(ids: string[], isAdmin: boolean): Promise<number> {
  const result = await prisma.enrollmentSession.deleteMany({
    where: {
      id: { in: ids },
      status: { in: isAdmin ? ADMIN_DELETABLE_STATUSES : STAFF_DELETABLE_STATUSES },
    },
  });
  return result.count;
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

export async function recordHeartbeat(
  token: string,
  batteryLevel: number | undefined,
  deviceModel: string | undefined,
): Promise<{ accepted: boolean }> {
  const session = await prisma.enrollmentSession.findUnique({ where: { token } });
  if (!session || session.status !== "ENROLLED") return { accepted: false };

  const updated = await prisma.enrollmentSession.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date(),
      ...(batteryLevel !== undefined ? { batteryLevel } : {}),
      ...(deviceModel ? { deviceModel } : {}),
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

// Same silo as listSessions — staff only sees stats for their own devices,
// admin (ownerStaffId=undefined) sees the aggregate across everyone.
export async function modelReliabilityReport(ownerStaffId?: string) {
  const sessions = await prisma.enrollmentSession.findMany({
    where: {
      deviceModel: { not: null },
      ...(ownerStaffId ? { createdByStaffId: ownerStaffId } : {}),
    },
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
