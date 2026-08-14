import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

declare module "express-session" {
  interface SessionData {
    staffId?: string;
    staffEmail?: string;
    staffRole?: string;
  }
}

// Throttle: only touch the DB once per window per user, not on every request.
const LAST_SEEN_THROTTLE_MS = 60_000;
const lastSeenCache = new Map<string, number>();

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.staffId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const staffId = req.session.staffId;
  const now = Date.now();
  const lastTouched = lastSeenCache.get(staffId) ?? 0;
  if (now - lastTouched > LAST_SEEN_THROTTLE_MS) {
    lastSeenCache.set(staffId, now);
    prisma.staffUser.update({ where: { id: staffId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.staffId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (req.session.staffRole !== "admin") {
    res.status(403).json({ error: "admin only" });
    return;
  }
  next();
}
