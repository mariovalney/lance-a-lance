// Drives the account and backup flows against a running server.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:account
//
// Bootstraps the admin: signs up when the database is empty, signs in as that
// account when it is not. The app is behind the sign in screen, so every browser
// here starts by getting in, and the browser keeps no copy of the progress at
// all. Signs in with a copy an older version left in the browser and checks it
// is ignored and cleared, restores an old (version 1) backup through the API
// and checks every part of it arrived, signs in from a second browser, then
// exports the backup (version 2) and imports it into a second account.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { OUT } = require("./env.cjs");
const { ADMIN_EMAIL, addUser, givePassword } = require("./accounts.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3111";
const SINK = process.env.SINK ?? "";
const STAMP = Date.now();
// The first account claims the deploy and is the admin. Every other account is
// created by it, by address, which is why the second one needs the mail sink:
// a liberated address only gets a password through the link.
const EMAIL = process.env.EMAIL ?? ADMIN_EMAIL;
const OTHER = `teste-${STAMP}-b@exemplo.com`;
const PASSWORD = "a-good-password";
const XP = 240;
// What a browser that played before there were accounts still holds. It is not
// the account's, so it must never show up and never go up.
const STALE = 77;

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true };

/** An old (version 1) progress document: what the app kept before the tables. */
function progressFor(xp) {
  return {
    version: 1,
    xp,
    lessons: { "m1-l1": { bestStars: 3, bestPct: 96, completions: 1 }, "m1-l2": { bestStars: 2, bestPct: 80, completions: 1 } },
    streak: { current: 0, best: 0, lastDay: null },
    history: [],
    records: { "coords-30s": 21 },
    puzzles: { rating: 861, played: 3, solved: 2, streak: 1, bestStreak: 2, recent: ["aaa"] },
    // Totals with no games behind them, as the first games version kept them.
    games: { rating: 900, played: 3, wins: 1, draws: 1, losses: 1 },
    updatedAt: Date.now(),
  };
}

const PUZZLE_LOG = [
  { i: "aaa", s: "ok", d: 20, r: 820, p: 800, t: Date.now() - 3000 },
  { i: "bbb", s: "erro", d: -9, r: 811, p: 900, t: Date.now() - 2000 },
  { i: "ccc", s: "ok", d: 50, r: 861, p: 1000, t: Date.now() - 1000 },
];

/** Writes an old copy straight into the browser, the way older versions did. */
function seedBrowser(state) {
  localStorage.setItem("lance-a-lance:progress:v1", JSON.stringify(state));
}

/** Fills the account by restoring an old backup file, which the server converts to rows. */
async function seedAccount(page, state) {
  const response = await page.request.post(BASE + "/api/backup", {
    data: { app: "lance-a-lance", kind: "backup", version: 1, exportedAt: new Date().toISOString(), progress: state, puzzleLog: { 0: PUZZLE_LOG } },
  });
  if (!response.ok()) throw new Error(`restoring the old backup failed: ${response.status()} ${await response.text()}`);
  return (await response.json()).progress;
}

const browserCopy = (page) => page.evaluate(() => localStorage.getItem("lance-a-lance:progress:v1"));

async function open(browser, { withProgress = false } = {}) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  if (withProgress) {
    await page.evaluate(seedBrowser, progressFor(STALE));
    await page.reload({ waitUntil: "networkidle" });
  }
  await page.waitForTimeout(900);
  return page;
}

/** The sign in screen is the whole app until somebody is in. */
async function getIn(page, email, { create = false } = {}) {
  if (create) await page.getByRole("button", { name: "Ainda não tenho conta" }).click();
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: create ? "Criar conta" : "Entrar", exact: true }).click();
  await page.waitForTimeout(2000);
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.waitForTimeout(400);
}

