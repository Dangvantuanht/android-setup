import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    staffId?: string;
    staffEmail?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.staffId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  next();
}
