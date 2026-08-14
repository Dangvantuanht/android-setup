import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  listGmailAccounts,
  bulkAddGmailAccounts,
  deleteGmailAccounts,
  releaseGmailAccount,
} from "../services/gmailAccount.service.js";

export const gmailAccountsRouter = Router();
gmailAccountsRouter.use(requireAdmin);

gmailAccountsRouter.get("/", async (_req, res) => {
  res.json(await listGmailAccounts());
});

gmailAccountsRouter.post("/bulk-add", async (req, res) => {
  const { raw } = req.body ?? {};
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "raw text (one email|password per line) required" });
    return;
  }
  const result = await bulkAddGmailAccounts(raw);
  res.status(201).json(result);
});

gmailAccountsRouter.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ids must be a string array" });
    return;
  }
  const deleted = await deleteGmailAccounts(ids);
  res.json({ deleted });
});

gmailAccountsRouter.post("/:id/release", async (req, res) => {
  const ok = await releaseGmailAccount(req.params.id);
  if (!ok) {
    res.status(409).json({ error: "account already available" });
    return;
  }
  res.status(204).end();
});
