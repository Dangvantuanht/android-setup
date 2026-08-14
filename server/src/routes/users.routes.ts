import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  listUsers,
  updateUser,
  deleteUser,
  getAutoApprove,
  setAutoApprove,
} from "../services/user.service.js";

export const usersRouter = Router();
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
  const { status, role } = req.body ?? {};
  const data: { status?: string; role?: string } = {};
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
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  // Prevent an admin from locking themselves out by demoting/rejecting their own account.
  if (req.session.staffId === req.params.id) {
    res.status(400).json({ error: "cannot modify your own account" });
    return;
  }

  const updated = await updateUser(req.params.id, data);
  res.json(updated);
});

usersRouter.delete("/:id", async (req, res) => {
  if (req.session.staffId === req.params.id) {
    res.status(400).json({ error: "cannot delete your own account" });
    return;
  }
  await deleteUser(req.params.id);
  res.status(204).end();
});
