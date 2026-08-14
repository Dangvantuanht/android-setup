import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/prisma.js";
import { registerUser } from "../services/user.service.js";

export const authRouter = Router();

const REMEMBER_ME_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many login attempts, try again later" },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many registration attempts, try again later" },
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password, rememberMe } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  const user = await prisma.staffUser.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  if (user.status === "PENDING") {
    res.status(403).json({ error: "account pending admin approval" });
    return;
  }
  if (user.status !== "APPROVED") {
    res.status(403).json({ error: "account not approved" });
    return;
  }

  req.session.staffId = user.id;
  req.session.staffEmail = user.email;
  req.session.staffRole = user.role;
  if (rememberMe === true) {
    req.session.cookie.maxAge = REMEMBER_ME_MAX_AGE_MS;
  }
  res.json({ id: user.id, email: user.email, role: user.role });
});

authRouter.post("/register", registerLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "invalid email" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "password must be at least 8 characters" });
    return;
  }

  const result = await registerUser(email, password);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.status(201).json({ ok: true });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
});

authRouter.get("/me", (req, res) => {
  if (!req.session.staffId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json({ id: req.session.staffId, email: req.session.staffEmail, role: req.session.staffRole });
});
