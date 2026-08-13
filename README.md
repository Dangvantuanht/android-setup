# Autosetup Web

Web app for QR-based Android Enterprise device provisioning (Device Owner
enrollment), replacing the old `AutoSetupDPC` / `android_tool` desktop tool.
Staff create a session in the dashboard, scan the resulting QR during Android
Setup Wizard after factory reset, and the device enrolls itself — no ADB/USB
required, any number of devices in parallel.

See `/Users/dangvantuan/.claude/plans/rosy-sprouting-gem.md` for the full
design writeup (data model, API surface, lifecycle, rationale).

## Layout

- `server/` — Node.js/TypeScript/Express/Prisma backend: session management,
  QR generation, APK hosting, device callback endpoint, staff auth.
- `web/` — React (Vite) staff dashboard.
- `dpc-app/` — Android Kotlin DPC app (copied + adapted from
  `Downloads/android_tool/AutoSetupDPC` v2; see `dpc-app/README.md`).
- `releases/` — fixed, signed release APK(s) served to devices + `checksums.json`.
- `deploy/` — Caddyfile + systemd unit for the VPS.

## Local dev

```sh
# 1. Backend
cd server
npm install
cp .env.example .env        # fill in SESSION_SECRET, PUBLIC_BASE_URL, DPC_* vars
npx prisma migrate dev
npx tsx prisma/seed.ts you@shop.local yourpassword
npm run dev                 # http://localhost:3000

# 2. Frontend (separate terminal)
cd web
npm install
npm run dev                 # http://localhost:5173, proxies /api + /download to :3000
```

For a production-shaped local run: `cd web && npm run build`, then
`cd server && npm run build && npm start` — Express serves the built
dashboard directly from `web/dist`.

## DPC APK

The dashboard needs a signed release APK + its checksum configured before QR
codes are usable — see `dpc-app/README.md` for the build/sign/checksum steps.

## Deploy

See `deploy/Caddyfile` and `deploy/autosetup-web.service`. Summary: one VPS,
systemd runs the Node process on `127.0.0.1:3000`, Caddy reverse-proxies the
public domain with automatic HTTPS, SQLite file lives under `server/data/`.
