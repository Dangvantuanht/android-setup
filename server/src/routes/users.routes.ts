import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import {
  listUsers,
  updateUser,
  deleteUser,
  getAutoApprove,
  setAutoApprove,
  getQrUsage,
} from "../services/user.service.js";
import { logAction } from "../services/auditLog.service.js";

export const usersRouter = Router();

// Every staffer (not just admin) can check their own QR quota usage — shown
// on the sessions page so they know how many activations they have left.
usersRouter.get("/me/qr-usage", requireAuth, async (req, res) => {
  res.json(await getQrUsage(req.session.staffId!));
});

usersRouter.use(requireAdmin);

usersRouter.get("/", async (_req, res) => {
  res.json(await listUsers());
});

usersRouter.get("/settings/auto-approve", async (_req, res) => {
  res.json({ enabled: await getAutoApprove() });
});

usersRouter.patch("/settings/auto-approve", async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be boolean" });
    return;
  }
  await setAutoApprove(enabled);
  res.json({ enabled });
});

usersRouter.patch("/:id", async (req, res) => {
  const { status, role, qrQuota } = req.body ?? {};
  const data: { status?: string; role?: string; qrQuota?: number | null } = {};
  if (status !== undefined) {
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      res.status(400).json({ error: "invalid status" });
      return;
    }
    data.status = status;
  }
  if (role !== undefined) {
    if (!["staff", "admin"].includes(role)) {
      res.status(400).json({ error: "invalid role" });
      return;
    }
    data.role = role;
  }
  if (qrQuota !== undefined) {
    if (qrQuota !== null && (typeof qrQuota !== "number" || !Number.isInteger(qrQuota) || qrQuota < 0)) {
      res.status(400).json({ error: "qrQuota must be a non-negative integer or null" });
      return;
    }
    data.qrQuota = qrQuota;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  // Prevent an admin from locking themselves out by demoting/rejecting their
  // own account — doesn't apply to qrQuota alone, which carries no lockout risk.
  const changingOnlyQuota = status === undefined && role === undefined;
  if (req.session.staffId === req.params.id && !changingOnlyQuota) {
    res.status(400).json({ error: "cannot modify your own account" });
    return;
  }

  const updated = await updateUser(req.params.id, data);
  logAction(req.session.staffId, "USER_UPDATED", `${updated.email}: ${JSON.stringify(data)}`);
  res.json(updated);
});

usersRouter.delete("/:id", async (req, res) => {
  if (req.session.staffId === req.params.id) {
    res.status(400).json({ error: "cannot delete your own account" });
    return;
  }
  await deleteUser(req.params.id);
  logAction(req.session.staffId, "USER_DELETED", req.params.id);
  res.status(204).end();
});
