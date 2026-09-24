// Drives the account and backup flows against a running server.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:account
//
// Needs a server that still accepts signups: a database with no users yet, or
// SIGNUP_ENABLED=true. The app is behind the sign in screen, so every browser
// here starts by getting in. Seeds progress in one browser, signs up, checks
// the progress reached the API, signs in from a second browser and checks it
// came back, then exports the backup and imports it into a second account.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { OUT } = require("./env.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3111";
const STAMP = Date.now();
const EMAIL = process.env.EMAIL ?? `teste-${STAMP}@exemplo.com`;
const OTHER = `teste-${STAMP}-b@exemplo.com`;
const PASSWORD = "a-good-password";
const XP = 240;

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true };

/** Stands in for having played lessons and solved puzzles. */
function seed(xp) {
  const state = {
    version: 1,
    xp,
    lessons: { "m1-l1": { bestStars: 3, bestPct: 96, completions: 1 }, "m1-l2": { bestStars: 2, bestPct: 80, completions: 1 } },
    streak: { current: 0, best: 0, lastDay: null },
    history: [],
    records: { "coords-30s": 21 },
    puzzles: { rating: 861, played: 3, solved: 2, streak: 1, bestStreak: 2, recent: ["aaa"] },
    updatedAt: Date.now(),
  };
  localStorage.setItem("lance-a-lance:progress:v1", JSON.stringify(state));
  localStorage.setItem(
    "lance-a-lance:puzzlelog:v1:0",
    JSON.stringify([
      { i: "aaa", s: "ok", d: 20, r: 820, p: 800, t: Date.now() - 3000 },
      { i: "bbb", s: "erro", d: -9, r: 811, p: 900, t: Date.now() - 2000 },
      { i: "ccc", s: "ok", d: 50, r: 861, p: 1000, t: Date.now() - 1000 },
    ]),
  );
}

async function open(browser, { withProgress = false } = {}) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  if (withProgress) {
    await page.evaluate(seed, XP);
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
  check(await first.getByText("Entre para o seu progresso").isVisible(), "with no account, the first screen asks to sign in");
  check((await first.locator("header").count()) === 0, "with no account, the app is not behind the sign in screen");
  await first.screenshot({ path: OUT + "/signin.png" });

  await getIn(first, EMAIL, { create: true });
  check((await xpOnScreen(first)) === XP, `the account adopted this browser's progress (${await xpOnScreen(first)} XP)`);
  await first.screenshot({ path: OUT + "/account-signed-in.png" });

  // The local copy is newer than the empty account, so it gets pushed up.
  const stored = await (await first.request.get(BASE + "/api/progress")).json();
  check(stored.state?.xp === XP, `the server took the local progress (${stored.state?.xp} XP)`);
  check(stored.state?.records?.["coords-30s"] === 21, "the records went up with it");

  await openSettings(first);
  check(await first.getByText(EMAIL).isVisible(), "the settings show the account that is in");
  await first.screenshot({ path: OUT + "/settings-signed-in.png" });
  await closeSettings(first);

  /* ---------- second browser: clean, signs in ---------- */
  const second = await open(browser);
  await getIn(second, EMAIL);
  check((await xpOnScreen(second)) === XP, `the fresh browser got the account progress (${await xpOnScreen(second)} XP)`);

  // And the puzzle history came with it.
  const log = await (await second.request.get(BASE + "/api/puzzlelog/0")).json();
  check(Array.isArray(log.entries) && log.entries.filter(Boolean).length === 3, `the puzzle history went up too (${log.entries?.filter(Boolean).length})`);

  /* ---------- export ---------- */
  await openSettings(first);
  const [download] = await Promise.all([first.waitForEvent("download"), first.getByRole("button", { name: "Exportar" }).click()]);
  const file = path.join(OUT, "backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  check(backup.app === "lance-a-lance" && backup.kind === "backup", "the exported file carries the app marker");
  check(backup.progress?.xp === XP, `the exported file carries the XP (${backup.progress?.xp})`);
  check(backup.puzzleLog?.["0"]?.filter(Boolean).length === 3, "the exported file carries the puzzle history");

  /* ---------- signing out goes back to the sign in screen, and empties it --- */
  await first.getByRole("button", { name: "Sair" }).click();
  await first.waitForTimeout(1500);
  check(await first.getByText("Entre para o seu progresso").isVisible(), "signing out lands back on the sign in screen");
  const leftBehind = await first.evaluate(() => localStorage.getItem("lance-a-lance:progress:v1"));
  check(leftBehind === null, "signing out takes this browser's copy with it");

  /* ---------- another account on the same browser starts from its own ------- */
  // The session is gone but the copy is not, which is what a closed tab or a
  // cleared cookie looks like. It belongs to the account that made it.
  await second.context().clearCookies();
  await second.reload({ waitUntil: "networkidle" });
  await second.waitForTimeout(900);
  check((await second.evaluate(() => localStorage.getItem("lance-a-lance:progress:v1"))) !== null, "the copy survives a lost session");
  await getIn(second, OTHER, { create: true });
  check((await xpOnScreen(second)) === 0, "another account on the same browser does not inherit the progress");
  const untouched = await (await second.request.get(BASE + "/api/progress")).json();
  check((untouched.state?.xp ?? 0) === 0, `and nothing was pushed into it (${untouched.state?.xp ?? 0} XP)`);

  /* ---------- import into that second, empty account ---------- */
  const third = await open(browser);
  await getIn(third, OTHER);
  check((await xpOnScreen(third)) === 0, "a fresh account starts empty");
  await openSettings(third);
  await third.locator('input[type="file"]').setInputFiles(file);
  await third.waitForTimeout(1500);
  check(await third.getByText(/^Importado:/).isVisible(), "confirms the import");
  await closeSettings(third);
  check((await xpOnScreen(third)) === XP, `the imported progress showed up (${await xpOnScreen(third)} XP)`);

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
