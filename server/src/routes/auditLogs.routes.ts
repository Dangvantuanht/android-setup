import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { listAuditLogs } from "../services/auditLog.service.js";

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAdmin);

auditLogsRouter.get("/", async (_req, res) => {
  res.json(await listAuditLogs());
});
