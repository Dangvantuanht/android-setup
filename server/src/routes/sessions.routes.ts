import { Router } from "express";
import {
  createSession,
  listSessions,
  getSessionDetail,
  revokeSession,
  modelReliabilityReport,
} from "../services/session.service.js";
import { renderProvisioningQrPng } from "../services/qr.service.js";
import { sessionEvents } from "../services/eventBus.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

sessionsRouter.post("/", async (req, res) => {
  const { wifiSsid, wifiPassword, wifiSecurityType, locale, timezone, note } = req.body ?? {};
  const session = await createSession({
    wifiSsid,
    wifiPassword,
    wifiSecurityType,
    locale,
    timezone,
    note,
    createdByStaffId: req.session.staffId,
  });
  res.status(201).json({
    id: session.id,
    token: session.token,
    status: session.status,
    expiresAt: session.expiresAt,
    qrPngUrl: `/api/sessions/${session.id}/qr.png`,
  });
});

sessionsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const sessions = await listSessions(status);
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

sessionsRouter.get("/reports/model-reliability", async (_req, res) => {
  res.json(await modelReliabilityReport());
});

sessionsRouter.get("/:id", async (req, res) => {
  const session = await getSessionDetail(req.params.id);
  if (!session) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(session);
});

sessionsRouter.get("/:id/qr.png", async (req, res) => {
  const session = await prisma.enrollmentSession.findUnique({ where: { id: req.params.id } });
  if (!session) {
    res.status(404).end();
    return;
  }
  const png = await renderProvisioningQrPng(session);
  res.setHeader("Content-Type", "image/png");
  res.send(png);
});

sessionsRouter.delete("/:id", async (req, res) => {
  const updated = await revokeSession(req.params.id);
  if (!updated) {
    res.status(409).json({ error: "session not revocable (not pending)" });
    return;
  }
  res.status(204).end();
});
