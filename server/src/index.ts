import "express-async-errors";
import express from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { provisioningRouter } from "./routes/provisioning.routes.js";
import { startExpiryWorker } from "./services/expiry.worker.js";

fs.mkdirSync(config.dataDir, { recursive: true });

const SQLiteStore = connectSqlite3(session);

const app = express();
// Behind Caddy: TLS terminates at the proxy, so Node only ever sees plain
// HTTP on the internal hop. Without this, req.secure is always false, and
// express-session silently refuses to set cookie.secure=true cookies at all
// (no Set-Cookie header, not even an insecure one) once NODE_ENV=production.
app.set("trust proxy", 1);
app.use(express.json());
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`[req] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
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
app.use("/api/users", usersRouter);

const webDist = path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

// Last resort: a single bad request (DB hiccup, bad input, etc.) must never
// take the whole process down — without this, an uncaught error in any async
// route handler crashes the server for every other in-flight user/device.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal server error" });
});

startExpiryWorker();

app.listen(config.port, () => {
  console.log(`autosetup-web server listening on :${config.port}`);
});
