import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  listTargetApps,
  bulkAddTargetApps,
  setTargetAppEnabled,
  deleteTargetApps,
} from "../services/targetApp.service.js";
import { logAction } from "../services/auditLog.service.js";

export const targetAppsRouter = Router();
targetAppsRouter.use(requireAdmin);

targetAppsRouter.get("/", async (_req, res) => {
  res.json(await listTargetApps());
});

targetAppsRouter.post("/bulk-add", async (req, res) => {
  const { raw } = req.body ?? {};
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "raw text (one packageName|label per line) required" });
    return;
  }
  const result = await bulkAddTargetApps(raw);
  logAction(req.session.staffId, "TARGET_APP_ADDED", `added=${result.added} skipped=${result.skipped}`);
  res.status(201).json(result);
});

targetAppsRouter.patch("/:id", async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be boolean" });
    return;
  }
  const updated = await setTargetAppEnabled(req.params.id, enabled);
  logAction(req.session.staffId, "TARGET_APP_TOGGLED", `${updated.label}: enabled=${enabled}`);
  res.json(updated);
});

targetAppsRouter.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ids must be a string array" });
    return;
  }
  const deleted = await deleteTargetApps(ids);
  logAction(req.session.staffId, "TARGET_APP_DELETED", `count=${deleted}`);
  res.json({ deleted });
});
