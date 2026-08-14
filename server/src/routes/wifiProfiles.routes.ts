import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { listWifiProfiles, createWifiProfile, deleteWifiProfile } from "../services/wifiProfile.service.js";

export const wifiProfilesRouter = Router();
wifiProfilesRouter.use(requireAuth);

wifiProfilesRouter.get("/", async (_req, res) => {
  res.json(await listWifiProfiles());
});

wifiProfilesRouter.post("/", async (req, res) => {
  const { label, ssid, password, securityType } = req.body ?? {};
  if (typeof label !== "string" || !label.trim() || typeof ssid !== "string" || !ssid.trim()) {
    res.status(400).json({ error: "label and ssid required" });
    return;
  }
  const profile = await createWifiProfile({
    label: label.trim(),
    ssid: ssid.trim(),
    password: typeof password === "string" ? password : undefined,
    securityType: typeof securityType === "string" ? securityType : undefined,
  });
  res.status(201).json(profile);
});

wifiProfilesRouter.delete("/:id", async (req, res) => {
  await deleteWifiProfile(req.params.id);
  res.status(204).end();
});
