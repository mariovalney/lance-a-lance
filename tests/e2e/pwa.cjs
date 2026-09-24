// Checks the PWA build the way a phone sees it: local fonts with no network,
// a valid manifest, the icons, the service worker, and the app still working
// after the network is cut.
//
//   pnpm e2e:prepare && pnpm e2e:pwa
//
// Serves dist/ itself, so it needs no running server. Set URL to point it at
// one instead (for example the Docker image).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { DIST, OUT, serveDist } = require("./env.cjs");

(async () => {
  if (!fs.existsSync(path.join(DIST, "sw.js"))) throw new Error("dist/sw.js missing: run pnpm e2e:prepare first");

  const base = process.env.URL ?? (await serveDist());
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const problems = [];
  // Two kinds of noise are expected and not failures: the API answering 401
  // because nobody is signed in, and every request failing once the network is
  // cut on purpose below.
  let offline = false;
  // Chromium leaves the URL out of the console message for a failed fetch, so
  // the 401 is matched by its status: the only one the app can produce is
  // /api/auth/me answering that nobody is signed in.
  const noise = (text) => offline || /\/api\//.test(text) || /401 \(Unauthorized\)/.test(text);
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && !noise(m.text()) && problems.push("console: " + m.text()));
  page.on("requestfailed", (r) => !noise(r.url()) && problems.push("requestfailed: " + r.url()));
  // Nothing may be fetched from outside the app's own origin.
  const foreign = [];
  page.on("request", (r) => !r.url().startsWith(base) && !r.url().startsWith("data:") && foreign.push(r.url()));

  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  console.log("title:", await page.title());
  console.log("offsite requests:", foreign.length ? foreign.join(" ; ") : "none");

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => f.family);
  });
  console.log("fonts loaded:", [...new Set(fonts)].join(", ") || "(none)");

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href");
    if (!href) return null;
    return { href, ...(await (await fetch(href)).json()) };
  });
  if (!manifest) problems.push("no manifest link");
  else {
    console.log(`manifest: ${manifest.href} | ${manifest.name} | ${manifest.display} | start_url ${manifest.start_url}`);
    console.log("icons:", manifest.icons.map((i) => `${i.src} ${i.sizes}${i.purpose ? " " + i.purpose : ""}`).join(", "));
    for (const icon of manifest.icons) {
      const r = await page.request.get(new URL(icon.src, base + "/").href);
      if (!r.ok()) problems.push(`icon ${icon.src} -> ${r.status()}`);
    }
    for (const need of ["name", "short_name", "start_url", "display", "icons", "background_color", "theme_color"]) {
      if (manifest[need] === undefined) problems.push(`manifest missing ${need}`);
    }
    if (!manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")) problems.push("no maskable 512 icon");
  }

  const apple = await page.request.get(base + "/apple-touch-icon.png");
  console.log("apple-touch-icon:", apple.status());
  if (!apple.ok()) problems.push("apple-touch-icon missing");

  // The service worker has to take control and then serve the app offline.
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return reg ? { scope: reg.scope, active: Boolean(reg.active) } : null;
  });
  console.log("service worker:", sw ? `${sw.scope} active=${sw.active}` : "NOT REGISTERED");
  if (!sw?.active) problems.push("service worker did not activate");

  await page.screenshot({ path: OUT + "/pwa-home.png" });

  offline = true;
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1200);
  const offlineText = (await page.locator("body").textContent()).replace(/\s+/g, " ").trim();
  console.log("offline reload:", offlineText.slice(0, 70) || "(blank page)");
  if (offlineText.length < 40) problems.push("app did not render offline");
  await page.screenshot({ path: OUT + "/pwa-offline.png" });
  await ctx.setOffline(false);

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
