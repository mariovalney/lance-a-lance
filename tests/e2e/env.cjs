// Shared paths and the little web server the Playwright scripts run against.
// Run `pnpm e2e:prepare` first to produce dist/.
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(__dirname, ".out");
const DIST = path.join(ROOT, "dist");
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Serves dist/ over http, because the app needs a real origin: a service
 * worker, localStorage per origin and fetch all refuse to work from file://.
 *
 * Resolves to the base URL. The server is unref'd, so a finished script exits
 * without closing it. Set URL to point a script at a running server instead.
 */
function serveDist() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    throw new Error(`no build at ${DIST}: run pnpm e2e:prepare first`);
  }
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      let file = path.join(DIST, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST)) return res.writeHead(403).end();
      // Anything that is not a file is a client route: hand back the app shell.
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
    server.unref();
  });
}

/** The address a script should open: a server it was pointed at, or its own. */
const siteUrl = async () => process.env.URL ?? (await serveDist());

module.exports = { ROOT, OUT, DIST, serveDist, siteUrl };
