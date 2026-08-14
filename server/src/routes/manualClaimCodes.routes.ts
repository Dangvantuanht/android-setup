import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { createClaimCode, listClaimCodes, revokeClaimCode } from "../services/manualClaimCode.service.js";

export const manualClaimCodesRouter = Router();
manualClaimCodesRouter.use(requireAdmin);

manualClaimCodesRouter.get("/", async (_req, res) => {
  res.json(await listClaimCodes());
});

manualClaimCodesRouter.post("/", async (req, res) => {
  const { note } = req.body ?? {};
  const code = await createClaimCode(
    typeof note === "string" ? note : undefined,
    req.session.staffId,
  );
  res.status(201).json(code);
});

manualClaimCodesRouter.delete("/:id", async (req, res) => {
  const ok = await revokeClaimCode(req.params.id);
  if (!ok) {
    res.status(409).json({ error: "code not revocable (not pending)" });
    return;
  }
  res.status(204).end();
});
