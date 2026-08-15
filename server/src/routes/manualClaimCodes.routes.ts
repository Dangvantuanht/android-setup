import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { createClaimCode, listClaimCodes, revokeClaimCode, deleteClaimCodes } from "../services/manualClaimCode.service.js";
import { logAction } from "../services/auditLog.service.js";

// Any logged-in staff can create/use claim codes — needed daily to activate
// hand-provisioned devices — but each staffer only sees/manages their own
// (see manualClaimCode.service.ts); admin sees everyone's for oversight.
export const manualClaimCodesRouter = Router();
manualClaimCodesRouter.use(requireAuth);

manualClaimCodesRouter.get("/", async (req, res) => {
  const ownerStaffId = req.session.staffRole === "admin" ? undefined : req.session.staffId;
  res.json(await listClaimCodes(ownerStaffId));
});

manualClaimCodesRouter.post("/", async (req, res) => {
  const { note } = req.body ?? {};
  const code = await createClaimCode(
    typeof note === "string" ? note : undefined,
    req.session.staffId,
  );
  logAction(req.session.staffId, "CLAIM_CODE_CREATED", code.code);
  res.status(201).json(code);
});

manualClaimCodesRouter.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ids must be a string array" });
    return;
  }
  const isAdmin = req.session.staffRole === "admin";
  const deleted = await deleteClaimCodes(ids, isAdmin ? undefined : req.session.staffId);
  res.json({ deleted });
});

manualClaimCodesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.manualClaimCode.findUnique({ where: { id: req.params.id } });
  const isAdmin = req.session.staffRole === "admin";
  if (!existing || (!isAdmin && existing.createdByStaffId !== req.session.staffId)) {
    res.status(404).json({ error: "code not found" });
    return;
  }
  const ok = await revokeClaimCode(req.params.id);
  if (!ok) {
    res.status(409).json({ error: "code not revocable (not pending)" });
    return;
  }
  res.status(204).end();
});
