import express from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { provisioningRouter } from "./routes/provisioning.routes.js";
import { startExpiryWorker } from "./services/expiry.worker.js";

fs.mkdirSync(config.dataDir, { recursive: true });

const SQLiteStore = connectSqlite3(session);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`[req] ${req.method} ${req.path} -> ${res.statusCode}`);
  });
  next();
});

app.use(
  session({
    store: new SQLiteStore({ dir: config.dataDir, db: "sessions.sqlite" }) as unknown as session.Store,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12,
    },
  }),
);

// Public routes (APK download + device callback) — no auth.
app.use("/", provisioningRouter);

app.use("/api/auth", authRouter);
app.use("/api/sessions", sessionsRouter);

const webDist = path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

startExpiryWorker();

app.listen(config.port, () => {
  console.log(`autosetup-web server listening on :${config.port}`);
});
