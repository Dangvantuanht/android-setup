import { expireStaleSessions } from "./session.service.js";

const SWEEP_INTERVAL_MS = 30_000;

export function startExpiryWorker(): NodeJS.Timeout {
  return setInterval(() => {
    expireStaleSessions().catch((err) => {
      console.error("[expiry.worker] sweep failed", err);
    });
  }, SWEEP_INTERVAL_MS);
}
