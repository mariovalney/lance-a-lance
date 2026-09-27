// Shared setup for the Playwright scripts. Every script drives a running
// server (the database is the only place progress lives), so start one first:
//
//   DATABASE_URL=... COOKIE_SECURE=false PORT=3111 pnpm start
//
// and point the scripts at it with URL (default http://127.0.0.1:3111).
const fs = require("node:fs");
const path = require("node:path");
const { ensureAdmin } = require("./accounts.cjs");

const ROOT = path.join(__dirname, "../..");
const OUT = path.join(__dirname, ".out");
const DIST = path.join(ROOT, "dist");
fs.mkdirSync(OUT, { recursive: true });

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

/** The server to drive; fails early with the command to start one. */
async function siteUrl() {
  const base = process.env.URL ?? "http://127.0.0.1:3111";
  const health = await fetch(`${base}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`no server at ${base}: start one (DATABASE_URL=... COOKIE_SECURE=false PORT=3111 pnpm start) or set URL`);
  return base;
}

/**
 * A phone-sized browser context signed in as the test account, with its
 * progress wiped, so every script starts from nothing. `ctx.request` shares the
 * session with the pages, and is what the seeding helpers below use.
 */
async function signedIn(browser, options = {}) {
  const base = await siteUrl();
  const ctx = await browser.newContext({ ...PHONE, ...options });
  await ensureAdmin(ctx.request, base);
  const reset = await ctx.request.post(`${base}/api/progress/reset`);
  if (!reset.ok()) throw new Error(`could not reset the test account: ${reset.status()}`);
  return { base, ctx };
}

async function postOk(request, url, data) {
  const response = await request.post(url, { data });
  if (!response.ok()) throw new Error(`POST ${url} -> ${response.status()} ${await response.text()}`);
  return response.json();
}

/** Marks lessons done the way playing them does: a perfect run each. */
async function completeLessons(request, base, ids) {
  for (const lessonId of ids) await postOk(request, `${base}/api/lessons/runs`, { lessonId, points: 100, maxPoints: 100, mistakes: [], records: [] });
}

/** The trainer's puzzle ids, from its data file. */
function puzzleIds(n) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "src/content/data/trainer.json"), "utf8"));
  return data.puzzles.slice(0, n).map((p) => p.i);
}

/** Rated puzzle attempts, through the same endpoint the trainer uses. */
async function attemptPuzzles(request, base, attempts) {
  for (const { id, status } of attempts) await postOk(request, `${base}/api/puzzles/attempts`, { puzzleId: id, status });
}

module.exports = { ROOT, OUT, DIST, PHONE, siteUrl, signedIn, postOk, completeLessons, puzzleIds, attemptPuzzles };