async function closeSettings(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

async function xpOnScreen(page) {
  const text = await page.locator("header").first().textContent();
  return Number(/(\d+)\s*XP/.exec(text)?.[1] ?? -1);
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- first browser: has progress, creates the account ---------- */
  const first = await open(browser, { withProgress: true });
  check(await first.getByText("Seu progresso fica na sua conta").isVisible(), "with no account, the first screen asks to sign in");
  check((await first.locator("header").count()) === 0, "with no account, the app is not behind the sign in screen");
  await first.screenshot({ path: OUT + "/signin.png" });

  // On a fresh database this is the first account, so it signs up and becomes
  // the admin. On a database that already has it, it just signs in.
  const claiming = await first.getByRole("button", { name: "Ainda não tenho conta" }).count();
  await getIn(first, EMAIL, { create: claiming > 0 });
  // Not "is zero": on a database this script has run against before, the
  // account legitimately has progress of its own. What matters is that the
  // browser's copy is not it, and never goes up.
  check((await xpOnScreen(first)) !== STALE, `the account ignores the copy sitting in the browser (${await xpOnScreen(first)} XP)`);
  const empty = (await (await first.request.get(BASE + "/api/progress")).json()).progress;
  check(empty.xp !== STALE, `and nothing from it went up (${empty.xp} XP)`);
  check((await browserCopy(first)) === null, "and the old copy is cleared from the browser");

  /* ---------- an old backup restores into rows ---------- */
  const restored = await seedAccount(first, progressFor(XP));
  check(restored.xp === XP, `the old backup's XP arrived (${restored.xp})`);
  check(restored.lessons["m1-l1"]?.bestStars === 3 && restored.lessons["m1-l2"]?.bestPct === 80, "its lessons arrived");
  check(restored.records["coords-30s"] === 21, "its drill record arrived");
  check(restored.puzzles.rating === 861 && restored.puzzles.played === 3 && restored.puzzles.solved === 2, "its puzzle rating and counts arrived");
  check(restored.games.played === 0 && restored.games.rating === 800, `its game totals, with no games behind them, start over (${restored.games.played}, ${restored.games.rating})`);
  const attempts = await (await first.request.get(BASE + "/api/puzzles/attempts?page=0&size=10")).json();
  check(attempts.total === 3 && attempts.items[0].puzzleId === "ccc", `its puzzle history arrived, newest first (${attempts.total})`);
  await first.reload({ waitUntil: "networkidle" });
  await first.waitForTimeout(1200);
  check((await xpOnScreen(first)) === XP, `the account progress is what shows (${await xpOnScreen(first)} XP)`);
  check((await browserCopy(first)) === null, "and the browser was not written to");
  await first.screenshot({ path: OUT + "/account-signed-in.png" });

  await openSettings(first);
  check(await first.getByText(EMAIL).isVisible(), "the settings show the account that is in");
  await first.screenshot({ path: OUT + "/settings-signed-in.png" });
  await closeSettings(first);

  /* ---------- second browser: clean, signs in ---------- */
  const second = await open(browser);
  await getIn(second, EMAIL);
  check((await xpOnScreen(second)) === XP, `the fresh browser got the account progress (${await xpOnScreen(second)} XP)`);
  check((await browserCopy(second)) === null, "and kept no copy of it");

  /* ---------- export ---------- */
  await openSettings(first);
  const [download] = await Promise.all([first.waitForEvent("download"), first.getByRole("button", { name: "Exportar" }).click()]);
  const file = path.join(OUT, "backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  check(backup.app === "lance-a-lance" && backup.kind === "backup" && backup.version === 2, "the exported file is a version 2 backup");
  check(backup.data?.stats?.xp === XP, `the exported file carries the XP (${backup.data?.stats?.xp})`);
  check(backup.data?.puzzleAttempts?.length === 3, "the exported file carries the puzzle history");
  check(backup.data?.lessons?.length === 2, "the exported file carries the lessons");

  /* ---------- a finished game of this account, for the access check ---------- */
  // Played through the API: two moves and a resignation. A game left open by
  // an earlier run is resigned first, since only one can be open.
  const today = new Date().toISOString().slice(0, 10);
  const unfinished = (await (await first.request.get(BASE + "/api/progress")).json()).progress.games.current;
  if (unfinished) await first.request.post(`${BASE}/api/games/${unfinished.id}/finish`, { data: { moves: unfinished.moves, resigned: true, day: today } });
  const started = await (await first.request.post(BASE + "/api/games", { data: { level: 400, player: "w", assisted: false } })).json();
  const gameId = started.game?.id;
  await first.request.post(`${BASE}/api/games/${gameId}/finish`, { data: { moves: ["e2e4", "e7e5"], resigned: true, day: today } });
  const own = await first.request.get(`${BASE}/api/games/${gameId}`);
  check(own.ok() && (await own.json()).game?.id === gameId, "the owner gets the game at its address");

  /* ---------- signing out goes back to the sign in screen, and empties it --- */
  await first.getByRole("button", { name: "Sair" }).click();
  await first.waitForTimeout(1500);
  check(await first.getByText("Seu progresso fica na sua conta").isVisible(), "signing out lands back on the sign in screen");
  check((await browserCopy(first)) === null, "signing out clears even the old copy the browser held");

  /* ---------- a second account, created by the admin ---------- */
  // Signing up is closed, so this is the real path: the admin liberates the
  // address and the person gives it a password through the link.
  let third = null;
  if (SINK) {
    await addUser(second.request, BASE, OTHER);

    // The session goes, the browser stays, which is what a closed tab or a
    // cleared cookie looks like. The address then gets a password the way its
    // owner would, through the link.
    await second.context().clearCookies();
    await givePassword(second, BASE, SINK, OTHER, PASSWORD);
    await second.goto(BASE + "/", { waitUntil: "networkidle" });
    await second.waitForTimeout(900);
    await getIn(second, OTHER);
    check((await xpOnScreen(second)) === 0, "another account on the same browser starts empty");
    const untouched = (await (await second.request.get(BASE + "/api/progress")).json()).progress;
    check(untouched.xp === 0, `and nothing was pushed into it (${untouched.xp} XP)`);

    /* ---------- somebody else's game is not there ---------- */
    const theirs = await second.request.get(`${BASE}/api/games/${gameId}`);
    check(theirs.status() === 404, `another account gets 404 for that game (${theirs.status()})`);
    const analysis = [0, 1, 2].map(() => ({ cp: 0, best: null }));
    const written = await second.request.put(`${BASE}/api/games/${gameId}/analysis`, { data: { analysis } });
    check(written.status() === 404, `and cannot write its analysis (${written.status()})`);
    await second.goto(`${BASE}/partidas/${gameId}`, { waitUntil: "networkidle" });
    await second.getByText("Partida não encontrada.").waitFor({ timeout: 10_000 }).catch(() => undefined);
    check(await second.getByText("Partida não encontrada.").isVisible(), "and its address says it was not found");
    await second.goto(BASE + "/", { waitUntil: "networkidle" });

    /* ---------- import into that second, empty account ---------- */
    third = await open(browser);
    await getIn(third, OTHER);
    check((await xpOnScreen(third)) === 0, "a fresh account starts empty");
    await openSettings(third);
    await third.locator('input[type="file"]').setInputFiles(file);
    await third.waitForTimeout(1500);
    check(await third.getByText("Progresso importado.").isVisible(), "confirms the import");
    await closeSettings(third);
    check((await xpOnScreen(third)) === XP, `the imported progress showed up (${await xpOnScreen(third)} XP)`);
  } else {
    console.log("skip  the second account and the import: set SINK to check them");
  }

  /* ---------- with the server out of reach there is nothing to show -------- */
  // Progress is the account's, so the app says so instead of opening empty.
  if (!third) {
    third = await open(browser);
    await getIn(third, EMAIL);
  }
  await third.route("**/api/**", (route) => route.abort());
  await third.reload({ waitUntil: "domcontentloaded" });
  await third.waitForTimeout(1500);
  check(await third.getByText("Sem conexão").isVisible(), "an unreachable server shows the offline screen");
  check((await third.locator("header").count()) === 0, "and never the course without the progress");
  await third.screenshot({ path: OUT + "/account-offline.png" });
  await third.unroute("**/api/**");
  await third.reload({ waitUntil: "networkidle" });
  await third.waitForTimeout(1200);
  check((await xpOnScreen(third)) > 0, "and comes back when the server does");

  /* ---------- a wrong password is refused ---------- */
  const fourth = await open(browser);
  await fourth.getByPlaceholder("E-mail").fill(EMAIL);
  await fourth.getByPlaceholder("Senha").fill("wrong-password");
  await fourth.getByRole("button", { name: "Entrar", exact: true }).click();
  await fourth.waitForTimeout(1500);
  check(await fourth.getByText("E-mail ou senha não conferem.").isVisible(), "refuses a wrong password with a readable message");
  await fourth.screenshot({ path: OUT + "/account-wrong-password.png" });

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
