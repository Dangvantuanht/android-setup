import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import {
  completeSessionFromCallback,
  recordHeartbeat,
  getSessionByToken,
  markApkDownloaded,
} from "../services/session.service.js";
import { claimGmailAccount, reportGmailOutcome, type Claimant } from "../services/gmailAccount.service.js";
import {
  getClaimCodeByCode,
  markClaimCodeClaimed,
} from "../services/manualClaimCode.service.js";
import { listTargetApps } from "../services/targetApp.service.js";

export const provisioningRouter = Router();

type ClaimantResult =
  | { ok: true; claimant: Claimant; ownerStaffId: string | null }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "invalid" };

/**
 * The helper app identifies itself either via a DPC-issued enrollment token
 * (QR/Device-Owner flow, requires the session to have actually finished
 * ENROLLED) or a short manual claim code typed by staff (for devices
 * activated by hand, requires the code to still be PENDING and unexpired).
 * Claiming via code also marks it CLAIMED so it can't be reused.
 *
 * Returns a discriminated reason (not just null) so the device can tell the
 * difference between "typo/unknown code" and "this code timed out — go get a
 * fresh one" instead of a single generic failure message.
 */
async function resolveClaimant(
  token: unknown,
  code: unknown,
): Promise<ClaimantResult> {
  if (typeof token === "string") {
    const session = await getSessionByToken(token);
    if (!session || session.status !== "ENROLLED") return { ok: false, reason: "invalid" };
    return { ok: true, claimant: { sessionId: session.id }, ownerStaffId: session.createdByStaffId };
  }
  if (typeof code === "string") {
    const claimCode = await getClaimCodeByCode(code);
    if (!claimCode) return { ok: false, reason: "not_found" };
    if (claimCode.status === "PENDING" && claimCode.expiresAt.getTime() >= Date.now()) {
      await markClaimCodeClaimed(claimCode.id);
      return { ok: true, claimant: { claimCodeId: claimCode.id }, ownerStaffId: claimCode.createdByStaffId };
    }
    // Already claimed once — still usable indefinitely (idempotent retries
    // by the same device shouldn't get punished for taking a while).
    if (claimCode.status === "CLAIMED") {
      return { ok: true, claimant: { claimCodeId: claimCode.id }, ownerStaffId: claimCode.createdByStaffId };
    }
    if (claimCode.status === "REVOKED") return { ok: false, reason: "revoked" };
    // PENDING-but-past-expiresAt, or already flipped to EXPIRED by the
    // background worker — either way, staff need to issue a new code.
    return { ok: false, reason: "expired" };
  }
  return { ok: false, reason: "invalid" };
}

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
    await markApkDownloaded(token);
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.sendFile(apkAbsolutePath);
});

// Public, no identity gating — the DPC's HelperAppAlarmReceiver fetches this
// directly (it doesn't have a staff session, just the URL baked into the QR
// admin extras at generation time). Not session-scoped like dpc.apk since the
// helper app isn't tied to a single enrollment session.
if (config.helperApp.apkPath) {
  const helperApkAbsolutePath = path.resolve(process.cwd(), config.helperApp.apkPath);
  provisioningRouter.get("/download/helper.apk", async (_req, res) => {
    if (!fs.existsSync(helperApkAbsolutePath)) {
      res.status(500).json({ error: "helper apk not configured" });
      return;
    }
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.sendFile(helperApkAbsolutePath);
  });
}

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

// Public but identity-gated (DPC token or manual claim code — see
// resolveClaimant): called by the helper app once it's running on a device
// that has actually finished activating, to get one unused company Gmail
// account.
provisioningRouter.post("/api/provisioning/gmail-claim", async (req, res) => {
  const { token, code } = req.body ?? {};
  const result = await resolveClaimant(token, code);
  if (!result.ok) {
    res.status(403).json({ error: result.reason });
    return;
  }
  const account = await claimGmailAccount(result.claimant, result.ownerStaffId);
  if (!account) {
    res.status(409).json({ error: "no gmail accounts available" });
    return;
  }
  res.status(200).json(account);
});

// Public but identity-gated: the helper app reports back whether it actually
// managed to sign in with the account it was handed, so staff can see
// failures on the dashboard instead of accounts sitting "assigned" with an
// unknown outcome forever.
provisioningRouter.post("/api/provisioning/gmail-report", async (req, res) => {
  const { token, code, email, outcome } = req.body ?? {};
  if (typeof email !== "string" || (outcome !== "SUCCESS" && outcome !== "FAILED")) {
    res.status(400).json({ error: "email and outcome (SUCCESS|FAILED) required" });
    return;
  }
  const result = await resolveClaimant(token, code);
  if (!result.ok) {
    res.status(403).json({ error: result.reason });
    return;
  }
  const ok = await reportGmailOutcome(email, outcome, result.claimant);
  res.status(200).json({ ok });
});

// Fully public, no identity needed — just a static list of Play Store
// packages to install, editable from the dashboard (see TargetApps.tsx) so
// changing what gets installed never requires rebuilding the helper app.
provisioningRouter.get("/api/provisioning/target-apps", async (_req, res) => {
  const apps = await listTargetApps(true);
  res.json(apps.map((a) => ({ packageName: a.packageName, label: a.label })));
});
