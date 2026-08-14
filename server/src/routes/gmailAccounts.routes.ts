import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import {
  listGmailAccounts,
  bulkAddGmailAccounts,
  deleteGmailAccounts,
  releaseGmailAccount,
} from "../services/gmailAccount.service.js";
import { logAction } from "../services/auditLog.service.js";

// Any logged-in staff manages their own Gmail pool (added by them, consumed
// by their own sessions/claim codes only — see gmailAccount.service.ts);
// admin sees every staffer's pool for oversight.
export const gmailAccountsRouter = Router();
gmailAccountsRouter.use(requireAuth);

gmailAccountsRouter.get("/", async (req, res) => {
  const ownerStaffId = req.session.staffRole === "admin" ? undefined : req.session.staffId;
  res.json(await listGmailAccounts(ownerStaffId));
});

gmailAccountsRouter.post("/bulk-add", async (req, res) => {
  const { raw } = req.body ?? {};
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "raw text (one email|password per line) required" });
    return;
  }
  const result = await bulkAddGmailAccounts(raw, req.session.staffId!);
  logAction(req.session.staffId, "GMAIL_ACCOUNT_ADDED", `added=${result.added} skipped=${result.skipped}`);
  res.status(201).json(result);
});

gmailAccountsRouter.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ids must be a string array" });
    return;
  }
  const isAdmin = req.session.staffRole === "admin";
  const deleted = await deleteGmailAccounts(ids, isAdmin ? undefined : req.session.staffId);
  res.json({ deleted });
});

gmailAccountsRouter.post("/:id/release", async (req, res) => {
  const isAdmin = req.session.staffRole === "admin";
  if (!isAdmin) {
    const account = await prisma.gmailAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.ownerStaffId !== req.session.staffId) {
      res.status(404).json({ error: "account not found" });
      return;
    }
  }
  const ok = await releaseGmailAccount(req.params.id);
  if (!ok) {
    res.status(409).json({ error: "account already available" });
    return;
  }
  res.status(204).end();
});
