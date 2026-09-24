import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteExpiredResets, deleteExpiredSessions } from "./auth.js";
import { migrate, pool, query, waitForDatabase } from "./db.js";
import { env } from "./env.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes, type Vars } from "./routes/auth.js";
import { progressRoutes, puzzleLogRoutes } from "./routes/progress.js";

const app = new Hono<Vars>();

// Same origin for the app and the API, so there is no CORS and the session
// cookie just works. Easypanel puts TLS in front of this.
const api = new Hono<Vars>();

api.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({ ok: true, db: true });
  } catch (error) {
    return c.json({ ok: false, db: false, error: (error as Error).message }, 503);
  }
});

api.route("/auth", authRoutes);
api.route("/admin", adminRoutes);
api.route("/progress", progressRoutes);
api.route("/puzzlelog", puzzleLogRoutes);
api.all("*", (c) => c.json({ error: "not_found" }, 404));

app.route("/api", api);

app.onError((error, c) => {
  console.error("request failed:", error);
  return c.json({ error: "server_error" }, 500);
});

/* ---------- the built PWA ---------- */

const hasBuild = existsSync(`${env.staticDir}/index.html`);
if (!hasBuild) console.warn(`No build at ${env.staticDir}: serving the API only. Run pnpm build:pwa.`);

app.use(
  "*",
  serveStatic({
    root: env.staticDir,
    // serve-static resolves against the working directory unless given an
    // absolute root through rewriteRequestPath, so keep the path as-is.
    onFound: (path, c) => {
      // Vite names built files `<name>-<hash>.<ext>`: those never change, so
      // they can be kept forever.
      if (/\/assets\/.+-[0-9a-zA-Z_-]{8,}\.[a-z0-9]+$/.test(path)) {
        c.header("cache-control", "public, max-age=31536000, immutable");
      } else if (path.endsWith("/sw.js") || path.endsWith("/registerSW.js") || path.endsWith(".webmanifest")) {
        // These decide when a new version is picked up, so never cache them.
        c.header("cache-control", "no-cache");
      } else if (path.endsWith(".html")) {
        c.header("cache-control", "no-cache");
      } else {
        c.header("cache-control", "public, max-age=3600");
      }
    },
  }),
);

/**
 * The addresses the app answers. Everything else is a typo or a probe and gets
 * a 404, rather than the app shell pretending the address exists. Keep this in
 * step with the routing in `src/App.tsx` and with `navigateFallbackAllowlist`
 * in `vite.config.ts`, which is the same list for the service worker.
 */
const CLIENT_ROUTES = ["/", "/redefinir", "/admin"];

const page = async (file: string) => {
  const { readFile } = await import("node:fs/promises");
  return readFile(`${env.staticDir}/${file}`, "utf8");
};

app.get("*", async (c) => {
  if (!hasBuild) return c.json({ error: "not_found" }, 404);
  const path = new URL(c.req.url).pathname.replace(/\/+$/, "") || "/";
  if (CLIENT_ROUTES.includes(path)) {
    return c.html(await page("index.html"), 200, { "cache-control": "no-cache" });
  }
  return c.html(await page("404.html").catch(() => "<!doctype html><title>404</title><a href=\"/\">Ir para o início</a>"), 404, {
    "cache-control": "no-cache",
  });
});

/* ---------- boot ---------- */

await waitForDatabase();
await migrate();
const sweep = async () => {
  const sessions = await deleteExpiredSessions().catch(() => 0);
  const resets = await deleteExpiredResets().catch(() => 0);
  if (sessions || resets) console.log(`removed ${sessions} expired sessions and ${resets} spent reset links`);
};
void sweep();
// Once a day is plenty for tables this size.
setInterval(() => void sweep(), 24 * 60 * 60 * 1000).unref();

const server = serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`lance-a-lance listening on ${info.address}:${info.port}`);
  console.log(`  static: ${hasBuild ? env.staticDir : "(none)"}`);
  console.log(`  signup: only the first account; after that the admin adds people at /admin`);
  console.log(`  mail:   ${env.smtp ? `${env.smtp.host}:${env.smtp.port}` : "not configured, so no password reset"}`);
  if (env.smtp && !env.appUrl) console.warn("  APP_URL is not set: reset links fall back to the request's Host header");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => void pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
