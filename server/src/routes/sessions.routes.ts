import { Router } from "express";
import {
  createSessionsBulk,
  listSessions,
  getSessionDetail,
  revokeSession,
  deleteSessions,
  modelReliabilityReport,
} from "../services/session.service.js";
import { renderProvisioningQrPng } from "../services/qr.service.js";
import { sessionEvents } from "../services/eventBus.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

const MAX_BULK_CREATE = 50;

sessionsRouter.post("/", async (req, res) => {
  const { wifiSsid, wifiPassword, wifiSecurityType, locale, timezone, note, count } = req.body ?? {};
  const requested = typeof count === "number" && Number.isFinite(count) ? Math.trunc(count) : 1;
  const clamped = Math.min(Math.max(requested, 1), MAX_BULK_CREATE);

  const sessions = await createSessionsBulk(
    { wifiSsid, wifiPassword, wifiSecurityType, locale, timezone, note, createdByStaffId: req.session.staffId },
    clamped,
  );

  res.status(201).json({
    sessions: sessions.map((session) => ({
      id: session.id,
      token: session.token,
      status: session.status,
      expiresAt: session.expiresAt,
      qrPngUrl: `/api/sessions/${session.id}/qr.png`,
    })),
  });
});

sessionsRouter.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ids must be a string array" });
    return;
  }
  const isAdmin = req.session.staffRole === "admin";
  let targetIds = ids;
  if (!isAdmin) {
    const owned = await prisma.enrollmentSession.findMany({
      where: { id: { in: ids }, createdByStaffId: req.session.staffId },
      select: { id: true },
    });
    targetIds = owned.map((s) => s.id);
  }
  const deleted = await deleteSessions(targetIds, isAdmin);
  res.json({ deleted });
});

sessionsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const ownerStaffId = req.session.staffRole === "admin" ? undefined : req.session.staffId;
  const sessions = await listSessions(status, ownerStaffId);
  res.json(sessions);
});

sessionsRouter.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const onChange = (event: { sessionId: string; status: string }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  sessionEvents.on("change", onChange);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sessionEvents.off("change", onChange);
  });
});

sessionsRouter.get("/reports/model-reliability", async (req, res) => {
  const ownerStaffId = req.session.staffRole === "admin" ? undefined : req.session.staffId;
  res.json(await modelReliabilityReport(ownerStaffId));
});

// Staff can only reach their own sessions by id too — silo applies to direct
// lookups, not just the list view (otherwise guessing/pasting another
// staffer's session id would leak it).
function ownsSession(req: { session: { staffRole?: string; staffId?: string } }, session: { createdByStaffId: string | null }): boolean {
  return req.session.staffRole === "admin" || session.createdByStaffId === req.session.staffId;
}

sessionsRouter.get("/:id", async (req, res) => {
  const session = await getSessionDetail(req.params.id);
  if (!session || !ownsSession(req, session)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(session);
});

sessionsRouter.get("/:id/qr.png", async (req, res) => {
  const session = await prisma.enrollmentSession.findUnique({ where: { id: req.params.id } });
  if (!session || !ownsSession(req, session)) {
    res.status(404).end();
    return;
  }
  const png = await renderProvisioningQrPng(session);
  res.setHeader("Content-Type", "image/png");
  res.send(png);
});

sessionsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.enrollmentSession.findUnique({ where: { id: req.params.id } });
  if (!existing || !ownsSession(req, existing)) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  const result = await revokeSession(req.params.id);
  if (!result.ok) {
    const messages: Record<string, string> = {
      "not-found": "session not found",
      "not-pending": "session not revocable (not pending)",
      "already-downloaded": "device already downloaded the APK — revoking can no longer stop it",
    };
    res.status(409).json({ error: messages[result.reason] });
    return;
  }
  res.status(204).end();
});
