import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import {
  completeSessionFromCallback,
  recordHeartbeat,
  getSessionByToken,
} from "../services/session.service.js";

export const provisioningRouter = Router();

const apkAbsolutePath = path.resolve(process.cwd(), config.dpc.apkPath);

// Public: fetched by the device during Setup Wizard via PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION.
// Token-gated (see qr.service.ts): once a session has already enrolled (or
// expired/been revoked), a second device scanning the same printed/saved QR
// can no longer download the APK at all — closing the gap where a stale QR
// could still fully provision a second device even though its callback
// would eventually be rejected.
provisioningRouter.get("/download/dpc.apk", async (req, res) => {
  if (!fs.existsSync(apkAbsolutePath)) {
    res.status(500).json({ error: "release apk not configured" });
    return;
  }

  const token = req.query.token;
  if (typeof token === "string") {
    const session = await getSessionByToken(token);
    if (!session || session.status !== "PENDING" || session.expiresAt.getTime() < Date.now()) {
      res.status(403).json({ error: "session no longer valid for download" });
      return;
    }
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.sendFile(apkAbsolutePath);
});

// Public but token-gated: called by the DPC app itself (CallbackClient.kt) after
// ADMIN_POLICY_COMPLIANCE confirms Device Owner. Always 200 so the device never
// retries/treats this as a provisioning failure.
provisioningRouter.post("/api/provisioning/callback", async (req, res) => {
  const { token, model, androidRelease } = req.body ?? {};
  if (typeof token !== "string") {
    res.status(200).json({ ok: false });
    return;
  }
  const result = await completeSessionFromCallback(token, model, androidRelease);
  res.status(200).json({ ok: result.accepted });
});

// Public but token-gated: periodic check-in from the DPC app's heartbeat alarm
// (see dpc-app HeartbeatAlarmReceiver.kt). Always 200, never blocks the device.
provisioningRouter.post("/api/provisioning/heartbeat", async (req, res) => {
  const { token, batteryLevel, model } = req.body ?? {};
  if (typeof token !== "string") {
    res.status(200).json({ ok: false });
    return;
  }
  const level = typeof batteryLevel === "number" ? Math.round(batteryLevel) : undefined;
  const result = await recordHeartbeat(token, level, typeof model === "string" ? model : undefined);
  res.status(200).json({ ok: result.accepted });
});
