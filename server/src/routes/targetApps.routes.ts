import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  listTargetApps,
  bulkAddTargetApps,
  setTargetAppEnabled,
  deleteTargetApps,
} from "../services/targetApp.service.js";

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
  res.status(201).json(await bulkAddTargetApps(raw));
});

targetAppsRouter.patch("/:id", async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be boolean" });
    return;
  }
  res.json(await setTargetAppEnabled(req.params.id, enabled));
});

targetAppsRouter.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ids must be a string array" });
    return;
  }
  res.json({ deleted: await deleteTargetApps(ids) });
});
